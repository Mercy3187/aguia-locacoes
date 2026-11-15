"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { auditar } from "@/lib/audit";
import { resolverKmConferencia } from "@/lib/km-conferencia";
import { aplicarKm, escreverKm, depoisDeAplicarKm, type ResultadoKm } from "@/lib/km";
import { generateToken, linkExpiryFromNow } from "@/lib/token";
import { buildKmMessage, buildWhatsAppLink, driverLink } from "@/lib/whatsapp";
import { rodarAgendamentoKm, KM_LINK_TTL_HOURS } from "@/lib/km-schedule";
import { encerrarContratoNoBanco } from "@/lib/contratos";
import type { KmRequestType } from "@/generated/prisma/client";

export type SendResult = { url?: string; message?: string; error?: string };

/**
 * Prepara o envio pelo WhatsApp de um contrato:
 * reaproveita uma solicitação em aberto ou cria uma nova, marca como ENVIADO,
 * registra quem enviou e devolve o link do WhatsApp já montado.
 */
export async function enviarKmWhatsApp(contractId: string): Promise<SendResult> {
  const user = await requireCan("operacao");

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { customer: true, vehicle: true },
  });
  if (!contract) return { error: "Contrato não encontrado." };

  if (!contract.customer.phone) {
    return { error: "O cliente não possui telefone cadastrado. Cadastre antes de enviar." };
  }

  // Reaproveita uma solicitação em aberto (pendente/enviada) ou cria uma nova.
  let request = await prisma.kmRequest.findFirst({
    where: { contractId, status: { in: ["PENDENTE", "ENVIADO"] } },
    orderBy: { createdAt: "desc" },
  });

  const token = request?.token ?? generateToken();
  const link = driverLink(token);
  const message = buildKmMessage({
    model: contract.vehicle.model,
    plate: contract.vehicle.plate,
    link,
  });
  const whatsappLink = buildWhatsAppLink(contract.customer.phone, message);
  if (!whatsappLink) {
    return { error: "O telefone do cliente é inválido para WhatsApp." };
  }

  if (!request) {
    request = await prisma.kmRequest.create({
      data: {
        contractId,
        customerId: contract.customerId,
        vehicleId: contract.vehicleId,
        token,
        requestType: "QUINZENAL",
        status: "ENVIADO",
        whatsappMessage: message,
        whatsappLink,
        sentByUserId: user.id,
        sentAt: new Date(),
        expiresAt: linkExpiryFromNow(),
      },
    });
  } else {
    await prisma.kmRequest.update({
      where: { id: request.id },
      data: {
        status: "ENVIADO",
        whatsappMessage: message,
        whatsappLink,
        sentByUserId: user.id,
        sentAt: new Date(),
        expiresAt: linkExpiryFromNow(),
      },
    });
  }

  revalidatePath("/quilometragem");
  return { url: whatsappLink, message };
}

/** Cria uma solicitação manual de KM (antes de revisão, devolução, etc.). */
export async function solicitarKmAgora(
  contractId: string,
  requestType: KmRequestType = "MANUAL"
): Promise<SendResult> {
  await requireCan("operacao");

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { customer: true, vehicle: true },
  });
  if (!contract) return { error: "Contrato não encontrado." };

  const token = generateToken();
  const link = driverLink(token);
  const message = buildKmMessage({
    model: contract.vehicle.model,
    plate: contract.vehicle.plate,
    link,
  });

  await prisma.kmRequest.create({
    data: {
      contractId,
      customerId: contract.customerId,
      vehicleId: contract.vehicleId,
      token,
      requestType,
      status: "PENDENTE",
      expiresAt: linkExpiryFromNow(KM_LINK_TTL_HOURS),
      whatsappMessage: message,
      whatsappLink: buildWhatsAppLink(contract.customer.phone, message),
    },
  });

  revalidatePath("/quilometragem");
  return { message };
}

/**
 * Roda o agendamento do ciclo de KM na hora.
 * O cron diário faz isso sozinho — este botão é para forçar agora.
 */
export async function atualizarFilaKm(): Promise<SendResult> {
  await requireCan("operacao");
  try {
    const r = await rodarAgendamentoKm();
    revalidatePath("/quilometragem");
    if (r.erros.length) return { error: `${r.erros.length} erro(s): ${r.erros[0]?.slice(0, 120)}` };
    const partes = [
      r.criados ? `${r.criados} solicitação(ões) criada(s)` : null,
      r.agendados ? `${r.agendados} contrato(s) agendado(s)` : null,
      r.expirados ? `${r.expirados} link(s) expirado(s)` : null,
    ].filter(Boolean);
    return { message: partes.length ? partes.join(", ") + "." : "Nada pendente no momento." };
  } catch (e) {
    return { error: `Falha: ${String(e).slice(0, 150)}` };
  }
}

/**
 * Confere um registro de KM e APLICA o valor no veículo.
 *
 * Este é o ponto onde a quilometragem passa a valer. O envio do motorista é só
 * uma comprovação: enquanto ninguém confere aqui, a KM do carro não muda — e
 * portanto óleo, correia e relatórios seguem com o número anterior.
 *
 * `kmCorrigida` permite arrumar o valor na hora da conferência (motorista
 * digitou 1.001.601 no lugar de 235.327, por exemplo). O que ele digitou fica
 * preservado em `informedKm`; a correção vai para `correctedKm`.
 */
export async function marcarConferido(
  recordId: string,
  kmCorrigida?: number | null
): Promise<SendResult> {
  const user = await requireCan("operacao");

  const record = await prisma.kmRecord.findUnique({
    where: { id: recordId },
    include: { vehicle: true },
  });
  if (!record) return { error: "Registro não encontrado." };

  const decisao = resolverKmConferencia({
    informedKm: record.informedKm,
    kmCorrigida,
    currentKm: record.vehicle.currentKm,
    plate: record.vehicle.plate,
    jaAplicado: record.appliedAt != null,
  });
  if (!decisao.ok) return { error: decisao.error };

  const { kmFinal, corrigiu } = decisao;
  const agora = new Date();
  const kmAnterior = record.vehicle.currentKm;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.kmRecord.update({
        where: { id: recordId },
        data: {
          validationStatus: "APROVADO",
          appliedAt: agora,
          correctedKm: corrigiu ? kmFinal : null,
          validationNotes: corrigiu
            ? [
                record.validationNotes,
                `KM corrigida na conferência: de ${record.informedKm.toLocaleString(
                  "pt-BR"
                )} para ${kmFinal.toLocaleString("pt-BR")} km.`,
              ]
                .filter(Boolean)
                .join(" ")
            : record.validationNotes,
        },
      });

      // A KM entra pelo caminho único (recalcula o óleo, nunca esquece) e na
      // mesma transação do registro: ou os dois valem, ou nenhum.
      await escreverKm(tx, record.vehicle, kmFinal);
    });
  } catch {
    return { error: "Não foi possível conferir o registro." };
  }

  if (corrigiu) {
    await auditar(user, {
      action: "km.corrigida",
      entity: "KmRecord",
      entityId: recordId,
      summary: `Corrigiu a KM do ${record.vehicle.plate} de ${record.informedKm.toLocaleString(
        "pt-BR"
      )} para ${kmFinal.toLocaleString("pt-BR")} km ao conferir`,
    });
  }

  // Trilha e atualização de todas as telas que
  // mostram essa KM — o mesmo fim de linha de qualquer alteração de KM.
  await depoisDeAplicarKm({
    veiculo: record.vehicle,
    kmAnterior,
    kmNova: kmFinal,
    origem: "conferencia",
    user,
  });

  return {};
}

/**
 * Altera a KM de um veículo direto, sem depender de um registro do motorista.
 *
 * É a saída para o dia a dia: o carro voltou da oficina, alguém passou o
 * odômetro por telefone, o motorista não respondeu o link. O número digitado
 * aqui é o mesmo que o óleo, a correia, os alertas e os relatórios enxergam —
 * não existe uma "KM do controle de KM" separada de uma "KM da troca de óleo".
 *
 * Baixar a KM não é proibido (às vezes é a correção de um lançamento errado),
 * mas volta pedindo confirmação: `confirmar` é o texto que a tela mostra antes
 * de chamar de novo com `confirmado`.
 */
export async function alterarKmManual(
  vehicleId: string,
  novaKm: number,
  confirmado = false
): Promise<ResultadoKm> {
  const user = await requireCan("operacao");

  return aplicarKm({
    vehicleId,
    novaKm,
    origem: "manual",
    user,
    confirmado,
  });
}

/**
 * Encerra um contrato que na prática já acabou.
 *
 * É o botão do aviso na tela de KM: o carro foi repassado a outro motorista,
 * ou o faturamento parou e o cliente devolveu. Sai da fila de cobrança de KM,
 * libera o carro se ele não estiver com mais ninguém, e cancela as
 * solicitações de quilometragem que ainda estavam em aberto — mandar link para
 * quem já devolveu o carro é justamente o que se quer evitar.
 *
 * Nunca acontece sozinho: encerrar contrato mexe em cobrança, então é sempre
 * o usuário quem manda.
 */
export async function encerrarContrato(contractId: string): Promise<SendResult> {
  const user = await requireCan("operacao");

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { customer: true, vehicle: true },
  });
  if (!contract) return { error: "Contrato não encontrado." };

  const r = await encerrarContratoNoBanco(contractId);
  if (!r.ok) return { error: r.error };

  await auditar(user, {
    action: "contrato.encerrado",
    entity: "Contract",
    entityId: contractId,
    summary: `Encerrou o contrato de ${contract.customer.name} (${contract.vehicle.plate}) — saiu da cobrança de KM`,
  });

  revalidatePath("/quilometragem");
  revalidatePath("/contratos");
  revalidatePath("/veiculos");
  return { message: `Contrato de ${contract.customer.name} encerrado.` };
}

/**
 * Confirma que a locação continua, mesmo com o faturamento parado.
 *
 * Vale por um ciclo de boletos (28 dias). Depois disso o aviso volta: se em um
 * mês inteiro nenhum boleto novo apareceu, a resposta antiga não diz mais nada
 * sobre a situação de hoje.
 */
export async function manterContratoAtivo(contractId: string): Promise<SendResult> {
  const user = await requireCan("operacao");

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { customer: true, vehicle: true },
  });
  if (!contract) return { error: "Contrato não encontrado." };

  await prisma.contract.update({
    where: { id: contractId },
    data: { vigenciaConfirmadaAt: new Date() },
  });

  await auditar(user, {
    action: "contrato.vigencia_confirmada",
    entity: "Contract",
    entityId: contractId,
    summary: `Confirmou que ${contract.customer.name} (${contract.vehicle.plate}) continua com o carro`,
  });

  revalidatePath("/quilometragem");
  return { message: "Contrato confirmado — volta para a cobrança normal de KM." };
}

/** Gera um novo link (novo token) para uma solicitação — ex.: quando o anterior expira. */
export async function gerarNovoLink(requestId: string): Promise<SendResult> {
  await requireCan("operacao");

  const request = await prisma.kmRequest.findUnique({
    where: { id: requestId },
    include: { vehicle: true, customer: true },
  });
  if (!request) return { error: "Solicitação não encontrada." };

  const token = generateToken();
  const link = driverLink(token);
  const message = buildKmMessage({
    model: request.vehicle.model,
    plate: request.vehicle.plate,
    link,
  });

  await prisma.kmRequest.update({
    where: { id: requestId },
    data: {
      token,
      status: "PENDENTE",
      usedAt: null,
      // Link novo também nasce com validade — nunca eterno.
      expiresAt: linkExpiryFromNow(KM_LINK_TTL_HOURS),
      sentAt: null,
      sentByUserId: null,
      whatsappMessage: message,
      whatsappLink: buildWhatsAppLink(request.customer.phone, message),
    },
  });

  revalidatePath("/quilometragem");
  return { message };
}

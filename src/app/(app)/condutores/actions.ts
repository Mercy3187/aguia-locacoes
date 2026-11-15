"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { auditar } from "@/lib/audit";

export type ActionResult = { error?: string };

/**
 * Confirma (ou desmarca) que esta pessoa está cadastrada como principal
 * condutora do carro no DETRAN/SENATRAN. É sempre uma ação MANUAL — não
 * existe API para confirmar isso automaticamente.
 *
 * `confirmado`:
 *   true  = "Sim, já cadastrei no DETRAN"
 *   false = "Não está / já removi de lá"
 */
export async function confirmarPrincipalCondutor(
  contractId: string,
  confirmado: boolean
): Promise<ActionResult> {
  const user = await requireCan("operacao");

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      id: true,
      customer: { select: { name: true } },
      vehicle: { select: { plate: true } },
      principalCondutorConfirmado: true,
    },
  });
  if (!contract) return { error: "Contrato não encontrado." };

  await prisma.contract.update({
    where: { id: contractId },
    data: {
      principalCondutorConfirmado: confirmado,
      principalCondutorRevisadoAt: new Date(),
      principalCondutorRevisadoPorId: user.id,
    },
  });

  await auditar(user, {
    action: "contrato.principal_condutor_revisado",
    entity: "Contract",
    entityId: contractId,
    summary: confirmado
      ? `Confirmou ${contract.customer.name} como principal condutor do carro ${contract.vehicle.plate}`
      : `Marcou ${contract.customer.name} como NÃO principal condutor do carro ${contract.vehicle.plate}`,
  });

  revalidatePath("/condutores");
  revalidatePath("/alertas");
  return {};
}

export type ResultadoAutomacaoCondutor =
  | {
      ok: true;
      renavam: string | null;
      condutorEncontrado: { nome: string; email: string | null; categoriaCnh: string | null };
    }
  | { ok: false; renavam?: string | null; motivo: string };

/**
 * Chamado pelo botão "Mandar solicitação" depois que a extensão do Chrome
 * termina de rodar (ok ou erro) — grava o resultado no contrato
 * (`principalCondutorAutomacaoStatus/Em/Erro`) e, se a extensão descobriu o
 * renavam do veículo, salva pra não precisar buscar de novo da próxima vez.
 */
export async function registrarResultadoAutomacaoCondutor(
  contractId: string,
  resultado: ResultadoAutomacaoCondutor
): Promise<ActionResult> {
  const user = await requireCan("operacao");

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      id: true,
      vehicleId: true,
      customer: { select: { name: true } },
      vehicle: { select: { plate: true } },
    },
  });
  if (!contract) return { error: "Contrato não encontrado." };

  if (resultado.renavam) {
    await prisma.vehicle
      .update({ where: { id: contract.vehicleId }, data: { renavam: resultado.renavam } })
      .catch(() => {});
  }

  await prisma.contract.update({
    where: { id: contractId },
    data: {
      principalCondutorAutomacaoStatus: resultado.ok ? "ENVIADO" : "ERRO",
      principalCondutorAutomacaoEm: new Date(),
      principalCondutorAutomacaoErro: resultado.ok ? null : resultado.motivo,
    },
  });

  await auditar(user, {
    action: "contrato.principal_condutor_automacao",
    entity: "Contract",
    entityId: contractId,
    summary: resultado.ok
      ? `Automação SENATRAN enviou a indicação de principal condutor (${contract.customer.name} / ${contract.vehicle.plate})`
      : `Automação SENATRAN falhou pra ${contract.customer.name} / ${contract.vehicle.plate}: ${resultado.motivo}`,
  });

  revalidatePath("/condutores");
  return {};
}

/** Preenche ou corrige a CNH de um cliente. */
export async function salvarCnhManual(
  customerId: string,
  dados: { number: string; state: string; category: string }
): Promise<ActionResult> {
  const user = await requireCan("operacao");

  try {
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        driverLicense: dados.number.trim() || null,
        driverLicenseState: dados.state.trim() || null,
        driverLicenseCategory: dados.category.trim() || null,
      },
    });
  } catch {
    return { error: "Não foi possível salvar a CNH." };
  }

  await auditar(user, {
    action: "contrato.principal_condutor_revisado",
    entity: "Customer",
    entityId: customerId,
    summary: "Preencheu a CNH do cliente",
  });

  revalidatePath("/condutores");
  return {};
}

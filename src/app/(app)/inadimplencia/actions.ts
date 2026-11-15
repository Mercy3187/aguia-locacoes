"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { syncPayments, refreshContractPaymentStatus } from "@/lib/asaas-sync";
import { receberEmDinheiro, desfazerRecebimento, cancelarCobranca } from "@/lib/asaas-write";
import { padronizarNotificacoes } from "@/lib/asaas-standardize";
import { auditar } from "@/lib/audit";
import { formatCurrency as brl } from "@/lib/utils";

export type ActionResult = { error?: string; ok?: string };

/** Puxa as cobranças do Asaas (somente leitura lá; grava o espelho aqui). */
export async function sincronizarAsaas(): Promise<ActionResult> {
  await requireCan("financeiro.escrita");
  try {
    const r = await syncPayments();
    revalidatePath("/inadimplencia");
    revalidatePath("/dashboard");
    if (r.erros.length) {
      return { error: `Sincronizado com ${r.erros.length} erro(s). ${r.erros[0]?.slice(0, 120)}` };
    }
    return { ok: `${r.gravadas} cobrança(s) atualizada(s).` };
  } catch (e) {
    return { error: `Falha ao consultar o Asaas: ${String(e).slice(0, 150)}` };
  }
}

/**
 * Deixa todos os clientes do Asaas no padrão de notificação da casa.
 * Roda sozinho todo dia pelo cron; este botão é para forçar na hora.
 */
export async function padronizarNotificacoesAsaas(): Promise<ActionResult> {
  const user = await requireCan("financeiro.escrita");
  try {
    const r = await padronizarNotificacoes();
    revalidatePath("/inadimplencia");
    if (r.ajustados > 0) {
      await auditar(user, {
        action: "asaas.notificacoes_padronizadas",
        entity: "AsaasCustomer",
        summary: `Padronizou as notificações de ${r.ajustados} cliente(s) no Asaas`,
        metadata: { mudancas: r.mudancas.slice(0, 20) },
      });
    }
    if (r.erros.length) {
      return { error: `${r.ajustados} ajustado(s), ${r.erros.length} erro(s): ${r.erros[0]?.slice(0, 100)}` };
    }
    return {
      ok:
        r.ajustados === 0
          ? `Todos os ${r.verificados} clientes já estavam no padrão.`
          : `${r.ajustados} de ${r.verificados} cliente(s) ajustado(s).`,
    };
  } catch (e) {
    return { error: `Falha: ${String(e).slice(0, 150)}` };
  }
}

/**
 * O motorista pagou por fora (dinheiro/PIX na mão).
 * Quita a cobrança no Asaas como "recebido em dinheiro" e registra a baixa
 * aqui. Quitar no Asaas faz ele parar de mandar aviso de atraso ao motorista
 * e mantém a receita correta lá.
 */
export async function marcarPago(paymentId: string): Promise<ActionResult> {
  const user = await requireCan("financeiro.escrita");

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { error: "Cobrança não encontrada." };
  if (payment.settledLocally) return { ok: "Esta cobrança já estava quitada." };

  const agora = new Date();

  // Reserva a baixa ANTES de falar com o Asaas. O `where` com
  // `settledLocally: false` é atômico: num clique duplo, só uma das duas
  // execuções encontra o registro em aberto e segue — a outra para aqui.
  const reserva = await prisma.payment.updateMany({
    where: { id: paymentId, settledLocally: false },
    data: {
      settledLocally: true,
      settledAt: agora,
      settledNote: `Recebido em dinheiro por ${user.name}`,
      paymentDate: agora,
    },
  });
  if (reserva.count === 0) {
    return { ok: "Esta cobrança já foi quitada." };
  }

  let statusAsaas: string | null = null;
  try {
    const r = await receberEmDinheiro({
      asaasId: payment.asaasId,
      value: Number(payment.value),
      date: agora,
    });
    statusAsaas = r.status ?? null;
  } catch (e) {
    // Asaas recusou: desfaz a reserva para os dois lados não divergirem.
    await prisma.payment.update({
      where: { id: paymentId },
      data: { settledLocally: false, settledAt: null, settledNote: null, paymentDate: null },
    });
    return { error: `O Asaas recusou a baixa: ${String(e).replace("Error: ", "")}` };
  }

  try {
    if (statusAsaas) {
      await prisma.payment.update({ where: { id: paymentId }, data: { status: statusAsaas } });
    }
    await refreshContractPaymentStatus();
  } catch {
    return { error: "Quitado no Asaas, mas houve erro ao gravar aqui. Clique em “Atualizar do Asaas”." };
  }

  await auditar(user, {
    action: "pagamento.baixa",
    entity: "Payment",
    entityId: paymentId,
    summary: `Recebeu em dinheiro ${brl(Number(payment.value))} — ${payment.plate ?? "sem placa"}, venc. ${payment.dueDate.toLocaleDateString("pt-BR")}`,
    amount: Number(payment.value),
    metadata: { asaasId: payment.asaasId, statusAsaas },
  });

  revalidatePath("/inadimplencia");
  revalidatePath("/dashboard");
  return {};
}

/** Desfaz a baixa — estorna o recebimento no Asaas e reabre a cobrança aqui. */
export async function desfazerBaixa(paymentId: string): Promise<ActionResult> {
  const user = await requireCan("financeiro.escrita");

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { error: "Cobrança não encontrada." };
  if (!payment.settledLocally) return { ok: "Esta cobrança já está em aberto." };

  // Mesma ideia da baixa: só uma execução concorrente passa daqui.
  const reserva = await prisma.payment.updateMany({
    where: { id: paymentId, settledLocally: true },
    data: { settledLocally: false, settledAt: null, settledNote: null, paymentDate: null },
  });
  if (reserva.count === 0) return { ok: "Esta cobrança já está em aberto." };

  try {
    await desfazerRecebimento(payment.asaasId);
  } catch (e) {
    // Estorno recusado: devolve a baixa para não divergir do Asaas.
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        settledLocally: true,
        settledAt: payment.settledAt,
        settledNote: payment.settledNote,
        paymentDate: payment.paymentDate,
      },
    });
    return { error: `O Asaas recusou o estorno: ${String(e).replace("Error: ", "")}` };
  }

  try {
    // A reserva acima já limpou a baixa; aqui só reabre o status.
    await prisma.payment.update({ where: { id: paymentId }, data: { status: "PENDING" } });
    await refreshContractPaymentStatus();
  } catch {
    return { error: "Estornado no Asaas, mas houve erro ao gravar aqui. Clique em “Atualizar do Asaas”." };
  }

  await auditar(user, {
    action: "pagamento.estorno",
    entity: "Payment",
    entityId: paymentId,
    summary: `Estornou a baixa de ${brl(Number(payment.value))} — ${payment.plate ?? "sem placa"}, venc. ${payment.dueDate.toLocaleDateString("pt-BR")}`,
    amount: Number(payment.value),
    metadata: { asaasId: payment.asaasId },
  });

  revalidatePath("/inadimplencia");
  return {};
}

/**
 * Remove de vez uma cobrança no Asaas — para boletos futuros de quem já
 * devolveu o carro (vencimento depois do fim do contrato). NÃO é "marcar
 * pago": é dinheiro que nunca vai entrar, então apaga a cobrança em vez de
 * inflar a inadimplência com dívida que não existe. Pedido do usuário em
 * 2026-10-23.
 *
 * Irreversível — o Asaas não tem como desfazer um DELETE (diferente da
 * baixa, que tem `desfazerBaixa`). Por isso a tela pede confirmação forte.
 */
export async function removerCobrancaFutura(paymentId: string): Promise<ActionResult> {
  const user = await requireCan("financeiro.escrita");

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { error: "Cobrança não encontrada." };
  if (payment.status === "DELETED") return { ok: "Esta cobrança já tinha sido removida." };
  if (payment.settledLocally) {
    return { error: "Esta cobrança já foi dada como paga — desfaça a baixa antes de remover." };
  }

  // Reserva ANTES de falar com o Asaas — mesmo motivo do marcarPago: num
  // clique duplo, só uma execução encontra a cobrança não-removida e segue.
  const reserva = await prisma.payment.updateMany({
    where: { id: paymentId, status: { not: "DELETED" } },
    data: { status: "DELETED" },
  });
  if (reserva.count === 0) {
    return { ok: "Esta cobrança já foi removida." };
  }

  try {
    await cancelarCobranca(payment.asaasId);
  } catch (e) {
    // Asaas recusou: devolve o status anterior para não divergir dos dois lados.
    await prisma.payment.update({ where: { id: paymentId }, data: { status: payment.status } });
    return { error: `O Asaas recusou a remoção: ${String(e).replace("Error: ", "")}` };
  }

  await auditar(user, {
    action: "pagamento.removido",
    entity: "Payment",
    entityId: paymentId,
    summary: `Removeu no Asaas a cobrança futura de ${brl(Number(payment.value))} — ${payment.plate ?? "sem placa"}, venc. ${payment.dueDate.toLocaleDateString("pt-BR")} (motorista já tinha devolvido o carro)`,
    amount: Number(payment.value),
    metadata: { asaasId: payment.asaasId },
  });

  revalidatePath("/inadimplencia");
  revalidatePath("/dashboard");
  return {};
}

/** Registra que a cobrança foi enviada ao motorista pelo WhatsApp. */
export async function registrarCobrancaEnviada(paymentId: string): Promise<ActionResult> {
  await requireCan("financeiro.escrita");
  try {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { lastChargedAt: new Date() },
    });
  } catch {
    return { error: "Não foi possível registrar o envio." };
  }
  revalidatePath("/inadimplencia");
  return {};
}

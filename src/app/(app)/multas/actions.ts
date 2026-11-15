"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { auditar } from "@/lib/audit";

/**
 * Ações da tela de Multas — agora um CATÁLOGO persistido (importado
 * automaticamente pela extensão do Chrome a partir do DETRAN-PE, ver
 * `dev-tools/testar-multas-detran-pe.mts` e `src/app/api/extensao/multas`),
 * não mais um relatório que o usuário monta subindo PDF na hora.
 *
 * Cobrar o motorista continua sendo a `Debt` normal (tipo MULTA_TRANSITO) —
 * ver `src/app/(app)/dividas` pra onde ela aparece depois de criada.
 */

export type ActionResult = { error?: string };

const PRAZO_PAGAMENTO_DIAS = 30;

/** Cria a dívida (MULTA_TRANSITO) do motorista responsável e linka com a multa. */
export async function cobrarMotoristaPelaMulta(fineId: string): Promise<ActionResult> {
  const user = await requireCan("financeiro");

  const fine = await prisma.fine.findUnique({
    where: { id: fineId },
    include: {
      vehicle: { select: { plate: true } },
      customer: { select: { id: true, name: true } },
    },
  });
  if (!fine) return { error: "Multa não encontrada." };
  if (fine.debtId) return { error: "Essa multa já tem uma cobrança lançada." };
  if (!fine.customerId || !fine.customer) {
    return { error: "Não há um motorista responsável identificado pra essa multa." };
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + PRAZO_PAGAMENTO_DIAS);

  const debt = await prisma.debt.create({
    data: {
      customerId: fine.customerId,
      contractId: fine.contractId,
      vehicleId: fine.vehicleId,
      type: "MULTA_TRANSITO",
      description: `${fine.description} — ${fine.vehicle.plate} (Auto ${fine.ticketNumber})`,
      amount: fine.amount,
      dueDate,
      occurredAt: fine.occurredAt,
      createdById: user.id,
    },
  });

  await prisma.fine.update({ where: { id: fineId }, data: { debtId: debt.id } });

  await auditar(user, {
    action: "divida.criada",
    entity: "Debt",
    entityId: debt.id,
    amount: Number(fine.amount),
    summary: `Dívida de multa (${fine.vehicle.plate}, Auto ${fine.ticketNumber}) lançada pra ${fine.customer.name}`,
  });

  revalidatePath("/multas");
  revalidatePath("/dividas");
  return {};
}

/** Marca que a EMPRESA já pagou a multa em si ao órgão de trânsito — separado de cobrar o motorista. */
export async function marcarPagaAutoridade(fineId: string): Promise<ActionResult> {
  const user = await requireCan("financeiro");

  const fine = await prisma.fine.findUnique({
    where: { id: fineId },
    select: { amount: true, plate: true, ticketNumber: true },
  });
  if (!fine) return { error: "Multa não encontrada." };

  await prisma.fine.update({
    where: { id: fineId },
    data: { paidToAuthorityAt: new Date(), paidToAuthorityAmount: fine.amount },
  });

  await auditar(user, {
    action: "multa.paga_autoridade",
    entity: "Fine",
    entityId: fineId,
    amount: Number(fine.amount),
    summary: `Multa paga ao órgão de trânsito (${fine.plate}, Auto ${fine.ticketNumber})`,
  });

  revalidatePath("/multas");
  return {};
}

/** Desfaz a marcação acima — pra corrigir clique errado. */
export async function desfazerPagaAutoridade(fineId: string): Promise<ActionResult> {
  await requireCan("financeiro");

  await prisma.fine.update({
    where: { id: fineId },
    data: { paidToAuthorityAt: null, paidToAuthorityAmount: null },
  });

  revalidatePath("/multas");
  return {};
}

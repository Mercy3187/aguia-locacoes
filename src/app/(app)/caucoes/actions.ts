"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { parseBrtDateTime } from "@/lib/dates";
import { auditar } from "@/lib/audit";
import { formatCurrency as moeda } from "@/lib/utils";

export type CaucaoState = { error?: string; success?: boolean };

/** Aceita "1.234,56", "1234,56" e "1234.56". */
const brl = z.preprocess((v) => {
  if (v === "" || v == null) return null;
  if (typeof v !== "string") return v;
  const c = v.trim().replace(/\s|R\$/g, "").replace(/\./g, "").replace(",", ".");
  return c === "" ? null : c;
}, z.coerce.number().nonnegative("Valor inválido.").nullable());

const optDateTime = z.preprocess(
  (v) => (v === "" || v == null ? null : parseBrtDateTime(v)),
  z.date().nullable()
);

const schema = z.object({
  contractId: z.string().min(1),
  depositValue: brl,
  depositPaidValue: z.preprocess((v) => (v === "" || v == null ? 0 : v), brl),
  depositPaidAt: optDateTime,
  depositRefundedAt: optDateTime,
  depositNotes: z.preprocess((v) => (v === "" ? null : v), z.string().trim().nullable()),
  pickupDate: optDateTime,
  pickupDone: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  pickupNotes: z.preprocess((v) => (v === "" ? null : v), z.string().trim().nullable()),
});

/** Salva a caução e os dados de entrega de um contrato. */
export async function salvarCaucao(
  _prev: CaucaoState,
  formData: FormData
): Promise<CaucaoState> {
  const user = await requireCan("financeiro");

  const parsed = schema.safeParse({
    contractId: formData.get("contractId"),
    depositValue: formData.get("depositValue"),
    depositPaidValue: formData.get("depositPaidValue"),
    depositPaidAt: formData.get("depositPaidAt"),
    depositRefundedAt: formData.get("depositRefundedAt"),
    depositNotes: formData.get("depositNotes"),
    pickupDate: formData.get("pickupDate"),
    pickupDone: formData.get("pickupDone"),
    pickupNotes: formData.get("pickupNotes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const pago = d.depositPaidValue ?? 0;
  if (d.depositValue != null && pago > d.depositValue) {
    return { error: "O valor pago não pode ser maior que o valor da caução." };
  }

  try {
    await prisma.contract.update({
      where: { id: d.contractId },
      data: {
        depositValue: d.depositValue,
        depositPaidValue: pago,
        // Se pagou algo e não informou a data, assume agora.
        depositPaidAt: d.depositPaidAt ?? (pago > 0 ? new Date() : null),
        depositRefundedAt: d.depositRefundedAt,
        depositNotes: d.depositNotes,
        pickupDate: d.pickupDate,
        pickupDone: d.pickupDone,
        pickupNotes: d.pickupNotes,
      },
    });
  } catch {
    return { error: "Não foi possível salvar. Tente novamente." };
  }

  await auditar(user, {
    action: "caucao.salva",
    entity: "Contract",
    entityId: d.contractId,
    summary: `Editou a caução: total ${moeda(d.depositValue ?? 0)}, pago ${moeda(pago)}`,
    amount: pago,
  });

  revalidatePath("/caucoes");
  revalidatePath("/motoristas");
  return { success: true };
}

/** Registra a caução como totalmente paga agora. */
export async function quitarCaucao(contractId: string): Promise<{ error?: string }> {
  const user = await requireCan("financeiro");
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { depositValue: true },
  });
  if (!c?.depositValue) return { error: "Defina o valor da caução antes." };

  await prisma.contract.update({
    where: { id: contractId },
    data: { depositPaidValue: c.depositValue, depositPaidAt: new Date() },
  });
  await auditar(user, {
    action: "caucao.quitada",
    entity: "Contract",
    entityId: contractId,
    summary: `Registrou o recebimento da caução de ${moeda(Number(c.depositValue))}`,
    amount: Number(c.depositValue),
  });
  revalidatePath("/caucoes");
  return {};
}

/** Marca a caução como devolvida ao motorista. */
export async function devolverCaucao(contractId: string): Promise<{ error?: string }> {
  const user = await requireCan("financeiro");
  const c = await prisma.contract.update({
    where: { id: contractId },
    data: { depositRefundedAt: new Date() },
  });
  await auditar(user, {
    action: "caucao.devolvida",
    entity: "Contract",
    entityId: contractId,
    summary: `Devolveu a caução de ${moeda(Number(c.depositValue ?? 0))} ao motorista`,
    amount: Number(c.depositValue ?? 0),
  });
  revalidatePath("/caucoes");
  return {};
}

/** Confirma que o motorista retirou o carro. */
export async function confirmarRetirada(contractId: string): Promise<{ error?: string }> {
  const user = await requireCan("financeiro");
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { pickupDate: true },
  });
  await prisma.contract.update({
    where: { id: contractId },
    data: { pickupDone: true, pickupDate: c?.pickupDate ?? new Date() },
  });
  await auditar(user, {
    action: "retirada.confirmada",
    entity: "Contract",
    entityId: contractId,
    summary: "Confirmou a retirada do veículo pelo motorista",
  });
  revalidatePath("/caucoes");
  return {};
}

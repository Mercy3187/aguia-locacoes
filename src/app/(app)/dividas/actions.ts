"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { parseBrtDateTime } from "@/lib/dates";
import { findCustomerByCpf } from "@/lib/asaas";
import { criarCobranca, cancelarCobranca, cancelarCarne } from "@/lib/asaas-write";
import { debtTitle } from "@/lib/dividas";
import { auditar } from "@/lib/audit";
import { formatCurrency as moeda } from "@/lib/utils";

export type DividaState = { error?: string; success?: string };

/** Aceita "1.234,56", "1234,56" e "1234.56". */
const brl = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const c = v.trim().replace(/\s|R\$/g, "").replace(/\./g, "").replace(",", ".");
  return c === "" ? undefined : c;
}, z.coerce.number().positive("Informe um valor maior que zero."));

const dataObrigatoria = z.preprocess(
  (v) => parseBrtDateTime(typeof v === "string" && v.length === 10 ? `${v}T12:00` : v),
  z.date({ error: "Informe a data." })
);

const dataOpcional = z.preprocess(
  (v) => (v === "" || v == null ? null : parseBrtDateTime(typeof v === "string" && v.length === 10 ? `${v}T12:00` : v)),
  z.date().nullable()
);

const schema = z.object({
  customerId: z.string().min(1, "Escolha o motorista."),
  type: z.enum(["MULTA_TRANSITO", "AVARIA", "COMBUSTIVEL", "FRANQUIA", "LIMPEZA", "GUINCHO", "OUTRO"]),
  description: z.string().trim().min(3, "Descreva a dívida."),
  amount: brl,
  installments: z.preprocess(
    (v) => (v === "" || v == null ? 1 : v),
    z.coerce.number().int().min(1, "Mínimo 1 parcela.").max(24, "Máximo 24 parcelas.")
  ),
  dueDate: dataObrigatoria,
  occurredAt: dataOpcional,
  notes: z.preprocess((v) => (v === "" ? null : v), z.string().trim().nullable()),
});

/** O Asaas não emite parcela abaixo de R$ 5,00. */
const PARCELA_MINIMA = 5;

/** Lança uma dívida do motorista. Não emite cobrança ainda. */
export async function criarDivida(
  _prev: DividaState,
  formData: FormData
): Promise<DividaState> {
  const user = await requireCan("financeiro");

  const parsed = schema.safeParse({
    customerId: formData.get("customerId"),
    type: formData.get("type"),
    description: formData.get("description"),
    amount: formData.get("amount"),
    installments: formData.get("installments"),
    dueDate: formData.get("dueDate"),
    occurredAt: formData.get("occurredAt"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  if (d.installments > 1 && d.amount / d.installments < PARCELA_MINIMA) {
    return {
      error: `Cada parcela ficaria abaixo de R$ ${PARCELA_MINIMA},00 — o Asaas não aceita. Reduza o número de parcelas.`,
    };
  }

  // Pega o contrato ativo do motorista para saber de qual carro veio.
  const contrato = await prisma.contract.findFirst({
    where: { customerId: d.customerId, status: "ATIVO" },
    select: { id: true, vehicleId: true },
  });

  const nova = await prisma.debt.create({
    data: {
      customerId: d.customerId,
      contractId: contrato?.id ?? null,
      vehicleId: contrato?.vehicleId ?? null,
      type: d.type,
      description: d.description,
      amount: d.amount,
      installments: d.installments,
      dueDate: d.dueDate,
      occurredAt: d.occurredAt,
      notes: d.notes,
      createdById: user.id,
    },
  });

  await auditar(user, {
    action: "divida.criada",
    entity: "Debt",
    entityId: nova.id,
    summary: `Lançou dívida de ${moeda(d.amount)}${d.installments > 1 ? ` em ${d.installments}x` : ""} — ${d.description}`,
    amount: d.amount,
  });

  revalidatePath("/dividas");
  return { success: "Dívida lançada. Agora você pode emitir a cobrança." };
}

/**
 * Emite a cobrança da dívida no Asaas.
 * É uma cobrança NOVA e avulsa — não mexe nas de aluguel do contrato.
 */
export async function emitirCobranca(debtId: string): Promise<DividaState> {
  const user = await requireCan("financeiro.escrita");

  const divida = await prisma.debt.findUnique({
    where: { id: debtId },
    include: { customer: true, vehicle: { select: { plate: true } } },
  });
  if (!divida) return { error: "Dívida não encontrada." };
  if (divida.asaasPaymentId) return { success: "A cobrança desta dívida já foi emitida." };
  if (divida.status === "CANCELADA") return { error: "Esta dívida está cancelada." };

  if (!divida.customer.cpfCnpj) {
    return { error: `${divida.customer.name} está sem CPF cadastrado — o Asaas exige o documento.` };
  }

  let asaasCustomerId: string;
  try {
    const cli = await findCustomerByCpf(divida.customer.cpfCnpj);
    if (!cli) {
      return {
        error: `${divida.customer.name} não tem cadastro no Asaas. Cadastre-o lá primeiro.`,
      };
    }
    asaasCustomerId = cli.id;
  } catch (e) {
    return { error: `Falha ao consultar o Asaas: ${String(e).replace("Error: ", "").slice(0, 120)}` };
  }

  // Reserva antes de chamar o Asaas: clique duplo não emite duas cobranças.
  const reserva = await prisma.debt.updateMany({
    where: { id: debtId, asaasPaymentId: null, status: "ABERTA" },
    data: { status: "COBRADA" },
  });
  if (reserva.count === 0) return { success: "A cobrança desta dívida já foi emitida." };

  try {
    const titulo = debtTitle({
      type: divida.type,
      description: divida.description,
      vehiclePlate: divida.vehicle?.plate,
    });
    const cob = await criarCobranca({
      asaasCustomerId,
      totalValue: Number(divida.amount),
      installments: divida.installments,
      dueDate: divida.dueDate,
      description:
        divida.installments > 1 ? `${titulo} (em ${divida.installments}x)` : titulo,
      externalReference: `debt_${divida.id}`,
    });

    await prisma.debt.update({
      where: { id: debtId },
      data: {
        asaasPaymentId: cob.id,
        asaasInstallmentId: cob.installment ?? null,
        invoiceUrl: cob.invoiceUrl,
        bankSlipUrl: cob.bankSlipUrl,
      },
    });
  } catch (e) {
    // Desfaz a reserva para a dívida não ficar "cobrada" sem cobrança.
    await prisma.debt.update({ where: { id: debtId }, data: { status: "ABERTA" } });
    return { error: `O Asaas recusou: ${String(e).replace("Error: ", "").slice(0, 150)}` };
  }

  await auditar(user, {
    action: "divida.cobranca_emitida",
    entity: "Debt",
    entityId: debtId,
    summary: `Emitiu cobrança de ${moeda(Number(divida.amount))}${divida.installments > 1 ? ` em ${divida.installments}x` : ""} para ${divida.customer.name}`,
    amount: Number(divida.amount),
  });

  revalidatePath("/dividas");
  return { success: "Cobrança emitida no Asaas." };
}

/** Marca a dívida como paga (recebimento por fora). */
export async function marcarDividaPaga(debtId: string): Promise<DividaState> {
  const user = await requireCan("financeiro.escrita");
  const d = await prisma.debt.findUnique({ where: { id: debtId } });
  if (!d) return { error: "Dívida não encontrada." };
  if (d.status === "PAGA") return { success: "Já estava paga." };

  await prisma.debt.update({
    where: { id: debtId },
    data: { status: "PAGA", paidAt: new Date() },
  });
  await auditar(user, {
    action: "divida.paga",
    entity: "Debt",
    entityId: debtId,
    summary: `Quitou dívida de ${moeda(Number(d.amount))} — ${d.description}`,
    amount: Number(d.amount),
  });

  revalidatePath("/dividas");
  return { success: "Dívida quitada." };
}

/** Cancela a dívida — e a cobrança no Asaas, se já tiver sido emitida. */
export async function cancelarDivida(debtId: string): Promise<DividaState> {
  const user = await requireCan("financeiro.escrita");

  const d = await prisma.debt.findUnique({ where: { id: debtId } });
  if (!d) return { error: "Dívida não encontrada." };
  if (d.status === "PAGA") return { error: "Dívida já paga não pode ser cancelada." };

  try {
    // Parcelada: cancela o carnê inteiro, não só a primeira parcela.
    if (d.asaasInstallmentId) {
      await cancelarCarne(d.asaasInstallmentId);
    } else if (d.asaasPaymentId) {
      await cancelarCobranca(d.asaasPaymentId);
    }
  } catch (e) {
    return { error: `O Asaas recusou o cancelamento: ${String(e).replace("Error: ", "").slice(0, 130)}` };
  }

  await prisma.debt.update({
    where: { id: debtId },
    data: {
      status: "CANCELADA",
      asaasPaymentId: null,
      asaasInstallmentId: null,
      invoiceUrl: null,
      bankSlipUrl: null,
    },
  });
  await auditar(user, {
    action: "divida.cancelada",
    entity: "Debt",
    entityId: debtId,
    summary: `Cancelou dívida de ${moeda(Number(d.amount))} — ${d.description}`,
    amount: Number(d.amount),
  });

  revalidatePath("/dividas");
  return { success: "Dívida cancelada." };
}

/** Registra que a cobrança foi enviada pelo WhatsApp. */
export async function registrarEnvioDivida(debtId: string): Promise<DividaState> {
  await requireCan("financeiro");
  await prisma.debt.update({ where: { id: debtId }, data: { lastChargedAt: new Date() } });
  revalidatePath("/dividas");
  return {};
}

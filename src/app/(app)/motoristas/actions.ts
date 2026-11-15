"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { maintenanceDiscount, downtimeDiscountDays } from "@/lib/billing";
import { custoTotal } from "@/lib/manutencao";
import { parseBrtDateTime } from "@/lib/dates";
import { auditar } from "@/lib/audit";
import { formatCurrency as brl } from "@/lib/utils";

export type MaintenanceFormState = { error?: string; success?: boolean };

/** Aceita "1.234,56", "1234,56" e "1234.56" — formatos que o usuário digita. */
const brlAmount = z.preprocess((v) => {
  if (v === "" || v == null) return null;
  if (typeof v !== "string") return v;
  const cleaned = v.trim().replace(/\s|R\$/g, "").replace(/\./g, "").replace(",", ".");
  return cleaned === "" ? null : cleaned;
}, z.coerce.number().nonnegative("O valor não pode ser negativo.").nullable());

const brtDateTime = z.preprocess(
  (v) => parseBrtDateTime(v),
  z.date({ error: "Informe a data e a hora." })
);

const pararSchema = z.object({
  vehicleId: z.string().min(1),
  startAt: brtDateTime,
  type: z.string().trim().min(1, "Informe o tipo de manutenção."),
  workshop: z.preprocess((v) => (v === "" ? null : v), z.string().trim().nullable()),
  description: z.preprocess((v) => (v === "" ? null : v), z.string().trim().nullable()),
});

const saidaSchema = z.object({
  maintenanceId: z.string().min(1),
  endAt: brtDateTime,
  // A peça é comprada na autopeças e o serviço é pago ao mecânico. Os dois
  // seguem opcionais aqui: na saída nem sempre a nota da peça já chegou, e o
  // carro precisa voltar a rodar de qualquer forma.
  partsCost: brlAmount,
  laborCost: brlAmount,
  partsSupplier: z.preprocess((v) => (v === "" ? null : v), z.string().trim().nullable()),
});

function revalidate() {
  revalidatePath("/motoristas");
  revalidatePath("/manutencao");
  revalidatePath("/veiculos");
  revalidatePath("/dashboard");
}

/**
 * Para o carro para manutenção na data/hora informada pelo usuário.
 * O veículo sai de "Alugado" e entra em "Manutenção".
 */
export async function pararParaManutencao(
  _prev: MaintenanceFormState,
  formData: FormData
): Promise<MaintenanceFormState> {
  const user = await requireCan("operacao");

  const parsed = pararSchema.safeParse({
    vehicleId: formData.get("vehicleId"),
    startAt: formData.get("startAt"),
    type: formData.get("type"),
    workshop: formData.get("workshop"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const emAberto = await prisma.maintenance.findFirst({
    where: { vehicleId: data.vehicleId, status: "EM_ANDAMENTO" },
  });
  if (emAberto) {
    return { error: "Este carro já está em manutenção. Registre a saída antes de abrir outra." };
  }

  // Vincula ao contrato ativo para o desconto proporcional ser calculado na saída.
  const activeContract = await prisma.contract.findFirst({
    where: { vehicleId: data.vehicleId, status: "ATIVO" },
    select: { id: true },
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.maintenance.create({
        data: {
          vehicleId: data.vehicleId,
          contractId: activeContract?.id ?? null,
          type: data.type,
          description: data.description,
          workshop: data.workshop,
          startAt: data.startAt,
          status: "EM_ANDAMENTO",
        },
      });
      await tx.vehicle.update({
        where: { id: data.vehicleId },
        data: { status: "MANUTENCAO" },
      });
    });
  } catch {
    return { error: "Erro ao registrar a entrada. Tente novamente." };
  }

  const veiculo = await prisma.vehicle.findUnique({
    where: { id: data.vehicleId },
    select: { plate: true },
  });
  await auditar(user, {
    action: "manutencao.entrada",
    entity: "Maintenance",
    entityId: data.vehicleId,
    summary: `Parou o ${veiculo?.plate ?? "veículo"} para manutenção (${data.type})`,
    metadata: { oficina: data.workshop, entrada: data.startAt.toISOString() },
  });

  revalidate();
  return { success: true };
}

/**
 * Registra a saída da manutenção com a data/hora e o valor gasto.
 * Calcula o desconto proporcional dos dias parados (regra em billing.ts:
 * diária = semanal/7; meia diária se voltou até 17h, inteira depois).
 */
export async function registrarSaidaManutencao(
  _prev: MaintenanceFormState,
  formData: FormData
): Promise<MaintenanceFormState> {
  const user = await requireCan("operacao");

  const parsed = saidaSchema.safeParse({
    maintenanceId: formData.get("maintenanceId"),
    endAt: formData.get("endAt"),
    partsCost: formData.get("partsCost"),
    laborCost: formData.get("laborCost"),
    partsSupplier: formData.get("partsSupplier"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { maintenanceId, endAt, partsCost, laborCost, partsSupplier } = parsed.data;

  const maintenance = await prisma.maintenance.findUnique({
    where: { id: maintenanceId },
    include: { contract: true },
  });
  if (!maintenance) return { error: "Manutenção não encontrada." };
  if (maintenance.status !== "EM_ANDAMENTO") {
    return { error: "Esta manutenção já foi finalizada." };
  }
  if (endAt < maintenance.startAt) {
    return { error: "A data de saída não pode ser anterior à data de entrada." };
  }
  // Esta tela é a do motorista com o carro dele, então a manutenção sempre
  // tem veículo. Manutenção avulsa (sem veículo) não chega aqui — é concluída
  // pela tela de Manutenções. A checagem existe para o caso não passar batido
  // se um dia alguém apontar esta ação para outro lugar.
  const vehicleId = maintenance.vehicleId;
  if (!vehicleId) {
    return { error: "Esta manutenção é de carro avulso — conclua pela tela de Manutenções." };
  }

  const informouCusto = partsCost != null || laborCost != null;
  const total = custoTotal(partsCost, laborCost);

  const activeContract =
    maintenance.contract?.status === "ATIVO" ? maintenance.contract : null;
  const weeklyValue = Number(activeContract?.weeklyValue ?? 0);
  const discount = activeContract
    ? maintenanceDiscount(maintenance.startAt, endAt, weeklyValue)
    : 0;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.maintenance.update({
        where: { id: maintenanceId },
        data: {
          status: "CONCLUIDA",
          endAt,
          // Não informou nem peça nem mão de obra: o registro fica como
          // estava, sem apagar o que já havia (o carro pode ter entrado com
          // valor lançado pela tela de Manutenções).
          ...(informouCusto
            ? {
                partsCost,
                laborCost,
                partsSupplier,
                cost: custoTotal(partsCost, laborCost),
              }
            : {}),
          downtimeDiscount: discount || null,
        },
      });

      if (activeContract && discount > 0) {
        const days = downtimeDiscountDays(maintenance.startAt, endAt);
        await tx.contractAdjustment.create({
          data: {
            contractId: activeContract.id,
            type: "DESCONTO_MANUTENCAO",
            amount: -discount,
            description: `Desconto por ${days} diária(s) parado em manutenção.`,
            referenceId: maintenanceId,
          },
        });
      }

      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { status: activeContract ? "ALUGADO" : "DISPONIVEL" },
      });
    });
  } catch {
    return { error: "Erro ao registrar a saída. Tente novamente." };
  }

  const veiculo = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { plate: true },
  });
  await auditar(user, {
    action: "manutencao.saida",
    entity: "Maintenance",
    entityId: maintenanceId,
    summary:
      `Liberou o ${veiculo?.plate ?? "veículo"} da manutenção` +
      (informouCusto
        ? ` — ${brl(total)} (peça ${brl(partsCost ?? 0)} + mão de obra ${brl(laborCost ?? 0)})`
        : "") +
      (discount > 0 ? `, desconto de ${brl(discount)} ao motorista` : ""),
    amount: informouCusto ? total : null,
    metadata: {
      saida: endAt.toISOString(),
      desconto: discount,
      pecas: partsCost,
      maoDeObra: laborCost,
    },
  });

  revalidate();
  return { success: true };
}

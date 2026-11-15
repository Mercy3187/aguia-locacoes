"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { maintenanceDiscount, downtimeDiscountDays } from "@/lib/billing";
import { custoTotal } from "@/lib/manutencao";
import { maintenanceSchema, maintenanceFromForm } from "./schema";

export type FormState = { error?: string };

/** Registra uma manutenção (carro entra em manutenção). */
export async function registrarManutencao(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireCan("operacao");

  const parsed = maintenanceSchema.safeParse(maintenanceFromForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  // ── Carro avulso ────────────────────────────────────────────────────
  // Não é da frota: não há veículo para vincular nem status de veículo para
  // mudar, e sem contrato não existe diária parada a descontar. Por isso não
  // precisa de transação — é um único INSERT.
  if (data.origem === "avulso") {
    try {
      await prisma.maintenance.create({
        data: {
          vehicleId: null,
          contractId: null,
          avulsoPlate: data.avulsoPlate,
          avulsoModel: data.avulsoModel,
          type: data.type,
          description: data.description,
          workshop: data.workshop,
          partsSupplier: data.partsSupplier,
          partsCost: data.partsCost,
          laborCost: data.laborCost,
          // O total nunca é digitado: sai da soma das duas partes.
          cost: custoTotal(data.partsCost, data.laborCost),
          startAt: data.startAt ?? new Date(),
          status: "EM_ANDAMENTO",
        },
      });
    } catch {
      return { error: "Erro ao registrar a manutenção. Tente novamente." };
    }

    revalidatePath("/manutencao");
    redirect("/manutencao");
  }

  // ── Carro da frota ──────────────────────────────────────────────────
  // O `superRefine` do schema já garante que veio veículo; a checagem aqui é
  // para o TypeScript, que não consegue estreitar o tipo a partir dele.
  const vehicleId = data.vehicleId;
  if (!vehicleId) return { error: "Selecione o veículo." };

  // Contrato ativo do veículo (para vincular e calcular o desconto depois)
  const activeContract = await prisma.contract.findFirst({
    where: { vehicleId, status: "ATIVO" },
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.maintenance.create({
        data: {
          vehicleId,
          contractId: activeContract?.id ?? null,
          type: data.type,
          description: data.description,
          workshop: data.workshop,
          partsSupplier: data.partsSupplier,
          partsCost: data.partsCost,
          laborCost: data.laborCost,
          // O total nunca é digitado: sai da soma das duas partes.
          cost: custoTotal(data.partsCost, data.laborCost),
          startAt: data.startAt ?? new Date(),
          status: "EM_ANDAMENTO",
        },
      });
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { status: "MANUTENCAO" },
      });
    });
  } catch {
    return { error: "Erro ao registrar a manutenção. Tente novamente." };
  }

  revalidatePath("/manutencao");
  revalidatePath("/veiculos");
  redirect("/manutencao");
}

/** Conclui a manutenção e calcula o desconto proporcional para a próxima semana. */
export async function concluirManutencao(id: string): Promise<FormState> {
  await requireCan("operacao");

  const maintenance = await prisma.maintenance.findUnique({
    where: { id },
    include: { contract: true },
  });
  if (!maintenance) return { error: "Manutenção não encontrada." };
  if (maintenance.status !== "EM_ANDAMENTO") return { error: "Manutenção já finalizada." };

  const endAt = new Date();
  const hasActiveContract =
    maintenance.contract && maintenance.contract.status === "ATIVO";

  // Desconto proporcional ao tempo parado (se houver contrato ativo com valor)
  let discount = 0;
  if (hasActiveContract) {
    discount = maintenanceDiscount(
      maintenance.startAt,
      endAt,
      Number(maintenance.contract!.weeklyValue ?? 0)
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.maintenance.update({
        where: { id },
        data: { status: "CONCLUIDA", endAt, downtimeDiscount: discount || null },
      });

      if (hasActiveContract && discount > 0) {
        const days = downtimeDiscountDays(maintenance.startAt, endAt);
        await tx.contractAdjustment.create({
          data: {
            contractId: maintenance.contractId!,
            type: "DESCONTO_MANUTENCAO",
            amount: -discount,
            description: `Desconto por ${days} diária(s) parado em manutenção.`,
            referenceId: id,
          },
        });
      }

      // Devolve o veículo ao status adequado. Manutenção avulsa não tem
      // veículo na frota, então não há status para devolver.
      if (maintenance.vehicleId) {
        await tx.vehicle.update({
          where: { id: maintenance.vehicleId },
          data: { status: hasActiveContract ? "ALUGADO" : "DISPONIVEL" },
        });
      }
    });
  } catch {
    return { error: "Erro ao concluir a manutenção. Tente novamente." };
  }

  revalidatePath("/manutencao");
  revalidatePath("/veiculos");
  return {};
}

/** Cancela a manutenção e devolve o veículo. */
export async function cancelarManutencao(id: string): Promise<FormState> {
  await requireCan("operacao");
  const maintenance = await prisma.maintenance.findUnique({
    where: { id },
    include: { contract: true },
  });
  if (!maintenance) return { error: "Manutenção não encontrada." };

  const hasActiveContract = maintenance.contract?.status === "ATIVO";
  try {
    await prisma.$transaction(async (tx) => {
      await tx.maintenance.update({ where: { id }, data: { status: "CANCELADA", endAt: new Date() } });
      // Avulso não tem veículo na frota para devolver ao pátio.
      if (maintenance.vehicleId) {
        await tx.vehicle.update({
          where: { id: maintenance.vehicleId },
          data: { status: hasActiveContract ? "ALUGADO" : "DISPONIVEL" },
        });
      }
    });
  } catch {
    return { error: "Erro ao cancelar." };
  }
  revalidatePath("/manutencao");
  revalidatePath("/veiculos");
  return {};
}

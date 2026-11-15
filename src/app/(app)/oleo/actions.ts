"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { computeOil } from "@/lib/oil";
import { uploadFile } from "@/lib/storage";
import { oilChangeSchema, oilChangeFromForm } from "./schema";

export type FormState = { error?: string };

/**
 * Registra uma troca de óleo e atualiza o veículo:
 * - last_oil_change_km e intervalo passam a valer os informados
 * - next_oil_change_km e o status do óleo são recalculados
 */
export async function registrarTroca(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireCan("operacao");

  const parsed = oilChangeSchema.safeParse(oilChangeFromForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const vehicle = await prisma.vehicle.findUnique({ where: { id: data.vehicleId } });
  if (!vehicle) return { error: "Veículo não encontrado." };

  const nextChangeKm = data.lastChangeKm + data.intervalKm;

  // Nota fiscal (opcional)
  let invoiceUrl: string | null = null;
  const invoice = formData.get("invoice");
  if (invoice instanceof File && invoice.size > 0) {
    try {
      invoiceUrl = await uploadFile(invoice, "notas");
    } catch {
      return { error: "Não foi possível enviar a nota fiscal. Tente novamente." };
    }
  }

  // Recalcula o óleo do veículo com base na nova troca e na KM atual.
  const oil = computeOil(vehicle.currentKm, data.lastChangeKm, data.intervalKm);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.oilChange.create({
        data: {
          vehicleId: data.vehicleId,
          lastChangeKm: data.lastChangeKm,
          intervalKm: data.intervalKm,
          nextChangeKm,
          oilType: data.oilType,
          oilFilter: data.oilFilter,
          airFilter: data.airFilter,
          cabinFilter: data.cabinFilter,
          fuelFilter: data.fuelFilter,
          workshop: data.workshop,
          value: data.value,
          date: data.date,
          invoiceUrl,
        },
      });

      await tx.vehicle.update({
        where: { id: data.vehicleId },
        data: {
          lastOilChangeKm: data.lastChangeKm,
          oilChangeIntervalKm: data.intervalKm,
          ...oil,
        },
      });
    });
  } catch {
    return { error: "Erro ao registrar a troca de óleo. Tente novamente." };
  }

  revalidatePath("/oleo");
  revalidatePath("/veiculos");
  redirect("/oleo");
}

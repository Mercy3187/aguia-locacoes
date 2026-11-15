"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { correiaSchema, correiaFromForm } from "./schema";

export type FormState = { error?: string };

/**
 * Registra a troca da correia dentada de um veículo.
 *
 * Só grava o que é fato — a KM da troca, a data e o intervalo. Quanto falta
 * para a próxima e o status saem da conta feita na hora de mostrar a tela.
 */
export async function registrarCorreia(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireCan("operacao");

  const parsed = correiaSchema.safeParse(correiaFromForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: data.vehicleId },
    select: { currentKm: true, plate: true },
  });
  if (!vehicle) return { error: "Veículo não encontrado." };

  // Trocar a correia numa KM maior que a do odômetro não existe: ou a KM da
  // troca está errada, ou a do carro está atrasada. Avisar aqui evita um
  // "faltam 50.000 km" que não corresponde à realidade.
  if (data.lastTimingBeltKm > vehicle.currentKm) {
    return {
      error: `A KM da troca (${data.lastTimingBeltKm.toLocaleString(
        "pt-BR"
      )}) é maior que a KM atual do ${vehicle.plate} (${vehicle.currentKm.toLocaleString(
        "pt-BR"
      )} km). Confira o número.`,
    };
  }

  try {
    await prisma.vehicle.update({
      where: { id: data.vehicleId },
      data: {
        lastTimingBeltKm: data.lastTimingBeltKm,
        lastTimingBeltAt: data.date,
        timingBeltIntervalKm: data.intervalKm,
        timingBeltNotes: data.notes,
      },
    });
  } catch {
    return { error: "Erro ao salvar. Tente novamente." };
  }

  revalidatePath("/correia");
  revalidatePath("/veiculos");
  redirect("/correia");
}

/** Limpa o registro da correia (para corrigir um lançamento errado). */
export async function limparCorreia(vehicleId: string): Promise<FormState> {
  await requireCan("operacao");

  try {
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        lastTimingBeltKm: null,
        lastTimingBeltAt: null,
        timingBeltNotes: null,
      },
    });
  } catch {
    return { error: "Erro ao limpar o registro." };
  }

  revalidatePath("/correia");
  return {};
}

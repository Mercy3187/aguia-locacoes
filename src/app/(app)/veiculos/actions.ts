"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computeOil } from "@/lib/oil";
import { requireCan } from "@/lib/session";
import { depoisDeAplicarKm, SELECT_VEICULO_KM } from "@/lib/km";
import { conferirKmNova } from "@/lib/km-conferencia";
import { vehicleSchema, vehicleFromForm } from "./schema";

export type FormState = {
  error?: string;
  /**
   * Aviso de que a KM digitada faz o odômetro andar para trás. Não é erro: o
   * formulário mostra a pergunta e reenvia com `kmConfirmado`.
   */
  confirmarKm?: string;
};

export async function createVehicle(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireCan("cadastros.editar");

  const parsed = vehicleSchema.safeParse(vehicleFromForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;
  const oil = computeOil(data.currentKm, data.lastOilChangeKm, data.oilChangeIntervalKm);

  try {
    await prisma.vehicle.create({
      data: { ...data, ...oil },
    });
  } catch (error) {
    return { error: dbErrorMessage(error) };
  }

  revalidatePath("/veiculos");
  redirect("/veiculos");
}

export async function updateVehicle(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireCan("cadastros.editar");

  const parsed = vehicleSchema.safeParse(vehicleFromForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const atual = await prisma.vehicle.findUnique({
    where: { id },
    select: SELECT_VEICULO_KM,
  });
  if (!atual) return { error: "Veículo não encontrado." };

  // A KM daqui é a mesma do controle de KM, do óleo e da correia. Baixá-la é
  // permitido — é como se corrige um lançamento errado — mas nunca sem querer:
  // a primeira tentativa volta com a pergunta e nada é salvo até confirmar.
  const kmCheck = conferirKmNova({
    novaKm: data.currentKm,
    kmAtual: atual.currentKm,
    plate: atual.plate,
    confirmado: formData.get("kmConfirmado") === "1",
  });
  if (!kmCheck.ok) {
    if ("confirmar" in kmCheck) return { confirmarKm: kmCheck.confirmar };
    return { error: kmCheck.error };
  }

  const oil = computeOil(data.currentKm, data.lastOilChangeKm, data.oilChangeIntervalKm);

  try {
    await prisma.vehicle.update({
      where: { id },
      data: { ...data, ...oil },
    });
  } catch (error) {
    return { error: dbErrorMessage(error) };
  }

  // Mexeu na KM: registra na trilha e atualiza as
  // outras telas que mostram esse número — o mesmo fim de linha de quem altera
  // pelo controle de KM.
  if (data.currentKm !== atual.currentKm) {
    await depoisDeAplicarKm({
      veiculo: {
        ...atual,
        lastOilChangeKm: data.lastOilChangeKm,
        oilChangeIntervalKm: data.oilChangeIntervalKm,
      },
      kmAnterior: atual.currentKm,
      kmNova: data.currentKm,
      origem: "veiculo",
      user,
    });
  }

  revalidatePath("/veiculos");
  redirect("/veiculos");
}

export async function deleteVehicle(id: string): Promise<void> {
  await requireCan("excluir");
  try {
    await prisma.vehicle.delete({ where: { id } });
  } catch {
    // Se houver contratos vinculados, o banco impede a exclusão.
    throw new Error(
      "Não foi possível excluir: o veículo possui registros vinculados (contratos, KM)."
    );
  }
  revalidatePath("/veiculos");
  redirect("/veiculos");
}

function dbErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Unique constraint") || message.includes("plate")) {
    return "Já existe um veículo com essa placa.";
  }
  return "Erro ao salvar o veículo. Tente novamente.";
}

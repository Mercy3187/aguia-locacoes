"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";

export type FormState = { error?: string };

export async function createVehicleGroup(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireCan("cadastros.editar");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Informe o nome do grupo." };

  try {
    await prisma.vehicleGroup.create({ data: { name } });
  } catch {
    return { error: "Já existe um grupo com esse nome." };
  }

  revalidatePath("/grupos");
  redirect("/grupos");
}

export async function updateVehicleGroup(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireCan("cadastros.editar");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Informe o nome do grupo." };

  const valorBruto = String(formData.get("monthlyDeductionValue") ?? "").trim();
  const monthlyDeductionValue = valorBruto ? Number(valorBruto) : null;
  if (valorBruto && (Number.isNaN(monthlyDeductionValue) || monthlyDeductionValue! < 0)) {
    return { error: "O desconto mensal deve ser um valor válido (ou deixe em branco)." };
  }
  const labelBruto = String(formData.get("monthlyDeductionLabel") ?? "").trim();
  const monthlyDeductionLabel = monthlyDeductionValue ? labelBruto || "Desconto mensal" : null;

  try {
    await prisma.vehicleGroup.update({
      where: { id },
      data: { name, monthlyDeductionValue, monthlyDeductionLabel },
    });
  } catch {
    return { error: "Já existe um grupo com esse nome." };
  }

  revalidatePath("/grupos");
  revalidatePath(`/grupos/${id}`);
  redirect(`/grupos/${id}`);
}

/** Substitui, de uma vez, quais veículos pertencem a este grupo. */
export async function setVehicleGroupMembers(id: string, formData: FormData): Promise<void> {
  await requireCan("cadastros.editar");

  const idsSelecionados = formData.getAll("veiculo").map(String);

  await prisma.$transaction([
    prisma.vehicle.updateMany({
      where: { vehicleGroupId: id },
      data: { vehicleGroupId: null },
    }),
    prisma.vehicle.updateMany({
      where: { id: { in: idsSelecionados } },
      data: { vehicleGroupId: id },
    }),
  ]);

  revalidatePath("/grupos");
  revalidatePath(`/grupos/${id}`);
  revalidatePath("/veiculos");
  revalidatePath("/veiculos/rendimento");
  redirect(`/grupos/${id}`);
}

export async function deleteVehicleGroup(id: string): Promise<void> {
  await requireCan("excluir");

  const [veiculos, retiradas] = await Promise.all([
    prisma.vehicle.count({ where: { vehicleGroupId: id } }),
    prisma.withdrawal.count({ where: { vehicleGroupId: id } }),
  ]);
  if (veiculos > 0 || retiradas > 0) {
    throw new Error(
      "Não é possível excluir: o grupo tem veículos ou retiradas vinculadas. Tire os veículos do grupo primeiro."
    );
  }

  await prisma.vehicleGroup.delete({ where: { id } });
  revalidatePath("/grupos");
  redirect("/grupos");
}

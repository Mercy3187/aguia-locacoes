"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { withdrawalSchema, withdrawalFromForm } from "./schema";

export type FormState = { error?: string };

export async function createWithdrawal(
  groupId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireCan("retiradas");

  const parsed = withdrawalSchema.safeParse(withdrawalFromForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  await prisma.withdrawal.create({
    data: { vehicleGroupId: groupId, ...parsed.data },
  });

  revalidatePath("/retiradas");
  revalidatePath("/veiculos/rendimento");
  redirect(`/retiradas?grupo=${groupId}`);
}

export async function deleteWithdrawal(id: string, groupId: string): Promise<void> {
  await requireCan("retiradas");
  await prisma.withdrawal.delete({ where: { id } });
  revalidatePath("/retiradas");
  revalidatePath("/veiculos/rendimento");
  redirect(`/retiradas?grupo=${groupId}`);
}

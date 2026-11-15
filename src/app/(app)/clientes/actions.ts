"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { customerSchema, customerFromForm } from "./schema";

export type FormState = { error?: string };

export async function createCustomer(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireCan("cadastros.editar");

  const parsed = customerSchema.safeParse(customerFromForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await prisma.customer.create({ data: parsed.data });
  } catch {
    return { error: "Erro ao salvar o cliente. Tente novamente." };
  }

  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function updateCustomer(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireCan("cadastros.editar");

  const parsed = customerSchema.safeParse(customerFromForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await prisma.customer.update({ where: { id }, data: parsed.data });
  } catch {
    return { error: "Erro ao salvar o cliente. Tente novamente." };
  }

  revalidatePath("/clientes");
  redirect("/clientes");
}

export async function deleteCustomer(id: string): Promise<void> {
  await requireCan("excluir");
  try {
    await prisma.customer.delete({ where: { id } });
  } catch {
    throw new Error(
      "Não foi possível excluir: o cliente possui contratos ou registros vinculados."
    );
  }
  revalidatePath("/clientes");
  redirect("/clientes");
}

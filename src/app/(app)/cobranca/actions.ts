"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";

/** Marca todos os ajustes pendentes de um contrato como cobrados (settled). */
export async function marcarCobrado(contractId: string): Promise<{ error?: string }> {
  await requireCan("financeiro");
  try {
    await prisma.contractAdjustment.updateMany({
      where: { contractId, settled: false },
      data: { settled: true },
    });
  } catch {
    return { error: "Não foi possível marcar como cobrado." };
  }
  revalidatePath("/cobranca");
  return {};
}

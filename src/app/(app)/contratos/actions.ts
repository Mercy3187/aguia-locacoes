"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { addDays, KM_CYCLE_DAYS } from "@/lib/dates";
import { contractSchema, contractFromForm, type ContractInput } from "./schema";

export type FormState = { error?: string };

/**
 * Calcula a data da próxima solicitação de KM conforme o status do contrato.
 * - ATIVO: mantém o ciclo em andamento; se ainda não começou, agenda para
 *   15 dias após o início (ou 15 dias após a última solicitação).
 * - ENCERRADO/CANCELADO/PENDENTE: sem próxima solicitação agendada.
 */
function nextKmDate(
  data: ContractInput,
  existing?: { nextKmRequestDate: Date | null; lastKmRequestDate: Date | null }
): Date | null {
  if (data.status !== "ATIVO") return null;

  if (existing?.lastKmRequestDate) {
    return addDays(existing.lastKmRequestDate, KM_CYCLE_DAYS);
  }
  if (existing?.nextKmRequestDate) {
    return existing.nextKmRequestDate; // ciclo já iniciado — não reinicia
  }
  return addDays(data.startDate, KM_CYCLE_DAYS);
}

export async function createContract(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireCan("cadastros.editar");

  const parsed = contractSchema.safeParse(contractFromForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.contract.create({
        data: { ...data, nextKmRequestDate: nextKmDate(data) },
      });
      if (data.status === "ATIVO") {
        await tx.vehicle.update({
          where: { id: data.vehicleId },
          data: { status: "ALUGADO" },
        });
      }
    });
  } catch {
    return { error: "Erro ao salvar o contrato. Tente novamente." };
  }

  revalidatePath("/contratos");
  revalidatePath("/veiculos");
  redirect("/contratos");
}

export async function updateContract(
  id: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  await requireCan("cadastros.editar");

  const parsed = contractSchema.safeParse(contractFromForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const existing = await prisma.contract.findUnique({ where: { id } });
  if (!existing) return { error: "Contrato não encontrado." };

  const ended = data.status === "ENCERRADO" || data.status === "CANCELADO";

  try {
    await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id },
        data: {
          ...data,
          nextKmRequestDate: nextKmDate(data, existing),
          // Encerrar por aqui também fecha o período na linha do tempo do
          // veículo; reabrir (voltar para Ativo) apaga a devolução.
          returnedAt: ended ? (existing.returnedAt ?? new Date()) : data.status === "ATIVO" ? null : existing.returnedAt,
        },
      });

      // Sincroniza o status do veículo
      if (data.status === "ATIVO") {
        await tx.vehicle.update({
          where: { id: data.vehicleId },
          data: { status: "ALUGADO" },
        });
      } else if (ended) {
        await tx.vehicle.updateMany({
          where: { id: data.vehicleId, status: "ALUGADO" },
          data: { status: "DISPONIVEL" },
        });
        // Cancela solicitações de KM futuras/pendentes
        await tx.kmRequest.updateMany({
          where: { contractId: id, status: { in: ["PENDENTE", "ENVIADO"] } },
          data: { status: "CANCELADO" },
        });
      }
    });
  } catch {
    return { error: "Erro ao salvar o contrato. Tente novamente." };
  }

  revalidatePath("/contratos");
  revalidatePath("/veiculos");
  redirect("/contratos");
}

export async function deleteContract(id: string): Promise<void> {
  await requireCan("excluir");
  try {
    await prisma.contract.delete({ where: { id } });
  } catch {
    throw new Error(
      "Não foi possível excluir: o contrato possui solicitações ou registros de KM vinculados."
    );
  }
  revalidatePath("/contratos");
  redirect("/contratos");
}

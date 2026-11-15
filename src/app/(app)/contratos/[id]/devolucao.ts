"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { auditar } from "@/lib/audit";
import { parseBrtDateTime } from "@/lib/dates";
import { depoisDeAplicarKm, SELECT_VEICULO_KM } from "@/lib/km";
import { encerrarContratoNoBanco } from "@/lib/contratos";
import { NIVEIS_COMBUSTIVEL } from "@/lib/contrato-gerar";

export type DevolucaoState = { error?: string; ok?: boolean };

const schema = z.object({
  em: z.preprocess((v) => parseBrtDateTime(v), z.date({ message: "Informe a data da devolução." })),
  odometro: z.coerce
    .number({ message: "Informe o odômetro da devolução." })
    .int("O odômetro deve ser um número inteiro.")
    .nonnegative("O odômetro não pode ser negativo."),
  combustivel: z.enum(NIVEIS_COMBUSTIVEL, { message: "Selecione o nível de combustível na devolução." }),
  observacao: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
    z.string().max(1000).nullable()
  ),
});

/**
 * Registra a devolução do carro: encerra o contrato, fecha o período na linha
 * do tempo do veículo e devolve o carro ao pátio.
 */
export async function registrarDevolucao(
  contractId: string,
  _prev: DevolucaoState,
  formData: FormData
): Promise<DevolucaoState> {
  const user = await requireCan("operacao");

  const parsed = schema.safeParse({
    em: formData.get("em"),
    odometro: formData.get("odometro"),
    combustivel: formData.get("combustivel"),
    observacao: formData.get("observacao"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  if (d.em.getTime() > Date.now() + 5 * 60 * 1000) {
    return { error: "A devolução não pode estar no futuro." };
  }

  const contrato = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      customer: { select: { name: true } },
      vehicle: { select: SELECT_VEICULO_KM },
    },
  });
  if (!contrato) return { error: "Contrato não encontrado." };

  const r = await encerrarContratoNoBanco(contractId, {
    em: d.em,
    odometro: d.odometro,
    combustivel: d.combustivel,
    observacao: d.observacao,
  });
  if (!r.ok) return { error: r.error };

  if (r.km) {
    await depoisDeAplicarKm({
      veiculo: contrato.vehicle,
      kmAnterior: r.km.anterior,
      kmNova: r.km.nova,
      origem: "contrato",
      user,
      observacao: "devolução",
    });
  }

  await auditar(user, {
    action: "contrato.encerrado",
    entity: "Contract",
    entityId: contractId,
    summary: `Registrou a devolução do ${contrato.vehicle.plate} por ${contrato.customer.name} — ${d.odometro.toLocaleString("pt-BR")} km, tanque ${d.combustivel}`,
  });

  revalidatePath(`/contratos/${contractId}`);
  revalidatePath("/contratos");
  revalidatePath("/veiculos");
  revalidatePath("/motoristas");
  revalidatePath("/quilometragem");
  return { ok: true };
}

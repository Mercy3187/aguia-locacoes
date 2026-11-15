"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { auditar } from "@/lib/audit";
import { formatCurrency } from "@/lib/utils";
import { parseSemana, rotuloSemana, historicoContratosDoVeiculo, motoristaDaSemana } from "@/lib/acerto";

const schema = z.object({
  semana: z.string(),
  vehicleId: z.string().min(1),
  contractId: z.string().min(1).nullable(),
  // Vem de um <input type="number">, então chega como número já convertido.
  valor: z.number().min(0).max(1_000_000),
  pago: z.boolean(),
});

export type EntradaAcerto = z.infer<typeof schema>;

/**
 * Grava a marcação da semana para um carro.
 *
 * É o mesmo caminho para o clique em "Pago" e para a edição do valor: uma
 * linha de acerto é sempre (semana, carro), e gravar as duas coisas juntas
 * evita o estado esquisito de um valor salvo sem saber se foi pago.
 *
 * O motorista NUNCA vem do cliente: é calculado aqui, no servidor, a partir
 * do histórico de contratos do carro — e só na PRIMEIRA vez que a linha é
 * salva. Depois disso fica congelado para sempre (nunca é reescrito), para
 * uma troca de motorista não reescrever quem pagou a semana passada.
 */
export async function salvarAcerto(entrada: EntradaAcerto): Promise<{ error?: string }> {
  const user = await requireCan("financeiro");

  const parsed = schema.safeParse(entrada);
  if (!parsed.success) return { error: "Dados inválidos." };
  const { semana, vehicleId, contractId, valor, pago } = parsed.data;

  const weekStart = parseSemana(semana);
  if (!weekStart) return { error: "Semana inválida." };

  try {
    const atual = await prisma.weeklySettlement.findUnique({
      where: { weekStart_vehicleId: { weekStart, vehicleId } },
      select: { id: true, paid: true, paidAt: true, driverName: true },
    });

    const motoristaCongelado =
      atual?.driverName ??
      motoristaDaSemana(await historicoContratosDoVeiculo(vehicleId), weekStart).motorista;

    const dados = {
      contractId,
      value: valor,
      paid: pago,
      // Só carimba a hora na virada para pago: corrigir o valor de uma linha
      // já paga não pode reescrever quando o dinheiro entrou.
      paidAt: pago ? atual?.paidAt ?? new Date() : null,
    };

    if (atual) {
      await prisma.weeklySettlement.update({ where: { id: atual.id }, data: dados });
    } else {
      await prisma.weeklySettlement.create({
        data: { weekStart, vehicleId, driverName: motoristaCongelado, ...dados },
      });
    }

    if (pago !== (atual?.paid ?? false)) {
      await auditar(user, {
        action: pago ? "acerto.pago" : "acerto.desfeito",
        entity: "WeeklySettlement",
        entityId: vehicleId,
        summary: pago
          ? `Marcou ${motoristaCongelado} como pago na semana de ${rotuloSemana(weekStart)} (${formatCurrency(valor)})`
          : `Desfez o pagamento de ${motoristaCongelado} na semana de ${rotuloSemana(weekStart)}`,
        amount: pago ? valor : null,
      });
    }
  } catch {
    return { error: "Não foi possível salvar. Tente de novo." };
  }

  revalidatePath("/relatorio-pagamentos");
  return {};
}

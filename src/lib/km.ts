import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { computeOil } from "@/lib/oil";
import { conferirKmNova } from "@/lib/km-conferencia";
import { auditar } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Ponto ÚNICO de escrita da quilometragem.
 *
 * A KM atual do carro mora num só lugar (`vehicles.current_km`) e alimenta o
 * óleo, a correia, os alertas e os relatórios. Antes, cada tela que sabia uma
 * KM nova gravava (ou deixava de gravar) por conta própria: a conferência
 * atualizava o carro, mas a troca de óleo e a correia guardavam a KM só no
 * registro delas — e o odômetro do sistema ficava para trás.
 *
 * Toda alteração de KM passa por aqui. Assim, mudar em um lugar vale em todos,
 * o recálculo do óleo nunca é esquecido e fica registrado na auditoria quem
 * mudou, de onde e de quanto para quanto.
 */

/** De onde veio a KM — aparece na trilha de auditoria. */
export type OrigemKm = "conferencia" | "manual" | "veiculo" | "oleo" | "correia" | "contrato";

const ORIGEM_LABEL: Record<OrigemKm, string> = {
  contrato: "odômetro de entrega do contrato",
  conferencia: "conferência do registro do motorista",
  manual: "alteração manual no controle de KM",
  veiculo: "edição do cadastro do veículo",
  oleo: "registro de troca de óleo",
  correia: "registro de troca da correia",
};

/** Telas que mostram KM, óleo, correia ou status do carro. */
const ROTAS_AFETADAS = [
  "/quilometragem",
  "/quilometragem/registros",
  "/veiculos",
  "/oleo",
  "/correia",
  "/manutencao",
  "/motoristas",
  "/alertas",
  "/dashboard",
] as const;

export type ResultadoKm =
  /** Aplicada. `alterou` é falso quando o número era o mesmo que já estava lá. */
  | { ok: true; kmAnterior: number; kmNova: number; alterou: boolean }
  /** Recusada — o texto vai direto para a tela. */
  | { ok: false; error: string }
  /**
   * Vai fazer o odômetro andar para trás. Não grava; devolve o aviso para a
   * tela perguntar, e a mesma chamada volta com `confirmado: true`.
   */
  | { ok: false; confirmar: string; kmAtual: number; kmNova: number };

/** Campos do veículo que a escrita da KM precisa conhecer. */
export type VeiculoParaKm = {
  id: string;
  plate: string;
  currentKm: number;
  lastOilChangeKm: number | null;
  oilChangeIntervalKm: number;
};

export const SELECT_VEICULO_KM = {
  id: true,
  plate: true,
  currentKm: true,
  lastOilChangeKm: true,
  oilChangeIntervalKm: true,
} as const;

/**
 * Grava a KM e o recálculo do óleo no veículo.
 *
 * Aceita a transação de quem chama para que a KM entre junto com o registro
 * que a originou (a conferência, a troca de óleo) — ou tudo grava, ou nada.
 * A correia não tem campo a atualizar: o quanto falta é calculado na hora de
 * mostrar a tela, a partir desta KM.
 */
export async function escreverKm(
  tx: Prisma.TransactionClient,
  veiculo: VeiculoParaKm,
  novaKm: number
): Promise<void> {
  const oil = computeOil(novaKm, veiculo.lastOilChangeKm, veiculo.oilChangeIntervalKm);
  await tx.vehicle.update({
    where: { id: veiculo.id },
    data: { currentKm: novaKm, ...oil },
  });
}

/**
 * O que sempre acontece DEPOIS de a KM entrar no banco: trilha de auditoria e
 * atualização das telas que mostram esse número.
 *
 * Fica separado de `escreverKm` porque roda fora da transação — a auditoria
 * não pode segurar (nem derrubar) a gravação.
 */
export async function depoisDeAplicarKm(params: {
  veiculo: VeiculoParaKm;
  kmAnterior: number;
  kmNova: number;
  origem: OrigemKm;
  user: SessionUser;
  observacao?: string | null;
}): Promise<void> {
  const { veiculo, kmAnterior, kmNova, origem, user } = params;

  await auditar(user, {
    action: "km.alterada",
    entity: "Vehicle",
    entityId: veiculo.id,
    summary:
      `KM do ${veiculo.plate}: ${kmAnterior.toLocaleString("pt-BR")} → ` +
      `${kmNova.toLocaleString("pt-BR")} km (${ORIGEM_LABEL[origem]})` +
      (params.observacao ? ` — ${params.observacao}` : ""),
    metadata: { kmAnterior, kmNova, origem, plate: veiculo.plate },
  });

  for (const rota of ROTAS_AFETADAS) revalidatePath(rota);
}

/**
 * Aplica uma KM nova a um veículo, do começo ao fim.
 *
 * Use nas telas em que a KM é o único assunto (alteração manual, cadastro do
 * veículo). Quando a KM entra junto de outro registro — a conferência, uma
 * troca de óleo — use `conferirKmNova` + `escreverKm` dentro da transação
 * daquele fluxo e chame `depoisDeAplicarKm` no fim.
 */
export async function aplicarKm(params: {
  vehicleId: string;
  novaKm: number;
  origem: OrigemKm;
  user: SessionUser;
  /** `true` quando o usuário já confirmou que quer mesmo baixar a KM. */
  confirmado?: boolean;
  observacao?: string | null;
}): Promise<ResultadoKm> {
  const veiculo = await prisma.vehicle.findUnique({
    where: { id: params.vehicleId },
    select: SELECT_VEICULO_KM,
  });
  if (!veiculo) return { ok: false, error: "Veículo não encontrado." };

  const novaKm = Math.trunc(params.novaKm);
  const check = conferirKmNova({
    novaKm,
    kmAtual: veiculo.currentKm,
    plate: veiculo.plate,
    confirmado: params.confirmado,
  });

  if (!check.ok) {
    if ("confirmar" in check) {
      return {
        ok: false,
        confirmar: check.confirmar,
        kmAtual: veiculo.currentKm,
        kmNova: novaKm,
      };
    }
    return check;
  }

  // Mesmo número: não grava nem polui a auditoria com uma "alteração" que não
  // alterou nada. Para quem chamou, o efeito é o mesmo — a KM vale.
  if (novaKm === veiculo.currentKm) {
    return { ok: true, kmAnterior: veiculo.currentKm, kmNova: novaKm, alterou: false };
  }

  const kmAnterior = veiculo.currentKm;
  try {
    await prisma.$transaction(async (tx) => {
      await escreverKm(tx, veiculo, novaKm);
    });
  } catch {
    return { ok: false, error: "Não foi possível salvar a quilometragem. Tente novamente." };
  }

  await depoisDeAplicarKm({
    veiculo,
    kmAnterior,
    kmNova: novaKm,
    origem: params.origem,
    user: params.user,
    observacao: params.observacao,
  });

  return { ok: true, kmAnterior, kmNova: novaKm, alterou: true };
}

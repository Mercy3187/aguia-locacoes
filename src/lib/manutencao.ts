import { prisma } from "@/lib/prisma";

/**
 * Números da tela de manutenção.
 *
 * O gasto se divide em duas linhas: carros da FROTA e manutenção AVULSA
 * (carro que não é da frota). O avulso fica separado para o número da frota
 * conseguir responder "quanto gastei com os carros que eu alugo" sem ele no
 * meio.
 *
 * Manutenção CANCELADA nunca entra em nenhuma conta: não houve gasto.
 */

export const CATEGORIAS = ["FROTA", "AVULSO"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const CATEGORIA_LABEL: Record<Categoria, string> = {
  FROTA: "Carros da frota",
  AVULSO: "Avulsos",
};

/**
 * Manutenção em carro que não é da frota.
 *
 * `vehicleId` nulo é a marca — não existe linha em `vehicles` para o carro
 * avulso, de propósito (veja o comentário no schema).
 */
export function ehAvulsa(m: { vehicleId: string | null }): boolean {
  return m.vehicleId == null;
}

/**
 * Como o carro da manutenção é identificado na tela e na auditoria.
 *
 * Uma função só para os dois casos porque, fora daqui, ninguém deveria
 * precisar lembrar de onde vem a placa: da frota ou do texto livre do avulso.
 */
export function carroDaManutencao(m: {
  vehicleId: string | null;
  avulsoPlate: string | null;
  avulsoModel: string | null;
  vehicle?: { plate: string; model?: string | null } | null;
}): { placa: string; modelo: string | null; avulso: boolean } {
  if (ehAvulsa(m)) {
    return {
      // O schema exige placa OU modelo; quando só veio o modelo, ele ocupa a
      // linha da placa para a manutenção não aparecer sem identificação.
      placa: m.avulsoPlate?.trim() || m.avulsoModel?.trim() || "Sem identificação",
      modelo: m.avulsoPlate?.trim() ? (m.avulsoModel?.trim() ?? null) : null,
      avulso: true,
    };
  }
  return {
    placa: m.vehicle?.plate ?? "—",
    modelo: m.vehicle?.model ?? null,
    avulso: false,
  };
}

/** Em que linha do painel o gasto entra. */
export function categoriaDaManutencao(m: { vehicleId: string | null }): Categoria {
  return ehAvulsa(m) ? "AVULSO" : "FROTA";
}

const dinheiro = (v: unknown): number => (v == null ? 0 : Number(v));

// ── Peça e mão de obra ────────────────────────────────────────────────
// A conta em si mora em `manutencao-custo.ts`, que não toca no banco e por
// isso pode ser testado sozinho. Re-exportada aqui para as telas continuarem
// importando tudo de "@/lib/manutencao".
export {
  custoTotal,
  temDetalhamento,
  somarPecaMaoDeObra,
  type GastoPecaMaoDeObra,
} from "@/lib/manutencao-custo";

/** Um mês do gráfico. `valores` é indexado pela chave da série. */
export type MesManutencao = {
  chave: string;
  rotulo: string;
  valores: Record<string, number>;
  total: number;
};

export type ResumoManutencao = {
  /** Gasto por linha do painel (manutenções não canceladas). */
  porCategoria: Record<Categoria, { total: number; quantidade: number }>;
  total: number;
  /** Últimos meses, do mais antigo para o mais novo. */
  meses: MesManutencao[];
};

/** Rótulo curto do mês ("ago/26"). */
function rotuloMes(ano: number, mes: number): string {
  const nomes = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  return `${nomes[mes - 1]}/${String(ano).slice(2)}`;
}

export async function getResumoManutencao(mesesAtras = 6): Promise<ResumoManutencao> {
  // Só o que representa gasto de verdade.
  const registros = await prisma.maintenance.findMany({
    where: { status: { not: "CANCELADA" } },
    select: {
      cost: true,
      startAt: true,
      vehicleId: true,
    },
  });

  const porCategoria: Record<Categoria, { total: number; quantidade: number }> = {
    FROTA: { total: 0, quantidade: 0 },
    AVULSO: { total: 0, quantidade: 0 },
  };

  // Esqueleto dos últimos N meses, para o gráfico ter mês vazio no lugar certo
  // em vez de pular o mês sem manutenção.
  const agora = new Date();
  const balde = new Map<string, Record<string, number>>();
  const ordem: { chave: string; rotulo: string }[] = [];
  for (let i = mesesAtras - 1; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    balde.set(chave, { frota: 0, avulso: 0 });
    ordem.push({ chave, rotulo: rotuloMes(d.getFullYear(), d.getMonth() + 1) });
  }

  for (const m of registros) {
    const custo = dinheiro(m.cost);
    const categoria = categoriaDaManutencao(m);

    porCategoria[categoria].total += custo;
    porCategoria[categoria].quantidade += 1;

    const chave = `${m.startAt.getFullYear()}-${String(m.startAt.getMonth() + 1).padStart(2, "0")}`;
    const alvo = balde.get(chave);
    if (alvo) {
      if (categoria === "AVULSO") alvo.avulso += custo;
      else alvo.frota += custo;
    }
  }

  const meses: MesManutencao[] = ordem.map(({ chave, rotulo }) => {
    const valores = balde.get(chave)!;
    return {
      chave,
      rotulo,
      valores,
      total: valores.frota + valores.avulso,
    };
  });

  return {
    porCategoria,
    total: porCategoria.FROTA.total + porCategoria.AVULSO.total,
    meses,
  };
}

import { prisma } from "@/lib/prisma";
import {
  calcularCorreia,
  type CalculoCorreia,
  type CorreiaStatus,
} from "@/lib/correia";

/**
 * Monta o painel da correia dentada a partir do banco.
 *
 * Separado de `correia.ts` porque este arquivo toca o Prisma e, portanto, só
 * pode rodar no servidor.
 */

/** Quanto tempo para trás olhamos para medir o ritmo de rodagem. */
const JANELA_RITMO_DIAS = 180;

export type LinhaCorreia = {
  id: string;
  plate: string;
  model: string | null;
  ownerName: string | null;
  currentKm: number;
  lastTimingBeltKm: number | null;
  lastTimingBeltAt: Date | null;
  intervaloKm: number;
  notas: string | null;
  calculo: CalculoCorreia;
  /** Média de km por dia, medida pelas comprovações de KM. Nulo = sem base. */
  kmPorDia: number | null;
  /** Data estimada da troca. Nulo quando não dá para projetar. */
  previsao: Date | null;
  /** Dias até a troca, pela média atual. */
  diasAteTroca: number | null;
  /** Quando o motorista comprovou a KM pela última vez. */
  ultimaLeituraEm: Date | null;
};

/**
 * Ritmo de rodagem de cada carro, em km/dia.
 *
 * Sai das próprias comprovações de KM: pega a primeira e a última leitura da
 * janela e divide a diferença pelos dias entre elas. Com uma leitura só (ou
 * nenhuma) não há como medir ritmo, e o veículo fica sem previsão — melhor não
 * mostrar data nenhuma do que mostrar uma inventada.
 */
async function ritmoPorVeiculo(): Promise<
  Map<string, { kmPorDia: number | null; ultimaEm: Date | null }>
> {
  const desde = new Date();
  desde.setDate(desde.getDate() - JANELA_RITMO_DIAS);

  const registros = await prisma.kmRecord.findMany({
    // Só leitura já conferida entra na conta. Um envio ainda pendente pode ter
    // número errado, e um ritmo calculado em cima dele produziria previsão
    // errada — justamente o que o controle deveria evitar.
    where: { createdAt: { gte: desde }, appliedAt: { not: null } },
    select: {
      vehicleId: true,
      informedKm: true,
      correctedKm: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const porVeiculo = new Map<string, { km: number; em: Date }[]>();
  for (const r of registros) {
    const lista = porVeiculo.get(r.vehicleId) ?? [];
    // Vale o valor corrigido na conferência, quando houve correção.
    lista.push({ km: r.correctedKm ?? r.informedKm, em: r.createdAt });
    porVeiculo.set(r.vehicleId, lista);
  }

  const saida = new Map<string, { kmPorDia: number | null; ultimaEm: Date | null }>();
  for (const [vehicleId, leituras] of porVeiculo) {
    const ultima = leituras[leituras.length - 1];
    if (leituras.length < 2) {
      saida.set(vehicleId, { kmPorDia: null, ultimaEm: ultima.em });
      continue;
    }
    const primeira = leituras[0];
    const dias = (ultima.em.getTime() - primeira.em.getTime()) / 86_400_000;
    const rodado = ultima.km - primeira.km;
    // Odômetro que andou para trás (foto trocada, digitação errada) não vira
    // ritmo negativo — simplesmente não dá base para projetar.
    const kmPorDia = dias >= 1 && rodado > 0 ? rodado / dias : null;
    saida.set(vehicleId, { kmPorDia, ultimaEm: ultima.em });
  }
  return saida;
}

export type PainelCorreia = {
  linhas: LinhaCorreia[];
  contagem: Record<CorreiaStatus, number>;
  /** Quantos carros da frota entram no controle. */
  total: number;
};

export async function getPainelCorreia(): Promise<PainelCorreia> {
  const [veiculos, ritmo] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status: { not: "VENDIDO" } },
      select: {
        id: true,
        plate: true,
        model: true,
        ownerName: true,
        currentKm: true,
        lastTimingBeltKm: true,
        lastTimingBeltAt: true,
        timingBeltIntervalKm: true,
        timingBeltNotes: true,
      },
      orderBy: { plate: "asc" },
    }),
    ritmoPorVeiculo(),
  ]);

  const contagem: Record<CorreiaStatus, number> = {
    SEM_REGISTRO: 0,
    EM_DIA: 0,
    PROXIMA: 0,
    VENCIDA: 0,
  };

  const linhas: LinhaCorreia[] = veiculos.map((v) => {
    const calculo = calcularCorreia(
      v.currentKm,
      v.lastTimingBeltKm,
      v.timingBeltIntervalKm
    );
    contagem[calculo.status] += 1;

    const r = ritmo.get(v.id);
    const kmPorDia = r?.kmPorDia ?? null;

    let previsao: Date | null = null;
    let diasAteTroca: number | null = null;
    if (kmPorDia && calculo.faltamKm != null && calculo.faltamKm > 0) {
      diasAteTroca = Math.round(calculo.faltamKm / kmPorDia);
      previsao = new Date();
      previsao.setDate(previsao.getDate() + diasAteTroca);
    } else if (calculo.faltamKm != null && calculo.faltamKm <= 0) {
      // Já passou: a data é "agora", não uma projeção.
      diasAteTroca = 0;
    }

    return {
      id: v.id,
      plate: v.plate,
      model: v.model,
      ownerName: v.ownerName,
      currentKm: v.currentKm,
      lastTimingBeltKm: v.lastTimingBeltKm,
      lastTimingBeltAt: v.lastTimingBeltAt,
      intervaloKm: v.timingBeltIntervalKm,
      notas: v.timingBeltNotes,
      calculo,
      kmPorDia,
      previsao,
      diasAteTroca,
      ultimaLeituraEm: r?.ultimaEm ?? null,
    };
  });

  // Ordem de urgência: vencida primeiro, depois o que está mais perto de
  // vencer; quem não tem registro fica no fim, para não empurrar para baixo
  // um carro que realmente precisa de correia agora.
  const PESO: Record<CorreiaStatus, number> = {
    VENCIDA: 0,
    PROXIMA: 1,
    EM_DIA: 2,
    SEM_REGISTRO: 3,
  };
  linhas.sort((a, b) => {
    const p = PESO[a.calculo.status] - PESO[b.calculo.status];
    if (p !== 0) return p;
    const fa = a.calculo.faltamKm ?? Number.POSITIVE_INFINITY;
    const fb = b.calculo.faltamKm ?? Number.POSITIVE_INFINITY;
    return fa - fb;
  });

  return { linhas, contagem, total: linhas.length };
}

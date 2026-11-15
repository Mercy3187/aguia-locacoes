import { prisma } from "@/lib/prisma";
import { isPaid, isOverdue, isOpen } from "@/lib/asaas";

/**
 * Números do dashboard que vêm do dinheiro de verdade (cobranças do Asaas),
 * e não de estimativa.
 *
 * A unidade de tempo aqui é a SEMANA, não o mês: os contratos são semanais
 * (cada motorista paga por semana), então é em cima da semana que dá para
 * comparar o que entrou com o que deveria ter entrado. Agregar por mês
 * embaralha quatro ciclos num número só e esconde a semana ruim.
 */

const DIA_MS = 86_400_000;

/** Segunda-feira da semana daquela data, à meia-noite. */
function inicioDaSemana(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const diaDaSemana = (x.getDay() + 6) % 7; // 0 = segunda
  x.setDate(x.getDate() - diaDaSemana);
  return x;
}

/** Rótulo curto da semana: o dia da segunda-feira ("18/08"). */
function rotuloSemana(inicio: Date): string {
  const dd = String(inicio.getDate()).padStart(2, "0");
  const mm = String(inicio.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

export type SemanaReceita = {
  chave: string;
  rotulo: string;
  recebido: number;
  /** A semana corrente ainda não terminou — a barra está incompleta. */
  emCurso: boolean;
};

export type Inadimplente = {
  customerId: string;
  nome: string;
  valor: number;
  cobrancas: number;
  /** Dias de atraso da cobrança mais antiga. */
  diasAtraso: number;
};

export type PainelFinanceiro = {
  semanas: SemanaReceita[];
  /** Soma do valor semanal dos contratos ativos — o esperado por semana. */
  metaSemanal: number;
  estaSemana: number;
  semanaPassada: number;
  carteira: { recebido: number; aVencer: number; atrasado: number };
  proximos7Dias: { valor: number; cobrancas: number };
  atrasado: { valor: number; cobrancas: number; motoristas: number };
  inadimplentes: Inadimplente[];
  frota: { alugado: number; disponivel: number; manutencao: number; outros: number };
  /** Veículos por receita REALMENTE recebida (não estimada). */
  ranking: { plate: string; model: string | null; recebido: number }[];
};

const SEMANAS = 8;

export async function getPainelFinanceiro(): Promise<PainelFinanceiro> {
  const agora = new Date();
  const semanaAtual = inicioDaSemana(agora);
  const desde = new Date(semanaAtual.getTime() - (SEMANAS - 1) * 7 * DIA_MS);

  const [pagamentos, recebidosRecentes, ativos, veiculos] = await Promise.all([
    // Carteira inteira: precisa de todos para separar recebido/a vencer/atrasado.
    prisma.payment.findMany({
      select: {
        value: true,
        status: true,
        dueDate: true,
        paymentDate: true,
        customerId: true,
        customer: { select: { name: true } },
      },
    }),
    // Só o que foi pago dentro da janela do gráfico, com o veículo junto.
    prisma.payment.findMany({
      where: { paymentDate: { gte: desde } },
      select: {
        value: true,
        status: true,
        paymentDate: true,
        plate: true,
        contract: { select: { vehicle: { select: { plate: true, model: true } } } },
      },
    }),
    prisma.contract.findMany({
      where: { status: "ATIVO" },
      select: { weeklyValue: true },
    }),
    prisma.vehicle.groupBy({ by: ["status"], _count: true }),
  ]);

  // ── Carteira ────────────────────────────────────────────────────────
  let recebido = 0;
  let aVencer = 0;
  let atrasadoValor = 0;
  let atrasadoQtd = 0;
  let proximos7Valor = 0;
  let proximos7Qtd = 0;

  const limite7 = new Date(agora.getTime() + 7 * DIA_MS);
  const porCliente = new Map<string, Inadimplente>();

  for (const p of pagamentos) {
    const valor = Number(p.value);

    if (isPaid(p.status)) {
      recebido += valor;
      continue;
    }
    if (isOverdue(p.status)) {
      atrasadoValor += valor;
      atrasadoQtd += 1;
      if (p.customerId) {
        const dias = Math.max(
          0,
          Math.floor((agora.getTime() - p.dueDate.getTime()) / DIA_MS)
        );
        const atual = porCliente.get(p.customerId) ?? {
          customerId: p.customerId,
          nome: p.customer?.name ?? "Sem nome",
          valor: 0,
          cobrancas: 0,
          diasAtraso: 0,
        };
        atual.valor += valor;
        atual.cobrancas += 1;
        atual.diasAtraso = Math.max(atual.diasAtraso, dias);
        porCliente.set(p.customerId, atual);
      }
      continue;
    }
    if (isOpen(p.status)) {
      aVencer += valor;
      if (p.dueDate >= agora && p.dueDate <= limite7) {
        proximos7Valor += valor;
        proximos7Qtd += 1;
      }
    }
  }

  // ── Recebido por semana ─────────────────────────────────────────────
  const baldes = new Map<string, number>();
  const ordem: { chave: string; rotulo: string; inicio: Date }[] = [];
  for (let i = SEMANAS - 1; i >= 0; i--) {
    const inicio = new Date(semanaAtual.getTime() - i * 7 * DIA_MS);
    const chave = inicio.toISOString().slice(0, 10);
    baldes.set(chave, 0);
    ordem.push({ chave, rotulo: rotuloSemana(inicio), inicio });
  }

  const porVeiculo = new Map<string, { plate: string; model: string | null; recebido: number }>();

  for (const p of recebidosRecentes) {
    if (!isPaid(p.status) || !p.paymentDate) continue;
    const valor = Number(p.value);

    const chave = inicioDaSemana(p.paymentDate).toISOString().slice(0, 10);
    if (baldes.has(chave)) baldes.set(chave, baldes.get(chave)! + valor);

    const placa = p.contract?.vehicle.plate ?? p.plate;
    if (placa) {
      const atual = porVeiculo.get(placa) ?? {
        plate: placa,
        model: p.contract?.vehicle.model ?? null,
        recebido: 0,
      };
      atual.recebido += valor;
      porVeiculo.set(placa, atual);
    }
  }

  const chaveAtual = semanaAtual.toISOString().slice(0, 10);
  const semanas: SemanaReceita[] = ordem.map((o) => ({
    chave: o.chave,
    rotulo: o.rotulo,
    recebido: baldes.get(o.chave) ?? 0,
    emCurso: o.chave === chaveAtual,
  }));

  const estaSemana = semanas[semanas.length - 1]?.recebido ?? 0;
  const semanaPassada = semanas[semanas.length - 2]?.recebido ?? 0;

  // ── Frota ───────────────────────────────────────────────────────────
  const contaStatus = (s: string) =>
    veiculos.find((v) => v.status === s)?._count ?? 0;
  const totalVeiculos = veiculos.reduce((s, v) => s + v._count, 0);
  const alugado = contaStatus("ALUGADO");
  const disponivel = contaStatus("DISPONIVEL");
  const manutencao = contaStatus("MANUTENCAO");

  return {
    semanas,
    metaSemanal: ativos.reduce((s, c) => s + Number(c.weeklyValue ?? 0), 0),
    estaSemana,
    semanaPassada,
    carteira: { recebido, aVencer, atrasado: atrasadoValor },
    proximos7Dias: { valor: proximos7Valor, cobrancas: proximos7Qtd },
    atrasado: {
      valor: atrasadoValor,
      cobrancas: atrasadoQtd,
      motoristas: porCliente.size,
    },
    inadimplentes: [...porCliente.values()]
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 6),
    frota: {
      alugado,
      disponivel,
      manutencao,
      outros: totalVeiculos - alugado - disponivel - manutencao,
    },
    ranking: [...porVeiculo.values()]
      .sort((a, b) => b.recebido - a.recebido)
      .slice(0, 6),
  };
}

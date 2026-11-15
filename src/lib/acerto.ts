import { prisma } from "@/lib/prisma";
import { EMPRESA } from "@/lib/empresa";

export type LinhaAcerto = {
  /** Posição na lista da semana — é o número que sai no relatório. */
  numero: number;
  vehicleId: string;
  contractId: string | null;
  plate: string;
  modelo: string;
  motorista: string;
  valor: number;
  pago: boolean;
  pagoEm: Date | null;
  /** Houve troca de motorista NO MEIO desta semana, segundo o histórico de contratos do carro. */
  trocouNoMeioDaSemana: boolean;
  /** Quem estava com o carro antes da troca, só quando `trocouNoMeioDaSemana` é true. */
  motoristaAnterior: string | null;
};

export type AcertoSemana = {
  /** Segunda-feira da semana, como data pura (meia-noite UTC). */
  semana: Date;
  linhas: LinhaAcerto[];
  recebido: number;
  aReceber: number;
};

// ─────────────────────────────────────────────────────────────
// A SEMANA
// ─────────────────────────────────────────────────────────────

const BRT = "America/Sao_Paulo";

const YMD_BRT = new Intl.DateTimeFormat("sv-SE", {
  timeZone: BRT,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Lê a chave da semana como calendário (UTC), não como instante. */
const DATA_UTC = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

const DIA_SEMANA_UTC = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC",
  weekday: "long",
});

/**
 * Segunda-feira da semana de `ref`, como data pura (meia-noite UTC).
 *
 * O dia de referência é o de Brasília — às 22h de domingo aqui já é segunda em
 * Londres, e o acerto não pode pular de semana por causa disso. Já a chave em
 * si fica em UTC de propósito: ela é calendário, não instante, e assim não
 * escorrega para o domingo quando o banco devolve o registro.
 */
export function segundaDaSemana(ref: Date = new Date()): Date {
  const [a, m, d] = YMD_BRT.format(ref).split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d));
  // getUTCDay(): 0 = domingo. O resto põe a segunda na posição 0.
  dia.setUTCDate(dia.getUTCDate() - ((dia.getUTCDay() + 6) % 7));
  return dia;
}

/** Chave da semana na URL: "2026-09-14". */
export function chaveSemana(semana: Date): string {
  return semana.toISOString().slice(0, 10);
}

/** Lê a chave vinda da URL. Devolve `null` se não for uma data válida. */
export function parseSemana(valor: string | undefined): Date | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Aceita qualquer dia digitado na URL, mas sempre ancora na segunda.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

/** "14/09/2026". */
export function rotuloSemana(semana: Date): string {
  return DATA_UTC.format(semana);
}

/** "Segunda 14/09/2026" — como aparece no cabeçalho do relatório. */
export function rotuloSemanaLongo(semana: Date): string {
  const dia = DIA_SEMANA_UTC.format(semana).replace(/-feira$/, "");
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${rotuloSemana(semana)}`;
}

/** As últimas `n` segundas, da mais recente para a mais antiga. */
export function semanasRecentes(
  n = 12,
  ref: Date = new Date()
): { valor: string; label: string }[] {
  const base = segundaDaSemana(ref);
  const out: { valor: string; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const inicio = new Date(base);
    inicio.setUTCDate(inicio.getUTCDate() - i * 7);
    const fim = new Date(inicio);
    fim.setUTCDate(fim.getUTCDate() + 6);
    out.push({
      valor: chaveSemana(inicio),
      label: `${rotuloSemana(inicio)} a ${rotuloSemana(fim)}${i === 0 ? " · semana atual" : ""}`,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// QUEM ESTAVA COM O CARRO, SEMANA A SEMANA
// ─────────────────────────────────────────────────────────────

/** Um contrato do veículo, qualquer status — para reconstruir quem tinha o carro numa semana passada. */
export type ContratoDoHistorico = { customerName: string; startDate: Date };

export type MotoristaDaSemana = {
  motorista: string;
  trocouNoMeioDaSemana: boolean;
  motoristaAnterior: string | null;
};

/**
 * Quem estava com o carro numa semana específica, a partir do HISTÓRICO de
 * contratos do veículo (qualquer status) — nunca o contrato ativo hoje.
 *
 * Sem isso, trocar o motorista (encerra o contrato antigo, gera um novo)
 * reescreveria silenciosamente o motorista de semanas JÁ PASSADAS no
 * relatório, porque a tela leria direto do contrato ativo.
 *
 * O motorista da semana é o do contrato com o `startDate` mais recente que
 * já tinha começado até o fim daquela semana (domingo). Se algum contrato
 * começou DEPOIS da segunda-feira e até o domingo da mesma semana, houve
 * troca no meio dela — o motorista anterior some do relatório se ninguém
 * for avisado, por isso o aviso.
 */
export function motoristaDaSemana(
  historico: ContratoDoHistorico[],
  weekStart: Date
): MotoristaDaSemana {
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  const ordenado = historico
    .filter((c) => c.startDate.getTime() <= weekEnd.getTime())
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  if (ordenado.length === 0) {
    return { motorista: "—", trocouNoMeioDaSemana: false, motoristaAnterior: null };
  }

  const atual = ordenado[ordenado.length - 1];
  const anterior = ordenado.length > 1 ? ordenado[ordenado.length - 2] : null;

  // Troca "no meio" = o contrato que vale no fim da semana não começou na
  // própria segunda — começou um dia qualquer depois dela, dentro da semana.
  const trocouNoMeioDaSemana = atual.startDate.getTime() > weekStart.getTime();

  return {
    motorista: atual.customerName,
    trocouNoMeioDaSemana,
    motoristaAnterior: trocouNoMeioDaSemana ? anterior?.customerName ?? null : null,
  };
}

/** Histórico de contratos (qualquer status) de UM veículo — usado ao congelar o motorista na primeira vez que a linha é salva. */
export async function historicoContratosDoVeiculo(vehicleId: string): Promise<ContratoDoHistorico[]> {
  const contratos = await prisma.contract.findMany({
    where: { vehicleId },
    select: { startDate: true, customer: { select: { name: true } } },
  });
  return contratos.map((c) => ({ customerName: c.customer.name, startDate: c.startDate }));
}

// ─────────────────────────────────────────────────────────────
// OS DADOS
// ─────────────────────────────────────────────────────────────

/**
 * Monta o acerto da semana: um carro alugado por linha, já com a marcação de
 * pago que existir.
 *
 * A lista sai dos contratos ativos, não da tabela de acerto — carro novo na
 * frota aparece sozinho na segunda seguinte, sem ninguém precisar cadastrar.
 */
export async function carregarAcerto(semana: Date): Promise<AcertoSemana> {
  const [contratos, registros] = await Promise.all([
    prisma.contract.findMany({
      where: { status: "ATIVO", vehicle: { status: { not: "VENDIDO" } } },
      select: {
        id: true,
        weeklyValue: true,
        customer: { select: { name: true } },
        vehicle: { select: { id: true, plate: true, model: true } },
      },
    }),
    prisma.weeklySettlement.findMany({ where: { weekStart: semana } }),
  ]);

  const veiculoIds = [...new Set(contratos.map((c) => c.vehicle.id))];
  const historicoBruto =
    veiculoIds.length > 0
      ? await prisma.contract.findMany({
          where: { vehicleId: { in: veiculoIds } },
          select: { vehicleId: true, startDate: true, customer: { select: { name: true } } },
        })
      : [];
  const historicoPorVeiculo = new Map<string, ContratoDoHistorico[]>();
  for (const c of historicoBruto) {
    const lista = historicoPorVeiculo.get(c.vehicleId) ?? [];
    lista.push({ customerName: c.customer.name, startDate: c.startDate });
    historicoPorVeiculo.set(c.vehicleId, lista);
  }

  const porVeiculo = new Map(registros.map((r) => [r.vehicleId, r]));

  const linhas: LinhaAcerto[] = contratos
    // Dois contratos ativos no mesmo carro seria erro de cadastro, mas se
    // acontecer o acerto é do carro: uma linha só, não duas cobranças.
    .filter((c, i, arr) => arr.findIndex((y) => y.vehicle.id === c.vehicle.id) === i)
    .sort((a, b) =>
      `${a.vehicle.model ?? ""}${a.vehicle.plate}`.localeCompare(
        `${b.vehicle.model ?? ""}${b.vehicle.plate}`,
        "pt-BR"
      )
    )
    .map((c, i) => {
      const reg = porVeiculo.get(c.vehicle.id);
      const historico = historicoPorVeiculo.get(c.vehicle.id) ?? [];
      const { motorista: motoristaDaHistoria, trocouNoMeioDaSemana, motoristaAnterior } =
        motoristaDaSemana(historico, semana);
      return {
        numero: i + 1,
        vehicleId: c.vehicle.id,
        contractId: c.id,
        plate: c.vehicle.plate,
        modelo: c.vehicle.model ?? c.vehicle.plate,
        // Semana já acertada (reg existe) = motorista CONGELADO naquele
        // momento, nunca reescrito. Semana ainda em aberto = reconstrói do
        // histórico de contratos, não do contrato ativo de hoje.
        motorista: reg?.driverName ?? motoristaDaHistoria,
        // O valor gravado no acerto manda: é por ele que passa a semana com
        // desconto de manutenção ou com multa de KM somada.
        valor: Number(reg?.value ?? c.weeklyValue ?? 0),
        pago: reg?.paid ?? false,
        pagoEm: reg?.paidAt ?? null,
        trocouNoMeioDaSemana,
        motoristaAnterior,
      };
    });

  return {
    semana,
    linhas,
    recebido: linhas.filter((l) => l.pago).reduce((s, l) => s + l.valor, 0),
    aReceber: linhas.filter((l) => !l.pago).reduce((s, l) => s + l.valor, 0),
  };
}

// ─────────────────────────────────────────────────────────────
// O RELATÓRIO
// ─────────────────────────────────────────────────────────────

const MOEDA_COM_CENTAVOS = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
});
const MOEDA_REDONDA = new Intl.NumberFormat("pt-BR");

/**
 * "R$ 650" / "R$ 1.234,50".
 *
 * Centavos só aparecem quando existem: no acerto quase todo valor é redondo, e
 * uma coluna de ",00" no WhatsApp só ocupa espaço.
 */
function brl(n: number): string {
  return `R$ ${(Number.isInteger(n) ? MOEDA_REDONDA : MOEDA_COM_CENTAVOS).format(n)}`;
}

const REGUA = "━━━━━━━━━━━━━━━";

const CARIMBO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BRT,
  dateStyle: "short",
  timeStyle: "short",
});

/**
 * O acerto da semana formatado para colar no WhatsApp.
 *
 * A numeração é a da lista inteira, não a de cada bloco: quem recebe o
 * relatório toda segunda reconhece o carro pelo número, e ele não pode mudar
 * só porque o motorista pagou.
 */
export function relatorioAcertoWhatsApp(
  acerto: AcertoSemana,
  agora: Date = new Date()
): string {
  const pagos = acerto.linhas.filter((l) => l.pago);
  const pendentes = acerto.linhas.filter((l) => !l.pago);

  const out = [
    "╭━━━━━━━━━━━━━━━",
    "┃ 🚗 ACERTO SEMANAL",
    `┃ 📅 Acerto · ${rotuloSemanaLongo(acerto.semana)}`,
    "╰━━━━━━━━━━━━━━━",
  ];

  const linhaMotorista = (l: LinhaAcerto) =>
    `   👤 ${l.motorista}${l.trocouNoMeioDaSemana ? " ⚠️ trocou no meio da semana" : ""}`;

  if (pagos.length) {
    out.push("", `✅ PAGOS (${pagos.length})`, REGUA);
    pagos.forEach((l, i) => {
      out.push(`${l.numero}. ${l.modelo} · ${l.plate}`, linhaMotorista(l), `   💵 ${brl(l.valor)}`);
      if (i < pagos.length - 1) out.push("");
    });
  }

  if (pendentes.length) {
    out.push("", `⏳ PENDENTES (${pendentes.length})`, REGUA);
    for (const l of pendentes) {
      out.push(`${l.numero}. ${l.modelo} · ${l.plate}`, linhaMotorista(l));
    }
  }

  out.push("", "📊 RESUMO", REGUA, `💰 Recebido: ${brl(acerto.recebido)}`);
  if (acerto.aReceber > 0) out.push(`⏳ A receber: ${brl(acerto.aReceber)}`);
  out.push(REGUA, `${EMPRESA.nome} · ${CARIMBO.format(agora)}`);

  return out.join("\n");
}

/**
 * Regras da tela "Gerar Contrato" — puras, sem banco, para a tela e a server
 * action usarem a mesma conta.
 *
 * O que sai daqui:
 *   • as opções dos campos de seleção do formulário;
 *   • o equivalente SEMANAL do valor do período (o resto do sistema — acerto
 *     semanal, rendimento, inadimplência — trabalha por semana);
 *   • o cronograma das faturas. Hoje ele só é mostrado; quando a chave do
 *     Asaas estiver configurada, cada linha vira um boleto no nome do cliente.
 */

export const PERIODOS = ["DIAS", "SEMANAS", "QUINZENAS", "MESES"] as const;
export type Periodo = (typeof PERIODOS)[number];

export const PERIODO_LABEL: Record<Periodo, string> = {
  DIAS: "DIAS",
  SEMANAS: "SEMANAS",
  QUINZENAS: "QUINZENAS",
  MESES: "MESES",
};

/** Nome de UM período, para frases como "valor por semana". */
export const PERIODO_SINGULAR: Record<Periodo, string> = {
  DIAS: "dia",
  SEMANAS: "semana",
  QUINZENAS: "quinzena",
  MESES: "mês",
};

export const FATURAMENTO = ["ANTECIPADO", "POSTECIPADO"] as const;
export type Faturamento = (typeof FATURAMENTO)[number];

export const FATURAMENTO_LABEL: Record<Faturamento, string> = {
  ANTECIPADO: "NO INÍCIO DO PERÍODO (ANTECIPADO)",
  POSTECIPADO: "NO FIM DO PERÍODO (POSTECIPADO)",
};

export const CLASSIFICACOES = ["APLICATIVO", "PARTICULAR", "EMPRESA"] as const;

export const UNIDADES_FATURAMENTO = ["UNIDADE DE COMPRA DO VEÍCULO"] as const;

export const CONTRATACAO_ENTREGA = [
  "RETIRADA NA LOJA",
  "ENTREGA NO ENDEREÇO DO CLIENTE",
] as const;

/** Nível do tanque, em oitavos — como no marcador do painel. */
export const NIVEIS_COMBUSTIVEL = [
  "RESERVA",
  "1/8",
  "1/4",
  "3/8",
  "1/2",
  "5/8",
  "3/4",
  "7/8",
  "CHEIO",
] as const;

export const TIPOS_RECEBIMENTO = [
  "PIX",
  "DINHEIRO",
  "CARTÃO DE CRÉDITO",
  "CARTÃO DE DÉBITO",
  "TRANSFERÊNCIA",
  "BOLETO",
] as const;

/** Sugestões do campo Franquia (o campo aceita qualquer texto). */
export const SUGESTOES_FRANQUIA = [
  "KM LIVRE",
  "1.000 KM POR SEMANA",
  "1.500 KM POR SEMANA",
  "2.000 KM POR SEMANA",
] as const;

/** Texto que já vem no campo "Informações adicionais". */
export const INFORMACOES_ADICIONAIS_PADRAO = [
  "FURTO, ROUBO, INCÊNDIO E PERDA TOTAL VALOR: R$",
  "PEQUENOS DANOS E AVARIAS VALOR: R$",
  "COBERTURA MÁXIMA CONTRA TERCEIROS VALOR: R$",
  "FRANQUIA DE KM:",
  "NÍVEL DO COMBUSTÍVEL:",
].join("\n");

export const INFORMACOES_ADICIONAIS_MAX = 2000;

/** Avança a data em N períodos. Mês é mês de calendário, não 30 dias. */
export function somarPeriodos(inicio: Date, periodo: Periodo, n: number): Date {
  const d = new Date(inicio);
  switch (periodo) {
    case "DIAS":
      d.setDate(d.getDate() + n);
      break;
    case "SEMANAS":
      d.setDate(d.getDate() + 7 * n);
      break;
    case "QUINZENAS":
      d.setDate(d.getDate() + 15 * n);
      break;
    case "MESES": {
      // 31/01 + 1 mês cai em 28/02, e não em 03/03.
      const dia = d.getDate();
      d.setDate(1);
      d.setMonth(d.getMonth() + n);
      const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(dia, ultimo));
      break;
    }
  }
  return d;
}

/**
 * Valor do período convertido para uma semana.
 *
 * Mês usa 52 semanas / 12 meses — o mesmo número que se usa para comparar
 * aluguel mensal com semanal, e não 4 semanas (que superestimaria a semana).
 */
export function valorSemanal(valorPeriodo: number, periodo: Periodo): number {
  const fator: Record<Periodo, number> = {
    DIAS: 7,
    SEMANAS: 1,
    QUINZENAS: 7 / 15,
    MESES: 12 / 52,
  };
  return Math.round(valorPeriodo * fator[periodo] * 100) / 100;
}

export type Fatura = {
  numero: number;
  /** Primeiro dia coberto pela fatura. */
  inicio: Date;
  /** Último dia coberto (inclusive). */
  fim: Date;
  vencimento: Date;
  valor: number;
};

/**
 * As faturas do contrato: uma por período, a partir do início.
 *
 * Antecipado vence no primeiro dia do período; postecipado, no dia seguinte
 * ao último (quando o período acabou de ser usado). Os itens adicionais ativos
 * entram somados em cada fatura cujo período eles cobrem.
 */
export function cronogramaFaturas(params: {
  inicio: Date;
  periodo: Periodo;
  quantidade: number;
  valorPeriodo: number;
  faturamento: Faturamento;
  itens?: { inicio: Date; fim: Date | null; valor: number; ativo: boolean }[];
}): Fatura[] {
  const out: Fatura[] = [];
  for (let i = 0; i < params.quantidade; i++) {
    const inicio = somarPeriodos(params.inicio, params.periodo, i);
    const proximo = somarPeriodos(params.inicio, params.periodo, i + 1);
    const fim = new Date(proximo.getTime() - 24 * 60 * 60 * 1000);
    const extras = (params.itens ?? [])
      .filter((it) => it.ativo && it.inicio <= fim && (it.fim == null || it.fim >= inicio))
      .reduce((s, it) => s + it.valor, 0);
    out.push({
      numero: i + 1,
      inicio,
      fim,
      vencimento: params.faturamento === "ANTECIPADO" ? inicio : proximo,
      valor: Math.round((params.valorPeriodo + extras) * 100) / 100,
    });
  }
  return out;
}

/** Só os dígitos do CPF/CNPJ. */
export function soDigitos(v: string): string {
  return v.replace(/\D/g, "");
}

/** Valida CPF (11 dígitos) ou CNPJ (14) pelos dígitos verificadores. */
export function documentoValido(v: string): boolean {
  const d = soDigitos(v);
  if (d.length === 11) {
    if (/^(\d)\1{10}$/.test(d)) return false;
    const calc = (n: number) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
      const r = (s * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1{13}$/.test(d)) return false;
    const calc = (n: number) => {
      const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const s = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
      const r = s % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  return false;
}

/** "12345678901" → "123.456.789-01"; CNPJ no formato 00.000.000/0000-00. */
export function formatarDocumento(v: string): string {
  const d = soDigitos(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v;
}

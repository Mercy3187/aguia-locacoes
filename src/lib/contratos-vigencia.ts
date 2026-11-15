/**
 * Quando um contrato ATIVO merece uma conferida antes de cobrar KM — puro,
 * sem banco, para poder ser testado.
 *
 * ── O problema que isto resolve ──
 * As locações são por prazo INDETERMINADO. O `endDate` do contrato não é o
 * fim da locação: é até quando as faturas já foram geradas (o lote do
 * contrato), e a renovação empurra a data para frente.
 *
 * Se o motorista devolve o carro e ninguém registra a devolução, o contrato
 * segue ATIVO — aparecendo na fila para cobrar quilometragem de quem nem está
 * mais com o carro. Este arquivo aponta esses casos: faturamento parado há
 * tempo demais, ou dois contratos ativos no mesmo carro.
 *
 * A decisão NUNCA é automática — encerrar contrato é mexer em cobrança. Aqui
 * só se levanta a mão; quem encerra é o usuário, na tela.
 */

/** Dias sem renovar o faturamento até o contrato virar suspeita. */
export const DIAS_TOLERANCIA_FATURAMENTO = 7;

/** Quanto tempo vale um "esse cliente continua" — um ciclo de boletos. */
export const DIAS_VALIDADE_CONFIRMACAO = 28;

export type MotivoRevisao = "carro-repassado" | "faturamento-parado";

export type ContratoParaRevisar = {
  id: string;
  endDate: Date | null;
  vigenciaConfirmadaAt: Date | null;
  /** Contratos ATIVOS do MESMO carro (este incluído), para achar o repasse. */
  contratosAtivosDoCarro: Array<{ id: string; startDate: Date; endDate: Date | null }>;
  startDate: Date;
};

export type Revisao = {
  motivo: MotivoRevisao;
  /** Frase pronta para a tela. */
  aviso: string;
  /** Dias desde que o faturamento parou (nulo quando não é esse o motivo). */
  diasParado: number | null;
};

const DIA_MS = 86_400_000;

function diasEntre(depois: Date, antes: Date): number {
  return Math.floor((depois.getTime() - antes.getTime()) / DIA_MS);
}

/**
 * Decide se este contrato deve sair da fila de cobrança e pedir confirmação.
 * Devolve `null` quando está tudo certo e a cobrança de KM segue normal.
 */
export function revisarVigencia(
  contrato: ContratoParaRevisar,
  hoje: Date
): Revisao | null {
  // ── 1. Carro repassado ──
  // O mesmo carro tem outro contrato ATIVO que está mais adiantado que este.
  // Um carro não fica com dois motoristas ao mesmo tempo: o de trás devolveu.
  // Este é o sinal forte, e nenhuma confirmação o segura — enquanto os dois
  // contratos existirem, um deles está errado.
  //
  // Quem está na frente é quem tem boleto indo mais longe, NÃO quem começou
  // depois: numa troca de motorista os dois contratos podem ter a mesma data
  // de início, e comparar só o início não separa um do outro. A data de
  // início fica como desempate.
  const esteFim = contrato.endDate?.getTime() ?? 0;
  const maisNovo = contrato.contratosAtivosDoCarro.find((c) => {
    if (c.id === contrato.id) return false;
    const outroFim = c.endDate?.getTime() ?? 0;
    if (outroFim !== esteFim) return outroFim > esteFim;
    return c.startDate > contrato.startDate;
  });
  if (maisNovo) {
    return {
      motivo: "carro-repassado",
      aviso:
        "O carro já foi repassado: existe outro contrato ativo, mais novo, para o mesmo veículo. " +
        "Este contrato provavelmente devia estar encerrado.",
      diasParado: null,
    };
  }

  // ── 2. Faturamento parado ──
  // Passou da data até onde havia boleto e ninguém gerou o lote seguinte.
  if (!contrato.endDate) return null;

  const diasParado = diasEntre(hoje, contrato.endDate);
  if (diasParado <= DIAS_TOLERANCIA_FATURAMENTO) return null;

  // O usuário já disse que este continua: a confirmação vale por um ciclo de
  // boletos. Depois disso ele é perguntado de novo — se o faturamento não
  // voltou em 28 dias, a resposta antiga já não quer dizer nada.
  if (
    contrato.vigenciaConfirmadaAt &&
    diasEntre(hoje, contrato.vigenciaConfirmadaAt) < DIAS_VALIDADE_CONFIRMACAO
  ) {
    return null;
  }

  return {
    motivo: "faturamento-parado",
    aviso:
      `Os boletos deste contrato iam até ${contrato.endDate.toLocaleDateString("pt-BR")} ` +
      `e não foram renovados há ${diasParado} dias. ` +
      "Confirme se o cliente continua com o carro antes de cobrar a quilometragem.",
    diasParado,
  };
}

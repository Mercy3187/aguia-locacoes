/**
 * Quem estava com o carro na hora da infração — puro, sem banco, para poder
 * ser testado (veja `dev-tools/testar-multas-responsavel.mts`).
 *
 * ── A regra ──
 * A multa tem data e hora exatas. Responsável é quem tinha o contrato daquele
 * carro naquele instante. Simples de dizer, com três armadilhas:
 *
 *   1. A locação é por prazo INDETERMINADO. O `endDate` do contrato é até
 *      onde as faturas foram geradas, não o fim da locação — usá-lo como fim
 *      inocentaria o motorista de toda multa tirada depois da última fatura.
 *      Por isso o contrato ATIVO não tem fim (vale até hoje), e o encerrado
 *      termina na devolução registrada (`returnedAt`).
 *
 *   2. Um carro pode ter mais de um contrato ativo no sistema (o repasse que
 *      ninguém encerrou). Quando dois candidatos servem, a resposta honesta é
 *      "não dá para saber", não o primeiro da lista.
 *
 *   3. O sistema só conhece contratos a partir de certa data. Multa anterior a
 *      isso não é "sem motorista" — é "o sistema não tem essa informação", e
 *      as duas coisas precisam aparecer diferentes na tela, senão o relatório
 *      afirma com segurança algo que ele não sabe.
 */

export type ContratoNoPeriodo = {
  id: string;
  vehicleId: string;
  /** Placa no formato do cadastro ("QYB-0G99"). */
  placa: string;
  clienteNome: string;
  clienteId: string;
  /** CPF/CNPJ — vai no recibo que o motorista recebe, para ele se identificar. */
  clienteDoc: string | null;
  inicio: Date;
  /** Fim do contrato. Nulo = ainda em curso. */
  fim: Date | null;
};

export type Responsavel =
  | {
      tipo: "encontrado";
      contratoId: string;
      clienteId: string;
      clienteNome: string;
      clienteDoc: string | null;
    }
  /** O carro é da frota, mas ninguém estava com ele nessa data. */
  | { tipo: "sem-contrato"; motivo: string }
  /** Mais de um contrato serve — o dado está ambíguo. */
  | { tipo: "ambiguo"; candidatos: string[]; motivo: string }
  /** A data é anterior ao que o sistema conhece. */
  | { tipo: "fora-do-historico"; motivo: string }
  /** A placa da multa não é de nenhum carro cadastrado. */
  | { tipo: "carro-desconhecido"; motivo: string };

/** Um contrato cobre o instante da infração? */
function cobre(c: ContratoNoPeriodo, quando: Date): boolean {
  if (quando < c.inicio) return false;
  // Sem fim = em curso: cobre até hoje.
  return c.fim == null || quando <= c.fim;
}

export function acharResponsavel(params: {
  placa: string;
  ocorridaEm: Date;
  /** Todos os contratos do sistema (de qualquer status). */
  contratos: ContratoNoPeriodo[];
  /** Placas cadastradas na frota, para separar "carro de fora" de "sem contrato". */
  placasDaFrota: Set<string>;
  /**
   * Contrato mais antigo que o sistema conhece. Multa anterior a isso não pode
   * ser respondida — e dizer "sem contrato" nesse caso seria mentir com cara
   * de certeza.
   */
  inicioDoHistorico: Date | null;
}): Responsavel {
  const { placa, ocorridaEm, contratos, placasDaFrota, inicioDoHistorico } = params;

  if (!placasDaFrota.has(placa)) {
    return {
      tipo: "carro-desconhecido",
      motivo: `A placa ${placa} não está cadastrada na frota.`,
    };
  }

  const candidatos = contratos.filter((c) => c.placa === placa && cobre(c, ocorridaEm));

  if (candidatos.length === 1) {
    const c = candidatos[0];
    return {
      tipo: "encontrado",
      contratoId: c.id,
      clienteId: c.clienteId,
      clienteNome: c.clienteNome,
      clienteDoc: c.clienteDoc,
    };
  }

  if (candidatos.length > 1) {
    return {
      tipo: "ambiguo",
      candidatos: candidatos.map((c) => c.clienteNome),
      motivo:
        `Há ${candidatos.length} contratos ativos do ${placa} cobrindo essa data ` +
        `(${candidatos.map((c) => c.clienteNome).join(", ")}). ` +
        "Encerre o que já acabou no Controle de KM para o sistema saber responder.",
    };
  }

  // Nenhum candidato. Antes de dizer "não tinha ninguém", checa se a data é
  // simplesmente mais antiga do que tudo que o sistema guarda.
  if (inicioDoHistorico && ocorridaEm < inicioDoHistorico) {
    return {
      tipo: "fora-do-historico",
      motivo:
        `O sistema só tem contratos a partir de ${inicioDoHistorico.toLocaleDateString("pt-BR")}. ` +
        "Esta multa é anterior — quem estava com o carro não está registrado aqui.",
    };
  }

  return {
    tipo: "sem-contrato",
    motivo: `Nenhum contrato do ${placa} cobre essa data — o carro estava no pátio.`,
  };
}

/** Rótulo curto para a coluna "Motorista" da tela. */
export function rotuloResponsavel(r: Responsavel): string {
  switch (r.tipo) {
    case "encontrado":
      return r.clienteNome;
    case "ambiguo":
      return "Mais de um contrato";
    case "sem-contrato":
      return "Sem locação na data";
    case "fora-do-historico":
      return "Fora do histórico";
    case "carro-desconhecido":
      return "Carro não cadastrado";
  }
}

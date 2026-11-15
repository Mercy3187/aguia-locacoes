/**
 * A conta do custo de uma manutenção — puro, sem banco, para poder ser testado
 * (veja `dev-tools/testar-peca-mao-de-obra.mts`).
 *
 * ── Por que peça e mão de obra são separadas ──
 * A peça é comprada por fora, na autopeças, e entregue ao mecânico; ao
 * mecânico se paga só o serviço. São dois desembolsos, para dois fornecedores,
 * e antes iam somados num campo único — o que impedia saber quanto da frota é
 * peça e quanto é serviço.
 *
 * ── Por que o total continua existindo ──
 * `cost` segue sendo o número que o fechamento e os relatórios leem. Se cada consulta tivesse que somar duas colunas, bastaria
 * uma esquecer para o dinheiro passar a mentir naquela tela. O total é
 * gravado, mas nunca digitado: sai da soma feita aqui.
 */

const dinheiro = (v: unknown): number => (v == null ? 0 : Number(v));

/** Total de uma manutenção a partir das duas partes. */
export function custoTotal(
  partsCost: number | null | undefined,
  laborCost: number | null | undefined
): number {
  // Arredonda no centavo: 350,55 + 499,45 dá 850.0000000000001 em ponto
  // flutuante, e isso vira um total esquisito numa tela de dinheiro.
  return Math.round((dinheiro(partsCost) + dinheiro(laborCost)) * 100) / 100;
}

/**
 * Se a manutenção tem a separação entre peça e mão de obra.
 *
 * As registradas antes desta mudança têm só o total — ninguém sabe hoje quanto
 * daquele valor foi peça e quanto foi serviço, e dividir no chute seria
 * inventar número financeiro. A tela mostra essas como "sem detalhamento",
 * com o total certo.
 *
 * Zero conta como informado: um alinhamento sem peça é 0, não "não sei".
 */
export function temDetalhamento(m: { partsCost: unknown; laborCost: unknown }): boolean {
  return m.partsCost != null || m.laborCost != null;
}

/** Quanto a frota gastou em peça e em serviço, separados. */
export type GastoPecaMaoDeObra = {
  pecas: number;
  maoDeObra: number;
  /** Total das manutenções antigas, que não têm a separação. */
  semDetalhamento: number;
};

/**
 * Soma peça, mão de obra e o que ficou sem detalhamento.
 *
 * As três parcelas somadas dão exatamente o gasto total — nada se perde e nada
 * é inventado. É por isso que as antigas viram uma linha própria em vez de
 * serem jogadas em um dos lados: jogá-las em peças faria a divisão mentir,
 * tirá-las da conta faria o total mentir.
 */
export function somarPecaMaoDeObra(
  registros: Array<{ cost: unknown; partsCost: unknown; laborCost: unknown }>
): GastoPecaMaoDeObra {
  let pecas = 0;
  let maoDeObra = 0;
  let semDetalhamento = 0;

  for (const m of registros) {
    if (temDetalhamento(m)) {
      pecas += dinheiro(m.partsCost);
      maoDeObra += dinheiro(m.laborCost);
    } else {
      semDetalhamento += dinheiro(m.cost);
    }
  }

  const centavo = (v: number) => Math.round(v * 100) / 100;
  return {
    pecas: centavo(pecas),
    maoDeObra: centavo(maoDeObra),
    semDetalhamento: centavo(semDetalhamento),
  };
}

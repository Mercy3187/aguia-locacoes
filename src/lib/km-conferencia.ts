/**
 * Regras da quilometragem — puro, sem banco, para poder ser testado.
 *
 * A KM é o número que alimenta óleo, correia e relatórios, e há
 * dois caminhos para ela mudar: a conferência do que o motorista enviou e a
 * alteração feita na mão. As travas dos dois ficam aqui, isoladas e
 * conferíveis (veja `dev-tools/testar-regra-conferencia.mts` e
 * `dev-tools/testar-regra-km.mts`).
 *
 * Quem GRAVA a KM é `src/lib/km.ts` — este arquivo só decide se pode.
 */

/**
 * Valida uma KM informada na mão contra a que o carro já tem.
 *
 * Odômetro não anda para trás sozinho: um número menor é quase sempre erro de
 * digitação. Mas às vezes é a correção de um erro anterior (alguém lançou
 * 1.000.000), então em vez de proibir, devolvemos o pedido de confirmação —
 * a tela pergunta e chama de novo com `confirmado`.
 *
 * Diferente de `resolverKmConferencia`, que trata o caso do motorista: lá a KM
 * menor é bloqueio seco, porque o valor veio de fora e o certo é corrigir o
 * registro, não fazer o carro voltar no tempo.
 */
export function conferirKmNova(params: {
  novaKm: number;
  kmAtual: number;
  plate: string;
  confirmado?: boolean;
}): { ok: true } | { ok: false; error: string } | { ok: false; confirmar: string } {
  const { novaKm, kmAtual, plate } = params;

  if (!Number.isFinite(novaKm) || !Number.isInteger(novaKm)) {
    return { ok: false, error: "Informe a quilometragem em número inteiro." };
  }
  if (novaKm < 0) {
    return { ok: false, error: "A KM não pode ser negativa." };
  }
  if (novaKm > 3_000_000) {
    return {
      ok: false,
      error: "Essa KM parece errada (acima de 3.000.000). Confira o número.",
    };
  }

  if (novaKm < kmAtual && !params.confirmado) {
    const diferenca = kmAtual - novaKm;
    return {
      ok: false,
      confirmar:
        `O ${plate} está com ${kmAtual.toLocaleString("pt-BR")} km e você digitou ` +
        `${novaKm.toLocaleString("pt-BR")} km — ${diferenca.toLocaleString("pt-BR")} km a menos. ` +
        `Odômetro não anda para trás. Confirma que é uma correção?`,
    };
  }

  return { ok: true };
}

export type ResultadoConferencia =
  | { ok: true; kmFinal: number; corrigiu: boolean }
  | { ok: false; error: string };

export function resolverKmConferencia(params: {
  /** O que o motorista digitou. */
  informedKm: number;
  /** Valor corrigido por quem está conferindo (opcional). */
  kmCorrigida?: number | null;
  /** KM que o veículo marca hoje. */
  currentKm: number;
  plate: string;
  /** Se o registro já foi aplicado antes. */
  jaAplicado: boolean;
}): ResultadoConferencia {
  if (params.jaAplicado) {
    return { ok: false, error: "Este registro já foi conferido." };
  }

  const kmFinal =
    params.kmCorrigida != null && Number.isFinite(params.kmCorrigida)
      ? Math.trunc(params.kmCorrigida)
      : params.informedKm;

  if (!Number.isFinite(kmFinal) || kmFinal < 0) {
    return { ok: false, error: "A KM não pode ser negativa." };
  }

  // Odômetro não anda para trás. Conferir um registro antigo depois de um mais
  // novo (ou digitar um valor menor por engano) não pode regredir a KM do carro
  // — isso bagunçaria óleo, correia e o histórico inteiro.
  if (kmFinal < params.currentKm) {
    return {
      ok: false,
      error: `A KM (${kmFinal.toLocaleString("pt-BR")}) é menor que a atual do ${
        params.plate
      } (${params.currentKm.toLocaleString("pt-BR")} km). Confira o valor.`,
    };
  }

  return { ok: true, kmFinal, corrigiu: kmFinal !== params.informedKm };
}

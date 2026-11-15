import { formatCurrency } from "@/lib/utils";

/**
 * Colunas empilhadas: gasto de manutenção por mês, separado por série.
 *
 * Feito com HTML e CSS puros — nenhuma biblioteca de gráfico entra no projeto
 * por causa de três séries. O `hover` é CSS, então isto continua sendo um
 * componente de servidor, sem JavaScript indo para o navegador.
 *
 * As séries chegam por parâmetro em vez de estarem escritas aqui dentro: o
 * rótulo e a cor de cada uma são decisão de quem monta a tela, e assim uma
 * série nova (foi o caso dos avulsos) não exige mexer no gráfico.
 */

export type SerieGasto = {
  chave: string;
  label: string;
  /** Classe de fundo do Tailwind, ex.: "bg-serie-frota". */
  cor: string;
};

type Mes = {
  chave: string;
  rotulo: string;
  valores: Record<string, number>;
  total: number;
};

/** Arredonda o topo do eixo para um número "redondo" acima do maior valor. */
function topoDoEixo(max: number): number {
  if (max <= 0) return 100;
  const grandeza = 10 ** Math.floor(Math.log10(max));
  for (const passo of [1, 2, 2.5, 5, 10]) {
    const candidato = passo * grandeza;
    if (candidato >= max) return candidato;
  }
  return 10 * grandeza;
}

/** Valor curto para o eixo: 7000 -> "7 mil". */
function curto(v: number): string {
  if (v >= 1000) {
    const mil = v / 1000;
    return `${Number.isInteger(mil) ? mil : mil.toFixed(1).replace(".", ",")} mil`;
  }
  return String(v);
}

export function GastoPorMes({
  meses,
  series,
}: {
  meses: Mes[];
  series: SerieGasto[];
}) {
  const maior = Math.max(...meses.map((m) => m.total), 0);

  if (maior === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
        Nenhum gasto de manutenção nos últimos {meses.length} meses.
      </p>
    );
  }

  const topo = topoDoEixo(maior);
  // Quatro linhas de grade, do topo até a base.
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => topo * f);
  const ALTURA = 190;

  return (
    <figure className="m-0">
      {/* Legenda. O texto usa a cor de texto normal — quem carrega a
          identidade é o quadradinho ao lado. */}
      <figcaption className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {series.map((s) => (
          <span key={s.chave} className="flex items-center gap-2 text-xs text-muted-strong">
            <span className={`size-2.5 rounded-[3px] ${s.cor}`} />
            {s.label}
          </span>
        ))}
      </figcaption>

      <div className="flex gap-3">
        {/* Eixo dos valores */}
        <div
          className="flex w-14 shrink-0 flex-col justify-between text-right text-[10px] tabular-nums text-muted"
          style={{ height: ALTURA }}
          aria-hidden
        >
          {ticks.map((t) => (
            <span key={t} className="leading-none">
              {curto(t)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: ALTURA }}>
            {/* Linhas de grade: finas, sólidas e discretas. */}
            <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
              {ticks.map((t) => (
                <span key={t} className="block h-px w-full bg-border" />
              ))}
            </div>

            {/* Colunas */}
            <div className="absolute inset-0 flex items-end justify-between gap-2">
              {meses.map((m) => {
                const alturaTotal = (m.total / topo) * 100;
                // Só as séries com valor viram faixa. A primeira faixa
                // desenhada é o topo da coluna, e é a única com canto
                // arredondado — por isso a lista é filtrada antes.
                const faixas = series
                  .map((s) => ({ ...s, valor: m.valores[s.chave] ?? 0 }))
                  .filter((f) => f.valor > 0);
                return (
                  <div
                    key={m.chave}
                    className="group relative flex h-full flex-1 items-end justify-center"
                  >
                    <div
                      className="relative flex w-full max-w-[24px] flex-col justify-end gap-[2px] transition-opacity group-hover:opacity-90"
                      style={{ height: `${alturaTotal}%` }}
                    >
                      {faixas.map((f, i) => (
                        <div
                          key={f.chave}
                          className={`w-full ${f.cor} ${i === 0 ? "rounded-t" : ""}`}
                          style={{ height: `${(f.valor / m.total) * 100}%` }}
                        />
                      ))}
                    </div>

                    {/* Detalhe no hover — os valores exatos ficam aqui em vez
                        de poluir cada coluna com um número. */}
                    {m.total > 0 && (
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-left shadow-xl group-hover:block">
                        <p className="mb-1.5 text-[11px] font-semibold capitalize">
                          {m.rotulo}
                        </p>
                        {series.map((s) => (
                          <p
                            key={s.chave}
                            className="mt-1 flex items-center gap-2 text-[11px] text-muted-strong first:mt-0"
                          >
                            <span className={`size-2 rounded-[2px] ${s.cor}`} />
                            {s.label}
                            <span className="ml-auto pl-3 tabular-nums">
                              {formatCurrency(m.valores[s.chave] ?? 0)}
                            </span>
                          </p>
                        ))}
                        <p className="mt-1.5 border-t border-border pt-1.5 text-[11px] font-medium">
                          Total
                          <span className="ml-3 tabular-nums">
                            {formatCurrency(m.total)}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Meses */}
          <div className="mt-2 flex justify-between gap-2">
            {meses.map((m) => (
              <span
                key={m.chave}
                className="flex-1 text-center text-[10px] capitalize text-muted"
              >
                {m.rotulo}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

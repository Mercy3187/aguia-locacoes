import { formatCurrency, cn } from "@/lib/utils";
import type { SemanaReceita } from "@/lib/dashboard-financeiro";

/**
 * Recebido por semana, com uma linha de referência no valor semanal
 * contratado.
 *
 * A leitura que interessa não é "quanto entrou", é "entrou o que deveria?".
 * Por isso a linha da meta: cada barra é comparada com ela sem o leitor
 * precisar fazer conta.
 *
 * A semana corrente aparece hachurada e com o rótulo "em curso" — sem isso a
 * última barra pareceria uma queda, quando na verdade ela só ainda não
 * terminou.
 */

function topoDoEixo(max: number): number {
  if (max <= 0) return 1000;
  const grandeza = 10 ** Math.floor(Math.log10(max));
  for (const passo of [1, 1.5, 2, 2.5, 5, 10]) {
    const candidato = passo * grandeza;
    if (candidato >= max) return candidato;
  }
  return 10 * grandeza;
}

/** 12500 -> "12,5 mil" */
function curto(v: number): string {
  if (v >= 1000) {
    const mil = v / 1000;
    return `${Number.isInteger(mil) ? mil : mil.toFixed(1).replace(".", ",")} mil`;
  }
  return String(Math.round(v));
}

export function ReceitaSemanal({
  semanas,
  meta,
}: {
  semanas: SemanaReceita[];
  meta: number;
}) {
  const maiorRecebido = Math.max(...semanas.map((s) => s.recebido), 0);

  if (maiorRecebido === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted">
        Nenhum recebimento nas últimas {semanas.length} semanas.
      </p>
    );
  }

  // A meta entra no cálculo do topo para a linha nunca sair do gráfico.
  const topo = topoDoEixo(Math.max(maiorRecebido, meta));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => topo * f);
  const ALTURA = 210;
  const alturaMeta = meta > 0 ? (meta / topo) * 100 : null;

  return (
    <figure className="m-0">
      <div className="flex gap-3">
        <div
          className="flex w-16 shrink-0 flex-col justify-between text-right text-[10px] tabular-nums text-muted"
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
            <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
              {ticks.map((t) => (
                <span key={t} className="block h-px w-full bg-border" />
              ))}
            </div>

            {/* Linha da meta semanal — anotação, não série. */}
            {alturaMeta != null && alturaMeta <= 100 && (
              <div
                className="absolute inset-x-0 z-10 flex items-center"
                style={{ bottom: `${alturaMeta}%` }}
              >
                <span className="h-px flex-1 bg-brand/50" />
                <span className="ml-2 whitespace-nowrap rounded-full border border-brand/30 bg-background px-2 py-0.5 text-[10px] font-medium text-brand">
                  meta {curto(meta)}
                </span>
              </div>
            )}

            <div className="absolute inset-0 flex items-end justify-between gap-2">
              {semanas.map((s) => {
                const altura = (s.recebido / topo) * 100;
                const bateuMeta = meta > 0 && s.recebido >= meta;
                return (
                  <div
                    key={s.chave}
                    className="group relative flex h-full flex-1 items-end justify-center"
                  >
                    <div
                      className={cn(
                        "w-full max-w-[26px] rounded-t transition-opacity group-hover:opacity-85",
                        s.emCurso ? "bg-serie-frota/45" : "bg-serie-frota"
                      )}
                      style={{
                        height: `${Math.max(altura, s.recebido > 0 ? 1.5 : 0)}%`,
                        // Hachura a 45° marca a semana incompleta sem inventar
                        // uma segunda cor.
                        ...(s.emCurso
                          ? {
                              backgroundImage:
                                "repeating-linear-gradient(45deg, var(--serie-frota) 0 3px, transparent 3px 7px)",
                            }
                          : {}),
                      }}
                    />

                    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-left shadow-xl group-hover:block">
                      <p className="text-[11px] font-semibold">
                        Semana de {s.rotulo}
                        {s.emCurso && (
                          <span className="ml-1.5 font-normal text-muted">(em curso)</span>
                        )}
                      </p>
                      <p className="mt-1 text-[11px] tabular-nums text-muted-strong">
                        Recebido: {formatCurrency(s.recebido)}
                      </p>
                      {meta > 0 && !s.emCurso && (
                        <p
                          className={cn(
                            "mt-0.5 text-[11px] tabular-nums",
                            bateuMeta ? "text-success" : "text-warning"
                          )}
                        >
                          {bateuMeta
                            ? `+${formatCurrency(s.recebido - meta)} acima da meta`
                            : `${formatCurrency(meta - s.recebido)} abaixo da meta`}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-2 flex justify-between gap-2">
            {semanas.map((s) => (
              <span
                key={s.chave}
                className={cn(
                  "flex-1 text-center text-[10px] tabular-nums",
                  s.emCurso ? "font-medium text-muted-strong" : "text-muted"
                )}
              >
                {s.rotulo}
              </span>
            ))}
          </div>
        </div>
      </div>

      <figcaption className="mt-3 text-xs text-muted">
        Cada barra é uma semana (segunda a domingo). A última está{" "}
        <span className="text-muted-strong">em curso</span> e por isso aparece
        hachurada.
      </figcaption>
    </figure>
  );
}

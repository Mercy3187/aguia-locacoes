import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import type { BlocoAlerta, AlertGrupo, AlertSeverity } from "@/lib/alerts";
import { cn } from "@/lib/utils";

/**
 * As pendências da operação escritas como lista de tarefas.
 *
 * Antes eram cartões do mesmo tamanho, um por alerta: "9 KM quinzenal vencida"
 * ocupava o mesmo espaço que "1 veículo sem KM inicial", e o leitor tinha que
 * traduzir sozinho cada rótulo em uma ação. Aqui as pendências ficam agrupadas
 * por assunto, ordenadas por urgência e escritas como o que precisa ser feito.
 */

const ICONE_GRUPO: Record<AlertGrupo, IconName> = {
  Quilometragem: "km",
  Manutenção: "chave",
  Condutores: "carteira",
  Cadastro: "cliente",
  Sistema: "integracao",
};

const COR: Record<AlertSeverity, { texto: string; ponto: string }> = {
  danger: { texto: "text-danger", ponto: "bg-danger" },
  warning: { texto: "text-warning", ponto: "bg-warning" },
  info: { texto: "text-muted", ponto: "bg-muted/60" },
};

export function PainelAlertas({ blocos }: { blocos: BlocoAlerta[] }) {
  if (blocos.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success/[0.07] px-5 py-4 text-sm text-success">
        <Icon name="caucao" className="size-5 shrink-0" />
        Tudo em dia — nenhuma pendência no momento.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {blocos.map((bloco) => (
        <div
          key={bloco.grupo}
          className={cn(
            "overflow-hidden rounded-2xl border bg-surface",
            bloco.critico ? "border-danger/30" : "border-border"
          )}
        >
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <span className="flex items-center gap-2.5">
              <Icon
                name={ICONE_GRUPO[bloco.grupo]}
                className={cn(
                  "size-[18px]",
                  bloco.critico ? "text-danger" : "text-muted"
                )}
              />
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-strong">
                {bloco.grupo}
              </span>
            </span>
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                bloco.critico
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : "border-border text-muted"
              )}
            >
              {bloco.total}
            </span>
          </header>

          <ul>
            {bloco.itens.map((a) => {
              const cor = COR[a.severity];
              return (
                <li key={a.key}>
                  <Link
                    href={a.href}
                    className="group flex items-start gap-3 border-b border-border px-5 py-3 transition-colors last:border-b-0 hover:bg-surface-2"
                  >
                    {/* Só a bolinha de gravidade: a contagem já está escrita
                        dentro da frase ("Cobrar a KM de 9 motoristas"), e
                        repeti-la numa coluna ao lado mostraria o mesmo número
                        duas vezes na mesma linha. */}
                    <span
                      className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", cor.ponto)}
                      aria-hidden
                    />
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-sm leading-snug",
                        a.severity === "danger" ? "text-foreground" : "text-muted-strong"
                      )}
                    >
                      {a.acao}
                    </span>
                    <Icon
                      name="seta-direita"
                      className="mt-1 size-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

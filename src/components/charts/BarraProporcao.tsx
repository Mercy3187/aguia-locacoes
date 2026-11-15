import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Barra horizontal 100% empilhada, com legenda e valores embaixo.
 *
 * Usada no painel e na tela de manutenção para mostrar como um total se
 * divide. Os valores ficam na legenda, e não dentro da barra: um segmento pequeno não comporta texto, e
 * rótulo cortado é pior do que rótulo nenhum.
 */

export type Fatia = {
  chave: string;
  label: string;
  valor: number;
  /** Classe de fundo do segmento (ex.: "bg-serie-frota"). */
  cor: string;
  /** Ajuda a distinguir estados sem depender só da cor. */
  simbolo?: string;
};

export function BarraProporcao({
  fatias,
  vazio = "Sem valores para mostrar.",
  formato = "moeda",
  sufixo,
}: {
  fatias: Fatia[];
  vazio?: string;
  /** Como escrever o valor: dinheiro ou contagem simples. */
  formato?: "moeda" | "numero";
  /** Palavra depois do número quando `formato` é "numero" (ex.: "carros"). */
  sufixo?: string;
}) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const escrever = (v: number) =>
    formato === "moeda"
      ? formatCurrency(v)
      : `${v.toLocaleString("pt-BR")}${sufixo ? ` ${sufixo}` : ""}`;

  if (total <= 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
        {vazio}
      </p>
    );
  }

  const visiveis = fatias.filter((f) => f.valor > 0);

  return (
    <div>
      {/* A barra. O gap de 2px deixa o fundo aparecer entre os segmentos —
          é o que os separa, em vez de um contorno desenhado em volta. */}
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
        {visiveis.map((f) => (
          <div
            key={f.chave}
            className={cn("h-full first:rounded-l-full last:rounded-r-full", f.cor)}
            style={{ width: `${(f.valor / total) * 100}%` }}
          />
        ))}
      </div>

      <dl className="mt-4 space-y-2.5">
        {fatias.map((f) => {
          const pct = total > 0 ? (f.valor / total) * 100 : 0;
          return (
            <div key={f.chave} className="flex items-center gap-3 text-sm">
              <span className={cn("size-2.5 shrink-0 rounded-[3px]", f.cor)} />
              <dt className="text-muted-strong">
                {f.simbolo && <span className="mr-1.5">{f.simbolo}</span>}
                {f.label}
              </dt>
              <span className="mx-1 h-px min-w-4 flex-1 bg-border" />
              <dd className="flex shrink-0 items-baseline gap-2">
                <span className="text-xs tabular-nums text-muted">
                  {pct.toFixed(0)}%
                </span>
                <span className="font-medium tabular-nums">{escrever(f.valor)}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

import Link from "next/link";
import { requireCan } from "@/lib/session";
import { Icon } from "@/components/icons";
import { ReceitaSemanal } from "@/components/charts/ReceitaSemanal";
import { BarraProporcao, type Fatia } from "@/components/charts/BarraProporcao";
import { PainelAlertas } from "@/components/PainelAlertas";
import { getDashboardStats } from "@/lib/dashboard";
import { getPainelFinanceiro } from "@/lib/dashboard-financeiro";
import { getAlerts, agruparAlertas } from "@/lib/alerts";
import { cn, formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Secao({
  titulo,
  acao,
  children,
}: {
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3.5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          <span className="brand-rule h-px w-6 rounded-full" />
          {titulo}
        </h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

function VerTudo({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1 text-sm font-medium text-brand transition-opacity hover:opacity-80"
    >
      {children}
      <Icon
        name="seta-direita"
        className="size-3.5 transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

/** Cartão de número com contexto embaixo — nunca um número solto. */
function Kpi({
  rotulo,
  valor,
  contexto,
  tom = "default",
  href,
  destaque,
}: {
  rotulo: string;
  valor: string;
  contexto: React.ReactNode;
  tom?: "default" | "brand" | "success" | "warning" | "danger";
  href?: string;
  destaque?: boolean;
}) {
  const cores = {
    default: "border-border",
    brand: "border-brand/25",
    success: "border-success/30 bg-success/[0.05]",
    warning: "border-warning/40 bg-warning/[0.07]",
    danger: "border-danger/40 bg-danger/[0.07]",
  } as const;

  const corValor = {
    default: "",
    brand: "text-brand",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  } as const;

  const conteudo = (
    <>
      {destaque && <span className="brand-rule absolute inset-x-0 top-0 h-px" />}
      <p className="text-[13px] font-medium text-muted">{rotulo}</p>
      <p
        className={cn(
          "mt-3 text-[30px] font-bold leading-none tracking-tight",
          corValor[tom]
        )}
      >
        {valor}
      </p>
      <div className="mt-2.5 text-xs text-muted">{contexto}</div>
    </>
  );

  const classe = cn(
    "card-sheen relative overflow-hidden rounded-2xl border bg-surface p-5 transition-colors",
    cores[tom],
    href && "hover:border-border-strong"
  );

  return href ? (
    <Link href={href} className={cn(classe, "block")}>
      {conteudo}
    </Link>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

export default async function DashboardPage() {
  await requireCan("relatorios");
  const [s, f, alerts] = await Promise.all([
    getDashboardStats(),
    getPainelFinanceiro(),
    getAlerts(),
  ]);

  const blocos = agruparAlertas(alerts);
  const totalPendencias = blocos.reduce((s, b) => s + b.total, 0);
  const criticos = alerts.filter((a) => a.count > 0 && a.severity === "danger").length;

  const hoje = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  // Variação da semana. Comparar uma semana em curso com uma inteira daria
  // uma queda falsa, então a comparação é sempre entre as duas últimas
  // semanas fechadas.
  const fechadas = f.semanas.filter((w) => !w.emCurso);
  const ultimaFechada = fechadas[fechadas.length - 1]?.recebido ?? 0;
  const penultimaFechada = fechadas[fechadas.length - 2]?.recebido ?? 0;
  const variacao =
    penultimaFechada > 0
      ? ((ultimaFechada - penultimaFechada) / penultimaFechada) * 100
      : null;

  const ocupacao =
    s.totalVehicles > 0 ? Math.round((s.rented / s.totalVehicles) * 100) : 0;

  const carteira: Fatia[] = [
    { chave: "recebido", label: "Já recebido", valor: f.carteira.recebido, cor: "bg-success", simbolo: "✓" },
    { chave: "avencer", label: "A vencer", valor: f.carteira.aVencer, cor: "bg-muted/40", simbolo: "○" },
    { chave: "atrasado", label: "Em atraso", valor: f.carteira.atrasado, cor: "bg-danger", simbolo: "!" },
  ];

  const frota: Fatia[] = [
    { chave: "alugado", label: "Alugados", valor: f.frota.alugado, cor: "bg-success" },
    { chave: "disponivel", label: "Parados no pátio", valor: f.frota.disponivel, cor: "bg-muted/40" },
    { chave: "manutencao", label: "Em manutenção", valor: f.frota.manutencao, cor: "bg-warning" },
    ...(f.frota.outros > 0
      ? [{ chave: "outros", label: "Outros", valor: f.frota.outros, cor: "bg-surface-3" }]
      : []),
  ];

  const topRanking = f.ranking[0]?.recebido ?? 0;

  return (
    <div className="surgir space-y-9">
      {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight">Dashboard</h1>
          <p className="mt-1.5 text-sm capitalize text-muted">{hoje}</p>
        </div>
        <p className="text-sm">
          {criticos > 0 ? (
            <span className="text-danger">
              {criticos} {criticos === 1 ? "item crítico" : "itens críticos"} para resolver
            </span>
          ) : (
            <span className="text-success">Nenhum item crítico</span>
          )}
        </p>
      </header>

      {/* ── Os quatro números do dia ──────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          rotulo="Recebido nesta semana"
          valor={formatCurrency(f.estaSemana)}
          tom="brand"
          destaque
          contexto={
            f.metaSemanal > 0 ? (
              <>
                de {formatCurrency(f.metaSemanal)} contratados
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <span
                    className="block h-full rounded-full bg-brand"
                    style={{
                      width: `${Math.min(100, (f.estaSemana / f.metaSemanal) * 100)}%`,
                    }}
                  />
                </span>
              </>
            ) : (
              "sem valor semanal nos contratos"
            )
          }
        />

        <Kpi
          rotulo="Última semana fechada"
          valor={formatCurrency(ultimaFechada)}
          contexto={
            variacao == null ? (
              "sem semana anterior para comparar"
            ) : (
              <span className={variacao >= 0 ? "text-success" : "text-danger"}>
                {variacao >= 0 ? "▲" : "▼"} {Math.abs(variacao).toFixed(0)}% vs a semana
                anterior
              </span>
            )
          }
        />

        <Kpi
          rotulo="Em atraso"
          valor={formatCurrency(f.atrasado.valor)}
          tom={f.atrasado.valor > 0 ? "danger" : "success"}
          href="/inadimplencia"
          contexto={
            f.atrasado.valor > 0
              ? `${f.atrasado.cobrancas} ${f.atrasado.cobrancas === 1 ? "cobrança" : "cobranças"} de ${f.atrasado.motoristas} ${f.atrasado.motoristas === 1 ? "motorista" : "motoristas"}`
              : "nenhuma cobrança vencida"
          }
        />

        <Kpi
          rotulo="Ocupação da frota"
          valor={`${ocupacao}%`}
          tom={ocupacao >= 85 ? "success" : "warning"}
          href="/veiculos"
          contexto={
            <>
              {s.rented} de {s.totalVehicles} alugados
              {f.frota.disponivel > 0 && (
                <span className="block">
                  {f.frota.disponivel}{" "}
                  {f.frota.disponivel === 1 ? "parado" : "parados"} no pátio
                </span>
              )}
            </>
          }
        />
      </section>

      {/* ── Pendências: primeiro, porque é o que exige ação ───────────── */}
      <Secao
        titulo="Precisa de atenção"
        acao={
          totalPendencias > 0 ? (
            <span className="text-xs text-muted">
              {totalPendencias} {totalPendencias === 1 ? "item" : "itens"} ·{" "}
              {blocos.length} {blocos.length === 1 ? "assunto" : "assuntos"}
            </span>
          ) : undefined
        }
      >
        <PainelAlertas blocos={blocos} />
      </Secao>

      {/* ── O gráfico principal ───────────────────────────────────────── */}
      <Secao titulo="Recebimento por semana">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <ReceitaSemanal semanas={f.semanas} meta={f.metaSemanal} />
        </div>
      </Secao>

      {/* ── Composições ──────────────────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold">Situação das cobranças</h2>
          <p className="mb-5 mt-1 text-xs text-muted">
            Toda a carteira do Asaas, desde o começo
          </p>
          <BarraProporcao fatias={carteira} vazio="Nenhuma cobrança sincronizada." />
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold">Onde estão os carros</h2>
          <p className="mb-5 mt-1 text-xs text-muted">
            Carro parado é semana que não entra
          </p>
          <BarraProporcao
            fatias={frota}
            formato="numero"
            sufixo="carros"
            vazio="Nenhum veículo cadastrado."
          />
        </div>
      </section>

      {/* ── Quem está devendo ─────────────────────────────────────────── */}
      <Secao
        titulo="Quem está devendo"
        acao={<VerTudo href="/inadimplencia">Ir para inadimplência</VerTudo>}
      >
        {f.inadimplentes.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-success/30 bg-success/[0.07] px-5 py-4 text-sm text-success">
            <Icon name="caucao" className="size-5 shrink-0" />
            Ninguém em atraso — todas as cobranças em dia.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {f.inadimplentes.map((d) => (
              <div
                key={d.customerId}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.nome}</p>
                  <p className="text-xs text-muted">
                    {d.cobrancas} {d.cobrancas === 1 ? "cobrança" : "cobranças"} ·{" "}
                    <span className={d.diasAtraso >= 15 ? "text-danger" : "text-warning"}>
                      {d.diasAtraso} {d.diasAtraso === 1 ? "dia" : "dias"} de atraso
                    </span>
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums text-danger">
                  {formatCurrency(d.valor)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Secao>

      {/* ── Ranking por dinheiro que entrou de verdade ────────────────── */}
      <Secao titulo="Veículos que mais renderam">
        {f.ranking.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-muted">
            Ainda sem recebimentos nas últimas semanas.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {f.ranking.map((r, i) => {
              const proporcao = topRanking > 0 ? (r.recebido / topRanking) * 100 : 0;
              return (
                <div
                  key={r.plate}
                  className="relative flex items-center justify-between gap-4 border-b border-border px-5 py-3.5 last:border-b-0"
                >
                  <span
                    className="absolute inset-y-0 left-0 bg-brand/[0.06]"
                    style={{ width: `${proporcao}%` }}
                  />
                  <span className="relative flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
                        i === 0
                          ? "bg-brand text-brand-ink"
                          : "border border-border bg-surface-2 text-muted"
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="truncate font-medium">{r.plate}</span>
                    {r.model && <span className="truncate text-sm text-muted">{r.model}</span>}
                  </span>
                  <span className="relative shrink-0 font-semibold tabular-nums">
                    {formatCurrency(r.recebido)}
                  </span>
                </div>
              );
            })}
            <p className="border-t border-border px-5 py-2.5 text-xs text-muted">
              Dinheiro efetivamente recebido nas últimas 8 semanas — não é estimativa
              de contrato.
            </p>
          </div>
        )}
      </Secao>
    </div>
  );
}

import Link from "next/link";
import { requireCan } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  PageHeader,
  LinkButton,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
} from "@/components/ui";
import { ActionButton } from "@/components/ActionButton";
import { GastoPorMes, type SerieGasto } from "@/components/charts/GastoPorMes";
import { BarraProporcao, type Fatia } from "@/components/charts/BarraProporcao";
import { MAINTENANCE_STATUS } from "@/lib/labels";
import {
  getResumoManutencao,
  categoriaDaManutencao,
  carroDaManutencao,
  temDetalhamento,
  somarPecaMaoDeObra,
} from "@/lib/manutencao";
import { cn, formatDateTime, formatCurrency } from "@/lib/utils";
import { concluirManutencao, cancelarManutencao } from "./actions";

export const dynamic = "force-dynamic";

const FILTROS = [
  { key: "todos", label: "Todas" },
  { key: "frota", label: "Frota" },
  { key: "avulsos", label: "Avulsos" },
] as const;

type FiltroKey = (typeof FILTROS)[number]["key"];

/** Séries do gráfico. Rótulo e cor moram aqui, junto do resto da tela. */
const SERIES_GASTO: SerieGasto[] = [
  { chave: "frota", label: "Frota", cor: "bg-serie-frota" },
  { chave: "avulso", label: "Avulsos", cor: "bg-serie-avulso" },
];

export default async function ManutencaoPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  await requireCan("operacao");

  const { filtro: filtroParam } = await searchParams;
  const filtro: FiltroKey = FILTROS.some((f) => f.key === filtroParam)
    ? (filtroParam as FiltroKey)
    : "todos";

  const [resumo, maintenances] = await Promise.all([
    getResumoManutencao(6),
    prisma.maintenance.findMany({
      orderBy: [{ status: "asc" }, { startAt: "desc" }],
      include: { vehicle: true, contract: { include: { customer: true } } },
      take: 200,
    }),
  ]);

  const lista = maintenances.filter((m) => {
    if (filtro === "todos") return true;
    const categoria = categoriaDaManutencao(m);
    return categoria === (filtro === "avulsos" ? "AVULSO" : "FROTA");
  });

  // Quanto do gasto foi peça e quanto foi serviço. Cancelada não conta — não
  // houve desembolso —, igual ao critério do resto do painel.
  const gasto = somarPecaMaoDeObra(maintenances.filter((m) => m.status !== "CANCELADA"));

  const composicao: Fatia[] = [
    {
      chave: "frota",
      label: "Carros da frota",
      valor: resumo.porCategoria.FROTA.total,
      cor: "bg-serie-frota",
    },
    {
      chave: "avulso",
      label: "Avulsos",
      valor: resumo.porCategoria.AVULSO.total,
      cor: "bg-serie-avulso",
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Manutenções"
        description="Gasto com a frota, carros parados e serviços avulsos"
        action={<LinkButton href="/manutencao/nova">+ Nova manutenção</LinkButton>}
      />

      {/* ── Números do topo ───────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="card-sheen rounded-2xl border border-border bg-surface p-5">
          <p className="text-[13px] font-medium text-muted">Gasto total</p>
          <p className="mt-3 text-[28px] font-bold leading-none tracking-tight">
            {formatCurrency(resumo.total)}
          </p>
          {/* A divisão entre o que foi para a autopeças e o que foi para o
              mecânico. As manutenções antigas não têm essa separação, e
              aparecem à parte em vez de serem chutadas para um dos lados. */}
          <div className="mt-3 space-y-1 border-t border-border pt-2.5 text-xs">
            <p className="flex justify-between text-muted">
              <span>Peças</span>
              <span className="tabular-nums text-foreground">
                {formatCurrency(gasto.pecas)}
              </span>
            </p>
            <p className="flex justify-between text-muted">
              <span>Mão de obra</span>
              <span className="tabular-nums text-foreground">
                {formatCurrency(gasto.maoDeObra)}
              </span>
            </p>
            {gasto.semDetalhamento > 0 && (
              <p className="flex justify-between text-muted">
                <span>Sem detalhamento</span>
                <span className="tabular-nums">{formatCurrency(gasto.semDetalhamento)}</span>
              </p>
            )}
          </div>
        </div>

        <div className="card-sheen rounded-2xl border border-border bg-surface p-5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
            <span className="size-2.5 rounded-[3px] bg-serie-frota" />
            Carros da frota
          </p>
          <p className="mt-3 text-[28px] font-bold leading-none tracking-tight">
            {formatCurrency(resumo.porCategoria.FROTA.total)}
          </p>
          <p className="mt-2 text-xs text-muted">
            {resumo.porCategoria.FROTA.quantidade}{" "}
            {resumo.porCategoria.FROTA.quantidade === 1 ? "manutenção" : "manutenções"}
          </p>
        </div>

        <div className="card-sheen rounded-2xl border border-border bg-surface p-5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
            <span className="size-2.5 rounded-[3px] bg-serie-avulso" />
            Avulsos
          </p>
          <p className="mt-3 text-[28px] font-bold leading-none tracking-tight">
            {formatCurrency(resumo.porCategoria.AVULSO.total)}
          </p>
          <p className="mt-2 text-xs text-muted">
            {resumo.porCategoria.AVULSO.quantidade === 0
              ? "Carros de fora da frota"
              : `${resumo.porCategoria.AVULSO.quantidade} ${
                  resumo.porCategoria.AVULSO.quantidade === 1 ? "serviço" : "serviços"
                } em carro de fora da frota`}
          </p>
        </div>
      </section>

      {/* ── Gráficos ──────────────────────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold">Gasto por mês</h2>
          <p className="mb-5 mt-1 text-xs text-muted">
            Últimos 6 meses, frota e avulsos separados
          </p>
          <GastoPorMes meses={resumo.meses} series={SERIES_GASTO} />
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold">Onde foi o gasto</h2>
          <p className="mb-5 mt-1 text-xs text-muted">
            Divisão do total entre a frota e os avulsos
          </p>
          <BarraProporcao
            fatias={composicao}
            vazio="Nenhuma manutenção registrada ainda."
          />
        </div>
      </section>

      {/* ── Lista ─────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Histórico</h2>
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map((f) => {
              const ativo = f.key === filtro;
              return (
                <Link
                  key={f.key}
                  href={f.key === "todos" ? "/manutencao" : `/manutencao?filtro=${f.key}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    ativo
                      ? "border-brand/40 bg-brand/10 text-brand"
                      : "border-border text-muted hover:border-border-strong hover:text-foreground"
                  )}
                >
                  {f.label}
                </Link>
              );
            })}
          </div>
        </div>

        {lista.length === 0 ? (
          <EmptyState
            title={
              filtro === "todos"
                ? "Nenhuma manutenção registrada"
                : "Nada neste filtro"
            }
            description={
              filtro === "todos"
                ? "Ao registrar, o carro entra em manutenção. Ao concluir, o desconto é calculado."
                : "Tente outro filtro para ver as demais manutenções."
            }
            action={
              filtro === "todos" ? (
                <LinkButton href="/manutencao/nova">+ Nova manutenção</LinkButton>
              ) : (
                <LinkButton href="/manutencao" variant="ghost">
                  Ver todas
                </LinkButton>
              )
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Veículo</Th>
                <Th>Tipo</Th>
                <Th>Início</Th>
                <Th>Fim</Th>
                <Th>Custo</Th>
                <Th>Desconto</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => {
                const carro = carroDaManutencao(m);
                return (
                  <tr key={m.id}>
                    <Td>
                      <span className="flex items-center gap-2 whitespace-nowrap font-medium">
                        {carro.placa}
                        {carro.avulso && (
                          <span className="rounded-full border border-serie-avulso/40 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-serie-avulso">
                            Avulso
                          </span>
                        )}
                      </span>
                      {carro.modelo && (
                        <span
                          title={carro.modelo}
                          className="block max-w-[13rem] truncate text-xs text-muted"
                        >
                          {carro.modelo}
                        </span>
                      )}
                    </Td>
                    <Td>{m.type}</Td>
                    <Td>{formatDateTime(m.startAt)}</Td>
                    <Td>{m.endAt ? formatDateTime(m.endAt) : "—"}</Td>
                    <Td className="tabular-nums">
                      {m.cost ? formatCurrency(Number(m.cost)) : "—"}
                      {/* A quebra fica sob o total em vez de virar duas
                          colunas: o que se procura ao bater o olho é quanto
                          custou — a divisão vem depois. */}
                      {temDetalhamento(m) && (
                        <span className="block text-xs font-normal text-muted">
                          peça {formatCurrency(Number(m.partsCost ?? 0))} · serviço{" "}
                          {formatCurrency(Number(m.laborCost ?? 0))}
                        </span>
                      )}
                      {m.partsSupplier && (
                        <span className="block text-xs font-normal text-muted">
                          peça de {m.partsSupplier}
                        </span>
                      )}
                    </Td>
                    <Td className="tabular-nums">
                      {m.downtimeDiscount
                        ? formatCurrency(Number(m.downtimeDiscount))
                        : "—"}
                    </Td>
                    <Td>
                      <Badge tone={MAINTENANCE_STATUS[m.status].tone}>
                        {MAINTENANCE_STATUS[m.status].label}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        {m.status === "EM_ANDAMENTO" ? (
                          <>
                            <ActionButton
                              action={concluirManutencao.bind(null, m.id)}
                              label="Concluir"
                              className="text-success hover:text-success"
                              confirmMessage="Concluir a manutenção agora? O desconto será calculado."
                            />
                            <ActionButton
                              action={cancelarManutencao.bind(null, m.id)}
                              label="Cancelar"
                              className="hover:text-danger"
                              confirmMessage="Cancelar esta manutenção?"
                            />
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}

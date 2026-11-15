import { requireCan } from "@/lib/session";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, EmptyState, LinkButton } from "@/components/ui";
import { OIL_STATUS } from "@/lib/labels";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { brtDateTimeValue, daysSince, KM_CYCLE_DAYS } from "@/lib/dates";
import { buildKmMessage, buildWhatsAppLink, driverLink } from "@/lib/whatsapp";
import { EntradaManutencaoButton, SaidaManutencaoButton } from "./MaintenanceDialog";

export const dynamic = "force-dynamic";

export default async function MotoristasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireCan("operacao");
  const { q = "" } = await searchParams;

  const contracts = await prisma.contract.findMany({
    where: { status: "ATIVO" },
    include: {
      customer: true,
      vehicle: {
        include: {
          maintenances: {
            where: { status: "EM_ANDAMENTO" },
            orderBy: { startAt: "desc" },
            take: 1,
          },
        },
      },
      kmRecords: { orderBy: { createdAt: "desc" }, take: 1 },
      kmRequests: {
        where: { status: { in: ["PENDENTE", "ENVIADO"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { startDate: "asc" },
  });

  const search = q.trim().toLowerCase();
  const rows = contracts.filter((c) => {
    if (!search) return true;
    return (
      c.customer.name.toLowerCase().includes(search) ||
      c.vehicle.plate.toLowerCase().includes(search) ||
      (c.vehicle.model ?? "").toLowerCase().includes(search)
    );
  });

  const emManutencao = rows.filter((c) => c.vehicle.maintenances.length > 0).length;
  const now = new Date();
  const nowValue = brtDateTimeValue(now);

  return (
    <div>
      <PageHeader
        title="Motoristas & Carros"
        description={`${contracts.length} locação(ões) em andamento${
          emManutencao ? ` · ${emManutencao} parado(s) em manutenção` : ""
        }`}
        action={<LinkButton href="/contratos/gerar">+ Nova locação</LinkButton>}
      />

      {/* Busca */}
      <form className="mb-5" action="/motoristas">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por motorista, placa ou modelo..."
          className="w-full max-w-sm rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-neon"
        />
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="Nenhum motorista encontrado"
          description={
            search
              ? "Tente limpar a busca."
              : "Quando houver locações ativas, elas aparecem aqui."
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => {
            const v = c.vehicle;
            const maintenance = v.maintenances[0] ?? null;
            const lastKm = c.kmRecords[0] ?? null;
            const lastKmAt = lastKm?.createdAt ?? c.lastKmRequestDate ?? null;
            const kmAge = daysSince(lastKmAt, now);
            const kmOverdue = kmAge != null && kmAge > KM_CYCLE_DAYS;

            const pending = c.kmRequests[0] ?? null;
            const waLink = buildWhatsAppLink(
              c.customer.phone,
              pending
                ? buildKmMessage({
                    model: v.model,
                    plate: v.plate,
                    link: driverLink(pending.token),
                  })
                : `Olá, ${c.customer.name.split(" ")[0]}! Tudo bem?`
            );

            return (
              <article
                key={c.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
              >
                {/* Cabeçalho: motorista */}
                <div className="min-w-0">
                  <Link
                    href={`/contratos/${c.id}`}
                    className="block truncate font-semibold hover:text-neon"
                  >
                    {c.customer.name}
                  </Link>
                  <p className="truncate text-xs text-muted">
                    {c.customer.phone ?? "sem telefone"}
                  </p>
                </div>

                {/* Veículo */}
                <div className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">{v.plate}</span>
                    <span className="truncate text-xs text-muted">{v.model ?? "—"}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                    <span className="tabular-nums">
                      {v.currentKm.toLocaleString("pt-BR")} km
                    </span>
                    <Badge tone={OIL_STATUS[v.oilStatus].tone}>
                      Óleo: {OIL_STATUS[v.oilStatus].label}
                    </Badge>
                  </div>
                </div>

                {/* Situação da KM */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted">Última KM</span>
                  {kmAge == null ? (
                    <Badge tone="default">nunca enviada</Badge>
                  ) : (
                    <Badge tone={kmOverdue ? "danger" : kmAge > KM_CYCLE_DAYS - 3 ? "warning" : "success"}>
                      há {kmAge} dia{kmAge === 1 ? "" : "s"}
                    </Badge>
                  )}
                </div>

                {/* Valor semanal */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted">Semanal</span>
                  <span className="tabular-nums font-medium">
                    {Number(c.weeklyValue ?? 0) > 0 ? (
                      formatCurrency(Number(c.weeklyValue))
                    ) : (
                      <span className="text-warning">a definir</span>
                    )}
                  </span>
                </div>

                {/* Manutenção em aberto */}
                {maintenance && (
                  <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs">
                    <p className="font-semibold text-warning">Parado em manutenção</p>
                    <p className="mt-1 text-muted">
                      {maintenance.type}
                      {maintenance.workshop ? ` · ${maintenance.workshop}` : ""}
                    </p>
                    <p className="text-muted">Entrada: {formatDateTime(maintenance.startAt)}</p>
                  </div>
                )}

                {/* Ações */}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  {maintenance ? (
                    <SaidaManutencaoButton
                      maintenanceId={maintenance.id}
                      plate={v.plate}
                      nowValue={nowValue}
                    />
                  ) : (
                    <EntradaManutencaoButton
                      vehicleId={v.id}
                      plate={v.plate}
                      nowValue={nowValue}
                    />
                  )}

                  {waLink && (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-success/40 px-3 py-1.5 text-xs font-semibold text-success transition hover:bg-success/10"
                    >
                      WhatsApp
                    </a>
                  )}

                  <Link
                    href={`/contratos/${c.id}#devolucao`}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition hover:text-foreground"
                  >
                    Devolução
                  </Link>

                  <Link
                    href={`/contratos/${c.id}`}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition hover:text-foreground"
                  >
                    Ficha
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

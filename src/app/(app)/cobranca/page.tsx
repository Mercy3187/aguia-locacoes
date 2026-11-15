import { requireCan } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { ActionButton } from "@/components/ActionButton";
import { formatCurrency } from "@/lib/utils";
import { marcarCobrado } from "./actions";

export const dynamic = "force-dynamic";

export default async function CobrancaPage() {
  await requireCan("financeiro");
  const contracts = await prisma.contract.findMany({
    where: { status: "ATIVO" },
    include: {
      customer: true,
      vehicle: true,
      adjustments: { where: { settled: false } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = contracts.map((c) => {
    const base = Number(c.weeklyValue ?? 0);
    let fines = 0;
    let discounts = 0;
    for (const a of c.adjustments) {
      const amt = Number(a.amount);
      if (amt >= 0) fines += amt;
      else discounts += amt; // negativo
    }
    const net = base + fines + discounts;
    return { c, base, fines, discounts, net, hasAdjustments: c.adjustments.length > 0 };
  });

  return (
    <div>
      <PageHeader
        title="Cobrança"
        description="Valor devido na próxima semana (com multas e descontos)"
      />

      {rows.length === 0 ? (
        <EmptyState title="Nenhum contrato ativo" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map(({ c, base, fines, discounts, net, hasAdjustments }) => (
            <div key={c.id} className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{c.customer.name}</p>
                  <p className="text-sm text-muted">
                    {c.vehicle.plate} · {c.vehicle.model}
                  </p>
                </div>
                {hasAdjustments && <Badge tone="warning">Com ajustes</Badge>}
              </div>

              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">Valor semanal</dt>
                  <dd className="tabular-nums">{formatCurrency(base)}</dd>
                </div>
                {fines > 0 && (
                  <div className="flex justify-between text-danger">
                    <dt>+ Multas (KM)</dt>
                    <dd className="tabular-nums">{formatCurrency(fines)}</dd>
                  </div>
                )}
                {discounts < 0 && (
                  <div className="flex justify-between text-success">
                    <dt>− Desconto (manutenção)</dt>
                    <dd className="tabular-nums">{formatCurrency(discounts)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
                  <dt>Total a cobrar</dt>
                  <dd className="tabular-nums text-neon">{formatCurrency(net)}</dd>
                </div>
              </dl>

              {hasAdjustments && (
                <div className="mt-4 border-t border-border pt-3">
                  <ActionButton
                    action={marcarCobrado.bind(null, c.id)}
                    label="Marcar como cobrado"
                    className="text-neon hover:text-neon"
                    confirmMessage="Confirmar que este valor foi cobrado? Os ajustes serão zerados."
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { requireCan } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Table, Th, Td, Badge } from "@/components/ui";
import { StatCard } from "@/components/StatCard";
import { VEHICLE_STATUS } from "@/lib/labels";
import { carroDaManutencao, somarPecaMaoDeObra } from "@/lib/manutencao";
import { formatCurrency } from "@/lib/utils";
import type { VehicleStatus } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  await requireCan("relatorios");
  const [
    activeContracts,
    finesAll,
    finesPending,
    discounts,
    maintCost,
    vehiclesByStatus,
    kmTotal,
    kmSuspeito,
    maintenances,
    contractsByStatus,
  ] = await Promise.all([
    prisma.contract.findMany({ where: { status: "ATIVO" }, select: { weeklyValue: true } }),
    prisma.contractAdjustment.aggregate({ where: { type: "MULTA_KM" }, _sum: { amount: true } }),
    prisma.contractAdjustment.aggregate({
      where: { type: "MULTA_KM", settled: false },
      _sum: { amount: true },
    }),
    prisma.contractAdjustment.aggregate({
      where: { type: "DESCONTO_MANUTENCAO" },
      _sum: { amount: true },
    }),
    prisma.maintenance.aggregate({ _sum: { cost: true } }),
    prisma.vehicle.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.kmRecord.count(),
    prisma.kmRecord.count({ where: { validationStatus: "SUSPEITO" } }),
    prisma.maintenance.findMany({
      select: {
        cost: true,
        partsCost: true,
        laborCost: true,
        vehicleId: true,
        avulsoPlate: true,
        avulsoModel: true,
        vehicle: { select: { plate: true } },
      },
    }),
    prisma.contract.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const weekly = activeContracts.reduce((s, c) => s + Number(c.weeklyValue ?? 0), 0);
  const monthly = weekly * 4.33;
  const totalFines = Number(finesAll._sum.amount ?? 0);
  const pendingFines = Number(finesPending._sum.amount ?? 0);
  const totalDiscounts = Math.abs(Number(discounts._sum.amount ?? 0));
  const totalMaintCost = Number(maintCost._sum.cost ?? 0);
  const gastoManut = somarPecaMaoDeObra(maintenances);

  // Custo de manutenção por veículo (top 5). Carro avulso não está na frota,
  // mas o gasto é real e já está somado no total acima — deixá-lo de fora
  // daria uma lista que não fecha com o número que está logo ao lado.
  const byVehicle = new Map<string, number>();
  for (const m of maintenances) {
    const carro = carroDaManutencao(m);
    const chave = carro.avulso ? `${carro.placa} (avulso)` : carro.placa;
    byVehicle.set(chave, (byVehicle.get(chave) ?? 0) + Number(m.cost ?? 0));
  }
  const topMaint = [...byVehicle.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="space-y-8">
      <PageHeader title="Relatórios" description="Visão consolidada da operação" />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Financeiro</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Receita semanal (est.)" value={formatCurrency(weekly)} tone="success" />
          <StatCard label="Receita mensal (est.)" value={formatCurrency(monthly)} tone="success" />
          <StatCard label="Multas pendentes" value={formatCurrency(pendingFines)} tone="danger" />
          <StatCard label="Multas (total)" value={formatCurrency(totalFines)} />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Descontos concedidos" value={formatCurrency(totalDiscounts)} tone="warning" />
          <StatCard label="Custo de manutenções" value={formatCurrency(totalMaintCost)} tone="warning" />
          {/* Peça e mão de obra são desembolsos para gente diferente — a
              autopeças e o mecânico —, então valem número próprio aqui. */}
          <StatCard label="Peças" value={formatCurrency(gastoManut.pecas)} />
          <StatCard label="Mão de obra" value={formatCurrency(gastoManut.maoDeObra)} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Quilometragem</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Registros de KM" value={kmTotal} tone="neon" />
          <StatCard label="Registros suspeitos" value={kmSuspeito} tone="purple" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Frota por status</h2>
        <div className="flex flex-wrap gap-2">
          {vehiclesByStatus.map((v) => (
            <Badge key={v.status} tone={VEHICLE_STATUS[v.status as VehicleStatus].tone}>
              {VEHICLE_STATUS[v.status as VehicleStatus].label}: {v._count._all}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {contractsByStatus.map((c) => (
            <span key={c.status} className="rounded-full border border-border px-3 py-1 text-xs text-muted">
              Contratos {c.status.toLowerCase()}: {c._count._all}
            </span>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Maior custo de manutenção (por veículo)
        </h2>
        {topMaint.length === 0 ? (
          <p className="text-sm text-muted">Sem custos de manutenção registrados.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Veículo</Th>
                <Th>Custo total</Th>
              </tr>
            </thead>
            <tbody>
              {topMaint.map(([plate, cost]) => (
                <tr key={plate}>
                  <Td className="font-medium">{plate}</Td>
                  <Td className="tabular-nums">{formatCurrency(cost)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}

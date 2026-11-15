import { prisma } from "@/lib/prisma";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type RankingItem = {
  plate: string;
  model: string | null;
  revenue: number;
};

export async function getDashboardStats() {
  const now = new Date();

  const [
    totalVehicles,
    rented,
    available,
    maintenance,
    activeContracts,
    pendingKm,
    overdueKm,
    oilSoon,
    oilOverdue,
    activeForRevenue,
    contractsForRanking,
    pendingFinesAgg,
  ] = await Promise.all([
    prisma.vehicle.count(),
    prisma.vehicle.count({ where: { status: "ALUGADO" } }),
    prisma.vehicle.count({ where: { status: "DISPONIVEL" } }),
    prisma.vehicle.count({ where: { status: "MANUTENCAO" } }),
    prisma.contract.count({ where: { status: "ATIVO" } }),
    prisma.kmRequest.count({
      where: { status: { in: ["PENDENTE", "ENVIADO"] }, usedAt: null },
    }),
    prisma.contract.count({
      where: { status: "ATIVO", nextKmRequestDate: { lt: now } },
    }),
    prisma.vehicle.count({ where: { oilStatus: "AMARELO" } }),
    prisma.vehicle.count({ where: { oilStatus: "VERMELHO" } }),
    prisma.contract.findMany({
      where: { status: "ATIVO" },
      select: { weeklyValue: true },
    }),
    prisma.contract.findMany({
      where: { weeklyValue: { not: null } },
      include: { vehicle: { select: { plate: true, model: true } } },
    }),
    prisma.contractAdjustment.aggregate({
      where: { type: "MULTA_KM", settled: false },
      _sum: { amount: true },
    }),
  ]);

  const weeklyRevenue = activeForRevenue.reduce(
    (sum, c) => sum + Number(c.weeklyValue ?? 0),
    0
  );
  const monthlyRevenue = weeklyRevenue * 4.33;

  // Ranking: receita estimada acumulada por veículo (valor semanal × semanas de contrato)
  const byVehicle = new Map<string, RankingItem>();
  for (const c of contractsForRanking) {
    // Até a devolução real; contrato ativo vai até hoje (o `endDate` dele é o
    // fim do lote de faturas, que fica no futuro e inflaria a conta).
    const end = c.returnedAt ?? (c.status === "ATIVO" ? now : (c.endDate ?? now));
    const weeks = Math.max(1, Math.round((end.getTime() - c.startDate.getTime()) / WEEK_MS));
    const revenue = Number(c.weeklyValue ?? 0) * weeks;
    const current =
      byVehicle.get(c.vehicleId) ??
      { plate: c.vehicle.plate, model: c.vehicle.model, revenue: 0 };
    current.revenue += revenue;
    byVehicle.set(c.vehicleId, current);
  }
  const ranking = [...byVehicle.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return {
    totalVehicles,
    rented,
    available,
    maintenance,
    activeContracts,
    pendingKm,
    overdueKm,
    oilSoon,
    oilOverdue,
    weeklyRevenue,
    monthlyRevenue,
    pendingFines: Number(pendingFinesAgg._sum.amount ?? 0),
    ranking,
  };
}

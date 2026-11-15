/**
 * Prova que carregar relacoes por JOIN devolve exatamente os mesmos dados que
 * o padrao, em TODA consulta com relacao que o app faz.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { configConexao } from "../src/lib/db-conexao";

const adapter = new PrismaPg({ ...configConexao(process.env.DATABASE_URL!), max: 15, keepAlive: true });
const base = new PrismaClient({ adapter });

const OPERACOES = new Set([
  "findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow",
]);

const comJoin = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ operation, args, query }) {
        const a = args as Record<string, unknown>;
        if (OPERACOES.has(operation) && (a?.include || a?.select)) {
          return query({ ...a, relationLoadStrategy: "join" } as never);
        }
        return query(args);
      },
    },
  },
});

await base.vehicle.count();

/** Todas as consultas com relacao que existem nas telas. */
const consultas: Record<string, (p: typeof base) => Promise<unknown>> = {
  "motoristas": (p) => p.contract.findMany({
    where: { status: "ATIVO" },
    include: {
      customer: true,
      vehicle: { include: { maintenances: { where: { status: "EM_ANDAMENTO" }, orderBy: { startAt: "desc" }, take: 1 } } },
      kmRecords: { orderBy: { createdAt: "desc" }, take: 1 },
      kmRequests: { where: { status: { in: ["PENDENTE", "ENVIADO"] } }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { startDate: "asc" },
  }),
  "manutencao lista": (p) => p.maintenance.findMany({
    orderBy: [{ status: "asc" }, { startAt: "desc" }],
    include: { vehicle: true, contract: { include: { customer: true } } }, take: 200,
  }),
  "manutencao resumo": (p) => p.maintenance.findMany({
    where: { status: { not: "CANCELADA" } },
    select: { cost: true, startAt: true, vehicleId: true },
  }),
  "quilometragem contratos": (p) => p.contract.findMany({
    where: { status: "ATIVO" },
    include: { customer: true, vehicle: true,
      kmRequests: { orderBy: { createdAt: "desc" }, take: 1 },
      kmRecords: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { nextKmRequestDate: "asc" },
  }),
  "quilometragem pendentes": (p) => p.kmRecord.findMany({
    where: { appliedAt: null }, orderBy: { createdAt: "asc" },
    include: { vehicle: true, customer: true },
  }),
  "registros km": (p) => p.kmRecord.findMany({
    orderBy: { createdAt: "desc" }, take: 40, include: { vehicle: true, customer: true },
  }),
  "oleo frota": (p) => p.vehicle.findMany({
    where: { status: { not: "VENDIDO" } }, orderBy: [{ oilStatus: "desc" }, { plate: "asc" }],
    include: { contracts: { where: { status: "ATIVO" }, orderBy: { startDate: "desc" }, take: 1,
                            select: { customer: { select: { name: true } } } } },
  }),
  "oleo trocas": (p) => p.oilChange.findMany({ orderBy: { date: "desc" }, take: 20, include: { vehicle: true } }),
  "inadimplencia": (p) => p.payment.findMany({
    include: { contract: { include: { vehicle: true, customer: true } }, customer: true },
  }),
  "cobranca": (p) => p.contract.findMany({
    where: { status: "ATIVO" },
    include: { customer: true, vehicle: true, adjustments: { where: { settled: false } } },
  }),
  "caucoes": (p) => p.contract.findMany({ include: { customer: true, vehicle: true } }),
  "contratos": (p) => p.contract.findMany({ include: { customer: true, vehicle: true } }),
  "clientes (_count)": (p) => p.customer.findMany({
    orderBy: { name: "asc" }, include: { _count: { select: { contracts: true } } },
  }),
  "dashboard ranking": (p) => p.contract.findMany({
    where: { weeklyValue: { not: null } }, include: { vehicle: { select: { plate: true, model: true } } },
  }),
  "alerts contratos": (p) => p.contract.findMany({
    where: { status: "ATIVO" }, include: { kmRecords: { orderBy: { createdAt: "desc" }, take: 1 } },
  }),
  "auditoria": (p) => p.auditLog.findMany({
    orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true, email: true } } },
  }),
  "fechamento": (p) => p.vehicle.findMany({
    include: { contracts: { include: { customer: true } }, maintenances: true },
  }),
};

const mediana = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
async function medir(fn: () => Promise<unknown>) {
  const t: number[] = [];
  for (let i = 0; i < 5; i++) { const a = Date.now(); await fn(); t.push(Date.now() - a); }
  return mediana(t.slice(1));
}

console.log("\n  CONSULTA                    PADRAO      JOIN    GANHO   DADOS IGUAIS");
let falhas = 0, somaP = 0, somaJ = 0;
for (const [nome, fn] of Object.entries(consultas)) {
  try {
    const p = await medir(() => fn(base));
    const j = await medir(() => fn(comJoin as unknown as typeof base));
    const dp = JSON.stringify(await fn(base));
    const dj = JSON.stringify(await fn(comJoin as unknown as typeof base));
    const iguais = dp === dj;
    if (!iguais) falhas++;
    somaP += p; somaJ += j;
    console.log(
      `  ${nome.padEnd(26)} ${String(p).padStart(6)}ms ${String(j).padStart(7)}ms   ${(p / j).toFixed(1)}x   ${
        iguais ? "sim" : "*** NAO ***"
      }`
    );
  } catch (e) {
    falhas++;
    console.log(`  ${nome.padEnd(26)} ERRO: ${(e as Error).message.slice(0, 70)}`);
  }
}
console.log(`\n  Soma: ${somaP}ms -> ${somaJ}ms  (${(somaP / somaJ).toFixed(1)}x)`);
console.log(falhas === 0 ? "  Todas devolveram dados identicos." : `  ${falhas} consulta(s) com problema.`);
await base.$disconnect();
process.exit(falhas ? 1 : 0);

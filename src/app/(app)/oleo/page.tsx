import { requireCan } from "@/lib/session";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSignedUrls } from "@/lib/storage";
import {
  PageHeader,
  LinkButton,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
} from "@/components/ui";
import { OIL_STATUS } from "@/lib/labels";
import { formatCurrency, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Nome do carro para exibição: "Chevrolet Onix Hatch Joy 1.0 8V Flex".
 *
 * Há veículos cadastrados com nome de catálogo — marca
 * "GM - CHEVROLET (AUTOMÓVEIS)" e modelo repetindo a marca na frente. Numa
 * célula de tabela isso vira uma linha de ruído, então tiramos o que não
 * identifica o carro. O que sobra (motor, combustível) fica: numa tela de
 * troca de óleo, saber que o motor é 1.0 flex não é detalhe supérfluo.
 */
function nomeDoCarro(v: { brand: string | null; model: string | null }): string {
  const limpar = (s: string | null) =>
    (s ?? "").replace(/\(.*?\)/g, " ").replace(/^GM\s*-\s*/i, "").trim();
  const marca = limpar(v.brand);
  const modelo = limpar(v.model);
  // Modelo que já começa com a marca ("Fiat Mobi Like" num carro FIAT) não
  // precisa dela de novo na frente.
  const nome =
    marca && modelo.toLowerCase().startsWith(marca.toLowerCase())
      ? modelo
      : [marca, modelo].filter(Boolean).join(" ");
  return nome.replace(/\s+/g, " ").trim();
}

export default async function OleoPage() {
  await requireCan("operacao");
  const [vehicles, changes] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status: { not: "VENDIDO" } },
      orderBy: [{ oilStatus: "desc" }, { plate: "asc" }],
      // Quem está com o carro sai do contrato ATIVO. O veículo acumula
      // contratos ao longo do tempo, e é o contrato que carrega o motorista —
      // por isso filtramos pelo que está em vigor em vez de pegar o último
      // criado, senão um contrato encerrado ontem continuaria dando o nome.
      include: {
        contracts: {
          where: { status: "ATIVO" },
          orderBy: { startDate: "desc" },
          take: 1,
          select: { customer: { select: { name: true } } },
        },
      },
    }),
    prisma.oilChange.findMany({
      orderBy: { date: "desc" },
      take: 20,
      include: { vehicle: true },
    }),
  ]);

  const alerts = vehicles.filter((v) => v.oilStatus !== "VERDE");

  // Uma chamada só para assinar as notas de todas as trocas da lista.
  const notas = await getSignedUrls(changes.map((c) => c.invoiceUrl));
  const changesWithInvoice = changes.map((c) => ({
    change: c,
    invoiceUrl: (c.invoiceUrl && notas.get(c.invoiceUrl)) || null,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Troca de Óleo"
        description="Controle de trocas e alertas por quilometragem"
        action={<LinkButton href="/oleo/nova">+ Registrar troca</LinkButton>}
      />

      {alerts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Alertas ({alerts.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {alerts.map((v) => {
              const carro = nomeDoCarro(v);
              const motorista = v.contracts[0]?.customer.name ?? null;
              return (
              <div key={v.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-semibold">{v.plate}</span>
                    {carro && <span className="block truncate text-xs text-muted">{carro}</span>}
                  </div>
                  <Badge tone={OIL_STATUS[v.oilStatus].tone}>{OIL_STATUS[v.oilStatus].label}</Badge>
                </div>
                <p className="mt-2 truncate text-xs text-muted">
                  Com: {motorista ?? "sem locação ativa"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Atual: {v.currentKm.toLocaleString("pt-BR")} km · Troca:{" "}
                  {v.nextOilChangeKm ? v.nextOilChangeKm.toLocaleString("pt-BR") : "—"} km
                </p>
                <Link
                  href={`/oleo/nova?vehicleId=${v.id}`}
                  className="mt-2 inline-block text-sm text-neon hover:underline"
                >
                  Registrar troca
                </Link>
              </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Frota</h2>
        <Table>
          <thead>
            <tr>
              <Th>Veículo</Th>
              <Th>Motorista</Th>
              <Th>KM atual</Th>
              <Th>Última troca</Th>
              <Th>Próxima troca</Th>
              <Th>Status</Th>
              <Th>Ação</Th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => {
              const carro = nomeDoCarro(v);
              const motorista = v.contracts[0]?.customer.name ?? null;
              return (
              <tr key={v.id}>
                <Td>
                  <span className="font-medium">{v.plate}</span>
                  {carro && (
                    <span
                      title={carro}
                      className="block max-w-[15rem] truncate text-xs text-muted"
                    >
                      {carro}
                    </span>
                  )}
                </Td>
                <Td>
                  {motorista ? (
                    <span title={motorista} className="block max-w-[14rem] truncate">
                      {motorista}
                    </span>
                  ) : (
                    <span className="text-muted">sem locação ativa</span>
                  )}
                </Td>
                <Td className="tabular-nums">{v.currentKm.toLocaleString("pt-BR")}</Td>
                <Td className="tabular-nums">
                  {v.lastOilChangeKm != null ? v.lastOilChangeKm.toLocaleString("pt-BR") : "—"}
                </Td>
                <Td className="tabular-nums">
                  {v.nextOilChangeKm != null ? v.nextOilChangeKm.toLocaleString("pt-BR") : "—"}
                </Td>
                <Td>
                  <Badge tone={OIL_STATUS[v.oilStatus].tone}>{OIL_STATUS[v.oilStatus].label}</Badge>
                </Td>
                <Td>
                  <Link
                    href={`/oleo/nova?vehicleId=${v.id}`}
                    className="text-sm text-neon hover:underline"
                  >
                    Registrar troca
                  </Link>
                </Td>
              </tr>
              );
            })}
          </tbody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Histórico de trocas
        </h2>
        {changesWithInvoice.length === 0 ? (
          <EmptyState title="Nenhuma troca registrada" description="Registre a primeira troca de óleo." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Veículo</Th>
                <Th>KM</Th>
                <Th>Óleo</Th>
                <Th>Oficina</Th>
                <Th>Valor</Th>
                <Th>Nota</Th>
              </tr>
            </thead>
            <tbody>
              {changesWithInvoice.map(({ change: c, invoiceUrl }) => (
                <tr key={c.id}>
                  <Td>{formatDate(c.date)}</Td>
                  <Td className="font-medium">{c.vehicle.plate}</Td>
                  <Td className="tabular-nums">{c.lastChangeKm.toLocaleString("pt-BR")}</Td>
                  <Td>{c.oilType || "—"}</Td>
                  <Td>{c.workshop || "—"}</Td>
                  <Td className="tabular-nums">{c.value ? formatCurrency(Number(c.value)) : "—"}</Td>
                  <Td>
                    {invoiceUrl ? (
                      <a
                        href={invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-neon hover:underline"
                      >
                        Ver
                      </a>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}

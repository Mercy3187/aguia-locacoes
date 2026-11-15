import { requireCan } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { StatCard } from "@/components/StatCard";
import { ActionButton } from "@/components/ActionButton";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { cobrarMotoristaPelaMulta, marcarPagaAutoridade, desfazerPagaAutoridade } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_DEBT_LABEL: Record<string, { label: string; tone: "default" | "warning" | "success" | "danger" }> = {
  ABERTA: { label: "Cobrada — em aberto", tone: "warning" },
  COBRADA: { label: "Cobrança emitida", tone: "warning" },
  PAGA: { label: "Motorista pagou", tone: "success" },
  CANCELADA: { label: "Cancelada", tone: "default" },
};

export default async function MultasPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  await requireCan("financeiro");
  const { filtro = "todas" } = await searchParams;

  const fines = await prisma.fine.findMany({
    include: {
      vehicle: { select: { plate: true, model: true } },
      customer: { select: { id: true, name: true } },
      debt: { select: { id: true, status: true, paidAt: true } },
    },
    orderBy: { occurredAt: "desc" },
  });

  const semResponsavel = fines.filter((f) => !f.customerId);
  const semPagamentoAutoridade = fines.filter((f) => !f.paidToAuthorityAt);
  const semCobranca = fines.filter((f) => f.customerId && !f.debtId);
  const valorTotal = fines.reduce((s, f) => s + Number(f.amount), 0);

  const visiveis = fines.filter((f) => {
    if (filtro === "sem-responsavel") return !f.customerId;
    if (filtro === "sem-pagamento-autoridade") return !f.paidToAuthorityAt;
    if (filtro === "sem-cobranca") return f.customerId && !f.debtId;
    return true;
  });

  const FILTROS = [
    { key: "todas", label: `Todas (${fines.length})` },
    { key: "sem-responsavel", label: `Sem responsável (${semResponsavel.length})` },
    { key: "sem-pagamento-autoridade", label: `A pagar ao órgão (${semPagamentoAutoridade.length})` },
    { key: "sem-cobranca", label: `A cobrar do motorista (${semCobranca.length})` },
  ] as const;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Multas"
        description="Importadas automaticamente do DETRAN-PE, carro por carro — cruzadas com o histórico de contratos pra saber quem estava dirigindo."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Multas no catálogo" value={fines.length} icon="multa" />
        <StatCard label="Valor total" value={formatCurrency(valorTotal)} icon="cobranca" tone="neon" />
        <StatCard
          label="Sem motorista identificado"
          value={semResponsavel.length}
          icon="alerta"
          tone={semResponsavel.length > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Ainda não pagas ao órgão"
          value={semPagamentoAutoridade.length}
          icon="divida"
          tone={semPagamentoAutoridade.length > 0 ? "danger" : "success"}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <a
            key={f.key}
            href={f.key === "todas" ? "/multas" : `/multas?filtro=${f.key}`}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              filtro === f.key
                ? "border-brand/50 bg-brand/10 text-brand"
                : "border-border text-muted hover:border-border-strong hover:text-foreground"
            }`}
          >
            {f.label}
          </a>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <EmptyState
          title="Nenhuma multa aqui"
          description="A extensão do Chrome importa automaticamente, carro por carro, direto do DETRAN-PE."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Infração</Th>
              <Th>Carro</Th>
              <Th>Valor</Th>
              <Th>Responsável</Th>
              <Th>Pago ao órgão</Th>
              <Th>Cobrança do motorista</Th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((f) => {
              const statusDebt = f.debt ? STATUS_DEBT_LABEL[f.debt.status] : null;
              return (
                <tr key={f.id}>
                  <Td>
                    <p className="font-medium">{formatDateTime(f.occurredAt)}</p>
                    <p className="text-xs text-muted">{f.description}</p>
                    <p className="mt-0.5 text-xs text-muted">Auto {f.ticketNumber}</p>
                  </Td>
                  <Td className="font-mono text-sm">
                    {f.vehicle.plate}
                    <p className="font-sans text-xs text-muted">{f.vehicle.model}</p>
                  </Td>
                  <Td className="text-sm font-medium">{formatCurrency(Number(f.amount))}</Td>
                  <Td className="text-sm">
                    {f.customer ? f.customer.name : <span className="text-muted">{f.responsibleNote ?? "Não identificado"}</span>}
                  </Td>
                  <Td>
                    {f.paidToAuthorityAt ? (
                      <div className="space-y-1">
                        <Badge tone="success">Paga em {formatDateTime(f.paidToAuthorityAt)}</Badge>
                        <ActionButton
                          action={desfazerPagaAutoridade.bind(null, f.id)}
                          label="Desfazer"
                          pendingLabel="Desfazendo..."
                          className="block text-xs"
                        />
                      </div>
                    ) : (
                      <ActionButton
                        action={marcarPagaAutoridade.bind(null, f.id)}
                        label="Marcar como paga"
                        pendingLabel="Salvando..."
                        confirmMessage="Confirma que a empresa já pagou essa multa ao órgão de trânsito?"
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-border-strong hover:text-foreground"
                      />
                    )}
                  </Td>
                  <Td>
                    {statusDebt ? (
                      <Badge tone={statusDebt.tone}>{statusDebt.label}</Badge>
                    ) : f.customerId ? (
                      <ActionButton
                        action={cobrarMotoristaPelaMulta.bind(null, f.id)}
                        label="Cobrar motorista"
                        pendingLabel="Lançando..."
                        confirmMessage="Lançar uma dívida pra esse motorista com o valor dessa multa?"
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-border-strong hover:text-foreground"
                      />
                    ) : (
                      <span className="text-xs text-muted">Sem motorista pra cobrar</span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}

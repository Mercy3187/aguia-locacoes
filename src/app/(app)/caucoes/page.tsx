import { requireCan } from "@/lib/session";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, EmptyState, Table, Th, Td } from "@/components/ui";
import { ActionButton } from "@/components/ActionButton";
import { StatCard } from "@/components/StatCard";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { brtDateTimeValue } from "@/lib/dates";
import {
  depositState,
  depositRemaining,
  buildCaucaoResumo,
  DEPOSIT_LABEL,
  type ResumoItem,
} from "@/lib/caucao";
import { quitarCaucao, devolverCaucao, confirmarRetirada } from "./actions";
import { EditarCaucaoButton, type CaucaoDefaults } from "./CaucaoDialog";
import { ExportarButton } from "./ExportarButton";

export const dynamic = "force-dynamic";

/** Data para o input datetime-local (vazio se não houver). */
const dtValue = (d: Date | null) => (d ? brtDateTimeValue(d) : "");

export default async function CaucoesPage() {
  await requireCan("financeiro");

  const contracts = await prisma.contract.findMany({
    where: { status: { in: ["ATIVO", "PENDENTE"] } },
    include: { customer: true, vehicle: true },
    orderBy: [{ pickupDate: "asc" }, { startDate: "desc" }],
  });

  const linhas = contracts.map((c) => {
    const estado = depositState(c);
    return {
      c,
      estado,
      total: Number(c.depositValue ?? 0),
      pago: Number(c.depositPaidValue ?? 0),
      falta: depositRemaining(c),
    };
  });

  const aReceber = linhas
    .filter((l) => l.estado === "PENDENTE" || l.estado === "PARCIAL")
    .reduce((s, l) => s + l.falta, 0);
  const emMaos = linhas
    .filter((l) => l.estado === "PAGA" || l.estado === "PARCIAL")
    .reduce((s, l) => s + l.pago, 0);
  const retiradasPendentes = linhas.filter((l) => !l.c.pickupDone && l.c.pickupDate).length;

  // Texto para o WhatsApp
  const resumo = buildCaucaoResumo(
    linhas.map<ResumoItem>((l) => ({
      nome: l.c.customer.name,
      placa: l.c.vehicle.plate,
      modelo: l.c.vehicle.model,
      total: l.total,
      pago: l.pago,
      falta: l.falta,
      estado: l.estado,
      retirada: l.c.pickupDate,
      retirou: l.c.pickupDone,
    }))
  );

  return (
    <div>
      <PageHeader
        title="Cauções & Entregas"
        description="Controle das cauções e das retiradas dos motoristas novos"
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Caução a receber" value={formatCurrency(aReceber)} tone="danger" />
        <StatCard label="Caução em caixa" value={formatCurrency(emMaos)} tone="success" />
        <StatCard label="Retiradas agendadas" value={String(retiradasPendentes)} tone="neon" />
      </div>

      {/* Exportação para o WhatsApp */}
      <section className="mb-6 rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-1 font-semibold">Resumo para o WhatsApp</h2>
        <p className="mb-3 text-sm text-muted">
          Gera a lista de cauções em aberto e as próximas retiradas, já formatada.
        </p>
        <ExportarButton resumo={resumo} />
      </section>

      {linhas.length === 0 ? (
        <EmptyState title="Nenhum contrato encontrado" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Motorista</Th>
              <Th>Veículo</Th>
              <Th>Caução</Th>
              <Th>Situação</Th>
              <Th>Retirada</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const c = l.c;
              const defaults: CaucaoDefaults = {
                contractId: c.id,
                nome: c.customer.name,
                placa: c.vehicle.plate,
                depositValue: l.total ? String(l.total).replace(".", ",") : "",
                depositPaidValue: l.pago ? String(l.pago).replace(".", ",") : "",
                depositPaidAt: dtValue(c.depositPaidAt),
                depositRefundedAt: dtValue(c.depositRefundedAt),
                depositNotes: c.depositNotes ?? "",
                pickupDate: dtValue(c.pickupDate),
                pickupDone: c.pickupDone,
                pickupNotes: c.pickupNotes ?? "",
              };

              return (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/contratos/${c.id}`} className="font-medium hover:text-neon">
                      {c.customer.name}
                    </Link>
                  </Td>

                  <Td>
                    <span className="font-mono text-xs">{c.vehicle.plate}</span>
                    <p className="text-xs text-muted">{c.vehicle.model ?? "—"}</p>
                  </Td>

                  <Td className="tabular-nums">
                    {l.total > 0 ? (
                      <>
                        <p className="font-medium">{formatCurrency(l.total)}</p>
                        {l.falta > 0 && (
                          <p className="text-xs text-danger">falta {formatCurrency(l.falta)}</p>
                        )}
                        {c.depositPaidAt && l.falta === 0 && (
                          <p className="text-xs text-muted">em {formatDate(c.depositPaidAt)}</p>
                        )}
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </Td>

                  <Td>
                    <Badge tone={DEPOSIT_LABEL[l.estado].tone}>
                      {DEPOSIT_LABEL[l.estado].label}
                    </Badge>
                    {c.depositNotes && (
                      <p className="mt-1 max-w-[14rem] text-xs text-muted">{c.depositNotes}</p>
                    )}
                  </Td>

                  <Td>
                    {c.pickupDate ? (
                      <>
                        <p className="text-xs">{formatDateTime(c.pickupDate)}</p>
                        <Badge tone={c.pickupDone ? "success" : "warning"}>
                          {c.pickupDone ? "retirado" : "agendada"}
                        </Badge>
                      </>
                    ) : (
                      <span className="text-xs text-muted">não agendada</span>
                    )}
                    {c.pickupNotes && (
                      <p className="mt-1 max-w-[12rem] text-xs text-muted">{c.pickupNotes}</p>
                    )}
                  </Td>

                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      <EditarCaucaoButton d={defaults} />

                      {(l.estado === "PENDENTE" || l.estado === "PARCIAL") && (
                        <ActionButton
                          action={quitarCaucao.bind(null, c.id)}
                          label="Quitar"
                          confirmMessage={`Registrar o recebimento de ${formatCurrency(l.falta)} de caução de ${c.customer.name}?`}
                          className="rounded-lg border border-success/40 px-3 py-1.5 text-xs text-success"
                        />
                      )}

                      {l.estado === "PAGA" && (
                        <ActionButton
                          action={devolverCaucao.bind(null, c.id)}
                          label="Devolver"
                          confirmMessage={`Marcar a caução de ${formatCurrency(l.total)} como devolvida a ${c.customer.name}?`}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs"
                        />
                      )}

                      {c.pickupDate && !c.pickupDone && (
                        <ActionButton
                          action={confirmarRetirada.bind(null, c.id)}
                          label="Confirmar retirada"
                          className="rounded-lg border border-neon/40 px-3 py-1.5 text-xs text-neon"
                        />
                      )}
                    </div>
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

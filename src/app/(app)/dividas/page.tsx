import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { PageHeader, Badge, EmptyState, Table, Th, Td } from "@/components/ui";
import { ActionButton } from "@/components/ActionButton";
import { StatCard } from "@/components/StatCard";
import { formatCurrency, formatDate } from "@/lib/utils";
import { brtDateTimeValue } from "@/lib/dates";
import { DEBT_TYPE, DEBT_STATUS, debtTitle } from "@/lib/dividas";
import { buildDividaMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import { emitirCobranca, marcarDividaPaga, cancelarDivida } from "./actions";
import { NovaDivida, type MotoristaOpcao } from "./NovaDivida";
import { CobrarDividaButton } from "./CobrarDividaButton";

export const dynamic = "force-dynamic";

export default async function DividasPage({
  searchParams,
}: {
  searchParams: Promise<{ situacao?: string }>;
}) {
  await requireCan("financeiro");
  const { situacao = "abertas" } = await searchParams;

  const [debts, contratos] = await Promise.all([
    prisma.debt.findMany({
      include: {
        customer: { select: { name: true, phone: true } },
        vehicle: { select: { plate: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 300,
    }),
    prisma.contract.findMany({
      where: { status: "ATIVO" },
      select: {
        customerId: true,
        customer: { select: { name: true } },
        vehicle: { select: { plate: true } },
      },
      orderBy: { customer: { name: "asc" } },
    }),
  ]);

  // Motoristas com locação ativa (sem repetir cliente).
  const vistos = new Set<string>();
  const motoristas: MotoristaOpcao[] = [];
  for (const c of contratos) {
    if (vistos.has(c.customerId)) continue;
    vistos.add(c.customerId);
    motoristas.push({ id: c.customerId, nome: c.customer.name, placa: c.vehicle.plate });
  }

  const emAberto = debts.filter((d) => d.status === "ABERTA" || d.status === "COBRADA");
  const aCobrar = debts.filter((d) => d.status === "ABERTA");
  const totalAberto = emAberto.reduce((s, d) => s + Number(d.amount), 0);
  const totalRecebido = debts
    .filter((d) => d.status === "PAGA")
    .reduce((s, d) => s + Number(d.amount), 0);

  const lista =
    situacao === "todas"
      ? debts
      : situacao === "pagas"
        ? debts.filter((d) => d.status === "PAGA")
        : emAberto;

  const hoje = brtDateTimeValue().slice(0, 10);
  const agora = new Date();

  const abas = [
    { key: "abertas", label: "Em aberto", n: emAberto.length },
    { key: "pagas", label: "Pagas", n: debts.length - emAberto.length },
    { key: "todas", label: "Todas", n: debts.length },
  ];

  return (
    <div>
      <PageHeader
        title="Dívidas dos motoristas"
        description="Multas de trânsito, avarias, combustível e outras cobranças avulsas"
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Em aberto" value={formatCurrency(totalAberto)} tone="danger" />
        <StatCard label="Aguardando emissão" value={String(aCobrar.length)} tone="warning" />
        <StatCard label="Já recebido" value={formatCurrency(totalRecebido)} tone="success" />
      </div>

      <div className="mb-6">
        <NovaDivida motoristas={motoristas} hoje={hoje} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {abas.map((a) => (
          <Link
            key={a.key}
            href={a.key === "abertas" ? "/dividas" : `/dividas?situacao=${a.key}`}
            className={
              situacao === a.key
                ? "rounded-lg border border-neon/40 bg-neon/10 px-3 py-1.5 text-sm font-semibold text-neon"
                : "rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:text-foreground"
            }
          >
            {a.label} <span className="tabular-nums opacity-70">({a.n})</span>
          </Link>
        ))}
      </div>

      {lista.length === 0 ? (
        <EmptyState
          title="Nenhuma dívida por aqui"
          description="Use o formulário acima para lançar uma multa, avaria ou outra cobrança."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Motorista</Th>
              <Th>Dívida</Th>
              <Th>Valor</Th>
              <Th>Vencimento</Th>
              <Th>Situação</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {lista.map((d) => {
              const valor = Number(d.amount);
              const parcelado = d.installments > 1;
              const atrasada =
                (d.status === "ABERTA" || d.status === "COBRADA") && d.dueDate < agora;
              const link = d.invoiceUrl ?? d.bankSlipUrl;
              const titulo = debtTitle({
                type: d.type,
                description: d.description,
                vehiclePlate: d.vehicle?.plate,
              });

              const waLink =
                d.status === "COBRADA" || d.status === "ABERTA"
                  ? buildWhatsAppLink(
                      d.customer.phone,
                      buildDividaMessage({
                        firstName: d.customer.name.split(" ")[0],
                        titulo: parcelado ? `${titulo} (em ${d.installments}x)` : titulo,
                        value: formatCurrency(valor),
                        dueDate: formatDate(d.dueDate),
                        link,
                      })
                    )
                  : null;

              return (
                <tr key={d.id}>
                  <Td>
                    <p className="font-medium">{d.customer.name}</p>
                    <p className="text-xs text-muted">
                      {d.vehicle?.plate ?? "—"}
                      {d.customer.phone ? ` · ${d.customer.phone}` : " · sem telefone"}
                    </p>
                  </Td>

                  <Td>
                    <p>
                      {DEBT_TYPE[d.type].emoji} {DEBT_TYPE[d.type].label}
                    </p>
                    <p className="max-w-[18rem] text-xs text-muted">{d.description}</p>
                    {d.occurredAt && (
                      <p className="text-xs text-muted">fato em {formatDate(d.occurredAt)}</p>
                    )}
                  </Td>

                  <Td className="tabular-nums">
                    <p className="font-medium">{formatCurrency(valor)}</p>
                    {parcelado && (
                      <p className="text-xs text-muted">
                        {d.installments}x de {formatCurrency(valor / d.installments)}
                      </p>
                    )}
                  </Td>

                  <Td>
                    <p className="text-sm">{formatDate(d.dueDate)}</p>
                    {atrasada && <Badge tone="danger">vencida</Badge>}
                    {d.lastChargedAt && (
                      <p className="text-xs text-muted">cobrado {formatDate(d.lastChargedAt)}</p>
                    )}
                  </Td>

                  <Td>
                    <Badge tone={DEBT_STATUS[d.status].tone}>{DEBT_STATUS[d.status].label}</Badge>
                    {parcelado && d.status === "COBRADA" && (
                      <p className="mt-1 text-xs text-muted">carnê no Asaas</p>
                    )}
                  </Td>

                  <Td>
                    <div className="flex flex-wrap items-center gap-2">
                      {d.status === "ABERTA" && (
                        <ActionButton
                          action={emitirCobranca.bind(null, d.id)}
                          label="Emitir cobrança"
                          pendingLabel="Emitindo..."
                          confirmMessage={`Emitir cobrança de ${formatCurrency(valor)}${
                            parcelado ? ` em ${d.installments}x` : ""
                          } para ${d.customer.name} no Asaas?\n\nÉ uma cobrança nova, separada da locação.`}
                          className="rounded-lg border border-neon/40 bg-neon/10 px-3 py-1.5 text-xs font-semibold text-neon"
                        />
                      )}

                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition hover:text-foreground"
                        >
                          Ver fatura
                        </a>
                      )}

                      {waLink && (
                        <CobrarDividaButton
                          debtId={d.id}
                          waLink={waLink}
                          jaCobrado={Boolean(d.lastChargedAt)}
                        />
                      )}

                      {d.status !== "PAGA" && d.status !== "CANCELADA" && (
                        <>
                          <ActionButton
                            action={marcarDividaPaga.bind(null, d.id)}
                            label="Marcar paga"
                            confirmMessage={`Confirmar o recebimento de ${formatCurrency(valor)} de ${d.customer.name}?`}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs"
                          />
                          <ActionButton
                            action={cancelarDivida.bind(null, d.id)}
                            label="Cancelar"
                            confirmMessage={
                              d.asaasPaymentId
                                ? `Cancelar esta dívida? A cobrança${parcelado ? " (carnê inteiro)" : ""} também será cancelada no Asaas.`
                                : "Cancelar esta dívida?"
                            }
                            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:text-danger"
                          />
                        </>
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

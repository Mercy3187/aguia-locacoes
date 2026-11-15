import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui";
import { CONTRACT_STATUS } from "@/lib/labels";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import {
  FATURAMENTO_LABEL,
  PERIODO_LABEL,
  PERIODO_SINGULAR,
  cronogramaFaturas,
} from "@/lib/contrato-gerar";

function Item({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{rotulo}</dt>
      <dd className="text-sm font-medium">{valor || "—"}</dd>
    </div>
  );
}

/**
 * Tudo o que foi informado na tela "Gerar Contrato", para conferência.
 * Só aparece em contrato gerado por ela — os antigos não têm esses campos.
 */
export async function ResumoContrato({ contractId }: { contractId: string }) {
  const c = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      customer: true,
      vehicle: true,
      promoter: { select: { name: true } },
      items: { orderBy: { startDate: "asc" } },
    },
  });
  if (!c || !c.billingMode || !c.periodValue || !c.invoiceCount) return null;

  const faturas = cronogramaFaturas({
    inicio: c.startDate,
    periodo: c.periodType,
    quantidade: c.invoiceCount,
    valorPeriodo: Number(c.periodValue),
    faturamento: c.billingMode,
    itens: c.items.map((it) => ({
      inicio: it.startDate,
      fim: it.endDate,
      valor: Number(it.value),
      ativo: it.active,
    })),
  });
  const total = faturas.reduce((s, f) => s + f.valor, 0);

  return (
    <div className="mb-10 space-y-4">
      <section className="rounded-2xl border border-border bg-surface p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-brand">CONTRATO</h2>
          <Badge tone={CONTRACT_STATUS[c.status].tone}>{CONTRACT_STATUS[c.status].label}</Badge>
        </div>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Item rotulo="Cliente" valor={c.customer.name} />
          <Item rotulo="CPF/CNPJ" valor={c.customer.cpfCnpj} />
          <Item rotulo="Faturamento" valor={FATURAMENTO_LABEL[c.billingMode]} />
          <Item
            rotulo="Período"
            valor={`${c.invoiceCount} × ${PERIODO_LABEL[c.periodType]}`}
          />
          <Item
            rotulo="Valor do período"
            valor={`${formatCurrency(Number(c.periodValue))} / ${PERIODO_SINGULAR[c.periodType]}`}
          />
          <Item rotulo="Início do contrato" valor={formatDate(c.startDate)} />
          <Item rotulo="Promotor" valor={c.promoter?.name} />
          <Item rotulo="Classificação" valor={c.classification} />
          <Item rotulo="Unidade de faturamento" valor={c.billingUnit} />
          <Item rotulo="Contratação e entrega" valor={c.hiringDelivery} />
          <Item rotulo="Tabela de preço" valor={c.priceTable} />
          <Item rotulo="Franquia" valor={c.kmFranchise} />
        </dl>

        <h3 className="mb-3 mt-6 text-sm font-semibold">Entrega do veículo</h3>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Item
            rotulo="Veículo"
            valor={`${c.vehicle.plate} — ${[c.vehicle.brand, c.vehicle.model].filter(Boolean).join(" ")}`}
          />
          <Item rotulo="Data de entrega" valor={c.pickupDate && formatDateTime(c.pickupDate)} />
          <Item
            rotulo="Odômetro entrega"
            valor={c.deliveryOdometer != null && `${c.deliveryOdometer.toLocaleString("pt-BR")} km`}
          />
          <Item rotulo="Combustível retirada" valor={c.deliveryFuel} />
        </dl>

        {c.returnedAt && (
          <>
            <h3 className="mb-3 mt-6 text-sm font-semibold">Devolução do veículo</h3>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <Item rotulo="Data da devolução" valor={formatDateTime(c.returnedAt)} />
              <Item
                rotulo="Odômetro devolução"
                valor={c.returnOdometer != null && `${c.returnOdometer.toLocaleString("pt-BR")} km`}
              />
              <Item rotulo="Combustível devolução" valor={c.returnFuel} />
              <Item
                rotulo="KM rodados"
                valor={
                  c.returnOdometer != null &&
                  c.deliveryOdometer != null &&
                  `${(c.returnOdometer - c.deliveryOdometer).toLocaleString("pt-BR")} km`
                }
              />
            </dl>
            {c.returnNotes && (
              <p className="mt-3 whitespace-pre-line rounded-xl border border-border bg-surface-2 p-3 text-sm">
                {c.returnNotes}
              </p>
            )}
          </>
        )}

        <h3 className="mb-3 mt-6 text-sm font-semibold">Pagamento</h3>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Item rotulo="Primeiro pagamento recebido" valor={c.firstPaymentReceived ? "Sim" : "Não"} />
          <Item rotulo="Caução" valor={c.depositValue && formatCurrency(Number(c.depositValue))} />
          <Item rotulo="Recebida em" valor={c.depositPaidAt && formatDate(c.depositPaidAt)} />
          <Item rotulo="Tipo do recebimento" valor={c.depositPaymentMethod} />
        </dl>

        {c.additionalInfo && (
          <>
            <h3 className="mb-2 mt-6 text-sm font-semibold">Informações adicionais</h3>
            <p className="whitespace-pre-line rounded-xl border border-border bg-surface-2 p-3 text-sm">
              {c.additionalInfo}
            </p>
          </>
        )}
      </section>

      {c.items.length > 0 && (
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="mb-4 text-lg font-bold text-brand">ITENS ADICIONAIS</h2>
          <ul className="divide-y divide-border text-sm">
            {c.items.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {it.description}
                  <span className="block text-xs text-muted">
                    {formatDate(it.startDate)} a {it.endDate ? formatDate(it.endDate) : "sem término"}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{formatCurrency(Number(it.value))}</span>
                  <Badge tone={it.active ? "success" : "default"}>{it.active ? "Ativo" : "Inativo"}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-lg font-bold text-brand">FATURAS</h2>
        <p className="mb-4 mt-1 text-xs text-muted">
          {faturas.length} fatura(s) · total {formatCurrency(total)} · os boletos serão emitidos no
          Asaas quando a integração estiver configurada
        </p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {faturas.map((f) => (
            <li key={f.numero} className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs">
              <p className="flex justify-between font-semibold">
                <span>{f.numero}ª fatura</span>
                <span className="tabular-nums">{formatCurrency(f.valor)}</span>
              </p>
              <p className="mt-0.5 text-muted">vence {formatDate(f.vencimento)}</p>
              <p className="text-muted">
                {formatDate(f.inicio)} a {formatDate(f.fim)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

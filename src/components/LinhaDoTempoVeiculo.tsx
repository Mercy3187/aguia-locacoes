import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui";
import { CONTRACT_STATUS } from "@/lib/labels";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import { PERIODO_SINGULAR } from "@/lib/contrato-gerar";

const DIA_MS = 24 * 60 * 60 * 1000;

const dias = (de: Date, ate: Date) => Math.max(0, Math.round((ate.getTime() - de.getTime()) / DIA_MS));

/**
 * Com quem o carro esteve, e quando — montado dos contratos do veículo.
 *
 * Entrega = `pickupDate` (ou o início do contrato, nos antigos que não têm);
 * devolução = `returnedAt`. Entre uma devolução e a entrega seguinte o carro
 * esteve parado, e isso também aparece: dia parado é dia sem receita.
 */
export async function LinhaDoTempoVeiculo({ vehicleId }: { vehicleId: string }) {
  const contratos = await prisma.contract.findMany({
    where: { vehicleId, status: { not: "CANCELADO" } },
    select: {
      id: true,
      status: true,
      startDate: true,
      pickupDate: true,
      returnedAt: true,
      updatedAt: true,
      deliveryOdometer: true,
      returnOdometer: true,
      deliveryFuel: true,
      returnFuel: true,
      periodType: true,
      periodValue: true,
      weeklyValue: true,
      customer: { select: { name: true, cpfCnpj: true, phone: true } },
    },
  });

  const agora = new Date();
  const linhas = contratos
    .map((c) => ({
      ...c,
      entrega: c.pickupDate ?? c.startDate,
      // Contrato encerrado antes de a devolução passar a ser registrada: o
      // melhor palpite é a última alteração, e a tela avisa que é estimativa.
      devolucao: c.returnedAt ?? (c.status === "ENCERRADO" ? c.updatedAt : null),
      devolucaoEstimada: !c.returnedAt && c.status === "ENCERRADO",
    }))
    .sort((a, b) => b.entrega.getTime() - a.entrega.getTime());

  if (linhas.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Linha do tempo</h2>
        <p className="mt-2 text-sm text-muted">Este veículo ainda não teve nenhum contrato.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-sm font-semibold">Linha do tempo</h2>
      <p className="mb-5 mt-1 text-xs text-muted">
        Com quem o veículo esteve em cada período, do mais recente para o mais antigo
      </p>

      <ol className="relative space-y-4 border-l border-border-strong pl-6">
        {linhas.map((l, i) => {
          const atual = l.status === "ATIVO";
          const fim = l.devolucao ?? agora;
          // O contrato seguinte na lista é o ANTERIOR no tempo.
          const anterior = linhas[i + 1];
          const parado =
            anterior?.devolucao && anterior.devolucao < l.entrega ? dias(anterior.devolucao, l.entrega) : 0;
          const valor = l.periodValue ?? l.weeklyValue;
          const unidade = l.periodValue ? PERIODO_SINGULAR[l.periodType] : "semana";
          const kmRodados =
            l.deliveryOdometer != null && l.returnOdometer != null
              ? l.returnOdometer - l.deliveryOdometer
              : null;

          return (
            <li key={l.id} className="space-y-4">
              <div className="relative">
                <span
                  aria-hidden
                  className={
                    atual
                      ? "absolute -left-[31px] top-1 size-3.5 rounded-full border-2 border-surface bg-brand"
                      : "absolute -left-[30px] top-1.5 size-3 rounded-full border-2 border-surface bg-muted"
                  }
                />
                <div className="rounded-xl border border-border bg-surface-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/contratos/${l.id}`} className="font-semibold hover:text-brand">
                        {l.customer.name}
                      </Link>
                      <p className="text-xs text-muted">
                        {[l.customer.cpfCnpj, l.customer.phone].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <Badge tone={CONTRACT_STATUS[l.status].tone}>
                      {atual ? "Com o cliente agora" : CONTRACT_STATUS[l.status].label}
                    </Badge>
                  </div>

                  <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <dt className="text-muted">Entrega</dt>
                      <dd className="font-medium">{formatDateTime(l.entrega)}</dd>
                      {(l.deliveryOdometer != null || l.deliveryFuel) && (
                        <dd className="text-muted">
                          {[
                            l.deliveryOdometer != null && `${l.deliveryOdometer.toLocaleString("pt-BR")} km`,
                            l.deliveryFuel && `tanque ${l.deliveryFuel}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </dd>
                      )}
                    </div>
                    <div>
                      <dt className="text-muted">Devolução</dt>
                      <dd className="font-medium">
                        {l.devolucao ? (
                          <>
                            {l.devolucaoEstimada ? formatDate(l.devolucao) : formatDateTime(l.devolucao)}
                            {l.devolucaoEstimada && (
                              <span className="font-normal text-muted"> (aprox.)</span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </dd>
                      {(l.returnOdometer != null || l.returnFuel) && (
                        <dd className="text-muted">
                          {[
                            l.returnOdometer != null && `${l.returnOdometer.toLocaleString("pt-BR")} km`,
                            l.returnFuel && `tanque ${l.returnFuel}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </dd>
                      )}
                    </div>
                    <div>
                      <dt className="text-muted">Tempo com o cliente</dt>
                      <dd className="font-medium">
                        {dias(l.entrega, fim)} dia(s){atual && " até hoje"}
                      </dd>
                      {kmRodados != null && (
                        <dd className="text-muted">{kmRodados.toLocaleString("pt-BR")} km rodados</dd>
                      )}
                    </div>
                    <div>
                      <dt className="text-muted">Valor</dt>
                      <dd className="font-medium">
                        {valor ? `${formatCurrency(Number(valor))} / ${unidade}` : "—"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              {parado > 0 && (
                <p className="text-xs text-muted">
                  ↓ Parado no pátio por {parado} dia(s)
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

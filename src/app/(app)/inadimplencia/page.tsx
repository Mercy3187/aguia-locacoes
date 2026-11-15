import { requireCan } from "@/lib/session";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { ActionButton } from "@/components/ActionButton";
import { StatCard } from "@/components/StatCard";
import { formatCurrency, formatDate } from "@/lib/utils";
import { daysSince } from "@/lib/dates";
import { asaasEnabled } from "@/lib/asaas";
import { emAberto } from "@/lib/asaas-sync";
import { duplicataProvavel, sugestoesDePix } from "@/lib/inadimplencia-avisos";
import { buildCobrancaMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import {
  sincronizarAsaas,
  marcarPago,
  desfazerBaixa,
  removerCobrancaFutura,
  padronizarNotificacoesAsaas,
} from "./actions";
import { CobrarButton } from "./CobrarButton";

export const dynamic = "force-dynamic";

export default async function InadimplenciaPage({
  searchParams,
}: {
  searchParams: Promise<{ tudo?: string; visao?: string }>;
}) {
  await requireCan("financeiro");
  const { tudo, visao: visaoParam } = await searchParams;
  const mostrarTudo = tudo === "1";
  const visaoExMotoristas = visaoParam === "ex-motoristas";

  if (!asaasEnabled()) {
    return (
      <div>
        <PageHeader title="Inadimplência" />
        <EmptyState
          title="Asaas não configurado"
          description="Defina ASAAS_API_KEY no ambiente para o sistema ler as cobranças."
        />
      </div>
    );
  }

  const payments = await prisma.payment.findMany({
    // Única consulta do sistema que precisa pedir o JOIN na mão: as relações
    // aqui são aninhadas em dois níveis (pagamento → contrato → veículo), e
    // nesse formato o Prisma não escolhe JOIN sozinho. Medido, com a carteira
    // inteira: 217ms sem a linha abaixo, 120ms com ela — mesmos dados.
    relationLoadStrategy: "join",
    include: {
      contract: { include: { vehicle: true, customer: true } },
      customer: true,
    },
    orderBy: { dueDate: "asc" },
  });

  const now = new Date();

  // PIX avulso que pode já cobrir uma cobrança em aberto — calculado uma vez
  // só, pra cada PIX sugerir no máximo uma cobrança (nunca a mesma prova
  // "cobrindo" várias semanas diferentes).
  const pixSugestoes = sugestoesDePix(payments);

  // Agrupa por motorista, considerando só o que está em aberto (ou tudo, se pedido)
  type Row = {
    key: string;
    name: string;
    phone: string | null;
    plate: string;
    contractId: string | null;
    /** Esse motorista tem HOJE algum contrato ativo? Falso = ex-motorista, mesmo com dívida em aberto. */
    exMotorista: boolean;
    /** Data real de devolução do carro — usada pra achar boleto futuro indevido. Nulo = não sabemos, não arrisca marcar nada como futuro. */
    contractEndDate: Date | null;
    itens: typeof payments;
    total: number;
    vencidoTotal: number;
    maiorAtraso: number;
  };

  const grupos = new Map<string, Row>();

  for (const p of payments) {
    const aberto = emAberto(p);
    if (!mostrarTudo && !aberto) continue;

    const c = p.contract;
    const key = c?.id ?? p.plate ?? p.asaasId;
    const plate = c?.vehicle.plate ?? p.plate ?? "—";
    const row =
      grupos.get(key) ??
      ({
        key,
        name: c?.customer.name ?? p.customer?.name ?? p.description?.slice(0, 40) ?? "Sem vínculo",
        phone: c?.customer.phone ?? p.customer?.phone ?? null,
        plate,
        contractId: c?.id ?? null,
        // Só classifica como ex-motorista quando SABEMOS que o contrato
        // existe e não está ativo — cobrança sem contrato vinculado nenhum
        // fica na lista principal, não dá pra afirmar que é um ex-motorista.
        exMotorista: c ? c.status !== "ATIVO" : false,
        // A devolução registrada; o `endDate` é o fim do lote de faturas e
        // só serve de reserva para contrato sem devolução anotada.
        contractEndDate: c && c.status !== "ATIVO" ? (c.returnedAt ?? c.endDate) : null,
        itens: [],
        total: 0,
        vencidoTotal: 0,
        maiorAtraso: 0,
      } as Row);

    row.itens.push(p);
    if (aberto) {
      const valor = Number(p.value);
      row.total += valor;
      if (p.dueDate < now) {
        row.vencidoTotal += valor;
        row.maiorAtraso = Math.max(row.maiorAtraso, daysSince(p.dueDate, now) ?? 0);
      }
    }
    grupos.set(key, row);
  }

  const rows = [...grupos.values()].filter(
    (r) => r.itens.length > 0 && r.exMotorista === visaoExMotoristas
  );
  // Quem está mais atrasado primeiro
  rows.sort((a, b) => b.maiorAtraso - a.maiorAtraso || b.vencidoTotal - a.vencidoTotal);

  const totalVencido = rows.reduce((s, r) => s + r.vencidoTotal, 0);
  const totalAberto = rows.reduce((s, r) => s + r.total, 0);
  const inadimplentes = rows.filter((r) => r.vencidoTotal > 0).length;

  // Quantos ex-motoristas com dívida em aberto existem, pra mostrar no link
  // mesmo quando a visão atual é "ativos" — contagem independe de "ver tudo":
  // é sempre o que está realmente em aberto.
  const exMotoristasComDivida = [...grupos.values()].filter(
    (r) => r.exMotorista && r.itens.some((p) => emAberto(p))
  ).length;

  return (
    <div>
      <PageHeader
        title={visaoExMotoristas ? "Inadimplência · Ex-motoristas" : "Inadimplência"}
        description={
          visaoExMotoristas
            ? "Dívida em aberto de quem já não está alugando nenhum carro — o contrato foi encerrado, mas a cobrança ficou pendente."
            : "Cobranças lidas do Asaas — aqui você acompanha e cobra."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              action={padronizarNotificacoesAsaas}
              label="Padronizar avisos"
              pendingLabel="Ajustando..."
              confirmMessage="Deixar todos os clientes do Asaas com notificação ligada, WhatsApp ativo e lembrete 5 dias antes do vencimento? Isso roda sozinho todo dia — use aqui só para forçar agora."
              className="rounded-lg border border-border px-4 py-2 font-semibold"
            />
            <ActionButton
              action={sincronizarAsaas}
              label="Atualizar do Asaas"
              pendingLabel="Consultando..."
              className="rounded-lg border border-border px-4 py-2 font-semibold"
            />
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Vencido" value={formatCurrency(totalVencido)} tone="danger" />
        <StatCard label="Total em aberto" value={formatCurrency(totalAberto)} tone="warning" />
        <StatCard label="Motoristas em atraso" value={String(inadimplentes)} tone="default" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(() => {
          const qs = new URLSearchParams();
          if (!mostrarTudo) qs.set("tudo", "1");
          if (visaoExMotoristas) qs.set("visao", "ex-motoristas");
          return (
            <Link
              href={`/inadimplencia${qs.size ? `?${qs}` : ""}`}
              className="ml-auto rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:text-foreground"
            >
              {mostrarTudo ? "Ver só em aberto" : "Ver histórico completo"}
            </Link>
          );
        })()}
      </div>

      <div className="mb-5">
        {(() => {
          const qs = new URLSearchParams();
          if (mostrarTudo) qs.set("tudo", "1");
          if (!visaoExMotoristas) qs.set("visao", "ex-motoristas");
          return (
            <Link
              href={`/inadimplencia${qs.size ? `?${qs}` : ""}`}
              className={
                visaoExMotoristas
                  ? "rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-sm font-semibold text-warning"
                  : "rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:text-foreground"
              }
            >
              {visaoExMotoristas ? "← Voltar pros motoristas ativos" : `Ex-motoristas com dívida (${exMotoristasComDivida})`}
            </Link>
          );
        })()}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nenhuma cobrança em aberto 🎉"
          description="Clique em “Atualizar do Asaas” se você espera ver algo aqui."
        />
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <section key={r.key} className="rounded-2xl border border-border bg-surface">
              {/* Cabeçalho do motorista */}
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.contractId ? (
                      <Link href={`/contratos/${r.contractId}`} className="font-semibold hover:text-neon">
                        {r.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{r.name}</span>
                    )}
                    <span className="font-mono text-xs text-muted">{r.plate}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{r.phone ?? "sem telefone"}</p>
                </div>

                <div className="text-right">
                  {r.vencidoTotal > 0 ? (
                    <>
                      <p className="text-lg font-bold text-danger tabular-nums">
                        {formatCurrency(r.vencidoTotal)}
                      </p>
                      <p className="text-xs text-danger">
                        {r.maiorAtraso} dia{r.maiorAtraso === 1 ? "" : "s"} de atraso
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-bold tabular-nums">{formatCurrency(r.total)}</p>
                      <p className="text-xs text-muted">em dia</p>
                    </>
                  )}
                </div>
              </header>

              {/* Parcelas */}
              <ul className="divide-y divide-border">
                {r.itens.map((p) => {
                  const aberto = emAberto(p);
                  const atraso = p.dueDate < now ? daysSince(p.dueDate, now) ?? 0 : 0;
                  const link = p.invoiceUrl ?? p.bankSlipUrl;

                  // Boleto de ALUGUEL com vencimento DEPOIS que
                  // o motorista devolveu o carro: não tem o que cobrar, tem
                  // que remover no Asaas — não marcar pago (não é dinheiro
                  // que vai entrar) nem deixar em aberto (infla a
                  // inadimplência à toa).
                  //
                  // Restrito a "FATURAMENTO DE LOCAÇÃO" de propósito: uma
                  // dívida parcelada (multa, avaria — criada em /dividas)
                  // tem a placa na descrição também e bateria no mesmo
                  // filtro de data, mas ela continua devida mesmo depois do
                  // motorista devolver o carro — não pode ser removida por
                  // esse motivo. Achado real no banco em 2026-10-23.
                  const cobrancaFutura =
                    aberto &&
                    r.contractEndDate != null &&
                    p.dueDate.getTime() > r.contractEndDate.getTime() &&
                    (p.description ?? "").includes("FATURAMENTO DE LOCAÇÃO");

                  // Avisos — NUNCA dão baixa sozinhos, só sinalizam. Prioriza
                  // o PIX (tem botão de ação) sobre a duplicata (só aviso).
                  // Nenhum dos dois faz sentido numa cobrança que vai ser removida.
                  const pixMatch = aberto && !cobrancaFutura ? pixSugestoes.get(p.id) ?? null : null;
                  const dup = aberto && !cobrancaFutura && !pixMatch ? duplicataProvavel(p, payments) : null;

                  const waLink = buildWhatsAppLink(
                    r.phone,
                    buildCobrancaMessage({
                      firstName: r.name.split(" ")[0],
                      plate: r.plate,
                      value: formatCurrency(Number(p.value)),
                      dueDate: formatDate(p.dueDate),
                      daysLate: atraso,
                      link,
                    })
                  );

                  return (
                    <li key={p.id} className="p-4 text-sm">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="min-w-[8rem]">
                        <p className="font-medium tabular-nums">{formatCurrency(Number(p.value))}</p>
                        <p className="text-xs text-muted">venc. {formatDate(p.dueDate)}</p>
                      </div>

                      <div className="min-w-[7rem]">
                        {p.settledLocally ? (
                          <Badge tone="success">pago (baixa manual)</Badge>
                        ) : !aberto ? (
                          <Badge tone="success">pago no Asaas</Badge>
                        ) : cobrancaFutura ? (
                          <Badge tone="purple">cobrança futura</Badge>
                        ) : atraso > 0 ? (
                          <Badge tone="danger">
                            {atraso} dia{atraso === 1 ? "" : "s"} atrasado
                          </Badge>
                        ) : (
                          <Badge tone="warning">a vencer</Badge>
                        )}
                      </div>

                      <span className="text-xs text-muted">{p.billingType ?? ""}</span>

                      {p.lastChargedAt && (
                        <span className="text-xs text-muted">
                          cobrado em {formatDate(p.lastChargedAt)}
                        </span>
                      )}

                      <div className="ml-auto flex flex-wrap items-center gap-2">
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

                        {aberto && !cobrancaFutura && waLink && (
                          <CobrarButton
                            paymentId={p.id}
                            waLink={waLink}
                            jaCobrado={Boolean(p.lastChargedAt)}
                          />
                        )}

                        {cobrancaFutura ? (
                          <ActionButton
                            action={removerCobrancaFutura.bind(null, p.id)}
                            label="Remover cobrança no Asaas"
                            confirmMessage={`Remover de vez esta cobrança de ${formatCurrency(Number(p.value))} (venc. ${formatDate(p.dueDate)}) de ${r.name}?\n\nO carro já foi devolvido em ${formatDate(r.contractEndDate!)} — esse valor NUNCA vai ser cobrado. A cobrança será APAGADA no Asaas. Isso não tem como desfazer.`}
                            className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-semibold text-danger"
                          />
                        ) : aberto ? (
                          <ActionButton
                            action={marcarPago.bind(null, p.id)}
                            label="Marcar pago"
                            confirmMessage={`Confirmar o recebimento de ${formatCurrency(Number(p.value))} de ${r.name}?\n\nA cobrança será quitada no Asaas como "recebido em dinheiro" e ${r.name.split(" ")[0]} recebe a confirmação de pagamento. Os avisos de atraso param.`}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs"
                          />
                        ) : p.settledLocally ? (
                          <ActionButton
                            action={desfazerBaixa.bind(null, p.id)}
                            label="Desfazer"
                            className="rounded-lg border border-border px-3 py-1.5 text-xs"
                          />
                        ) : null}
                      </div>
                    </div>

                    {pixMatch && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-neon/30 bg-neon/5 px-3 py-2">
                        <p className="text-xs text-foreground">
                          💡 Foi identificado um PIX de {formatCurrency(Number(pixMatch.value))} recebido em{" "}
                          {formatDate(pixMatch.paymentDate ?? pixMatch.dueDate)} de {r.name.split(" ")[0]} —
                          pode já ter pago direto, não pelo boleto. Confira antes de dar baixa.
                        </p>
                        <ActionButton
                          action={marcarPago.bind(null, p.id)}
                          label="Dar baixa nesta cobrança"
                          confirmMessage={`Confirmar que o PIX de ${formatCurrency(Number(pixMatch.value))} recebido em ${formatDate(pixMatch.paymentDate ?? pixMatch.dueDate)} cobre esta cobrança de ${r.name}?\n\nA cobrança será quitada no Asaas como "recebido em dinheiro".`}
                          className="ml-auto whitespace-nowrap rounded-lg border border-neon/40 px-3 py-1.5 text-xs font-semibold text-neon"
                        />
                      </div>
                    )}

                    {dup && (
                      <p className="mt-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                        ⚠ Possível fatura duplicada — já existe outra cobrança da mesma placa com o mesmo
                        vencimento ({formatDate(dup.dueDate)}) marcada como paga. Confira antes de cobrar de
                        novo.
                      </p>
                    )}

                    {cobrancaFutura && (
                      <p className="mt-3 rounded-lg border border-purple/30 bg-purple/5 px-3 py-2 text-xs text-purple">
                        📅 Cobrança futura — o carro foi devolvido em {formatDate(r.contractEndDate!)}, antes
                        deste vencimento. Esse valor não vai ser cobrado: remova a cobrança no Asaas em vez
                        de marcar como paga.
                      </p>
                    )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

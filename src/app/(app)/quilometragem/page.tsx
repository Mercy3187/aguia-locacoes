import { requireCan } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSignedUrls } from "@/lib/storage";
import { PageHeader, Badge, EmptyState, LinkButton, Table, Th, Td } from "@/components/ui";
import { ActionButton } from "@/components/ActionButton";
import { Icon } from "@/components/icons";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import { daysSince } from "@/lib/dates";
import { driverLink } from "@/lib/whatsapp";
import { revisarVigencia, type Revisao } from "@/lib/contratos-vigencia";
import { KmActionButton } from "./KmActionButton";
import { ConferirKm } from "./ConferirKm";
import { AlterarKm } from "./AlterarKm";
import { RevisarContrato } from "./RevisarContrato";
import { FilaEnvio, type FilaItem } from "./FilaEnvio";
import {
  solicitarKmAgora,
  gerarNovoLink,
  atualizarFilaKm,
  marcarConferido,
  alterarKmManual,
  encerrarContrato,
  manterContratoAtivo,
} from "./actions";

export const dynamic = "force-dynamic";

const km = (v: number) => v.toLocaleString("pt-BR");

/** Cabeçalho de uma etapa do fluxo. */
function Etapa({
  numero,
  titulo,
  descricao,
  quantidade,
  tom,
}: {
  numero: number;
  titulo: string;
  descricao: string;
  quantidade: number;
  tom: "brand" | "warning" | "success" | "muted";
}) {
  const cores = {
    brand: "border-brand/40 bg-brand/10 text-brand",
    warning: "border-warning/40 bg-warning/10 text-warning",
    success: "border-success/40 bg-success/10 text-success",
    muted: "border-border bg-surface-2 text-muted",
  } as const;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold",
            cores[tom]
          )}
        >
          {numero}
        </span>
        <div>
          <h2 className="text-sm font-semibold">{titulo}</h2>
          <p className="text-xs text-muted">{descricao}</p>
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold tabular-nums",
          quantidade > 0 ? cores[tom] : "border-border text-muted"
        )}
      >
        {quantidade}
      </span>
    </div>
  );
}

export default async function QuilometragemPage() {
  await requireCan("operacao");

  const [contracts, pendentes, frota] = await Promise.all([
    prisma.contract.findMany({
      where: { status: "ATIVO" },
      include: {
        customer: true,
        vehicle: true,
        kmRequests: { orderBy: { createdAt: "desc" }, take: 1 },
        kmRecords: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { nextKmRequestDate: "asc" },
    }),
    // O que o motorista já respondeu e ainda não foi efetivado por ninguém.
    prisma.kmRecord.findMany({
      where: { appliedAt: null },
      orderBy: { createdAt: "asc" },
      include: { vehicle: true, customer: true },
    }),
    // A frota inteira — não só os carros com contrato ativo. Carro parado no
    // pátio, na oficina ou reservado também roda e também precisa ter a KM
    // ajustada na mão.
    prisma.vehicle.findMany({
      where: { status: { not: "VENDIDO" } },
      orderBy: { plate: "asc" },
      select: {
        id: true,
        plate: true,
        model: true,
        status: true,
        currentKm: true,
        kmRecords: {
          where: { appliedAt: { not: null } },
          orderBy: { appliedAt: "desc" },
          take: 1,
          select: { appliedAt: true },
        },
        contracts: {
          where: { status: "ATIVO" },
          take: 1,
          select: { customer: { select: { name: true } } },
        },
      },
    }),
  ]);

  const now = new Date();

  // ── Contratos que precisam de uma conferida antes de cobrar ─────────
  // Se a devolução não é registrada, o contrato segue ATIVO e aparece na fila
  // para cobrar KM de quem nem está mais com o carro. A regra está em
  // `lib/contratos-vigencia.ts`; a decisão continua sendo do usuário.
  const ativosPorVeiculo = new Map<
    string,
    Array<{ id: string; startDate: Date; endDate: Date | null }>
  >();
  for (const c of contracts) {
    const lista = ativosPorVeiculo.get(c.vehicleId) ?? [];
    lista.push({ id: c.id, startDate: c.startDate, endDate: c.endDate });
    ativosPorVeiculo.set(c.vehicleId, lista);
  }

  const revisoes = new Map<string, Revisao>();
  for (const c of contracts) {
    const r = revisarVigencia(
      {
        id: c.id,
        startDate: c.startDate,
        endDate: c.endDate,
        vigenciaConfirmadaAt: c.vigenciaConfirmadaAt,
        contratosAtivosDoCarro: ativosPorVeiculo.get(c.vehicleId) ?? [],
      },
      now
    );
    if (r) revisoes.set(c.id, r);
  }

  const aRevisar = contracts
    .filter((c) => revisoes.has(c.id))
    .map((c) => ({ contrato: c, revisao: revisoes.get(c.id)! }))
    // Carro repassado primeiro: é o sinal que não deixa dúvida.
    .sort((a, b) =>
      a.revisao.motivo === b.revisao.motivo
        ? (b.revisao.diasParado ?? 0) - (a.revisao.diasParado ?? 0)
        : a.revisao.motivo === "carro-repassado"
          ? -1
          : 1
    );

  // A foto do painel vem junto: dá para conferir sem sair da tela. Todas são
  // assinadas de uma vez, em vez de uma chamada de rede por registro.
  const paineis = await getSignedUrls(pendentes.map((r) => r.dashboardPhotoUrl));
  const paraConferir = pendentes.map((r) => ({
    registro: r,
    painel: (r.dashboardPhotoUrl && paineis.get(r.dashboardPhotoUrl)) || null,
    diffOcr: r.ocrKm != null ? Math.abs(r.ocrKm - r.informedKm) : null,
  }));

  // ── Etapa 1: precisa mandar o link ──────────────────────────────────
  const fila: FilaItem[] = contracts
    .filter((c) => {
      // Contrato sob revisão não entra na fila: mandar link para quem já
      // devolveu o carro é exatamente o que se quer evitar.
      if (revisoes.has(c.id)) return false;
      const r = c.kmRequests[0];
      return r && !r.usedAt && (r.status === "PENDENTE" || r.status === "ENVIADO");
    })
    .map((c) => {
      const r = c.kmRequests[0];
      return {
        contractId: c.id,
        motorista: c.customer.name,
        primeiroNome: c.customer.name.split(" ")[0],
        telefone: c.customer.phone,
        placa: c.vehicle.plate,
        modelo: c.vehicle.model,
        atraso: c.nextKmRequestDate ? daysSince(c.nextKmRequestDate, now) ?? 0 : 0,
        jaEnviado: r.status === "ENVIADO",
        enviadoEm: r.sentAt ? formatDateTime(r.sentAt) : null,
      };
    })
    .sort((a, b) => Number(a.jaEnviado) - Number(b.jaEnviado) || b.atraso - a.atraso);

  const aEnviar = fila.filter((f) => !f.jaEnviado).length;

  // ── Etapa 2: link na mão do motorista, esperando resposta ───────────
  const aguardando = contracts
    .filter((c) => {
      if (revisoes.has(c.id)) return false;
      const r = c.kmRequests[0];
      return r && !r.usedAt && r.status === "ENVIADO";
    })
    .map((c) => {
      const r = c.kmRequests[0];
      return {
        contrato: c,
        request: r,
        diasEsperando: r.sentAt ? (daysSince(r.sentAt, now) ?? 0) : 0,
        expirado: r.expiresAt ? r.expiresAt < now : false,
      };
    })
    .sort((a, b) => b.diasEsperando - a.diasEsperando);

  // ── Em dia: nada pendente em nenhuma etapa ──────────────────────────
  const idsComPendencia = new Set([
    ...fila.map((f) => f.contractId),
    ...pendentes.map((p) => p.contractId),
    ...revisoes.keys(),
  ]);
  const emDia = contracts.filter((c) => !idsComPendencia.has(c.id));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Controle de KM"
        description="Do envio do link até a KM valer para o carro"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton
              action={atualizarFilaKm}
              label="Atualizar fila"
              pendingLabel="Verificando..."
              className="rounded-xl border border-border px-4 py-2.5 font-semibold"
            />
            <LinkButton href="/quilometragem/registros" variant="ghost">
              Histórico completo
            </LinkButton>
          </div>
        }
      />

      {/* ── Como funciona o ciclo ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              n: 1,
              t: "Enviamos o link",
              d: "A cada 15 dias o sistema monta a fila e você dispara pelo WhatsApp.",
            },
            {
              n: 2,
              t: "O motorista responde",
              d: "Ele informa a KM e envia as fotos do painel, da placa e das laterais.",
            },
            {
              n: 3,
              t: "Conferimos e efetivamos",
              d: "Só aqui a KM passa a valer para o carro, o óleo e a correia.",
            },
          ].map((p, i) => (
            <div key={p.n} className="relative flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-brand/30 bg-brand/10 text-[11px] font-bold text-brand">
                {p.n}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{p.t}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{p.d}</p>
              </div>
              {i < 2 && (
                <Icon
                  name="seta-direita"
                  className="absolute -right-1 top-1 hidden size-4 text-border-strong sm:block"
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Contratos a conferir antes de cobrar ──────────────────────
          Vem antes de tudo porque é o que suja o resto: enquanto um contrato
          destes estiver de pé, ele aparece na fila e você manda link de KM
          para quem já devolveu o carro. Eles ficam FORA das etapas abaixo até
          você decidir. */}
      {aRevisar.length > 0 && (
        <section className="space-y-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-warning/40 bg-warning/10 text-warning">
                <Icon name="alerta" className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Conferir antes de cobrar</h2>
                <p className="text-xs text-muted">
                  Estes contratos estão ativos mas parecem não estar mais
                  valendo — foram tirados da cobrança de KM até você decidir
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-semibold tabular-nums text-warning">
              {aRevisar.length}
            </span>
          </div>

          <div className="space-y-3">
            {aRevisar.map(({ contrato: c, revisao }) => (
              <div
                key={c.id}
                className="rounded-2xl border border-warning/40 bg-surface p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.customer.name}</span>
                      <Badge tone="warning">
                        {revisao.motivo === "carro-repassado"
                          ? "Carro repassado"
                          : "Faturamento parado"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {c.vehicle.plate}
                      {c.vehicle.model && ` · ${c.vehicle.model}`}
                      {" · desde "}
                      {formatDate(c.startDate)}
                    </p>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-warning">
                      {revisao.aviso}
                    </p>
                  </div>
                  <RevisarContrato
                    cliente={c.customer.name}
                    placa={c.vehicle.plate}
                    podeManter={revisao.motivo !== "carro-repassado"}
                    encerrar={encerrarContrato.bind(null, c.id)}
                    manter={manterContratoAtivo.bind(null, c.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── KM da frota: alteração manual ─────────────────────────────
          O ciclo do motorista é o caminho normal, mas nem sempre dá: o carro
          voltou da oficina com a KM nova, alguém passou o número por telefone,
          o motorista não respondeu o link. Aqui a KM se altera direto — e é a
          MESMA KM que o óleo, a correia e os relatórios usam. */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted">
              <Icon name="km" className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">KM da frota</h2>
              <p className="text-xs text-muted">
                Altere a quilometragem de qualquer carro na mão — vale na hora
                para o óleo, a correia, os alertas e os relatórios
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-semibold tabular-nums text-muted">
            {frota.length}
          </span>
        </div>

        {frota.length === 0 ? (
          <EmptyState
            title="Nenhum veículo cadastrado"
            description="Cadastre um veículo para controlar a quilometragem."
            action={<LinkButton href="/veiculos">Ir para Veículos</LinkButton>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Veículo</Th>
                <Th>Situação</Th>
                <Th>KM atual</Th>
                <Th>Última conferida</Th>
                <Th>Ação</Th>
              </tr>
            </thead>
            <tbody>
              {frota.map((v) => {
                const aplicadaEm = v.kmRecords[0]?.appliedAt;
                const motorista = v.contracts[0]?.customer.name;
                return (
                  <tr key={v.id}>
                    <Td>
                      <span className="font-medium">{v.plate}</span>
                      {v.model && (
                        <span className="block text-xs text-muted">{v.model}</span>
                      )}
                    </Td>
                    <Td>
                      {motorista ? (
                        <>
                          <Badge tone="neon">Alugado</Badge>
                          <span className="mt-0.5 block text-xs text-muted">
                            {motorista}
                          </span>
                        </>
                      ) : v.status === "MANUTENCAO" ? (
                        <Badge tone="warning">Manutenção</Badge>
                      ) : (
                        <Badge>
                          {v.status === "RESERVADO" ? "Reservado" : "Disponível"}
                        </Badge>
                      )}
                    </Td>
                    <Td className="tabular-nums font-medium">{km(v.currentKm)}</Td>
                    <Td className="text-muted">
                      {aplicadaEm ? formatDate(aplicadaEm) : "—"}
                    </Td>
                    <Td>
                      <AlterarKm
                        plate={v.plate}
                        currentKm={v.currentKm}
                        action={alterarKmManual.bind(null, v.id)}
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>

      {/* ── Etapa 3 primeiro: é onde a KM vira realidade ──────────────── */}
      <section className="space-y-3.5">
        <Etapa
          numero={3}
          titulo="Conferir e efetivar"
          descricao="O motorista respondeu — a KM só vale depois que você aprovar"
          quantidade={paraConferir.length}
          tom="brand"
        />

        {paraConferir.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface px-5 py-6 text-center text-sm text-muted">
            Nada para conferir agora.
          </p>
        ) : (
          <div className="space-y-3">
            {paraConferir.map(({ registro: r, painel, diffOcr }) => {
              const suspeito = r.validationStatus === "SUSPEITO";
              const ocrDivergente = diffOcr != null && diffOcr > 100;
              return (
                <div
                  key={r.id}
                  className={cn(
                    "rounded-2xl border bg-surface p-5",
                    suspeito || ocrDivergente
                      ? "border-warning/40"
                      : "border-border"
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-4">
                      {painel && (
                        <a href={painel} target="_blank" rel="noopener noreferrer">
                          {/* URL assinada e temporária do Supabase — o
                              next/image não consegue otimizar. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={painel}
                            alt="Painel do veículo"
                            className="size-16 shrink-0 rounded-xl border border-border object-cover"
                          />
                        </a>
                      )}
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {r.vehicle.plate}
                          <span className="font-normal text-muted"> · {r.customer.name}</span>
                        </p>
                        <p className="mt-1 text-sm">
                          <span className="text-muted">Motorista informou: </span>
                          <span className="font-semibold tabular-nums">
                            {km(r.informedKm)} km
                          </span>
                          {r.ocrKm != null && (
                            <>
                              <span className="text-muted"> · leitura da foto: </span>
                              <span
                                className={cn(
                                  "font-medium tabular-nums",
                                  ocrDivergente ? "text-warning" : "text-muted-strong"
                                )}
                              >
                                {km(r.ocrKm)} km
                              </span>
                            </>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          Carro registra hoje {km(r.vehicle.currentKm)} km · respondido em{" "}
                          {formatDate(r.createdAt)}
                        </p>
                        {ocrDivergente && (
                          <p className="mt-1.5 text-xs text-warning">
                            A foto e o número digitado não batem ({km(diffOcr!)} km de
                            diferença) — confira o painel antes de efetivar.
                          </p>
                        )}
                        {suspeito && r.validationNotes && (
                          <p className="mt-1.5 text-xs text-warning">{r.validationNotes}</p>
                        )}
                      </div>
                    </div>
                    <Badge tone={suspeito ? "purple" : "warning"}>
                      {suspeito ? "Suspeito" : "Aguardando conferência"}
                    </Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-4">
                    <ConferirKm
                      action={marcarConferido.bind(null, r.id)}
                      informedKm={r.informedKm}
                      ocrKm={r.ocrKm}
                      plate={r.vehicle.plate}
                    />
                    <LinkButton href="/quilometragem/registros" variant="ghost">
                      Ver todas as fotos
                    </LinkButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Etapa 1 ───────────────────────────────────────────────────── */}
      <section className="space-y-3.5">
        <Etapa
          numero={1}
          titulo="Enviar o link"
          descricao="Um clique abre o WhatsApp com a mensagem e o link prontos"
          quantidade={aEnviar}
          tom={aEnviar > 0 ? "warning" : "success"}
        />
        <FilaEnvio itens={fila} />
      </section>

      {/* ── Etapa 2 ───────────────────────────────────────────────────── */}
      <section className="space-y-3.5">
        <Etapa
          numero={2}
          titulo="Aguardando o motorista"
          descricao="Link já enviado, esperando as fotos e a KM"
          quantidade={aguardando.length}
          tom="muted"
        />

        {aguardando.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface px-5 py-6 text-center text-sm text-muted">
            Ninguém pendente de resposta.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Veículo</Th>
                <Th>Motorista</Th>
                <Th>Enviado</Th>
                <Th>Esperando há</Th>
                <Th>Link</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {aguardando.map(({ contrato: c, request: r, diasEsperando, expirado }) => (
                <tr key={c.id}>
                  <Td>
                    <span className="font-medium">{c.vehicle.plate}</span>
                    {c.vehicle.model && (
                      <span className="block text-xs text-muted">{c.vehicle.model}</span>
                    )}
                  </Td>
                  <Td>{c.customer.name}</Td>
                  <Td>{r.sentAt ? formatDate(r.sentAt) : "—"}</Td>
                  <Td>
                    <span
                      className={cn(
                        "tabular-nums",
                        diasEsperando >= 3 ? "text-warning" : "text-muted-strong"
                      )}
                    >
                      {diasEsperando} {diasEsperando === 1 ? "dia" : "dias"}
                    </span>
                  </Td>
                  <Td>
                    {expirado ? (
                      <Badge tone="danger">Expirado</Badge>
                    ) : (
                      <Badge tone="success">Válido</Badge>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-3 whitespace-nowrap">
                      <KmActionButton
                        action={gerarNovoLink.bind(null, r.id)}
                        label="Gerar novo link"
                      />
                      <a
                        href={driverLink(r.token)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-brand hover:underline"
                      >
                        Abrir a tela do motorista
                      </a>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {/* ── Em dia ────────────────────────────────────────────────────── */}
      <section className="space-y-3.5">
        <Etapa
          numero={4}
          titulo="Em dia"
          descricao="Sem nada pendente até a próxima solicitação"
          quantidade={emDia.length}
          tom="success"
        />

        {contracts.length === 0 ? (
          <EmptyState
            title="Nenhum contrato ativo"
            description="Ative um contrato para iniciar o controle de quilometragem."
            action={<LinkButton href="/contratos">Ir para Contratos</LinkButton>}
          />
        ) : emDia.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface px-5 py-6 text-center text-sm text-muted">
            Todos os contratos têm alguma pendência nas etapas acima.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Veículo</Th>
                <Th>Motorista</Th>
                <Th>KM do carro</Th>
                <Th>Última conferida</Th>
                <Th>Próxima solicitação</Th>
                <Th>Ação</Th>
              </tr>
            </thead>
            <tbody>
              {emDia.map((c) => {
                const ultimo = c.kmRecords[0];
                const faltam = c.nextKmRequestDate
                  ? Math.round(
                      (c.nextKmRequestDate.getTime() - now.getTime()) / 86_400_000
                    )
                  : null;
                return (
                  <tr key={c.id}>
                    <Td>
                      <span className="font-medium">{c.vehicle.plate}</span>
                      {c.vehicle.model && (
                        <span className="block text-xs text-muted">{c.vehicle.model}</span>
                      )}
                    </Td>
                    <Td>{c.customer.name}</Td>
                    <Td className="tabular-nums">{km(c.vehicle.currentKm)}</Td>
                    <Td>{ultimo ? formatDate(ultimo.createdAt) : "—"}</Td>
                    <Td>
                      {c.nextKmRequestDate ? (
                        <>
                          {formatDate(c.nextKmRequestDate)}
                          {faltam != null && (
                            <span className="block text-xs text-muted">
                              {faltam > 0
                                ? `em ${faltam} ${faltam === 1 ? "dia" : "dias"}`
                                : "hoje"}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <KmActionButton
                        action={solicitarKmAgora.bind(null, c.id, "MANUAL")}
                        label="Pedir KM agora"
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}

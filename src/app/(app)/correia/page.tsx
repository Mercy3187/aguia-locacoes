import Link from "next/link";
import { requireCan } from "@/lib/session";
import {
  PageHeader,
  LinkButton,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
} from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  CORREIA_STATUS,
  CORREIA_INTERVALO_PADRAO_KM,
  CORREIA_MARGEM_ALERTA_KM,
  type CorreiaStatus,
} from "@/lib/correia";
import { getPainelCorreia, type LinhaCorreia } from "@/lib/correia-painel";
import { cn, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const km = (v: number) => v.toLocaleString("pt-BR");

/** Cor da barra conforme a urgência. */
const BARRA: Record<CorreiaStatus, string> = {
  VENCIDA: "bg-danger",
  PROXIMA: "bg-warning",
  EM_DIA: "bg-success",
  SEM_REGISTRO: "bg-muted/30",
};

function Resumo({
  rotulo,
  valor,
  tom,
  icone,
}: {
  rotulo: string;
  valor: number;
  tom: "danger" | "warning" | "success" | "default";
  icone: "correia" | "alerta" | "carro";
}) {
  const cores = {
    danger: "border-danger/40 bg-danger/[0.07] text-danger",
    warning: "border-warning/40 bg-warning/[0.07] text-warning",
    success: "border-success/30 bg-success/[0.06] text-success",
    default: "border-border bg-surface text-muted-strong",
  } as const;

  return (
    <div className={cn("card-sheen rounded-2xl border p-5", cores[tom])}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted">{rotulo}</p>
        <Icon name={icone} className="size-[18px] shrink-0 opacity-60" />
      </div>
      <p className="mt-3 text-[28px] font-bold leading-none tabular-nums">{valor}</p>
    </div>
  );
}

/** Quanto falta, escrito do jeito que se fala. */
function textoPrevisao(l: LinhaCorreia): string {
  if (l.calculo.status === "SEM_REGISTRO") return "Informe a última troca";
  if (l.calculo.faltamKm != null && l.calculo.faltamKm < 0) {
    return `Passou ${km(Math.abs(l.calculo.faltamKm))} km do ponto`;
  }
  if (!l.kmPorDia || l.diasAteTroca == null) return "Sem ritmo para estimar";
  if (l.diasAteTroca <= 30) return `~${l.diasAteTroca} dias`;
  const meses = Math.round(l.diasAteTroca / 30);
  return `~${meses} ${meses === 1 ? "mês" : "meses"}`;
}

export default async function CorreiaPage() {
  await requireCan("operacao");
  const painel = await getPainelCorreia();

  const urgentes = painel.linhas.filter(
    (l) => l.calculo.status === "VENCIDA" || l.calculo.status === "PROXIMA"
  );

  if (painel.total === 0) {
    return (
      <div>
        <PageHeader
          title="Correia Dentada"
          description="Controle de troca por quilometragem"
        />
        <EmptyState
          title="Nenhum veículo na frota"
          description="Cadastre um veículo para começar o controle da correia."
          action={<LinkButton href="/veiculos/novo">+ Novo veículo</LinkButton>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Correia Dentada"
        description={`Troca a cada ${km(
          CORREIA_INTERVALO_PADRAO_KM
        )} km — a conta acompanha sozinha a KM que os motoristas comprovam a cada 15 dias`}
        action={<LinkButton href="/correia/nova">+ Registrar troca</LinkButton>}
      />

      {/* ── Contagem ──────────────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Resumo
          rotulo="Vencidas"
          valor={painel.contagem.VENCIDA}
          tom={painel.contagem.VENCIDA > 0 ? "danger" : "default"}
          icone="alerta"
        />
        <Resumo
          rotulo={`Trocar em breve (faltam até ${km(CORREIA_MARGEM_ALERTA_KM)} km)`}
          valor={painel.contagem.PROXIMA}
          tom={painel.contagem.PROXIMA > 0 ? "warning" : "default"}
          icone="correia"
        />
        <Resumo
          rotulo="Em dia"
          valor={painel.contagem.EM_DIA}
          tom="success"
          icone="carro"
        />
        <Resumo
          rotulo="Sem registro de troca"
          valor={painel.contagem.SEM_REGISTRO}
          tom="default"
          icone="carro"
        />
      </section>

      {/* ── Quem precisa de atenção agora ─────────────────────────────── */}
      {urgentes.length > 0 && (
        <section className="space-y-3.5">
          <h2 className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            <span className="brand-rule h-px w-6 rounded-full" />
            Precisa de correia
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {urgentes.map((l) => {
              const s = CORREIA_STATUS[l.calculo.status];
              const vencida = l.calculo.status === "VENCIDA";
              return (
                <div
                  key={l.id}
                  className={cn(
                    "rounded-2xl border p-4",
                    vencida
                      ? "border-danger/40 bg-danger/[0.07]"
                      : "border-warning/40 bg-warning/[0.07]"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{l.plate}</p>
                      {l.model && (
                        <p className="truncate text-xs text-muted">{l.model}</p>
                      )}
                    </div>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>

                  <p
                    className={cn(
                      "mt-3 text-[22px] font-bold leading-none tabular-nums",
                      vencida ? "text-danger" : "text-warning"
                    )}
                  >
                    {vencida
                      ? `${km(Math.abs(l.calculo.faltamKm ?? 0))} km passados`
                      : `faltam ${km(l.calculo.faltamKm ?? 0)} km`}
                  </p>

                  <p className="mt-2 text-xs text-muted">
                    Odômetro {km(l.currentKm)} km · trocar aos{" "}
                    {l.calculo.proximaKm ? km(l.calculo.proximaKm) : "—"} km
                  </p>

                  <Link
                    href={`/correia/nova?vehicleId=${l.id}`}
                    className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand transition-opacity hover:opacity-80"
                  >
                    Registrar troca
                    <Icon name="seta-direita" className="size-3.5" />
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Frota inteira ─────────────────────────────────────────────── */}
      <section className="space-y-3.5">
        <h2 className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          <span className="brand-rule h-px w-6 rounded-full" />
          Frota ({painel.total})
        </h2>

        <Table>
          <thead>
            <tr>
              <Th>Veículo</Th>
              <Th>KM atual</Th>
              <Th>Última troca</Th>
              <Th>Trocar aos</Th>
              <Th>Falta rodar</Th>
              <Th>Ritmo</Th>
              <Th>Previsão</Th>
              <Th>Status</Th>
              <Th>Ação</Th>
            </tr>
          </thead>
          <tbody>
            {painel.linhas.map((l) => {
              const s = CORREIA_STATUS[l.calculo.status];
              const semRegistro = l.calculo.status === "SEM_REGISTRO";
              return (
                <tr key={l.id}>
                  <Td>
                    <span className="font-medium">{l.plate}</span>
                    {l.model && (
                      <span className="block text-xs text-muted">{l.model}</span>
                    )}
                  </Td>
                  <Td className="tabular-nums">{km(l.currentKm)}</Td>
                  <Td className="tabular-nums">
                    {l.lastTimingBeltKm != null ? (
                      <>
                        {km(l.lastTimingBeltKm)} km
                        {l.lastTimingBeltAt && (
                          <span className="block text-xs text-muted">
                            {formatDate(l.lastTimingBeltAt)}
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td className="tabular-nums">
                    {l.calculo.proximaKm != null ? `${km(l.calculo.proximaKm)} km` : "—"}
                  </Td>
                  <Td>
                    {semRegistro ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <div className="min-w-[132px]">
                        <span
                          className={cn(
                            "block font-medium tabular-nums",
                            l.calculo.status === "VENCIDA" && "text-danger",
                            l.calculo.status === "PROXIMA" && "text-warning"
                          )}
                        >
                          {(l.calculo.faltamKm ?? 0) < 0
                            ? `−${km(Math.abs(l.calculo.faltamKm ?? 0))} km`
                            : `${km(l.calculo.faltamKm ?? 0)} km`}
                        </span>
                        {/* Quanto do intervalo já foi consumido. */}
                        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-3">
                          <span
                            className={cn(
                              "block h-full rounded-full",
                              BARRA[l.calculo.status]
                            )}
                            style={{ width: `${l.calculo.percentualUsado}%` }}
                          />
                        </span>
                      </div>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums text-muted">
                    {l.kmPorDia ? `${Math.round(l.kmPorDia)} km/dia` : "—"}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span
                      className={cn(
                        "text-sm",
                        l.calculo.status === "VENCIDA" ? "text-danger" : "text-muted-strong"
                      )}
                    >
                      {textoPrevisao(l)}
                    </span>
                    {l.previsao && l.calculo.status !== "VENCIDA" && (
                      <span className="block text-xs text-muted">
                        {formatDate(l.previsao)}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </Td>
                  <Td>
                    <Link
                      href={`/correia/nova?vehicleId=${l.id}`}
                      className="whitespace-nowrap text-sm text-brand hover:underline"
                    >
                      {semRegistro ? "Informar" : "Registrar troca"}
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>

        <p className="text-xs text-muted">
          O <strong className="font-medium text-muted-strong">ritmo</strong> vem das
          comprovações de KM dos últimos meses e é o que dá a previsão. Carro com uma
          leitura só ainda não tem base para estimar data — o controle por
          quilometragem continua valendo normalmente.
        </p>
      </section>
    </div>
  );
}

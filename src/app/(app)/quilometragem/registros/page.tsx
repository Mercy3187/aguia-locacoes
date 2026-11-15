import { requireCan } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getSignedUrls } from "@/lib/storage";
import { PageHeader, Badge, EmptyState, LinkButton } from "@/components/ui";
import { VALIDATION_STATUS } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { ConferirKm } from "../ConferirKm";
import { marcarConferido } from "../actions";

export const dynamic = "force-dynamic";

function Thumb({ url, label }: { url: string | null; label: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        className="h-20 w-20 rounded-lg border border-border object-cover"
      />
      <span className="mt-1 block text-center text-[10px] text-muted">{label}</span>
    </a>
  );
}

export default async function RegistrosKmPage() {
  await requireCan("operacao");
  const records = await prisma.kmRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
    include: { vehicle: true, customer: true },
  });

  // Todas as fotos da tela são assinadas numa única chamada. Antes cada
  // registro fazia três idas à rede em sequência (painel, depois placa,
  // depois as do carro) — com 40 registros na tela isso passava de cem
  // chamadas para montar uma página.
  const urls = await getSignedUrls(
    records.flatMap((r) => [r.dashboardPhotoUrl, r.platePhotoUrl, ...r.vehiclePhotosUrls])
  );

  const withUrls = records.map((r) => ({
    record: r,
    dashboardUrl: (r.dashboardPhotoUrl && urls.get(r.dashboardPhotoUrl)) || null,
    plateUrl: (r.platePhotoUrl && urls.get(r.platePhotoUrl)) || null,
    sideUrls: r.vehiclePhotosUrls
      .map((p) => urls.get(p))
      .filter((u): u is string => Boolean(u)),
  }));

  return (
    <div>
      <PageHeader
        title="Registros de KM"
        description="Comprovações enviadas pelos motoristas"
        action={<LinkButton href="/quilometragem" variant="ghost">← Controle de KM</LinkButton>}
      />

      {withUrls.length === 0 ? (
        <EmptyState
          title="Nenhum registro ainda"
          description="Os registros aparecem aqui quando os motoristas respondem os links de KM."
        />
      ) : (
        <div className="space-y-4">
          {withUrls.map(({ record: r, dashboardUrl, plateUrl, sideUrls }) => {
            const v = VALIDATION_STATUS[r.validationStatus];
            const gps =
              r.latitude != null && r.longitude != null
                ? `https://www.google.com/maps?q=${r.latitude},${r.longitude}`
                : null;
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {r.vehicle.plate}
                      <span className="text-muted"> · {r.customer.name}</span>
                    </p>
                    <p className="text-sm text-muted">
                      KM informada:{" "}
                      <span
                        className={
                          r.correctedKm != null
                            ? "tabular-nums line-through opacity-60"
                            : "font-medium text-foreground tabular-nums"
                        }
                      >
                        {r.informedKm.toLocaleString("pt-BR")}
                      </span>
                      {r.correctedKm != null && (
                        <>
                          {" → corrigida: "}
                          <span className="font-medium text-brand tabular-nums">
                            {r.correctedKm.toLocaleString("pt-BR")}
                          </span>
                        </>
                      )}
                      {r.ocrKm != null && (
                        <>
                          {" · OCR (foto): "}
                          <span className="font-medium text-foreground tabular-nums">
                            {r.ocrKm.toLocaleString("pt-BR")}
                          </span>
                        </>
                      )}
                      {r.fuelLevel ? ` · Combustível: ${r.fuelLevel}` : ""}
                    </p>
                    <p className="text-xs text-muted">{formatDate(r.createdAt)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge tone={v.tone}>{v.label}</Badge>
                    {/* O que decide se a KM já vale para o carro é `appliedAt`,
                        não o selo de validação — por isso os dois aparecem. */}
                    {r.appliedAt ? (
                      <span className="text-[11px] text-success">
                        ✓ KM aplicada no veículo
                      </span>
                    ) : (
                      <span className="text-[11px] text-warning">
                        Não aplicada — o carro ainda marca{" "}
                        {r.vehicle.currentKm.toLocaleString("pt-BR")} km
                      </span>
                    )}
                  </div>
                </div>

                {r.validationNotes && (
                  <p className="mt-2 text-sm text-muted">{r.validationNotes}</p>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  <Thumb url={dashboardUrl} label="Painel" />
                  <Thumb url={plateUrl} label="Placa" />
                  {sideUrls.map((u, i) => (
                    <Thumb key={i} url={u} label={`Lateral ${i + 1}`} />
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border pt-3">
                  {gps && (
                    <a
                      href={gps}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-neon hover:underline"
                    >
                      📍 Ver localização
                    </a>
                  )}
                  {r.ipAddress && <span className="text-xs text-muted">IP: {r.ipAddress}</span>}
                  {!r.appliedAt && (
                    <ConferirKm
                      action={marcarConferido.bind(null, r.id)}
                      informedKm={r.informedKm}
                      ocrKm={r.ocrKm}
                      plate={r.vehicle.plate}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

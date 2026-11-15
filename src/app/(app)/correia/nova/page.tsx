import { requireCan } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState, LinkButton } from "@/components/ui";
import { CorreiaForm } from "../CorreiaForm";
import { registrarCorreia } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovaCorreiaPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicleId?: string }>;
}) {
  await requireCan("operacao");
  const { vehicleId } = await searchParams;

  const vehicles = await prisma.vehicle.findMany({
    where: { status: { not: "VENDIDO" } },
    orderBy: { plate: "asc" },
    select: {
      id: true,
      plate: true,
      model: true,
      currentKm: true,
      timingBeltIntervalKm: true,
      lastTimingBeltKm: true,
    },
  });

  if (vehicles.length === 0) {
    return (
      <div>
        <PageHeader title="Registrar troca da correia" />
        <EmptyState
          title="Cadastre um veículo primeiro"
          action={<LinkButton href="/veiculos/novo">+ Novo veículo</LinkButton>}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Registrar troca da correia"
        description="Informe em que quilometragem a correia foi trocada — o resto o sistema calcula"
        action={
          <LinkButton href="/correia" variant="ghost">
            ← Voltar
          </LinkButton>
        }
      />
      <CorreiaForm
        action={registrarCorreia}
        defaultVehicleId={vehicleId}
        vehicles={vehicles.map((v) => ({
          id: v.id,
          label: [v.plate, v.model].filter(Boolean).join(" · "),
          currentKm: v.currentKm,
          intervaloKm: v.timingBeltIntervalKm,
          lastTimingBeltKm: v.lastTimingBeltKm,
        }))}
      />
    </div>
  );
}

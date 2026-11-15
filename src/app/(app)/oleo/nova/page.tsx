import { requireCan } from "@/lib/session";
import { PageHeader, EmptyState, LinkButton } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { OilChangeForm } from "../OilChangeForm";
import { registrarTroca } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovaTrocaPage({
  searchParams,
}: {
  searchParams: Promise<{ vehicleId?: string }>;
}) {
  await requireCan("operacao");
  const { vehicleId } = await searchParams;

  const vehicles = await prisma.vehicle.findMany({
    where: { status: { not: "VENDIDO" } },
    orderBy: { plate: "asc" },
    select: { id: true, plate: true, model: true },
  });

  if (vehicles.length === 0) {
    return (
      <div>
        <PageHeader title="Registrar troca de óleo" />
        <EmptyState
          title="Cadastre um veículo primeiro"
          action={<LinkButton href="/veiculos/novo">+ Novo veículo</LinkButton>}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Registrar troca de óleo" description="A KM e o status do óleo do veículo serão recalculados" />
      <OilChangeForm
        action={registrarTroca}
        defaultVehicleId={vehicleId}
        vehicles={vehicles.map((v) => ({
          id: v.id,
          label: [v.plate, v.model].filter(Boolean).join(" · "),
        }))}
      />
    </div>
  );
}

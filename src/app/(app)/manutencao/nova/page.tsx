import { requireCan } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { MaintenanceForm } from "../MaintenanceForm";
import { registrarManutencao } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovaManutencaoPage({
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

  // Frota vazia não bloqueia mais a tela: dá para registrar manutenção de
  // carro avulso sem ter nenhum veículo cadastrado. O formulário abre já no
  // modo avulso quando a lista vem vazia.
  return (
    <div>
      <PageHeader
        title="Nova manutenção"
        description="Carro da frota entra em manutenção e ganha desconto das diárias paradas. Carro avulso só registra o gasto."
      />
      <MaintenanceForm
        action={registrarManutencao}
        defaultVehicleId={vehicleId}
        vehicles={vehicles.map((v) => ({
          id: v.id,
          label: [v.plate, v.model].filter(Boolean).join(" · "),
        }))}
      />
    </div>
  );
}

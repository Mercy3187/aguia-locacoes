import { requireCan } from "@/lib/session";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { VehicleForm, type VehicleDefaults } from "../VehicleForm";
import { updateVehicle } from "../actions";
import { LinhaDoTempoVeiculo } from "@/components/LinhaDoTempoVeiculo";

function dateInput(date: Date | null): string | undefined {
  return date ? date.toISOString().slice(0, 10) : undefined;
}

export default async function EditarVeiculoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCan("cadastros.editar");
  const { id } = await params;
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle) notFound();

  const defaults: VehicleDefaults = {
    plate: vehicle.plate,
    brand: vehicle.brand ?? undefined,
    model: vehicle.model ?? undefined,
    year: vehicle.year?.toString(),
    color: vehicle.color ?? undefined,
    status: vehicle.status,
    ownerName: vehicle.ownerName ?? undefined,
    purchaseValue: vehicle.purchaseValue?.toString(),
    investedValue: vehicle.investedValue?.toString(),
    currentKm: vehicle.currentKm.toString(),
    lastOilChangeKm: vehicle.lastOilChangeKm?.toString(),
    oilChangeIntervalKm: vehicle.oilChangeIntervalKm.toString(),
    insuranceDueDate: dateInput(vehicle.insuranceDueDate),
    ipvaDueDate: dateInput(vehicle.ipvaDueDate),
    licensingDueDate: dateInput(vehicle.licensingDueDate),
    notes: vehicle.notes ?? undefined,
  };

  const action = updateVehicle.bind(null, id);

  return (
    <div>
      <PageHeader
        title={`Editar veículo · ${vehicle.plate}`}
        description="Atualize os dados do veículo"
      />
      <VehicleForm action={action} defaults={defaults} submitLabel="Salvar alterações" />
      <div className="mt-10">
        <LinhaDoTempoVeiculo vehicleId={id} />
      </div>
    </div>
  );
}

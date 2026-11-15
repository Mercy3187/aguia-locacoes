import { PageHeader } from "@/components/ui";
import { requireCan } from "@/lib/session";
import { VehicleForm } from "../VehicleForm";
import { createVehicle } from "../actions";

export default async function NovoVeiculoPage() {
  await requireCan("cadastros.editar");
  return (
    <div>
      <PageHeader title="Novo veículo" description="Cadastro de veículo da frota" />
      <VehicleForm action={createVehicle} submitLabel="Cadastrar veículo" />
    </div>
  );
}

import { requireCan } from "@/lib/session";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { ContractForm, type ContractDefaults } from "../ContractForm";
import { updateContract } from "../actions";
import { ResumoContrato } from "./ResumoContrato";
import { DevolucaoForm } from "./DevolucaoForm";
import { brtDateTimeValue } from "@/lib/dates";

function dateInput(date: Date | null): string | undefined {
  return date ? date.toISOString().slice(0, 10) : undefined;
}

export const dynamic = "force-dynamic";

export default async function EditarContratoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCan("cadastros.ver");
  const { id } = await params;

  const [contract, customers, vehicles] = await Promise.all([
    prisma.contract.findUnique({
      where: { id },
      include: { vehicle: { select: { plate: true, currentKm: true } } },
    }),
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.vehicle.findMany({
      orderBy: { plate: "asc" },
      select: { id: true, plate: true, model: true },
    }),
  ]);

  if (!contract) notFound();

  const defaults: ContractDefaults = {
    customerId: contract.customerId,
    vehicleId: contract.vehicleId,
    startDate: dateInput(contract.startDate),
    endDate: dateInput(contract.endDate),
    weeklyValue: contract.weeklyValue?.toString(),
    depositValue: contract.depositValue?.toString(),
    status: contract.status,
    paymentStatus: contract.paymentStatus,
  };

  const action = updateContract.bind(null, id);

  return (
    <div>
      <PageHeader title="Contrato" description="Dados do contrato e ajustes" />
      <ResumoContrato contractId={id} />
      {contract.status === "ATIVO" && (
        <DevolucaoForm
          contractId={id}
          placa={contract.vehicle.plate}
          agora={brtDateTimeValue()}
          kmAtual={contract.vehicle.currentKm}
          kmEntrega={contract.deliveryOdometer}
        />
      )}
      <h2 className="mb-4 text-sm font-semibold">Editar contrato</h2>
      <ContractForm
        action={action}
        defaults={defaults}
        customers={customers.map((c) => ({ id: c.id, label: c.name }))}
        vehicles={vehicles.map((v) => ({
          id: v.id,
          label: [v.plate, v.model].filter(Boolean).join(" · "),
        }))}
        submitLabel="Salvar alterações"
      />
    </div>
  );
}

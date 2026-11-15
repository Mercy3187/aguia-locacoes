import { requireCan } from "@/lib/session";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { CustomerForm, type CustomerDefaults } from "../CustomerForm";
import { updateCustomer } from "../actions";

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCan("cadastros.editar");
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) notFound();

  const defaults: CustomerDefaults = {
    name: customer.name,
    cpfCnpj: customer.cpfCnpj ?? undefined,
    phone: customer.phone ?? undefined,
    email: customer.email ?? undefined,
    address: customer.address ?? undefined,
    driverLicense: customer.driverLicense ?? undefined,
    status: customer.status,
  };

  const action = updateCustomer.bind(null, id);

  return (
    <div>
      <PageHeader title={`Editar cliente · ${customer.name}`} description="Atualize os dados do cliente" />
      <CustomerForm action={action} defaults={defaults} submitLabel="Salvar alterações" />
    </div>
  );
}

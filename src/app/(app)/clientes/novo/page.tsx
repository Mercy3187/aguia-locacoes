import { PageHeader } from "@/components/ui";
import { requireCan } from "@/lib/session";
import { CustomerForm } from "../CustomerForm";
import { createCustomer } from "../actions";

export default async function NovoClientePage() {
  await requireCan("cadastros.editar");
  return (
    <div>
      <PageHeader title="Novo cliente" description="Cadastro de cliente" />
      <CustomerForm action={createCustomer} submitLabel="Cadastrar cliente" />
    </div>
  );
}

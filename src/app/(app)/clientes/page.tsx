import { requireCan } from "@/lib/session";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  PageHeader,
  LinkButton,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
} from "@/components/ui";
import { DeleteButton } from "@/components/DeleteButton";
import { formatPhoneForWhatsApp } from "@/lib/utils";
import { deleteCustomer } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  await requireCan("cadastros.ver");
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { contracts: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Clientes cadastrados"
        action={<LinkButton href="/clientes/novo">+ Novo cliente</LinkButton>}
      />

      {customers.length === 0 ? (
        <EmptyState
          title="Nenhum cliente cadastrado"
          description="Cadastre o primeiro cliente para vinculá-lo a contratos."
          action={<LinkButton href="/clientes/novo">+ Novo cliente</LinkButton>}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>CPF / CNPJ</Th>
              <Th>Telefone</Th>
              <Th>Contratos</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => {
              const validPhone = formatPhoneForWhatsApp(c.phone);
              return (
                <tr key={c.id}>
                  <Td className="font-medium">{c.name}</Td>
                  <Td>{c.cpfCnpj || "—"}</Td>
                  <Td>
                    {c.phone ? (
                      validPhone ? (
                        c.phone
                      ) : (
                        <Badge tone="warning">Telefone inválido</Badge>
                      )
                    ) : (
                      <Badge tone="danger">Sem telefone</Badge>
                    )}
                  </Td>
                  <Td className="tabular-nums">{c._count.contracts}</Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/clientes/${c.id}`}
                        className="text-sm text-neon hover:underline"
                      >
                        Editar
                      </Link>
                      <DeleteButton
                        action={deleteCustomer.bind(null, c.id)}
                        confirmMessage={`Excluir o cliente ${c.name}?`}
                      />
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}

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
import { CONTRACT_STATUS, PAYMENT_STATUS } from "@/lib/labels";
import { formatCurrency, formatDate } from "@/lib/utils";
import { deleteContract } from "./actions";

export const dynamic = "force-dynamic";

export default async function ContratosPage() {
  await requireCan("cadastros.ver");
  const contracts = await prisma.contract.findMany({
    orderBy: { createdAt: "desc" },
    include: { customer: true, vehicle: true },
  });

  return (
    <div>
      <PageHeader
        title="Contratos"
        description="Contratos de locação"
        action={<LinkButton href="/contratos/gerar">+ Gerar contrato</LinkButton>}
      />

      {contracts.length === 0 ? (
        <EmptyState
          title="Nenhum contrato cadastrado"
          description="Crie um contrato para iniciar o controle de quilometragem."
          action={<LinkButton href="/contratos/gerar">+ Gerar contrato</LinkButton>}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Cliente</Th>
              <Th>Veículo</Th>
              <Th>Início</Th>
              <Th>Semanal</Th>
              <Th>Status</Th>
              <Th>Pagamento</Th>
              <Th>Próx. KM</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id}>
                <Td className="font-medium">{c.customer.name}</Td>
                <Td>
                  {c.vehicle.plate}
                  {c.vehicle.model ? (
                    <span className="text-muted"> · {c.vehicle.model}</span>
                  ) : null}
                </Td>
                <Td>{formatDate(c.startDate)}</Td>
                <Td className="tabular-nums">
                  {c.weeklyValue ? formatCurrency(Number(c.weeklyValue)) : "—"}
                </Td>
                <Td>
                  <Badge tone={CONTRACT_STATUS[c.status].tone}>
                    {CONTRACT_STATUS[c.status].label}
                  </Badge>
                </Td>
                <Td>
                  <Badge tone={PAYMENT_STATUS[c.paymentStatus].tone}>
                    {PAYMENT_STATUS[c.paymentStatus].label}
                  </Badge>
                </Td>
                <Td>{c.nextKmRequestDate ? formatDate(c.nextKmRequestDate) : "—"}</Td>
                <Td>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/contratos/${c.id}`}
                      className="text-sm text-neon hover:underline"
                    >
                      Editar
                    </Link>
                    <DeleteButton
                      action={deleteContract.bind(null, c.id)}
                      confirmMessage={`Excluir o contrato de ${c.customer.name}?`}
                    />
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

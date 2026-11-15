import Link from "next/link";
import { requireCan } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Table, Th, Td, EmptyState } from "@/components/ui";
import { CreateGroupForm } from "./CreateGroupForm";

export const dynamic = "force-dynamic";

export default async function GruposPage() {
  await requireCan("cadastros.ver");

  const grupos = await prisma.vehicleGroup.findMany({
    include: { _count: { select: { vehicles: true, withdrawals: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Grupos de veículos"
        description="Subgrupos dentro da frota (ex.: INVESTIDOR A) — recorte à parte para relatório de rendimento."
      />

      <div className="mb-8 max-w-md">
        <CreateGroupForm />
      </div>

      {grupos.length === 0 ? (
        <EmptyState
          title="Nenhum grupo cadastrado"
          description="Crie um grupo para separar um conjunto de carros no relatório de rendimento."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Veículos</Th>
              <Th>Retiradas lançadas</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.id}>
                <Td className="font-medium">{g.name}</Td>
                <Td className="tabular-nums">{g._count.vehicles}</Td>
                <Td className="tabular-nums">{g._count.withdrawals}</Td>
                <Td>
                  <Link href={`/grupos/${g.id}`} className="text-sm text-neon hover:underline">
                    Gerenciar
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

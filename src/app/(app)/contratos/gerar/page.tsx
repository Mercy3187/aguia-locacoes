import { requireCan } from "@/lib/session";
import { PageHeader, EmptyState, LinkButton } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { GerarContratoForm } from "./GerarContratoForm";

export const dynamic = "force-dynamic";

export default async function GerarContratoPage() {
  await requireCan("cadastros.editar");

  const [clientes, veiculos, promotores] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, cpfCnpj: true },
    }),
    // Só o que pode ser entregue agora: carro com contrato ativo já está com
    // alguém, e vendido não sai mais.
    prisma.vehicle.findMany({
      where: {
        status: { notIn: ["VENDIDO", "MANUTENCAO"] },
        contracts: { none: { status: "ATIVO" } },
      },
      orderBy: { plate: "asc" },
      select: { id: true, plate: true, brand: true, model: true, year: true, color: true, currentKm: true },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Gerar Contrato"
        description="Novo contrato de locação — ao salvar, o carro é entregue ao cliente e entra na linha do tempo do veículo"
      />

      {veiculos.length === 0 && (
        <div className="mb-6">
          <EmptyState
            title="Nenhum veículo disponível para entrega"
            description="Todos os carros estão alugados, em manutenção ou vendidos. Cadastre um veículo ou encerre um contrato."
            action={<LinkButton href="/veiculos/novo">+ Veículo</LinkButton>}
          />
        </div>
      )}

      <GerarContratoForm
        clientes={clientes.map((c) => ({
          id: c.id,
          label: c.cpfCnpj ? `${c.name} — ${c.cpfCnpj}` : c.name,
        }))}
        veiculos={veiculos.map((v) => ({
          id: v.id,
          label: `${v.plate} — ${[v.brand, v.model].filter(Boolean).join(" ") || "sem modelo"}`,
          detalhe: [v.year, v.color, `${v.currentKm.toLocaleString("pt-BR")} km`]
            .filter(Boolean)
            .join(" · "),
          km: v.currentKm,
        }))}
        promotores={promotores.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}

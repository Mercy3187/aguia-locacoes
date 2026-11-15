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
import { VEHICLE_STATUS, OIL_STATUS } from "@/lib/labels";
import { deleteVehicle } from "./actions";

export const dynamic = "force-dynamic";

export default async function VeiculosPage() {
  await requireCan("cadastros.ver");
  const vehicles = await prisma.vehicle.findMany({
    orderBy: { createdAt: "desc" },
    include: { vehicleGroup: { select: { name: true } } },
  });

  return (
    <div>
      <PageHeader
        title="Veículos"
        description="Frota cadastrada"
        action={
          <div className="flex gap-2">
            <LinkButton href="/veiculos/rendimento" variant="ghost">
              Rendimento por veículo
            </LinkButton>
            <LinkButton href="/veiculos/novo">+ Novo veículo</LinkButton>
          </div>
        }
      />

      {vehicles.length === 0 ? (
        <EmptyState
          title="Nenhum veículo cadastrado"
          description="Comece cadastrando o primeiro veículo da frota."
          action={<LinkButton href="/veiculos/novo">+ Novo veículo</LinkButton>}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Placa</Th>
              <Th>Veículo</Th>
              <Th>Status</Th>
              <Th>Grupo</Th>
              <Th>KM atual</Th>
              <Th>Óleo</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id}>
                <Td className="font-medium">{v.plate}</Td>
                <Td>
                  {[v.brand, v.model].filter(Boolean).join(" ") || "—"}
                  {v.year ? <span className="text-muted"> · {v.year}</span> : null}
                </Td>
                <Td>
                  <Badge tone={VEHICLE_STATUS[v.status].tone}>
                    {VEHICLE_STATUS[v.status].label}
                  </Badge>
                </Td>
                <Td className="text-sm text-muted">{v.vehicleGroup?.name ?? "—"}</Td>
                <Td className="tabular-nums">{v.currentKm.toLocaleString("pt-BR")}</Td>
                <Td>
                  <Badge tone={OIL_STATUS[v.oilStatus].tone}>
                    {OIL_STATUS[v.oilStatus].label}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/veiculos/${v.id}`}
                      className="text-sm text-neon hover:underline"
                    >
                      Editar
                    </Link>
                    <DeleteButton
                      action={deleteVehicle.bind(null, v.id)}
                      confirmMessage={`Excluir o veículo ${v.plate}?`}
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

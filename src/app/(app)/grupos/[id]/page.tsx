import { notFound } from "next/navigation";
import { requireCan } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, LinkButton } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { DeleteButton } from "@/components/DeleteButton";
import { updateVehicleGroup, setVehicleGroupMembers, deleteVehicleGroup } from "../actions";
import { GroupSettingsForm } from "./GroupSettingsForm";

export const dynamic = "force-dynamic";

export default async function GrupoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCan("cadastros.editar");
  const { id } = await params;

  const grupo = await prisma.vehicleGroup.findUnique({ where: { id } });
  if (!grupo) notFound();

  const veiculos = await prisma.vehicle.findMany({
    where: { status: { not: "VENDIDO" } },
    select: {
      id: true,
      plate: true,
      model: true,
      vehicleGroupId: true,
      vehicleGroup: { select: { name: true } },
    },
    orderBy: { plate: "asc" },
  });

  const updateAction = updateVehicleGroup.bind(null, id);
  const setMembersAction = setVehicleGroupMembers.bind(null, id);

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader
        title={`Grupo · ${grupo.name}`}
        description="Renomeie o grupo, configure o desconto mensal automático ou escolha quais veículos pertencem a ele."
        action={<LinkButton href="/grupos" variant="ghost">← Voltar</LinkButton>}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Nome e desconto mensal automático
        </h2>
        <p className="text-xs text-muted">
          Se preenchido, no ÚLTIMO DIA de cada mês do período do relatório o sistema desconta
          esse valor do Líquido de CADA veículo do grupo (igual manutenção e peça) — e mostra o
          recap logo abaixo do Controle de Retiradas, no Excel exportado.
        </p>
        <GroupSettingsForm
          action={updateAction}
          nome={grupo.name}
          valorDesconto={grupo.monthlyDeductionValue?.toString()}
          labelDesconto={grupo.monthlyDeductionLabel ?? undefined}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Veículos neste grupo
        </h2>
        <p className="text-xs text-muted">
          Marcar um carro que já está em outro grupo move ele para este.
        </p>
        <form action={setMembersAction} className="space-y-4">
          <div className="grid max-h-80 gap-1.5 overflow-y-auto rounded-lg border border-border bg-surface-2 p-3 sm:grid-cols-2">
            {veiculos.map((v) => (
              <label key={v.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="veiculo"
                  value={v.id}
                  defaultChecked={v.vehicleGroupId === id}
                  className="size-4 rounded border-border accent-brand"
                />
                <span className="font-mono">{v.plate}</span>
                {v.model && <span className="truncate text-xs text-muted">{v.model}</span>}
                {v.vehicleGroupId && v.vehicleGroupId !== id && (
                  <span className="text-xs text-warning">
                    (em {v.vehicleGroup?.name})
                  </span>
                )}
              </label>
            ))}
          </div>
          <SubmitButton>Salvar veículos do grupo</SubmitButton>
        </form>
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Excluir grupo
        </h2>
        <p className="text-xs text-muted">
          Só é possível excluir um grupo sem veículos e sem retiradas lançadas.
        </p>
        <DeleteButton
          action={deleteVehicleGroup.bind(null, id)}
          confirmMessage={`Excluir o grupo ${grupo.name}?`}
        />
      </section>
    </div>
  );
}

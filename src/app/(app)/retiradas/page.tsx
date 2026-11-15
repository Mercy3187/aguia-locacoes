import { requireCan } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, LinkButton, Table, Th, Td, EmptyState, inputClass } from "@/components/ui";
import { StatCard } from "@/components/StatCard";
import { DeleteButton } from "@/components/DeleteButton";
import { formatCurrency } from "@/lib/utils";
import { deleteWithdrawal } from "./actions";
import { WithdrawalForm } from "./WithdrawalForm";

export const dynamic = "force-dynamic";

export default async function RetiradasPage({
  searchParams,
}: {
  searchParams: Promise<{ grupo?: string }>;
}) {
  await requireCan("retiradas");
  const { grupo: grupoParam } = await searchParams;

  const grupos = await prisma.vehicleGroup.findMany({ orderBy: { name: "asc" } });

  if (grupos.length === 0) {
    return (
      <div>
        <PageHeader
          title="Controle de Retiradas"
          description="Data e valor — retirada de caixa do grupo de veículos."
        />
        <EmptyState
          title="Nenhum grupo de veículos cadastrado"
          description="A retirada é lançada por grupo (ex.: INVESTIDOR A), não por carro. Crie um grupo primeiro."
          action={<LinkButton href="/grupos">Ir para Grupos de veículos</LinkButton>}
        />
      </div>
    );
  }

  const grupoAtual = grupos.find((g) => g.id === grupoParam) ?? grupos[0];

  const retiradas = await prisma.withdrawal.findMany({
    where: { vehicleGroupId: grupoAtual.id },
    orderBy: { date: "desc" },
  });
  const total = retiradas.reduce((s, r) => s + Number(r.value), 0);

  return (
    <div>
      <PageHeader
        title="Controle de Retiradas"
        description="Data e valor — retirada de caixa do grupo de veículos. Não entra na conta do Líquido do relatório, é só informativo."
      />

      <form className="mb-6 flex items-end gap-3" action="/retiradas">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted" htmlFor="grupo">
            Grupo
          </label>
          <select
            id="grupo"
            name="grupo"
            defaultValue={grupoAtual.id}
            className={inputClass}
          >
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted transition hover:text-foreground"
        >
          Ver
        </button>
      </form>

      <div className="mb-6 max-w-xs">
        <StatCard label={`Total retirado — ${grupoAtual.name}`} value={formatCurrency(total)} tone="warning" />
      </div>

      <div className="mb-8 max-w-md">
        <WithdrawalForm groupId={grupoAtual.id} />
      </div>

      {retiradas.length === 0 ? (
        <EmptyState
          title="Nenhuma retirada lançada"
          description={`Ainda não há retiradas registradas para o grupo ${grupoAtual.name}.`}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Valor</Th>
              <Th>Observação</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {retiradas.map((r) => (
              <tr key={r.id}>
                <Td>{r.date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</Td>
                <Td className="tabular-nums">{formatCurrency(Number(r.value))}</Td>
                <Td className="text-sm text-muted">{r.note ?? "—"}</Td>
                <Td>
                  <DeleteButton
                    action={deleteWithdrawal.bind(null, r.id, grupoAtual.id)}
                    confirmMessage={`Excluir a retirada de ${formatCurrency(Number(r.value))} do dia ${r.date.toLocaleDateString(
                      "pt-BR",
                      { timeZone: "America/Sao_Paulo" }
                    )}?`}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

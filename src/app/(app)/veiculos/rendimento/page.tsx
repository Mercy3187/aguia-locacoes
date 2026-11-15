import { requireCan } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Table, Th, Td, EmptyState } from "@/components/ui";
import { StatCard } from "@/components/StatCard";
import { formatCurrency } from "@/lib/utils";
import { calcularRendimento } from "@/lib/fechamento";

export const dynamic = "force-dynamic";

/** Hoje e "1º dia deste mês", no fuso de Brasília, em "aaaa-mm-dd". */
function padroesDoPeriodo(): { inicio: string; fim: string } {
  const hoje = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return { inicio: `${hoje.slice(0, 7)}-01`, fim: hoje };
}

/** "aaaa-mm-dd" (horário de Brasília) para o instante inicial/final do dia. */
function inicioDoDia(iso: string): Date {
  return new Date(`${iso}T00:00:00-03:00`);
}
function fimDoDia(iso: string): Date {
  return new Date(`${iso}T23:59:59-03:00`);
}

function isoValido(v: string | undefined): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function rotuloPeriodo(inicioIso: string, fimIso: string): string {
  const f = (iso: string) =>
    new Date(`${iso}T12:00:00-03:00`).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return inicioIso === fimIso ? f(inicioIso) : `${f(inicioIso)} a ${f(fimIso)}`;
}

export default async function RendimentoVeiculoPage({
  searchParams,
}: {
  searchParams: Promise<{
    veiculo?: string | string[];
    inicio?: string;
    fim?: string;
    grupo?: string;
  }>;
}) {
  await requireCan("relatorios");
  const padrao = padroesDoPeriodo();
  const {
    veiculo: veiculoParam,
    inicio: inicioParam,
    fim: fimParam,
    grupo: grupoParam,
  } = await searchParams;

  const inicioIso = isoValido(inicioParam) ? inicioParam : padrao.inicio;
  const fimIso = isoValido(fimParam) ? fimParam : padrao.fim;

  const [veiculos, grupos] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status: { not: "VENDIDO" } },
      select: { id: true, plate: true, model: true, vehicleGroupId: true },
      orderBy: { plate: "asc" },
    }),
    prisma.vehicleGroup.findMany({ orderBy: { name: "asc" } }),
  ]);

  const grupoAtual = grupos.find((g) => g.id === grupoParam);

  // Sem nenhum marcado = frota toda (mesmo comportamento de antes). Marcar
  // 1, 3 ou quantos quiser filtra só para esses — sem opção "Todos" à parte,
  // porque "nenhum marcado" já cumpre esse papel. Escolher um grupo marca
  // automaticamente os veículos dele, somando com o que já estava marcado.
  const brutos = veiculoParam == null ? [] : Array.isArray(veiculoParam) ? veiculoParam : [veiculoParam];
  const idsValidos = new Set(veiculos.map((v) => v.id));
  const idsDoGrupo = grupoAtual
    ? veiculos.filter((v) => v.vehicleGroupId === grupoAtual.id).map((v) => v.id)
    : [];
  const vehicleIds = [...new Set([...brutos.filter((id) => idsValidos.has(id)), ...idsDoGrupo])];
  const selecionados = new Set(vehicleIds);

  const f = await calcularRendimento(inicioDoDia(inicioIso), fimDoDia(fimIso), vehicleIds);
  const linhas = [...f.veiculos].sort((a, b) => b.liquido - a.liquido);
  const periodoLabel = rotuloPeriodo(inicioIso, fimIso);

  const totais = linhas.reduce(
    (s, v) => ({
      recebido: s.recebido + v.recebido,
      aReceber: s.aReceber + v.aReceber,
      manutencao: s.manutencao + v.manutencao,
      oleo: s.oleo + v.oleo,
      liquido: s.liquido + v.liquido,
    }),
    { recebido: 0, aReceber: 0, manutencao: 0, oleo: 0, liquido: 0 }
  );

  return (
    <div>
      <PageHeader
        title="Rendimento por veículo"
        description="Quanto cada carro rendeu num período: recebido menos manutenção e óleo"
      />

      <form className="mb-6 space-y-4" action="/veiculos/rendimento">
        {grupos.length > 0 && (
          <div className="max-w-xs">
            <label className="mb-1.5 block text-xs font-medium text-muted" htmlFor="grupo">
              Grupo de veículos
            </label>
            <select
              id="grupo"
              name="grupo"
              defaultValue={grupoAtual?.id ?? ""}
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand/60"
            >
              <option value="">— Nenhum (frota toda ou seleção manual) —</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              Marca os veículos do grupo abaixo e inclui o Controle de Retiradas no Excel.
            </p>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-muted">
              Veículos {selecionados.size > 0 && `(${selecionados.size} selecionado(s))`}
            </label>
            {selecionados.size > 0 && (
              <a
                href={`/veiculos/rendimento?inicio=${inicioIso}&fim=${fimIso}`}
                className="text-xs text-neon hover:underline"
              >
                Limpar seleção (voltar para todos)
              </a>
            )}
          </div>
          <div className="grid max-h-56 grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto rounded-lg border border-border bg-surface-2 p-3 sm:grid-cols-3 lg:grid-cols-4">
            {veiculos.map((v) => (
              <label key={v.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="veiculo"
                  value={v.id}
                  defaultChecked={selecionados.has(v.id)}
                  className="size-4 rounded border-border accent-brand"
                />
                <span className="font-mono">{v.plate}</span>
                {v.model && <span className="truncate text-xs text-muted">{v.model}</span>}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">Nenhum marcado = frota toda.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">De</label>
            <input
              type="date"
              name="inicio"
              defaultValue={inicioIso}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-neon"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Até</label>
            <input
              type="date"
              name="fim"
              defaultValue={fimIso}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-neon"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted transition hover:text-foreground"
          >
            Filtrar
          </button>
          <button
            type="submit"
            formAction="/api/veiculos/rendimento/exportar"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-strong"
          >
            Exportar Excel
          </button>
        </div>
      </form>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label={`Recebido — ${periodoLabel}`} value={formatCurrency(totais.recebido)} tone="success" />
        <StatCard label="Custos (manut. + óleo)" value={formatCurrency(totais.manutencao + totais.oleo)} tone="danger" />
        <StatCard label="Líquido" value={formatCurrency(totais.liquido)} tone="neon" />
      </div>

      {linhas.length === 0 ? (
        <EmptyState
          title="Nenhum veículo encontrado"
          description="Ajuste o filtro de veículo ou o período selecionado."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Veículo</Th>
              <Th>Motorista</Th>
              <Th>Recebido</Th>
              <Th>Em aberto</Th>
              <Th>Peças</Th>
              <Th>Mão de obra</Th>
              <Th>Óleo</Th>
              <Th>Líquido</Th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((v) => (
              <tr key={v.id}>
                <Td>
                  <span className="font-mono text-sm font-medium">{v.plate}</span>
                  <p className="mt-0.5 text-xs text-muted">{v.modelo ?? "—"}</p>
                </Td>
                <Td className="text-sm">{v.motorista ?? <span className="text-muted">sem locação</span>}</Td>
                <Td className="tabular-nums text-success">{formatCurrency(v.recebido)}</Td>
                <Td className="tabular-nums text-muted">{v.aReceber ? formatCurrency(v.aReceber) : "—"}</Td>
                <Td className="tabular-nums">{v.pecas ? formatCurrency(v.pecas) : "—"}</Td>
                <Td className="tabular-nums">{v.maoDeObra ? formatCurrency(v.maoDeObra) : "—"}</Td>
                <Td className="tabular-nums">{v.oleo ? formatCurrency(v.oleo) : "—"}</Td>
                <Td className={`tabular-nums font-semibold ${v.liquido < 0 ? "text-danger" : ""}`}>
                  {formatCurrency(v.liquido)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <p className="mt-4 text-xs text-muted">
        Receita = cobranças de locação pagas no período. Custos = manutenções concluídas e
        trocas de óleo no período. Líquido = recebido − manutenção − óleo.
      </p>
    </div>
  );
}

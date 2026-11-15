import { requireCan } from "@/lib/session";
import { PageHeader, Table, Th, Td, EmptyState } from "@/components/ui";
import { StatCard } from "@/components/StatCard";
import { formatCurrency } from "@/lib/utils";
import { calcularFechamento, resumoFechamentoWhatsApp } from "@/lib/fechamento";
import { ExportarButton } from "../caucoes/ExportarButton";

export const dynamic = "force-dynamic";

/** Mês atual em Brasília, como "2026-08". */
function mesAtual(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function rotuloMes(ano: number, mes: number): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(new Date(Date.UTC(ano, mes - 1, 15)))
    .replace(/^./, (c) => c.toUpperCase());
}

/** Últimos 12 meses, do mais recente para o mais antigo. */
function ultimosMeses(n = 12): { valor: string; label: string }[] {
  const hoje = mesAtual();
  const [a, m] = hoje.split("-").map(Number);
  const out: { valor: string; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(a, m - 1 - i, 15));
    const ano = d.getUTCFullYear();
    const mes = d.getUTCMonth() + 1;
    out.push({
      valor: `${ano}-${String(mes).padStart(2, "0")}`,
      label: rotuloMes(ano, mes),
    });
  }
  return out;
}

export default async function FechamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  await requireCan("relatorios");
  const { mes: mesParam } = await searchParams;

  const mesSel = /^\d{4}-\d{2}$/.test(mesParam ?? "") ? mesParam! : mesAtual();
  const [ano, mes] = mesSel.split("-").map(Number);

  const f = await calcularFechamento(ano, mes);
  const label = rotuloMes(ano, mes);
  const t = f.totais;
  const resumo = resumoFechamentoWhatsApp(f, label);

  const linhas = f.veiculos
    // Carro sem movimento no mês não polui a tabela.
    .filter((v) => v.recebido || v.aReceber || v.manutencao || v.oleo)
    .sort((a, b) => b.liquido - a.liquido);

  const meses = ultimosMeses();

  return (
    <div>
      <PageHeader
        title="Fechamento do mês"
        description={`Quanto a frota rendeu em ${label}, já descontando manutenção e óleo`}
      />

      {/* Seletor de mês */}
      <form className="mb-5" action="/fechamento">
        <select
          name="mes"
          defaultValue={mesSel}
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-neon"
        >
          {meses.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="ml-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted transition hover:text-foreground"
        >
          Ver mês
        </button>
      </form>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Recebido no mês" value={formatCurrency(t.recebido)} tone="success" />
        <StatCard label="Custos (manut. + óleo)" value={formatCurrency(t.custos)} tone="danger" />
        <StatCard label="Líquido" value={formatCurrency(t.liquido)} tone="neon" />
      </div>

      {/* Exportação para o WhatsApp */}
      <section className="mb-6 rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-1 font-semibold">Resumo para o WhatsApp</h2>
        <p className="mb-3 text-sm text-muted">
          {t.carros} carro(s) na frota
          {t.aReceber > 0 && ` · ${formatCurrency(t.aReceber)} ainda em aberto no mês`}
        </p>
        <ExportarButton resumo={resumo} />
      </section>

      {linhas.length === 0 ? (
        <EmptyState
          title={`Nenhuma movimentação em ${label}`}
          description="Nem recebimento, nem manutenção, nem troca de óleo nesse período."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Veículo</Th>
              <Th>Motorista</Th>
              <Th>Recebido</Th>
              <Th>Em aberto</Th>
              <Th>Manutenção</Th>
              <Th>Óleo</Th>
              <Th>Líquido</Th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((v) => (
              <tr key={v.plate}>
                <Td>
                  <span className="font-mono text-sm font-medium">{v.plate}</span>
                  <p className="mt-0.5 text-xs text-muted">{v.modelo ?? "—"}</p>
                </Td>
                <Td className="text-sm">{v.motorista ?? <span className="text-muted">sem locação</span>}</Td>
                <Td className="tabular-nums text-success">{formatCurrency(v.recebido)}</Td>
                <Td className="tabular-nums text-muted">
                  {v.aReceber ? formatCurrency(v.aReceber) : "—"}
                </Td>
                <Td className="tabular-nums">
                  {v.manutencao ? formatCurrency(v.manutencao) : "—"}
                  {v.descontos > 0 && (
                    <p className="text-xs text-muted">
                      desc. {formatCurrency(v.descontos)}
                    </p>
                  )}
                </Td>
                <Td className="tabular-nums">{v.oleo ? formatCurrency(v.oleo) : "—"}</Td>
                <Td
                  className={`tabular-nums font-semibold ${v.liquido < 0 ? "text-danger" : ""}`}
                >
                  {formatCurrency(v.liquido)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <p className="mt-4 text-xs text-muted">
        Receita = cobranças de locação pagas no mês (incluindo as quitadas à mão aqui).
        Custos = manutenções concluídas e trocas de óleo no mês. Dívidas avulsas
        (multas, avarias) não entram — elas aparecem na aba Dívidas.
      </p>
    </div>
  );
}

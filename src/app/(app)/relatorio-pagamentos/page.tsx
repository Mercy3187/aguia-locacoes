import { requireCan } from "@/lib/session";
import { PageHeader, EmptyState } from "@/components/ui";
import { StatCard } from "@/components/StatCard";
import { formatCurrency } from "@/lib/utils";
import {
  carregarAcerto,
  chaveSemana,
  parseSemana,
  relatorioAcertoWhatsApp,
  rotuloSemana,
  segundaDaSemana,
  semanasRecentes,
} from "@/lib/acerto";
import { GerarRelatorioButton } from "./GerarRelatorioButton";
import { LinhaAcertoRow } from "./LinhaAcertoRow";

export const dynamic = "force-dynamic";

export default async function RelatorioPagamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  await requireCan("financeiro");
  const { semana: semanaParam } = await searchParams;

  // Sem semana na URL é a semana corrente: na segunda de manhã a tela já abre
  // no acerto que você vai fazer.
  const semana = parseSemana(semanaParam) ?? segundaDaSemana();
  const chave = chaveSemana(semana);

  const acerto = await carregarAcerto(semana);
  const relatorio = relatorioAcertoWhatsApp(acerto);

  const pagos = acerto.linhas.filter((l) => l.pago).length;
  const semanas = semanasRecentes();

  return (
    <div>
      <PageHeader
        title="Relatório Pagamentos"
        description={`Acerto da semana de ${rotuloSemana(semana)} — marque quem pagou e gere o relatório para o WhatsApp`}
        action={<GerarRelatorioButton relatorio={relatorio} />}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <form className="flex items-center gap-2" action="/relatorio-pagamentos">
          <select
            name="semana"
            defaultValue={chave}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-neon"
          >
            {semanas.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted transition hover:text-foreground"
          >
            Ver semana
          </button>
        </form>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Recebido na semana"
          value={formatCurrency(acerto.recebido)}
          tone="success"
          icon="cobranca"
        />
        <StatCard
          label="A receber"
          value={formatCurrency(acerto.aReceber)}
          tone="warning"
          icon="inadimplencia"
        />
        <StatCard
          label="Acertados"
          value={`${pagos} de ${acerto.linhas.length}`}
          tone="neon"
          icon="fechamento"
          hint={acerto.linhas.length - pagos > 0 ? `${acerto.linhas.length - pagos} pendente(s)` : "semana fechada"}
        />
      </div>

      {acerto.linhas.length === 0 ? (
        <EmptyState
          title="Nenhum carro alugado"
          description="A lista vem dos contratos ativos. Assim que um contrato entrar, o carro aparece aqui sozinho."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <ul className="divide-y divide-border">
            {acerto.linhas.map((l) => (
              <LinhaAcertoRow key={l.vehicleId} semana={chave} linha={l} />
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-muted">
        Este controle é seu, à mão: marcar “Pago” aqui não mexe no Asaas nem na
        Inadimplência — serve para você fechar a semana e mandar o relatório. O
        valor vem do contrato e pode ser ajustado na linha quando a semana teve
        desconto ou multa.
      </p>
    </div>
  );
}

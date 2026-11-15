import { requireCan } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { PainelAlertas } from "@/components/PainelAlertas";
import { getAlerts, agruparAlertas } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export default async function AlertasPage() {
  await requireCan("operacao");
  const alerts = await getAlerts();
  const blocos = agruparAlertas(alerts);
  const total = blocos.reduce((s, b) => s + b.total, 0);
  const semPendencia = alerts.filter((a) => a.count === 0);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Alertas"
        description={
          total > 0
            ? `${total} ${total === 1 ? "pendência" : "pendências"} em ${blocos.length} ${blocos.length === 1 ? "assunto" : "assuntos"}`
            : "Pendências e pontos de atenção da operação"
        }
      />

      {/* Mesmo painel do dashboard: a mesma pendência não pode ser escrita de
          um jeito numa tela e de outro na seguinte. */}
      <PainelAlertas blocos={blocos} />

      {semPendencia.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            <span className="brand-rule h-px w-6 rounded-full" />
            Sem pendências
          </h2>
          <div className="flex flex-wrap gap-2">
            {semPendencia.map((a) => (
              <span
                key={a.key}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted"
              >
                ✓ {a.label}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

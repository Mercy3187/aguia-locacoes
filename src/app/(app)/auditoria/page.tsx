import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { PageHeader, Badge, EmptyState, Table, Th, Td } from "@/components/ui";
import { StatCard } from "@/components/StatCard";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { auditLabel, AUDIT_FILTROS, acoesDoGrupo } from "@/lib/audit";

export const dynamic = "force-dynamic";

const TOM = {
  money: "warning" as const,
  security: "danger" as const,
  op: "default" as const,
};

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ grupo?: string; quem?: string }>;
}) {
  await requireCan("usuarios");
  const { grupo = "todos", quem } = await searchParams;

  const where = {
    ...(grupo !== "todos" ? { action: { in: acoesDoGrupo(grupo) } } : {}),
    ...(quem ? { userId: quem } : {}),
  };

  // Movimentação de dinheiro nos últimos 30 dias. Vai junto das outras: não
  // depende de nenhuma delas, e fora do `Promise.all` custaria uma ida e
  // volta inteira ao banco só para ela.
  const trintaDias = new Date(Date.now() - 30 * 86_400_000);

  const [logs, usuarios, total, dinheiro] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.auditLog.count(),
    prisma.auditLog.aggregate({
      where: { action: { in: acoesDoGrupo("money") }, createdAt: { gte: trintaDias } },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  // Somar e contar no banco em vez de trazer uma linha por movimento só para
  // percorrer em memória: o resultado é o mesmo e não importa se forem dez
  // movimentos ou dez mil.
  const totalMovimentado = Number(dinheiro._sum.amount ?? 0);
  const acoesComDinheiro = dinheiro._count;

  function href(g: string, q?: string) {
    const p = new URLSearchParams();
    if (g !== "todos") p.set("grupo", g);
    if (q) p.set("quem", q);
    return `/auditoria${p.size ? `?${p}` : ""}`;
  }

  return (
    <div>
      <PageHeader
        title="Auditoria"
        description="Quem fez o quê no sistema. O registro não pode ser editado nem apagado pela interface."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Registros" value={total.toLocaleString("pt-BR")} />
        <StatCard
          label="Movimentado em 30 dias"
          value={formatCurrency(totalMovimentado)}
          tone="warning"
          hint={`${acoesComDinheiro} ação(ões) envolvendo dinheiro`}
        />
        <StatCard label="Usuários com acesso" value={String(usuarios.length)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {AUDIT_FILTROS.map((f) => (
          <Link
            key={f.key}
            href={href(f.key, quem)}
            className={
              grupo === f.key
                ? "rounded-lg border border-neon/40 bg-neon/10 px-3 py-1.5 text-sm font-semibold text-neon"
                : "rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:text-foreground"
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href={href(grupo)}
          className={
            !quem
              ? "rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold"
              : "rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition hover:text-foreground"
          }
        >
          Todos
        </Link>
        {usuarios.map((u) => (
          <Link
            key={u.id}
            href={href(grupo, u.id)}
            className={
              quem === u.id
                ? "rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold"
                : "rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition hover:text-foreground"
            }
          >
            {u.name}
          </Link>
        ))}
      </div>

      {logs.length === 0 ? (
        <EmptyState
          title="Nada registrado ainda"
          description="As ações passam a aparecer aqui conforme forem sendo feitas."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Quem</Th>
              <Th>Ação</Th>
              <Th>O que aconteceu</Th>
              <Th>Valor</Th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => {
              const { label, tone } = auditLabel(l.action);
              return (
                <tr key={l.id}>
                  <Td className="whitespace-nowrap text-xs text-muted">
                    {formatDateTime(l.createdAt)}
                  </Td>
                  <Td>
                    <p className="text-sm font-medium">{l.userName}</p>
                    {l.ipAddress && <p className="text-xs text-muted">{l.ipAddress}</p>}
                  </Td>
                  <Td>
                    <Badge tone={TOM[tone]}>{label}</Badge>
                  </Td>
                  <Td className="max-w-[26rem] text-sm">{l.summary}</Td>
                  <Td className="tabular-nums">
                    {l.amount != null ? formatCurrency(Number(l.amount)) : "—"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {logs.length === 200 && (
        <p className="mt-3 text-xs text-muted">
          Mostrando os 200 registros mais recentes. Use os filtros para achar o que precisa.
        </p>
      )}
    </div>
  );
}

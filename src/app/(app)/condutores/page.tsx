import { requireCan } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { confirmarPrincipalCondutor } from "./actions";
import { ConfirmarButtons } from "./ConfirmarButtons";
import { EnviarSolicitacaoButton } from "./EnviarSolicitacaoButton";

export const dynamic = "force-dynamic";

function formatCpf(cpf: string | null): string {
  if (!cpf) return "—";
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

const SELECT_CONDUTOR = {
  id: true,
  startDate: true,
  status: true,
  principalCondutorConfirmado: true,
  principalCondutorRevisadoAt: true,
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
      cpfCnpj: true,
      driverLicense: true,
      driverLicenseState: true,
      driverLicenseCategory: true,
      driverLicenseExpiresAt: true,
    },
  },
  vehicle: { select: { id: true, plate: true, model: true, renavam: true } },
} as const;

export default async function CondutoresPage() {
  await requireCan("operacao");

  const [ativos, pendenciasRemocao] = await Promise.all([
    prisma.contract.findMany({
      where: { status: "ATIVO" },
      select: SELECT_CONDUTOR,
      orderBy: { vehicle: { plate: "asc" } },
    }),
    // Contrato não é mais ativo, mas a pessoa ainda consta como principal
    // condutor confirmado — precisa ir lá tirar no DETRAN.
    prisma.contract.findMany({
      where: { status: { not: "ATIVO" }, principalCondutorConfirmado: true },
      select: SELECT_CONDUTOR,
      orderBy: { principalCondutorRevisadoAt: "desc" },
    }),
  ]);

  const naoRevisados = ativos.filter((c) => c.principalCondutorConfirmado == null).length;
  const agora = new Date();

  return (
    <div>
      <PageHeader
        title="Principal Condutor"
        description="Confira sempre se o carro está de fato com quem está cadastrado como principal condutor no DETRAN/SENATRAN. A confirmação é manual — não existe API para isso."
      />

      {pendenciasRemocao.length > 0 && (
        <section className="mb-8 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-warning">
            ⚠ Já devolveram o carro — tirar como principal condutor ({pendenciasRemocao.length})
          </h2>
          <Table>
            <thead>
              <tr>
                <Th>Motorista</Th>
                <Th>Carro</Th>
                <Th>CPF</Th>
                <Th>Contrato encerrado</Th>
                <Th>Ação</Th>
              </tr>
            </thead>
            <tbody>
              {pendenciasRemocao.map((c) => (
                <tr key={c.id}>
                  <Td className="font-medium">{c.customer.name}</Td>
                  <Td className="font-mono text-sm">
                    {c.vehicle.plate}
                    <span className="ml-1.5 font-sans text-xs text-muted">{c.vehicle.model}</span>
                  </Td>
                  <Td className="text-sm">{formatCpf(c.customer.cpfCnpj)}</Td>
                  <Td className="text-sm text-muted">{c.status}</Td>
                  <Td>
                    <ConfirmarButtons
                      contractId={c.id}
                      action={confirmarPrincipalCondutor}
                      soBotaoRemover
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Locações ativas ({ativos.length})
          </h2>
          {naoRevisados > 0 && (
            <Badge tone="warning">{naoRevisados} ainda não revisado(s)</Badge>
          )}
        </div>

        {ativos.length === 0 ? (
          <EmptyState title="Nenhuma locação ativa" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Motorista</Th>
                <Th>CPF</Th>
                <Th>CNH</Th>
                <Th>Carro</Th>
                <Th>Principal condutor</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {ativos.map((c) => {
                const cnhVencida =
                  c.customer.driverLicenseExpiresAt != null &&
                  c.customer.driverLicenseExpiresAt.getTime() < agora.getTime();
                return (
                  <tr key={c.id}>
                    <Td className="font-medium">
                      {c.customer.name}
                      <p className="text-xs font-normal text-muted">{c.customer.phone ?? "sem telefone"}</p>
                    </Td>
                    <Td className="text-sm">{formatCpf(c.customer.cpfCnpj)}</Td>
                    <Td className="text-sm">
                      {c.customer.driverLicense ? (
                        <>
                          <span className="font-mono">{c.customer.driverLicense}</span>
                          <p className="text-xs text-muted">
                            {[c.customer.driverLicenseCategory, c.customer.driverLicenseState]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                            {c.customer.driverLicenseExpiresAt && (
                              <span className={cnhVencida ? "text-danger" : undefined}>
                                {" "}
                                · venc. {formatDate(c.customer.driverLicenseExpiresAt)}
                              </span>
                            )}
                          </p>
                        </>
                      ) : (
                        <span className="text-muted">
                          não cadastrada
                        </span>
                      )}
                    </Td>
                    <Td className="font-mono text-sm">
                      {c.vehicle.plate}
                      <p className="font-sans text-xs text-muted">{c.vehicle.model}</p>
                    </Td>
                    <Td>
                      {c.principalCondutorConfirmado == null ? (
                        <Badge tone="warning">não revisado</Badge>
                      ) : c.principalCondutorConfirmado ? (
                        <Badge tone="success">sim</Badge>
                      ) : (
                        <Badge tone="default">não</Badge>
                      )}
                      {c.principalCondutorRevisadoAt && (
                        <p className="mt-0.5 text-xs text-muted">
                          revisado em {formatDate(c.principalCondutorRevisadoAt)}
                        </p>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-col items-start gap-2">
                        <ConfirmarButtons contractId={c.id} action={confirmarPrincipalCondutor} />
                        {c.customer.cpfCnpj && c.customer.driverLicense && (
                          <EnviarSolicitacaoButton
                            contractId={c.id}
                            dados={{
                              placa: c.vehicle.plate,
                              cpf: c.customer.cpfCnpj,
                              numeroRegistroCnh: c.customer.driverLicense,
                              nomeEsperado: c.customer.name,
                              renavamConhecido: c.vehicle.renavam,
                            }}
                          />
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}

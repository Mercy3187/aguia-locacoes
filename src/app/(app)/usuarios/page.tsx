import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { PageHeader, Badge, Table, Th, Td } from "@/components/ui";
import { ActionButton } from "@/components/ActionButton";
import { formatDate } from "@/lib/utils";
import { alternarAcesso } from "./actions";
import { NovoUsuario } from "./NovoUsuario";

export const dynamic = "force-dynamic";

const PERFIL_LABEL = {
  ADMIN: { label: "Administrador", tone: "purple" as const },
  FINANCEIRO: { label: "Financeiro / Adm.", tone: "neon" as const },
  FUNCIONARIO: { label: "Operacional", tone: "default" as const },
};

export default async function UsuariosPage() {
  const eu = await requireCan("usuarios");

  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Quem tem acesso ao sistema e o que cada um pode fazer"
      />

      <div className="mb-6">
        <NovoUsuario />
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Nome</Th>
            <Th>E-mail</Th>
            <Th>Perfil</Th>
            <Th>Situação</Th>
            <Th>Criado em</Th>
            <Th>Ações</Th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <Td className="font-medium">
                {u.name}
                {u.id === eu.id && <span className="ml-2 text-xs text-muted">(você)</span>}
              </Td>
              <Td className="text-muted">{u.email}</Td>
              <Td>
                <Badge tone={PERFIL_LABEL[u.role].tone}>{PERFIL_LABEL[u.role].label}</Badge>
              </Td>
              <Td>
                <Badge tone={u.active ? "success" : "danger"}>
                  {u.active ? "Ativo" : "Bloqueado"}
                </Badge>
              </Td>
              <Td className="text-muted">{formatDate(u.createdAt)}</Td>
              <Td>
                {u.id === eu.id ? (
                  <span className="text-xs text-muted">—</span>
                ) : (
                  <ActionButton
                    action={alternarAcesso.bind(null, u.id)}
                    label={u.active ? "Bloquear acesso" : "Reativar"}
                    confirmMessage={
                      u.active
                        ? `Bloquear o acesso de ${u.name}? Ela(e) não consegue mais entrar no sistema.`
                        : `Reativar o acesso de ${u.name}?`
                    }
                    className="rounded-lg border border-border px-3 py-1.5 text-xs"
                  />
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

import { requireUser } from "@/lib/session";
import { LinkButton } from "@/components/ui";
import { homeFor } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function SemPermissaoPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-4xl">🔒</p>
      <h1 className="mt-4 text-xl font-bold">Acesso não permitido</h1>
      <p className="mt-2 text-sm text-muted">
        Seu perfil não tem permissão para abrir esta página. Se você precisa desse
        acesso, peça ao administrador.
      </p>
      <div className="mt-6 flex justify-center">
        <LinkButton href={homeFor(user.role)}>Voltar ao início</LinkButton>
      </div>
    </div>
  );
}

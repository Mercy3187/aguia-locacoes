import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { can, type Capability } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/client";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

/**
 * Garante que há um usuário autenticado. Redireciona para /login caso não haja.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    redirect("/login");
  }
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
  };
}

/**
 * Garante que o usuário está logado E tem a permissão exigida.
 *
 * Use em TODA página protegida e em TODA server action com efeito colateral.
 * Esconder o item no menu não protege a rota — só isto protege.
 */
export async function requireCan(cap: Capability): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, cap)) {
    redirect("/sem-permissao");
  }
  return user;
}

/**
 * Versão para server actions que devolvem `{ error }` em vez de redirecionar —
 * assim o usuário vê a mensagem na tela em que já está.
 */
export async function checkCan(
  cap: Capability
): Promise<{ user: SessionUser; error?: undefined } | { user?: undefined; error: string }> {
  const user = await requireUser();
  if (!can(user.role, cap)) {
    return { error: "Você não tem permissão para esta ação." };
  }
  return { user };
}

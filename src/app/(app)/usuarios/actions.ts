"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { auditar } from "@/lib/audit";

export type UserState = { error?: string; success?: string };

const SENHA_MINIMA = 8;

const baseSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome completo."),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  role: z.enum(["ADMIN", "FINANCEIRO", "FUNCIONARIO"]),
});

const senhaSchema = z
  .string()
  .min(SENHA_MINIMA, `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`)
  .refine((s) => /[a-zA-Z]/.test(s) && /[0-9]/.test(s), {
    message: "A senha precisa ter letras e números.",
  });

/** Cria um usuário do sistema. */
export async function criarUsuario(
  _prev: UserState,
  formData: FormData
): Promise<UserState> {
  const admin = await requireCan("usuarios");

  const parsed = baseSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };

  const senha = senhaSchema.safeParse(formData.get("password"));
  if (!senha.success) return { error: senha.error.issues[0]?.message ?? "Senha inválida." };

  const existe = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existe) return { error: "Já existe um usuário com esse e-mail." };

  const novo = await prisma.user.create({
    data: {
      ...parsed.data,
      passwordHash: await bcrypt.hash(senha.data, 12),
    },
  });

  await auditar(admin, {
    action: "usuario.criado",
    entity: "User",
    entityId: novo.id,
    summary: `Criou o acesso de ${novo.name} (${novo.email}) com perfil ${novo.role}`,
  });

  revalidatePath("/usuarios");
  return { success: `Usuário ${parsed.data.name} criado.` };
}

/** Troca a senha de um usuário. */
export async function trocarSenha(
  _prev: UserState,
  formData: FormData
): Promise<UserState> {
  const admin = await requireCan("usuarios");

  const id = String(formData.get("userId") ?? "");
  if (!id) return { error: "Usuário não informado." };

  const senha = senhaSchema.safeParse(formData.get("password"));
  if (!senha.success) return { error: senha.error.issues[0]?.message ?? "Senha inválida." };

  const alvo = await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(senha.data, 12) },
  });

  await auditar(admin, {
    action: "usuario.senha_alterada",
    entity: "User",
    entityId: id,
    summary: `Alterou a senha de ${alvo.name}`,
  });

  revalidatePath("/usuarios");
  return { success: "Senha alterada." };
}

/** Ativa ou desativa o acesso de um usuário. */
export async function alternarAcesso(userId: string): Promise<{ error?: string }> {
  const admin = await requireCan("usuarios");
  if (admin.id === userId) return { error: "Você não pode desativar o seu próprio acesso." };

  const u = await prisma.user.findUnique({ where: { id: userId }, select: { active: true } });
  if (!u) return { error: "Usuário não encontrado." };

  const alvo = await prisma.user.update({ where: { id: userId }, data: { active: !u.active } });
  await auditar(admin, {
    action: u.active ? "usuario.bloqueado" : "usuario.reativado",
    entity: "User",
    entityId: userId,
    summary: `${u.active ? "Bloqueou" : "Reativou"} o acesso de ${alvo.name}`,
  });
  revalidatePath("/usuarios");
  return {};
}

/** Muda o perfil de acesso de um usuário. */
export async function mudarPerfil(
  userId: string,
  role: "ADMIN" | "FINANCEIRO" | "FUNCIONARIO"
): Promise<{ error?: string }> {
  const admin = await requireCan("usuarios");
  if (admin.id === userId) return { error: "Você não pode mudar o seu próprio perfil." };

  const alvo = await prisma.user.update({ where: { id: userId }, data: { role } });
  await auditar(admin, {
    action: "usuario.perfil_alterado",
    entity: "User",
    entityId: userId,
    summary: `Mudou o perfil de ${alvo.name} para ${role}`,
  });
  revalidatePath("/usuarios");
  return {};
}

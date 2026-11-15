"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { consumir, liberar } from "@/lib/rate-limit";

export type LoginState = { error?: string };

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  // Freia força bruta: conta por IP e por e-mail. Sem isso, uma senha fraca
  // dá acesso a operações que movem dinheiro de verdade no Asaas.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "sem-ip";

  for (const chave of [`ip:${ip}`, `email:${email}`]) {
    const limite = consumir(chave);
    if (!limite.ok) {
      const min = Math.ceil(limite.segundos / 60);
      return { error: `Muitas tentativas. Tente novamente em ${min} minuto(s).` };
    }
  }

  try {
    await signIn("credentials", {
      email,
      password: formData.get("password"),
      // A raiz decide o destino conforme o perfil (a Jessica, por exemplo, não
      // tem acesso ao Dashboard e cairia numa tela de "sem permissão").
      redirectTo: "/",
    });
    liberar(`ip:${ip}`);
    liberar(`email:${email}`);
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "E-mail ou senha inválidos." };
    }
    // Redirecionamentos do Next.js são lançados como erro e devem propagar:
    // o login deu certo, então zera a contagem antes de repassar.
    liberar(`ip:${ip}`);
    liberar(`email:${email}`);
    throw error;
  }
}

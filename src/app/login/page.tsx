"use client";

import { useActionState } from "react";
import { Logo } from "@/components/Logo";
import { EMPRESA } from "@/lib/empresa";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <main className="relative flex flex-1 items-center justify-center px-4 py-12">
      {/* Brilho vermelho bem discreto atrás do cartão, só para a tela não ficar
          um retângulo preto chapado. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute left-1/2 top-1/4 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/[0.06] blur-[120px]" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-9 flex flex-col items-center">
          <Logo className="text-4xl" />
          <p className="mt-4 text-sm text-muted">Gestão interna de frota</p>
        </div>

        <form
          action={formAction}
          className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-black/40"
        >
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand/60"
              placeholder={`voce@${EMPRESA.dominioEmail}`}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none transition-colors focus:border-brand/60"
              placeholder="••••••••"
            />
          </div>

          {state.error && (
            <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-strong disabled:opacity-60"
          >
            {pending ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}

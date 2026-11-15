"use client";

import { useActionState, useState } from "react";
import { Field, FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { criarUsuario, type UserState } from "./actions";
import { EMPRESA } from "@/lib/empresa";

const EMPTY: UserState = {};

const PERFIS = [
  {
    value: "FINANCEIRO",
    label: "Financeiro / Administrativo",
    desc: "Inadimplência, cauções, dívidas, cobrança + operação (motoristas, KM, manutenção). Consulta cadastros. Não apaga nada, não vê integrações nem custo de compra dos carros.",
  },
  {
    value: "FUNCIONARIO",
    label: "Operacional",
    desc: "Só o dia a dia: motoristas, KM, manutenção e óleo. Sem acesso a nada financeiro.",
  },
  {
    value: "ADMIN",
    label: "Administrador",
    desc: "Acesso total, igual ao seu — incluindo excluir registros e configurar integrações.",
  },
] as const;

export function NovoUsuario() {
  const [state, formAction] = useActionState(criarUsuario, EMPTY);
  const [role, setRole] = useState<string>("FINANCEIRO");
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const perfil = PERFIS.find((p) => p.value === role);

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-semibold">Novo usuário</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome completo" htmlFor="name" required>
          <input id="name" name="name" required placeholder="Ex.: Jessica" className={inputClass} />
        </Field>

        <Field label="E-mail de acesso" htmlFor="email" required>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder={`nome@${EMPRESA.dominioEmail}`}
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        label="Senha"
        htmlFor="password"
        required
        hint="Mínimo 8 caracteres, com letras e números. Combine com ela e peça para trocar depois."
      >
        <div className="flex gap-2">
          <input
            id="password"
            name="password"
            type={mostrarSenha ? "text" : "password"}
            required
            minLength={8}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            className="whitespace-nowrap rounded-lg border border-border px-3 text-sm text-muted transition hover:text-foreground"
          >
            {mostrarSenha ? "Ocultar" : "Ver"}
          </button>
        </div>
      </Field>

      <Field label="Perfil de acesso" htmlFor="role" required>
        <select
          id="role"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={inputClass}
        >
          {PERFIS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      {perfil && (
        <p className="rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted">
          {perfil.desc}
        </p>
      )}

      <FormError message={state.error} />
      {state.success && (
        <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          {state.success}
        </p>
      )}

      <SubmitButton pendingLabel="Criando...">Criar usuário</SubmitButton>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field, FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { DocumentoInput, erroDocumento } from "@/components/DocumentoInput";
import { mascararDocumento } from "@/lib/contrato-gerar";
import { formatPhoneForWhatsApp } from "@/lib/utils";
import type { FormState } from "./actions";

export type CustomerDefaults = {
  name?: string;
  cpfCnpj?: string;
  phone?: string;
  email?: string;
  address?: string;
  driverLicense?: string;
  status?: string;
};

export function CustomerForm({
  action,
  defaults = {},
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults?: CustomerDefaults;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const [documento, setDocumento] = useState(() => mascararDocumento(defaults.cpfCnpj ?? ""));
  const [erroLocal, setErroLocal] = useState<string>();

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // Barra o envio antes de ir ao servidor quando o CPF/CNPJ não fecha.
        const erro = erroDocumento(documento);
        setErroLocal(erro);
        if (erro) e.preventDefault();
      }}
      className="max-w-2xl space-y-6"
    >
      <FormError message={erroLocal ?? state.error} />

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome / Razão social" htmlFor="name" required>
          <input id="name" name="name" required defaultValue={defaults.name} className={inputClass} />
        </Field>
        <Field label="CPF / CNPJ" htmlFor="cpfCnpj">
          <DocumentoInput id="cpfCnpj" name="cpfCnpj" value={documento} onChange={setDocumento} />
        </Field>
        <Field
          label="Telefone (WhatsApp)"
          htmlFor="phone"
          hint="Com DDD. Será formatado automaticamente (55 + DDD + número)."
        >
          <input
            id="phone"
            name="phone"
            defaultValue={defaults.phone}
            className={inputClass}
            placeholder="(11) 98888-7777"
          />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <input id="email" name="email" type="email" defaultValue={defaults.email} className={inputClass} />
        </Field>
        <Field label="CNH" htmlFor="driverLicense">
          <input
            id="driverLicense"
            name="driverLicense"
            defaultValue={defaults.driverLicense}
            className={inputClass}
          />
        </Field>
        <Field label="Status" htmlFor="status">
          <select id="status" name="status" defaultValue={defaults.status ?? "ativo"} className={inputClass}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </Field>
      </section>

      <Field label="Endereço" htmlFor="address">
        <textarea id="address" name="address" rows={2} defaultValue={defaults.address} className={inputClass} />
      </Field>

      {defaults.phone && !formatPhoneForWhatsApp(defaults.phone) && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          ⚠️ O telefone informado não parece válido para WhatsApp. Verifique o DDD e o número.
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href="/clientes" className="text-sm text-muted hover:text-foreground">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

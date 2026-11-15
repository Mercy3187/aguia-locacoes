"use client";

import { useActionState } from "react";
import { Field, FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";

export function GroupSettingsForm({
  action,
  nome,
  valorDesconto,
  labelDesconto,
}: {
  action: (prev: { error?: string }, formData: FormData) => Promise<{ error?: string }>;
  nome: string;
  valorDesconto?: string;
  labelDesconto?: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Nome do grupo" htmlFor="name">
        <input id="name" name="name" required defaultValue={nome} className={inputClass} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Desconto mensal automático (R$)"
          htmlFor="monthlyDeductionValue"
          hint="Em branco = sem desconto automático"
        >
          <input
            id="monthlyDeductionValue"
            name="monthlyDeductionValue"
            type="number"
            step="0.01"
            min="0"
            defaultValue={valorDesconto}
            placeholder="Ex.: 500"
            className={inputClass}
          />
        </Field>
        <Field label="Texto do lançamento" htmlFor="monthlyDeductionLabel">
          <input
            id="monthlyDeductionLabel"
            name="monthlyDeductionLabel"
            defaultValue={labelDesconto}
            placeholder="Desconto mensal"
            className={inputClass}
          />
        </Field>
      </div>
      <FormError message={state.error} />
      <SubmitButton>Salvar</SubmitButton>
    </form>
  );
}

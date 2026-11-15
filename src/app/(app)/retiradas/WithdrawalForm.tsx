"use client";

import { useActionState } from "react";
import { Field, FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { createWithdrawal } from "./actions";

export function WithdrawalForm({ groupId }: { groupId: string }) {
  const action = createWithdrawal.bind(null, groupId);
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data" htmlFor="date" required>
          <input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={inputClass}
          />
        </Field>
        <Field label="Valor (R$)" htmlFor="value" required>
          <input
            id="value"
            name="value"
            type="number"
            step="0.01"
            min="0.01"
            required
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Observação" htmlFor="note" hint="Opcional">
        <input id="note" name="note" className={inputClass} />
      </Field>
      <FormError message={state.error} />
      <SubmitButton>+ Lançar retirada</SubmitButton>
    </form>
  );
}

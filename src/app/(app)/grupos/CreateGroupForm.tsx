"use client";

import { useActionState } from "react";
import { Field, FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { createVehicleGroup } from "./actions";

export function CreateGroupForm() {
  const [state, formAction] = useActionState(createVehicleGroup, {});

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Field label="Novo grupo" htmlFor="name">
            <input id="name" name="name" required placeholder="Ex.: INVESTIDOR A" className={inputClass} />
          </Field>
        </div>
        <SubmitButton>+ Criar</SubmitButton>
      </div>
      <FormError message={state.error} />
    </form>
  );
}

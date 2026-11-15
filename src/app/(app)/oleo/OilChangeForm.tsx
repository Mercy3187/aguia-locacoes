"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import type { FormState } from "./actions";

type Option = { id: string; label: string };

export function OilChangeForm({
  action,
  vehicles,
  defaultVehicleId,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  vehicles: Option[];
  defaultVehicleId?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <FormError message={state.error} />

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Veículo" htmlFor="vehicleId" required>
          <select
            id="vehicleId"
            name="vehicleId"
            required
            defaultValue={defaultVehicleId ?? ""}
            className={inputClass}
          >
            <option value="" disabled>
              Selecione...
            </option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data da troca" htmlFor="date" required>
          <input id="date" name="date" type="date" required defaultValue={today} className={inputClass} />
        </Field>
        <Field label="KM da troca" htmlFor="lastChangeKm" required>
          <input id="lastChangeKm" name="lastChangeKm" type="number" required className={inputClass} />
        </Field>
        <Field label="Intervalo (km)" htmlFor="intervalKm" required hint="Padrão: 10.000 km">
          <input
            id="intervalKm"
            name="intervalKm"
            type="number"
            required
            defaultValue="10000"
            className={inputClass}
          />
        </Field>
        <Field label="Tipo de óleo" htmlFor="oilType">
          <input id="oilType" name="oilType" className={inputClass} placeholder="Ex.: 5W30 sintético" />
        </Field>
        <Field label="Oficina" htmlFor="workshop">
          <input id="workshop" name="workshop" className={inputClass} />
        </Field>
        <Field label="Valor (R$)" htmlFor="value">
          <input id="value" name="value" type="number" step="0.01" className={inputClass} />
        </Field>
      </section>

      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-2 text-sm text-muted">Filtros trocados</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { name: "oilFilter", label: "Óleo" },
            { name: "airFilter", label: "Ar" },
            { name: "cabinFilter", label: "Cabine" },
            { name: "fuelFilter", label: "Combustível" },
          ].map((f) => (
            <label key={f.name} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={f.name} className="h-4 w-4 accent-[var(--brand)]" />
              {f.label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Nota fiscal (foto ou PDF)" htmlFor="invoice">
        <input id="invoice" name="invoice" type="file" accept="image/*,application/pdf" className={inputClass} />
      </Field>

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Registrando...">Registrar troca</SubmitButton>
        <Link href="/oleo" className="text-sm text-muted hover:text-foreground">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { VEHICLE_STATUS_OPTIONS } from "@/lib/labels";
import type { FormState } from "./actions";

export type VehicleDefaults = {
  plate?: string;
  brand?: string;
  model?: string;
  year?: string;
  color?: string;
  status?: string;
  ownerName?: string;
  purchaseValue?: string;
  investedValue?: string;
  currentKm?: string;
  lastOilChangeKm?: string;
  oilChangeIntervalKm?: string;
  insuranceDueDate?: string;
  ipvaDueDate?: string;
  licensingDueDate?: string;
  notes?: string;
};

export function VehicleForm({
  action,
  defaults = {},
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults?: VehicleDefaults;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      <FormError message={state.error} />

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Placa" htmlFor="plate" required>
          <input
            id="plate"
            name="plate"
            required
            defaultValue={defaults.plate}
            className={inputClass}
            placeholder="ABC1D23"
          />
        </Field>
        <Field label="Status" htmlFor="status">
          <select
            id="status"
            name="status"
            defaultValue={defaults.status ?? "DISPONIVEL"}
            className={inputClass}
          >
            {VEHICLE_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Marca" htmlFor="brand">
          <input id="brand" name="brand" defaultValue={defaults.brand} className={inputClass} />
        </Field>
        <Field label="Modelo" htmlFor="model">
          <input id="model" name="model" defaultValue={defaults.model} className={inputClass} />
        </Field>
        <Field label="Ano" htmlFor="year">
          <input
            id="year"
            name="year"
            type="number"
            defaultValue={defaults.year}
            className={inputClass}
            placeholder="2022"
          />
        </Field>
        <Field label="Cor" htmlFor="color">
          <input id="color" name="color" defaultValue={defaults.color} className={inputClass} />
        </Field>
        <Field label="Proprietário" htmlFor="ownerName">
          <input
            id="ownerName"
            name="ownerName"
            defaultValue={defaults.ownerName}
            className={inputClass}
          />
        </Field>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Valor de compra (R$)" htmlFor="purchaseValue">
          <input
            id="purchaseValue"
            name="purchaseValue"
            type="number"
            step="0.01"
            defaultValue={defaults.purchaseValue}
            className={inputClass}
          />
        </Field>
        <Field label="Valor investido (R$)" htmlFor="investedValue">
          <input
            id="investedValue"
            name="investedValue"
            type="number"
            step="0.01"
            defaultValue={defaults.investedValue}
            className={inputClass}
          />
        </Field>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Field label="KM atual" htmlFor="currentKm">
          <input
            id="currentKm"
            name="currentKm"
            type="number"
            defaultValue={defaults.currentKm ?? "0"}
            className={inputClass}
          />
        </Field>
        <Field label="KM da última troca de óleo" htmlFor="lastOilChangeKm">
          <input
            id="lastOilChangeKm"
            name="lastOilChangeKm"
            type="number"
            defaultValue={defaults.lastOilChangeKm}
            className={inputClass}
          />
        </Field>
        <Field
          label="Intervalo de troca (km)"
          htmlFor="oilChangeIntervalKm"
          hint="Padrão: 10.000 km"
        >
          <input
            id="oilChangeIntervalKm"
            name="oilChangeIntervalKm"
            type="number"
            defaultValue={defaults.oilChangeIntervalKm ?? "10000"}
            className={inputClass}
          />
        </Field>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Field label="Vencimento do seguro" htmlFor="insuranceDueDate">
          <input
            id="insuranceDueDate"
            name="insuranceDueDate"
            type="date"
            defaultValue={defaults.insuranceDueDate}
            className={inputClass}
          />
        </Field>
        <Field label="Vencimento do IPVA" htmlFor="ipvaDueDate">
          <input
            id="ipvaDueDate"
            name="ipvaDueDate"
            type="date"
            defaultValue={defaults.ipvaDueDate}
            className={inputClass}
          />
        </Field>
        <Field label="Vencimento do licenciamento" htmlFor="licensingDueDate">
          <input
            id="licensingDueDate"
            name="licensingDueDate"
            type="date"
            defaultValue={defaults.licensingDueDate}
            className={inputClass}
          />
        </Field>
      </section>

      <Field label="Observações" htmlFor="notes">
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaults.notes}
          className={inputClass}
        />
      </Field>

      {/* A KM digitada é menor que a que o carro tem hoje. Nada foi salvo:
          confirmar aqui reenvia o formulário inteiro com o aval. */}
      {state.confirmarKm && (
        <div className="space-y-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="text-sm text-warning">{state.confirmarKm}</p>
          <button
            type="submit"
            name="kmConfirmado"
            value="1"
            className="text-sm font-medium text-warning underline-offset-4 transition hover:underline"
          >
            Sim, é uma correção — salvar com essa KM
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href="/veiculos" className="text-sm text-muted hover:text-foreground">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

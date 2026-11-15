"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import {
  CONTRACT_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
} from "@/lib/labels";
import type { FormState } from "./actions";

export type ContractDefaults = {
  customerId?: string;
  vehicleId?: string;
  startDate?: string;
  endDate?: string;
  weeklyValue?: string;
  depositValue?: string;
  status?: string;
  paymentStatus?: string;
};

type Option = { id: string; label: string };

export function ContractForm({
  action,
  customers,
  vehicles,
  defaults = {},
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  customers: Option[];
  vehicles: Option[];
  defaults?: ContractDefaults;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <FormError message={state.error} />

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Cliente" htmlFor="customerId" required>
          <select
            id="customerId"
            name="customerId"
            required
            defaultValue={defaults.customerId ?? ""}
            className={inputClass}
          >
            <option value="" disabled>
              Selecione...
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Veículo" htmlFor="vehicleId" required>
          <select
            id="vehicleId"
            name="vehicleId"
            required
            defaultValue={defaults.vehicleId ?? ""}
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
        <Field label="Início" htmlFor="startDate" required>
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            defaultValue={defaults.startDate}
            className={inputClass}
          />
        </Field>
        <Field label="Término (opcional)" htmlFor="endDate">
          <input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={defaults.endDate}
            className={inputClass}
          />
        </Field>
        <Field label="Valor semanal (R$)" htmlFor="weeklyValue">
          <input
            id="weeklyValue"
            name="weeklyValue"
            type="number"
            step="0.01"
            defaultValue={defaults.weeklyValue}
            className={inputClass}
          />
        </Field>
        <Field label="Caução / Depósito (R$)" htmlFor="depositValue">
          <input
            id="depositValue"
            name="depositValue"
            type="number"
            step="0.01"
            defaultValue={defaults.depositValue}
            className={inputClass}
          />
        </Field>
        <Field
          label="Status do contrato"
          htmlFor="status"
          hint="Ao marcar como Ativo, o ciclo de KM (a cada 15 dias) é iniciado."
        >
          <select
            id="status"
            name="status"
            defaultValue={defaults.status ?? "PENDENTE"}
            className={inputClass}
          >
            {CONTRACT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status do pagamento" htmlFor="paymentStatus">
          <select
            id="paymentStatus"
            name="paymentStatus"
            defaultValue={defaults.paymentStatus ?? "PENDENTE"}
            className={inputClass}
          >
            {PAYMENT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </section>

      <div className="flex items-center gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href="/contratos" className="text-sm text-muted hover:text-foreground">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

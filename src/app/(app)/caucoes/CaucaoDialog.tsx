"use client";

import { useActionState, useEffect, useState } from "react";
import { Field, FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { salvarCaucao, type CaucaoState } from "./actions";

const EMPTY: CaucaoState = {};

export type CaucaoDefaults = {
  contractId: string;
  nome: string;
  placa: string;
  depositValue: string;
  depositPaidValue: string;
  depositPaidAt: string;
  depositRefundedAt: string;
  depositNotes: string;
  pickupDate: string;
  pickupDone: boolean;
  pickupNotes: string;
};

export function EditarCaucaoButton({ d }: { d: CaucaoDefaults }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(salvarCaucao, EMPTY);

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition hover:text-foreground"
      >
        Editar
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-left shadow-xl"
          >
            <h2 className="text-lg font-bold">{d.nome}</h2>
            <p className="mb-4 font-mono text-xs text-muted">{d.placa}</p>

            <form action={formAction} className="space-y-4">
              <input type="hidden" name="contractId" value={d.contractId} />

              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Caução</p>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Valor combinado (R$)" htmlFor={`dv-${d.contractId}`}>
                  <input
                    id={`dv-${d.contractId}`}
                    name="depositValue"
                    inputMode="decimal"
                    defaultValue={d.depositValue}
                    placeholder="Ex.: 800,00"
                    className={inputClass}
                  />
                </Field>

                <Field
                  label="Já pago (R$)"
                  htmlFor={`dp-${d.contractId}`}
                  hint="Permite caução parcelada."
                >
                  <input
                    id={`dp-${d.contractId}`}
                    name="depositPaidValue"
                    inputMode="decimal"
                    defaultValue={d.depositPaidValue}
                    placeholder="0,00"
                    className={inputClass}
                  />
                </Field>

                <Field label="Data do pagamento" htmlFor={`dpa-${d.contractId}`}>
                  <input
                    id={`dpa-${d.contractId}`}
                    name="depositPaidAt"
                    type="datetime-local"
                    defaultValue={d.depositPaidAt}
                    className={inputClass}
                  />
                </Field>

                <Field
                  label="Devolvida em"
                  htmlFor={`dr-${d.contractId}`}
                  hint="Preencha só ao devolver."
                >
                  <input
                    id={`dr-${d.contractId}`}
                    name="depositRefundedAt"
                    type="datetime-local"
                    defaultValue={d.depositRefundedAt}
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field label="Observações da caução" htmlFor={`dn-${d.contractId}`}>
                <textarea
                  id={`dn-${d.contractId}`}
                  name="depositNotes"
                  rows={2}
                  defaultValue={d.depositNotes}
                  placeholder="Ex.: pago em 2x, R$ 400 no PIX e R$ 400 em dinheiro"
                  className={inputClass}
                />
              </Field>

              <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Entrega do carro
              </p>

              <Field label="Data e hora da retirada" htmlFor={`pd-${d.contractId}`}>
                <input
                  id={`pd-${d.contractId}`}
                  name="pickupDate"
                  type="datetime-local"
                  defaultValue={d.pickupDate}
                  className={inputClass}
                />
              </Field>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="pickupDone"
                  defaultChecked={d.pickupDone}
                  className="size-4 rounded border-border"
                />
                Motorista já retirou o carro
              </label>

              <Field label="Observações da entrega" htmlFor={`pn-${d.contractId}`}>
                <textarea
                  id={`pn-${d.contractId}`}
                  name="pickupNotes"
                  rows={2}
                  defaultValue={d.pickupNotes}
                  placeholder="Ex.: entregar com tanque cheio, levar 2ª via da chave"
                  className={inputClass}
                />
              </Field>

              <FormError message={state.error} />

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition hover:text-foreground"
                >
                  Cancelar
                </button>
                <SubmitButton>Salvar</SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

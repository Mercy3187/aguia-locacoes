"use client";

import { useActionState, useEffect, useState } from "react";
import { Field, FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import {
  pararParaManutencao,
  registrarSaidaManutencao,
  type MaintenanceFormState,
} from "./actions";

const EMPTY: MaintenanceFormState = {};

/** Botão que abre um diálogo para dar entrada do carro na manutenção. */
export function EntradaManutencaoButton({
  vehicleId,
  plate,
  nowValue,
}: {
  vehicleId: string;
  plate: string;
  nowValue: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(pararParaManutencao, EMPTY);

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning transition hover:bg-warning/20"
      >
        Parar p/ manutenção
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Parar ${plate} para manutenção`}>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="vehicleId" value={vehicleId} />

          <Field label="Data e hora de entrada" htmlFor={`start-${vehicleId}`} required>
            <input
              id={`start-${vehicleId}`}
              name="startAt"
              type="datetime-local"
              defaultValue={nowValue}
              required
              className={inputClass}
            />
          </Field>

          <Field label="Tipo de manutenção" htmlFor={`type-${vehicleId}`} required>
            <input
              id={`type-${vehicleId}`}
              name="type"
              list="tipos-manutencao"
              placeholder="Ex.: Revisão, Freios, Embreagem"
              required
              className={inputClass}
            />
            <datalist id="tipos-manutencao">
              <option value="Revisão" />
              <option value="Troca de óleo" />
              <option value="Freios" />
              <option value="Embreagem" />
              <option value="Suspensão" />
              <option value="Pneus" />
              <option value="Elétrica" />
              <option value="Funilaria" />
              <option value="Ar-condicionado" />
            </datalist>
          </Field>

          <Field label="Oficina" htmlFor={`workshop-${vehicleId}`}>
            <input
              id={`workshop-${vehicleId}`}
              name="workshop"
              placeholder="Opcional"
              className={inputClass}
            />
          </Field>

          <Field label="Observações" htmlFor={`desc-${vehicleId}`}>
            <textarea
              id={`desc-${vehicleId}`}
              name="description"
              rows={2}
              placeholder="Opcional"
              className={inputClass}
            />
          </Field>

          <FormError message={state.error} />

          <p className="text-xs text-muted">
            O carro passa para “Manutenção”. O desconto do motorista é calculado quando
            você registrar a saída.
          </p>

          <DialogActions onCancel={() => setOpen(false)} label="Confirmar entrada" />
        </form>
      </Dialog>
    </>
  );
}

/** Botão que abre um diálogo para registrar a saída da manutenção. */
export function SaidaManutencaoButton({
  maintenanceId,
  plate,
  nowValue,
}: {
  maintenanceId: string;
  plate: string;
  nowValue: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(registrarSaidaManutencao, EMPTY);

  // Total mostrado enquanto se digita — o valor que vai para o relatório
  // aparece antes de confirmar. Aceita "350,00" como o resto do formulário.
  const [pecas, setPecas] = useState("");
  const [maoDeObra, setMaoDeObra] = useState("");
  const emNumero = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;
  const totalSaida = emNumero(pecas) + emNumero(maoDeObra);

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success transition hover:bg-success/20"
      >
        Registrar saída
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title={`Saída da manutenção — ${plate}`}>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="maintenanceId" value={maintenanceId} />

          <Field label="Data e hora de saída" htmlFor={`end-${maintenanceId}`} required>
            <input
              id={`end-${maintenanceId}`}
              name="endAt"
              type="datetime-local"
              defaultValue={nowValue}
              required
              className={inputClass}
            />
          </Field>

          {/* Peça e mão de obra são pagas a gente diferente: a peça na
              autopeças, o serviço ao mecânico. Continuam podendo ficar em
              branco aqui — na saída nem sempre a nota da peça já chegou, e o
              carro precisa voltar a rodar de qualquer jeito. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Peça (R$)" htmlFor={`parts-${maintenanceId}`}>
              <input
                id={`parts-${maintenanceId}`}
                name="partsCost"
                inputMode="decimal"
                placeholder="Ex.: 350,00"
                value={pecas}
                onChange={(e) => setPecas(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Mão de obra (R$)" htmlFor={`labor-${maintenanceId}`}>
              <input
                id={`labor-${maintenanceId}`}
                name="laborCost"
                inputMode="decimal"
                placeholder="Ex.: 500,00"
                value={maoDeObra}
                onChange={(e) => setMaoDeObra(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <Field
            label="Fornecedor da peça"
            htmlFor={`supplier-${maintenanceId}`}
            hint="A autopeças onde você comprou"
          >
            <input
              id={`supplier-${maintenanceId}`}
              name="partsSupplier"
              className={inputClass}
            />
          </Field>

          <div className="flex items-baseline justify-between rounded-lg border border-border bg-surface-2 px-4 py-2.5">
            <span className="text-sm text-muted">Total da manutenção</span>
            <span className="font-semibold tabular-nums">
              {totalSaida.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </span>
          </div>

          <FormError message={state.error} />

          <p className="text-xs text-muted">
            O desconto proporcional dos dias parados é calculado automaticamente e entra
            na cobrança da próxima semana.
          </p>

          <DialogActions onCancel={() => setOpen(false)} label="Confirmar saída" />
        </form>
      </Dialog>
    </>
  );
}

function DialogActions({ onCancel, label }: { onCancel: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition hover:text-foreground"
      >
        Cancelar
      </button>
      <SubmitButton pendingLabel="Registrando...">{label}</SubmitButton>
    </div>
  );
}

/** Modal simples com fundo escurecido, fechável pelo Esc. */
function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-5 text-left shadow-xl"
      >
        <h2 className="mb-4 text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

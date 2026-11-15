"use client";

import { useActionState } from "react";
import { Field, FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { NIVEIS_COMBUSTIVEL } from "@/lib/contrato-gerar";
import { registrarDevolucao, type DevolucaoState } from "./devolucao";

const INICIAL: DevolucaoState = {};

export function DevolucaoForm({
  contractId,
  placa,
  agora,
  kmAtual,
  kmEntrega,
}: {
  contractId: string;
  placa: string;
  /** "agora" no formato do datetime-local, em horário de Brasília. */
  agora: string;
  kmAtual: number;
  kmEntrega: number | null;
}) {
  const [state, formAction] = useActionState(registrarDevolucao.bind(null, contractId), INICIAL);

  return (
    <section id="devolucao" className="mb-10 rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-lg font-bold text-brand">DEVOLUÇÃO DO VEÍCULO</h2>
      <p className="mb-5 mt-1 text-xs text-muted">
        Ao registrar, o contrato é encerrado, o {placa} volta para o pátio e o período fecha na
        linha do tempo do veículo.
      </p>

      <form
        action={formAction}
        onSubmit={(e) => {
          if (!confirm(`Registrar a devolução do ${placa} e encerrar o contrato?`)) e.preventDefault();
        }}
        className="space-y-4"
      >
        <FormError message={state.error} />

        <div className="grid gap-x-8 gap-y-4 md:grid-cols-3">
          <Field label="Data da devolução:" htmlFor="dev-em" required>
            <input
              id="dev-em"
              name="em"
              type="datetime-local"
              defaultValue={agora}
              required
              className={inputClass}
            />
          </Field>
          <Field
            label="Odômetro devolução:"
            htmlFor="dev-odometro"
            required
            hint={
              kmEntrega != null
                ? `Na entrega: ${kmEntrega.toLocaleString("pt-BR")} km`
                : `KM atual no sistema: ${kmAtual.toLocaleString("pt-BR")} km`
            }
          >
            <input
              id="dev-odometro"
              name="odometro"
              type="number"
              min={0}
              defaultValue={kmAtual}
              required
              className={inputClass}
            />
          </Field>
          <Field label="Nível combustível devolução:" htmlFor="dev-combustivel" required>
            <select id="dev-combustivel" name="combustivel" defaultValue="" required className={inputClass}>
              <option value="">Selecione...</option>
              {NIVEIS_COMBUSTIVEL.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <div className="md:col-span-3">
            <Field label="Observação:" htmlFor="dev-obs" hint="Avarias, itens faltando, sujeira…">
              <textarea id="dev-obs" name="observacao" rows={2} maxLength={1000} className={inputClass} />
            </Field>
          </div>
        </div>

        <SubmitButton pendingLabel="Registrando...">Registrar devolução</SubmitButton>
      </form>
    </section>
  );
}

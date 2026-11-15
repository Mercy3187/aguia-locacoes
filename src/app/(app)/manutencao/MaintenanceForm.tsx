"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field, FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import type { FormState } from "./actions";

type Option = { id: string; label: string };
type Origem = "frota" | "avulso";

export function MaintenanceForm({
  action,
  vehicles,
  defaultVehicleId,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  vehicles: Option[];
  defaultVehicleId?: string;
}) {
  const [state, formAction] = useActionState(action, {});

  // Sem carro na frota não há o que escolher, então o formulário já abre no
  // modo avulso — é a única coisa que dá para registrar nesse caso.
  const temFrota = vehicles.length > 0;
  const [origem, setOrigem] = useState<Origem>(temFrota ? "frota" : "avulso");

  // O total é a soma das duas partes, mostrada enquanto se digita: assim o
  // valor que vai para o relatório aparece antes de salvar, e não depois.
  const [pecas, setPecas] = useState("");
  const [maoDeObra, setMaoDeObra] = useState("");
  const total = (Number(pecas) || 0) + (Number(maoDeObra) || 0);

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <FormError message={state.error} />

      {/* Escolha do modo. Um `radio` de verdade (e não um botão qualquer)
          para o teclado e o leitor de tela entenderem que são opções
          excludentes; o `input` some visualmente, o rótulo vira o alvo. */}
      <fieldset className="rounded-xl border border-border bg-surface p-1">
        <legend className="sr-only">Tipo de carro</legend>
        <div className="grid grid-cols-2 gap-1">
          {(
            [
              { valor: "frota", titulo: "Carro da frota", ajuda: "Cadastrado no sistema" },
              { valor: "avulso", titulo: "Carro avulso", ajuda: "Fora da frota, serviço pontual" },
            ] as const
          ).map((op) => {
            const ativo = origem === op.valor;
            const desabilitado = op.valor === "frota" && !temFrota;
            return (
              <label
                key={op.valor}
                className={[
                  "cursor-pointer rounded-lg px-3 py-2.5 text-center transition-colors",
                  ativo
                    ? "bg-brand/10 text-brand ring-1 ring-brand/40"
                    : "text-muted hover:text-foreground",
                  desabilitado ? "cursor-not-allowed opacity-40" : "",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="origem"
                  value={op.valor}
                  checked={ativo}
                  disabled={desabilitado}
                  onChange={() => setOrigem(op.valor)}
                  className="sr-only"
                />
                <span className="block text-sm font-medium">{op.titulo}</span>
                <span className="mt-0.5 block text-[11px] opacity-70">{op.ajuda}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <section className="grid gap-4 sm:grid-cols-2">
        {origem === "frota" ? (
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
        ) : (
          <>
            <Field label="Placa" htmlFor="avulsoPlate" hint="Placa ou modelo, ao menos um">
              <input
                id="avulsoPlate"
                name="avulsoPlate"
                className={inputClass}
                placeholder="ABC-1D23"
                autoComplete="off"
              />
            </Field>
            <Field label="Modelo" htmlFor="avulsoModel">
              <input
                id="avulsoModel"
                name="avulsoModel"
                className={inputClass}
                placeholder="Ex.: Fiat Uno 2015"
                autoComplete="off"
              />
            </Field>
          </>
        )}

        <Field label="Tipo de manutenção" htmlFor="type" required>
          <input id="type" name="type" required className={inputClass} placeholder="Ex.: Revisão, Freios, Funilaria" />
        </Field>
        <Field label="Oficina / mecânico" htmlFor="workshop" hint="Quem faz o serviço">
          <input id="workshop" name="workshop" className={inputClass} />
        </Field>
        <Field label="Início" htmlFor="startAt" hint="Padrão: agora">
          <input id="startAt" name="startAt" type="datetime-local" className={inputClass} />
        </Field>
      </section>

      {/* ── Peça e mão de obra ──
          São dois desembolsos diferentes: a peça você compra na autopeças e
          entrega ao mecânico; ao mecânico paga só o serviço. O total é a soma
          dos dois e não se digita — aparece calculado abaixo. */}
      <section className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <div>
          <h3 className="text-sm font-semibold">Peça e mão de obra</h3>
          <p className="mt-0.5 text-xs text-muted">
            Se um dos dois não teve custo, deixe em 0
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Peça (R$)" htmlFor="partsCost" required>
            <input
              id="partsCost"
              name="partsCost"
              type="number"
              step="0.01"
              min="0"
              required
              value={pecas}
              onChange={(e) => setPecas(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Mão de obra (R$)" htmlFor="laborCost" required>
            <input
              id="laborCost"
              name="laborCost"
              type="number"
              step="0.01"
              min="0"
              required
              value={maoDeObra}
              onChange={(e) => setMaoDeObra(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field
          label="Fornecedor da peça"
          htmlFor="partsSupplier"
          hint="A autopeças onde você comprou"
        >
          <input id="partsSupplier" name="partsSupplier" className={inputClass} />
        </Field>

        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-sm text-muted">Total da manutenção</span>
          <span className="text-lg font-semibold tabular-nums">
            {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        </div>
      </section>

      <Field label="Descrição" htmlFor="description">
        <textarea id="description" name="description" rows={3} className={inputClass} />
      </Field>

      {origem === "avulso" && (
        <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-xs text-muted">
          O carro avulso não é cadastrado na frota: não entra na contagem de
          veículos, nem no controle de óleo, correia ou quilometragem. O gasto
          aparece na linha <span className="text-foreground">Avulsos</span>.
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Registrando...">Registrar manutenção</SubmitButton>
        <Link href="/manutencao" className="text-sm text-muted hover:text-foreground">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field, FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CORREIA_INTERVALO_PADRAO_KM } from "@/lib/correia";
import type { FormState } from "./actions";

export type OpcaoVeiculo = {
  id: string;
  label: string;
  currentKm: number;
  intervaloKm: number;
  lastTimingBeltKm: number | null;
};

export function CorreiaForm({
  action,
  vehicles,
  defaultVehicleId,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  vehicles: OpcaoVeiculo[];
  defaultVehicleId?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const [vehicleId, setVehicleId] = useState(defaultVehicleId ?? "");
  const [km, setKm] = useState("");

  const selecionado = vehicles.find((v) => v.id === vehicleId);
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <FormError message={state.error} />

      <section className="grid gap-4 sm:grid-cols-2">
        <Field label="Veículo" htmlFor="vehicleId" required>
          <select
            id="vehicleId"
            name="vehicleId"
            required
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
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

        <Field
          label="Data da troca"
          htmlFor="date"
          hint="Opcional — o controle é por quilometragem"
        >
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={hoje}
            className={inputClass}
          />
        </Field>

        <Field
          label="KM da troca"
          htmlFor="lastTimingBeltKm"
          required
          hint={
            selecionado
              ? `O odômetro do carro marca ${selecionado.currentKm.toLocaleString("pt-BR")} km`
              : "Quanto o carro tinha rodado quando a correia foi trocada"
          }
        >
          <div className="flex gap-2">
            <input
              id="lastTimingBeltKm"
              name="lastTimingBeltKm"
              type="number"
              min={0}
              required
              value={km}
              onChange={(e) => setKm(e.target.value)}
              className={inputClass}
              placeholder="Ex.: 82000"
            />
            {selecionado && (
              // Atalho para o caso mais comum: a troca foi feita agora.
              <button
                type="button"
                onClick={() => setKm(String(selecionado.currentKm))}
                className="shrink-0 whitespace-nowrap rounded-xl border border-border px-3 text-xs text-muted transition-colors hover:border-border-strong hover:text-foreground"
              >
                Usar KM atual
              </button>
            )}
          </div>
        </Field>

        <Field
          label="Trocar a cada (km)"
          htmlFor="intervalKm"
          required
          hint={`Padrão da frota: ${CORREIA_INTERVALO_PADRAO_KM.toLocaleString("pt-BR")} km`}
        >
          <input
            id="intervalKm"
            name="intervalKm"
            type="number"
            min={1}
            required
            // `key` força o campo a reler o padrão quando o veículo muda —
            // sem isso o valor do carro anterior ficaria preso na tela.
            key={selecionado?.id ?? "sem-veiculo"}
            defaultValue={selecionado?.intervaloKm ?? CORREIA_INTERVALO_PADRAO_KM}
            className={inputClass}
          />
        </Field>
      </section>

      <Field label="Observação" htmlFor="notes">
        <input
          id="notes"
          name="notes"
          className={inputClass}
          placeholder="Ex.: trocada junto com a bomba d'água, oficina do Marcelo"
        />
      </Field>

      {selecionado && km !== "" && Number(km) >= 0 && (
        <p className="rounded-xl border border-brand/25 bg-brand/[0.06] px-4 py-3 text-sm">
          Próxima troca em{" "}
          <span className="font-semibold text-brand tabular-nums">
            {(
              Number(km) + (selecionado.intervaloKm || CORREIA_INTERVALO_PADRAO_KM)
            ).toLocaleString("pt-BR")}{" "}
            km
          </span>
          <span className="text-muted">
            {" "}
            — o sistema avisa sozinho conforme a KM for chegando pelas
            comprovações dos motoristas.
          </span>
        </p>
      )}

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Salvando...">Salvar registro</SubmitButton>
        <Link href="/correia" className="text-sm text-muted hover:text-foreground">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

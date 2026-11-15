"use client";

import { useActionState, useState } from "react";
import { Field, FormError, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { DEBT_TYPE_OPTIONS } from "@/lib/dividas";
import { criarDivida, type DividaState } from "./actions";

const EMPTY: DividaState = {};

export type MotoristaOpcao = { id: string; nome: string; placa: string | null };

/** "1.234,56" / "1234,56" / "1234.56" -> 1234.56 */
function parseBrl(v: string): number {
  const c = v.trim().replace(/\s|R\$/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(c);
  return Number.isFinite(n) ? n : 0;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function NovaDivida({
  motoristas,
  hoje,
}: {
  motoristas: MotoristaOpcao[];
  hoje: string;
}) {
  const [state, formAction] = useActionState(criarDivida, EMPTY);
  const [valor, setValor] = useState("");
  const [parcelas, setParcelas] = useState(1);

  const total = parseBrl(valor);
  const porParcela = parcelas > 1 && total > 0 ? total / parcelas : 0;
  const parcelaBaixa = parcelas > 1 && porParcela > 0 && porParcela < 5;

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <h2 className="font-semibold">Lançar dívida</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Motorista" htmlFor="customerId" required>
          <select id="customerId" name="customerId" required className={inputClass} defaultValue="">
            <option value="" disabled>
              Escolha...
            </option>
            {motoristas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
                {m.placa ? ` — ${m.placa}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tipo" htmlFor="type" required>
          <select id="type" name="type" required className={inputClass} defaultValue="MULTA_TRANSITO">
            {DEBT_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Descrição" htmlFor="description" required>
        <input
          id="description"
          name="description"
          required
          placeholder="Ex.: Avanço de sinal na Av. Boa Viagem, AIT 1234567"
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Valor total (R$)" htmlFor="amount" required>
          <input
            id="amount"
            name="amount"
            required
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Ex.: 293,47"
            className={inputClass}
          />
        </Field>

        <Field label="Parcelas" htmlFor="installments" hint="1 = à vista">
          <select
            id="installments"
            name="installments"
            value={parcelas}
            onChange={(e) => setParcelas(Number(e.target.value))}
            className={inputClass}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "À vista" : `${n}x`}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={parcelas > 1 ? "1º vencimento" : "Vencimento"}
          htmlFor="dueDate"
          required
          hint={parcelas > 1 ? "As demais caem de mês em mês." : undefined}
        >
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            required
            defaultValue={hoje}
            className={inputClass}
          />
        </Field>
      </div>

      {parcelas > 1 && total > 0 && (
        <p
          className={
            parcelaBaixa
              ? "rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
              : "rounded-lg border border-neon/40 bg-neon/10 px-3 py-2 text-sm text-neon"
          }
        >
          {parcelaBaixa
            ? `Cada parcela ficaria em ${brl(porParcela)} — o Asaas não emite parcela abaixo de R$ 5,00. Reduza o número de parcelas.`
            : `${parcelas}x de aproximadamente ${brl(porParcela)} · total ${brl(total)}`}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data do fato" htmlFor="occurredAt" hint="Data da multa, do acidente...">
          <input id="occurredAt" name="occurredAt" type="date" className={inputClass} />
        </Field>

        <Field label="Observações" htmlFor="notes">
          <input id="notes" name="notes" placeholder="Opcional" className={inputClass} />
        </Field>
      </div>

      <FormError message={state.error} />
      {state.success && (
        <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          {state.success}
        </p>
      )}

      <p className="text-xs text-muted">
        A dívida entra como “a cobrar”. A cobrança no Asaas só é emitida quando você
        clicar no botão — nada é enviado ao motorista automaticamente.
      </p>

      <SubmitButton pendingLabel="Lançando...">Lançar dívida</SubmitButton>
    </form>
  );
}

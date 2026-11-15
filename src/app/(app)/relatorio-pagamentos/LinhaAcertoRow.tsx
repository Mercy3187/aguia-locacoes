"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { salvarAcerto } from "./actions";
import type { LinhaAcerto } from "@/lib/acerto";

/**
 * Uma linha do acerto: o carro, o motorista, o valor da semana e o botão que
 * diz se pagou.
 *
 * O valor fica editável porque a semana nem sempre é a semana cheia — teve
 * desconto de carro parado, teve multa de KM somada. O que for digitado aqui é
 * o que vai para o relatório.
 */
export function LinhaAcertoRow({
  semana,
  linha,
}: {
  semana: string;
  linha: LinhaAcerto;
}) {
  const [valor, setValor] = useState(linha.valor);
  const [pago, setPago] = useState(linha.pago);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();

  function salvar(proximoPago: boolean, proximoValor: number) {
    setErro(undefined);
    // O estado local vira antes da resposta: quem está acertando nove carros
    // seguidos não pode esperar o servidor a cada clique.
    setPago(proximoPago);
    setValor(proximoValor);
    iniciar(async () => {
      const r = await salvarAcerto({
        semana,
        vehicleId: linha.vehicleId,
        contractId: linha.contractId,
        valor: proximoValor,
        pago: proximoPago,
      });
      if (r.error) {
        setErro(r.error);
        setPago(linha.pago);
        setValor(linha.valor);
      }
    });
  }

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 p-4 transition-colors",
        pago && "bg-success/[0.04]"
      )}
    >
      <span className="w-6 shrink-0 text-sm font-semibold tabular-nums text-muted">
        {linha.numero}.
      </span>

      <div className="min-w-[11rem] flex-1">
        <p className="text-sm font-semibold">{linha.modelo}</p>
        <p className="mt-0.5 font-mono text-xs text-muted">{linha.plate}</p>
      </div>

      <div className="min-w-[10rem] flex-1">
        <p className="text-sm">{linha.motorista}</p>
        {linha.trocouNoMeioDaSemana && (
          <p className="mt-0.5 text-xs font-medium text-warning">
            ⚠ trocou no meio da semana
            {linha.motoristaAnterior && ` · antes: ${linha.motoristaAnterior}`}
          </p>
        )}
        {pago && linha.pagoEm && (
          <p className="mt-0.5 text-xs text-muted">
            pago em {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(linha.pagoEm)}
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-muted">
        R$
        <input
          type="number"
          step="0.01"
          min="0"
          value={valor}
          onChange={(e) => setValor(Number(e.target.value))}
          onBlur={(e) => {
            const novo = Number(e.target.value);
            if (novo !== linha.valor || pago !== linha.pago) salvar(pago, novo);
          }}
          aria-label={`Valor da semana de ${linha.motorista}`}
          className="w-24 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-right text-sm tabular-nums outline-none transition-colors focus:border-brand/60"
        />
      </label>

      <button
        type="button"
        onClick={() => salvar(!pago, valor)}
        disabled={pendente}
        aria-pressed={pago}
        className={cn(
          "min-w-[7.5rem] rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60",
          pago
            ? "border-success/40 bg-success/10 text-success hover:border-success/70"
            : "border-border text-muted hover:border-border-strong hover:text-foreground"
        )}
      >
        {pago ? "✓ Pago" : "Marcar pago"}
      </button>

      {erro && <span className="w-full text-xs text-danger">{erro}</span>}
    </li>
  );
}

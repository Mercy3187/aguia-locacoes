"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import type { SendResult } from "./actions";

/**
 * Conferência de um registro de KM.
 *
 * É aqui que a quilometragem passa a valer para o veículo. Por padrão aplica o
 * que o motorista digitou; abrindo "corrigir", dá para gravar outro número —
 * o caso de quem digitou 1.001.601 no lugar de 235.327.
 */
export function ConferirKm({
  action,
  informedKm,
  ocrKm,
  plate,
}: {
  action: (kmCorrigida?: number | null) => Promise<SendResult>;
  informedKm: number;
  ocrKm: number | null;
  plate: string;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string>();
  const [corrigindo, setCorrigindo] = useState(false);
  const [valor, setValor] = useState(String(informedKm));

  const numero = Number(valor);
  const valido = valor !== "" && Number.isFinite(numero) && numero >= 0;
  const mudou = valido && Math.trunc(numero) !== informedKm;

  function aplicar(kmCorrigida?: number | null) {
    setErro(undefined);
    startTransition(async () => {
      const r = await action(kmCorrigida);
      if (r.error) setErro(r.error);
    });
  }

  if (!corrigindo) {
    return (
      <span className="inline-flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => aplicar(null)}
            disabled={pending}
            className="text-sm font-medium text-success transition hover:opacity-80 disabled:opacity-60"
          >
            {pending ? "Aplicando..." : "Conferir e aplicar KM"}
          </button>
          <button
            onClick={() => setCorrigindo(true)}
            disabled={pending}
            className="text-sm text-muted transition hover:text-foreground disabled:opacity-60"
          >
            Corrigir KM
          </button>
        </span>
        {erro && <span className="text-xs text-danger">{erro}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-2">
      <span className="flex flex-wrap items-center gap-2">
        <label htmlFor={`km-${plate}`} className="text-xs text-muted">
          KM correta:
        </label>
        <input
          id={`km-${plate}`}
          type="number"
          min={0}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          disabled={pending}
          className="w-32 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm tabular-nums outline-none transition-colors focus:border-brand/60"
        />

        {/* Atalhos para os dois valores que o sistema já conhece. */}
        <button
          type="button"
          onClick={() => setValor(String(informedKm))}
          disabled={pending}
          className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-border-strong hover:text-foreground"
        >
          digitado: {informedKm.toLocaleString("pt-BR")}
        </button>
        {ocrKm != null && (
          <button
            type="button"
            onClick={() => setValor(String(ocrKm))}
            disabled={pending}
            className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            OCR: {ocrKm.toLocaleString("pt-BR")}
          </button>
        )}
      </span>

      <span className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => aplicar(mudou ? Math.trunc(numero) : null)}
          disabled={pending || !valido}
          className={cn(
            "text-sm font-medium transition hover:opacity-80 disabled:opacity-60",
            mudou ? "text-brand" : "text-success"
          )}
        >
          {pending
            ? "Aplicando..."
            : mudou
              ? `Aplicar ${Math.trunc(numero).toLocaleString("pt-BR")} km`
              : "Conferir e aplicar KM"}
        </button>
        <button
          onClick={() => {
            setCorrigindo(false);
            setValor(String(informedKm));
            setErro(undefined);
          }}
          disabled={pending}
          className="text-sm text-muted transition hover:text-foreground disabled:opacity-60"
        >
          Cancelar
        </button>
      </span>

      {erro && <span className="text-xs text-danger">{erro}</span>}
    </span>
  );
}

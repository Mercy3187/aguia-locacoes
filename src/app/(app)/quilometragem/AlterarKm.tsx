"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import type { ResultadoKm } from "@/lib/km";

/**
 * Alteração manual da KM de um carro.
 *
 * O número digitado aqui é o mesmo que o óleo, a correia, os alertas e os
 * relatórios enxergam — é a KM do veículo, não uma cópia desta tela.
 *
 * Se o valor for MENOR que o atual, a ação não grava de primeira: devolve o
 * aviso, que aparece aqui com o botão de confirmar. Odômetro andando para trás
 * é quase sempre erro de digitação, e quando não é, é uma correção consciente.
 */
export function AlterarKm({
  action,
  plate,
  currentKm,
}: {
  action: (novaKm: number, confirmado: boolean) => Promise<ResultadoKm>;
  plate: string;
  currentKm: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState(String(currentKm));
  const [erro, setErro] = useState<string>();
  const [confirmar, setConfirmar] = useState<string>();
  const [okMsg, setOkMsg] = useState<string>();
  const [pending, startTransition] = useTransition();

  const numero = Math.trunc(Number(valor));
  const valido = valor !== "" && Number.isFinite(numero) && numero >= 0;
  const mudou = valido && numero !== currentKm;

  function fechar() {
    setAberto(false);
    setValor(String(currentKm));
    setErro(undefined);
    setConfirmar(undefined);
  }

  function salvar(confirmado: boolean) {
    setErro(undefined);
    setOkMsg(undefined);
    startTransition(async () => {
      const r = await action(numero, confirmado);
      if (r.ok) {
        setConfirmar(undefined);
        setAberto(false);
        setOkMsg(
          r.alterou
            ? `KM atualizada para ${r.kmNova.toLocaleString("pt-BR")} km.`
            : "A KM já era essa."
        );
        return;
      }
      if ("confirmar" in r) {
        setConfirmar(r.confirmar);
        return;
      }
      setErro(r.error);
      setConfirmar(undefined);
    });
  }

  if (!aberto) {
    return (
      <span className="inline-flex flex-col gap-1">
        <button
          type="button"
          onClick={() => {
            setValor(String(currentKm));
            setOkMsg(undefined);
            setAberto(true);
          }}
          className="text-sm text-brand transition hover:underline"
        >
          Alterar KM
        </button>
        {okMsg && <span className="text-xs text-success">{okMsg}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-2">
      <span className="flex flex-wrap items-center gap-2">
        <label htmlFor={`km-manual-${plate}`} className="text-xs text-muted">
          KM do {plate}:
        </label>
        <input
          id={`km-manual-${plate}`}
          type="number"
          min={0}
          value={valor}
          autoFocus
          onChange={(e) => {
            setValor(e.target.value);
            // Mudou o número: a confirmação anterior não vale mais para ele.
            setConfirmar(undefined);
            setErro(undefined);
          }}
          disabled={pending}
          className="w-32 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm tabular-nums outline-none transition-colors focus:border-brand/60"
        />
      </span>

      {confirmar ? (
        <span className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2">
          <span className="text-xs text-warning">{confirmar}</span>
          <span className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => salvar(true)}
              disabled={pending}
              className="text-sm font-medium text-warning transition hover:opacity-80 disabled:opacity-60"
            >
              {pending ? "Salvando..." : "Sim, é uma correção — baixar a KM"}
            </button>
            <button
              type="button"
              onClick={fechar}
              disabled={pending}
              className="text-sm text-muted transition hover:text-foreground disabled:opacity-60"
            >
              Cancelar
            </button>
          </span>
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => salvar(false)}
            disabled={pending || !valido || !mudou}
            className={cn(
              "text-sm font-medium transition hover:opacity-80 disabled:opacity-60",
              "text-brand"
            )}
          >
            {pending
              ? "Salvando..."
              : mudou
                ? `Salvar ${numero.toLocaleString("pt-BR")} km`
                : "Salvar"}
          </button>
          <button
            type="button"
            onClick={fechar}
            disabled={pending}
            className="text-sm text-muted transition hover:text-foreground disabled:opacity-60"
          >
            Cancelar
          </button>
        </span>
      )}

      {erro && <span className="text-xs text-danger">{erro}</span>}
    </span>
  );
}

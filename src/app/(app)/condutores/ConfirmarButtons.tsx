"use client";

import { useTransition } from "react";
import { cn } from "@/lib/utils";

export function ConfirmarButtons({
  contractId,
  action,
  soBotaoRemover = false,
}: {
  contractId: string;
  action: (contractId: string, confirmado: boolean) => Promise<{ error?: string }>;
  /** Quando true, mostra só o botão "Já removi" — usado na lista de pendências de quem já devolveu o carro. */
  soBotaoRemover?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function marcar(valor: boolean) {
    startTransition(async () => {
      await action(contractId, valor);
    });
  }

  if (soBotaoRemover) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => marcar(false)}
        className="rounded-lg border border-warning/40 px-3 py-1.5 text-xs font-semibold text-warning transition hover:bg-warning/10 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Já removi no DETRAN"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => marcar(true)}
        className={cn(
          "rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60",
          "border-success/40 text-success hover:bg-success/10"
        )}
      >
        Sim
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => marcar(false)}
        className={cn(
          "rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60",
          "border-border text-muted hover:text-foreground"
        )}
      >
        Não
      </button>
    </div>
  );
}

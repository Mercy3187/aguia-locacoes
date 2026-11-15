"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

/**
 * Botão que dispara uma server action (com resultado { error? }) e mostra
 * feedback de carregamento/erro. Opcionalmente pede confirmação.
 */
export function ActionButton({
  action,
  label,
  pendingLabel = "Aguarde...",
  confirmMessage,
  className,
}: {
  action: () => Promise<{ error?: string }>;
  label: string;
  pendingLabel?: string;
  confirmMessage?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <span className="inline-flex flex-col">
      <button
        onClick={() => {
          if (confirmMessage && !confirm(confirmMessage)) return;
          setError(undefined);
          startTransition(async () => {
            const res = await action();
            if (res?.error) setError(res.error);
          });
        }}
        disabled={pending}
        className={cn(
          "text-sm text-muted transition hover:text-foreground disabled:opacity-60",
          className
        )}
      >
        {pending ? pendingLabel : label}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

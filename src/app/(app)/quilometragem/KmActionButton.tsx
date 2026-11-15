"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import type { SendResult } from "./actions";

export function KmActionButton({
  action,
  label,
  pendingLabel = "Aguarde...",
  className,
}: {
  action: () => Promise<SendResult>;
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <span className="inline-flex flex-col">
      <button
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const res = await action();
            if (res.error) setError(res.error);
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

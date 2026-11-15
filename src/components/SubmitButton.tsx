"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  pendingLabel = "Salvando...",
  variant = "primary",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "danger";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60",
        variant === "primary"
          ? "bg-brand text-brand-ink hover:bg-brand/90"
          : "border border-danger/50 text-danger hover:bg-danger/10"
      )}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

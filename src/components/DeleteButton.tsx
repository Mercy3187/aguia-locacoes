"use client";

import { cn } from "@/lib/utils";

/**
 * Botão de exclusão que pede confirmação antes de disparar a server action.
 * `action` deve ser uma server action já vinculada ao id do registro.
 */
export function DeleteButton({
  action,
  confirmMessage = "Tem certeza que deseja excluir? Esta ação não pode ser desfeita.",
  label = "Excluir",
  className,
}: {
  action: () => Promise<void>;
  confirmMessage?: string;
  label?: string;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
      className="inline"
    >
      <button
        type="submit"
        className={cn(
          "text-sm text-muted transition hover:text-danger",
          className
        )}
      >
        {label}
      </button>
    </form>
  );
}

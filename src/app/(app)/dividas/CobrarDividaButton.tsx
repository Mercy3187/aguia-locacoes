"use client";

import { useTransition } from "react";
import { registrarEnvioDivida } from "./actions";

/** Abre o WhatsApp com a cobrança da dívida pronta e registra o envio. */
export function CobrarDividaButton({
  debtId,
  waLink,
  jaCobrado,
}: {
  debtId: string;
  waLink: string;
  jaCobrado: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => {
        window.open(waLink, "_blank", "noopener,noreferrer");
        startTransition(async () => {
          await registrarEnvioDivida(debtId);
        });
      }}
      className="rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success transition hover:bg-success/20 disabled:opacity-60"
    >
      {pending ? "..." : jaCobrado ? "Cobrar de novo" : "Cobrar no WhatsApp"}
    </button>
  );
}

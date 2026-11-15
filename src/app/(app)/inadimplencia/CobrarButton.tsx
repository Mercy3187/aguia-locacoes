"use client";

import { useTransition } from "react";
import { registrarCobrancaEnviada } from "./actions";

/**
 * Abre o WhatsApp com a mensagem de cobrança pronta e registra o envio.
 * O envio em si é feito por você no WhatsApp — o sistema só prepara e anota.
 */
export function CobrarButton({
  paymentId,
  waLink,
  jaCobrado,
}: {
  paymentId: string;
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
          await registrarCobrancaEnviada(paymentId);
        });
      }}
      className="rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success transition hover:bg-success/20 disabled:opacity-60"
    >
      {pending ? "..." : jaCobrado ? "Cobrar de novo" : "Cobrar no WhatsApp"}
    </button>
  );
}

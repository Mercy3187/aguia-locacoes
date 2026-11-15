"use client";

import { useState, useTransition } from "react";
import { enviarKmWhatsApp } from "./actions";

export function WhatsAppButton({ contractId }: { contractId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [copied, setCopied] = useState(false);

  function handleSend() {
    setError(undefined);
    startTransition(async () => {
      const res = await enviarKmWhatsApp(contractId);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.message) setMessage(res.message);
      if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
    });
  }

  async function handleCopy() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar. Copie manualmente o texto acima.");
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleSend}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Abrindo..." : "Enviar pelo WhatsApp"}
      </button>

      {error && <p className="text-xs text-danger">{error}</p>}

      {message && (
        <button
          onClick={handleCopy}
          className="block text-xs text-neon hover:underline"
        >
          {copied ? "Mensagem copiada!" : "Copiar mensagem (caso o WhatsApp não abra)"}
        </button>
      )}
    </div>
  );
}

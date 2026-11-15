"use client";

import { useState } from "react";

/**
 * Exporta o resumo de cauções e retiradas para o WhatsApp.
 * "Abrir WhatsApp" usa wa.me sem número, então você escolhe o contato
 * ou o grupo na hora do envio.
 */
export function ExportarButton({ resumo }: { resumo: string }) {
  const [copiado, setCopiado] = useState(false);
  const [aberto, setAberto] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(resumo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setAberto(true); // sem permissão de área de transferência: mostra o texto
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(resumo)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90"
        >
          Enviar no WhatsApp
        </a>
        <button
          onClick={copiar}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted transition hover:text-foreground"
        >
          {copiado ? "Copiado ✓" : "Copiar texto"}
        </button>
        <button
          onClick={() => setAberto((v) => !v)}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition hover:text-foreground"
        >
          {aberto ? "Ocultar" : "Prévia"}
        </button>
      </div>

      {aberto && (
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-surface-2 p-4 text-xs leading-relaxed">
          {resumo}
        </pre>
      )}
    </>
  );
}

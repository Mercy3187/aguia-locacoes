"use client";

import { useEffect, useState } from "react";

/**
 * Botão "Gerar relatório": abre a prévia do texto do acerto e manda para o
 * WhatsApp.
 *
 * O link é `wa.me` sem número — o relatório vai para uma pessoa diferente a
 * cada semana (ou para um grupo), então quem escolhe o destino é você, na hora
 * do envio.
 */
export function GerarRelatorioButton({ relatorio }: { relatorio: string }) {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberto]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(relatorio);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o texto já está na tela, dá
      // para selecionar e copiar à mão.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-strong"
      >
        📄 Gerar relatório
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setAberto(false)}
        >
          <div
            role="dialog"
            aria-label="Relatório do acerto semanal"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-border bg-surface shadow-xl"
          >
            <header className="flex items-center justify-between gap-3 border-b border-border p-4">
              <h2 className="font-semibold">Relatório do acerto</h2>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="rounded-lg px-2 py-1 text-sm text-muted transition-colors hover:text-foreground"
                aria-label="Fechar"
              >
                ✕
              </button>
            </header>

            <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 text-xs leading-relaxed">
              {relatorio}
            </pre>

            <footer className="flex flex-wrap gap-2 border-t border-border p-4">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(relatorio)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-strong"
              >
                Enviar no WhatsApp
              </a>
              <button
                type="button"
                onClick={copiar}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:border-border-strong hover:text-foreground"
              >
                {copiado ? "Copiado ✓" : "Copiar texto"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

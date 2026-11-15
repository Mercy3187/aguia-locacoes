"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/ui";

export type OpcaoBusca = { id: string; label: string; detalhe?: string };

/**
 * Select com campo de busca embutido — com dezenas de clientes e carros, rolar
 * um `<select>` comum até achar o nome certo não funciona.
 *
 * O valor escolhido vai num `<input type="hidden">` com o `name` dado, então
 * o formulário recebe o id como se fosse um select normal.
 */
export function SelectBusca({
  id,
  name,
  opcoes,
  valor,
  onChange,
  placeholder = "Selecione...",
  vazio = "Nada encontrado.",
}: {
  id: string;
  name: string;
  opcoes: OpcaoBusca[];
  valor: string;
  onChange: (id: string) => void;
  placeholder?: string;
  vazio?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  const campoBusca = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) return;
    campoBusca.current?.focus();
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const selecionada = opcoes.find((o) => o.id === valor);
  const termo = busca.trim().toLowerCase();
  const filtradas = termo
    ? opcoes.filter((o) => `${o.label} ${o.detalhe ?? ""}`.toLowerCase().includes(termo))
    : opcoes;

  const escolher = (novo: string) => {
    onChange(novo);
    setAberto(false);
    setBusca("");
  };

  return (
    <div ref={raiz} className="relative">
      <input type="hidden" name={name} value={valor} />
      <button
        id={id}
        type="button"
        onClick={() => setAberto((a) => !a)}
        className={cn(inputClass, "flex items-center justify-between gap-2 text-left")}
        aria-haspopup="listbox"
        aria-expanded={aberto}
      >
        <span className={cn("truncate", !selecionada && "text-muted")}>
          {selecionada ? selecionada.label : placeholder}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-muted">
          {selecionada && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Limpar"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="grid size-4 place-items-center rounded-full bg-brand text-[10px] leading-none text-brand-ink"
            >
              ×
            </span>
          )}
          <span aria-hidden className="text-[10px]">▼</span>
        </span>
      </button>

      {aberto && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border-strong bg-surface-2 shadow-2xl shadow-black/50">
          <div className="border-b border-border p-2">
            <input
              ref={campoBusca}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar..."
              className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand/60"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtradas.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">{vazio}</li>
            ) : (
              filtradas.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.id === valor}
                    onClick={() => escolher(o.id)}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-sm transition-colors",
                      o.id === valor ? "bg-brand text-brand-ink" : "hover:bg-surface-3"
                    )}
                  >
                    {o.label}
                    {o.detalhe && (
                      <span
                        className={cn(
                          "block text-xs",
                          o.id === valor ? "text-brand-ink/80" : "text-muted"
                        )}
                      >
                        {o.detalhe}
                      </span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

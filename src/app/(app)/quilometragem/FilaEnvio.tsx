"use client";

import { useState, useTransition } from "react";
import { enviarKmWhatsApp } from "./actions";

export type FilaItem = {
  contractId: string;
  motorista: string;
  primeiroNome: string;
  telefone: string | null;
  placa: string;
  modelo: string | null;
  /** Dias de atraso desde a data prevista (0 = vence hoje). */
  atraso: number;
  /** Já foi enviado nesta rodada? (solicitação com status ENVIADO) */
  jaEnviado: boolean;
  enviadoEm: string | null;
};

/**
 * Fila de envio: um clique por motorista abre o WhatsApp com a mensagem e o
 * link já prontos, e marca a solicitação como enviada.
 */
export function FilaEnvio({ itens }: { itens: FilaItem[] }) {
  const [feitos, setFeitos] = useState<Record<string, "ok" | string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function enviar(item: FilaItem) {
    setPendingId(item.contractId);
    startTransition(async () => {
      const res = await enviarKmWhatsApp(item.contractId);
      setPendingId(null);
      if (res.error) {
        setFeitos((f) => ({ ...f, [item.contractId]: res.error! }));
        return;
      }
      if (res.url) window.open(res.url, "_blank", "noopener,noreferrer");
      setFeitos((f) => ({ ...f, [item.contractId]: "ok" }));
    });
  }

  const restantes = itens.filter((i) => feitos[i.contractId] !== "ok" && !i.jaEnviado);

  if (itens.length === 0) {
    return (
      <div className="rounded-2xl border border-success/40 bg-success/5 p-5 text-center">
        <p className="font-medium text-success">Nenhuma KM pendente de envio 🎉</p>
        <p className="mt-1 text-sm text-muted">
          O sistema verifica todo dia e coloca aqui quem estiver na hora.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <div>
          <h2 className="font-semibold">Fila de envio</h2>
          <p className="text-sm text-muted">
            Um clique por motorista: abre o WhatsApp com a mensagem e o link prontos.
          </p>
        </div>
        <span className="rounded-full border border-neon/40 bg-neon/10 px-3 py-1 text-sm font-semibold text-neon">
          {restantes.length} para enviar
        </span>
      </header>

      <ul className="divide-y divide-border">
        {itens.map((item) => {
          const estado = feitos[item.contractId];
          const enviado = estado === "ok" || item.jaEnviado;
          const erro = estado && estado !== "ok" ? estado : null;
          const carregando = pendingId === item.contractId;

          return (
            <li
              key={item.contractId}
              className={`flex flex-wrap items-center gap-3 p-4 ${enviado ? "opacity-55" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.motorista}</p>
                <p className="truncate text-xs text-muted">
                  <span className="font-mono">{item.placa}</span>
                  {item.modelo ? ` · ${item.modelo}` : ""}
                  {item.telefone ? ` · ${item.telefone}` : " · sem telefone"}
                </p>
                {erro && <p className="mt-1 text-xs text-danger">{erro}</p>}
              </div>

              {item.atraso > 0 ? (
                <span className="rounded-full border border-danger/40 bg-danger/10 px-2.5 py-0.5 text-xs font-medium text-danger">
                  {item.atraso} dia{item.atraso === 1 ? "" : "s"} de atraso
                </span>
              ) : (
                <span className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
                  vence hoje
                </span>
              )}

              {enviado ? (
                <span className="text-sm font-medium text-success">
                  ✓ enviado{item.enviadoEm ? ` ${item.enviadoEm}` : ""}
                </span>
              ) : (
                <button
                  onClick={() => enviar(item)}
                  disabled={carregando || !item.telefone}
                  title={item.telefone ? undefined : "Cadastre o telefone do cliente"}
                  className="rounded-lg bg-success px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
                >
                  {carregando ? "Abrindo..." : "Enviar"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

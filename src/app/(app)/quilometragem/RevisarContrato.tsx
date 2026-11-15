"use client";

import { useState, useTransition } from "react";
import type { SendResult } from "./actions";

/**
 * As duas saídas para um contrato que parou de faturar: encerrar (o cliente
 * devolveu) ou confirmar que continua.
 *
 * Encerrar é o que mexe em cobrança, então pede confirmação antes — um clique
 * errado aqui tira o contrato da fila e cancela os links em aberto.
 */
export function RevisarContrato({
  encerrar,
  manter,
  cliente,
  placa,
  podeManter,
}: {
  encerrar: () => Promise<SendResult>;
  manter: () => Promise<SendResult>;
  cliente: string;
  placa: string;
  /**
   * Falso quando o carro já foi repassado a outro motorista: nesse caso não há
   * o que confirmar — dois contratos ativos no mesmo carro é sempre erro.
   */
  podeManter: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string>();
  const [feito, setFeito] = useState<string>();
  const [confirmando, setConfirmando] = useState(false);

  function rodar(acao: () => Promise<SendResult>) {
    setErro(undefined);
    startTransition(async () => {
      const r = await acao();
      if (r.error) setErro(r.error);
      else setFeito(r.message ?? "Pronto.");
      setConfirmando(false);
    });
  }

  if (feito) return <span className="text-sm text-success">{feito}</span>;

  if (confirmando) {
    return (
      <span className="inline-flex flex-col gap-1.5">
        <span className="text-xs text-muted">
          Encerrar o contrato de {cliente} ({placa})? Sai da cobrança de KM e os
          links em aberto são cancelados.
        </span>
        <span className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => rodar(encerrar)}
            disabled={pending}
            className="text-sm font-medium text-danger transition hover:opacity-80 disabled:opacity-60"
          >
            {pending ? "Encerrando..." : "Sim, encerrar"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            disabled={pending}
            className="text-sm text-muted transition hover:text-foreground disabled:opacity-60"
          >
            Cancelar
          </button>
        </span>
        {erro && <span className="text-xs text-danger">{erro}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-3 whitespace-nowrap">
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          disabled={pending}
          className="text-sm font-medium text-danger transition hover:opacity-80 disabled:opacity-60"
        >
          Encerrar contrato
        </button>
        {podeManter && (
          <button
            type="button"
            onClick={() => rodar(manter)}
            disabled={pending}
            className="text-sm text-muted transition hover:text-foreground disabled:opacity-60"
          >
            {pending ? "Salvando..." : "Continua com o carro"}
          </button>
        )}
      </span>
      {erro && <span className="text-xs text-danger">{erro}</span>}
    </span>
  );
}

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { registrarResultadoAutomacaoCondutor, type ResultadoAutomacaoCondutor } from "./actions";

/**
 * Chama a extensão do Chrome da automação SENATRAN direto do
 * navegador, via `chrome.runtime.sendMessage(extensionId, ...)` — só
 * funciona no Chrome, com a extensão instalada (carregada via "Carregar sem
 * compactação" em chrome://extensions) e com o login gov.br já salvo nela
 * (popup da extensão → "Lembrar CPF/senha"). O ID da extensão fica em
 * `NEXT_PUBLIC_SENATRAN_EXTENSION_ID` — pega em chrome://extensions depois
 * de instalar.
 *
 * Por quê não roda no servidor: o Chrome bloqueia qualquer automação
 * externa (Playwright/CDP) no perfil REAL de um usuário — só um botão
 * clicado DENTRO desse mesmo navegador consegue acionar a extensão que
 * roda nele. Ver dev-tools/senatran-extensao-chrome/background.js.
 */

type Dados = {
  placa: string;
  cpf: string;
  numeroRegistroCnh: string;
  nomeEsperado: string;
  renavamConhecido: string | null;
};

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage: (
          extensionId: string,
          message: unknown,
          callback: (response: ResultadoAutomacaoCondutor | undefined) => void
        ) => void;
        lastError?: { message?: string };
      };
    };
  }
}

export function EnviarSolicitacaoButton({ contractId, dados }: { contractId: string; dados: Dados }) {
  const [estado, setEstado] = useState<"parado" | "rodando" | "ok" | "erro">("parado");
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function enviar() {
    const extensionId = process.env.NEXT_PUBLIC_SENATRAN_EXTENSION_ID;
    if (!extensionId) {
      setEstado("erro");
      setMensagem("NEXT_PUBLIC_SENATRAN_EXTENSION_ID não configurado no .env.");
      return;
    }
    const sendMessage = window.chrome?.runtime?.sendMessage;
    if (!sendMessage) {
      setEstado("erro");
      setMensagem("Isso só funciona no Google Chrome, com a extensão da automação instalada.");
      return;
    }

    setEstado("rodando");
    setMensagem("Rodando na extensão — pode levar alguns minutos, não feche o Chrome...");

    sendMessage(extensionId, { tipo: "iniciar", dados }, async (resposta) => {
      if (window.chrome?.runtime?.lastError || !resposta) {
        setEstado("erro");
        setMensagem(
          window.chrome?.runtime?.lastError?.message ??
            "Não consegui falar com a extensão — confira se ela está instalada e habilitada."
        );
        return;
      }

      if (resposta.ok) {
        setEstado("ok");
        setMensagem(`Indicação enviada — condutor encontrado: ${resposta.condutorEncontrado.nome}.`);
      } else {
        setEstado("erro");
        setMensagem(resposta.motivo);
      }

      await registrarResultadoAutomacaoCondutor(contractId, resposta);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={estado === "rodando"}
        onClick={enviar}
        className={cn(
          "rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60",
          "border-border text-muted hover:text-foreground"
        )}
      >
        {estado === "rodando" ? "Rodando..." : "Mandar solicitação"}
      </button>
      {mensagem && (
        <p className={cn("max-w-xs text-xs", estado === "erro" ? "text-danger" : "text-muted")}>{mensagem}</p>
      )}
    </div>
  );
}

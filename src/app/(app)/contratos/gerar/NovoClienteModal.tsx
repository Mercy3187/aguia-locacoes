"use client";

import { useEffect, useState, useTransition } from "react";
import { Field, FormError, inputClass } from "@/components/ui";
import { DocumentoInput, erroDocumento } from "@/components/DocumentoInput";
import { mascararDocumento, soDigitos } from "@/lib/contrato-gerar";
import { criarClienteRapido } from "./actions";

/**
 * Modal "Novo Cliente" da tela de contrato — só o essencial para o contrato
 * sair: documento, tipo, nome e razão social. O resto do cadastro (telefone,
 * CNH, endereço) é completado depois na ficha do cliente.
 */
export function NovoClienteModal({
  onFechar,
  onCriado,
}: {
  onFechar: () => void;
  onCriado: (cliente: { id: string; label: string }) => void;
}) {
  const [cpf, setCpf] = useState("");
  const [tipo, setTipo] = useState<"FISICA" | "JURIDICA">("FISICA");
  const [nome, setNome] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  // Em pessoa física a razão social é o próprio nome; ela acompanha o nome
  // até alguém digitar nela, e daí em diante fica como a pessoa deixou.
  const [razaoEditada, setRazaoEditada] = useState(false);
  const [erro, setErro] = useState<string>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [onFechar]);

  const salvar = () => {
    const erroDoc = soDigitos(cpf)
      ? erroDocumento(cpf, tipo)
      : `Informe o ${tipo === "FISICA" ? "CPF" : "CNPJ"}.`;
    if (erroDoc) {
      setErro(erroDoc);
      return;
    }
    setErro(undefined);
    startTransition(async () => {
      const r = await criarClienteRapido({ cpf, tipo, nome, razaoSocial });
      if (r.ok) onCriado(r.cliente);
      else setErro(r.error);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="novo-cliente-titulo"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-2xl border border-border bg-surface p-6 shadow-xl"
      >
        <div className="mb-5 flex items-start justify-between">
          <h2 id="novo-cliente-titulo" className="text-lg font-bold text-brand">
            NOVO CLIENTE
          </h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="text-xl leading-none text-muted hover:text-foreground"
          >
            ×
          </button>
        </div>

        {/* Não é um <form>: o modal vive dentro do formulário do contrato, e
            formulário dentro de formulário não existe em HTML. */}
        <div className="space-y-4">
          <FormError message={erro} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tipo === "FISICA" ? "CPF:" : "CNPJ:"} htmlFor="nc-cpf" required>
              <DocumentoInput id="nc-cpf" value={cpf} onChange={setCpf} tipo={tipo} required />
            </Field>
            <Field label="Tipo:" htmlFor="nc-tipo" required>
              <select
                id="nc-tipo"
                value={tipo}
                onChange={(e) => {
                  const novo = e.target.value as "FISICA" | "JURIDICA";
                  setTipo(novo);
                  // Reaplica a máscara no formato do tipo novo.
                  setCpf((atual) => mascararDocumento(atual, novo));
                }}
                className={inputClass}
              >
                <option value="FISICA">FÍSICA</option>
                <option value="JURIDICA">JURÍDICA</option>
              </select>
            </Field>
          </div>

          <Field label="Nome Completo:" htmlFor="nc-nome" required>
            <input
              id="nc-nome"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                if (!razaoEditada) setRazaoSocial(e.target.value);
              }}
              autoComplete="off"
              className={inputClass}
            />
          </Field>

          <Field label="Razão Social:" htmlFor="nc-razao" required>
            <input
              id="nc-razao"
              value={razaoSocial}
              onChange={(e) => {
                setRazaoSocial(e.target.value);
                setRazaoEditada(true);
              }}
              autoComplete="off"
              className={inputClass}
            />
          </Field>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={salvar}
              disabled={pending}
              className="rounded-full bg-brand px-8 py-2.5 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-strong disabled:opacity-60"
            >
              {pending ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="rounded-full border border-border px-6 py-2.5 text-sm text-muted transition-colors hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

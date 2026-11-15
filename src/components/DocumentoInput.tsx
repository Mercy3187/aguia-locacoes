"use client";

import { inputClass } from "@/components/ui";
import { documentoValido, mascararDocumento, soDigitos } from "@/lib/contrato-gerar";
import { cn } from "@/lib/utils";

/**
 * Campo de CPF/CNPJ: põe a pontuação enquanto a pessoa digita e avisa logo
 * abaixo, assim que o número fica completo, se os dígitos verificadores
 * não batem.
 *
 * `tipo` trava o formato (FISICA = CPF, JURIDICA = CNPJ); sem ele, o campo
 * aceita os dois e decide pelo tamanho.
 */
export function DocumentoInput({
  id,
  name,
  value,
  onChange,
  tipo,
  required,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (valor: string) => void;
  tipo?: "FISICA" | "JURIDICA";
  required?: boolean;
}) {
  const d = soDigitos(value);
  const rotulo = tipo === "JURIDICA" || (!tipo && d.length > 11) ? "CNPJ" : "CPF";
  const completo = tipo === "FISICA" ? d.length === 11 : tipo === "JURIDICA" ? d.length === 14 : d.length === 11 || d.length === 14;
  const invalido = completo && !documentoValido(d);

  return (
    <>
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(mascararDocumento(e.target.value, tipo))}
        inputMode="numeric"
        autoComplete="off"
        required={required}
        aria-invalid={invalido || undefined}
        aria-describedby={`${id}-status`}
        placeholder={tipo === "JURIDICA" ? "00.000.000/0000-00" : tipo === "FISICA" ? "000.000.000-00" : "CPF ou CNPJ"}
        className={cn(inputClass, invalido && "border-danger focus:border-danger")}
      />
      <p
        id={`${id}-status`}
        aria-live="polite"
        className={cn("mt-1 min-h-4 text-xs", invalido ? "text-danger" : "text-success")}
      >
        {completo ? (invalido ? `${rotulo} inválido — confira os números.` : `${rotulo} válido.`) : ""}
      </p>
    </>
  );
}

/** Mensagem de erro para o formulário, ou `undefined` se o documento está ok. */
export function erroDocumento(valor: string, tipo?: "FISICA" | "JURIDICA"): string | undefined {
  const d = soDigitos(valor);
  if (!d) return undefined;
  const rotulo = tipo === "JURIDICA" || (!tipo && d.length > 11) ? "CNPJ" : "CPF";
  if (tipo === "FISICA" && d.length !== 11) return "CPF deve ter 11 dígitos.";
  if (tipo === "JURIDICA" && d.length !== 14) return "CNPJ deve ter 14 dígitos.";
  if (!tipo && d.length !== 11 && d.length !== 14) return "CPF deve ter 11 dígitos (ou CNPJ, 14).";
  if (!documentoValido(d)) return `${rotulo} inválido.`;
  return undefined;
}

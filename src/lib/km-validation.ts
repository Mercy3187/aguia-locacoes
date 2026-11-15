import type { ValidationStatus } from "@/generated/prisma/client";

/** Limite padrão de km/dia que aciona o alerta de "suspeito". */
export const SUSPICIOUS_KM_PER_DAY = 500;

export type KmValidation = {
  ok: boolean;
  error?: string;
  status: ValidationStatus;
  notes: string | null;
  diffKm: number;
  perDay: number | null;
};

/**
 * Valida a KM informada pelo motorista (Módulo 8, sem OCR — isso vem na Fase 4).
 *
 * - Rejeita se for menor que a última KM registrada.
 * - Calcula a diferença e a média de km/dia desde o último registro.
 * - Marca como SUSPEITO se ultrapassar o limite de km/dia.
 */
export function validateKm(params: {
  informedKm: number;
  previousKm: number;
  previousDate: Date;
  now?: Date;
}): KmValidation {
  const now = params.now ?? new Date();
  const diffKm = params.informedKm - params.previousKm;

  if (diffKm < 0) {
    return {
      ok: false,
      error: `A KM informada (${params.informedKm.toLocaleString(
        "pt-BR"
      )}) é menor que a última registrada (${params.previousKm.toLocaleString("pt-BR")}).`,
      status: "RECUSADO",
      notes: null,
      diffKm,
      perDay: null,
    };
  }

  const days = Math.max(
    1,
    Math.round((now.getTime() - params.previousDate.getTime()) / (24 * 60 * 60 * 1000))
  );
  const perDay = Math.round(diffKm / days);

  if (perDay > SUSPICIOUS_KM_PER_DAY) {
    return {
      ok: true,
      status: "SUSPEITO",
      notes: `Média de ${perDay.toLocaleString("pt-BR")} km/dia em ${days} dia(s) — acima de ${SUSPICIOUS_KM_PER_DAY} km/dia.`,
      diffKm,
      perDay,
    };
  }

  return {
    ok: true,
    status: "APROVADO",
    notes: `+${diffKm.toLocaleString("pt-BR")} km em ${days} dia(s) (${perDay} km/dia).`,
    diffKm,
    perDay,
  };
}

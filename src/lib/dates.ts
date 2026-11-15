/** Número de dias do ciclo de comprovação de quilometragem. */
export const KM_CYCLE_DAYS = 15;

/** Retorna uma nova data somando `days` dias à data informada. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

const BRT = "America/Sao_Paulo";

/**
 * Converte o valor de um <input type="datetime-local"> — que o usuário digita
 * no horário de Brasília — para uma data absoluta (UTC).
 * O Brasil não tem mais horário de verão, então o fuso é fixo em -03:00.
 */
export function parseBrtDateTime(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const date = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-03:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Valor pré-preenchido de um <input type="datetime-local"> no horário de Brasília. */
export function brtDateTimeValue(date: Date = new Date()): string {
  // "sv-SE" formata como "2026-08-02 14:30"; o input espera "2026-08-02T14:30".
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: BRT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(date)
    .replace(" ", "T");
}

/** Dias inteiros passados desde `date` até agora (0 se for no futuro). */
export function daysSince(date: Date | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

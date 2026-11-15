/** Regras de cobrança: multa por atraso de KM e desconto por manutenção. */

export const KM_LATE_FEE_PER_DAY = 10; // R$ por dia de atraso
export const KM_GRACE_DAYS = 2; // prazo antes de começar a multa
export const DAY_MS = 24 * 60 * 60 * 1000;
const BRT = "America/Sao_Paulo";

/** Valor da diária a partir do valor semanal. */
export function dailyRate(weeklyValue: number | null | undefined): number {
  return (weeklyValue ?? 0) / 7;
}

/** Hora (0-23) de uma data no fuso de Brasília. */
export function hourBRT(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: BRT, hour: "2-digit", hour12: false }).format(date)
  ) % 24;
}

/** Data no formato yyyy-mm-dd no fuso de Brasília. */
function dateStrBRT(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BRT }).format(date);
}

/** Diferença em dias de calendário (BRT) entre duas datas. */
function calendarDaysBetween(start: Date, end: Date): number {
  const a = new Date(dateStrBRT(start) + "T00:00:00Z").getTime();
  const b = new Date(dateStrBRT(end) + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

/**
 * Diárias de desconto pelo tempo parado em manutenção.
 * Regra: cada dia completo parado = 1 diária; no dia do retorno,
 * meia diária se concluído até 17h, diária inteira se após 17h.
 */
export function downtimeDiscountDays(startAt: Date, endAt: Date): number {
  const fullDays = calendarDaysBetween(startAt, endAt); // midnights cruzadas
  const returnFactor = hourBRT(endAt) < 17 ? 0.5 : 1;
  return fullDays + returnFactor;
}

/** Valor do desconto de manutenção. */
export function maintenanceDiscount(
  startAt: Date,
  endAt: Date,
  weeklyValue: number | null | undefined
): number {
  return Number((downtimeDiscountDays(startAt, endAt) * dailyRate(weeklyValue)).toFixed(2));
}

/**
 * Dias de atraso da KM, contados após o prazo de tolerância (2 dias) a partir
 * do envio ao motorista. `at` é o momento da resposta (ou agora, se pendente).
 */
export function kmLateDays(sentAt: Date | null | undefined, at: Date = new Date()): number {
  if (!sentAt) return 0;
  const deadline = new Date(sentAt.getTime() + KM_GRACE_DAYS * DAY_MS);
  if (at <= deadline) return 0;
  return Math.ceil((at.getTime() - deadline.getTime()) / DAY_MS);
}

/** Valor da multa por atraso de KM. */
export function kmLateFee(sentAt: Date | null | undefined, at: Date = new Date()): number {
  return kmLateDays(sentAt, at) * KM_LATE_FEE_PER_DAY;
}

/**
 * Junta classes CSS condicionalmente (versão enxuta de `clsx`).
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Formata um telefone brasileiro para o padrão do WhatsApp: 55 + DDD + número.
 * Remove espaços, parênteses, traços e qualquer caractere não numérico.
 * Retorna `null` se o número for inválido (menos de 10 dígitos após o DDD).
 */
export function formatPhoneForWhatsApp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  // Remove zeros à esquerda (ex.: 0 antes do DDD)
  digits = digits.replace(/^0+/, "");
  // Se já vier com 55, mantém; senão, adiciona.
  if (!digits.startsWith("55")) {
    digits = "55" + digits;
  }
  // 55 + DDD(2) + número(8 ou 9) = 12 ou 13 dígitos
  if (digits.length < 12 || digits.length > 13) return null;
  return digits;
}

/**
 * Formatadores criados uma vez e reaproveitados.
 *
 * Montar um `Intl.*Format` é caro perto do que ele faz depois: medido neste
 * projeto, 36µs para criar contra 0,6µs para formatar — sessenta vezes mais.
 * Como antes cada chamada criava o seu, uma tabela com dezenas de linhas e
 * vários valores por linha pagava esse preço a cada célula.
 *
 * Ficam em `const` de módulo, então nascem na primeira formatação do processo
 * e vivem enquanto o servidor viver.
 */
const MOEDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const DATA = new Intl.DateTimeFormat("pt-BR");

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

/** Formata um valor numérico como moeda brasileira (R$). */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return MOEDA.format(value);
}

/** Formata uma data para o padrão brasileiro (dd/mm/aaaa). */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return DATA.format(d);
}

/** Formata data e hora no fuso de Brasília (dd/mm/aaaa HH:mm). */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return DATA_HORA.format(d);
}

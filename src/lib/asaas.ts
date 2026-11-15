/**
 * Cliente da API do Asaas — leitura.
 *
 * Lê as cobranças da conta Asaas da Águia Locações para mostrar inadimplência,
 * receita e o valor semanal de cada contrato. Nada aqui cria, altera ou
 * cancela cobrança: as operações de escrita ficam em `asaas-write.ts`.
 */

const PROD = "https://api.asaas.com/v3";
const SANDBOX = "https://api-sandbox.asaas.com/v3";

export function asaasBase(): string {
  return process.env.ASAAS_ENV === "sandbox" ? SANDBOX : PROD;
}

/**
 * A chave do Asaas começa com "$", que o dotenv do Next expandiria como
 * variável — por isso no .env ela fica escapada ("\$aact_..."). Já o parser
 * de --env-file do Node mantém a barra. Normaliza os dois casos.
 */
export function asaasKey(): string | undefined {
  return process.env.ASAAS_API_KEY?.replace(/^\\/, "") || undefined;
}

export function asaasEnabled(): boolean {
  return Boolean(asaasKey());
}

/** GET autenticado na API do Asaas. */
export async function asaasGet<T = unknown>(path: string): Promise<T> {
  const key = asaasKey();
  if (!key) throw new Error("ASAAS_API_KEY não configurada.");
  const res = await fetch(`${asaasBase()}${path}`, {
    headers: { access_token: key, accept: "application/json" },
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Asaas ${path} → HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type AsaasPayment = {
  id: string;
  customer: string;
  value: number;
  netValue: number | null;
  status: string;
  billingType: string | null;
  dueDate: string;
  paymentDate: string | null;
  description: string | null;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
};

export type AsaasCustomer = {
  id: string;
  name: string;
  cpfCnpj: string | null;
  mobilePhone: string | null;
  phone: string | null;
  email: string | null;
  notificationDisabled: boolean;
};

type Page<T> = { data: T[]; hasMore: boolean; totalCount: number };

/** Busca todas as páginas de um recurso (o Asaas pagina de 100 em 100). */
async function getAll<T>(path: string, max = 2000): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  const sep = path.includes("?") ? "&" : "?";
  while (out.length < max) {
    const page = await asaasGet<Page<T>>(`${path}${sep}limit=100&offset=${offset}`);
    out.push(...(page.data ?? []));
    if (!page.hasMore) break;
    offset += 100;
  }
  return out;
}

export const listPayments = () => getAll<AsaasPayment>("/payments?sort=dueDate&order=desc");
export const listCustomers = () => getAll<AsaasCustomer>("/customers");

/**
 * Encontra o cliente no Asaas pelo CPF/CNPJ.
 * Necessário para emitir cobrança avulsa: o Asaas identifica o pagador pelo
 * id dele, não pelo documento.
 */
export async function findCustomerByCpf(cpfCnpj: string | null | undefined) {
  const digits = (cpfCnpj ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const page = await asaasGet<Page<AsaasCustomer>>(
    `/customers?cpfCnpj=${encodeURIComponent(digits)}&limit=1`
  );
  return page.data?.[0] ?? null;
}

/** Status do Asaas que contam como pago. */
const PAID = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
/** Status que já não são cobráveis (estornados, cancelados). */
const DEAD = new Set(["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED", "DELETED"]);

export const isPaid = (status: string) => PAID.has(status);
export const isOverdue = (status: string) => status === "OVERDUE";
export const isOpen = (status: string) => !PAID.has(status) && !DEAD.has(status);

/**
 * Extrai a placa da descrição da cobrança, no formato
 * "FATURAMENTO DE LOCAÇÃO (RMQ-7J32) DE 17/08/2026...". Os boletos de aluguel
 * emitidos pelo sistema precisam seguir esse padrão — é por ele que a
 * cobrança é ligada ao carro e reconhecida como aluguel na inadimplência.
 */
export function plateFromDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  const m = /\(([A-Z]{3}[- ]?\d[A-Z0-9]\d{2})\)/i.exec(description);
  if (!m) return null;
  const raw = m[1].toUpperCase().replace(/[- ]/g, "");
  // Normaliza para o formato usado no sistema: AAA-0A00
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}

/** Data "2026-08-17" do Asaas → Date no fim do dia em Brasília. */
export function asaasDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Valor semanal mais provável de uma placa: o valor que mais se repete. */
export function recurringValue(payments: AsaasPayment[]): number | null {
  if (!payments.length) return null;
  const tally = new Map<number, number>();
  for (const p of payments) tally.set(p.value, (tally.get(p.value) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [value, count] of tally) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Operações de ESCRITA no Asaas.
 *
 * Deliberadamente pequeno: só o que o usuário autorizou explicitamente, e
 * sempre a partir de um clique de confirmação na tela.
 */

import { asaasBase, asaasKey } from "@/lib/asaas";

async function asaasPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const key = asaasKey();
  if (!key) throw new Error("ASAAS_API_KEY não configurada.");
  const res = await fetch(`${asaasBase()}${path}`, {
    method: "POST",
    headers: {
      access_token: key,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text).errors?.[0]?.description ?? text;
    } catch {
      /* mantém o texto cru */
    }
    throw new Error(String(msg).slice(0, 160));
  }
  return JSON.parse(text) as T;
}

/**
 * Quita a cobrança no Asaas como "recebido em dinheiro".
 * Use quando o motorista pagou por fora (dinheiro/PIX na mão).
 * Não cancela nem altera a cobrança — só registra o recebimento, o que faz
 * o Asaas parar de mandar aviso de atraso.
 */
export async function receberEmDinheiro(params: {
  asaasId: string;
  value: number;
  /** Data do recebimento (padrão: hoje). */
  date?: Date;
  /** Avisar o motorista da confirmação do pagamento. */
  notifyCustomer?: boolean;
}): Promise<{ status: string }> {
  const d = params.date ?? new Date();
  // O Asaas espera a data no formato yyyy-mm-dd, no fuso de Brasília.
  const paymentDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(d);

  return asaasPost<{ status: string }>(`/payments/${params.asaasId}/receiveInCash`, {
    paymentDate,
    value: params.value,
    notifyCustomer: params.notifyCustomer ?? true,
  });
}

/** Desfaz o recebimento em dinheiro (volta a cobrança para em aberto). */
export async function desfazerRecebimento(asaasId: string): Promise<{ status: string }> {
  return asaasPost<{ status: string }>(`/payments/${asaasId}/undoReceivedInCash`, {});
}

export type CobrancaCriada = {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  invoiceUrl: string | null;
  bankSlipUrl: string | null;
  /** Id do carnê, presente quando a cobrança foi parcelada. */
  installment?: string | null;
};

/**
 * Cria uma cobrança avulsa no Asaas (multa de trânsito, avaria, combustível…),
 * à vista ou parcelada.
 *
 * É uma cobrança NOVA e independente: não altera, não duplica e não interfere
 * nas cobranças de aluguel do contrato. O `externalReference`
 * guarda o id da dívida aqui, o que permite reconhecê-la depois.
 *
 * `billingType: "UNDEFINED"` deixa o motorista escolher PIX, boleto ou cartão
 * na própria página da fatura.
 *
 * Parcelamento: mandamos `totalValue` + `installmentCount` e o Asaas gera o
 * carnê, dividindo o valor e espaçando os vencimentos de mês em mês. Assim o
 * arredondamento dos centavos fica por conta deles. A resposta é a PRIMEIRA
 * parcela, com o id do carnê em `installment`.
 */
export async function criarCobranca(params: {
  asaasCustomerId: string;
  /** Valor total da dívida (será dividido se houver parcelas). */
  totalValue: number;
  /** 1 = à vista. */
  installments?: number;
  /** Vencimento da primeira parcela. */
  dueDate: Date;
  description: string;
  externalReference: string;
}): Promise<CobrancaCriada> {
  const dueDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(params.dueDate);

  const total = Number(params.totalValue.toFixed(2));
  const parcelas = Math.max(1, Math.floor(params.installments ?? 1));

  const corpo: Record<string, unknown> = {
    customer: params.asaasCustomerId,
    billingType: "UNDEFINED",
    dueDate,
    // O Asaas corta a descrição em 500 caracteres.
    description: params.description.slice(0, 480),
    externalReference: params.externalReference,
  };

  if (parcelas > 1) {
    corpo.installmentCount = parcelas;
    corpo.totalValue = total;
  } else {
    corpo.value = total;
  }

  return asaasPost<CobrancaCriada>("/payments", corpo);
}

/** Cancela o carnê inteiro (todas as parcelas) de uma dívida parcelada. */
export async function cancelarCarne(installmentId: string): Promise<unknown> {
  const key = asaasKey();
  if (!key) throw new Error("ASAAS_API_KEY não configurada.");
  const res = await fetch(`${asaasBase()}/installments/${installmentId}`, {
    method: "DELETE",
    headers: { access_token: key, accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text).errors?.[0]?.description ?? text;
    } catch {
      /* mantém o texto cru */
    }
    throw new Error(String(msg).slice(0, 160));
  }
  return JSON.parse(text);
}

/** Cancela (remove) uma cobrança avulsa criada por nós. */
export async function cancelarCobranca(asaasId: string): Promise<{ deleted: boolean }> {
  const key = asaasKey();
  if (!key) throw new Error("ASAAS_API_KEY não configurada.");
  const res = await fetch(`${asaasBase()}/payments/${asaasId}`, {
    method: "DELETE",
    headers: { access_token: key, accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text).errors?.[0]?.description ?? text;
    } catch {
      /* mantém o texto cru */
    }
    throw new Error(String(msg).slice(0, 160));
  }
  return JSON.parse(text) as { deleted: boolean };
}

import { prisma } from "@/lib/prisma";
import {
  listPayments,
  listCustomers,
  plateFromDescription,
  asaasDate,
  isOpen,
  isPaid,
  type AsaasPayment,
} from "@/lib/asaas";

export type SyncResult = {
  lidas: number;
  gravadas: number;
  semPlaca: number;
  /** Contratos que estavam sem valor semanal e foram preenchidos pelo Asaas. */
  valoresPreenchidos: number;
  erros: string[];
};

/**
 * Espelha as cobranças do Asaas no nosso banco.
 * Só LÊ do Asaas. Liga cada cobrança ao contrato pela placa que vem na
 * descrição.
 */
export async function syncPayments(): Promise<SyncResult> {
  const result: SyncResult = {
    lidas: 0,
    gravadas: 0,
    semPlaca: 0,
    valoresPreenchidos: 0,
    erros: [],
  };

  let payments: AsaasPayment[];
  try {
    payments = await listPayments();
  } catch (e) {
    result.erros.push(String(e));
    return result;
  }
  result.lidas = payments.length;

  // TODOS os contratos da placa (qualquer status, não só ATIVO) — para achar
  // o contrato que estava vigente na placa NA DATA da cobrança, e não o
  // ativo hoje. Sem isso, toda troca de motorista reescrevia o vínculo das
  // cobranças antigas do motorista anterior para o novo — a dívida "pulava"
  // de motorista sozinha no sync seguinte. Pedido do usuário em 2026-10-23.
  const contracts = await prisma.contract.findMany({
    select: {
      id: true,
      status: true,
      customerId: true,
      startDate: true,
      vehicle: { select: { plate: true } },
      customer: { select: { cpfCnpj: true } },
    },
  });
  const porPlaca = new Map<string, typeof contracts>();
  for (const c of contracts) {
    const lista = porPlaca.get(c.vehicle.plate) ?? [];
    lista.push(c);
    porPlaca.set(c.vehicle.plate, lista);
  }
  /** O contrato da placa com o `startDate` mais recente que já tinha começado até `data` — quem estava com o carro naquela data, não hoje. */
  function contratoNaData(plate: string, data: Date) {
    let melhor: (typeof contracts)[number] | undefined;
    for (const c of porPlaca.get(plate) ?? []) {
      if (c.startDate.getTime() > data.getTime()) continue;
      if (!melhor || c.startDate.getTime() > melhor.startDate.getTime()) melhor = c;
    }
    return melhor;
  }

  // Fallback por cliente: se o motorista troca de carro, uma cobrança já
  // emitida segue com a placa antiga e o vínculo pela placa se perde.
  // Esse fallback é pra achar o contrato ATUAL do motorista noutro carro —
  // por isso continua olhando só os ativos.
  const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
  const byCpf = new Map(
    contracts
      .filter((c) => c.status === "ATIVO" && digits(c.customer.cpfCnpj))
      .map((c) => [digits(c.customer.cpfCnpj), c])
  );
  const asaasCustomerToContract = new Map<string, (typeof contracts)[number]>();
  try {
    for (const cli of await listCustomers()) {
      const c = byCpf.get(digits(cli.cpfCnpj));
      if (c) asaasCustomerToContract.set(cli.id, c);
    }
  } catch (e) {
    result.erros.push(`clientes: ${e}`);
  }

  // Vínculo já gravado de cobranças que já existiam — fica CONGELADO (nunca
  // reescrito abaixo). Só tenta vincular de novo enquanto ainda não tinha
  // contrato nenhum (cobrança nova, ou que nunca bateu com nada).
  const existentes = await prisma.payment.findMany({
    where: { asaasId: { in: payments.map((p) => p.id) } },
    select: { asaasId: true, contractId: true, customerId: true },
  });
  const vinculoAtual = new Map(existentes.map((p) => [p.asaasId, p]));

  for (const p of payments) {
    const plate = plateFromDescription(p.description);
    if (!plate) result.semPlaca++;
    const dueDate = asaasDate(p.dueDate);
    if (!dueDate) continue;

    const atual = vinculoAtual.get(p.id);
    let contractId = atual?.contractId ?? null;
    let customerId = atual?.customerId ?? null;
    if (!contractId) {
      const contract =
        (plate ? contratoNaData(plate, dueDate) : undefined) ?? asaasCustomerToContract.get(p.customer);
      contractId = contract?.id ?? null;
      customerId = contract?.customerId ?? null;
    }

    const data = {
      contractId,
      customerId,
      plate,
      value: p.value,
      netValue: p.netValue,
      status: p.status,
      billingType: p.billingType,
      dueDate,
      paymentDate: asaasDate(p.paymentDate),
      description: p.description,
      invoiceUrl: p.invoiceUrl,
      bankSlipUrl: p.bankSlipUrl,
      syncedAt: new Date(),
    };

    try {
      await prisma.payment.upsert({
        where: { asaasId: p.id },
        // Não mexe em settledLocally / lastChargedAt: são anotações nossas.
        update: data,
        create: { asaasId: p.id, ...data },
      });
      result.gravadas++;
    } catch (e) {
      result.erros.push(`${p.id}: ${String(e)}`);
    }
  }

  await refreshContractPaymentStatus();
  result.valoresPreenchidos = await refreshWeeklyValues();
  return result;
}

/**
 * Preenche o valor semanal dos contratos a partir das cobranças do Asaas,
 * para contrato que ficou sem valor cadastrado.
 *
 * Só preenche o que está vazio — nunca sobrescreve um valor já definido
 * (pode ter sido ajustado à mão, e valor combinado é dado sensível).
 */
export async function refreshWeeklyValues(): Promise<number> {
  const contracts = await prisma.contract.findMany({
    where: { status: "ATIVO" },
    select: { id: true, weeklyValue: true, payments: true },
  });

  let preenchidos = 0;
  for (const c of contracts) {
    if (Number(c.weeklyValue ?? 0) > 0) continue;
    if (c.payments.length === 0) continue;

    // Valor que mais se repete nas cobranças daquele contrato.
    const tally = new Map<number, number>();
    for (const p of c.payments) {
      const v = Number(p.value);
      tally.set(v, (tally.get(v) ?? 0) + 1);
    }
    let valor = 0;
    let melhor = 0;
    for (const [v, n] of tally) {
      if (n > melhor) {
        melhor = n;
        valor = v;
      }
    }
    if (valor <= 0) continue;

    await prisma.contract.update({ where: { id: c.id }, data: { weeklyValue: valor } });
    preenchidos++;
  }
  return preenchidos;
}

/** Atualiza o status de pagamento de cada contrato a partir das cobranças. */
export async function refreshContractPaymentStatus(): Promise<void> {
  const contracts = await prisma.contract.findMany({
    where: { status: "ATIVO" },
    select: { id: true, paymentStatus: true, payments: true },
  });

  for (const c of contracts) {
    const abertas = c.payments.filter((p) => !p.settledLocally && isOpen(p.status));
    const vencidas = abertas.filter((p) => p.dueDate < new Date());
    const status = vencidas.length > 0 ? "ATRASADO" : abertas.length > 0 ? "PENDENTE" : "EM_DIA";
    if (status !== c.paymentStatus) {
      await prisma.contract.update({ where: { id: c.id }, data: { paymentStatus: status } });
    }
  }
}

/** Uma cobrança está em aberto para nós? (considera a baixa manual) */
export function emAberto(p: { status: string; settledLocally: boolean }): boolean {
  return !p.settledLocally && isOpen(p.status);
}

/** Uma cobrança foi paga? (no Asaas ou com baixa manual aqui) */
export function pago(p: { status: string; settledLocally: boolean }): boolean {
  return p.settledLocally || isPaid(p.status);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCan } from "@/lib/session";
import { auditar } from "@/lib/audit";
import { addDays, KM_CYCLE_DAYS, parseBrtDateTime } from "@/lib/dates";
import { escreverKm, depoisDeAplicarKm, SELECT_VEICULO_KM } from "@/lib/km";
import { formatCurrency } from "@/lib/utils";
import {
  PERIODOS,
  FATURAMENTO,
  INFORMACOES_ADICIONAIS_MAX,
  NIVEIS_COMBUSTIVEL,
  documentoValido,
  formatarDocumento,
  soDigitos,
  somarPeriodos,
  valorSemanal,
} from "@/lib/contrato-gerar";

// ─────────────────────────────────────────────────────────────
// NOVO CLIENTE (modal)
// ─────────────────────────────────────────────────────────────

export type NovoClienteResult =
  | { ok: true; cliente: { id: string; label: string } }
  | { ok: false; error: string };

const novoClienteSchema = z.object({
  cpf: z.string().trim().min(1, "Informe o CPF/CNPJ."),
  tipo: z.enum(["FISICA", "JURIDICA"]),
  nome: z.string().trim().min(1, "Informe o nome completo."),
  razaoSocial: z.string().trim().min(1, "Informe a razão social."),
});

export async function criarClienteRapido(input: {
  cpf: string;
  tipo: string;
  nome: string;
  razaoSocial: string;
}): Promise<NovoClienteResult> {
  const user = await requireCan("cadastros.editar");

  const parsed = novoClienteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { tipo, nome, razaoSocial } = parsed.data;
  const digitos = soDigitos(parsed.data.cpf);

  if (tipo === "FISICA" && digitos.length !== 11) {
    return { ok: false, error: "CPF deve ter 11 dígitos." };
  }
  if (tipo === "JURIDICA" && digitos.length !== 14) {
    return { ok: false, error: "CNPJ deve ter 14 dígitos." };
  }
  if (!documentoValido(digitos)) {
    return { ok: false, error: `${tipo === "FISICA" ? "CPF" : "CNPJ"} inválido.` };
  }

  const documento = formatarDocumento(digitos);
  // O documento pode ter sido gravado com ou sem pontuação, então compara as
  // duas formas — cliente duplicado vira cobrança duplicada mais à frente.
  const existente = await prisma.customer.findFirst({
    where: { cpfCnpj: { in: [documento, digitos] } },
    select: { id: true, name: true },
  });
  if (existente) {
    return { ok: false, error: `Já existe um cliente com este documento: ${existente.name}.` };
  }

  const cliente = await prisma.customer.create({
    data: {
      name: nome.toUpperCase(),
      companyName: razaoSocial.toUpperCase(),
      personType: tipo,
      cpfCnpj: documento,
    },
    select: { id: true, name: true, cpfCnpj: true },
  });

  await auditar(user, {
    action: "cliente.criado",
    entity: "Customer",
    entityId: cliente.id,
    summary: `Cadastrou o cliente ${cliente.name} (${documento})`,
  });

  revalidatePath("/clientes");
  return { ok: true, cliente: { id: cliente.id, label: `${cliente.name} — ${cliente.cpfCnpj}` } };
}

// ─────────────────────────────────────────────────────────────
// GERAR CONTRATO
// ─────────────────────────────────────────────────────────────

export type GerarContratoState = { error?: string };

const vazioParaNulo = (v: unknown) => (v === "" || v == null ? null : v);
/**
 * "2026-11-02" → meio-dia de Brasília desse dia. Meia-noite UTC (o que o
 * `new Date("2026-11-02")` daria) vira 21h do dia ANTERIOR em Brasília, e a
 * data apareceria um dia antes conforme o fuso de quem formata. Meio-dia cai
 * no mesmo dia de calendário em qualquer fuso do Brasil e em UTC.
 */
const dataCalendario = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00-03:00`) : vazioParaNulo(v);
/** "1.234,56" ou "1234.56" → 1234.56 */
const dinheiro = (v: unknown) => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!t) return null;
  return t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
};

const itemSchema = z.object({
  inicio: z.preprocess(dataCalendario, z.date({ message: "Item adicional sem data de início." })),
  fim: z.preprocess(dataCalendario, z.date().nullable()),
  descricao: z.string().trim().min(1, "Item adicional sem descrição."),
  valor: z.preprocess(dinheiro, z.number({ message: "Item adicional com valor inválido." }).nonnegative()),
  ativo: z.boolean(),
});

const contratoSchema = z.object({
  customerId: z.string().trim().min(1, "Selecione o cliente."),
  billingMode: z.enum(FATURAMENTO, { message: "Selecione quando realizar o faturamento." }),
  periodType: z.enum(PERIODOS, { message: "Selecione o tipo de período do contrato." }),
  invoiceCount: z.coerce
    .number({ message: "Informe a quantidade de faturas." })
    .int("A quantidade de faturas deve ser um número inteiro.")
    .min(1, "Informe ao menos 1 fatura.")
    .max(104, "No máximo 104 faturas."),
  promoterId: z.preprocess(vazioParaNulo, z.string().nullable()),
  classification: z.preprocess(vazioParaNulo, z.string().nullable()),
  billingUnit: z.string().trim().min(1, "Selecione a unidade de faturamento."),
  hiringDelivery: z.preprocess(vazioParaNulo, z.string().nullable()),
  additionalInfo: z.preprocess(
    vazioParaNulo,
    z
      .string()
      .max(INFORMACOES_ADICIONAIS_MAX, `Informações adicionais: no máximo ${INFORMACOES_ADICIONAIS_MAX} caracteres.`)
      .nullable()
  ),

  vehicleId: z.string().trim().min(1, "Selecione o veículo."),
  priceTable: z.preprocess(vazioParaNulo, z.string().trim().nullable()),
  kmFranchise: z.preprocess(vazioParaNulo, z.string().trim().nullable()),
  periodValue: z.preprocess(
    dinheiro,
    z.number({ message: "Informe o valor do período." }).positive("O valor do período deve ser maior que zero.")
  ),
  deliveryOdometer: z.coerce
    .number({ message: "Informe o odômetro de entrega." })
    .int("O odômetro deve ser um número inteiro.")
    .nonnegative("O odômetro não pode ser negativo."),
  deliveryAt: z.preprocess(
    (v) => parseBrtDateTime(v),
    z.date({ message: "Informe a data de entrega." })
  ),
  deliveryFuel: z.enum(NIVEIS_COMBUSTIVEL, { message: "Selecione o nível de combustível na retirada." }),
  startDate: z.preprocess(dataCalendario, z.date({ message: "Informe a data de início do contrato." })),

  firstPaymentReceived: z.boolean(),
  depositValue: z.preprocess(dinheiro, z.number().nonnegative().nullable()),
  depositReceivedAt: z.preprocess(dataCalendario, z.date().nullable()),
  depositPaymentMethod: z.preprocess(vazioParaNulo, z.string().nullable()),

  itens: z.array(itemSchema),
});

function lerFormulario(formData: FormData) {
  let itens: unknown = [];
  try {
    itens = JSON.parse(String(formData.get("itens") ?? "[]"));
  } catch {
    itens = null;
  }
  const g = (k: string) => formData.get(k);
  return {
    customerId: g("customerId"),
    billingMode: g("billingMode"),
    periodType: g("periodType"),
    invoiceCount: g("invoiceCount"),
    promoterId: g("promoterId"),
    classification: g("classification"),
    billingUnit: g("billingUnit"),
    hiringDelivery: g("hiringDelivery"),
    additionalInfo: g("additionalInfo"),
    vehicleId: g("vehicleId"),
    priceTable: g("priceTable"),
    kmFranchise: g("kmFranchise"),
    periodValue: g("periodValue"),
    deliveryOdometer: g("deliveryOdometer"),
    deliveryAt: g("deliveryAt"),
    deliveryFuel: g("deliveryFuel"),
    startDate: g("startDate"),
    firstPaymentReceived: g("firstPaymentReceived") === "on",
    depositValue: g("depositValue"),
    depositReceivedAt: g("depositReceivedAt"),
    depositPaymentMethod: g("depositPaymentMethod"),
    itens,
  };
}

/**
 * Gera o contrato: cria o registro, entrega o carro ao cliente e abre a
 * linha do tempo dele.
 *
 * Tudo numa transação — contrato sem carro marcado como alugado (ou o
 * contrário) é exatamente o tipo de meia-gravação que faz o pátio mentir.
 */
export async function gerarContrato(
  _prev: GerarContratoState,
  formData: FormData
): Promise<GerarContratoState> {
  const user = await requireCan("cadastros.editar");

  const parsed = contratoSchema.safeParse(lerFormulario(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  // Data e tipo do recebimento andam juntos: um sem o outro é caução que
  // ninguém sabe se entrou.
  if (Boolean(d.depositReceivedAt) !== Boolean(d.depositPaymentMethod)) {
    return { error: "Para registrar a caução como recebida, informe a data e o tipo do recebimento." };
  }
  if (d.depositReceivedAt && !(d.depositValue && d.depositValue > 0)) {
    return { error: "Informe o valor da caução recebida." };
  }

  const [cliente, veiculo, contratoAtivo] = await Promise.all([
    prisma.customer.findUnique({ where: { id: d.customerId }, select: { id: true, name: true } }),
    prisma.vehicle.findUnique({
      where: { id: d.vehicleId },
      select: { ...SELECT_VEICULO_KM, model: true, status: true },
    }),
    prisma.contract.findFirst({
      where: { vehicleId: d.vehicleId, status: "ATIVO" },
      select: { customer: { select: { name: true } } },
    }),
  ]);
  if (!cliente) return { error: "Cliente não encontrado." };
  if (!veiculo) return { error: "Veículo não encontrado." };
  if (contratoAtivo) {
    return {
      error: `O ${veiculo.plate} já está com ${contratoAtivo.customer.name}. Encerre esse contrato antes de gerar outro.`,
    };
  }
  if (veiculo.status === "VENDIDO") return { error: `O ${veiculo.plate} está marcado como vendido.` };
  if (veiculo.status === "MANUTENCAO") {
    return { error: `O ${veiculo.plate} está em manutenção. Dê saída da manutenção antes de entregar.` };
  }
  if (d.deliveryOdometer < veiculo.currentKm) {
    return {
      error: `O odômetro de entrega (${d.deliveryOdometer.toLocaleString("pt-BR")} km) é menor que a KM atual do ${veiculo.plate} (${veiculo.currentKm.toLocaleString("pt-BR")} km). Confira o painel.`,
    };
  }

  const caucaoRecebida = Boolean(d.depositValue && d.depositReceivedAt);
  // Até onde o lote de faturas cobre — o mesmo sentido de `endDate` em todo o
  // sistema (não é o fim da locação; veja o comentário no schema).
  const coberturaFaturas = somarPeriodos(d.startDate, d.periodType, d.invoiceCount);

  let contratoId = "";
  try {
    await prisma.$transaction(async (tx) => {
      const contrato = await tx.contract.create({
        data: {
          customerId: d.customerId,
          vehicleId: d.vehicleId,
          status: "ATIVO",
          startDate: d.startDate,
          endDate: coberturaFaturas,
          periodType: d.periodType,
          periodValue: d.periodValue,
          weeklyValue: valorSemanal(d.periodValue, d.periodType),
          invoiceCount: d.invoiceCount,
          billingMode: d.billingMode,
          promoterId: d.promoterId,
          classification: d.classification,
          billingUnit: d.billingUnit,
          hiringDelivery: d.hiringDelivery,
          additionalInfo: d.additionalInfo,
          priceTable: d.priceTable,
          kmFranchise: d.kmFranchise,
          pickupDate: d.deliveryAt,
          pickupDone: true,
          deliveryOdometer: d.deliveryOdometer,
          deliveryFuel: d.deliveryFuel,
          firstPaymentReceived: d.firstPaymentReceived,
          depositValue: d.depositValue && d.depositValue > 0 ? d.depositValue : null,
          depositPaidValue: caucaoRecebida ? d.depositValue! : 0,
          depositPaidAt: caucaoRecebida ? d.depositReceivedAt : null,
          depositPaymentMethod: caucaoRecebida ? d.depositPaymentMethod : null,
          paymentStatus: d.firstPaymentReceived ? "EM_DIA" : "PENDENTE",
          nextKmRequestDate: addDays(d.startDate, KM_CYCLE_DAYS),
          items: {
            create: d.itens.map((it) => ({
              startDate: it.inicio,
              endDate: it.fim,
              description: it.descricao,
              value: it.valor,
              active: it.ativo,
            })),
          },
        },
        select: { id: true },
      });
      contratoId = contrato.id;

      await tx.vehicle.update({ where: { id: d.vehicleId }, data: { status: "ALUGADO" } });
      if (d.deliveryOdometer > veiculo.currentKm) {
        await escreverKm(tx, veiculo, d.deliveryOdometer);
      }
    });
  } catch {
    return { error: "Erro ao gerar o contrato. Tente novamente." };
  }

  if (d.deliveryOdometer > veiculo.currentKm) {
    await depoisDeAplicarKm({
      veiculo,
      kmAnterior: veiculo.currentKm,
      kmNova: d.deliveryOdometer,
      origem: "contrato",
      user,
    });
  }

  await auditar(user, {
    action: "contrato.gerado",
    entity: "Contract",
    entityId: contratoId,
    amount: d.periodValue,
    summary: `Gerou contrato de ${cliente.name} com o ${veiculo.plate} — ${d.invoiceCount}x ${formatCurrency(d.periodValue)}`,
  });

  revalidatePath("/contratos");
  revalidatePath("/veiculos");
  revalidatePath(`/veiculos/${d.vehicleId}`);
  revalidatePath("/motoristas");
  revalidatePath("/caucoes");
  redirect(`/contratos/${contratoId}`);
}

import { EMPRESA } from "@/lib/empresa";
import { formatPhoneForWhatsApp } from "@/lib/utils";

/** URL pública base da aplicação (para montar o link do motorista). */
export function appUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  // Na Vercel, usa a URL de produção automaticamente.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}

/** Monta o link exclusivo do motorista a partir do token. */
export function driverLink(token: string): string {
  return `${appUrl()}/km/${token}`;
}

/**
 * Monta a mensagem padrão de solicitação de KM (Módulo 6).
 */
export function buildKmMessage(params: {
  model: string | null;
  plate: string;
  link: string;
}): string {
  const veiculo = params.model ? `${params.model} - placa ${params.plate}` : `placa ${params.plate}`;
  return [
    "Olá, tudo bem?",
    "",
    `Para mantermos o controle da locação, precisamos que você informe a quilometragem atual do veículo ${veiculo}.`,
    "",
    "Esse procedimento é obrigatório a cada 15 dias e leva menos de 1 minuto.",
    "",
    "Acesse o link abaixo, informe a KM atual e envie a foto do painel e da placa:",
    "",
    params.link,
    "",
    EMPRESA.nome,
  ].join("\n");
}

/**
 * Monta a mensagem de cobrança de uma parcela em aberto.
 * O link é a fatura do Asaas, que já abre com PIX e boleto.
 */
export function buildCobrancaMessage(params: {
  firstName: string;
  plate: string;
  value: string;
  dueDate: string;
  daysLate: number;
  link?: string | null;
}): string {
  const atrasado = params.daysLate > 0;
  return [
    `Olá, ${params.firstName}! Tudo bem?`,
    "",
    atrasado
      ? `Identificamos que a parcela da locação do veículo ${params.plate} está em aberto desde ${params.dueDate} (${params.daysLate} dia${params.daysLate === 1 ? "" : "s"} de atraso).`
      : `Passando para lembrar da parcela da locação do veículo ${params.plate}, com vencimento em ${params.dueDate}.`,
    "",
    `Valor: ${params.value}`,
    ...(params.link ? ["", "Você pode pagar por PIX ou boleto neste link:", params.link] : []),
    "",
    "Se o pagamento já tiver sido feito, por favor desconsidere e nos envie o comprovante.",
    "",
    EMPRESA.nome,
  ].join("\n");
}

/** Mensagem de cobrança de uma dívida avulsa (multa, avaria, combustível…). */
export function buildDividaMessage(params: {
  firstName: string;
  titulo: string;
  value: string;
  dueDate: string;
  link?: string | null;
}): string {
  return [
    `Olá, ${params.firstName}! Tudo bem?`,
    "",
    `Segue a cobrança referente a: ${params.titulo}.`,
    "",
    `Valor: ${params.value}`,
    `Vencimento: ${params.dueDate}`,
    ...(params.link ? ["", "Pague por PIX, boleto ou cartão neste link:", params.link] : []),
    "",
    "Qualquer dúvida é só chamar por aqui.",
    "",
    EMPRESA.nome,
  ].join("\n");
}

/**
 * Monta o link wa.me com a mensagem codificada para URL.
 * Retorna null se o telefone for inválido.
 */
export function buildWhatsAppLink(phone: string | null | undefined, message: string): string | null {
  const normalized = formatPhoneForWhatsApp(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/** Regras e textos da caução — usados pela tela e pela exportação do WhatsApp. */

import { EMPRESA } from "@/lib/empresa";

export type DepositState = "SEM_CAUCAO" | "PENDENTE" | "PARCIAL" | "PAGA" | "DEVOLVIDA";

type Tone = "default" | "neon" | "success" | "warning" | "danger" | "purple";

export const DEPOSIT_LABEL: Record<DepositState, { label: string; tone: Tone }> = {
  SEM_CAUCAO: { label: "Sem caução", tone: "default" },
  PENDENTE: { label: "Pendente", tone: "danger" },
  PARCIAL: { label: "Parcial", tone: "warning" },
  PAGA: { label: "Paga", tone: "success" },
  DEVOLVIDA: { label: "Devolvida", tone: "purple" },
};

/** Situação da caução, deduzida dos valores (nada de status desencontrado). */
export function depositState(c: {
  depositValue: unknown;
  depositPaidValue: unknown;
  depositRefundedAt: Date | null;
}): DepositState {
  if (c.depositRefundedAt) return "DEVOLVIDA";
  const total = Number(c.depositValue ?? 0);
  const pago = Number(c.depositPaidValue ?? 0);
  if (total <= 0) return "SEM_CAUCAO";
  if (pago >= total) return "PAGA";
  if (pago > 0) return "PARCIAL";
  return "PENDENTE";
}

/** Quanto ainda falta pagar da caução. */
export function depositRemaining(c: {
  depositValue: unknown;
  depositPaidValue: unknown;
}): number {
  return Math.max(0, Number(c.depositValue ?? 0) - Number(c.depositPaidValue ?? 0));
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBR = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);

const dataHoraBR = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

export type ResumoItem = {
  nome: string;
  placa: string;
  modelo: string | null;
  total: number;
  pago: number;
  falta: number;
  estado: DepositState;
  retirada: Date | null;
  retirou: boolean;
};

/**
 * Monta o resumo em texto para colar no WhatsApp.
 * Formatado com os marcadores que o WhatsApp entende (*negrito*).
 */
export function buildCaucaoResumo(itens: ResumoItem[], agora = new Date()): string {
  const pendentes = itens.filter((i) => i.estado === "PENDENTE" || i.estado === "PARCIAL");
  const retiradas = itens
    .filter((i) => !i.retirou && i.retirada)
    .sort((a, b) => a.retirada!.getTime() - b.retirada!.getTime());

  const linhas: string[] = [`*CAUÇÕES E RETIRADAS — ${EMPRESA.nome}*`, `_${dataBR(agora)}_`];

  if (pendentes.length) {
    const totalFalta = pendentes.reduce((s, i) => s + i.falta, 0);
    linhas.push("", `*CAUÇÕES EM ABERTO (${pendentes.length})*`);
    for (const i of pendentes) {
      const detalhe =
        i.estado === "PARCIAL"
          ? `falta ${brl(i.falta)} de ${brl(i.total)}`
          : `${brl(i.total)}`;
      linhas.push(`• ${i.nome} — ${i.placa} — ${detalhe}`);
    }
    linhas.push(`*Total a receber: ${brl(totalFalta)}*`);
  } else {
    linhas.push("", "*CAUÇÕES* — todas em dia ✅");
  }

  if (retiradas.length) {
    linhas.push("", `*RETIRADAS AGENDADAS (${retiradas.length})*`);
    for (const i of retiradas) {
      linhas.push(
        `• ${dataHoraBR(i.retirada!)} — ${i.nome} — ${i.placa}${i.modelo ? ` (${i.modelo})` : ""}`
      );
    }
  }

  return linhas.join("\n");
}

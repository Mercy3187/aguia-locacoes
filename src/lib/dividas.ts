import type { DebtType, DebtStatus } from "@/generated/prisma/client";

type Tone = "default" | "neon" | "success" | "warning" | "danger" | "purple";

export const DEBT_TYPE: Record<DebtType, { label: string; emoji: string }> = {
  MULTA_TRANSITO: { label: "Multa de trânsito", emoji: "🚦" },
  AVARIA: { label: "Avaria / dano", emoji: "🔧" },
  COMBUSTIVEL: { label: "Combustível", emoji: "⛽" },
  FRANQUIA: { label: "Franquia do seguro", emoji: "🛡️" },
  LIMPEZA: { label: "Limpeza", emoji: "🧽" },
  GUINCHO: { label: "Guincho", emoji: "🚛" },
  OUTRO: { label: "Outro", emoji: "📄" },
};

export const DEBT_STATUS: Record<DebtStatus, { label: string; tone: Tone }> = {
  ABERTA: { label: "A cobrar", tone: "warning" },
  COBRADA: { label: "Cobrança emitida", tone: "neon" },
  PAGA: { label: "Paga", tone: "success" },
  CANCELADA: { label: "Cancelada", tone: "default" },
};

export const DEBT_TYPE_OPTIONS = Object.entries(DEBT_TYPE).map(([value, { label, emoji }]) => ({
  value,
  label: `${emoji} ${label}`,
}));

/** Texto padrão que vai na descrição da cobrança e na mensagem do WhatsApp. */
export function debtTitle(d: {
  type: DebtType;
  description: string;
  vehiclePlate?: string | null;
}): string {
  const tipo = DEBT_TYPE[d.type].label;
  const placa = d.vehiclePlate ? ` (${d.vehiclePlate})` : "";
  return `${tipo}${placa} — ${d.description}`;
}

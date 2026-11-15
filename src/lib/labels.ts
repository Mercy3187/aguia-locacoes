import type {
  VehicleStatus,
  OilStatus,
  ContractStatus,
  PaymentStatus,
  KmRequestStatus,
  ValidationStatus,
  MaintenanceStatus,
} from "@/generated/prisma/client";

type Tone = "default" | "neon" | "success" | "warning" | "danger" | "purple";

export const VEHICLE_STATUS: Record<VehicleStatus, { label: string; tone: Tone }> = {
  DISPONIVEL: { label: "Disponível", tone: "success" },
  ALUGADO: { label: "Alugado", tone: "neon" },
  MANUTENCAO: { label: "Manutenção", tone: "warning" },
  VENDIDO: { label: "Vendido", tone: "default" },
  RESERVADO: { label: "Reservado", tone: "purple" },
};

export const OIL_STATUS: Record<OilStatus, { label: string; tone: Tone }> = {
  VERDE: { label: "Em dia", tone: "success" },
  AMARELO: { label: "Próxima", tone: "warning" },
  VERMELHO: { label: "Vencida", tone: "danger" },
};

export const CONTRACT_STATUS: Record<ContractStatus, { label: string; tone: Tone }> = {
  ATIVO: { label: "Ativo", tone: "success" },
  ENCERRADO: { label: "Encerrado", tone: "default" },
  CANCELADO: { label: "Cancelado", tone: "danger" },
  PENDENTE: { label: "Pendente", tone: "warning" },
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  EM_DIA: { label: "Em dia", tone: "success" },
  ATRASADO: { label: "Atrasado", tone: "danger" },
  PENDENTE: { label: "Pendente", tone: "warning" },
};

export const KM_REQUEST_STATUS: Record<KmRequestStatus, { label: string; tone: Tone }> = {
  PENDENTE: { label: "Pendente", tone: "warning" },
  ENVIADO: { label: "Enviado", tone: "neon" },
  RESPONDIDO: { label: "Respondido", tone: "success" },
  VENCIDO: { label: "Vencido", tone: "danger" },
  CANCELADO: { label: "Cancelado", tone: "default" },
};

export const VALIDATION_STATUS: Record<ValidationStatus, { label: string; tone: Tone }> = {
  APROVADO: { label: "Aprovado", tone: "success" },
  PENDENTE_CONFERENCIA: { label: "Conferir", tone: "warning" },
  SUSPEITO: { label: "Suspeito", tone: "purple" },
  RECUSADO: { label: "Recusado", tone: "danger" },
};

export const MAINTENANCE_STATUS: Record<MaintenanceStatus, { label: string; tone: Tone }> = {
  EM_ANDAMENTO: { label: "Em andamento", tone: "warning" },
  CONCLUIDA: { label: "Concluída", tone: "success" },
  CANCELADA: { label: "Cancelada", tone: "default" },
};

export const VEHICLE_STATUS_OPTIONS = Object.entries(VEHICLE_STATUS).map(
  ([value, { label }]) => ({ value, label })
);

export const CONTRACT_STATUS_OPTIONS = Object.entries(CONTRACT_STATUS).map(
  ([value, { label }]) => ({ value, label })
);

export const PAYMENT_STATUS_OPTIONS = Object.entries(PAYMENT_STATUS).map(
  ([value, { label }]) => ({ value, label })
);

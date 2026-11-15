import { headers } from "next/headers";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";

/**
 * Trilha de auditoria.
 *
 * Com mais de uma pessoa mexendo em dinheiro (baixa de cobrança, emissão de
 * dívida, caução), é preciso saber quem fez o quê e quando. Registrar é
 * best-effort e roda depois da resposta (`after`): uma falha no log nunca
 * pode derrubar a operação que o usuário acabou de fazer.
 */

export type AuditAction =
  | "pagamento.baixa"
  | "pagamento.estorno"
  | "pagamento.removido"
  | "pagamento.cobranca_enviada"
  | "divida.criada"
  | "divida.cobranca_emitida"
  | "divida.paga"
  | "divida.cancelada"
  | "caucao.salva"
  | "caucao.quitada"
  | "caucao.devolvida"
  | "retirada.confirmada"
  | "contrato.gerado"
  | "cliente.criado"
  | "contrato.encerrado"
  | "contrato.vigencia_confirmada"
  | "contrato.principal_condutor_revisado"
  | "contrato.principal_condutor_automacao"
  | "multa.paga_autoridade"
  | "manutencao.entrada"
  | "manutencao.saida"
  | "km.corrigida"
  | "km.alterada"
  | "usuario.criado"
  | "usuario.bloqueado"
  | "usuario.reativado"
  | "usuario.senha_alterada"
  | "usuario.perfil_alterado"
  | "asaas.notificacoes_padronizadas"
  | "acerto.pago"
  | "acerto.desfeito"
  | "registro.excluido";

export type AuditInput = {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  summary: string;
  amount?: number | null;
  metadata?: Record<string, unknown>;
};

/**
 * Grava uma entrada na trilha. Chame DEPOIS de a operação dar certo.
 * Nunca lança: se o log falhar, a operação do usuário continua valendo.
 */
export async function auditar(user: SessionUser, input: AuditInput): Promise<void> {
  let ip: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  } catch {
    /* fora de um request (cron, script) — segue sem IP */
  }

  const data = {
    userId: user.id,
    userName: user.name || user.email,
    userRole: user.role,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    summary: input.summary,
    amount: input.amount ?? null,
    metadata: (input.metadata ?? undefined) as never,
    ipAddress: ip,
  };

  try {
    after(async () => {
      try {
        await prisma.auditLog.create({ data });
      } catch {
        /* best-effort */
      }
    });
  } catch {
    // `after` só existe dentro de um request; fora dele grava direto.
    try {
      await prisma.auditLog.create({ data });
    } catch {
      /* best-effort */
    }
  }
}

const LABELS: Record<AuditAction, { label: string; tone: "money" | "security" | "op" }> = {
  "pagamento.baixa": { label: "Baixa de cobrança", tone: "money" },
  "pagamento.estorno": { label: "Estorno de baixa", tone: "money" },
  "pagamento.removido": { label: "Cobrança futura removida no Asaas", tone: "money" },
  "pagamento.cobranca_enviada": { label: "Cobrança enviada", tone: "op" },
  "divida.criada": { label: "Dívida lançada", tone: "money" },
  "divida.cobranca_emitida": { label: "Cobrança de dívida emitida", tone: "money" },
  "divida.paga": { label: "Dívida quitada", tone: "money" },
  "divida.cancelada": { label: "Dívida cancelada", tone: "money" },
  "caucao.salva": { label: "Caução editada", tone: "money" },
  "caucao.quitada": { label: "Caução recebida", tone: "money" },
  "caucao.devolvida": { label: "Caução devolvida", tone: "money" },
  "retirada.confirmada": { label: "Retirada confirmada", tone: "op" },
  "contrato.gerado": { label: "Contrato gerado", tone: "money" },
  "cliente.criado": { label: "Cliente cadastrado", tone: "op" },
  "contrato.encerrado": { label: "Contrato encerrado", tone: "money" },
  "contrato.vigencia_confirmada": { label: "Vigência do contrato confirmada", tone: "op" },
  "contrato.principal_condutor_revisado": { label: "Principal condutor revisado", tone: "op" },
  "contrato.principal_condutor_automacao": { label: "Indicação de principal condutor enviada pela automação", tone: "op" },
  "multa.paga_autoridade": { label: "Multa paga ao órgão de trânsito", tone: "money" },
  "manutencao.entrada": { label: "Entrada em manutenção", tone: "op" },
  "manutencao.saida": { label: "Saída de manutenção", tone: "money" },
  "km.corrigida": { label: "KM corrigida na conferência", tone: "op" },
  "km.alterada": { label: "KM do carro alterada", tone: "op" },
  "usuario.criado": { label: "Usuário criado", tone: "security" },
  "usuario.bloqueado": { label: "Acesso bloqueado", tone: "security" },
  "usuario.reativado": { label: "Acesso reativado", tone: "security" },
  "usuario.senha_alterada": { label: "Senha alterada", tone: "security" },
  "usuario.perfil_alterado": { label: "Perfil alterado", tone: "security" },
  "asaas.notificacoes_padronizadas": { label: "Notificações padronizadas", tone: "op" },
  "acerto.pago": { label: "Acerto da semana marcado como pago", tone: "money" },
  "acerto.desfeito": { label: "Acerto da semana desmarcado", tone: "money" },
  "registro.excluido": { label: "Registro excluído", tone: "security" },
};

export function auditLabel(action: string): { label: string; tone: "money" | "security" | "op" } {
  return LABELS[action as AuditAction] ?? { label: action, tone: "op" };
}

export const AUDIT_FILTROS = [
  { key: "todos", label: "Tudo" },
  { key: "money", label: "Dinheiro" },
  { key: "security", label: "Segurança" },
  { key: "op", label: "Operação" },
] as const;

/** Ações de cada grupo do filtro. */
export function acoesDoGrupo(grupo: string): string[] {
  return Object.entries(LABELS)
    .filter(([, v]) => v.tone === grupo)
    .map(([k]) => k);
}

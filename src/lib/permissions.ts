import type { Role } from "@/generated/prisma/client";

/**
 * Permissões do sistema.
 *
 * Regra de ouro: esconder um item de menu NÃO é segurança — a rota continua
 * acessível digitando a URL. Toda página protegida chama `requireCan()` e toda
 * server action sensível chama `requireCan()` antes de qualquer efeito.
 */
export type Capability =
  /** Inadimplência, cauções, dívidas e cobrança. */
  | "financeiro"
  /** Criar cobrança no Asaas e dar baixa (mexe em dinheiro de verdade). */
  | "financeiro.escrita"
  /** Motoristas, KM, manutenção e óleo. */
  | "operacao"
  /** Ver clientes, veículos e contratos. */
  | "cadastros.ver"
  /** Criar e editar clientes, veículos e contratos. */
  | "cadastros.editar"
  /** Excluir qualquer registro. */
  | "excluir"
  /** Relatórios e fechamento por proprietário. */
  | "relatorios"
  /** Valor de compra e valor investido dos veículos. */
  | "custos"
  /** Criar e editar usuários do sistema. */
  | "usuarios"
  /** Controle de Retiradas por grupo de veículos — dinheiro saindo do caixa. */
  | "retiradas";

const ADMIN: Capability[] = [
  "financeiro",
  "financeiro.escrita",
  "operacao",
  "cadastros.ver",
  "cadastros.editar",
  "excluir",
  "relatorios",
  "custos",
  "usuarios",
  "retiradas",
];

/**
 * FINANCEIRO — perfil administrativo/financeiro do dia a dia.
 * Faz o financeiro e a operação, consulta os cadastros, mas não apaga nada
 * e não vê o custo de compra da frota.
 */
const FINANCEIRO: Capability[] = [
  "financeiro",
  "financeiro.escrita",
  "operacao",
  "cadastros.ver",
];

/** FUNCIONARIO — só a operação do dia a dia. */
const FUNCIONARIO: Capability[] = ["operacao", "cadastros.ver"];

const BY_ROLE: Record<Role, Capability[]> = {
  ADMIN,
  FINANCEIRO,
  FUNCIONARIO,
};

/** O perfil tem essa permissão? */
export function can(role: Role | undefined | null, cap: Capability): boolean {
  if (!role) return false;
  return BY_ROLE[role]?.includes(cap) ?? false;
}

/** Primeira rota que o perfil consegue abrir (para onde mandar após o login). */
export function homeFor(role: Role): string {
  if (can(role, "relatorios")) return "/dashboard";
  if (can(role, "financeiro")) return "/inadimplencia";
  return "/motoristas";
}

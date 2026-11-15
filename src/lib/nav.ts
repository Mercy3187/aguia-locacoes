import type { Role } from "@/generated/prisma/client";
import type { IconName } from "@/components/icons";
import { can, type Capability } from "@/lib/permissions";

/** Blocos do menu. A ordem aqui é a ordem que aparece na barra lateral. */
export const NAV_GROUPS = ["Geral", "Operação", "Financeiro", "Gestão"] as const;

export type NavGroup = (typeof NAV_GROUPS)[number];

export type NavItem = {
  label: string;
  href: string;
  /** Permissão necessária para ver (e abrir) o item. */
  cap: Capability;
  /** Chave do ícone em `components/icons`. */
  icon: IconName;
  group: NavGroup;
};

/**
 * O menu é só a vitrine: quem protege a rota é o `requireCan()` dentro de cada
 * página. Os dois usam a mesma permissão para não sair do lugar.
 *
 * Os itens são divididos em blocos porque dezoito links seguidos, sem respiro,
 * viram uma parede — separados por assunto, o olho acha o que procura.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", cap: "relatorios", icon: "dashboard", group: "Geral" },
  { label: "Alertas", href: "/alertas", cap: "operacao", icon: "alerta", group: "Geral" },

  { label: "Motoristas & Carros", href: "/motoristas", cap: "operacao", icon: "motorista", group: "Operação" },
  { label: "Principal Condutor", href: "/condutores", cap: "operacao", icon: "carteira", group: "Operação" },
  { label: "Veículos", href: "/veiculos", cap: "cadastros.ver", icon: "carro", group: "Operação" },
  { label: "Grupos de Veículos", href: "/grupos", cap: "cadastros.ver", icon: "grupo", group: "Operação" },
  { label: "Clientes", href: "/clientes", cap: "cadastros.ver", icon: "cliente", group: "Operação" },
  { label: "Gerar Contrato", href: "/contratos/gerar", cap: "cadastros.editar", icon: "contrato", group: "Operação" },
  { label: "Contratos", href: "/contratos", cap: "cadastros.ver", icon: "contrato", group: "Operação" },
  { label: "Controle de KM", href: "/quilometragem", cap: "operacao", icon: "km", group: "Operação" },
  { label: "Troca de Óleo", href: "/oleo", cap: "operacao", icon: "oleo", group: "Operação" },
  { label: "Correia Dentada", href: "/correia", cap: "operacao", icon: "correia", group: "Operação" },
  { label: "Manutenções", href: "/manutencao", cap: "operacao", icon: "chave", group: "Operação" },

  { label: "Cobrança", href: "/cobranca", cap: "financeiro", icon: "cobranca", group: "Financeiro" },
  { label: "Relatório Pagamentos", href: "/relatorio-pagamentos", cap: "financeiro", icon: "acerto", group: "Financeiro" },
  { label: "Inadimplência", href: "/inadimplencia", cap: "financeiro", icon: "inadimplencia", group: "Financeiro" },
  { label: "Multas", href: "/multas", cap: "financeiro", icon: "multa", group: "Financeiro" },
  { label: "Dívidas", href: "/dividas", cap: "financeiro", icon: "divida", group: "Financeiro" },
  { label: "Cauções & Entregas", href: "/caucoes", cap: "financeiro", icon: "caucao", group: "Financeiro" },
  { label: "Fechamento", href: "/fechamento", cap: "relatorios", icon: "fechamento", group: "Financeiro" },
  { label: "Retiradas", href: "/retiradas", cap: "retiradas", icon: "retirada", group: "Financeiro" },

  { label: "Relatórios", href: "/relatorios", cap: "relatorios", icon: "relatorio", group: "Gestão" },
  { label: "Usuários", href: "/usuarios", cap: "usuarios", icon: "usuarios", group: "Gestão" },
  { label: "Auditoria", href: "/auditoria", cap: "usuarios", icon: "auditoria", group: "Gestão" },];

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => can(role, item.cap));
}

/**
 * Mesma lista, já dividida em blocos. Blocos que ficaram vazios para o perfil
 * (um funcionário não vê nada de Financeiro, por exemplo) são descartados, para
 * não sobrar um título solto sem nada embaixo.
 */
export function navGroupsForRole(
  role: Role
): { group: NavGroup; items: NavItem[] }[] {
  const permitidos = navForRole(role);
  return NAV_GROUPS.map((group) => ({
    group,
    items: permitidos.filter((item) => item.group === group),
  })).filter((bloco) => bloco.items.length > 0);
}

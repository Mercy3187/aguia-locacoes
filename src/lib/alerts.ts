import { prisma } from "@/lib/prisma";
import { addDays } from "@/lib/dates";
import { calcularCorreia } from "@/lib/correia";

export type AlertSeverity = "danger" | "warning" | "info";

/** Assuntos do painel. A ordem aqui é só o desempate; quem manda é a urgência. */
export const ALERT_GRUPOS = [
  "Quilometragem",
  "Manutenção",
  "Condutores",
  "Cadastro",
  "Sistema",
] as const;

export type AlertGrupo = (typeof ALERT_GRUPOS)[number];

export type Alert = {
  key: string;
  /** Nome curto do problema — usado onde não cabe a frase inteira. */
  label: string;
  /**
   * A mesma pendência escrita como tarefa: "Cobrar KM de 9 motoristas".
   * Um painel de alertas existe para dizer o que fazer, não para descrever
   * um estado — "KM quinzenal vencida" obriga o leitor a traduzir sozinho.
   */
  acao: string;
  count: number;
  severity: AlertSeverity;
  grupo: AlertGrupo;
  href: string;
};

/** "1 carro" / "3 carros" — sem o "(s)" que polui a leitura. */
function plural(n: number, singular: string, pluralForma: string): string {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

export type BlocoAlerta = {
  grupo: AlertGrupo;
  itens: Alert[];
  /** Soma dos itens do bloco. */
  total: number;
  /** O bloco tem alguma pendência crítica? */
  critico: boolean;
};

/**
 * Agrupa os alertas ativos por assunto, na ordem em que devem ser resolvidos.
 *
 * Bloco com item crítico vem primeiro; empate desempata pelo tamanho. Dentro
 * do bloco, crítico antes e, depois, o de maior volume.
 */
export function agruparAlertas(alerts: Alert[]): BlocoAlerta[] {
  const ativos = alerts.filter((a) => a.count > 0);

  return ALERT_GRUPOS.map((grupo) => {
    const itens = ativos
      .filter((a) => a.grupo === grupo)
      .sort((a, b) => {
        const peso = { danger: 0, warning: 1, info: 2 } as const;
        return peso[a.severity] - peso[b.severity] || b.count - a.count;
      });
    return {
      grupo,
      itens,
      total: itens.reduce((s, a) => s + a.count, 0),
      critico: itens.some((a) => a.severity === "danger"),
    };
  })
    .filter((b) => b.itens.length > 0)
    .sort((a, b) => Number(b.critico) - Number(a.critico) || b.total - a.total);
}

/**
 * Calcula todos os alertas operacionais do sistema (Módulo 17).
 * Retorna a lista completa; a UI decide o que destacar.
 */
export async function getAlerts(): Promise<Alert[]> {
  const now = new Date();
  const staleLimit = addDays(now, -20); // "sem KM recente" = mais de 20 dias

  const [
    kmVencida,
    kmPendente,
    linkExpirado,
    registroSuspeito,
    aguardandoConferencia,
    oleoProximo,
    oleoVencido,
    clienteSemTelefone,
    veiculoSemKm,
    activeContracts,
    frotaCorreia,
    principalCondutorNaoRevisado,
    principalCondutorRemover,
  ] = await Promise.all([
    prisma.contract.count({
      where: { status: "ATIVO", nextKmRequestDate: { lt: now } },
    }),
    prisma.kmRequest.count({
      where: {
        status: "ENVIADO",
        usedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
    }),
    prisma.kmRequest.count({
      where: { status: "ENVIADO", usedAt: null, expiresAt: { lt: now } },
    }),
    prisma.kmRecord.count({ where: { validationStatus: "SUSPEITO" } }),
    // Enviado pelo motorista mas ainda não conferido — e, portanto, a KM do
    // carro continua parada. É o alerta mais importante do ciclo: esquecer de
    // conferir congela óleo, correia e relatórios.
    prisma.kmRecord.count({ where: { appliedAt: null } }),
    prisma.vehicle.count({ where: { oilStatus: "AMARELO" } }),
    prisma.vehicle.count({ where: { oilStatus: "VERMELHO" } }),
    prisma.customer.count({
      where: { phone: null, contracts: { some: { status: "ATIVO" } } },
    }),
    prisma.vehicle.count({ where: { currentKm: 0, status: { not: "VENDIDO" } } }),
    prisma.contract.findMany({
      where: { status: "ATIVO" },
      include: { kmRecords: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    // A correia não tem status gravado no banco (é conta, não dado), então a
    // contagem sai de um cálculo em memória. Com uma frota de dezenas de
    // carros isso é uma consulta leve.
    prisma.vehicle.findMany({
      where: { status: { not: "VENDIDO" } },
      select: {
        currentKm: true,
        lastTimingBeltKm: true,
        timingBeltIntervalKm: true,
      },
    }),
    prisma.contract.count({
      where: { status: "ATIVO", principalCondutorConfirmado: null },
    }),
    // Contrato não é mais ativo, mas a pessoa ainda consta confirmada como
    // principal condutor — precisa ir tirar no DETRAN/SENATRAN.
    prisma.contract.count({
      where: { status: { not: "ATIVO" }, principalCondutorConfirmado: true },
    }),
  ]);

  const semKmRecente = activeContracts.filter((c) => {
    const last = c.kmRecords[0]?.createdAt ?? c.startDate;
    return last < staleLimit;
  }).length;

  const correias = frotaCorreia.map((v) =>
    calcularCorreia(v.currentKm, v.lastTimingBeltKm, v.timingBeltIntervalKm)
  );
  const correiaVencida = correias.filter((c) => c.status === "VENCIDA").length;
  const correiaProxima = correias.filter((c) => c.status === "PROXIMA").length;

  return [
    {
      key: "km_vencida",
      label: "KM quinzenal vencida",
      acao: `Cobrar a KM de ${plural(kmVencida, "motorista", "motoristas")} — a quinzena venceu`,
      count: kmVencida,
      severity: "danger",
      grupo: "Quilometragem",
      href: "/quilometragem",
    },
    {
      key: "km_a_conferir",
      label: "KM aguardando conferência",
      acao: `Conferir e efetivar ${plural(aguardandoConferencia, "registro", "registros")} — até lá a KM do carro não muda`,
      count: aguardandoConferencia,
      severity: "warning",
      grupo: "Quilometragem",
      href: "/quilometragem",
    },
    {
      key: "registro_suspeito",
      label: "Registros suspeitos",
      acao: `Revisar ${plural(registroSuspeito, "registro", "registros")} com leitura fora do padrão`,
      count: registroSuspeito,
      severity: "danger",
      grupo: "Quilometragem",
      href: "/quilometragem/registros",
    },
    {
      key: "link_expirado",
      label: "Links de KM expirados",
      acao: `Reenviar ${plural(linkExpirado, "link que expirou", "links que expiraram")}`,
      count: linkExpirado,
      severity: "warning",
      grupo: "Quilometragem",
      href: "/quilometragem",
    },
    {
      key: "km_pendente",
      label: "KM quinzenal pendente",
      acao: `${plural(kmPendente, "motorista", "motoristas")} com link em aberto, aguardando resposta`,
      count: kmPendente,
      severity: "warning",
      grupo: "Quilometragem",
      href: "/quilometragem",
    },
    {
      key: "sem_km_recente",
      label: "Contratos ativos sem KM recente",
      acao: `${plural(semKmRecente, "contrato ativo", "contratos ativos")} sem comprovação há mais de 20 dias`,
      count: semKmRecente,
      severity: "warning",
      grupo: "Quilometragem",
      href: "/quilometragem",
    },

    {
      key: "oleo_vencido",
      label: "Trocas de óleo vencidas",
      acao: `Trocar o óleo de ${plural(oleoVencido, "carro", "carros")} — já passou do ponto`,
      count: oleoVencido,
      severity: "danger",
      grupo: "Manutenção",
      href: "/oleo",
    },
    {
      key: "correia_vencida",
      label: "Correias dentadas vencidas",
      acao: `Trocar a correia de ${plural(correiaVencida, "carro", "carros")} — já passou do ponto`,
      count: correiaVencida,
      severity: "danger",
      grupo: "Manutenção",
      href: "/correia",
    },
    {
      key: "oleo_proximo",
      label: "Trocas de óleo próximas",
      acao: `${plural(oleoProximo, "carro", "carros")} com o óleo chegando no ponto`,
      count: oleoProximo,
      severity: "warning",
      grupo: "Manutenção",
      href: "/oleo",
    },
    {
      key: "correia_proxima",
      label: "Correias a trocar em breve",
      acao: `${plural(correiaProxima, "carro", "carros")} com a correia chegando no ponto`,
      count: correiaProxima,
      severity: "warning",
      grupo: "Manutenção",
      href: "/correia",
    },

    {
      key: "principal_condutor_remover",
      label: "Tirar como principal condutor",
      acao: `Tirar ${plural(principalCondutorRemover, "pessoa", "pessoas")} como principal condutor no DETRAN — já devolveram o carro`,
      count: principalCondutorRemover,
      severity: "danger",
      grupo: "Condutores",
      href: "/condutores",
    },
    {
      key: "principal_condutor_nao_revisado",
      label: "Principal condutor não revisado",
      acao: `Revisar o principal condutor de ${plural(principalCondutorNaoRevisado, "locação ativa", "locações ativas")}`,
      count: principalCondutorNaoRevisado,
      severity: "warning",
      grupo: "Condutores",
      href: "/condutores",
    },

    {
      key: "cliente_sem_telefone",
      label: "Clientes ativos sem telefone",
      acao: `Cadastrar o telefone de ${plural(clienteSemTelefone, "cliente ativo", "clientes ativos")} — sem ele não dá para enviar o link`,
      count: clienteSemTelefone,
      severity: "warning",
      grupo: "Cadastro",
      href: "/clientes",
    },
    {
      key: "veiculo_sem_km",
      label: "Veículos sem KM inicial",
      acao: `Informar a KM inicial de ${plural(veiculoSemKm, "veículo", "veículos")}`,
      count: veiculoSemKm,
      severity: "info",
      grupo: "Cadastro",
      href: "/veiculos",
    },
  ];
}

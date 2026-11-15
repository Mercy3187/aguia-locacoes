import { prisma } from "@/lib/prisma";
import { isPaid } from "@/lib/asaas";
import { EMPRESA } from "@/lib/empresa";

/** Um recebimento (pago ou em aberto) de locação, para o relatório detalhado. */
export type ItemRecebimento = {
  data: Date;
  valor: number;
  pago: boolean;
  descricao: string | null;
};

/** Uma manutenção concluída no período, para o relatório detalhado. */
export type ItemManutencao = {
  data: Date;
  tipo: string;
  descricao: string | null;
  pecas: number;
  maoDeObra: number;
  total: number;
};

/** Uma troca de óleo no período, para o relatório detalhado. */
export type ItemOleo = {
  data: Date;
  valor: number;
};

export type DetalheVeiculo = {
  recebimentos: ItemRecebimento[];
  manutencoes: ItemManutencao[];
  oleos: ItemOleo[];
};

export type LinhaVeiculo = {
  id: string;
  plate: string;
  modelo: string | null;
  motorista: string | null;
  /** Cobranças de locação efetivamente pagas no período. */
  recebido: number;
  /** Cobranças em aberto com vencimento no período. */
  aReceber: number;
  /** Manutenções concluídas no período (peça + mão de obra). */
  manutencao: number;
  /** Só a peça, dentro do total de manutenção acima. */
  pecas: number;
  /** Só a mão de obra, dentro do total de manutenção acima. */
  maoDeObra: number;
  /** Trocas de óleo no período. */
  oleo: number;
  /** Descontos dados ao motorista (carro parado). */
  descontos: number;
  /** recebido − manutenção − óleo */
  liquido: number;
  /** Cada recebimento, manutenção e óleo individualmente, para o relatório detalhado. */
  detalhe: DetalheVeiculo;
};

export type Fechamento = {
  inicio: Date;
  fim: Date;
  veiculos: LinhaVeiculo[];
  /** Soma da frota inteira no período. */
  totais: { recebido: number; aReceber: number; custos: number; liquido: number; carros: number };
};

/** Primeiro e último instante do mês (horário de Brasília). */
export function intervaloDoMes(ano: number, mes: number): { inicio: Date; fim: Date } {
  const mm = String(mes).padStart(2, "0");
  const inicio = new Date(`${ano}-${mm}-01T00:00:00-03:00`);
  const proximo = mes === 12 ? new Date(`${ano + 1}-01-01T00:00:00-03:00`) : new Date(`${ano}-${String(mes + 1).padStart(2, "0")}-01T00:00:00-03:00`);
  return { inicio, fim: new Date(proximo.getTime() - 1) };
}

/**
 * Remove o par "FATURAMENTO DE LOCAÇÃO" + "Cobrança gerada automaticamente a
 * partir de Pix recebido" quando caem no mesmo veículo, mesmo vencimento e
 * mesmo valor — é a MESMA cobrança registrada duas vezes no Asaas (a fatura
 * e um registro de conciliação do Pix), não duas receitas. Sem isso o
 * rendimento conta o aluguel da semana em dobro.
 */
function removerCobrancasDuplicadas<T extends { dueDate: Date; value: unknown; description: string | null }>(
  pagamentos: T[]
): T[] {
  const porChave = new Map<string, T[]>();
  for (const p of pagamentos) {
    const chave = `${p.dueDate.toISOString().slice(0, 10)}|${Number(p.value)}`;
    const arr = porChave.get(chave) ?? [];
    arr.push(p);
    porChave.set(chave, arr);
  }

  const resultado: T[] = [];
  for (const grupo of porChave.values()) {
    if (grupo.length === 1) {
      resultado.push(grupo[0]);
      continue;
    }
    const faturas = grupo.filter((p) => (p.description ?? "").includes("FATURAMENTO DE LOCAÇÃO"));
    const pixAuto = grupo.filter((p) =>
      (p.description ?? "").includes("Cobrança gerada automaticamente a partir de Pix recebido")
    );
    const outros = grupo.filter((p) => !faturas.includes(p) && !pixAuto.includes(p));
    // Descarta só a quantidade que tem par — se sobrar Pix sem fatura
    // correspondente, é receita de verdade e continua contando.
    const pixParaManter = pixAuto.slice(Math.min(faturas.length, pixAuto.length));
    resultado.push(...faturas, ...pixParaManter, ...outros);
  }
  return resultado;
}

/**
 * Fechamento por veículo num período arbitrário.
 *
 * Receita = cobranças de locação PAGAS no período (data de pagamento), mais as
 * quitadas manualmente aqui. Custo = manutenções concluídas e trocas de óleo
 * no período. O líquido é o que sobra por carro.
 *
 * `vehicleIds` filtra para um ou mais carros específicos — usado pela tela de
 * rendimento por veículo, que não precisa da frota inteira para responder
 * "quanto ESSES carros renderam nesse período". Vazio ou omitido = frota toda.
 */
export async function calcularRendimento(
  inicio: Date,
  fim: Date,
  vehicleIds?: string[]
): Promise<Fechamento> {
  const [veiculos, pagamentos] = await Promise.all([
    prisma.vehicle.findMany({
      where: {
        status: { not: "VENDIDO" },
        ...(vehicleIds && vehicleIds.length > 0 ? { id: { in: vehicleIds } } : {}),
      },
      select: {
        id: true,
        plate: true,
        model: true,
        contracts: {
          where: { status: "ATIVO" },
          select: { customer: { select: { name: true } } },
          take: 1,
        },
        maintenances: {
          where: { status: "CONCLUIDA", endAt: { gte: inicio, lte: fim } },
          select: {
            endAt: true,
            type: true,
            description: true,
            cost: true,
            partsCost: true,
            laborCost: true,
            downtimeDiscount: true,
          },
        },
        oilChanges: {
          where: { date: { gte: inicio, lte: fim } },
          select: { date: true, value: true },
        },
      },
      orderBy: { plate: "asc" },
    }),
    prisma.payment.findMany({
      where: {
        OR: [
          { paymentDate: { gte: inicio, lte: fim } },
          { dueDate: { gte: inicio, lte: fim } },
        ],
      },
      select: {
        value: true,
        status: true,
        dueDate: true,
        paymentDate: true,
        settledLocally: true,
        description: true,
        plate: true,
        // O carro vem pelo CONTRATO, não pela placa da descrição: quando o
        // motorista troca de veículo, uma fatura já emitida segue com a placa
        // antiga e a receita iria parar no carro errado.
        contract: { select: { vehicleId: true } },
      },
    }),
  ]);

  // Agrupa os pagamentos por veículo (contrato primeiro, placa como reserva).
  const porVeiculo = new Map<string, typeof pagamentos>();
  const idPorPlaca = new Map(veiculos.map((v) => [v.plate, v.id]));
  for (const p of pagamentos) {
    const vid = p.contract?.vehicleId ?? (p.plate ? idPorPlaca.get(p.plate) : undefined);
    if (!vid) continue;
    const arr = porVeiculo.get(vid) ?? [];
    arr.push(p);
    porVeiculo.set(vid, arr);
  }
  for (const [vid, lista] of porVeiculo) {
    porVeiculo.set(vid, removerCobrancasDuplicadas(lista));
  }

  const linhas: LinhaVeiculo[] = veiculos.map((v) => {
    let recebido = 0;
    let aReceber = 0;
    const recebimentos: ItemRecebimento[] = [];
    for (const p of porVeiculo.get(v.id) ?? []) {
      const valor = Number(p.value);
      const pago = p.settledLocally || isPaid(p.status);
      if (pago) {
        // Só conta como receita do mês se o pagamento caiu no mês.
        const quando = p.paymentDate ?? p.dueDate;
        if (quando >= inicio && quando <= fim) {
          recebido += valor;
          recebimentos.push({ data: quando, valor, pago: true, descricao: p.description });
        }
      } else if (p.dueDate >= inicio && p.dueDate <= fim) {
        aReceber += valor;
        recebimentos.push({ data: p.dueDate, valor, pago: false, descricao: p.description });
      }
    }
    recebimentos.sort((a, b) => a.data.getTime() - b.data.getTime());

    const manutencao = v.maintenances.reduce((s, m) => s + Number(m.cost ?? 0), 0);
    const pecas = v.maintenances.reduce((s, m) => s + Number(m.partsCost ?? 0), 0);
    const maoDeObra = v.maintenances.reduce((s, m) => s + Number(m.laborCost ?? 0), 0);
    const descontos = v.maintenances.reduce((s, m) => s + Number(m.downtimeDiscount ?? 0), 0);
    const oleo = v.oilChanges.reduce((s, o) => s + Number(o.value ?? 0), 0);

    const manutencoes: ItemManutencao[] = v.maintenances
      .map((m) => ({
        data: m.endAt as Date,
        tipo: m.type,
        descricao: m.description,
        pecas: Number(m.partsCost ?? 0),
        maoDeObra: Number(m.laborCost ?? 0),
        total: Number(m.cost ?? 0),
      }))
      .sort((a, b) => a.data.getTime() - b.data.getTime());

    const oleos: ItemOleo[] = v.oilChanges
      .map((o) => ({ data: o.date, valor: Number(o.value ?? 0) }))
      .sort((a, b) => a.data.getTime() - b.data.getTime());

    return {
      id: v.id,
      plate: v.plate,
      modelo: v.model,
      motorista: v.contracts[0]?.customer.name ?? null,
      recebido,
      aReceber,
      manutencao,
      pecas,
      maoDeObra,
      oleo,
      descontos,
      liquido: recebido - manutencao - oleo,
      detalhe: { recebimentos, manutencoes, oleos },
    };
  });

  const totais: Fechamento["totais"] = { recebido: 0, aReceber: 0, custos: 0, liquido: 0, carros: 0 };
  for (const l of linhas) {
    totais.recebido += l.recebido;
    totais.aReceber += l.aReceber;
    totais.custos += l.manutencao + l.oleo;
    totais.liquido += l.liquido;
    totais.carros++;
  }

  return { inicio, fim, veiculos: linhas, totais };
}

/** Fechamento do mês calendário — usado pela tela de Fechamento. */
export async function calcularFechamento(ano: number, mes: number): Promise<Fechamento> {
  const { inicio, fim } = intervaloDoMes(ano, mes);
  return calcularRendimento(inicio, fim);
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Resumo do fechamento formatado para mandar no WhatsApp. */
export function resumoFechamentoWhatsApp(f: Fechamento, mesLabel: string): string {
  const linhas = f.veiculos.filter((v) => v.recebido || v.manutencao || v.oleo);
  const t = f.totais;

  const out = [`*FECHAMENTO ${EMPRESA.nome.toUpperCase()} — ${mesLabel}*`, ""];

  for (const v of linhas) {
    const partes = [`recebido ${brl(v.recebido)}`];
    if (v.manutencao) partes.push(`manut. ${brl(v.manutencao)}`);
    if (v.oleo) partes.push(`óleo ${brl(v.oleo)}`);
    out.push(`• ${v.plate} — ${partes.join(" · ")} = *${brl(v.liquido)}*`);
  }

  out.push(
    "",
    `Recebido: ${brl(t.recebido)}`,
    `Custos: ${brl(t.custos)}`,
    `*Líquido: ${brl(t.liquido)}*`
  );
  if (t.aReceber > 0) out.push("", `_Ainda em aberto no mês: ${brl(t.aReceber)}_`);
  out.push("", EMPRESA.nome);
  return out.join("\n");
}

import ExcelJS from "exceljs";
import type { Fechamento } from "@/lib/fechamento";
import { EMPRESA } from "@/lib/empresa";

const MOEDA = '"R$" #,##0.00';
const COR_CABECALHO_CARRO = "FFDCE7F5";
const COR_VERDE = "FF15803D";
const COR_AMBAR = "FFB45309";
const COR_VERMELHO = "FFB91C1C";

type EventoDetalhado = {
  data: Date;
  tipo: "Recebimento" | "Manutenção" | "Óleo" | "Extra";
  descricao: string;
  recebido: number | null;
  peca: number | null;
  maoDeObra: number | null;
  oleo: number | null;
  /// Só preenchido pelo desconto mensal automático (ver `DescontoMensalDoRelatorio`) — NEGATIVO, porque desconta do Líquido igual manutenção e peça.
  extras: number | null;
  situacao: string;
};

/** Faixa de linhas, na aba Detalhado, onde ficam os eventos de um veículo (sempre existe — mesmo sem nenhum evento, cai na linha "Sem movimentação"). */
type FaixaVeiculo = { inicio: number; fim: number };

/**
 * Monta a planilha de rendimento por veículo para o período já calculado.
 *
 * Os totais (Recebido, Em aberto, Peças, Mão de obra, Óleo, Extras, Líquido)
 * são FÓRMULAS do Excel que somam as linhas da aba "Detalhado" — não números
 * fixos. Pedido do usuário: ele remove manualmente, na aba Detalhado,
 * cobranças que na verdade são acordo de multa/dívida e pode digitar algo na
 * coluna "Extras" — e quer
 * que o Resumo e o líquido de cada carro recalculem na hora, sem gerar o
 * relatório de novo.
 */
/** Um lançamento do "Controle de Retiradas" — data e valor, nada além disso. */
export type RetiradasDoRelatorio = {
  grupoNome: string;
  itens: { data: Date; valor: number }[];
};

/**
 * Desconto automático lançado no último dia de cada mês do período, POR
 * VEÍCULO do grupo — entra na coluna "Extras" do Detalhado como valor
 * NEGATIVO (desconta do Líquido, igual manutenção e peça — pedido do
 * usuário em 2026-10-23, não é um bônus). `vencimentos` já vem filtrado
 * para o período do relatório.
 */
export type DescontoMensalDoRelatorio = {
  label: string;
  valorPorVencimento: number;
  vencimentos: Date[];
};

export async function gerarPlanilhaRendimento(
  f: Fechamento,
  periodoLabel: string,
  retiradas?: RetiradasDoRelatorio,
  descontoMensal?: DescontoMensalDoRelatorio
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = EMPRESA.nome;
  wb.created = new Date();

  // Criado primeiro para ficar como a aba da esquerda, mas só é preenchido
  // depois de montar a aba Detalhado — as fórmulas do Resumo apontam para
  // linhas específicas de lá, e essas linhas só existem depois de montá-la.
  const ws = wb.addWorksheet("Resumo", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  const faixas = montarAbaDetalhada(wb, f, periodoLabel, retiradas, descontoMensal);

  ws.mergeCells("A1:K1");
  const titulo = ws.getCell("A1");
  titulo.value = `Rendimento por veículo — ${periodoLabel}`;
  titulo.font = { bold: true, size: 13 };

  const colunas = [
    { header: "Placa", key: "placa", width: 12 },
    { header: "Veículo", key: "modelo", width: 22 },
    { header: "Motorista atual", key: "motorista", width: 22 },
    { header: "Recebido", key: "recebido", width: 15 },
    { header: "Em aberto", key: "aReceber", width: 14 },
    { header: "Peças", key: "pecas", width: 13 },
    { header: "Mão de obra", key: "maoDeObra", width: 14 },
    { header: "Manutenção (total)", key: "manutencao", width: 17 },
    { header: "Óleo", key: "oleo", width: 12 },
    { header: "Extras", key: "extras", width: 13 },
    { header: "Líquido", key: "liquido", width: 15 },
  ];
  ws.columns = colunas.map((c) => ({ key: c.key, width: c.width }));
  const col = (key: string) => colunas.findIndex((c) => c.key === key) + 1;
  const letra = (key: string) => String.fromCharCode(64 + col(key)); // só vai até K, não precisa de AA

  const headerRow = ws.getRow(2);
  colunas.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    cell.alignment = { vertical: "middle" };
  });
  headerRow.height = 20;

  const moedaCols = ["recebido", "aReceber", "pecas", "maoDeObra", "manutencao", "oleo", "extras", "liquido"];

  const primeiraLinhaDados = 3;
  f.veiculos.forEach((v, i) => {
    const faixa = faixas[i];
    const row = ws.addRow({
      placa: v.plate,
      modelo: v.modelo ?? "—",
      motorista: v.motorista ?? "—",
    });
    const linha = row.number;

    row.getCell(col("recebido")).value = {
      formula: `SUMIFS(Detalhado!D${faixa.inicio}:D${faixa.fim},Detalhado!I${faixa.inicio}:I${faixa.fim},"Pago")`,
    };
    row.getCell(col("aReceber")).value = {
      formula: `SUMIFS(Detalhado!D${faixa.inicio}:D${faixa.fim},Detalhado!I${faixa.inicio}:I${faixa.fim},"Em aberto")`,
    };
    row.getCell(col("pecas")).value = { formula: `SUM(Detalhado!E${faixa.inicio}:E${faixa.fim})` };
    row.getCell(col("maoDeObra")).value = { formula: `SUM(Detalhado!F${faixa.inicio}:F${faixa.fim})` };
    row.getCell(col("oleo")).value = { formula: `SUM(Detalhado!G${faixa.inicio}:G${faixa.fim})` };
    row.getCell(col("extras")).value = { formula: `SUM(Detalhado!H${faixa.inicio}:H${faixa.fim})` };
    // Manutenção (total) = peça + mão de obra desta mesma linha.
    row.getCell(col("manutencao")).value = { formula: `${letra("pecas")}${linha}+${letra("maoDeObra")}${linha}` };
    // Líquido = Recebido − Manutenção − Óleo + Extras, lido das células desta
    // mesma linha — se o usuário editar qualquer uma na mão, recalcula direto.
    row.getCell(col("liquido")).value = {
      formula: `${letra("recebido")}${linha}-${letra("manutencao")}${linha}-${letra("oleo")}${linha}+${letra("extras")}${linha}`,
    };

    for (const key of moedaCols) {
      row.getCell(col(key)).numFmt = MOEDA;
    }
  });
  const ultimaLinhaDados = primeiraLinhaDados + f.veiculos.length - 1;

  // Vermelho quando o líquido fica negativo — por fórmula de formatação
  // condicional, não checagem fixa, porque o valor pode mudar depois que o
  // usuário editar a aba Detalhado.
  ws.addConditionalFormatting({
    ref: `${letra("liquido")}${primeiraLinhaDados}:${letra("liquido")}${ultimaLinhaDados}`,
    rules: [
      {
        type: "cellIs",
        operator: "lessThan",
        formulae: ["0"],
        style: { font: { color: { argb: COR_VERMELHO }, bold: true } },
        priority: 1,
      },
    ],
  });

  // Linha de total, só quando há mais de um veículo — com um só, o total
  // repetiria a própria linha e não ajudaria em nada.
  if (f.veiculos.length > 1) {
    const totalRow = ws.addRow({ placa: "TOTAL", modelo: "", motorista: "" });
    for (const key of moedaCols) {
      totalRow.getCell(col(key)).value = {
        formula: `SUM(${letra(key)}${primeiraLinhaDados}:${letra(key)}${ultimaLinhaDados})`,
      };
      totalRow.getCell(col(key)).numFmt = MOEDA;
    }
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
      cell.border = { top: { style: "thin" } };
    });
  }

  return wb.xlsx.writeBuffer();
}

/**
 * Aba "Detalhado": por veículo, UMA lista só — recebimento, manutenção e óleo
 * juntos, em ordem cronológica — em vez de blocos separados. Peça e mão de
 * obra têm coluna própria (não ficam só no texto) para o Resumo poder somar
 * cada uma por fórmula. "Extras" fica sempre em branco — é pro usuário
 * digitar na mão algo que não veio do sistema (ex.: um ajuste qualquer) e
 * ainda assim entrar na conta do carro.
 *
 * Devolve, na mesma ordem de `f.veiculos`, a faixa de linhas de cada carro —
 * o Resumo usa essas linhas para somar por fórmula em vez de número fixo.
 */
function montarAbaDetalhada(
  wb: ExcelJS.Workbook,
  f: Fechamento,
  periodoLabel: string,
  retiradas?: RetiradasDoRelatorio,
  descontoMensal?: DescontoMensalDoRelatorio
): FaixaVeiculo[] {
  const ws = wb.addWorksheet("Detalhado", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const colunas = [
    { key: "data", width: 22 },
    { key: "tipo", width: 14 },
    { key: "descricao", width: 34 },
    { key: "recebido", width: 13 },
    { key: "peca", width: 12 },
    { key: "maoDeObra", width: 13 },
    { key: "oleo", width: 12 },
    { key: "extras", width: 12 },
    { key: "situacao", width: 14 },
  ];
  ws.columns = colunas.map((c) => ({ key: c.key, width: c.width }));

  ws.mergeCells("A1:I1");
  const titulo = ws.getCell("A1");
  titulo.value = `Rendimento detalhado por veículo — ${periodoLabel}`;
  titulo.font = { bold: true, size: 13 };
  ws.getRow(1).height = 22;

  const fmtData = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  // Faz a conta em horário de Brasília (o banco grava em UTC); Brasil não
  // tem horário de verão desde 2019, então subtrair 3h direto é seguro.
  const paraBR = (d: Date) => new Date(d.getTime() - 3 * 60 * 60 * 1000);

  /**
   * Chave da semana REAL (segunda a domingo, em horário de Brasília) a que
   * `d` pertence — ex.: "2026-08-10..." para qualquer dia entre a segunda
   * 10/08 e o domingo 16/08. Usada para agrupar, não para exibir.
   */
  const segundaDaSemana = (d: Date): string => {
    const br = paraBR(d);
    const diaSemana = br.getUTCDay(); // 0 = domingo, 1 = segunda, ... 6 = sábado
    const voltarAteSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
    const segunda = new Date(
      Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate() - voltarAteSegunda, 3, 0, 0)
    );
    return segunda.toISOString();
  };

  /**
   * Semana de cada evento: numera em ordem cronológica, SEM REINICIAR em
   * nenhum ponto do período do relatório, as semanas REAIS (segunda a
   * domingo) em que o carro teve movimentação — a semana do 1º evento do
   * carro no período é "Semana 1", a semana real seguinte com movimentação
   * é "Semana 2" e assim por diante.
   *
   * Antes isso reiniciava a cada "ciclo de fechamento" (dia 10 de um mês ao
   * dia 10 do seguinte), e o dia 10 quase nunca cai numa segunda-feira. O
   * reinício no meio do período fazia duas semanas reais DIFERENTES e sem
   * relação nenhuma entre si (uma antes do dia 10, outra depois) aparecerem
   * como "Semana 1" a poucos dias de distância — parecendo pagamento
   * duplicado quando na verdade eram ciclos diferentes. Numerar uma vez só,
   * sem reiniciar, elimina esse reinício: cada número aparece em UMA única
   * semana real, do início ao fim do relatório.
   *
   * Dois eventos na mesma semana real (ex.: o faturamento normal de segunda
   * + uma cobrança avulsa de dívida caindo no mesmo dia) ficam com o mesmo
   * número, de propósito — é a mesma semana.
   */
  const numerarSemanasPorCarro = (eventosCarro: { data: Date }[]): Map<{ data: Date }, number> => {
    const semanasReais = Array.from(new Set(eventosCarro.map((ev) => segundaDaSemana(ev.data)))).sort();
    const indicePorSemana = new Map(semanasReais.map((chave, i) => [chave, i + 1]));
    const resultado = new Map<{ data: Date }, number>();
    for (const ev of eventosCarro) resultado.set(ev, indicePorSemana.get(segundaDaSemana(ev.data))!);
    return resultado;
  };

  const faixas: FaixaVeiculo[] = [];
  const linhasTotalLiquido: number[] = [];

  for (const v of f.veiculos) {
    ws.addRow({});

    const cabecalhoCarro = ws.addRow({});
    ws.mergeCells(`A${cabecalhoCarro.number}:I${cabecalhoCarro.number}`);
    const celulaCarro = cabecalhoCarro.getCell(1);
    celulaCarro.value = `${v.plate} — ${v.modelo ?? "sem modelo"}  |  Motorista: ${
      v.motorista ?? "sem locação"
    }`;
    celulaCarro.font = { bold: true, size: 12 };
    celulaCarro.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_CABECALHO_CARRO } };
    cabecalhoCarro.height = 20;

    const eventos: EventoDetalhado[] = [
      ...v.detalhe.recebimentos.map((r): EventoDetalhado => ({
        data: r.data,
        tipo: "Recebimento",
        descricao: r.descricao ?? "Mensalidade",
        recebido: r.valor,
        peca: null,
        maoDeObra: null,
        oleo: null,
        extras: null,
        situacao: r.pago ? "Pago" : "Em aberto",
      })),
      ...v.detalhe.manutencoes.map((m): EventoDetalhado => ({
        data: m.data,
        tipo: "Manutenção",
        descricao: m.descricao ? `${m.tipo} — ${m.descricao}` : m.tipo,
        recebido: null,
        peca: m.pecas,
        maoDeObra: m.maoDeObra,
        oleo: null,
        extras: null,
        situacao: "Concluída",
      })),
      ...v.detalhe.oleos.map((o): EventoDetalhado => ({
        data: o.data,
        tipo: "Óleo",
        descricao: "Troca de óleo",
        recebido: null,
        peca: null,
        maoDeObra: null,
        oleo: o.valor,
        extras: null,
        situacao: "—",
      })),
      // Desconto mensal automático (ex.: R$500 no fim de cada mês) — valor
      // NEGATIVO na coluna Extras, desconta do Líquido como manutenção/peça.
      ...(descontoMensal?.vencimentos ?? []).map((data): EventoDetalhado => ({
        data,
        tipo: "Extra",
        descricao: descontoMensal!.label,
        recebido: null,
        peca: null,
        maoDeObra: null,
        oleo: null,
        extras: -descontoMensal!.valorPorVencimento,
        situacao: "Descontado",
      })),
    ].sort((a, b) => a.data.getTime() - b.data.getTime());

    let faixa: FaixaVeiculo;

    if (eventos.length === 0) {
      const semNada = ws.addRow({
        data: "",
        tipo: "",
        descricao: "Sem movimentação no período.",
        recebido: "",
        peca: "",
        maoDeObra: "",
        oleo: "",
        extras: "",
        situacao: "",
      });
      semNada.getCell(3).font = { italic: true, color: { argb: "FF6B7280" } };
      // Mesmo sem evento nenhum, a linha conta como faixa de 1 — assim, se o
      // usuário digitar algo em "Extras" aqui, ainda entra na conta do carro.
      faixa = { inicio: semNada.number, fim: semNada.number };
    } else {
      const cabecalho = ws.addRow({
        data: "Data",
        tipo: "Tipo",
        descricao: "Descrição",
        recebido: "Recebido",
        peca: "Peça",
        maoDeObra: "Mão de obra",
        oleo: "Óleo",
        extras: "Extras",
        situacao: "Situação",
      });
      cabecalho.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      });

      const semanaDoEvento = numerarSemanasPorCarro(eventos);
      const inicio = cabecalho.number + 1;
      for (const ev of eventos) {
        const row = ws.addRow({
          data: `${fmtData(ev.data)} - Semana ${semanaDoEvento.get(ev)}`,
          tipo: ev.tipo,
          descricao: ev.descricao,
          recebido: ev.recebido ?? "",
          peca: ev.peca ?? "",
          maoDeObra: ev.maoDeObra ?? "",
          oleo: ev.oleo ?? "",
          extras: ev.extras ?? "",
          situacao: ev.situacao,
        });
        if (ev.recebido != null) row.getCell(4).numFmt = MOEDA;
        if (ev.peca != null) row.getCell(5).numFmt = MOEDA;
        if (ev.maoDeObra != null) row.getCell(6).numFmt = MOEDA;
        if (ev.oleo != null) row.getCell(7).numFmt = MOEDA;
        if (ev.extras != null) row.getCell(8).numFmt = MOEDA;
        if (ev.situacao === "Pago") row.getCell(9).font = { color: { argb: COR_VERDE }, bold: true };
        if (ev.situacao === "Em aberto") row.getCell(9).font = { color: { argb: COR_AMBAR }, bold: true };
        if (ev.tipo === "Extra") row.getCell(8).font = { color: { argb: COR_VERMELHO }, bold: true };
      }
      faixa = { inicio, fim: inicio + eventos.length - 1 };
    }
    faixas.push(faixa);

    // "Total" soma, por fórmula, só as linhas deste carro, acima — apagar,
    // editar ou completar "Extras" numa delas recalcula na hora. O líquido
    // reaproveita a coluna Situação para mostrar o resultado.
    const totalRow = ws.addRow({ data: "", tipo: "", descricao: "Total" });
    // Só "Pago" conta como recebido — "Em aberto" é cobrança que ainda não
    // caiu, não pode entrar na soma como se já tivesse recebido.
    totalRow.getCell(4).value = {
      formula: `SUMIFS(D${faixa.inicio}:D${faixa.fim},I${faixa.inicio}:I${faixa.fim},"Pago")`,
    };
    totalRow.getCell(5).value = { formula: `SUM(E${faixa.inicio}:E${faixa.fim})` };
    totalRow.getCell(6).value = { formula: `SUM(F${faixa.inicio}:F${faixa.fim})` };
    totalRow.getCell(7).value = { formula: `SUM(G${faixa.inicio}:G${faixa.fim})` };
    totalRow.getCell(8).value = { formula: `SUM(H${faixa.inicio}:H${faixa.fim})` };
    // Líquido = Recebido − Peça − Mão de obra − Óleo + Extras, desta linha.
    totalRow.getCell(9).value = {
      formula: `D${totalRow.number}-E${totalRow.number}-F${totalRow.number}-G${totalRow.number}+H${totalRow.number}`,
    };
    for (const n of [4, 5, 6, 7, 8, 9]) totalRow.getCell(n).numFmt = MOEDA;
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
      cell.border = { top: { style: "thin" } };
    });
    linhasTotalLiquido.push(totalRow.number);
  }

  if (linhasTotalLiquido.length > 0) {
    ws.addConditionalFormatting({
      ref: linhasTotalLiquido.map((l) => `I${l}`).join(" "),
      rules: [
        {
          type: "cellIs",
          operator: "lessThan",
          formulae: ["0"],
          style: { font: { color: { argb: COR_VERMELHO }, bold: true } },
          priority: 1,
        },
      ],
    });
  }

  if (retiradas) {
    montarBlocoRetiradas(ws, retiradas, periodoLabel);
    // Resumo por veículo logo abaixo das retiradas — não tem relação com o
    // desconto mensal, é só o resultado (Líquido) de cada carro do grupo,
    // igual ajustado pelo usuário em 2026-10-23.
    montarBlocoResultadoPorVeiculo(ws, f, periodoLabel);
  }

  return faixas;
}

/**
 * Bloco "Controle de Retiradas" — data e valor, do grupo inteiro (não de um
 * carro específico). Fica SEMPRE por último na aba Detalhado, depois de
 * todos os veículos. É informativo: o Total aqui é fórmula (SUM), mas não
 * entra na conta do Líquido de nenhum carro nem do grupo — decisão do
 * usuário em 2026-10-23, porque a retirada não é custo do carro.
 */
function montarBlocoRetiradas(
  ws: ExcelJS.Worksheet,
  retiradas: RetiradasDoRelatorio,
  periodoLabel: string
) {
  ws.addRow({});

  const cabecalhoBloco = ws.addRow({});
  ws.mergeCells(`A${cabecalhoBloco.number}:I${cabecalhoBloco.number}`);
  const celulaBloco = cabecalhoBloco.getCell(1);
  celulaBloco.value = `Controle de Retiradas — ${retiradas.grupoNome} — ${periodoLabel}`;
  celulaBloco.font = { bold: true, size: 12 };
  celulaBloco.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_CABECALHO_CARRO } };
  cabecalhoBloco.height = 20;

  const cabecalho = ws.addRow({ data: "Data", tipo: "Valor" });
  cabecalho.getCell(1).font = { bold: true };
  cabecalho.getCell(2).font = { bold: true };
  cabecalho.eachCell((cell, colNumber) => {
    if (colNumber > 2) return;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  });

  if (retiradas.itens.length === 0) {
    const semNada = ws.addRow({ descricao: "Nenhuma retirada no período." });
    semNada.getCell(3).font = { italic: true, color: { argb: "FF6B7280" } };
    return;
  }

  const inicio = cabecalho.number + 1;
  for (const item of retiradas.itens) {
    const row = ws.addRow({});
    row.getCell(1).value = item.data;
    row.getCell(1).numFmt = "dd/mm/yyyy";
    row.getCell(2).value = item.valor;
    row.getCell(2).numFmt = MOEDA;
  }
  const fim = inicio + retiradas.itens.length - 1;

  const totalRow = ws.addRow({});
  totalRow.getCell(1).value = "Total";
  totalRow.getCell(1).font = { bold: true };
  totalRow.getCell(2).value = { formula: `SUM(B${inicio}:B${fim})` };
  totalRow.getCell(2).numFmt = MOEDA;
  totalRow.getCell(2).font = { bold: true };
  totalRow.eachCell((cell, colNumber) => {
    if (colNumber > 2) return;
    cell.border = { top: { style: "thin" } };
  });
}

/**
 * Resumo por veículo — Placa | Veículo | Valor, uma linha por carro do
 * grupo, com o total embaixo. Fica logo depois do Controle de Retiradas.
 * SEM relação com o desconto mensal (correção do usuário em 2026-10-23: a
 * primeira versão misturou os dois) — "Valor" é o resultado (Líquido) de
 * cada carro, lido por fórmula direto da aba Resumo (já soma Recebido,
 * Manutenção, Óleo e Extras daquele carro, incluindo o desconto mensal se
 * houver) — recalcula se o usuário editar algo na mão.
 */
function montarBlocoResultadoPorVeiculo(ws: ExcelJS.Worksheet, f: Fechamento, periodoLabel: string) {
  ws.addRow({});

  const cabecalhoBloco = ws.addRow({});
  ws.mergeCells(`A${cabecalhoBloco.number}:I${cabecalhoBloco.number}`);
  const celulaBloco = cabecalhoBloco.getCell(1);
  celulaBloco.value = `Resultado por veículo — ${periodoLabel}`;
  celulaBloco.font = { bold: true, size: 12 };
  celulaBloco.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_CABECALHO_CARRO } };
  cabecalhoBloco.height = 20;

  const cabecalho = ws.addRow({ data: "Placa", tipo: "Veículo", descricao: "Valor" });
  cabecalho.eachCell((cell, colNumber) => {
    if (colNumber > 3) return;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  });

  const inicio = cabecalho.number + 1;
  f.veiculos.forEach((v, i) => {
    const row = ws.addRow({});
    row.getCell(1).value = v.plate;
    row.getCell(2).value = v.modelo ?? "—";
    // Mesma ordem de linhas da aba Resumo (começa na linha 3) — carro i aqui
    // é o mesmo carro i de lá.
    row.getCell(3).value = { formula: `Resumo!K${3 + i}` };
    row.getCell(3).numFmt = MOEDA;
  });
  const fim = inicio + f.veiculos.length - 1;

  const totalRow = ws.addRow({});
  totalRow.getCell(1).value = "Total";
  totalRow.getCell(1).font = { bold: true };
  totalRow.getCell(3).value = { formula: `SUM(C${inicio}:C${fim})` };
  totalRow.getCell(3).numFmt = MOEDA;
  totalRow.getCell(3).font = { bold: true };
  totalRow.eachCell((cell, colNumber) => {
    if (colNumber > 3) return;
    cell.border = { top: { style: "thin" } };
  });
}

/** Nome de arquivo seguro a partir do período e do filtro de veículo(s). */
export function nomeArquivoRendimento(periodoSlug: string, placas: string[] = []): string {
  let base = "rendimento-frota";
  if (placas.length === 1) {
    base = `rendimento-${placas[0].toLowerCase()}`;
  } else if (placas.length > 1 && placas.length <= 4) {
    base = `rendimento-${placas.map((p) => p.toLowerCase()).join("-")}`;
  } else if (placas.length > 4) {
    base = `rendimento-${placas.length}-veiculos`;
  }
  return `${base}-${periodoSlug}.xlsx`;
}

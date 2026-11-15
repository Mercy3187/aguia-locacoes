/**
 * Testa a leitura do relatório do SENATRAN importando o módulo REAL do sistema
 * (src/lib/multas-senatran.ts), com trechos copiados dos PDFs de verdade.
 *
 * Uso: npx tsx dev-tools\testar-multas-senatran.mts
 */
import { lerRelatorioSenatran, formatarPlaca } from "../src/lib/multas-senatran";

let falhas = 0;
function confere(nome: string, ok: boolean, detalhe: string) {
  if (!ok) falhas++;
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}  (${detalhe})`);
}

// ── Texto real, com o caractere invisível que quebrou a primeira versão ──
// O  entre o auto e o valor é um ícone da fonte do portal. Ele está aqui
// de propósito: sem a limpeza, esta multa some da leitura sem erro nenhum.
const UM = `Infrações do Veículo
 CHEV/PRISMA 10MT JOYE - Placa QYB0G99
NÃO PAGAS - VENCIDAS (1)
TOTAL DE REGISTROS ENCONTRADOS: 1
 26/03/2026 11:21 - ESTACIONAR IMPEDINDO A MOVIMENTACAO DE OUTRO VEICULO
Placa: QYB0G99
Auto de Infração: OD00235488  R$ 130,16
Exibir: 1-1 de 1 itens`;

const r1 = lerRelatorioSenatran(UM);
confere("lê a multa apesar do caractere invisível", r1.multas.length === 1, `${r1.multas.length}`);
confere("total declarado pelo portal", r1.totalDeclarado === 1, String(r1.totalDeclarado));
confere("placa do cabeçalho", r1.placaDoRelatorio === "QYB-0G99", String(r1.placaDoRelatorio));

const m = r1.multas[0];
if (m) {
  confere("placa formatada como no cadastro", m.placa === "QYB-0G99", m.placa);
  confere("auto de infração", m.auto === "OD00235488", m.auto);
  confere("valor", m.valor === 130.16, String(m.valor));
  confere("data e hora", m.ocorridaEmTexto === "26/03/2026 11:21", m.ocorridaEmTexto);
  confere(
    "hora no fuso local (não vira o dia)",
    m.ocorridaEm.getDate() === 26 && m.ocorridaEm.getHours() === 11,
    m.ocorridaEm.toString().slice(0, 24)
  );
  confere(
    "descrição sem o cabeçalho colado",
    m.descricao === "ESTACIONAR IMPEDINDO A MOVIMENTACAO DE OUTRO VEICULO",
    m.descricao.slice(0, 40)
  );
}

// ── Descrição que quebra em duas linhas (caso real do PCA3F28) ──
const QUEBRADA = `TOTAL DE REGISTROS ENCONTRADOS: 2
 25/11/2025 11:48 - AVANCAR O SINAL VERMELHO DO SEMAFORO EXC ONDE HOUVER SINALIZACAO QUE PERM LIVRE CONV A
DIREITA
Placa: PCA3F28
Auto de Infração: ID06506280  R$ 293,47
 25/11/2025 11:47 - EXECUTAR OPERACAO DE CONVERSAO A DIREITA EM LOCAL PROIBIDO PELA SINALIZACAO
Placa: PCA3F28
Auto de Infração: ID06506279  R$ 195,23`;

const r2 = lerRelatorioSenatran(QUEBRADA);
confere("lê as duas do relatório", r2.multas.length === 2, String(r2.multas.length));
confere(
  "junta a descrição quebrada em duas linhas",
  r2.multas[0]?.descricao.endsWith("LIVRE CONV A DIREITA") ?? false,
  r2.multas[0]?.descricao.slice(-30) ?? "—"
);
confere(
  "valor com centavos diferentes",
  r2.multas[0]?.valor === 293.47 && r2.multas[1]?.valor === 195.23,
  `${r2.multas[0]?.valor} / ${r2.multas[1]?.valor}`
);

// ── Multa repetida entre dois relatórios (períodos que se sobrepõem) ──
const REPETIDA = UM + "\n" + UM;
const r3 = lerRelatorioSenatran(REPETIDA);
confere(
  "o mesmo auto não é contado duas vezes",
  r3.multas.length === 1,
  `${r3.multas.length} multa(s)`
);

// ── Valor acima de mil, com ponto de milhar ──
const MIL = `TOTAL DE REGISTROS ENCONTRADOS: 1
 01/02/2026 06:27 - DIRIGIR SOB INFLUENCIA DE ALCOOL
Placa: PIZ9I18
Auto de Infração: XX00000001  R$ 2.934,70`;
const r4 = lerRelatorioSenatran(MIL);
confere("valor com milhar", r4.multas[0]?.valor === 2934.7, String(r4.multas[0]?.valor));

// ── Data impossível não pode virar outra data ──
const INVALIDA = `TOTAL DE REGISTROS ENCONTRADOS: 1
 31/02/2026 10:00 - INFRACAO QUALQUER
Placa: PIZ9I18
Auto de Infração: YY00000002  R$ 130,16`;
const r5 = lerRelatorioSenatran(INVALIDA);
confere(
  "31/02 é descartada em vez de virar 03/03",
  r5.multas.length === 0,
  `${r5.multas.length} multa(s)`
);

// ── Relatório vazio ──
const VAZIO = `Infrações do Veículo
 FIAT/MOBI LIKE - Placa PIZ9I18
TOTAL DE REGISTROS ENCONTRADOS: 0`;
const r6 = lerRelatorioSenatran(VAZIO);
confere("relatório sem multa nenhuma", r6.multas.length === 0 && r6.totalDeclarado === 0, "0");

// ── Formatação de placa ──
confere("placa Mercosul", formatarPlaca("QYB0G99") === "QYB-0G99", formatarPlaca("QYB0G99"));
confere("placa já com hífen", formatarPlaca("PCA-3F28") === "PCA-3F28", formatarPlaca("PCA-3F28"));

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);

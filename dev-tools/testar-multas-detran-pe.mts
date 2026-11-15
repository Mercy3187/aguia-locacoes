/**
 * Testa a leitura da seção MULTAS do DETRAN-PE importando o módulo REAL do
 * sistema (src/lib/multas-detran-pe.ts), com o texto copiado do print real
 * que o usuário mandou em 2026-10-24 (tela "Ver detalhes" → "Débitos" de um
 * veículo da empresa).
 *
 * Uso: npx tsx dev-tools\testar-multas-detran-pe.mts
 */
import { lerDebitosDetranPe } from "../src/lib/multas-detran-pe";

let falhas = 0;
function confere(nome: string, ok: boolean, detalhe: string) {
  if (!ok) falhas++;
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}  (${detalhe})`);
}

// ── Texto real da tela (print de 2026-10-24) — 3 multas, com as variações
// de formatação reais: descrição colada direto em "Data:" (sem espaço) e
// com espaço, e um "Local" que tem hífen DENTRO do próprio endereço. ──
const PAGINA = `MULTAS

ÓRGÃO AUTUANTE (competência): OLINDA
GRUPO: DTR - PREFEITURA DE OLINDA

Ag.Autuador:OLINDA - ELETRONICO

Cota: ÚNICA Vencimento: 31/07/2026 R$: 201,41

Lote: 0000047961 Ag.Autuador: 224910 Serie: VD Auto: 000158834-5 Infracao: 5568-0 ESTACIONAR LOCAL/HORARIO DE ESTACIONAMENTO E PARADA PROIBIDOS PELA SINALIZACAOData: 08/02/2026 09:23:00 Local: AVENIDA SIGISMUNDO GONCALVES OPOSTO AO NUMERO 1002 OLINDA - Amparo Legal: Art. 181, Inc. XIX

ÓRGÃO AUTUANTE (competência): DNIT
GRUPO: DNIT

Ag.Autuador:DNIT

Cota: ÚNICA Vencimento: 26/05/2026 R$: 274,65

Lote: 0000000019 Ag.Autuador: 000300 Serie: DN Auto: 004432448-0 Infracao: 5002-0 MULTA POR NAO IDENTIFICACAO DO CONDUTOR INFRATOR IMPOSTA A PESSOA JURIDICAData: 12/11/2025 09:00:00 Local: SAN, QD 3 BL A - ED NUCLEO DOS BRASILIA - Amparo Legal: Art.257, § 8º Auto RENAINF - N002610859

Ag.Autuador:DNIT

Cota: ÚNICA Vencimento: 22/04/2026 R$: 208,07

Lote: 0000000019 Ag.Autuador: 000300 Serie: DN Auto: 004414513-6 Infracao: 7463-0 TRANSITAR EM VELOCIDADE SUPERIOR A MAXIMA PERMITIDA EM MAIS DE 20% ATE 50% Data: 22/10/2025 13:47:00 Local: BR101 KM 72,600 RECIFE - Amparo Legal: Art. 218, Inc. II Auto RENAINF - S047509964 Velocidade da via: 0050 Aferida: 0074 Considerada: Equipamento: Data Afericao:`;

const r1 = lerDebitosDetranPe(PAGINA, "RVR3G20");
confere("lê as 3 multas da página", r1.length === 3, String(r1.length));

const [m1, m2, m3] = r1;

confere("auto da 1ª (OLINDA)", m1?.auto === "000158834-5", m1?.auto ?? "—");
confere("valor da 1ª", m1?.valor === 201.41, String(m1?.valor));
confere(
  "descrição da 1ª, mesmo colada em Data: sem espaço",
  m1?.descricao === "ESTACIONAR LOCAL/HORARIO DE ESTACIONAMENTO E PARADA PROIBIDOS PELA SINALIZACAO",
  m1?.descricao ?? "—"
);
confere("data/hora da 1ª", m1?.ocorridaEmTexto === "08/02/2026 09:23:00", m1?.ocorridaEmTexto ?? "—");
confere(
  "hora com segundos não quebra o fuso local",
  m1?.ocorridaEm.getDate() === 8 && m1?.ocorridaEm.getHours() === 9 && m1?.ocorridaEm.getMinutes() === 23,
  m1?.ocorridaEm.toString().slice(0, 24) ?? "—"
);
confere("placa formatada vem de fora, não do texto", m1?.placa === "RVR-3G20", m1?.placa ?? "—");

confere("auto da 2ª (DNIT, não identificação)", m2?.auto === "004432448-0", m2?.auto ?? "—");
confere("valor da 2ª", m2?.valor === 274.65, String(m2?.valor));
confere(
  'Local com hífen DENTRO do endereço não corta a descrição errado (ancorado em "Amparo Legal:")',
  m2?.descricao === "MULTA POR NAO IDENTIFICACAO DO CONDUTOR INFRATOR IMPOSTA A PESSOA JURIDICA",
  m2?.descricao ?? "—"
);

confere("auto da 3ª, com espaço antes de Data:", m3?.auto === "004414513-6", m3?.auto ?? "—");
confere("valor da 3ª", m3?.valor === 208.07, String(m3?.valor));
confere("data/hora da 3ª", m3?.ocorridaEmTexto === "22/10/2025 13:47:00", m3?.ocorridaEmTexto ?? "—");

// ── Mesma página lida duas vezes (ex.: usuário roda de novo) não duplica ──
const r2 = lerDebitosDetranPe(PAGINA + "\n" + PAGINA, "RVR3G20");
confere("lê a mesma página duas vezes sem duplicar", r2.length === 3, String(r2.length));

// ── Página sem nenhuma multa ──
const r3 = lerDebitosDetranPe("MULTAS\n\nNada consta.", "OYY7J41");
confere("página sem multa nenhuma", r3.length === 0, String(r3.length));

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);

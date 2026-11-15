/**
 * Leitura da seção "MULTAS" da tela "Detalhamento de débitos" do DETRAN-PE
 * — puro, sem navegador e sem banco (veja `dev-tools/testar-multas-detran-
 * pe.mts`). Recebe o TEXTO já extraído da página (igual `multas-senatran.ts`
 * recebe o texto do PDF) e devolve as multas no mesmo formato (`MultaLida`),
 * pra reaproveitar `multas-responsavel.ts` sem adaptação nenhuma.
 *
 * ── O formato ──
 * Acessado pela aba "Débitos" de "Ver detalhes" de um carro listado em
 * "Veículos da empresa" (não pela busca por placa + CPF/CNPJ de terceiro —
 * essa outra tela só mostra vencimento, não a data real da infração).
 *
 * Cada multa aparece em duas partes que precisam ser lidas JUNTAS, na ordem:
 *
 *     Cota: ÚNICA Vencimento: 31/07/2026 R$: 201,41
 *     Lote: 0000047961 Ag.Autuador: 224910 Serie: VD Auto: 000158834-5
 *     Infracao: 5568-0 ESTACIONAR LOCAL/HORARIO DE ESTACIONAMENTO E PARADA
 *     PROIBIDOS PELA SINALIZACAOData: 08/02/2026 09:23:00 Local: AVENIDA
 *     SIGISMUNDO GONCALVES OPOSTO AO NUMERO 1002 OLINDA - Amparo Legal:
 *     Art. 181, Inc. XIX
 *
 * Confirmado em 2026-10-24, com prints reais: a descrição às vezes fica
 * colada direto em "Data:" sem espaço nenhum ("SINALIZACAOData:") — mesmo
 * tipo de problema de extração de texto que já tínhamos visto no PDF do
 * SENATRAN, por isso o regex não exige espaço antes de "Data:". O campo
 * "Local" pode ter um hífen DENTRO do próprio endereço (ex.: "SAN, QD 3 BL
 * A - ED NUCLEO DOS BRASILIA") — por isso o corte usa o texto fixo
 * "Amparo Legal:" como âncora, não o primeiro hífen que aparecer.
 */

import { limparTexto, formatarPlaca, valorBrl, type MultaLida } from "./multas-senatran";

// Cota/Vencimento/R$ vêm ANTES do bloco Lote/Auto/Infracao/Data/Local — os
// dois juntos formam uma multa só. `[\s\S]*?` entre eles é o texto de
// cabeçalho da seção (Ag.Autuador, cabeçalhos de grupo) que não interessa.
const RE_DEBITO_DETRAN_PE =
  /Cota:\s*\S+\s*Vencimento:\s*\d{2}\/\d{2}\/\d{4}\s*R\$:\s*([\d.,]+)[\s\S]*?Lote:\s*\S+\s*Ag\.Autuador:\s*\S+\s*Serie:\s*\S+\s*Auto:\s*(\S+)\s*Infracao:\s*\d+-\d+\s+([\s\S]*?)Data:\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})\s*Local:\s*([\s\S]*?)\s*-\s*Amparo Legal:/g;

/**
 * Monta a data no fuso local a partir de "08/02/2026" e "09:23:00".
 *
 * Mesmo cuidado do leitor do SENATRAN: construída com os componentes
 * separados de propósito (`new Date("08/02/2026")` não existe em JS, e a
 * forma ISO seria lida como UTC) e rejeita datas impossíveis em vez de
 * deixar o construtor "corrigir" sozinho.
 */
function montarData(data: string, hora: string): Date | null {
  const [d, m, a] = data.split("/").map(Number);
  const [hh, mm, ss] = hora.split(":").map(Number);
  if (!d || !m || !a) return null;
  const dt = new Date(a, m - 1, d, hh || 0, mm || 0, ss || 0, 0);
  if (dt.getDate() !== d || dt.getMonth() !== m - 1 || dt.getFullYear() !== a) {
    return null;
  }
  return dt;
}

/**
 * Lê a seção MULTAS da tela de débitos de UM veículo. `placaConhecida` vem
 * de fora (quem navegou até aqui já sabe qual placa clicou — a placa não
 * aparece em texto plano nessa parte da página, só num parâmetro
 * criptografado na URL).
 */
export function lerDebitosDetranPe(textoBruto: string, placaConhecida: string): MultaLida[] {
  const texto = limparTexto(textoBruto);
  const placa = formatarPlaca(placaConhecida);
  const placaCrua = placa.replace("-", "");

  const multas: MultaLida[] = [];
  const vistos = new Set<string>();

  RE_DEBITO_DETRAN_PE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_DEBITO_DETRAN_PE.exec(texto)) !== null) {
    const ocorridaEm = montarData(m[4], m[5]);
    if (!ocorridaEm) continue;

    const auto = m[2].trim();
    // O mesmo débito pode reaparecer se a página listar algo mais de uma
    // vez (visto no portal com "Débitos" e "Desdobramento" se sobrepondo
    // em alguns casos) — uma multa é uma multa, conta uma vez.
    if (vistos.has(auto)) continue;
    vistos.add(auto);

    multas.push({
      ocorridaEm,
      ocorridaEmTexto: `${m[4]} ${m[5]}`,
      placaCrua,
      placa,
      descricao: m[3].replace(/\s+/g, " ").trim(),
      auto,
      valor: valorBrl(m[1]),
    });
  }

  return multas;
}

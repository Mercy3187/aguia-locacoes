/**
 * Leitura do relatório de infrações do Portal SENATRAN — puro, sem banco e sem
 * PDF, para poder ser testado (veja `dev-tools/testar-multas-senatran.mts`).
 *
 * Este arquivo recebe o TEXTO já extraído do PDF (ou colado à mão, nos
 * testes) e devolve as multas — separado de quem abre o arquivo de
 * propósito, porque o formato do relatório muda por conta do portal, e a
 * regra de leitura precisa poder ser conferida sem depender de arquivo
 * nenhum. Também é a base do leitor do DETRAN-PE (`lib/multas-detran-pe.ts`
 * reaproveita `limparTexto`/`formatarPlaca`/`valorBrl` daqui).
 *
 * ── O formato ──
 * Cada infração aparece assim, no meio do relatório:
 *
 *     26/03/2026 11:21 - ESTACIONAR IMPEDINDO A MOVIMENTACAO DE OUTRO VEICULO
 *     Placa: QYB0G99
 *     Auto de Infração: OD00235488  R$ 130,16
 *
 * A descrição pode quebrar em mais de uma linha, e o relatório vem paginado —
 * por isso o texto das páginas é analisado de uma vez só.
 */

/** Uma infração lida do relatório. */
export type MultaLida = {
  /** Data e hora da infração — é o que decide quem estava com o carro. */
  ocorridaEm: Date;
  /** Como veio no PDF, para conferência: "26/03/2026 11:21". */
  ocorridaEmTexto: string;
  /** Placa sem hífen, como o portal escreve: "QYB0G99". */
  placaCrua: string;
  /** Placa no formato do sistema: "QYB-0G99". */
  placa: string;
  descricao: string;
  /** Número do auto de infração — identifica a multa de forma única. */
  auto: string;
  valor: number;
};

export type LeituraRelatorio = {
  multas: MultaLida[];
  /**
   * Quantas o próprio portal diz ter encontrado ("TOTAL DE REGISTROS
   * ENCONTRADOS: 16"). Serve de conferência: se sai diferente do que lemos, o
   * relatório mudou de formato e alguma multa está passando batido.
   */
  totalDeclarado: number | null;
  /** Placa do cabeçalho do relatório, quando o PDF é de um veículo só. */
  placaDoRelatorio: string | null;
};

/**
 * Limpa o texto antes de qualquer coisa.
 *
 * O portal usa uma fonte com ícones na área de uso privado do Unicode
 * (U+E000–U+F8FF). Eles vêm no meio da linha — entre o número do auto e o
 * valor, por exemplo — e NÃO são espaço em branco: um `\s*` no meio do padrão
 * não casa com eles, e a multa inteira passa despercebida sem erro nenhum.
 * Foi exatamente o que aconteceu na primeira versão desta leitura.
 */
export function limparTexto(texto: string): string {
  return texto
    .replace(/[\uE000-\uF8FF]/g, " ")
    .replace(/[\u00a0\u200b\u2007\u202f]/g, " ");
}

/** "QYB0G99" → "QYB-0G99" (o formato usado no cadastro de veículos). */
export function formatarPlaca(placaCrua: string): string {
  const p = placaCrua.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
}

/** "130,16" e "1.234,56" → número. */
export function valorBrl(texto: string): number {
  return Number(texto.replace(/\./g, "").replace(",", "."));
}

/**
 * Monta a data no fuso local a partir de "26/03/2026" e "11:21".
 *
 * Construída com os componentes separados de propósito: `new Date("26/03/2026")`
 * não existe em JS, e a forma ISO seria lida como UTC — o que jogaria uma multa
 * das 21h para o dia seguinte e poderia trocar o motorista responsável.
 */
function montarData(data: string, hora: string): Date | null {
  const [d, m, a] = data.split("/").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  if (!d || !m || !a) return null;
  const dt = new Date(a, m - 1, d, hh || 0, mm || 0, 0, 0);
  // Rejeita 31/02 e afins: o construtor "corrige" sozinho para 03/03, e uma
  // data inventada em silêncio é pior do que uma multa a menos no relatório.
  if (dt.getDate() !== d || dt.getMonth() !== m - 1 || dt.getFullYear() !== a) {
    return null;
  }
  return dt;
}

// A descrição fica entre o traço e a palavra "Placa:", podendo quebrar linha.
// O `Infra\S*o` cobre "Infração" com ou sem o acento sobrevivendo à extração.
const RE_MULTA =
  /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s*-\s*([\s\S]*?)Placa:\s*([A-Z0-9]{7})[\s\S]*?Auto de Infra\S*o:\s*(\S+)\s*R\$\s*([\d.,]+)/g;

/** Lê o texto de um relatório do SENATRAN e devolve as infrações. */
export function lerRelatorioSenatran(textoBruto: string): LeituraRelatorio {
  const texto = limparTexto(textoBruto);

  const totalDeclarado = texto.match(/TOTAL DE REGISTROS ENCONTRADOS:\s*(\d+)/i);
  const placaCabecalho = texto.match(/-\s*Placa\s+([A-Z0-9]{7})/);

  const multas: MultaLida[] = [];
  const vistos = new Set<string>();

  RE_MULTA.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_MULTA.exec(texto)) !== null) {
    const ocorridaEm = montarData(m[1], m[2]);
    if (!ocorridaEm) continue;

    const auto = m[5].trim();
    // O mesmo auto pode reaparecer quando o usuário sobe relatórios de períodos
    // que se sobrepõem. Uma multa é uma multa: conta uma vez.
    if (vistos.has(auto)) continue;
    vistos.add(auto);

    multas.push({
      ocorridaEm,
      ocorridaEmTexto: `${m[1]} ${m[2]}`,
      placaCrua: m[4],
      placa: formatarPlaca(m[4]),
      descricao: m[3].replace(/\s+/g, " ").trim(),
      auto,
      valor: valorBrl(m[6]),
    });
  }

  return {
    multas,
    totalDeclarado: totalDeclarado ? Number(totalDeclarado[1]) : null,
    placaDoRelatorio: placaCabecalho ? formatarPlaca(placaCabecalho[1]) : null,
  };
}

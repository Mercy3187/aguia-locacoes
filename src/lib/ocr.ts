/**
 * Leitura da quilometragem na foto do painel via OCR.space.
 *
 * A foto do painel é dado pessoal do motorista (mostra a placa e o interior do
 * carro) e sai para um serviço de terceiro. Por isso: sem OCR_SPACE_API_KEY
 * configurada, NÃO envia nada — antes existia um fallback para a chave pública
 * de demonstração "helloworld", que mandaria as fotos numa cota compartilhada
 * sem ninguém perceber.
 *
 * É best-effort: em qualquer falha retorna null e o fluxo segue (a foto é
 * sempre salva e a KM digitada é aceita).
 */
export async function readOdometerKm(file: File): Promise<number | null> {
  const apiKey = process.env.OCR_SPACE_API_KEY;
  if (!apiKey) return null;
  try {
    const fd = new FormData();
    fd.set("apikey", apiKey);
    fd.set("OCREngine", "2"); // melhor para números
    fd.set("scale", "true");
    fd.set("isTable", "false");
    fd.set("file", file, file.name || "painel.jpg");

    const res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: fd,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      IsErroredOnProcessing?: boolean;
      ParsedResults?: { ParsedText?: string }[];
    };
    if (data.IsErroredOnProcessing) return null;
    const text = data.ParsedResults?.[0]?.ParsedText ?? "";
    return extractKm(text);
  } catch {
    return null;
  }
}

/**
 * Extrai a quilometragem de um texto reconhecido.
 * Remove separadores de milhar, busca grupos de 4 a 7 dígitos e escolhe o maior
 * (o odômetro total costuma ser o número mais destacado do painel).
 */
export function extractKm(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[.,\s](?=\d{3}\b)/g, "");
  const groups = cleaned.match(/\d{4,7}/g);
  if (!groups) return null;
  const nums = groups.map(Number).filter((n) => n >= 100 && n <= 9_999_999);
  if (!nums.length) return null;
  return Math.max(...nums);
}

/** Diferença tolerada entre KM digitada e KM lida por OCR antes de conferência. */
export const OCR_TOLERANCE_KM = 5;

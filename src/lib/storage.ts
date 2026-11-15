import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "uploads";

/** Indica se o armazenamento de fotos está configurado. */
export function storageConfigured(): boolean {
  return Boolean(url && secret);
}

/**
 * Cliente único, criado na primeira vez que é preciso.
 *
 * Antes um cliente novo nascia a cada chamada. Numa tela que assina dezenas de
 * fotos isso significava dezenas de clientes descartáveis, cada um refazendo a
 * própria configuração — trabalho jogado fora, já que todos apontam para o
 * mesmo bucket com a mesma chave.
 */
let clienteAdmin: ReturnType<typeof createClient> | null = null;

function admin() {
  if (!url || !secret) {
    throw new Error(
      "Armazenamento não configurado (defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY)."
    );
  }
  clienteAdmin ??= createClient(url, secret, { auth: { persistSession: false } });
  return clienteAdmin;
}

/** Só imagem. O tipo declarado pelo cliente não é confiável — conferimos os bytes. */
const TIPOS_ACEITOS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

/** 8 MB por arquivo: foto de celular moderno cabe folgado. */
const TAMANHO_MAXIMO = 8 * 1024 * 1024;

/**
 * Confere a assinatura real do arquivo (magic bytes).
 * Impede que alguém envie HTML/SVG com `Content-Type: image/jpeg` pela rota
 * pública do motorista — o arquivo depois é aberto pelo funcionário e
 * executaria script no domínio do storage.
 */
function tipoRealDaImagem(b: Buffer): "jpg" | "png" | "webp" | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

/**
 * Envia um arquivo ao bucket privado e retorna o caminho de armazenamento
 * (não é uma URL pública — use `getSignedUrl` para exibir).
 *
 * Valida tipo declarado, tamanho e assinatura real antes de gravar.
 */
export async function uploadFile(file: File, folder: string): Promise<string> {
  if (!(file.type in TIPOS_ACEITOS)) {
    throw new Error("Envie uma imagem JPG, PNG ou WEBP.");
  }
  if (file.size > TAMANHO_MAXIMO) {
    throw new Error("Imagem muito grande (máximo 8 MB).");
  }
  if (file.size === 0) {
    throw new Error("Arquivo vazio.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const real = tipoRealDaImagem(buffer);
  if (!real) {
    throw new Error("O arquivo enviado não é uma imagem válida.");
  }

  // A extensão e o content-type saem do conteúdo real, não do que o cliente disse.
  const contentType = real === "jpg" ? "image/jpeg" : `image/${real}`;
  const path = `${folder}/${randomUUID()}.${real}`;

  const { error } = await admin()
    .storage.from(bucket)
    .upload(path, buffer, { contentType, upsert: false });
  if (error) throw new Error(`Falha no upload: ${error.message}`);
  return path;
}

/** Gera uma URL assinada temporária para exibir um arquivo privado. */
export async function getSignedUrl(
  path: string | null | undefined,
  expiresIn = 3600
): Promise<string | null> {
  if (!path) return null;
  try {
    const { data, error } = await admin()
      .storage.from(bucket)
      .createSignedUrl(path, expiresIn);
    if (error) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Assina VÁRIOS arquivos de uma vez.
 *
 * Cada `getSignedUrl` é uma chamada HTTP ao Supabase. Uma tela que mostra a
 * foto do painel de cada registro fazia uma chamada por foto — e a de
 * registros, que mostra painel, placa e as fotos do carro, fazia
 * `2 + n` por linha. Todas em paralelo, mas ainda assim dezenas de idas à
 * rede, cada uma com seu handshake.
 *
 * O Supabase assina em lote numa única chamada, e é isso que esta função usa.
 * Devolve um mapa `caminho → url`; caminho que falhou simplesmente não entra,
 * e quem consulta recebe `undefined` — mesmo efeito do `null` de antes.
 *
 * Repetidos são assinados uma vez só: a mesma foto em duas linhas não vale
 * duas assinaturas.
 */
export async function getSignedUrls(
  paths: (string | null | undefined)[],
  expiresIn = 3600
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const unicos = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (unicos.length === 0) return mapa;

  try {
    const { data, error } = await admin()
      .storage.from(bucket)
      .createSignedUrls(unicos, expiresIn);
    if (error || !data) return mapa;
    for (const item of data) {
      // `path` volta nulo quando aquele arquivo específico falhou.
      if (item.signedUrl && item.path) mapa.set(item.path, item.signedUrl);
    }
  } catch {
    // Armazenamento não configurado: a tela abre sem as fotos, como antes.
  }
  return mapa;
}

import { timingSafeEqual } from "node:crypto";

/**
 * Autenticação das rotas que a EXTENSÃO do Chrome chama (não um usuário
 * logado — o `fetch` sai do background.js dela, sem cookie de sessão
 * nenhum). Mesmo padrão do CRON_SECRET em `api/cron/diario`: um token fixo,
 * comparado em tempo constante pra não vazar pelo tempo de resposta, falha
 * FECHADO se a variável não estiver configurada.
 */
function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(`Bearer ${esperado}`, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Devolve `null` se autorizado, ou a Response de erro pra devolver direto. */
export function autorizarExtensao(request: Request): Response | null {
  const token = process.env.EXTENSION_API_TOKEN;
  if (!token) {
    return new Response("EXTENSION_API_TOKEN não configurado", { status: 503 });
  }
  if (!segredoConfere(request.headers.get("authorization"), token)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

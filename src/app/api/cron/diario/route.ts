import { timingSafeEqual } from "node:crypto";
import { asaasEnabled } from "@/lib/asaas";
import { syncPayments } from "@/lib/asaas-sync";
import { padronizarNotificacoes } from "@/lib/asaas-standardize";
import { rodarAgendamentoKm } from "@/lib/km-schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Rotina diária (agendada em vercel.json, 8h de Brasília):
 *   1. ciclo de KM — agenda, cria as solicitações vencidas e expira links velhos
 *   2. cobranças do Asaas — atualiza a aba de Inadimplência
 *   3. padroniza as notificações dos clientes do Asaas
 *
 * O resultado volta como JSON e fica nos logs da função na Vercel.
 *
 * Protegida por CRON_SECRET (a Vercel manda o header sozinha quando a
 * variável existe no projeto).
 */
/** Compara em tempo constante, sem vazar o segredo pelo tempo de resposta. */
function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(`Bearer ${esperado}`, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<Response> {
  // Falha FECHADO: sem CRON_SECRET a rota fica indisponível, nunca aberta.
  // Ela dispara escrita no Asaas.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response("CRON_SECRET não configurado", { status: 503 });
  }
  if (!segredoConfere(request.headers.get("authorization"), secret)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const km = await rodarAgendamentoKm();

  let sync = null;
  let padrao = null;
  if (asaasEnabled()) {
    sync = await syncPayments();
    padrao = await padronizarNotificacoes();
  }

  const erros = [...km.erros, ...(sync?.erros ?? []), ...(padrao?.erros ?? [])];
  if (erros.length) console.error("[cron diario] erros:", erros);

  return Response.json({
    ok: erros.length === 0,
    km: {
      agendados: km.agendados,
      solicitacoesCriadas: km.criados,
      linksExpirados: km.expirados,
      semTelefone: km.semTelefone,
    },
    asaas: sync && {
      cobrancasLidas: sync.lidas,
      gravadas: sync.gravadas,
      valoresSemanaisPreenchidos: sync.valoresPreenchidos,
      clientesPadronizados: padrao?.ajustados ?? 0,
    },
    erros,
  });
}

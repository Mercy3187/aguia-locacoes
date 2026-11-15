/**
 * Padronização das notificações no Asaas.
 *
 * Garante que todo cliente do Asaas receba os avisos de cobrança: cliente
 * cadastrado com `notificationDisabled: true` ou com o WhatsApp desligado
 * nunca é avisado de nada. Como clientes novos entram toda semana, isso é
 * conferido continuamente — não adianta arrumar uma vez só.
 *
 * Esta rotina roda diariamente (ver /api/cron/diario) e deixa todo cliente no
 * padrão da casa. Só mexe em configuração de notificação: nunca em cobrança.
 */

import { asaasBase, asaasKey, type AsaasCustomer } from "@/lib/asaas";

/** Dias antes do vencimento para o lembrete (o Asaas só aceita 5, 10, 15 ou 30). */
export const AVISO_DIAS_ANTES = 5;

type AsaasNotification = {
  id: string;
  event: string;
  enabled: boolean;
  scheduleOffset: number;
  whatsappEnabledForCustomer: boolean;
  emailEnabledForCustomer: boolean;
};

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = asaasKey();
  if (!key) throw new Error("ASAAS_API_KEY não configurada.");
  const res = await fetch(`${asaasBase()}${path}`, {
    method,
    headers: {
      access_token: key,
      accept: "application/json",
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text).errors?.[0]?.description ?? text;
    } catch {
      /* mantém o texto cru */
    }
    throw new Error(String(msg).slice(0, 160));
  }
  return JSON.parse(text) as T;
}

export type StandardizeResult = {
  verificados: number;
  ajustados: number;
  mudancas: string[];
  erros: string[];
};

/**
 * Deixa todos os clientes do Asaas no padrão:
 *   1. notificações ligadas
 *   2. canal WhatsApp ativo em todo evento que aceite
 *   3. lembrete de vencimento em AVISO_DIAS_ANTES dias (+ o do próprio dia)
 *
 * É idempotente: rodar de novo em quem já está no padrão não faz nada.
 */
export async function padronizarNotificacoes(): Promise<StandardizeResult> {
  const out: StandardizeResult = { verificados: 0, ajustados: 0, mudancas: [], erros: [] };

  let clientes: AsaasCustomer[];
  try {
    const page = await call<{ data: AsaasCustomer[] }>("GET", "/customers?limit=100");
    clientes = page.data ?? [];
  } catch (e) {
    out.erros.push(`Falha ao listar clientes: ${e}`);
    return out;
  }

  for (const c of clientes) {
    out.verificados++;
    const feito: string[] = [];

    try {
      // 1. Religa as notificações do cliente
      if (c.notificationDisabled) {
        await call("POST", `/customers/${c.id}`, { notificationDisabled: false });
        feito.push("notificações religadas");
      }

      const { data: notifs } = await call<{ data: AsaasNotification[] }>(
        "GET",
        `/customers/${c.id}/notifications`
      );

      // 2. Liga o WhatsApp onde ainda não está
      let zap = 0;
      for (const n of notifs) {
        if (n.whatsappEnabledForCustomer) continue;
        try {
          await call("PUT", `/notifications/${n.id}`, { whatsappEnabledForCustomer: true });
          zap++;
        } catch {
          // Alguns eventos (ex.: SEND_LINHA_DIGITAVEL) não aceitam WhatsApp.
        }
      }
      if (zap) feito.push(`WhatsApp em ${zap} evento(s)`);

      // 3. Ajusta o lembrete de vencimento
      const avisos = notifs.filter((n) => n.event === "PAYMENT_DUEDATE_WARNING");
      const temNoDia = avisos.some((n) => n.scheduleOffset === 0);
      const temAntecedencia = avisos.some((n) => n.scheduleOffset === AVISO_DIAS_ANTES);
      if (!temAntecedencia) {
        // Move um aviso que não seja o do próprio dia para a antecedência padrão.
        const mover = avisos.find((n) => n.scheduleOffset !== 0 || !temNoDia);
        if (mover) {
          try {
            await call("PUT", `/notifications/${mover.id}`, {
              scheduleOffset: AVISO_DIAS_ANTES,
            });
            feito.push(`lembrete para ${AVISO_DIAS_ANTES} dias antes`);
          } catch (e) {
            out.erros.push(`${c.name}: lembrete — ${e}`);
          }
        }
      }
    } catch (e) {
      out.erros.push(`${c.name}: ${e}`);
      continue;
    }

    if (feito.length) {
      out.ajustados++;
      out.mudancas.push(`${c.name}: ${feito.join(", ")}`);
    }
  }

  return out;
}

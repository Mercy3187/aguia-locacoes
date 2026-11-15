/**
 * Agendamento automático do ciclo de KM.
 *
 * Roda todo dia pelo cron (/api/cron/km) e faz três coisas:
 *   1. dá data de próxima cobrança a contrato que ainda não tem
 *   2. cria a solicitação de quem já venceu (fica PENDENTE, pronta na fila)
 *   3. marca como VENCIDO os links que expiraram sem resposta
 *
 * O envio em si continua sendo seu: o sistema deixa a fila pronta e você
 * despacha com um clique cada na tela de Controle de KM.
 */

import { prisma } from "@/lib/prisma";
import { addDays, KM_CYCLE_DAYS } from "@/lib/dates";
import { generateToken, linkExpiryFromNow } from "@/lib/token";

/**
 * Validade do link do motorista criado pelo agendamento.
 * Maior que as 24h do envio manual porque a solicitação é gerada de madrugada
 * e o motorista pode só ver a mensagem dias depois.
 */
export const KM_LINK_TTL_HOURS = 7 * 24;
import { buildKmMessage, buildWhatsAppLink, driverLink } from "@/lib/whatsapp";

export type KmScheduleResult = {
  agendados: number;
  criados: number;
  expirados: number;
  semTelefone: string[];
  erros: string[];
};

export async function rodarAgendamentoKm(now = new Date()): Promise<KmScheduleResult> {
  const out: KmScheduleResult = {
    agendados: 0,
    criados: 0,
    expirados: 0,
    semTelefone: [],
    erros: [],
  };

  // ── 1. Marca como VENCIDO o que passou da validade sem resposta ──
  try {
    const r = await prisma.kmRequest.updateMany({
      where: {
        status: { in: ["PENDENTE", "ENVIADO"] },
        usedAt: null,
        OR: [
          { expiresAt: { lt: now } },
          // Links antigos ficaram sem validade. `expiresAt: { lt: now }` nunca
          // casa com NULL em SQL, então eles jamais expirariam — trata pela
          // data de criação.
          {
            expiresAt: null,
            createdAt: { lt: new Date(now.getTime() - KM_LINK_TTL_HOURS * 3600_000) },
          },
        ],
      },
      data: { status: "VENCIDO" },
    });
    out.expirados = r.count;
  } catch (e) {
    out.erros.push(`expirar: ${e}`);
  }

  const contratos = await prisma.contract.findMany({
    where: { status: "ATIVO" },
    include: {
      customer: { select: { name: true, phone: true } },
      vehicle: { select: { plate: true, model: true } },
      kmRequests: {
        where: { status: { in: ["PENDENTE", "ENVIADO"] }, usedAt: null },
        take: 1,
      },
    },
  });

  for (const c of contratos) {
    try {
      // ── 2. Contrato sem agendamento: define a próxima data ──
      let proxima = c.nextKmRequestDate;
      if (!proxima) {
        const base = c.lastKmRequestDate ?? c.startDate;
        proxima = addDays(base, KM_CYCLE_DAYS);
        // Contrato antigo sem histórico cai no passado — cobra já.
        await prisma.contract.update({
          where: { id: c.id },
          data: { nextKmRequestDate: proxima },
        });
        out.agendados++;
      }

      // ── 3. Venceu e não tem solicitação aberta? Cria. ──
      if (proxima > now) continue;
      if (c.kmRequests.length > 0) continue;

      if (!c.customer.phone) {
        out.semTelefone.push(`${c.customer.name} (${c.vehicle.plate})`);
        // Cria mesmo assim: o link serve, só não dá para abrir o WhatsApp.
      }

      const token = generateToken();
      const message = buildKmMessage({
        model: c.vehicle.model,
        plate: c.vehicle.plate,
        link: driverLink(token),
      });

      await prisma.kmRequest.create({
        data: {
          contractId: c.id,
          customerId: c.customerId,
          vehicleId: c.vehicleId,
          token,
          requestType: "QUINZENAL",
          status: "PENDENTE",
          // Link sempre com validade: um link sem expiração encaminhado num
          // grupo continuaria valendo meses depois, em contrato alheio.
          expiresAt: linkExpiryFromNow(KM_LINK_TTL_HOURS),
          whatsappMessage: message,
          whatsappLink: buildWhatsAppLink(c.customer.phone, message),
        },
      });
      out.criados++;
    } catch (e) {
      out.erros.push(`${c.vehicle.plate}: ${e}`);
    }
  }

  return out;
}

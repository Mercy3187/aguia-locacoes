/**
 * Avisos da tela de Inadimplência — NUNCA dão baixa sozinhos, só sinalizam
 * pro usuário decidir e clicar. Pedido explícito do usuário em 2026-10-23:
 * "de forma nenhuma eu quero que o sistema dê baixa automática".
 *
 * Funções puras: recebem a lista de pagamentos já carregada pela página (sem
 * consulta nova ao banco) e cruzam entre si.
 */

export type PagamentoBasico = {
  id: string;
  plate: string | null;
  contractId: string | null;
  value: unknown; // Decimal do Prisma — comparado via Number()
  status: string;
  billingType: string | null;
  dueDate: Date;
  paymentDate: Date | null;
  description: string | null;
  settledLocally: boolean;
};

const PAGOS = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]);
export const pagamentoPago = (p: PagamentoBasico) => p.settledLocally || PAGOS.has(p.status);

/**
 * Outra cobrança da MESMA placa e MESMO vencimento, já paga — provável
 * fatura duplicada (acontece numa troca de contrato, quando a semana acaba
 * cobrada nos dois).
 */
export function duplicataProvavel(
  aberta: PagamentoBasico,
  todas: PagamentoBasico[]
): PagamentoBasico | null {
  if (!aberta.plate) return null;
  return (
    todas.find(
      (q) =>
        q.id !== aberta.id &&
        q.plate === aberta.plate &&
        q.dueDate.getTime() === aberta.dueDate.getTime() &&
        pagamentoPago(q)
    ) ?? null
  );
}

const DIA_MS = 24 * 60 * 60 * 1000;
/** Janela de tolerância entre o PIX e o vencimento — o motorista pode pagar uns dias antes ou depois. */
const JANELA_DIAS_PIX = 10;

/**
 * Um PIX "avulso" de verdade: o Asaas concilia um recebimento na chave Pix
 * da conta que NÃO está ligado a nenhuma fatura específica,
 * com essa descrição fixa. Diferente de uma fatura normal paga com
 * billingType=PIX (essa é só o boleto de sempre, pago por Pix — nada a
 * avisar), este é dinheiro "solto", sem boleto baixado — exatamente o caso
 * do motorista que paga direto na chave em vez do boleto.
 */
function ehPixAvulso(p: PagamentoBasico): boolean {
  return pagamentoPago(p) && (p.description ?? "").includes("Pix recebido");
}

/**
 * Casa, UM PRA UM, os PIX avulsos recebidos com cobranças em aberto do
 * mesmo motorista — mesmo valor, perto da data de vencimento — pra sugerir
 * que aquele PIX já pode ter coberto aquela cobrança. Cada PIX só é
 * sugerido para NO MÁXIMO uma cobrança (o par mais próximo no tempo), nunca
 * reaproveitado pra várias semanas diferentes.
 *
 * SÓ UM AVISO — quem decide dar baixa é o usuário, clicando. Nunca baixa
 * sozinho (pedido explícito do usuário em 2026-10-23).
 */
export function sugestoesDePix(todos: PagamentoBasico[]): Map<string, PagamentoBasico> {
  const abertos = todos.filter((p) => !pagamentoPago(p));
  const pixAvulsos = todos.filter(ehPixAvulso);

  const mesmoMotorista = (a: PagamentoBasico, b: PagamentoBasico) =>
    (a.contractId && b.contractId && a.contractId === b.contractId) ||
    (a.plate && b.plate && a.plate === b.plate);

  const pares: { abertaId: string; pixId: string; distancia: number }[] = [];
  for (const aberta of abertos) {
    for (const pix of pixAvulsos) {
      if (!mesmoMotorista(aberta, pix)) continue;
      if (Math.abs(Number(pix.value) - Number(aberta.value)) >= 0.01) continue;
      const distancia = Math.abs((pix.paymentDate ?? pix.dueDate).getTime() - aberta.dueDate.getTime());
      if (distancia > JANELA_DIAS_PIX * DIA_MS) continue;
      pares.push({ abertaId: aberta.id, pixId: pix.id, distancia });
    }
  }
  // Par mais próximo primeiro, pra ganhar no "um por um" abaixo.
  pares.sort((a, b) => a.distancia - b.distancia);

  const porId = new Map(todos.map((p) => [p.id, p]));
  const resultado = new Map<string, PagamentoBasico>();
  const pixJaUsados = new Set<string>();
  for (const par of pares) {
    if (resultado.has(par.abertaId) || pixJaUsados.has(par.pixId)) continue;
    resultado.set(par.abertaId, porId.get(par.pixId)!);
    pixJaUsados.add(par.pixId);
  }
  return resultado;
}

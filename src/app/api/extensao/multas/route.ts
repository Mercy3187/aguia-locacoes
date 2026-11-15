import { prisma } from "@/lib/prisma";
import { autorizarExtensao } from "@/lib/extensao-auth";
import { lerDebitosDetranPe } from "@/lib/multas-detran-pe";
import { acharResponsavel, type ContratoNoPeriodo } from "@/lib/multas-responsavel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Recebe o TEXTO BRUTO da seção "MULTAS" da tela de débitos do DETRAN-PE,
 * uma entrada por veículo visitado pela extensão — o parse (regex) e o
 * cruzamento com o histórico de contratos acontecem AQUI, não na extensão
 * (ela é JS puro, sem acesso aos módulos TypeScript do sistema; melhor
 * manter a regra de leitura num lugar só, testado em
 * `dev-tools/testar-multas-detran-pe.mts`).
 *
 * Nunca sobrescreve `debtId`, pagamento à autoridade ou anotações — essas
 * são decisões do operador; só atualiza os campos "crus" lidos do portal.
 */
export async function POST(request: Request): Promise<Response> {
  const erro = autorizarExtensao(request);
  if (erro) return erro;

  let corpo: { itens?: { placa?: string; textoBruto?: string }[] };
  try {
    corpo = await request.json();
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const itens = (corpo.itens ?? []).filter(
    (i): i is { placa: string; textoBruto: string } => Boolean(i.placa && i.textoBruto)
  );
  if (itens.length === 0) {
    return Response.json({ importadas: 0, jaExistentes: 0, semVeiculo: 0, placasNaoCadastradas: [] });
  }

  const [veiculos, contratosBrutos] = await Promise.all([
    prisma.vehicle.findMany({ select: { id: true, plate: true } }),
    prisma.contract.findMany({
      select: {
        id: true,
        vehicleId: true,
        startDate: true,
        pickupDate: true,
        endDate: true,
        returnedAt: true,
        status: true,
        customer: { select: { id: true, name: true, cpfCnpj: true } },
        vehicle: { select: { plate: true } },
      },
    }),
  ]);

  const vehicleIdPorPlaca = new Map(veiculos.map((v) => [v.plate, v.id]));
  const placasDaFrota = new Set(veiculos.map((v) => v.plate));
  const contratos: ContratoNoPeriodo[] = contratosBrutos.map((c) => ({
    id: c.id,
    vehicleId: c.vehicleId,
    placa: c.vehicle.plate,
    clienteNome: c.customer.name,
    clienteId: c.customer.id,
    clienteDoc: c.customer.cpfCnpj,
    // O período é o de posse do carro: da entrega à devolução registradas.
    // Contrato antigo, sem esses dados, cai no início e no fim do lote.
    inicio: c.pickupDate ?? c.startDate,
    fim: c.status === "ATIVO" ? null : (c.returnedAt ?? c.endDate),
  }));
  const inicioDoHistorico = contratos.length
    ? contratos.reduce((a, c) => (c.inicio < a ? c.inicio : a), contratos[0].inicio)
    : null;

  let importadas = 0;
  let jaExistentes = 0;
  let semVeiculo = 0;
  const placasNaoCadastradas = new Set<string>();

  for (const item of itens) {
    const multas = lerDebitosDetranPe(item.textoBruto, item.placa);

    for (const multa of multas) {
      const vehicleId = vehicleIdPorPlaca.get(multa.placa);
      if (!vehicleId) {
        semVeiculo++;
        placasNaoCadastradas.add(multa.placa);
        continue;
      }

      const responsavel = acharResponsavel({
        placa: multa.placa,
        ocorridaEm: multa.ocorridaEm,
        contratos,
        placasDaFrota,
        inicioDoHistorico,
      });

      const camposCruzados =
        responsavel.tipo === "encontrado"
          ? { contractId: responsavel.contratoId, customerId: responsavel.clienteId, responsibleNote: null }
          : { contractId: null, customerId: null, responsibleNote: responsavel.motivo };

      const existia = await prisma.fine.findUnique({ where: { ticketNumber: multa.auto }, select: { id: true } });

      await prisma.fine.upsert({
        where: { ticketNumber: multa.auto },
        create: {
          ticketNumber: multa.auto,
          vehicleId,
          plate: multa.placa,
          occurredAt: multa.ocorridaEm,
          description: multa.descricao,
          amount: multa.valor,
          origin: "DETRAN",
          ...camposCruzados,
        },
        update: {
          plate: multa.placa,
          occurredAt: multa.ocorridaEm,
          description: multa.descricao,
          amount: multa.valor,
          ...camposCruzados,
        },
      });

      if (existia) jaExistentes++;
      else importadas++;
    }
  }

  return Response.json({
    importadas,
    jaExistentes,
    semVeiculo,
    placasNaoCadastradas: [...placasNaoCadastradas],
  });
}

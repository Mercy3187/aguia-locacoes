import { prisma } from "@/lib/prisma";
import { escreverKm, SELECT_VEICULO_KM } from "@/lib/km";

/**
 * O que acontece no banco quando um contrato é encerrado (o carro é devolvido).
 *
 * Fica fora da server action para poder ser testado sem sessão de usuário
 * (veja `dev-tools/testar-encerrar-contrato.mts`) — encerrar contrato mexe em
 * cobrança, e é o tipo de coisa que não se confere só olhando a tela.
 */
export type ResultadoEncerramento =
  | {
      ok: true;
      /** Solicitações de KM em aberto que foram canceladas junto. */
      solicitacoesCanceladas: number;
      /** Se o carro voltou para o pátio (falso quando está com outro motorista). */
      carroLiberado: boolean;
      /** Preenchido quando o odômetro da devolução andou a KM do carro. */
      km: { anterior: number; nova: number } | null;
    }
  | { ok: false; error: string };

/** O que se anota quando o carro volta. Tudo opcional além da data. */
export type DadosDevolucao = {
  em: Date;
  odometro?: number | null;
  combustivel?: string | null;
  observacao?: string | null;
};

/**
 * Devolve o veículo a DISPONIVEL se ele não tem mais contrato ativo.
 * Não mexe em carro em manutenção nem vendido.
 */
export async function liberarVeiculoSemContrato(vehicleId: string) {
  const emUso = await prisma.contract.count({ where: { vehicleId, status: "ATIVO" } });
  if (emUso > 0) return;
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { status: true } });
  if (v?.status !== "ALUGADO") return;
  await prisma.vehicle.update({ where: { id: vehicleId }, data: { status: "DISPONIVEL" } });
}

export async function encerrarContratoNoBanco(
  contractId: string,
  devolucao: DadosDevolucao = { em: new Date() }
): Promise<ResultadoEncerramento> {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      id: true,
      status: true,
      vehicleId: true,
      pickupDate: true,
      startDate: true,
      deliveryOdometer: true,
      vehicle: { select: SELECT_VEICULO_KM },
    },
  });
  if (!contract) return { ok: false, error: "Contrato não encontrado." };
  if (contract.status !== "ATIVO") {
    return { ok: false, error: "Este contrato já não está ativo." };
  }

  const entrega = contract.pickupDate ?? contract.startDate;
  if (devolucao.em < entrega) {
    return { ok: false, error: "A devolução não pode ser antes da entrega do carro." };
  }
  const odometro = devolucao.odometro ?? null;
  if (odometro != null && contract.deliveryOdometer != null && odometro < contract.deliveryOdometer) {
    return {
      ok: false,
      error: `O odômetro da devolução (${odometro.toLocaleString("pt-BR")} km) é menor que o da entrega (${contract.deliveryOdometer.toLocaleString("pt-BR")} km).`,
    };
  }
  // A KM do carro só anda para a frente aqui: devolução com odômetro abaixo
  // do que o sistema já conhece é anotada no contrato, mas não rebaixa o carro.
  const andaKm = odometro != null && odometro > contract.vehicle.currentKm;

  let solicitacoesCanceladas = 0;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contractId },
        data: {
          status: "ENCERRADO",
          // Sem próxima cobrança: o ciclo de KM deste contrato acabou aqui.
          nextKmRequestDate: null,
          // Fecha o período na linha do tempo do veículo.
          returnedAt: devolucao.em,
          returnOdometer: odometro,
          returnFuel: devolucao.combustivel ?? null,
          returnNotes: devolucao.observacao ?? null,
        },
      });
      // Link em aberto é link que ainda pode cair no WhatsApp de quem já
      // devolveu o carro — que é justamente o que se quer evitar.
      const r = await tx.kmRequest.updateMany({
        where: { contractId, status: { in: ["PENDENTE", "ENVIADO"] } },
        data: { status: "CANCELADO" },
      });
      solicitacoesCanceladas = r.count;

      if (andaKm) await escreverKm(tx, contract.vehicle, odometro!);
    });
  } catch {
    return { ok: false, error: "Não foi possível encerrar o contrato. Tente novamente." };
  }

  // Só volta ao pátio se não estiver com outro motorista — no carro repassado,
  // o contrato novo continua de pé e o carro segue ALUGADO.
  const antes = await prisma.vehicle.findUnique({
    where: { id: contract.vehicleId },
    select: { status: true },
  });
  await liberarVeiculoSemContrato(contract.vehicleId);
  const depois = await prisma.vehicle.findUnique({
    where: { id: contract.vehicleId },
    select: { status: true },
  });

  return {
    ok: true,
    solicitacoesCanceladas,
    carroLiberado: antes?.status !== depois?.status,
    km: andaKm ? { anterior: contract.vehicle.currentKm, nova: odometro! } : null,
  };
}

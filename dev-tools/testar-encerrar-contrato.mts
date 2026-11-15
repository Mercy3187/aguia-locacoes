/**
 * Testa o encerramento de contrato CONTRA O BANCO DE DEV, usando a função real
 * do sistema (src/lib/contratos.ts) — a mesma que o botão da tela chama.
 *
 * Encerrar contrato mexe em cobrança: tira o contrato da fila de KM e cancela
 * os links em aberto. Não é coisa de conferir só olhando a tela.
 *
 * Usa o caso do carro repassado (dois contratos ativos no mesmo carro), porque
 * ele testa a parte mais delicada: o carro NÃO pode voltar para o pátio, já
 * que o outro motorista continua com ele.
 *
 * Desfaz tudo no fim — o banco volta exatamente como estava.
 *
 * Uso: npx tsx dev-tools\testar-encerrar-contrato.mts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { encerrarContratoNoBanco } from "../src/lib/contratos";

async function main() {
  // Acha um carro com dois contratos ativos (o repasse) e pega o mais atrasado.
  const ativos = await prisma.contract.findMany({
    where: { status: "ATIVO" },
    select: {
      id: true,
      vehicleId: true,
      endDate: true,
      customer: { select: { name: true } },
      vehicle: { select: { plate: true, status: true } },
    },
  });

  const porCarro = new Map<string, typeof ativos>();
  for (const c of ativos) porCarro.set(c.vehicleId, [...(porCarro.get(c.vehicleId) ?? []), c]);
  const repassado = [...porCarro.values()].find((l) => l.length > 1);
  if (!repassado) throw new Error("Nenhum carro com dois contratos ativos no dev.");

  const alvo = [...repassado].sort(
    (a, b) => (a.endDate?.getTime() ?? 0) - (b.endDate?.getTime() ?? 0)
  )[0];
  const oQueFica = repassado.find((c) => c.id !== alvo.id)!;

  console.log(`Carro ${alvo.vehicle.plate} (status ${alvo.vehicle.status})`);
  console.log(`  encerrando : ${alvo.customer.name}`);
  console.log(`  continua   : ${oQueFica.customer.name}\n`);

  // Estado antes, para poder desfazer.
  const antes = await prisma.contract.findUniqueOrThrow({
    where: { id: alvo.id },
    select: { status: true, nextKmRequestDate: true },
  });
  const pedidosAbertos = await prisma.kmRequest.findMany({
    where: { contractId: alvo.id, status: { in: ["PENDENTE", "ENVIADO"] } },
    select: { id: true, status: true },
  });
  const carroAntes = (
    await prisma.vehicle.findUniqueOrThrow({
      where: { id: alvo.vehicleId },
      select: { status: true },
    })
  ).status;

  const r = await encerrarContratoNoBanco(alvo.id);
  if (!r.ok) throw new Error(`A ação recusou: ${r.error}`);

  const depois = await prisma.contract.findUniqueOrThrow({
    where: { id: alvo.id },
    select: { status: true, nextKmRequestDate: true },
  });
  const carroDepois = (
    await prisma.vehicle.findUniqueOrThrow({
      where: { id: alvo.vehicleId },
      select: { status: true },
    })
  ).status;
  const aindaAbertos = await prisma.kmRequest.count({
    where: { contractId: alvo.id, status: { in: ["PENDENTE", "ENVIADO"] } },
  });
  const outroIntacto = await prisma.contract.findUniqueOrThrow({
    where: { id: oQueFica.id },
    select: { status: true },
  });

  const checagens: Array<[string, boolean, string]> = [
    ["contrato virou ENCERRADO", depois.status === "ENCERRADO", depois.status],
    ["sem próxima cobrança de KM agendada", depois.nextKmRequestDate === null, String(depois.nextKmRequestDate)],
    ["links de KM em aberto foram cancelados", aindaAbertos === 0, `${pedidosAbertos.length} cancelado(s), ${aindaAbertos} restante(s)`],
    ["o carro NÃO voltou ao pátio (está com o outro motorista)", carroDepois === carroAntes, `${carroAntes} → ${carroDepois}`],
    ["o contrato do outro motorista continua ATIVO", outroIntacto.status === "ATIVO", outroIntacto.status],
  ];

  // Encerrar de novo tem de ser recusado, e não encerrar duas vezes.
  const repetido = await encerrarContratoNoBanco(alvo.id);
  checagens.push([
    "encerrar duas vezes é recusado",
    !repetido.ok,
    repetido.ok ? "aceitou (errado)" : repetido.error,
  ]);

  let falhas = 0;
  for (const [nome, ok, detalhe] of checagens) {
    if (!ok) falhas++;
    console.log(`${ok ? "OK   " : "FALHA"} ${nome}  (${detalhe})`);
  }

  // ── Desfaz ──
  await prisma.contract.update({
    where: { id: alvo.id },
    data: { status: antes.status, nextKmRequestDate: antes.nextKmRequestDate },
  });
  for (const p of pedidosAbertos) {
    await prisma.kmRequest.update({ where: { id: p.id }, data: { status: p.status } });
  }
  await prisma.vehicle.update({
    where: { id: alvo.vehicleId },
    data: { status: carroAntes },
  });
  console.log(`\nDesfeito: contrato de volta para ${antes.status}, ${pedidosAbertos.length} link(s) restaurado(s).`);

  await prisma.$disconnect();
  console.log(falhas === 0 ? "\nEncerramento funciona como esperado." : `\n${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();

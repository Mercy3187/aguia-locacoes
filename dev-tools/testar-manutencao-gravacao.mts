/**
 * Grava uma manutenção com peça e mão de obra separadas NO BANCO DE DEV e
 * confere que o total (`cost`) bate com a soma — que é o número lido pelo
 * fechamento e pelos relatórios.
 *
 * Também confere que as manutenções ANTIGAS continuam intactas: elas não têm a
 * separação, e o total delas não pode mudar nem sumir das contas.
 *
 * Apaga o registro de teste no fim.
 *
 * Uso: npx tsx dev-tools\testar-manutencao-gravacao.mts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { custoTotal, somarPecaMaoDeObra } from "../src/lib/manutencao-custo";

const PECA = 350.55;
const SERVICO = 499.45;

async function main() {
  const veiculo = await prisma.vehicle.findFirst({
    where: { status: { not: "VENDIDO" } },
    select: { id: true, plate: true, ownerName: true },
  });
  if (!veiculo) throw new Error("Nenhum veículo no dev.");

  // Como estava antes: o teste não pode mexer no gasto já registrado.
  const antes = await prisma.maintenance.aggregate({ _sum: { cost: true }, _count: true });
  const antigasAntes = await prisma.maintenance.findMany({
    select: { id: true, cost: true, partsCost: true, laborCost: true },
  });

  console.log(`Carro ${veiculo.plate}`);
  console.log(`  peça R$ ${PECA} + mão de obra R$ ${SERVICO}\n`);

  const criada = await prisma.maintenance.create({
    data: {
      vehicleId: veiculo.id,
      type: "TESTE AUTOMATIZADO — apagar",
      workshop: "Oficina do Zé",
      partsSupplier: "Autopeças Central",
      partsCost: PECA,
      laborCost: SERVICO,
      cost: custoTotal(PECA, SERVICO),
      startAt: new Date(),
      status: "EM_ANDAMENTO",
    },
    select: {
      id: true,
      cost: true,
      partsCost: true,
      laborCost: true,
      partsSupplier: true,
    },
  });

  const total = Number(criada.cost);
  const peca = Number(criada.partsCost);
  const servico = Number(criada.laborCost);

  const checagens: Array<[string, boolean, string]> = [
    ["peça gravada certa", peca === PECA, String(peca)],
    ["mão de obra gravada certa", servico === SERVICO, String(servico)],
    ["fornecedor da peça gravado", criada.partsSupplier === "Autopeças Central", String(criada.partsSupplier)],
    [
      "TOTAL bate com a soma (é o que o ressarcimento lê)",
      total === 850 && total === peca + servico,
      `${peca} + ${servico} = ${total}`,
    ],
  ];

  // A soma da frota tem de enxergar a nova como detalhada e as antigas à parte.
  const todas = await prisma.maintenance.findMany({
    select: { cost: true, partsCost: true, laborCost: true },
  });
  const g = somarPecaMaoDeObra(todas);
  const somaDosTotais = todas.reduce((s, m) => s + Number(m.cost ?? 0), 0);
  checagens.push([
    "peças + serviço + não detalhado = gasto total da frota",
    Math.round((g.pecas + g.maoDeObra + g.semDetalhamento) * 100) ===
      Math.round(somaDosTotais * 100),
    `${g.pecas} + ${g.maoDeObra} + ${g.semDetalhamento} = ${somaDosTotais}`,
  ]);
  checagens.push([
    "a nova entrou em peças e serviço",
    g.pecas >= PECA && g.maoDeObra >= SERVICO,
    `peças ${g.pecas}, serviço ${g.maoDeObra}`,
  ]);

  // As antigas não podem ter sido tocadas.
  const antigasDepois = await prisma.maintenance.findMany({
    where: { id: { in: antigasAntes.map((m) => m.id) } },
    select: { id: true, cost: true, partsCost: true, laborCost: true },
  });
  const intactas = antigasAntes.every((a) => {
    const d = antigasDepois.find((x) => x.id === a.id);
    return (
      d &&
      String(d.cost) === String(a.cost) &&
      d.partsCost == null &&
      d.laborCost == null
    );
  });
  checagens.push([
    "manutenções antigas intactas (total igual, sem detalhamento inventado)",
    intactas,
    `${antigasAntes.length} registro(s)`,
  ]);

  let falhas = 0;
  for (const [nome, ok, detalhe] of checagens) {
    if (!ok) falhas++;
    console.log(`${ok ? "OK   " : "FALHA"} ${nome}  (${detalhe})`);
  }

  // ── Limpa ──
  await prisma.maintenance.delete({ where: { id: criada.id } });
  const depois = await prisma.maintenance.aggregate({ _sum: { cost: true }, _count: true });
  const voltouAoNormal =
    depois._count === antes._count && String(depois._sum.cost) === String(antes._sum.cost);
  console.log(
    `\nRegistro de teste apagado. Banco ${voltouAoNormal ? "voltou ao estado original" : "NÃO voltou ao original!"} ` +
      `(${depois._count} manutenções, total ${depois._sum.cost}).`
  );
  if (!voltouAoNormal) falhas++;

  await prisma.$disconnect();
  console.log(falhas === 0 ? "\nGravação correta." : `\n${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();

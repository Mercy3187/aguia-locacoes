/**
 * Prova que a identificação do motorista funciona, usando CONTRATOS REAIS do
 * banco de DEV: monta o texto de um relatório do SENATRAN com a placa de um
 * contrato de verdade e uma data dentro do período, e confere que o sistema
 * aponta a pessoa certa.
 *
 * O teste ponta a ponta com os PDFs reais só produz "fora do histórico" —
 * todas aquelas multas são anteriores ao primeiro contrato registrado. Este
 * script cobre o outro lado: quando o sistema TEM a informação, ele acerta.
 *
 * Não grava nada.
 *
 * Uso: npx tsx dev-tools\testar-multas-identificacao.mts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { lerRelatorioSenatran } from "../src/lib/multas-senatran";
import {
  acharResponsavel,
  rotuloResponsavel,
  type ContratoNoPeriodo,
} from "../src/lib/multas-responsavel";

/** Monta um relatório igual ao do portal, para o texto passar pelo mesmo leitor. */
function relatorioFalso(placa: string, dataHora: string, auto: string, valor = "130,16") {
  const semHifen = placa.replace("-", "");
  return `Infrações do Veículo
 VEICULO DE TESTE - Placa ${semHifen}
NÃO PAGAS - VENCIDAS (1)
TOTAL DE REGISTROS ENCONTRADOS: 1
 ${dataHora} - TRANSITAR EM VELOCIDADE SUPERIOR A MAXIMA PERMITIDA EM ATE 20%
Placa: ${semHifen}
Auto de Infração: ${auto}  R$ ${valor}`;
}

let falhas = 0;
function confere(nome: string, ok: boolean, detalhe: string) {
  if (!ok) falhas++;
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}  (${detalhe})`);
}

async function main() {
  const [contratosBrutos, veiculos] = await Promise.all([
    prisma.contract.findMany({
      select: {
        id: true,
        vehicleId: true,
        startDate: true,
        endDate: true,
        status: true,
        customer: { select: { id: true, name: true, cpfCnpj: true } },
        vehicle: { select: { plate: true } },
      },
    }),
    prisma.vehicle.findMany({ select: { plate: true } }),
  ]);

  const contratos: ContratoNoPeriodo[] = contratosBrutos.map((c) => ({
    id: c.id,
    vehicleId: c.vehicleId,
    placa: c.vehicle.plate,
    clienteNome: c.customer.name,
    clienteId: c.customer.id,
    clienteDoc: c.customer.cpfCnpj,
    inicio: c.startDate,
    fim: c.status === "ATIVO" ? null : c.endDate,
  }));
  const placasDaFrota = new Set(veiculos.map((v) => v.plate));
  const inicioDoHistorico = contratos.reduce(
    (a, c) => (c.inicio < a ? c.inicio : a),
    contratos[0].inicio
  );

  // Um carro com UM contrato só, para a resposta ser inequívoca.
  const porPlaca = new Map<string, ContratoNoPeriodo[]>();
  for (const c of contratos) porPlaca.set(c.placa, [...(porPlaca.get(c.placa) ?? []), c]);
  const unico = [...porPlaca.values()].find((l) => l.length === 1)?.[0];
  if (!unico) throw new Error("Nenhum carro com um único contrato no dev.");

  const dia = new Date(unico.inicio.getTime() + 5 * 86_400_000); // 5 dias após a retirada
  const dataHora =
    `${String(dia.getDate()).padStart(2, "0")}/${String(dia.getMonth() + 1).padStart(2, "0")}/` +
    `${dia.getFullYear()} 14:35`;

  console.log(`Contrato real: ${unico.clienteNome} — ${unico.placa}`);
  console.log(`  retirada em ${unico.inicio.toLocaleDateString("pt-BR")}`);
  console.log(`  multa simulada em ${dataHora}\n`);

  // ── 1. Multa durante a locação ──
  const r = lerRelatorioSenatran(relatorioFalso(unico.placa, dataHora, "TESTE00001"));
  confere("o leitor achou a multa", r.multas.length === 1, `${r.multas.length}`);

  const multa = r.multas[0];
  confere("a placa bate com a do cadastro", multa?.placa === unico.placa, multa?.placa ?? "—");

  const resp = acharResponsavel({
    placa: multa.placa,
    ocorridaEm: multa.ocorridaEm,
    contratos,
    placasDaFrota,
    inicioDoHistorico,
  });
  confere(
    "APONTOU O MOTORISTA CERTO",
    resp.tipo === "encontrado" && resp.clienteNome === unico.clienteNome,
    rotuloResponsavel(resp)
  );

  // ── 2. A mesma placa, um dia antes da retirada ──
  const antes = new Date(unico.inicio.getTime() - 86_400_000);
  const dataAntes =
    `${String(antes.getDate()).padStart(2, "0")}/${String(antes.getMonth() + 1).padStart(2, "0")}/` +
    `${antes.getFullYear()} 09:00`;
  const r2 = lerRelatorioSenatran(relatorioFalso(unico.placa, dataAntes, "TESTE00002"));
  const resp2 = acharResponsavel({
    placa: r2.multas[0].placa,
    ocorridaEm: r2.multas[0].ocorridaEm,
    contratos,
    placasDaFrota,
    inicioDoHistorico,
  });
  confere(
    "um dia ANTES da retirada não é atribuída a ele",
    resp2.tipo !== "encontrado",
    rotuloResponsavel(resp2)
  );

  // ── 3. Carro repassado (dois contratos ativos), se houver no dev ──
  const repassado = [...porPlaca.entries()].find(([, l]) => l.length > 1);
  if (repassado) {
    const [placa, lista] = repassado;
    const meio = new Date(
      Math.max(...lista.map((c) => c.inicio.getTime())) + 3 * 86_400_000
    );
    const dataMeio =
      `${String(meio.getDate()).padStart(2, "0")}/${String(meio.getMonth() + 1).padStart(2, "0")}/` +
      `${meio.getFullYear()} 12:00`;
    const r3 = lerRelatorioSenatran(relatorioFalso(placa, dataMeio, "TESTE00003"));
    const resp3 = acharResponsavel({
      placa: r3.multas[0].placa,
      ocorridaEm: r3.multas[0].ocorridaEm,
      contratos,
      placasDaFrota,
      inicioDoHistorico,
    });
    confere(
      `carro repassado (${placa}): avisa a ambiguidade em vez de chutar`,
      resp3.tipo === "ambiguo",
      rotuloResponsavel(resp3)
    );
  }

  // ── 4. Placa que não é da frota ──
  const r4 = lerRelatorioSenatran(relatorioFalso("ZZZ-9Z99", dataHora, "TESTE00004"));
  const resp4 = acharResponsavel({
    placa: r4.multas[0].placa,
    ocorridaEm: r4.multas[0].ocorridaEm,
    contratos,
    placasDaFrota,
    inicioDoHistorico,
  });
  confere("placa de fora da frota é sinalizada", resp4.tipo === "carro-desconhecido", rotuloResponsavel(resp4));

  await prisma.$disconnect();
  console.log(falhas === 0 ? "\nA identificação funciona." : `\n${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();

/**
 * Roda a aba de Multas de ponta a ponta contra os PDFs REAIS e o banco de DEV:
 * abre o PDF, lê as infrações e cruza com os contratos para achar quem estava
 * com o carro — usando os mesmos módulos que a tela usa.
 *
 * Não grava nada.
 *
 * Uso: npx tsx dev-tools\testar-multas-ponta-a-ponta.mts <arquivo.pdf> [...]
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { prisma } from "../src/lib/prisma";
import { lerRelatorioSenatran } from "../src/lib/multas-senatran";
import {
  acharResponsavel,
  rotuloResponsavel,
  type ContratoNoPeriodo,
} from "../src/lib/multas-responsavel";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function main() {
  const arquivos = process.argv.slice(2);
  if (!arquivos.length) throw new Error("Passe ao menos um PDF.");

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
  const inicioDoHistorico = contratos.length
    ? contratos.reduce((a, c) => (c.inicio < a ? c.inicio : a), contratos[0].inicio)
    : null;

  console.log(
    `Frota: ${placasDaFrota.size} carros | Contratos: ${contratos.length} | ` +
      `Histórico desde ${inicioDoHistorico?.toLocaleDateString("pt-BR")}\n`
  );

  let falhas = 0;
  const linhas: Array<{ data: Date; placa: string; valor: number; quem: string; tipo: string }> = [];
  const autos = new Set<string>();
  let repetidas = 0;

  for (const f of arquivos) {
    const pdf = await getDocumentProxy(new Uint8Array(await readFile(f)));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const r = lerRelatorioSenatran(text);

    // A checagem que mais importa: o portal diz quantas encontrou. Se lermos
    // menos, alguma multa está passando batido — em silêncio.
    const bate = r.totalDeclarado == null || r.multas.length >= r.totalDeclarado;
    if (!bate) falhas++;
    console.log(
      `${bate ? "OK   " : "FALHA"} ${basename(f).padEnd(36)} leu ${String(r.multas.length).padStart(2)} de ${r.totalDeclarado} ` +
        `(${totalPages} pág.)`
    );

    for (const m of r.multas) {
      if (autos.has(m.auto)) {
        repetidas++;
        continue;
      }
      autos.add(m.auto);
      const resp = acharResponsavel({
        placa: m.placa,
        ocorridaEm: m.ocorridaEm,
        contratos,
        placasDaFrota,
        inicioDoHistorico,
      });
      linhas.push({
        data: m.ocorridaEm,
        placa: m.placa,
        valor: m.valor,
        quem: rotuloResponsavel(resp),
        tipo: resp.tipo,
      });
    }
  }

  const total = linhas.reduce((s, l) => s + l.valor, 0);
  console.log(`\nTOTAL: ${linhas.length} multas, ${brl(total)}`);
  if (repetidas) console.log(`  (${repetidas} repetida(s) entre relatórios, contadas uma vez)`);

  const porTipo = new Map<string, { n: number; valor: number }>();
  for (const l of linhas) {
    const a = porTipo.get(l.tipo) ?? { n: 0, valor: 0 };
    a.n++;
    a.valor += l.valor;
    porTipo.set(l.tipo, a);
  }
  console.log("\nComo o sistema classificou cada uma:");
  for (const [tipo, v] of [...porTipo.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${tipo.padEnd(20)} ${String(v.n).padStart(3)} multas  ${brl(v.valor)}`);
  }

  const identificadas = linhas.filter((l) => l.tipo === "encontrado");
  if (identificadas.length) {
    const porPessoa = new Map<string, { n: number; valor: number }>();
    for (const l of identificadas) {
      const a = porPessoa.get(l.quem) ?? { n: 0, valor: 0 };
      a.n++;
      a.valor += l.valor;
      porPessoa.set(l.quem, a);
    }
    console.log("\nPor motorista:");
    for (const [nome, v] of [...porPessoa.entries()].sort((a, b) => b[1].valor - a[1].valor)) {
      console.log(`  ${nome.slice(0, 30).padEnd(32)} ${String(v.n).padStart(2)} multas  ${brl(v.valor)}`);
    }
  }

  console.log("\nAmostra (mais recentes):");
  for (const l of [...linhas].sort((a, b) => +b.data - +a.data).slice(0, 6)) {
    console.log(
      `  ${l.data.toLocaleDateString("pt-BR")} ${l.placa.padEnd(9)} ${brl(l.valor).padStart(10)}  ${l.quem}`
    );
  }

  await prisma.$disconnect();
  console.log(falhas === 0 ? "\nLeitura completa: nenhuma multa ficou para trás." : `\n${falhas} arquivo(s) com multa faltando.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();

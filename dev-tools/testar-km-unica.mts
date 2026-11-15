/**
 * Prova que a KM é ÚNICA: altera a quilometragem de um carro pelo caminho
 * central (src/lib/km.ts) e confere que o número novo aparece em todas as
 * telas — controle de KM, veículos, óleo e correia — sem ninguém precisar
 * repetir a atualização em cada uma.
 *
 * Roda contra o banco de DEV e devolve a KM ao valor original no fim.
 *
 * Uso (com o `npm run dev` ligado):
 *   npx tsx dev-tools\testar-km-unica.mts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { escreverKm, SELECT_VEICULO_KM } from "../src/lib/km";
import { computeOil } from "../src/lib/oil";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const EMAIL = "admin@aguialocacoes.com.br";
const SENHA = "dev123456";

/** Faz login e devolve o cabeçalho Cookie da sessão. */
async function logar(): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const cookies = [csrfRes.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")];

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookies[0] },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: SENHA, redirect: "false" }),
  });
  const sessao = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => c.includes("session-token"));
  if (!sessao.length) throw new Error("Login falhou — nenhuma sessão devolvida.");
  return [cookies[0], ...sessao].join("; ");
}

/** Busca uma tela e devolve o HTML. */
async function tela(rota: string, cookie: string): Promise<string> {
  const res = await fetch(`${BASE}${rota}`, { headers: { cookie }, redirect: "manual" });
  if (res.status !== 200) throw new Error(`${rota} respondeu ${res.status}`);
  return res.text();
}

async function main() {
  const cookie = await logar();

  // Um carro com óleo e correia controlados: assim dá para ver as três telas
  // reagirem à mesma alteração.
  const veiculo = await prisma.vehicle.findFirst({
    where: { lastOilChangeKm: { not: null }, status: { not: "VENDIDO" } },
    select: { ...SELECT_VEICULO_KM, nextOilChangeKm: true, oilStatus: true },
  });
  if (!veiculo) throw new Error("Nenhum veículo com troca de óleo registrada no dev.");

  const original = veiculo.currentKm;
  // KM que deixa o óleo VENCIDO: é a prova de que a troca de óleo enxergou o
  // número novo, e não só de que ele foi gravado em algum lugar.
  const nova = (veiculo.nextOilChangeKm ?? original) + 1_500;

  console.log(`Carro: ${veiculo.plate}`);
  console.log(`  KM antes .............. ${original.toLocaleString("pt-BR")}`);
  console.log(`  próxima troca de óleo . ${veiculo.nextOilChangeKm?.toLocaleString("pt-BR")}`);
  console.log(`  status do óleo antes .. ${veiculo.oilStatus}`);
  console.log(`\nAlterando para ${nova.toLocaleString("pt-BR")} km pelo caminho central...\n`);

  await prisma.$transaction(async (tx) => {
    await escreverKm(tx, veiculo, nova);
  });

  const depois = await prisma.vehicle.findUniqueOrThrow({
    where: { id: veiculo.id },
    select: { currentKm: true, nextOilChangeKm: true, oilStatus: true },
  });

  const esperado = computeOil(nova, veiculo.lastOilChangeKm, veiculo.oilChangeIntervalKm);
  const kmFmt = nova.toLocaleString("pt-BR");

  const checagens: Array<[string, boolean, string]> = [
    ["banco: current_km atualizado", depois.currentKm === nova, `${depois.currentKm}`],
    [
      "banco: óleo recalculado junto (sem passo manual)",
      depois.oilStatus === esperado.oilStatus,
      `${veiculo.oilStatus} → ${depois.oilStatus}`,
    ],
  ];

  // As telas: o mesmo número tem de aparecer nas quatro, sem tocar em nada.
  for (const [rota, nome] of [
    ["/quilometragem", "tela Controle de KM"],
    ["/veiculos", "tela Veículos"],
    ["/oleo", "tela Troca de óleo"],
    ["/correia", "tela Correia"],
  ] as const) {
    const html = await tela(rota, cookie);
    // A tela da correia só lista carros com correia registrada; se este não
    // for um deles, basta que a página abra sem erro.
    const listaOCarro = html.includes(veiculo.plate);
    const mostraKm = html.includes(kmFmt);
    checagens.push([
      `${nome} mostra ${kmFmt} km`,
      mostraKm || !listaOCarro,
      listaOCarro ? (mostraKm ? "sim" : "NÃO") : "carro não listado nesta tela",
    ]);
  }

  let falhas = 0;
  for (const [nome, ok, detalhe] of checagens) {
    if (!ok) falhas++;
    console.log(`${ok ? "OK   " : "FALHA"} ${nome}  (${detalhe})`);
  }

  // Devolve o carro ao estado em que estava — este script não pode deixar
  // rastro nos dados de ninguém.
  await prisma.$transaction(async (tx) => {
    await escreverKm(tx, { ...veiculo, currentKm: nova }, original);
  });
  console.log(`\nKM devolvida para ${original.toLocaleString("pt-BR")}.`);

  await prisma.$disconnect();
  console.log(falhas === 0 ? "\nA KM é única: uma alteração valeu em todas as telas." : `\n${falhas} falha(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();

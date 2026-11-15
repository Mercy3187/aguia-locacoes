/**
 * Teste ponta a ponta de Gerar Contrato → Devolução, contra o servidor de
 * desenvolvimento e o banco do .env.
 *
 * Envia os formulários do jeito que o navegador envia sem JavaScript: o HTML
 * renderizado traz campos escondidos ($ACTION_*) que identificam a server
 * action, e o POST com eles roda EXATAMENTE o mesmo código do clique em
 * "Salvar" — validação, transação, auditoria, redirecionamento.
 *
 * Cria um cliente e um carro de teste (placa ZZT-0E00) e apaga tudo no fim,
 * passe ou falhe.
 *
 * Uso: npx tsx dev-tools/testar-contrato-ponta-a-ponta.mts
 *      (servidor rodando em http://localhost:3000)
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { configConexao } from "../src/lib/db-conexao";

const BASE = process.env.BASE || "http://localhost:3000";
const EMAIL = process.env.SEED_ADMIN_EMAIL!;
const SENHA = process.env.SEED_ADMIN_PASSWORD!;
const PLACA = "ZZT-0E00";

const prisma = new PrismaClient({ adapter: new PrismaPg(configConexao(process.env.DATABASE_URL!)) });

let falhas = 0;
const ok = (nome: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "✓" : "✗"} ${nome}${extra ? ` — ${extra}` : ""}`);
  if (!cond) falhas++;
};

// ── Sessão (cookies) ────────────────────────────────────────────────────
const cookies = new Map<string, string>();
const guardar = (res: Response) => {
  for (const linha of res.headers.getSetCookie?.() ?? []) {
    const [par] = linha.split(";");
    const i = par.indexOf("=");
    cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
  }
};
const cabecalhoCookie = () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");

async function entrar() {
  const r1 = await fetch(`${BASE}/api/auth/csrf`);
  guardar(r1);
  const { csrfToken } = (await r1.json()) as { csrfToken: string };
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cabecalhoCookie() },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: SENHA, redirect: "false" }),
    redirect: "manual",
  });
  guardar(r2);
}

async function pagina(rota: string) {
  const r = await fetch(`${BASE}${rota}`, { headers: { cookie: cabecalhoCookie() }, redirect: "manual" });
  // O React separa texto e expressão com "<!-- -->" ("4<!-- -->ª fatura");
  // o navegador não mostra, então o teste também não deve enxergar.
  const html = (await r.text()).replace(/<!-- -->/g, "");
  return { status: r.status, html, location: r.headers.get("location") };
}

const desescapar = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Os campos $ACTION_* do formulário que contém `campoMarcador`. */
function camposDaAcao(html: string, campoMarcador: string): [string, string][] {
  const forms = html.split(/<form\b/).slice(1).map((f) => f.split("</form>")[0]);
  const form = forms.find((f) => f.includes(`name="${campoMarcador}"`));
  if (!form) throw new Error(`Formulário com o campo "${campoMarcador}" não encontrado.`);
  const out: [string, string][] = [];
  for (const m of form.matchAll(/<input\b[^>]*>/g)) {
    const tag = m[0];
    const nome = /name="([^"]*)"/.exec(tag)?.[1];
    if (!nome?.startsWith("$ACTION")) continue;
    out.push([desescapar(nome), desescapar(/value="([^"]*)"/.exec(tag)?.[1] ?? "")]);
  }
  if (!out.length) throw new Error("Campos $ACTION_* não encontrados no formulário.");
  return out;
}

async function enviar(rota: string, acao: [string, string][], campos: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of acao) fd.append(k, v);
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  const r = await fetch(`${BASE}${rota}`, {
    method: "POST",
    headers: { cookie: cabecalhoCookie() },
    body: fd,
    redirect: "manual",
  });
  return { status: r.status, location: r.headers.get("location"), html: await r.text() };
}

/** Mensagem de erro do formulário, se a action devolveu uma. */
const erroNaTela = (html: string) =>
  /border-danger\/40[^>]*>([^<]+)</.exec(html)?.[1]?.trim() ?? null;

// ── Fixtures ────────────────────────────────────────────────────────────
async function limpar() {
  const v = await prisma.vehicle.findUnique({ where: { plate: PLACA }, select: { id: true } });
  if (v) {
    const contratos = await prisma.contract.findMany({ where: { vehicleId: v.id }, select: { id: true } });
    const ids = contratos.map((c) => c.id);
    await prisma.kmRequest.deleteMany({ where: { contractId: { in: ids } } });
    await prisma.contract.deleteMany({ where: { id: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [...ids, v.id] } } });
    await prisma.vehicle.delete({ where: { id: v.id } });
  }
  const c = await prisma.customer.findMany({ where: { name: "CLIENTE TESTE PONTA A PONTA" }, select: { id: true } });
  await prisma.customer.deleteMany({ where: { id: { in: c.map((x) => x.id) } } });
}

async function main() {
  await limpar();
  const cliente = await prisma.customer.create({
    data: { name: "CLIENTE TESTE PONTA A PONTA", cpfCnpj: "529.982.247-25", personType: "FISICA" },
  });
  const carro = await prisma.vehicle.create({
    data: { plate: PLACA, brand: "Fiat", model: "Mobi Teste", currentKm: 10_000, lastOilChangeKm: 9_000 },
  });

  await entrar();
  ok("login como admin", cookies.size > 0 && [...cookies.keys()].some((k) => k.includes("session")));

  // ── Gerar contrato ──
  const tela = await pagina("/contratos/gerar");
  ok("tela Gerar Contrato abre", tela.status === 200, `HTTP ${tela.status}`);
  ok("carro de teste aparece na lista", tela.html.includes(PLACA));

  const r = await enviar("/contratos/gerar", camposDaAcao(tela.html, "deliveryOdometer"), {
    customerId: cliente.id,
    billingMode: "ANTECIPADO",
    periodType: "SEMANAS",
    invoiceCount: "4",
    promoterId: "",
    classification: "APLICATIVO",
    billingUnit: "UNIDADE DE COMPRA DO VEÍCULO",
    hiringDelivery: "RETIRADA NA LOJA",
    additionalInfo: "FRANQUIA DE KM: LIVRE",
    vehicleId: carro.id,
    priceTable: "PADRÃO",
    kmFranchise: "KM LIVRE",
    periodValue: "650,00",
    deliveryOdometer: "10250",
    deliveryAt: "2026-10-20T09:30",
    deliveryFuel: "CHEIO",
    startDate: "2026-10-20",
    firstPaymentReceived: "on",
    depositValue: "800,00",
    depositReceivedAt: "2026-10-20",
    depositPaymentMethod: "PIX",
    itens: JSON.stringify([
      { inicio: "2026-10-27", fim: "2026-11-02", descricao: "Cadeirinha", valor: "30,00", ativo: true },
    ]),
  });
  const erro = erroNaTela(r.html);
  ok("contrato salvo (redireciona para a ficha)", r.status === 303 && !!r.location?.includes("/contratos/"), erro ?? `HTTP ${r.status} → ${r.location}`);

  const contrato = await prisma.contract.findFirst({
    where: { vehicleId: carro.id },
    include: { items: true, vehicle: true },
  });
  ok("contrato gravado no banco", !!contrato);
  if (!contrato) return;
  ok("status ATIVO", contrato.status === "ATIVO");
  ok("período/valor/faturas", contrato.periodType === "SEMANAS" && Number(contrato.periodValue) === 650 && contrato.invoiceCount === 4);
  ok("valor semanal preenchido", Number(contrato.weeklyValue) === 650);
  ok("início sem escorregar de dia", contrato.startDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === "20/10/2026", contrato.startDate.toISOString());
  ok("fim do lote = 4 semanas depois", contrato.endDate?.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === "17/11/2026", contrato.endDate?.toISOString());
  ok("entrega registrada (data, km, tanque)", !!contrato.pickupDate && contrato.deliveryOdometer === 10_250 && contrato.deliveryFuel === "CHEIO");
  ok("caução recebida via PIX", Number(contrato.depositPaidValue) === 800 && contrato.depositPaymentMethod === "PIX");
  ok("primeiro pagamento marcado", contrato.firstPaymentReceived);
  ok("item adicional gravado", contrato.items.length === 1 && Number(contrato.items[0].value) === 30);
  ok("carro passou para ALUGADO", contrato.vehicle.status === "ALUGADO", contrato.vehicle.status);
  ok("KM do carro atualizada pela entrega", contrato.vehicle.currentKm === 10_250, String(contrato.vehicle.currentKm));

  // Mesmo carro de novo: tem que recusar.
  const dup = await enviar("/contratos/gerar", camposDaAcao(tela.html, "deliveryOdometer"), {
    customerId: cliente.id, billingMode: "ANTECIPADO", periodType: "SEMANAS", invoiceCount: "4",
    billingUnit: "UNIDADE DE COMPRA DO VEÍCULO", vehicleId: carro.id, periodValue: "650,00",
    deliveryOdometer: "10300", deliveryAt: "2026-10-21T09:30", deliveryFuel: "CHEIO",
    startDate: "2026-10-21", itens: "[]",
  });
  ok("recusa entregar carro que já está alugado", dup.status !== 303 && (erroNaTela(dup.html) ?? "").includes("já está com"), erroNaTela(dup.html) ?? `HTTP ${dup.status}`);

  // ── Ficha do contrato ──
  const ficha = await pagina(`/contratos/${contrato.id}`);
  ok("ficha do contrato abre", ficha.status === 200, `HTTP ${ficha.status}`);
  ok("ficha mostra as faturas", ficha.html.includes("FATURAS") && ficha.html.includes("4ª fatura"));
  ok("ficha mostra o bloco de devolução", ficha.html.includes("DEVOLUÇÃO DO VEÍCULO"));

  // ── Devolução ──
  const dev = await enviar(`/contratos/${contrato.id}`, camposDaAcao(ficha.html, "odometro"), {
    em: "2026-10-23T18:00",
    odometro: "11040",
    combustivel: "1/2",
    observacao: "Arranhão no para-choque traseiro",
  });
  ok("devolução aceita", dev.status === 200 || dev.status === 303, erroNaTela(dev.html) ?? `HTTP ${dev.status}`);
  const depois = await prisma.contract.findUnique({ where: { id: contrato.id }, include: { vehicle: true } });
  ok("contrato ENCERRADO", depois?.status === "ENCERRADO", depois?.status);
  ok("devolução gravada (data, km, tanque, obs)", !!depois?.returnedAt && depois.returnOdometer === 11_040 && depois.returnFuel === "1/2" && !!depois.returnNotes);
  ok("carro voltou para DISPONIVEL", depois?.vehicle.status === "DISPONIVEL", depois?.vehicle.status);
  ok("KM do carro atualizada pela devolução", depois?.vehicle.currentKm === 11_040, String(depois?.vehicle.currentKm));

  // ── Linha do tempo ──
  const ficheVeiculo = await pagina(`/veiculos/${carro.id}`);
  ok("ficha do veículo abre", ficheVeiculo.status === 200, `HTTP ${ficheVeiculo.status}`);
  ok("linha do tempo mostra o cliente", ficheVeiculo.html.includes("Linha do tempo") && ficheVeiculo.html.includes("CLIENTE TESTE PONTA A PONTA"));
  ok("linha do tempo mostra os km rodados", ficheVeiculo.html.includes("790") && ficheVeiculo.html.includes("km rodados"));

  const auditoria = await prisma.auditLog.count({ where: { entityId: contrato.id } });
  ok("auditoria registrou geração e devolução", auditoria >= 2, `${auditoria} registro(s)`);
}

try {
  await main();
} catch (e) {
  falhas++;
  console.error("✗ erro inesperado:", e);
} finally {
  await limpar();
  console.log("(dados de teste apagados)");
  await prisma.$disconnect();
}
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

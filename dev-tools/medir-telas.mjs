/**
 * Mede o tempo de resposta de cada tela, já logado.
 *
 * Roda cada rota várias vezes e mostra a MEDIANA — a média é enganada por um
 * único acesso lento, e o que interessa aqui é o tempo que a pessoa sente na
 * maioria das vezes. A primeira medida de cada rota é descartada: em produção
 * ela paga o custo de abrir conexão com o banco, que não se repete.
 *
 * Uso: npm run build && npm start  e  node dev-tools/medir-telas.mjs
 */
import "dotenv/config";

const BASE = process.env.MEDIR_BASE ?? "http://localhost:3000";
const VOLTAS = Number(process.env.MEDIR_VOLTAS ?? 5);
const biscoitos = new Map();

function guardar(res) {
  for (const l of res.headers.getSetCookie?.() ?? []) {
    const [p] = l.split(";");
    const i = p.indexOf("=");
    biscoitos.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
}
const cabecalho = () => [...biscoitos].map(([k, v]) => `${k}=${v}`).join("; ");

const r1 = await fetch(`${BASE}/api/auth/csrf`);
guardar(r1);
const { csrfToken } = await r1.json();
guardar(
  await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cabecalho() },
    body: new URLSearchParams({
      csrfToken,
      email: "admin@aguialocacoes.com.br",
      password: "dev123456",
      redirect: "false",
    }),
    redirect: "manual",
  })
);

export const ROTAS = [
  "/dashboard",
  "/motoristas",
  "/alertas",
  "/manutencao",
  "/oleo",
  "/correia",
  "/quilometragem",
  "/quilometragem/registros",
  "/veiculos",
  "/contratos",
  "/clientes",
  "/cobranca",
  "/relatorios",
  "/fechamento",
  "/caucoes",
  "/dividas",
  "/inadimplencia",
  "/auditoria",
];

const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function medir(rota) {
  const tempos = [];
  let bytes = 0;
  let status = 0;
  for (let i = 0; i <= VOLTAS; i++) {
    const t = Date.now();
    const r = await fetch(`${BASE}${rota}`, { headers: { cookie: cabecalho() }, cache: "no-store" });
    const html = await r.text();
    const dt = Date.now() - t;
    status = r.status;
    bytes = html.length;
    if (i > 0) tempos.push(dt); // descarta a primeira (conexão fria)
  }
  return { rota, status, ms: mediana(tempos), pior: Math.max(...tempos), bytes };
}

const linhas = [];
for (const rota of ROTAS) linhas.push(await medir(rota));
linhas.sort((a, b) => b.ms - a.ms);

console.log(`\nMediana de ${VOLTAS} acessos por tela (primeira descartada) — ${BASE}\n`);
console.log("  TELA                          STATUS   MEDIANA     PIOR      HTML");
for (const l of linhas) {
  const alerta = l.ms >= 1000 ? " <-- lenta" : l.ms >= 500 ? " <-- atencao" : "";
  console.log(
    `  ${l.rota.padEnd(28)} ${String(l.status).padStart(4)}  ${String(l.ms).padStart(7)}ms ${String(
      l.pior
    ).padStart(6)}ms  ${String(Math.round(l.bytes / 1024)).padStart(5)}kB${alerta}`
  );
}
const soma = linhas.reduce((s, l) => s + l.ms, 0);
console.log(`\n  Soma das medianas: ${soma}ms em ${linhas.length} telas`);

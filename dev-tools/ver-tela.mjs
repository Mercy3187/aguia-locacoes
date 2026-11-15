/**
 * Faz login no servidor de desenvolvimento e baixa o HTML de uma tela.
 * Serve para conferir se a pagina renderiza sem erro sem precisar abrir o
 * navegador. Uso: node dev-tools\ver-tela.mjs /dashboard
 */
const BASE = process.env.BASE || "http://localhost:3000";
const EMAIL = process.env.EMAIL || "admin@aguialocacoes.com.br";
const SENHA = process.env.SENHA || "dev123456";
const rota = process.argv[2] || "/dashboard";

const biscoitos = new Map();

function guardar(res) {
  for (const linha of res.headers.getSetCookie?.() ?? []) {
    const [par] = linha.split(";");
    const i = par.indexOf("=");
    biscoitos.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
  }
}
const cabecalho = () =>
  [...biscoitos].map(([k, v]) => `${k}=${v}`).join("; ");

// 1. token anti-CSRF
const r1 = await fetch(`${BASE}/api/auth/csrf`);
guardar(r1);
const { csrfToken } = await r1.json();

// 2. login pelo endpoint do NextAuth
const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    cookie: cabecalho(),
  },
  body: new URLSearchParams({ csrfToken, email: EMAIL, password: SENHA, redirect: "false" }),
  redirect: "manual",
});
guardar(r2);

const logado = [...biscoitos.keys()].some((k) => k.includes("session-token"));
console.log(`login: ${logado ? "OK" : "FALHOU"} (HTTP ${r2.status})`);
if (!logado) process.exit(1);

// 3. a tela pedida
const r3 = await fetch(`${BASE}${rota}`, { headers: { cookie: cabecalho() } });
const html = await r3.text();
console.log(`GET ${rota} -> HTTP ${r3.status}, ${html.length} bytes`);

const erro = html.match(/Application error|Unhandled Runtime Error|call-stack|__next_error__/i);
console.log(`erro de runtime na pagina: ${erro ? "SIM -> " + erro[0] : "nao"}`);

for (const alvo of process.argv.slice(3)) {
  console.log(`  contem "${alvo}": ${html.includes(alvo) ? "sim" : "NAO"}`);
}

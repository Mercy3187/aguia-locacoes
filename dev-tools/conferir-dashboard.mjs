/**
 * Compara o que o dashboard mostra com o que o banco diz.
 * Uso: node dev-tools\conferir-dashboard.mjs
 */
import pg from "pg";

const BASE = "http://localhost:3000";
const b = new Map();
const guardar = (r) => {
  for (const l of r.headers.getSetCookie?.() ?? []) {
    const [p] = l.split(";");
    const i = p.indexOf("=");
    b.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
};
const ck = () => [...b].map(([k, v]) => `${k}=${v}`).join("; ");

const r1 = await fetch(`${BASE}/api/auth/csrf`);
guardar(r1);
const { csrfToken } = await r1.json();
guardar(
  await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: ck() },
    body: new URLSearchParams({
      csrfToken,
      email: "admin@aguialocacoes.com.br",
      password: "dev123456",
      redirect: "false",
    }),
    redirect: "manual",
  })
);

const html = (
  await fetch(`${BASE}/dashboard`, { headers: { cookie: ck() }, cache: "no-store" })
).text
  ? await (await fetch(`${BASE}/dashboard`, { headers: { cookie: ck() } })).text()
  : "";

/** Pega o primeiro valor em R$ que aparece depois de um rótulo. */
function valorApos(rotulo) {
  const i = html.indexOf(rotulo);
  if (i < 0) return "(rótulo ausente)";
  const trecho = html.slice(i, i + 900).replace(/<!--[^>]*-->/g, "").replace(/<[^>]+>/g, "|");
  const m = trecho.match(/R\$\s?[\d.]+,\d{2}/);
  return m ? m[0].replace(/\s/g, " ") : "(sem valor)";
}

const db = new pg.Client({
  connectionString: process.env.URL_DEV,
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const brl = (n) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PAGO = `('RECEIVED','CONFIRMED','RECEIVED_IN_CASH')`;

const { rows: semana } = await db.query(
  `select coalesce(sum(value),0)::numeric total
     from public.payments
    where status in ${PAGO}
      and payment_date >= date_trunc('week', now())`
);
const { rows: fechada } = await db.query(
  `select coalesce(sum(value),0)::numeric total
     from public.payments
    where status in ${PAGO}
      and payment_date >= date_trunc('week', now()) - interval '7 days'
      and payment_date <  date_trunc('week', now())`
);
const { rows: atras } = await db.query(
  `select coalesce(sum(value),0)::numeric total, count(*)::int qtd,
          count(distinct customer_id)::int clientes
     from public.payments where status = 'OVERDUE'`
);
const { rows: meta } = await db.query(
  `select coalesce(sum(weekly_value),0)::numeric total
     from public.contracts where status='ATIVO'`
);
const { rows: frota } = await db.query(
  `select count(*) filter (where status='ALUGADO')::int alugados, count(*)::int total
     from public.vehicles`
);
const { rows: cart } = await db.query(
  `select coalesce(sum(value) filter (where status in ${PAGO}),0)::numeric recebido,
          coalesce(sum(value) filter (where status not in ${PAGO}
                    and status not in ('REFUNDED','REFUND_REQUESTED','CHARGEBACK_REQUESTED','DELETED')
                    and status <> 'OVERDUE'),0)::numeric a_vencer
     from public.payments`
);

const linha = (nome, banco, tela) => {
  const ok = String(tela).replace(/ /g, " ").includes(String(banco).replace(/ /g, " ").replace("R$ ", ""));
  console.log(`  ${ok ? "OK  " : "VER "} ${nome.padEnd(26)} banco: ${String(banco).padEnd(14)} tela: ${tela}`);
};

console.log("CONFERÊNCIA DO DASHBOARD\n");
linha("Recebido nesta semana", brl(semana[0].total), valorApos("Recebido nesta semana"));
linha("Última semana fechada", brl(fechada[0].total), valorApos("Última semana fechada"));
linha("Em atraso", brl(atras[0].total), valorApos("Em atraso"));
linha("Meta semanal", brl(meta[0].total), valorApos("contratados"));
linha("Carteira: recebido", brl(cart[0].recebido), valorApos("Já recebido"));
linha("Carteira: a vencer", brl(cart[0].a_vencer), valorApos("A vencer"));

const ocup = Math.round((frota[0].alugados / frota[0].total) * 100);
const iOc = html.indexOf("Ocupação da frota");
const trechoOc = html.slice(iOc, iOc + 700).replace(/<!--[^>]*-->/g, "").replace(/<[^>]+>/g, "|");
console.log(`  ---  Ocupação                 banco: ${ocup}%          tela contém "${ocup}%": ${trechoOc.includes(ocup + "%") ? "sim" : "NÃO"}`);
console.log(`  ---  Atraso: ${atras[0].qtd} cobranças de ${atras[0].clientes} motoristas → tela: ${html.includes(`${atras[0].qtd} cobranças de ${atras[0].clientes} motoristas`) ? "confere" : "VERIFICAR"}`);

await db.end();

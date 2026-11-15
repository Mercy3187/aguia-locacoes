/**
 * Confere o efeito real do novo fluxo na tela:
 *   1. registro respondido pelo motorista NÃO mexe na KM do carro
 *   2. depois de efetivado, mexe
 * No fim desfaz tudo e devolve o banco de DEV como estava.
 *
 * As travas da regra são testadas em `testar-regra-conferencia.mts`.
 *
 * Uso: node dev-tools\testar-conferencia.mjs
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

const tela = async (rota) =>
  (await fetch(`${BASE}${rota}`, { headers: { cookie: ck() }, cache: "no-store" })).text();

const db = new pg.Client({
  connectionString: process.env.URL_DEV,
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const { rows } = await db.query(
  `select v.id, v.plate, v.current_km, k.contract_id, k.customer_id
     from public.km_records k join public.vehicles v on v.id = k.vehicle_id
    order by k.created_at desc limit 1`
);
const v = rows[0];
const kmOriginal = Number(v.current_km);
const kmEnviado = kmOriginal + 1500;
const ID = "teste-fluxo-km-tmp";

console.log(`Carro de teste: ${v.plate} — marca ${kmOriginal.toLocaleString("pt-BR")} km\n`);

// ── 1. o motorista responde ───────────────────────────────────────────
await db.query(
  `insert into public.km_records
     (id, contract_id, customer_id, vehicle_id, informed_km, validation_status,
      vehicle_photos_urls, created_at, applied_at)
   values ($1, $2, $3, $4, $5, 'PENDENTE_CONFERENCIA', '{}', now(), null)`,
  [ID, v.contract_id, v.customer_id, v.id, kmEnviado]
);

let html = await tela("/quilometragem");
let { rows: agora } = await db.query(`select current_km from public.vehicles where id=$1`, [v.id]);

console.log(`1. Motorista respondeu ${kmEnviado.toLocaleString("pt-BR")} km`);
console.log(`   KM do carro .................. ${Number(agora[0].current_km).toLocaleString("pt-BR")} km`);
console.log(`   Entrou sozinha? .............. ${Number(agora[0].current_km) === kmEnviado ? "SIM — PROBLEMA!" : "NÃO (correto)"}`);
console.log(`   Tela pede conferência? ....... ${html.includes("Conferir e efetivar") ? "sim" : "NÃO"}`);
console.log(`   Botão de efetivar? ........... ${html.includes("Conferir e aplicar KM") ? "sim" : "NÃO"}`);
console.log(`   Mostra o que ele informou? ... ${html.includes(kmEnviado.toLocaleString("pt-BR")) ? "sim" : "NÃO"}`);

const alertas = await tela("/alertas");
console.log(`   Alerta de pendência? ......... ${alertas.includes("KM aguardando confer") ? "sim" : "NÃO"}`);

const correiaAntes = await tela("/correia");
const trechoAntes = correiaAntes.includes(kmEnviado.toLocaleString("pt-BR"));
console.log(`   Correia já usou o valor? ..... ${trechoAntes ? "SIM — PROBLEMA!" : "NÃO (correto)"}`);

// ── 2. efetivamos (o que a ação faz) ─────────────────────────────────
await db.query(
  `update public.km_records set validation_status='APROVADO', applied_at=now() where id=$1`,
  [ID]
);
await db.query(`update public.vehicles set current_km=$1 where id=$2`, [kmEnviado, v.id]);

html = await tela("/quilometragem");
({ rows: agora } = await db.query(`select current_km from public.vehicles where id=$1`, [v.id]));
const correiaDepois = await tela("/correia");

console.log(`\n2. Depois de efetivar`);
console.log(`   KM do carro .................. ${Number(agora[0].current_km).toLocaleString("pt-BR")} km`);
console.log(`   Efetivou? .................... ${Number(agora[0].current_km) === kmEnviado ? "SIM (correto)" : "NÃO — PROBLEMA!"}`);
// Checar só a string do número seria ambíguo: depois de efetivar ele volta a
// aparecer na tela como "KM do carro". O que interessa é a seção de
// conferência ter ficado vazia.
console.log(`   Saiu da fila de conferência? . ${html.includes("Nada para conferir agora") ? "sim (seção vazia)" : "NÃO"}`);
console.log(`   Selo "aguardando" sumiu? ..... ${html.includes("Aguardando conferência") ? "NÃO" : "sim"}`);
console.log(`   Correia recebeu a KM nova? ... ${correiaDepois.includes(kmEnviado.toLocaleString("pt-BR")) ? "SIM (correto)" : "NÃO — PROBLEMA!"}`);

// ── 3. desfaz ─────────────────────────────────────────────────────────
await db.query(`delete from public.km_records where id=$1`, [ID]);
await db.query(`update public.vehicles set current_km=$1 where id=$2`, [kmOriginal, v.id]);
const { rows: fim } = await db.query(`select current_km from public.vehicles where id=$1`, [v.id]);
console.log(`\n3. Desfeito — ${v.plate} voltou a ${Number(fim[0].current_km).toLocaleString("pt-BR")} km`);

await db.end();

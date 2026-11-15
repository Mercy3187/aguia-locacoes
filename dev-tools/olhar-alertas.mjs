/** Quantos alertas estão ativos e de que assunto são. */
import pg from "pg";

const c = new pg.Client({
  connectionString: process.env.URL_DEV,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const um = async (rotulo, sql) => {
  const r = await c.query(sql);
  const n = Number(Object.values(r.rows[0])[0]);
  console.log(`  ${String(n).padStart(3)}  ${rotulo}`);
  return n;
};

console.log("ALERTAS ATIVOS NO DEV:\n");
let total = 0;
let ativos = 0;
const conta = async (rotulo, sql) => {
  const n = await um(rotulo, sql);
  total += n;
  if (n > 0) ativos++;
};

await conta("KM quinzenal vencida", `select count(*) from public.contracts where status='ATIVO' and next_km_request_date < now()`);
await conta("KM quinzenal pendente", `select count(*) from public.km_requests where status='ENVIADO' and used_at is null and (expires_at is null or expires_at >= now())`);
await conta("Links de KM expirados", `select count(*) from public.km_requests where status='ENVIADO' and used_at is null and expires_at < now()`);
await conta("KM aguardando conferência", `select count(*) from public.km_records where applied_at is null`);
await conta("Registros suspeitos", `select count(*) from public.km_records where validation_status='SUSPEITO'`);
await conta("Trocas de óleo vencidas", `select count(*) from public.vehicles where oil_status='VERMELHO'`);
await conta("Trocas de óleo próximas", `select count(*) from public.vehicles where oil_status='AMARELO'`);
await conta("Correias vencidas", `select count(*) from public.vehicles where status<>'VENDIDO' and last_timing_belt_km is not null and (last_timing_belt_km + timing_belt_interval_km) < current_km`);
await conta("Correias a trocar em breve", `select count(*) from public.vehicles where status<>'VENDIDO' and last_timing_belt_km is not null and (last_timing_belt_km + timing_belt_interval_km) - current_km between 0 and 5000`);
await conta("Clientes ativos sem telefone", `select count(*) from public.customers c where c.phone is null and exists (select 1 from public.contracts k where k.customer_id=c.id and k.status='ATIVO')`);
await conta("Veículos sem KM inicial", `select count(*) from public.vehicles where current_km=0 and status<>'VENDIDO'`);
await conta("Webhooks com erro", `select count(*) from public.integration_logs where status='ERRO'`);

console.log(`\n  ${ativos} tipos de alerta ativos, somando ${total} itens.`);
console.log(`  Hoje isso vira ${ativos} cartões do mesmo tamanho na tela.`);

await c.end();

/** Quão fundo vai o histórico? Define se gráfico de evolução faz sentido. */
import pg from "pg";

const c = new pg.Client({
  connectionString: process.env.URL_DEV,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const r1 = await c.query(
  `select min(due_date)::date primeiro_vencimento,
          max(due_date)::date ultimo_vencimento,
          min(payment_date)::date primeiro_pagamento,
          max(payment_date)::date ultimo_pagamento
     from public.payments`
);
console.log("ALCANCE DOS DADOS:");
for (const [k, v] of Object.entries(r1.rows[0])) console.log(`  ${k.padEnd(22)} ${v}`);

const r2 = await c.query(
  `select to_char(payment_date,'IYYY-"S"IW') semana,
          count(*)::int qtd, sum(value)::numeric total
     from public.payments
    where payment_date >= now() - interval '10 weeks'
    group by 1 order by 1`
);
console.log("\nRECEBIDO POR SEMANA (últimas 10):");
if (r2.rows.length === 0) console.log("  (nada)");
for (const r of r2.rows)
  console.log(`  ${r.semana}  ${String(r.qtd).padStart(3)} cobranças  R$ ${r.total}`);

const r3 = await c.query(
  `select to_char(payment_date,'DD/MM') dia, count(*)::int qtd, sum(value)::numeric total
     from public.payments
    where payment_date >= now() - interval '30 days'
    group by 1, payment_date::date order by payment_date::date`
);
console.log("\nRECEBIDO POR DIA (últimos 30 dias):");
if (r3.rows.length === 0) console.log("  (nada)");
for (const r of r3.rows) console.log(`  ${r.dia}  ${String(r.qtd).padStart(3)}x  R$ ${r.total}`);

const r4 = await c.query(
  `select min(start_date)::date contrato_mais_antigo,
          count(*) filter (where status='ATIVO')::int ativos,
          count(*)::int total
     from public.contracts`
);
console.log("\nCONTRATOS:");
for (const [k, v] of Object.entries(r4.rows[0])) console.log(`  ${k.padEnd(22)} ${v}`);

await c.end();

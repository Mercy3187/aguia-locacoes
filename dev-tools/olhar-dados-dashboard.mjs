/** O que existe de dado para alimentar gráficos no dashboard. */
import pg from "pg";

const c = new pg.Client({
  connectionString: process.env.URL_DEV,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const q = async (titulo, sql) => {
  console.log(`\n── ${titulo} ${"─".repeat(Math.max(0, 58 - titulo.length))}`);
  try {
    const r = await c.query(sql);
    if (r.rows.length === 0) return console.log("   (vazio)");
    for (const linha of r.rows) {
      console.log(
        "   " +
          Object.entries(linha)
            .map(([k, v]) => `${k}=${v ?? "-"}`)
            .join("  ")
      );
    }
  } catch (e) {
    console.log("   ERRO: " + String(e.message).slice(0, 100));
  }
};

await q(
  "COBRANÇAS POR STATUS",
  `select status, count(*)::int qtd, sum(value)::numeric total from public.payments group by 1 order by 2 desc`
);

await q(
  "RECEBIDO POR MÊS (payment_date)",
  `select to_char(payment_date,'YYYY-MM') mes, count(*)::int qtd, sum(value)::numeric total
     from public.payments where payment_date is not null
    group by 1 order by 1 desc limit 8`
);

await q(
  "VENCIMENTOS POR MÊS (due_date)",
  `select to_char(due_date,'YYYY-MM') mes, count(*)::int qtd, sum(value)::numeric total
     from public.payments group by 1 order by 1 desc limit 8`
);

await q(
  "ATRASADAS — quanto e de quantos clientes",
  `select count(*)::int cobrancas, count(distinct customer_id)::int clientes, sum(value)::numeric total
     from public.payments where status = 'OVERDUE'`
);

await q(
  "FROTA POR STATUS",
  `select status, count(*)::int qtd from public.vehicles group by 1 order by 2 desc`
);

await q(
  "CUSTOS POR MÊS — manutenção",
  `select to_char(start_at,'YYYY-MM') mes, count(*)::int qtd, coalesce(sum(cost),0)::numeric total
     from public.maintenances where status <> 'CANCELADA' group by 1 order by 1 desc limit 8`
);

await q(
  "CUSTOS POR MÊS — óleo",
  `select to_char(date,'YYYY-MM') mes, count(*)::int qtd, coalesce(sum(value),0)::numeric total
     from public.oil_changes group by 1 order by 1 desc limit 8`
);

await q(
  "DÍVIDAS POR STATUS",
  `select status, count(*)::int qtd, sum(amount)::numeric total from public.debts group by 1`
);

await q(
  "KM RODADOS POR MÊS (registros conferidos)",
  `select to_char(created_at,'YYYY-MM') mes, count(*)::int leituras
     from public.km_records where applied_at is not null group by 1 order by 1 desc limit 8`
);

await q(
  "CONTRATOS ATIVOS — valor semanal",
  `select count(*)::int contratos, sum(weekly_value)::numeric semanal,
          count(*) filter (where weekly_value is null)::int sem_valor
     from public.contracts where status = 'ATIVO'`
);

await q(
  "CAUÇÕES",
  `select count(*)::int contratos,
          coalesce(sum(deposit_value),0)::numeric combinado,
          coalesce(sum(deposit_paid_value),0)::numeric recebido
     from public.contracts where status = 'ATIVO' and deposit_value is not null`
);

await c.end();

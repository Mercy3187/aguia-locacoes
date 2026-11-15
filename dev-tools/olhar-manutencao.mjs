/** Fotografia dos dados de manutenção por proprietário, no banco de dev. */
import pg from "pg";

const c = new pg.Client({
  connectionString: process.env.URL_DEV,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const donos = await c.query(
  `select coalesce(owner_name, '(sem dono)') dono, count(*)::int n
     from public.vehicles group by 1 order by 2 desc`
);
console.log("VEICULOS POR PROPRIETARIO:");
for (const r of donos.rows) console.log(`  ${r.dono.padEnd(14)} ${r.n}`);

const m = await c.query(
  `select coalesce(v.owner_name, '(sem dono)') dono,
          m.status,
          count(*)::int n,
          coalesce(sum(m.cost), 0)::numeric total
     from public.maintenances m
     join public.vehicles v on v.id = m.vehicle_id
    group by 1, 2 order by 1, 2`
);
console.log("\nMANUTENCOES:");
if (m.rows.length === 0) console.log("  (nenhuma)");
for (const r of m.rows)
  console.log(`  ${r.dono.padEnd(12)} ${r.status.padEnd(14)} ${r.n} un   R$ ${r.total}`);

const det = await c.query(
  `select v.plate, coalesce(v.owner_name,'(sem dono)') dono, m.type, m.cost, m.status, m.start_at
     from public.maintenances m join public.vehicles v on v.id = m.vehicle_id
    order by m.start_at desc`
);
console.log("\nDETALHE:");
for (const r of det.rows)
  console.log(
    `  ${r.plate}  ${String(r.dono).padEnd(10)} ${String(r.type).slice(0, 24).padEnd(26)} R$ ${String(r.cost ?? "-").padEnd(10)} ${r.status}`
  );

await c.end();

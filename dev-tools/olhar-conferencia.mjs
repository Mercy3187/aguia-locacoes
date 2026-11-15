/** Como estão os registros de KM quanto à conferência. */
import pg from "pg";

const c = new pg.Client({
  connectionString: process.env.URL_DEV,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const s = await c.query(
  `select validation_status, count(*)::int n from public.km_records group by 1 order by 2 desc`
);
console.log("REGISTROS DE KM POR SITUAÇÃO:");
for (const r of s.rows) console.log(`  ${r.validation_status.padEnd(24)} ${r.n}`);

const d = await c.query(
  `select v.plate,
          k.informed_km,
          k.ocr_km,
          k.validation_status,
          v.current_km,
          (k.informed_km = v.current_km) as virou_km_do_carro
     from public.km_records k
     join public.vehicles v on v.id = k.vehicle_id
    order by k.created_at desc`
);
console.log("\nO QUE O MOTORISTA MANDOU × O QUE O CARRO REGISTRA HOJE:");
for (const r of d.rows) {
  const marca = r.virou_km_do_carro ? "<< é a KM atual do carro" : "";
  console.log(
    `  ${r.plate}  digitou ${String(r.informed_km).padStart(8)}  ocr ${String(
      r.ocr_km ?? "-"
    ).padStart(9)}  ${r.validation_status.padEnd(22)} carro=${String(
      r.current_km
    ).padStart(8)} ${marca}`
  );
}

await c.end();

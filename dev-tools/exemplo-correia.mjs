/**
 * Preenche a correia dentada de alguns carros no banco de DEV, só para dar o
 * que ver na tela: um vencido, um perto de vencer e alguns em dia.
 *
 * Isto é dado de teste. Para apagar tudo:
 *   node dev-tools\exemplo-correia.mjs --limpar
 */
import pg from "pg";

const limpar = process.argv.includes("--limpar");

const c = new pg.Client({
  connectionString: process.env.URL_DEV,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

if (limpar) {
  const r = await c.query(
    `update public.vehicles
        set last_timing_belt_km = null,
            last_timing_belt_at = null,
            timing_belt_notes   = null`
  );
  console.log(`Limpo o registro de correia de ${r.rowCount} veículos.`);
  await c.end();
  process.exit(0);
}

const { rows: veiculos } = await c.query(
  `select id, plate, current_km
     from public.vehicles
    where status <> 'VENDIDO' and current_km > 0
    order by current_km desc`
);

if (veiculos.length === 0) {
  console.log("Nenhum veículo com KM para usar de exemplo.");
  await c.end();
  process.exit(0);
}

const INTERVALO = 50_000;
// Quanto o carro já rodou desde a última troca, em km. Acima de 50.000 = vencida.
const CENARIOS = [
  { rodado: 53_200, nota: "vencida" },
  { rodado: 47_500, nota: "trocar em breve" },
  { rodado: 31_000, nota: "em dia" },
  { rodado: 12_400, nota: "em dia" },
  { rodado: 4_800, nota: "recém-trocada" },
];

const meses = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
};

console.log("Definindo a correia de exemplo:\n");
let i = 0;
for (const v of veiculos.slice(0, CENARIOS.length)) {
  const cen = CENARIOS[i];
  // A troca foi na KM de hoje menos o quanto rodou desde então.
  const kmTroca = Math.max(0, Number(v.current_km) - cen.rodado);
  const faltam = kmTroca + INTERVALO - Number(v.current_km);

  await c.query(
    `update public.vehicles
        set last_timing_belt_km = $1,
            last_timing_belt_at = $2,
            timing_belt_interval_km = $3,
            timing_belt_notes = $4
      where id = $5`,
    [kmTroca, meses(i + 6), INTERVALO, "Dado de exemplo (ambiente de teste)", v.id]
  );

  console.log(
    `  ${v.plate}  odômetro ${Number(v.current_km).toLocaleString("pt-BR")} km` +
      `  ·  trocada aos ${kmTroca.toLocaleString("pt-BR")} km` +
      `  ·  faltam ${faltam.toLocaleString("pt-BR")} km  (${cen.nota})`
  );
  i++;
}

console.log(`\n${i} veículos preenchidos. Os demais ficam "sem registro".`);
await c.end();

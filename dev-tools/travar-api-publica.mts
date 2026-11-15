/**
 * Fecha as tabelas do sistema para a API REST pública do Supabase.
 *
 * Toda tabela no esquema `public` fica exposta pela Data API do Supabase para
 * a chave "anon" — que é pública por definição. Com RLS ligado e NENHUMA
 * política, a API não enxerga nada. O sistema não é afetado: ele conecta
 * direto no Postgres como dono das tabelas, que ignora RLS.
 *
 * Rode depois de todo `prisma db push` que criar tabela nova:
 *   npx tsx dev-tools/travar-api-publica.mts
 *
 * Sem argumento só mostra a situação; com `--aplicar`, liga o RLS.
 */
import "dotenv/config";
import pg from "pg";
import { configConexao } from "../src/lib/db-conexao";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida.");

const aplicar = process.argv.includes("--aplicar");
const db = new pg.Client(configConexao(url));
await db.connect();

const { rows } = await db.query<{ tabela: string; rls: boolean }>(`
  select c.relname as tabela, c.relrowsecurity as rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
   order by c.relname`);

const abertas = rows.filter((r) => !r.rls);
console.log(`${rows.length} tabelas no esquema public; ${abertas.length} sem RLS.`);

if (aplicar) {
  for (const t of abertas) {
    await db.query(`alter table public."${t.tabela.replace(/"/g, '""')}" enable row level security`);
  }
  const depois = await db.query(
    `select count(*)::int n from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`
  );
  console.log(`RLS ligado. Tabelas ainda abertas: ${depois.rows[0].n}`);
} else if (abertas.length) {
  console.log("Abertas:", abertas.map((t) => t.tabela).join(", "));
  console.log("Rode com --aplicar para fechar.");
}

await db.end();

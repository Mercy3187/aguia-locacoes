import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { configConexao } from "@/lib/db-conexao";

/**
 * Cliente Prisma único (singleton).
 *
 * No Prisma 7 a conexão é feita por um "driver adapter". Aqui usamos o
 * adaptador do PostgreSQL (`pg`), lendo a URL do banco da variável de
 * ambiente DATABASE_URL.
 *
 * O singleton evita abrir várias conexões durante o hot-reload do Next.js
 * em desenvolvimento.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL não definida. Configure-a no arquivo .env (veja .env.example)."
    );
  }
  // ── Tamanho do pool ──
  // A URL aponta para a porta 6543, que é o TRANSACTION pooler do Supabase —
  // não o session pooler. A diferença importa: o transaction pooler multiplexa
  // muitos clientes sobre poucas conexões reais de banco, e aceita centenas de
  // clientes simultâneos. O limite de 15 que motivava um pool de 3 é do outro
  // pooler.
  //
  // O tamanho do pool é o teto de consultas que rodam ao mesmo tempo. As telas
  // pedem os dados em `Promise.all`, e com o pool pequeno o lote virava fila:
  // cada leva de consultas paga uma ida e volta inteira até São Paulo.
  //
  //     13 consultas          28 consultas (o dashboard)
  //     max=3  → 261ms        max=15 → 107ms
  //     max=6  → 150ms        max=20 → 104ms
  //     max=10 → 106ms        max=28 →  58ms
  //     max=15 →  57ms        max=40 →  58ms
  //
  // Uma consulta sozinha custa ~51ms. Ou seja: com pool suficiente o lote
  // inteiro cabe numa única ida ao banco, e daí para cima não melhora mais.
  //
  // Ficou em 15, e não em 28+, por medição: subir para 30 não mudou o tempo
  // de nenhuma tela (o dashboard ficou em 185ms contra 189ms, dentro do
  // ruído). O motivo é que as 28 consultas dele não saem no mesmo instante
  // como no teste sintético — vêm de três grupos aninhados e o próprio laço
  // de eventos as espalha. Segurar o dobro de conexões sem ganho medido é
  // custo à toa.
  //
  // ── Por que o número muda na Vercel ──
  // Os tempos acima foram medidos num processo Node único, onde existe UM pool
  // e 15 conexões são 15 conexões. Em produção o sistema roda na Vercel, e lá
  // não é assim: cada instância da função carrega o próprio pool, e a
  // plataforma cria quantas instâncias quiser. Ali `max` não é o total — é o
  // total POR INSTÂNCIA. Com 15 e uma dezena de instâncias vivas o Supabase
  // passa a recusar conexão ("max clients reached"), e isso não é uma tela
  // lenta: é o sistema fora do ar.
  //
  // Por isso o valor cai para 8 quando `VERCEL` está no ambiente. Pela mesma
  // medição acima, 8 entrega a maior parte do ganho (as 13 consultas saem de
  // 261ms para ~130ms) com metade da pressão sobre o pooler. Para subir esse
  // número um dia, o teto seguro depende do `max_client_conn` do projeto no
  // Supabase — confira lá antes de mexer, não no chute.
  const emServerless = Boolean(process.env.VERCEL);

  const adapter = new PrismaPg({
    // URL + criptografia com o certificado do Supabase conferido.
    ...configConexao(connectionString),
    max: emServerless ? 8 : 15,
    // ── Por que a conexão é mantida viva ──
    // Abrir conexão custa ~350ms, sete vezes mais que uma consulta. Com o
    // limite anterior de 15s, qualquer tela aberta depois de meio minuto
    // parado pagava esse pedágio. Pior: o pooler derruba silenciosamente
    // sockets ociosos, e o pool entregava conexão morta — era a origem dos
    // "Connection terminated unexpectedly" que apareciam depois de um tempo
    // sem uso. O keepAlive mantém o socket vivo no nível do TCP.
    //
    // Na Vercel a instância congela entre uma requisição e outra, e uma
    // instância congelada segurando conexão é conexão fora de circulação —
    // por isso ali o tempo ocioso é curto: solta rápido para outra instância
    // poder usar.
    idleTimeoutMillis: emServerless ? 10_000 : 60_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

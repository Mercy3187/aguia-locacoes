import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { configConexao } from "../src/lib/db-conexao";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✖ DATABASE_URL não definida.");
  process.exit(1);
}

const adapter = new PrismaPg(configConexao(url));
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || "admin@aguialocacoes.com.br";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  // Sem senha padrão: um admin com senha conhecida (ou vazia) num banco de
  // produção é a porta da frente aberta.
  if (password.length < 10) {
    throw new Error("Defina SEED_ADMIN_PASSWORD com pelo menos 10 caracteres.");
  }
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: "Administrador",
      email,
      passwordHash,
      role: "ADMIN",
    },
  });

  // Nunca imprimir a senha: a saída do seed vai parar em log de build/CI.
  console.log("✔ Usuário administrador pronto:", admin.email);
  console.log("  Senha: a definida em SEED_ADMIN_PASSWORD (altere após o 1º login).");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Erro ao executar o seed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

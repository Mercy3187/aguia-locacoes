/**
 * Seed de DESENVOLVIMENTO — dados fictícios com a cara da produção.
 *
 * Roda apenas no banco de DEV. Apaga tudo que existe e recria um retrato
 * completo da operação: frota, motoristas, contratos, ciclo de KM, óleo,
 * correia, manutenção, multas, dívidas e cobranças do Asaas — distribuídos
 * de propósito para que TODA tela do sistema tenha o que mostrar (inclusive
 * as de exceção: inadimplente, KM suspeita, manutenção em aberto).
 *
 * ── Por que nada aqui pode existir de verdade ──
 * CPF: todos com dígito verificador INVÁLIDO. O sistema não valida o dígito
 * (é campo de texto livre), então eles aparecem normalmente na tela — mas
 * nenhum deles pode ser o CPF de uma pessoa real, nem por acidente.
 *
 * Telefone: todos no formato (DD) 9 0000-XXXX. Celular brasileiro válido tem
 * o segundo dígito entre 6 e 9; começar com 90 não é faixa atribuível. O
 * número passa pelo `formatPhoneForWhatsApp` (13 dígitos, então o fluxo de KM
 * é testável de ponta a ponta), mas o link nunca cai em um WhatsApp real.
 *
 * Executar:  npx tsx prisma/seed-dev.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { configConexao } from "../src/lib/db-conexao";
import { PrismaClient } from "../src/generated/prisma/client";
import { randomBytes } from "node:crypto";

// ─────────────────────────────────────────────────────────────
// TRAVA DE SEGURANÇA
// ─────────────────────────────────────────────────────────────
// Este seed APAGA todas as tabelas antes de inserir. Rodar contra produção
// destruiria o negócio. A trava é por lista de permissão: só roda em banco
// cujo ref esteja explicitamente autorizado aqui.
// Preencha com o ref do projeto Supabase (o trecho "xxxx" de
// db.xxxx.supabase.co / postgres.xxxx) assim que os bancos da Águia existirem.
const REFS_PRODUCAO: string[] = [];
const REFS_PERMITIDOS: string[] = []; // bancos de DEV/teste da Águia

const DB = process.env.DATABASE_URL ?? "";
if (!DB) {
  console.error("✖ DATABASE_URL não definida.");
  process.exit(1);
}
if (REFS_PRODUCAO.some((ref) => DB.includes(ref))) {
  console.error("✖ ABORTADO: esta DATABASE_URL é a de PRODUÇÃO.");
  console.error("  Este script apaga todas as tabelas. Jamais em produção.");
  process.exit(1);
}
if (!REFS_PERMITIDOS.some((ref) => DB.includes(ref))) {
  console.error("✖ ABORTADO: banco não autorizado para seed.");
  console.error("  Bancos permitidos: " + REFS_PERMITIDOS.join(", "));
  console.error("  Se este banco novo é de DEV, acrescente o ref em REFS_PERMITIDOS.");
  process.exit(1);
}

const adapter = new PrismaPg(configConexao(DB));
const prisma = new PrismaClient({ adapter });

// ─────────────────────────────────────────────────────────────
// ALEATORIEDADE DETERMINÍSTICA
// ─────────────────────────────────────────────────────────────
// Semente fixa: rodar o seed duas vezes produz exatamente os mesmos dados.
// Sem isso, cada execução mudaria os números e comparar telas entre um dia e
// outro viraria adivinhação.
let semente = 20260916;
function rnd(): number {
  semente |= 0;
  semente = (semente + 0x6d2b79f5) | 0;
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const inteiro = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const escolher = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const talvez = (chance: number) => rnd() < chance;

const DIA = 86_400_000;
const HOJE = new Date();
const dias = (n: number) => new Date(HOJE.getTime() + n * DIA);

// ─────────────────────────────────────────────────────────────
// DADOS BASE
// ─────────────────────────────────────────────────────────────

/** CPF com dígito verificador inválido de propósito. */
function cpfFalso(i: number): string {
  const base = String(100_000_000 + i * 7_654_321).slice(0, 9);
  return `${base.slice(0, 3)}.${base.slice(3, 6)}.${base.slice(6, 9)}-00`;
}

/** Celular em faixa não atribuível (9 0000-XXXX). */
function telefoneFalso(i: number): string {
  const ddd = escolher(["11", "21", "31", "41", "51"]);
  return `(${ddd}) 90000-${String(1000 + i).slice(-4)}`;
}

const NOMES = [
  "Adriano Peixoto Lemos", "Bianca Moraes Tavares", "Caio Nogueira Brandão",
  "Daniela Rezende Pacheco", "Everton Saldanha Cordeiro", "Fabiana Quintela Braga",
  "Gustavo Meireles Antunes", "Heloísa Bittencourt Farias", "Ivan Marcondes Teixeira",
  "Juliana Vasconcelos Pires", "Kléber Andrade Fontoura", "Larissa Camargo Setúbal",
  "Marcelo Bastos Figueiredo", "Natália Pimentel Vieira", "Otávio Rangel Machado",
  "Priscila Dourado Neves", "Rodrigo Albuquerque Sales", "Sabrina Toledo Marinho",
] as const;

const MODELOS = [
  { brand: "Chevrolet", model: "Onix 1.0", year: 2022 },
  { brand: "Hyundai", model: "HB20 1.0", year: 2021 },
  { brand: "Fiat", model: "Argo Drive 1.0", year: 2022 },
  { brand: "Renault", model: "Kwid Zen", year: 2023 },
  { brand: "Fiat", model: "Mobi Like", year: 2021 },
  { brand: "Volkswagen", model: "Gol 1.0", year: 2020 },
  { brand: "Nissan", model: "March 1.0", year: 2019 },
  { brand: "Toyota", model: "Etios XS", year: 2020 },
  { brand: "Chevrolet", model: "Prisma LT", year: 2019 },
  { brand: "Hyundai", model: "HB20S 1.6", year: 2022 },
  { brand: "Fiat", model: "Cronos 1.3", year: 2023 },
  { brand: "Renault", model: "Logan Zen", year: 2021 },
] as const;

const CORES = ["Prata", "Branco", "Preto", "Cinza", "Vermelho"] as const;
const OFICINAS = ["Auto Center Vila Nova", "Mecânica do Zé", "Oficina Real Motors", "Bosch Car Service"] as const;
const AUTOPECAS = ["Autopeças Central", "Distribuidora Moraes", "Peças & Cia"] as const;

/** Placa Mercosul fictícia (ABC1D23). */
function placa(i: number): string {
  const L = "ABCDEFGHJKLMNPRSTUVWXYZ";
  const a = L[(i * 3) % L.length], b = L[(i * 5 + 7) % L.length], c = L[(i * 11 + 3) % L.length];
  const d = L[(i * 13 + 5) % L.length];
  return `${a}${b}${c}${i % 10}${d}${String(10 + (i % 90)).slice(0, 2)}`;
}

// ─────────────────────────────────────────────────────────────
async function limpar() {
  console.log("→ limpando tabelas...");
  await prisma.contractAdjustment.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.debt.deleteMany();
  await prisma.kmRecord.deleteMany();
  await prisma.kmRequest.deleteMany();
  await prisma.oilChange.deleteMany();
  await prisma.maintenance.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  console.log("Banco de DEV autorizado. Semeando dados fictícios.\n");
  await limpar();

  // ── USUÁRIOS ──
  console.log("→ usuários");
  const senha = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "admin123", 10);
  const [admin, financeiro] = await Promise.all([
    prisma.user.create({
      data: {
        name: "Administrador",
        email: process.env.SEED_ADMIN_EMAIL ?? "admin@aguialocacoes.com.br",
        passwordHash: senha, role: "ADMIN",
      },
    }),
    prisma.user.create({
      data: { name: "Renata Financeiro", email: "financeiro@aguialocacoes.com.br", passwordHash: senha, role: "FINANCEIRO" },
    }),
    prisma.user.create({
      data: { name: "Paulo Operação", email: "operacao@aguialocacoes.com.br", passwordHash: senha, role: "FUNCIONARIO" },
    }),
  ]);

  // ── VEÍCULOS ──
  // Distribuição pensada: a maioria alugada, alguns disponíveis, um em
  // manutenção e um vendido — para a tela de frota não ficar homogênea.
  console.log("→ veículos");
  const veiculos = [];
  for (let i = 0; i < 20; i++) {
    const m = MODELOS[i % MODELOS.length];
    const kmAtual = inteiro(28_000, 165_000);
    const ultimaTroca = kmAtual - inteiro(200, 11_500);
    const intervalo = 10_000;
    const status = i < 14 ? "ALUGADO" : i < 17 ? "DISPONIVEL" : i === 17 ? "MANUTENCAO" : i === 18 ? "RESERVADO" : "VENDIDO";
    const proxima = ultimaTroca + intervalo;
    const faltam = proxima - kmAtual;
    veiculos.push(
      await prisma.vehicle.create({
        data: {
          plate: placa(i), brand: m.brand, model: m.model, year: m.year,
          color: escolher(CORES), status: status as never,
          purchaseValue: inteiro(38_000, 79_000), investedValue: inteiro(1_200, 9_800),
          currentKm: kmAtual,
          lastOilChangeKm: ultimaTroca, oilChangeIntervalKm: intervalo, nextOilChangeKm: proxima,
          oilStatus: faltam <= 0 ? "VERMELHO" : faltam < 1_500 ? "AMARELO" : "VERDE",
          lastTimingBeltKm: talvez(0.7) ? kmAtual - inteiro(5_000, 47_000) : null,
          lastTimingBeltAt: talvez(0.7) ? dias(-inteiro(200, 900)) : null,
          timingBeltIntervalKm: 50_000,
          insuranceDueDate: dias(inteiro(-30, 300)),
          ipvaDueDate: dias(inteiro(-20, 260)),
          licensingDueDate: dias(inteiro(-15, 320)),
        },
      })
    );
  }

  // ── CLIENTES ──
  console.log("→ clientes");
  const clientes = [];
  for (let i = 0; i < NOMES.length; i++) {
    const primeiro = NOMES[i].split(" ")[0].toLowerCase();
    clientes.push(
      await prisma.customer.create({
        data: {
          name: NOMES[i], cpfCnpj: cpfFalso(i + 1), phone: telefoneFalso(i + 1),
          email: `${primeiro}${i + 1}@exemplo.com.br`,
          address: `Rua ${escolher(["das Acácias", "Bento Gonçalves", "Sete de Setembro", "Dom Pedro II"])}, ${inteiro(50, 1900)}`,
          driverLicense: String(10_000_000_000 + i * 373_737),
          status: "ativo",
        },
      })
    );
  }

  // ── CONTRATOS + CICLO COMPLETO ──
  console.log("→ contratos, KM, cobranças e dívidas");
  const alugados = veiculos.filter((v) => v.status === "ALUGADO");
  let nPagamentos = 0, nKm = 0, nDividas = 0;

  for (let i = 0; i < alugados.length; i++) {
    const veiculo = alugados[i];
    const cliente = clientes[i % clientes.length];
    const inicio = dias(-inteiro(40, 400));
    const semanal = inteiro(520, 760);
    const caucao = 1_200;
    // Caução: a maioria quitada, algumas parceladas e uma sem pagar nada —
    // é isso que dá conteúdo à tela de Cauções.
    const pagoCaucao = i % 5 === 0 ? 0 : i % 4 === 0 ? caucao / 2 : caucao;

    const contrato = await prisma.contract.create({
      data: {
        customerId: cliente.id, vehicleId: veiculo.id,
        startDate: inicio,
        endDate: dias(inteiro(-10, 25)), // fim do lote de faturas
        weeklyValue: semanal, status: "ATIVO",
        depositValue: caucao, depositPaidValue: pagoCaucao,
        depositPaidAt: pagoCaucao > 0 ? dias(-inteiro(30, 380)) : null,
        pickupDate: inicio, pickupDone: true,
        paymentStatus: i % 6 === 0 ? "ATRASADO" : "EM_DIA",
        lastKmRequestDate: dias(-inteiro(1, 14)),
        nextKmRequestDate: dias(inteiro(1, 14)),
      },
    });

    // Cobranças semanais espelhadas do Asaas (12 semanas para trás).
    for (let s = 12; s >= 0; s--) {
      const venc = dias(-s * 7 + inteiro(-1, 1));
      const passado = venc < HOJE;
      const atrasado = passado && i % 6 === 0 && s < 3;
      const status = !passado ? "PENDING" : atrasado ? "OVERDUE" : "RECEIVED";
      await prisma.payment.create({
        data: {
          asaasId: `pay_dev_${contrato.id.slice(-6)}_${s}`,
          contractId: contrato.id, customerId: cliente.id, plate: veiculo.plate,
          value: semanal, netValue: semanal - 2.49,
          status, billingType: escolher(["BOLETO", "PIX"]),
          dueDate: venc,
          paymentDate: status === "RECEIVED" ? new Date(venc.getTime() - inteiro(0, 3) * DIA) : null,
          description: `Locação semanal — ${veiculo.plate}`,
        },
      });
      nPagamentos++;
    }

    // Ciclo de KM quinzenal: 4 ciclos respondidos + 1 em aberto.
    let kmBase = veiculo.currentKm - inteiro(3_000, 7_000);
    for (let c = 4; c >= 0; c--) {
      const criadoEm = dias(-c * 15);
      const aberto = c === 0;
      const req = await prisma.kmRequest.create({
        data: {
          contractId: contrato.id, customerId: cliente.id, vehicleId: veiculo.id,
          token: randomBytes(32).toString("base64url"),
          expiresAt: new Date(criadoEm.getTime() + DIA),
          usedAt: aberto ? null : new Date(criadoEm.getTime() + inteiro(1, 20) * 3_600_000),
          status: aberto ? "ENVIADO" : "RESPONDIDO",
          requestType: "QUINZENAL",
          sentByUserId: admin.id, sentAt: criadoEm,
        },
      });
      if (!aberto) {
        kmBase += inteiro(900, 2_600);
        // Uma em cada seis cai como suspeita, para a tela de conferência ter caso.
        const suspeita = i % 6 === 0 && c === 1;
        await prisma.kmRecord.create({
          data: {
            kmRequestId: req.id, contractId: contrato.id, customerId: cliente.id,
            vehicleId: veiculo.id,
            informedKm: suspeita ? kmBase + 24_000 : kmBase,
            ocrKm: talvez(0.6) ? kmBase : null,
            appliedAt: suspeita ? null : new Date(criadoEm.getTime() + 2 * 3_600_000),
            fuelLevel: escolher(["1/4", "1/2", "3/4", "Cheio"]),
            vehiclePhotosUrls: [],
            latitude: -23.55 + rnd() * 0.3, longitude: -46.63 + rnd() * 0.3,
            approximateAddress: "São Paulo, SP",
            validationStatus: suspeita ? "SUSPEITO" : "APROVADO",
            validationNotes: suspeita ? "Salto de KM muito acima da média do período." : null,
          },
        });
        nKm++;
      }
    }

    // Dívidas: multa de trânsito e avaria, em estados variados.
    if (i % 3 === 0) {
      await prisma.debt.create({
        data: {
          customerId: cliente.id, contractId: contrato.id, vehicleId: veiculo.id,
          type: "MULTA_TRANSITO",
          description: escolher(["Excesso de velocidade — Av. Paulista", "Avanço de sinal vermelho", "Estacionamento proibido"]),
          amount: escolher([130.16, 195.23, 293.47]),
          installments: talvez(0.4) ? 3 : 1,
          dueDate: dias(inteiro(-20, 40)), occurredAt: dias(-inteiro(30, 120)),
          status: talvez(0.3) ? "PAGA" : "ABERTA",
          createdById: financeiro.id,
        },
      });
      nDividas++;
    }
    if (i % 7 === 0) {
      await prisma.debt.create({
        data: {
          customerId: cliente.id, contractId: contrato.id, vehicleId: veiculo.id,
          type: "AVARIA", description: "Retrovisor direito quebrado",
          amount: inteiro(180, 640), dueDate: dias(inteiro(5, 30)),
          occurredAt: dias(-inteiro(5, 40)), status: "ABERTA", createdById: financeiro.id,
        },
      });
      nDividas++;
    }

    // Ajuste na semana seguinte (multa de KM atrasada).
    if (i % 8 === 0) {
      await prisma.contractAdjustment.create({
        data: { contractId: contrato.id, type: "MULTA_KM", amount: 50, description: "KM informada com atraso", settled: false },
      });
    }
  }

  // ── TROCAS DE ÓLEO ──
  console.log("→ trocas de óleo");
  for (const v of veiculos.slice(0, 15)) {
    await prisma.oilChange.create({
      data: {
        vehicleId: v.id, lastChangeKm: v.lastOilChangeKm ?? 0,
        intervalKm: v.oilChangeIntervalKm, nextChangeKm: v.nextOilChangeKm ?? 0,
        oilType: escolher(["5W30 Sintético", "15W40 Mineral", "10W40 Semissintético"]),
        oilFilter: true, airFilter: talvez(0.5), cabinFilter: talvez(0.3), fuelFilter: talvez(0.2),
        workshop: escolher(OFICINAS), value: inteiro(180, 420),
        date: dias(-inteiro(15, 180)),
      },
    });
  }

  // ── MANUTENÇÕES ──
  // Inclui os dois casos que o módulo trata: comum e avulsa (carro fora da
  // frota).
  console.log("→ manutenções");
  for (let i = 0; i < 12; i++) {
    const v = veiculos[i % veiculos.length];
    const peca = inteiro(80, 900), mao = inteiro(60, 520);
    const emAndamento = i < 2;
    await prisma.maintenance.create({
      data: {
        vehicleId: v.id, type: escolher(["Revisão", "Freios", "Suspensão", "Embreagem", "Elétrica"]),
        description: escolher(["Troca de pastilhas e discos", "Revisão de 40 mil km", "Reparo no alternador", "Troca de amortecedores"]),
        workshop: escolher(OFICINAS), partsSupplier: escolher(AUTOPECAS),
        partsCost: emAndamento ? null : peca, laborCost: emAndamento ? null : mao,
        cost: emAndamento ? null : peca + mao,
        startAt: dias(-inteiro(2, 150)), endAt: emAndamento ? null : dias(-inteiro(1, 140)),
        status: emAndamento ? "EM_ANDAMENTO" : "CONCLUIDA",
      },
    });
  }
  // Duas avulsas (carro que não é da frota — vehicleId nulo).
  for (let i = 0; i < 2; i++) {
    const p = inteiro(150, 700), m = inteiro(100, 400);
    await prisma.maintenance.create({
      data: {
        vehicleId: null, type: "Avulso",
        description: "Serviço em carro de terceiro",
        avulsoPlate: placa(90 + i), avulsoModel: escolher(["Fiat Uno 2015", "VW Fox 2016", "Ford Ka 2017"]),
        workshop: escolher(OFICINAS), partsSupplier: escolher(AUTOPECAS),
        partsCost: p, laborCost: m, cost: p + m,
        startAt: dias(-inteiro(5, 90)), endAt: dias(-inteiro(1, 80)),
        status: "CONCLUIDA",
      },
    });
  }

  const [vc, cc, ct] = await Promise.all([
    prisma.vehicle.count(), prisma.customer.count(), prisma.contract.count(),
  ]);
  console.log("\n✔ Seed concluído:");
  console.log(`  ${vc} veículos · ${cc} clientes · ${ct} contratos`);
  console.log(`  ${nPagamentos} cobranças · ${nKm} registros de KM · ${nDividas} dívidas`);
  console.log(`  3 usuários — entre com ${admin.email}`);
  console.log("  Senha: a de SEED_ADMIN_PASSWORD no .env (padrão: admin123)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Erro no seed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });

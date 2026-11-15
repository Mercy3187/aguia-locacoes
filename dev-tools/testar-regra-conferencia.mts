/**
 * Testa as travas da conferência de KM importando o módulo REAL do sistema
 * (src/lib/km-conferencia.ts), e não uma cópia.
 *
 * Uso: npx tsx dev-tools\testar-regra-conferencia.mts
 */
import { resolverKmConferencia } from "../src/lib/km-conferencia";

type Caso = {
  nome: string;
  entrada: Parameters<typeof resolverKmConferencia>[0];
  esperaOk: boolean;
  esperaKm?: number;
  esperaCorrigiu?: boolean;
};

const casos: Caso[] = [
  {
    nome: "confirma o valor do cliente quando não há correção",
    entrada: { informedKm: 230000, currentKm: 228000, plate: "AAA-0001", jaAplicado: false },
    esperaOk: true,
    esperaKm: 230000,
    esperaCorrigiu: false,
  },
  {
    nome: "usa o NOSSO valor quando corrigimos",
    entrada: {
      informedKm: 1001601,
      kmCorrigida: 235327,
      currentKm: 230000,
      plate: "PCB-9B71",
      jaAplicado: false,
    },
    esperaOk: true,
    esperaKm: 235327,
    esperaCorrigiu: true,
  },
  {
    nome: "recusa KM menor que a do carro (odômetro não anda para trás)",
    entrada: { informedKm: 220000, currentKm: 228000, plate: "AAA-0001", jaAplicado: false },
    esperaOk: false,
  },
  {
    nome: "recusa correção menor que a do carro",
    entrada: {
      informedKm: 240000,
      kmCorrigida: 100,
      currentKm: 228000,
      plate: "AAA-0001",
      jaAplicado: false,
    },
    esperaOk: false,
  },
  {
    nome: "recusa efetivar duas vezes o mesmo registro",
    entrada: { informedKm: 240000, currentKm: 228000, plate: "AAA-0001", jaAplicado: true },
    esperaOk: false,
  },
  {
    nome: "recusa KM negativa",
    entrada: {
      informedKm: 240000,
      kmCorrigida: -5,
      currentKm: 0,
      plate: "AAA-0001",
      jaAplicado: false,
    },
    esperaOk: false,
  },
  {
    nome: "aceita KM igual à do carro (ficou parado no período)",
    entrada: { informedKm: 228000, currentKm: 228000, plate: "AAA-0001", jaAplicado: false },
    esperaOk: true,
    esperaKm: 228000,
    esperaCorrigiu: false,
  },
  {
    nome: "corrigir para o mesmo número não conta como correção",
    entrada: {
      informedKm: 230000,
      kmCorrigida: 230000,
      currentKm: 228000,
      plate: "AAA-0001",
      jaAplicado: false,
    },
    esperaOk: true,
    esperaKm: 230000,
    esperaCorrigiu: false,
  },
];

console.log("TRAVAS DA CONFERÊNCIA DE KM\n");

let falhas = 0;
for (const c of casos) {
  const r = resolverKmConferencia(c.entrada);
  let ok = r.ok === c.esperaOk;
  if (ok && r.ok) {
    ok = r.kmFinal === c.esperaKm && r.corrigiu === c.esperaCorrigiu;
  }
  if (!ok) falhas++;

  const detalhe = r.ok
    ? `efetiva ${r.kmFinal.toLocaleString("pt-BR")} km${r.corrigiu ? " (valor nosso)" : " (valor do cliente)"}`
    : `recusa — ${r.error}`;
  console.log(`  ${ok ? "OK   " : "FALHA"} ${c.nome}`);
  console.log(`         ${detalhe}`);
}

console.log(`\n${casos.length - falhas} de ${casos.length} casos corretos.`);
process.exit(falhas > 0 ? 1 : 0);

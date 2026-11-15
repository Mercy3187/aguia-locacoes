/**
 * Testa as travas da alteração de KM importando o módulo REAL do sistema
 * (src/lib/km-conferencia.ts), e não uma cópia.
 *
 * Uso: npx tsx dev-tools\testar-regra-km.mts
 */
import { conferirKmNova } from "../src/lib/km-conferencia";

type Caso = {
  nome: string;
  entrada: Parameters<typeof conferirKmNova>[0];
  espera: "ok" | "erro" | "confirmar";
};

const casos: Caso[] = [
  {
    nome: "KM maior que a atual: passa direto",
    entrada: { novaKm: 235500, kmAtual: 235327, plate: "PCB-9B71" },
    espera: "ok",
  },
  {
    nome: "mesma KM: passa (a tela decide não gravar)",
    entrada: { novaKm: 235327, kmAtual: 235327, plate: "PCB-9B71" },
    espera: "ok",
  },
  {
    nome: "KM menor sem confirmação: pede confirmação, não grava",
    entrada: { novaKm: 200000, kmAtual: 235327, plate: "PCB-9B71" },
    espera: "confirmar",
  },
  {
    nome: "KM menor COM confirmação: passa (é a correção de um erro)",
    entrada: { novaKm: 200000, kmAtual: 235327, plate: "PCB-9B71", confirmado: true },
    espera: "ok",
  },
  {
    nome: "KM negativa: recusa",
    entrada: { novaKm: -5, kmAtual: 100, plate: "PCB-9B71", confirmado: true },
    espera: "erro",
  },
  {
    nome: "KM absurda (dedo escorregou no teclado): recusa mesmo confirmada",
    entrada: { novaKm: 12_000_000, kmAtual: 235327, plate: "PCB-9B71", confirmado: true },
    espera: "erro",
  },
  {
    nome: "KM quebrada: recusa",
    entrada: { novaKm: 235327.5, kmAtual: 235000, plate: "PCB-9B71" },
    espera: "erro",
  },
];

let falhas = 0;
for (const caso of casos) {
  const r = conferirKmNova(caso.entrada);
  const obtido = r.ok ? "ok" : "confirmar" in r ? "confirmar" : "erro";
  const passou = obtido === caso.espera;
  if (!passou) falhas++;
  console.log(`${passou ? "OK  " : "FALHA"} ${caso.nome}`);
  if (!passou) console.log(`      esperado "${caso.espera}", obtido "${obtido}"`);
  if (!r.ok) console.log(`      → ${"confirmar" in r ? r.confirmar : r.error}`);
}

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} caso(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);

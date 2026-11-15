/**
 * Testa a regra que descobre quem estava com o carro na hora da multa,
 * importando o módulo REAL do sistema (src/lib/multas-responsavel.ts).
 *
 * Uso: npx tsx dev-tools\testar-multas-responsavel.mts
 */
import { acharResponsavel, rotuloResponsavel } from "../src/lib/multas-responsavel";

let falhas = 0;
function confere(nome: string, ok: boolean, detalhe: string) {
  if (!ok) falhas++;
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}  (${detalhe})`);
}

const d = (s: string) => new Date(s);
const FROTA = new Set(["QYB-0G99", "PDM-3E06", "PCK-0B63"]);
const HISTORICO = d("2026-07-20T00:00:00");

const contratoDoThiago = {
  id: "c-thiago",
  vehicleId: "v1",
  placa: "QYB-0G99",
  clienteNome: "Thiago Gideao",
  clienteId: "cli-thiago", clienteDoc: null,
  inicio: d("2026-07-20T00:00:00"),
  fim: null,
};

// ── O caso normal ──
const r1 = acharResponsavel({
  placa: "QYB-0G99",
  ocorridaEm: d("2026-08-15T14:30:00"),
  contratos: [contratoDoThiago],
  placasDaFrota: FROTA,
  inicioDoHistorico: HISTORICO,
});
confere(
  "multa durante a locação aponta o motorista",
  r1.tipo === "encontrado" && r1.clienteNome === "Thiago Gideao",
  rotuloResponsavel(r1)
);

// ── Contrato ativo não tem fim: vale até hoje ──
// Se o `endDate` (fim do lote de faturas) fosse usado como fim do
// contrato, esta multa não teria dono — e o motorista sairia ileso.
const r2 = acharResponsavel({
  placa: "QYB-0G99",
  ocorridaEm: d("2026-11-30T09:00:00"),
  contratos: [contratoDoThiago],
  placasDaFrota: FROTA,
  inicioDoHistorico: HISTORICO,
});
confere(
  "contrato em curso cobre multa posterior ao último boleto",
  r2.tipo === "encontrado",
  rotuloResponsavel(r2)
);

// ── Antes do contrato começar ──
const r3 = acharResponsavel({
  placa: "QYB-0G99",
  ocorridaEm: d("2026-07-25T10:00:00"),
  contratos: [
    { ...contratoDoThiago, inicio: d("2026-08-01T00:00:00") },
  ],
  placasDaFrota: FROTA,
  inicioDoHistorico: HISTORICO,
});
confere(
  "multa antes do contrato começar: carro estava no pátio",
  r3.tipo === "sem-contrato",
  rotuloResponsavel(r3)
);

// ── O caso REAL dos PDFs: multa de 2025, fora do histórico ──
// Não é "sem motorista" — é "o sistema não sabe". A diferença importa: um
// afirma que o carro estava parado, o outro admite a ignorância.
const r4 = acharResponsavel({
  placa: "QYB-0G99",
  ocorridaEm: d("2025-11-05T13:37:00"),
  contratos: [contratoDoThiago],
  placasDaFrota: FROTA,
  inicioDoHistorico: HISTORICO,
});
confere(
  "multa de 2025 é 'fora do histórico', não 'sem locação'",
  r4.tipo === "fora-do-historico",
  rotuloResponsavel(r4)
);

// ── Carro repassado: dois contratos ativos cobrindo a mesma data ──
const r5 = acharResponsavel({
  placa: "PDM-3E06",
  ocorridaEm: d("2026-08-20T10:00:00"),
  contratos: [
    { id: "a", vehicleId: "v2", placa: "PDM-3E06", clienteNome: "Paulo", clienteId: "p", clienteDoc: null, inicio: d("2026-07-27T00:00:00"), fim: null },
    { id: "b", vehicleId: "v2", placa: "PDM-3E06", clienteNome: "Jorge", clienteId: "j", clienteDoc: null, inicio: d("2026-07-27T00:00:00"), fim: null },
  ],
  placasDaFrota: FROTA,
  inicioDoHistorico: HISTORICO,
});
confere(
  "dois contratos ativos: assume a ambiguidade em vez de chutar",
  r5.tipo === "ambiguo",
  rotuloResponsavel(r5)
);
if (r5.tipo === "ambiguo") {
  confere(
    "o aviso diz o que fazer",
    r5.motivo.includes("Paulo") && r5.motivo.includes("Jorge") && r5.motivo.includes("Encerre"),
    r5.motivo.slice(0, 60) + "..."
  );
}

// ── Contrato já encerrado: cobre só até o fim ──
const encerrado = {
  ...contratoDoThiago,
  id: "c-fim",
  inicio: d("2026-07-20T00:00:00"),
  fim: d("2026-08-10T00:00:00"),
};
const r6 = acharResponsavel({
  placa: "QYB-0G99",
  ocorridaEm: d("2026-08-05T10:00:00"),
  contratos: [encerrado],
  placasDaFrota: FROTA,
  inicioDoHistorico: HISTORICO,
});
confere("dentro do contrato encerrado: aponta o motorista", r6.tipo === "encontrado", rotuloResponsavel(r6));

const r7 = acharResponsavel({
  placa: "QYB-0G99",
  ocorridaEm: d("2026-08-20T10:00:00"),
  contratos: [encerrado],
  placasDaFrota: FROTA,
  inicioDoHistorico: HISTORICO,
});
confere("depois do fim: não aponta ninguém", r7.tipo === "sem-contrato", rotuloResponsavel(r7));

// ── Placa que não é da frota ──
const r8 = acharResponsavel({
  placa: "ZZZ-9Z99",
  ocorridaEm: d("2026-08-20T10:00:00"),
  contratos: [contratoDoThiago],
  placasDaFrota: FROTA,
  inicioDoHistorico: HISTORICO,
});
confere("placa de fora da frota é sinalizada", r8.tipo === "carro-desconhecido", rotuloResponsavel(r8));

// ── A multa exatamente no instante em que o contrato começa ──
const r9 = acharResponsavel({
  placa: "QYB-0G99",
  ocorridaEm: d("2026-07-20T00:00:00"),
  contratos: [contratoDoThiago],
  placasDaFrota: FROTA,
  inicioDoHistorico: HISTORICO,
});
confere("no instante da retirada já é do motorista", r9.tipo === "encontrado", rotuloResponsavel(r9));

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);

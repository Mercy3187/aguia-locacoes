import {
  cronogramaFaturas,
  valorSemanal,
  documentoValido,
  formatarDocumento,
  somarPeriodos,
} from "../src/lib/contrato-gerar";

let falhas = 0;
const ok = (nome: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "✓" : "✗"} ${nome}${extra ? " — " + extra : ""}`);
  if (!cond) falhas++;
};
const d = (s: string) => {
  const [a, m, dd] = s.split("-").map(Number);
  return new Date(a, m - 1, dd);
};
const ymd = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

// 4 semanas antecipado, R$ 650
const sem = cronogramaFaturas({ inicio: d("2026-11-02"), periodo: "SEMANAS", quantidade: 4, valorPeriodo: 650, faturamento: "ANTECIPADO" });
ok("4 faturas semanais", sem.length === 4);
ok("1ª vence no início", ymd(sem[0].vencimento) === "2026-11-02");
ok("1ª cobre até 08/11", ymd(sem[0].fim) === "2026-11-08", ymd(sem[0].fim));
ok("4ª vence 23/11", ymd(sem[3].vencimento) === "2026-11-23");

// postecipado vence no dia seguinte ao fim
const pos = cronogramaFaturas({ inicio: d("2026-11-02"), periodo: "SEMANAS", quantidade: 2, valorPeriodo: 650, faturamento: "POSTECIPADO" });
ok("postecipado vence 09/11", ymd(pos[0].vencimento) === "2026-11-09", ymd(pos[0].vencimento));

// meses: 31/01 + 1 mês = 28/02
ok("31/01 + 1 mês = 28/02", ymd(somarPeriodos(d("2027-01-31"), "MESES", 1)) === "2027-02-28");
const mes = cronogramaFaturas({ inicio: d("2027-01-31"), periodo: "MESES", quantidade: 3, valorPeriodo: 2600, faturamento: "ANTECIPADO" });
ok("mês 3 vence 31/03", ymd(mes[2].vencimento) === "2027-03-31", ymd(mes[2].vencimento));

// item adicional só nas faturas que ele cobre
const comItem = cronogramaFaturas({
  inicio: d("2026-11-02"), periodo: "SEMANAS", quantidade: 3, valorPeriodo: 650, faturamento: "ANTECIPADO",
  itens: [
    { inicio: d("2026-11-09"), fim: d("2026-11-15"), valor: 50, ativo: true },
    { inicio: d("2026-11-02"), fim: null, valor: 999, ativo: false },
  ],
});
ok("item fora da 1ª semana", comItem[0].valor === 650, String(comItem[0].valor));
ok("item na 2ª semana", comItem[1].valor === 700, String(comItem[1].valor));
ok("item inativo ignorado", comItem[2].valor === 650, String(comItem[2].valor));

ok("semanal de semanas", valorSemanal(650, "SEMANAS") === 650);
ok("semanal de dias", valorSemanal(100, "DIAS") === 700);
ok("semanal de mês", valorSemanal(2600, "MESES") === 600, String(valorSemanal(2600, "MESES")));

ok("CPF válido", documentoValido("529.982.247-25"));
ok("CPF inválido", !documentoValido("529.982.247-24"));
ok("CPF repetido inválido", !documentoValido("111.111.111-11"));
ok("CNPJ válido", documentoValido("11.222.333/0001-81"));
ok("CNPJ inválido", !documentoValido("11.222.333/0001-80"));
ok("formata CPF", formatarDocumento("52998224725") === "529.982.247-25");

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

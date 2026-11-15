/**
 * Testa a separação entre peça e mão de obra, importando o módulo REAL do
 * sistema (src/lib/manutencao-custo.ts).
 *
 * O risco desta mudança é o total divergir das partes: `cost` é o número que o
 * fechamento e os relatórios leem. Se ele deixar de
 * bater com peça + mão de obra, o dinheiro passa a mentir em três telas.
 *
 * Uso: npx tsx dev-tools\testar-peca-mao-de-obra.mts
 */
import { custoTotal, temDetalhamento, somarPecaMaoDeObra } from "../src/lib/manutencao-custo";

let falhas = 0;
function confere(nome: string, ok: boolean, detalhe: string) {
  if (!ok) falhas++;
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}  (${detalhe})`);
}

// ── O total é sempre a soma das partes ──
confere(
  "peça 350 + serviço 500 = 850",
  custoTotal(350, 500) === 850,
  String(custoTotal(350, 500))
);
confere(
  "alinhamento sem peça: 0 + 120 = 120",
  custoTotal(0, 120) === 120,
  String(custoTotal(0, 120))
);
confere(
  "peça que você mesmo instala: 90 + 0 = 90",
  custoTotal(90, 0) === 90,
  String(custoTotal(90, 0))
);
confere(
  "valor ainda não informado (nulo) conta como zero",
  custoTotal(null, 500) === 500,
  String(custoTotal(null, 500))
);
confere("nada informado = 0", custoTotal(null, null) === 0, String(custoTotal(null, null)));
confere(
  "centavos não se perdem: 350,55 + 499,45 = 850",
  custoTotal(350.55, 499.45) === 850,
  String(custoTotal(350.55, 499.45))
);

// ── Quem tem detalhamento e quem não tem ──
confere(
  "manutenção nova (com as duas partes) tem detalhamento",
  temDetalhamento({ partsCost: 350, laborCost: 500 }),
  "sim"
);
confere(
  "só a peça informada já conta como detalhada",
  temDetalhamento({ partsCost: 350, laborCost: null }),
  "sim"
);
confere(
  "zero é informação, não ausência (alinhamento sem peça)",
  temDetalhamento({ partsCost: 0, laborCost: 120 }),
  "sim"
);
confere(
  "manutenção ANTIGA (só o total) não tem detalhamento",
  !temDetalhamento({ partsCost: null, laborCost: null }),
  "não"
);

// ── A soma da frota ──
// O caso que importa: misturar manutenções novas (detalhadas) com as antigas,
// que só têm o total. As antigas não podem ser jogadas em peças nem em
// serviço — seria inventar a divisão — nem sumir da conta.
const registros = [
  { cost: 850, partsCost: 350, laborCost: 500 },
  { cost: 120, partsCost: 0, laborCost: 120 },
  { cost: 7000, partsCost: null, laborCost: null }, // antiga, como as do banco hoje
  { cost: 100, partsCost: null, laborCost: null }, // antiga
];
const g = somarPecaMaoDeObra(registros);

confere("soma das peças", g.pecas === 350, String(g.pecas));
confere("soma da mão de obra", g.maoDeObra === 620, String(g.maoDeObra));
confere("as antigas ficam à parte", g.semDetalhamento === 7100, String(g.semDetalhamento));

const totalPelasPartes = g.pecas + g.maoDeObra + g.semDetalhamento;
const totalPelosRegistros = registros.reduce((s, m) => s + Number(m.cost), 0);
confere(
  "NADA se perde: peças + serviço + não detalhado = total gasto",
  totalPelasPartes === totalPelosRegistros,
  `${totalPelasPartes} = ${totalPelosRegistros}`
);

// Lista vazia não pode virar NaN em tela de dinheiro.
const vazio = somarPecaMaoDeObra([]);
confere(
  "sem manutenção nenhuma: tudo zero, nada de NaN",
  vazio.pecas === 0 && vazio.maoDeObra === 0 && vazio.semDetalhamento === 0,
  JSON.stringify(vazio)
);

console.log(falhas === 0 ? "\nTodos os casos passaram." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);

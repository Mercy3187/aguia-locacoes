/**
 * Testa a regra que tira da cobrança de KM o contrato que já não vale,
 * importando o módulo REAL do sistema (src/lib/contratos-vigencia.ts).
 *
 * Uso: npx tsx dev-tools\testar-vigencia-contrato.mts
 */
import {
  revisarVigencia,
  DIAS_TOLERANCIA_FATURAMENTO,
  DIAS_VALIDADE_CONFIRMACAO,
} from "../src/lib/contratos-vigencia";

const HOJE = new Date("2026-09-01T12:00:00");
const dias = (n: number) => new Date(HOJE.getTime() - n * 86_400_000);

type Caso = {
  nome: string;
  entrada: Parameters<typeof revisarVigencia>[0];
  espera: "ok" | "carro-repassado" | "faturamento-parado";
};

const soEste = (id: string, inicio: Date, fim: Date | null = null) => [
  { id, startDate: inicio, endDate: fim },
];

const casos: Caso[] = [
  {
    nome: "faturamento em dia (boletos até o mês que vem): cobra normal",
    entrada: {
      id: "c1",
      startDate: dias(60),
      endDate: new Date("2026-09-21T14:00:00Z"),
      vigenciaConfirmadaAt: null,
      contratosAtivosDoCarro: soEste("c1", dias(60)),
    },
    espera: "ok",
  },
  {
    nome: "venceu ontem: dentro da tolerância, ainda cobra (lote pode atrasar)",
    entrada: {
      id: "c2",
      startDate: dias(60),
      endDate: dias(1),
      vigenciaConfirmadaAt: null,
      contratosAtivosDoCarro: soEste("c2", dias(60)),
    },
    espera: "ok",
  },
  {
    nome: `venceu há ${DIAS_TOLERANCIA_FATURAMENTO} dias: ainda no limite, cobra`,
    entrada: {
      id: "c3",
      startDate: dias(60),
      endDate: dias(DIAS_TOLERANCIA_FATURAMENTO),
      vigenciaConfirmadaAt: null,
      contratosAtivosDoCarro: soEste("c3", dias(60)),
    },
    espera: "ok",
  },
  {
    nome: "caso real (Thiago Gomes, OXN-7A73): boletos pararam em 17/08",
    entrada: {
      id: "c4",
      startDate: new Date("2026-07-20T14:00:00Z"),
      endDate: new Date("2026-08-17T14:00:00Z"),
      vigenciaConfirmadaAt: null,
      contratosAtivosDoCarro: soEste("c4", new Date("2026-07-20T14:00:00Z")),
    },
    espera: "faturamento-parado",
  },
  // ── O caso que a primeira versão da regra errava ──
  // Paulo e Jorge dividem o PDM-3E06 com a MESMA data de início (27/07). Só o
  // fim do faturamento separa um do outro: o de Paulo parou em 24/08, o de
  // Jorge segue até 21/09. Comparar apenas o início dava "faturamento parado"
  // no Paulo — sinal fraco, quando o forte estava ali.
  {
    nome: "caso real (Paulo, PDM-3E06): mesmo início do Jorge, boleto mais curto",
    entrada: {
      id: "paulo",
      startDate: new Date("2026-07-27T14:00:00Z"),
      endDate: new Date("2026-08-24T14:00:00Z"),
      vigenciaConfirmadaAt: null,
      contratosAtivosDoCarro: [
        {
          id: "paulo",
          startDate: new Date("2026-07-27T14:00:00Z"),
          endDate: new Date("2026-08-24T14:00:00Z"),
        },
        {
          id: "jorge",
          startDate: new Date("2026-07-27T14:00:00Z"),
          endDate: new Date("2026-09-21T14:00:00Z"),
        },
      ],
    },
    espera: "carro-repassado",
  },
  {
    nome: "o contrato VIGENTE do carro repassado (Jorge) não é acusado",
    entrada: {
      id: "jorge",
      startDate: new Date("2026-07-27T14:00:00Z"),
      endDate: new Date("2026-09-21T14:00:00Z"),
      vigenciaConfirmadaAt: null,
      contratosAtivosDoCarro: [
        {
          id: "paulo",
          startDate: new Date("2026-07-27T14:00:00Z"),
          endDate: new Date("2026-08-24T14:00:00Z"),
        },
        {
          id: "jorge",
          startDate: new Date("2026-07-27T14:00:00Z"),
          endDate: new Date("2026-09-21T14:00:00Z"),
        },
      ],
    },
    espera: "ok",
  },
  {
    nome: "caso real (Nadja, SIU-2C91): repasse com início e fim diferentes",
    entrada: {
      id: "nadja",
      startDate: new Date("2026-07-27T14:00:00Z"),
      endDate: new Date("2026-08-24T14:00:00Z"),
      vigenciaConfirmadaAt: null,
      contratosAtivosDoCarro: [
        {
          id: "nadja",
          startDate: new Date("2026-07-27T14:00:00Z"),
          endDate: new Date("2026-08-24T14:00:00Z"),
        },
        {
          id: "joao",
          startDate: new Date("2026-08-24T14:00:00Z"),
          endDate: new Date("2026-10-19T14:00:00Z"),
        },
      ],
    },
    espera: "carro-repassado",
  },
  {
    nome: "usuário confirmou ontem que o cliente continua: sai do aviso",
    entrada: {
      id: "c5",
      startDate: dias(90),
      endDate: dias(30),
      vigenciaConfirmadaAt: dias(1),
      contratosAtivosDoCarro: soEste("c5", dias(90)),
    },
    espera: "ok",
  },
  {
    nome: `confirmação de ${DIAS_VALIDADE_CONFIRMACAO}+ dias venceu: pergunta de novo`,
    entrada: {
      id: "c6",
      startDate: dias(120),
      endDate: dias(60),
      vigenciaConfirmadaAt: dias(DIAS_VALIDADE_CONFIRMACAO + 1),
      contratosAtivosDoCarro: soEste("c6", dias(120)),
    },
    espera: "faturamento-parado",
  },
  {
    nome: "confirmar NÃO segura o carro repassado (dois ativos é sempre erro)",
    entrada: {
      id: "velho",
      startDate: dias(90),
      endDate: dias(30),
      vigenciaConfirmadaAt: dias(1),
      contratosAtivosDoCarro: [
        { id: "velho", startDate: dias(90), endDate: dias(30) },
        { id: "novo", startDate: dias(10), endDate: dias(-20) },
      ],
    },
    espera: "carro-repassado",
  },
  {
    nome: "contrato sem data de faturamento nenhuma: não acusa nada",
    entrada: {
      id: "c7",
      startDate: dias(60),
      endDate: null,
      vigenciaConfirmadaAt: null,
      contratosAtivosDoCarro: soEste("c7", dias(60)),
    },
    espera: "ok",
  },
];

let falhas = 0;
for (const caso of casos) {
  const r = revisarVigencia(caso.entrada, HOJE);
  const obtido = r?.motivo ?? "ok";
  const passou = obtido === caso.espera;
  if (!passou) falhas++;
  console.log(`${passou ? "OK   " : "FALHA"} ${caso.nome}`);
  if (!passou) console.log(`        esperado "${caso.espera}", obtido "${obtido}"`);
  if (r) console.log(`        → ${r.aviso}`);
}

console.log(falhas === 0 ? `\n${casos.length} de ${casos.length} corretos.` : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);

/** Extrai a tabela da tela de correia em texto, para conferir os cálculos. */
const BASE = "http://localhost:3000";
const b = new Map();
const guardar = (r) => {
  for (const l of r.headers.getSetCookie?.() ?? []) {
    const [p] = l.split(";");
    const i = p.indexOf("=");
    b.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
};
const ck = () => [...b].map(([k, v]) => `${k}=${v}`).join("; ");

const r1 = await fetch(`${BASE}/api/auth/csrf`);
guardar(r1);
const { csrfToken } = await r1.json();
guardar(
  await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: ck() },
    body: new URLSearchParams({
      csrfToken,
      email: "admin@aguialocacoes.com.br",
      password: "dev123456",
      redirect: "false",
    }),
    redirect: "manual",
  })
);

const html = await (await fetch(`${BASE}/correia`, { headers: { cookie: ck() } })).text();

const limpa = (s) =>
  s
    .replace(/<!--[^>]*-->/g, "")
    .replace(/<\/t[dh]>/g, " ¦ ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&minus;|&#8722;/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const corpo = html.split("<tbody>")[1]?.split("</tbody>")[0] ?? "";
const linhas = corpo.split("<tr").slice(1);

console.log(
  "VEÍCULO | KM ATUAL | ÚLTIMA TROCA | TROCAR AOS | FALTA | RITMO | PREVISÃO | STATUS\n"
);
for (const l of linhas) console.log("  " + limpa(l).replace(/ ¦ $/, ""));

// Cartões do topo
const contagens = ["Vencidas", "Trocar em breve", "Em dia", "Sem registro de troca"];
console.log("\nCONTAGENS:");
for (const c of contagens) {
  const i = html.indexOf(c);
  if (i < 0) continue;
  const trecho = limpa(html.slice(i, i + 420));
  const m = trecho.match(/\b(\d+)\b(?!.*\bkm\b)/);
  console.log(`  ${c.padEnd(24)} ${trecho.slice(0, 90)}`);
}

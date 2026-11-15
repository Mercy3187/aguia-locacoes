/** Mostra, em texto, como ficou o painel "Precisa de atenção". */
const BASE = "http://localhost:3000";
const b = new Map();
const g = (r) => {
  for (const l of r.headers.getSetCookie?.() ?? []) {
    const [p] = l.split(";");
    const i = p.indexOf("=");
    b.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
};
const ck = () => [...b].map(([k, v]) => `${k}=${v}`).join("; ");

const r1 = await fetch(`${BASE}/api/auth/csrf`);
g(r1);
const { csrfToken } = await r1.json();
g(
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

const html = await (await fetch(`${BASE}/alertas`, { headers: { cookie: ck() } })).text();

const limpo = html
  .replace(/<!--[^>]*-->/g, "")
  .replace(/<\/li>/g, "\n")
  .replace(/<\/header>/g, "\n")
  .replace(/<\/h2>/g, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&#x27;/g, "'")
  .replace(/&amp;/g, "&")
  .replace(/[ \t]+/g, " ");

const inicio = limpo.indexOf("Alertas");
const fim = limpo.indexOf("Sem pendências");
console.log(
  limpo
    .slice(inicio, fim > 0 ? fim + 400 : inicio + 2500)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
);

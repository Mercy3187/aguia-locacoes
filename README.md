# Águia Locações — Gestão Interna

Sistema web interno para gestão de frota da **Águia Locações**: veículos, clientes,
contratos, comprovação de quilometragem a cada 15 dias, troca de óleo, manutenção,
inadimplência, multas e relatórios de rendimento.

## Tecnologias

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS 4** — tema escuro; cores em `src/app/globals.css`
- **Prisma 7** (ORM) + **PostgreSQL** via **Supabase**
- **Auth.js (NextAuth v5)** — login com perfis (Administrador, Financeiro, Funcionário)
- Integrações: **Asaas** (cobranças e boletos) e, opcional, extensão do Chrome (SENATRAN / DETRAN-PE)

## Identidade visual

| O quê | Onde |
|-------|------|
| Nome da empresa (títulos, WhatsApp, planilhas) | `src/lib/empresa.ts` |
| Cores do tema | `src/app/globals.css` (bloco `:root`) |
| Logo do menu e do login | `src/components/Logo.tsx` |
| Ícone do app no celular | `src/app/icon.tsx` e `src/app/apple-icon.tsx` |

## Configuração inicial

### 1. Instalar dependências

```bash
npm install
```

### 2. Variáveis de ambiente

Copie `.env.example` para `.env` e preencha os valores:

```bash
cp .env.example .env
```

- `DATABASE_URL` — connection string do Supabase (Connect → Transaction pooler, porta 6543)
- `AUTH_SECRET` — segredo da autenticação (`npx auth secret`)
- `NEXT_PUBLIC_APP_URL` — URL pública da app (links do motorista)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`,
  `SUPABASE_STORAGE_BUCKET` — armazenamento das fotos
- `ASAAS_API_KEY` / `ASAAS_ENV` — opcional; sem chave, a inadimplência fica desligada
- `CRON_SECRET` — protege a rotina diária (`/api/cron/diario`) na Vercel

> ⚠️ O arquivo `.env` está no `.gitignore` e **nunca** deve ser commitado.

### 3. Criar as tabelas no banco

```bash
npm run db:push
```

Depois de TODO `db:push` que criar tabela nova, feche as tabelas para a API
REST pública do Supabase (sem isso, a chave pública "anon" lê os dados):

```bash
npx tsx dev-tools/travar-api-publica.mts --aplicar
```

### 4. Criar o usuário administrador

```bash
npm run db:seed
```

Cria um admin com as credenciais definidas em `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD`. **Troque a senha no primeiro acesso.**

### 5. Rodar em desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Scripts úteis

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run db:push` | Aplica o schema ao banco |
| `npm run db:seed` | Cria o administrador inicial |
| `npm run db:seed:dev` | Popula um banco de testes com dados fictícios |
| `npm run db:studio` | Abre o Prisma Studio (visualizar dados) |
| `npm run lint` | Verifica o código |

## Perfis de usuário

- **Administrador** — acesso total
- **Financeiro** — contratos, pagamentos, relatórios e clientes
- **Funcionário** — veículos, KM, checklist e manutenção
- **Motorista** — sem login; acessa apenas pelo link exclusivo de KM

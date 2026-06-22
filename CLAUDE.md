# Family Brain — Claude Code guide

> Auto-loaded by Claude Code for this app. Keep it clean and simple over hardened, and
> don't add features beyond the documented set without asking first. It now targets a
> real deploy: **Cloudflare Workers (via OpenNext) + Supabase Postgres**, while staying
> "clone, set DATABASE_URL + a model key, run, and it works".

## What this is

A private second-brain chat app for one household. Each person chats with an AI
assistant, picks the model + persona, and stores/recalls memories — some **shared**
with the whole family, some **private** to one member. The signature feature is
**recall**: "what did we get Mum for her 60th?" is answered from a stored memory, and
the UI shows which memory was used.

## Stack

- **Next.js 15 (App Router) + TypeScript + Tailwind** — UI and API in one codebase.
- **Supabase Postgres** via the **`postgres.js`** driver (pure JS — no native build
  step, runs on Cloudflare Workers under `nodejs_compat`). Plain SQL, no ORM. Don't
  reintroduce a native driver (`better-sqlite3`) or `node:sqlite` — neither runs on
  Workers.
- **Connect through the Supabase POOLER** (Supavisor, transaction mode, port 6543).
  That mode forbids server-side prepared statements, so the client sets `prepare:false`.
- DB auto-creates schema + **seeds itself on first run** (`ensureReady()` in `db.ts`,
  guarded by an advisory lock + empty-`members` check). All data access is **async**.
- **Hosting:** Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`). Config in
  `wrangler.jsonc` (needs the `nodejs_compat` flag) + `open-next.config.ts`.

## Run / build commands

```bash
npm install        # JS-only deps, no compiler needed
npm run dev        # http://localhost:3000  (reads .env, incl. DATABASE_URL)
npm run build      # Next production build (also full typecheck)
node node_modules/typescript/lib/tsc.js --noEmit   # typecheck only
npm run preview    # build the Worker bundle + run it locally on workerd
npm run deploy     # build + deploy to Cloudflare Workers
```

- **Requires Node ≥ 20.** `DATABASE_URL` (Supabase pooler string) must be set in `.env`
  for the app to start — see `.env.example`.
- **Reset to clean demo state:** drop the tables (or the data) in your Supabase project;
  the schema + seed re-create on the next request.
- **Secrets in production** are Cloudflare secrets, not committed: `wrangler secret put
  DATABASE_URL` (and `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `AZURE_*` as needed).
- After UI/type changes, prefer `npm run build` (catches type + route errors). A
  transient 500 right after editing is usually a mid-recompile hit — re-request.

## Layout

```
src/
  app/
    page.tsx              # main app: TopBar + Chat + MemoryPanel
    settings/page.tsx     # provider/model picker (dropdown + Save) + persona manager
    api/                  # members, personas, personas/[id], memories, memories/[id],
                          #   settings, models, chat   (all runtime = "nodejs")
  components/             # TopBar, Chat, MemoryPanel
  lib/
    db.ts                 # postgres.js client + schema + ensureReady() + tx() helper
    seed.ts               # first-run seed data (runs once, when members table is empty)
    memories.ts           # privacy-scoped reads + keyword recall   ← privacy lives here
    providers.ts          # the one chat() abstraction + listModels() + adapters
    current.ts            # resolves the "current member" from the x-member-id header
    client.ts             # browser fetch wrapper that attaches x-member-id
    types.ts              # shared types (ProviderId, Member, Memory, …)
wrangler.jsonc            # Cloudflare Worker config (nodejs_compat flag)
open-next.config.ts       # OpenNext adapter config
.env                      # secrets (git-ignored) ; .env.example is the template
```

## Data model (Postgres — see `src/lib/db.ts`)

`members(id,name,avatar)` · `spaces(id,type['family'|'personal'],owner_member_id)` ·
`memories(id,space_id,author_member_id,title,body,tags,created_at)` ·
`personas(id,name,avatar,system_prompt)` · `conversations(id,member_id,persona_id,space_id,created_at)` ·
`messages(id,conversation_id,role,content,model_used,created_at)` ·
`settings(id=1,provider,model,base_url)` (single row).

Each member has exactly one Personal space; there is exactly one Family space shared by all.

## THE PRIVACY RULE (most important invariant)

There is no real auth (it's a demo). The top-bar **"I am [member]"** switcher sets an
`x-member-id` header on every request; the server scopes all reads to that member.

> A member may only ever see the **Family** space plus their **own Personal** space —
> never another member's personal items.

This is enforced in **one place** — `src/lib/memories.ts` (`allowedSpaceIds()` and the
helpers built on it). **Any new memory read MUST go through these helpers**, never a
raw `SELECT * FROM memories`. By-id reads return 404 when the member isn't allowed to
see the row (not 403 — don't leak existence). When adding features, preserve this.

## Provider abstraction (`src/lib/providers.ts`)

Every model call goes through one function:

```ts
chat({ provider, model, baseUrl, apiKey, system, messages })
```

Providers: `local` (Ollama / LM Studio, OpenAI-compatible, no key), `openai`,
`azure` (Azure OpenAI), `anthropic`. **Keys are read server-side from `.env` only**
(`keyForProvider()`), never sent to the browser. The active model shows in the top bar.

**To add a provider:** add an entry to `PROVIDERS` (drives the Settings UI) and a
`case` in the `chat()` switch. That's the whole change — keep it that simple.

Key behaviours to preserve:
- **Base-URL normalisation** (`normalizeOpenAiBase`): strips a trailing
  `/responses` · `/chat/completions` · query string, and appends `/v1` if missing — so
  the bare address LM Studio shows ("Reachable at `http://host:1234`") and a pasted
  Azure `/openai/v1/responses` URL both resolve correctly.
- **Azure auth**: API keys go in the **`api-key` header** (NOT `Authorization: Bearer`,
  which is Entra-ID-token only), plus `?api-version=preview`. Confirmed against MS Learn.
  The Azure `model` is the **deployment name**.
- **Temperature retry**: if a model rejects `temperature` (some reasoning models do),
  the request is retried once without it instead of failing.
- **Model discovery**: `listModels()` powers the Settings dropdown's "Fetch models"
  via OpenAI-compatible `GET /v1/models` (Anthropic uses its own `/v1/models`). On
  failure the dropdown falls back to the provider's suggested `models` list.

## Recall (`searchMemories` in `src/lib/memories.ts`)

Keyword match over the **active space only** (so privacy holds): query split into
words ≥3 chars, minus a stopword list, matched on word boundaries (so "get" doesn't hit
"together"), scored by distinct-word hits, top 5 returned. The chat route injects these
into the system prompt and returns them as `used` so the UI can show/​highlight them.
"Remember that …" in chat saves a memory into the active space. Keep recall simple and
transparent — only add embeddings if it's trivial and asked for.

## Conventions & gotchas

- **All data access is async.** Get the client with `const sql = await db()` then use
  tagged-template queries: `` await sql`SELECT … WHERE id = ${id}` ``. Inserts return
  rows via `RETURNING` (there is no `lastInsertRowid`). For `IN` lists, pass a JS array:
  `` WHERE space_id = ANY(${ids}) ``. postgres.js returns typed rows, so
  `` await sql<Member[]>`…` `` types cleanly — no `as unknown as` dance.
- **Transactions:** `await tx(async (sql) => { … })` (wraps `sql.begin`). Use the scoped
  `sql` it hands you for every statement that must commit together.
- **`prepare:false` is load-bearing** — the Supabase transaction pooler rejects named
  prepared statements. Don't remove it.
- **RLS is enabled on every table** (in the `db.ts` schema migration) to slam shut
  Supabase's PostgREST "Data API" side-door (anon key). There are **no policies** — the
  app connects as the table OWNER, which bypasses RLS, so this is invisible to the app;
  privacy is still enforced in app code. **Don't add `FORCE ROW LEVEL SECURITY`** and
  **don't switch the app to a non-owner DB role** — either would subject the app to RLS
  and break it (you'd then need real policies).
- **Secrets:** `.env` locally (git-ignored), Cloudflare secrets in prod. Never hardcode
  keys or commit them. `.env.example` holds placeholders only. If a key is exposed, tell
  the user to rotate it.
- **Australian English** for any user-facing copy (organisation, licence, etc.).
- **Seed runs once** (guarded by empty `members` table). To change seed data, clear the
  Supabase tables and let it reseed on the next request.

## Guardrails

No real auth, no payments, no production hardening, and **no features beyond the list
above without asking the user first**. The bar is: clone, set `DATABASE_URL` + a model
key, `npm run dev`, and the recall demo works on first run; `npm run deploy` ships it to
Cloudflare. Privacy is still enforced in app code (service-role DB access, scoped by
`x-member-id`) — see THE PRIVACY RULE above.

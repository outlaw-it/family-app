# 🧠 Family Brain

A private **second-brain chat app for a household**. One app for the whole family:
each person chats with an AI assistant, picks which model powers it, chooses a persona,
and stores & recalls information. Some memories are **shared** with the whole family;
some are **private** to one person.

The signature moment is **recall**: someone asks _"what did we get Mum for her 60th?"_
and the assistant answers from a stored family memory — and shows you which one it used.

> Runs on **Cloudflare Workers + Supabase Postgres**. No real authentication or payments.
> Secrets live in `.env` locally (git-ignored) and as Cloudflare secrets in production.

---

## Stack

- **Next.js 15 (App Router) + TypeScript** — UI and API in one codebase.
- **Supabase Postgres** via the **`postgres.js`** driver — pure JS, **no native build
  step**, and runs on Cloudflare Workers. The schema auto-creates and **seeds itself**
  on first run. Plain SQL, no ORM.
- **Cloudflare Workers** hosting via **OpenNext** (`@opennextjs/cloudflare`).
- **Tailwind CSS** for a clean, simple UI.
- A single **provider abstraction** (`chat({ provider, model, baseUrl, apiKey, system, messages })`)
  with adapters for local OpenAI-compatible servers (Ollama / LM Studio), Anthropic
  Claude, and OpenAI.

API keys never reach the browser — every model call runs server-side in `/api/chat`.

---

## Requirements

- **Node.js 20+.** Check with `node --version`.
- A **Supabase** project (free tier is fine) for the Postgres database.
- For deployment: a **Cloudflare** account (`wrangler` is included as a dev dependency).

---

## Setup & run

```bash
# 1. install JS dependencies
npm install

# 2. configure env
cp .env.example .env
#    - DATABASE_URL  → your Supabase POOLER string (Transaction mode, port 6543):
#        Supabase dashboard → Connect → Connection pooling
#    - (optional) model keys: ANTHROPIC_API_KEY / OPENAI_API_KEY / AZURE_* ,
#      or use a local Ollama / LM Studio model with no key

# 3. run
npm run dev
```

Open **http://localhost:3000**. The schema is created and seeded automatically on first
load — a sample family, 4 personas, and 12 memories are ready to go.

> To reset to a clean state, drop the tables in your Supabase project; they re-create
> and reseed on the next request.

---

## Deploy to Cloudflare

```bash
# one-time: log in and set production secrets
npx wrangler login
npx wrangler secret put DATABASE_URL
npx wrangler secret put ANTHROPIC_API_KEY      # + OPENAI_API_KEY / AZURE_* as needed

# preview the Worker locally on workerd, or ship it
npm run preview
npm run deploy
```

Hosting config is in [`wrangler.jsonc`](wrangler.jsonc) (the `nodejs_compat` flag is
required) and [`open-next.config.ts`](open-next.config.ts).

---

## Picking a model

Open **⚙️ Settings** (top-right). Choose a provider and model:

| Provider | Needs a key? | Notes |
|---|---|---|
| **Local (Ollama / LM Studio)** | No | Default base URL `http://localhost:11434/v1` (Ollama). For LM Studio use `http://localhost:1234/v1`. Run e.g. `ollama run llama3.1` first. |
| **Anthropic Claude** | `ANTHROPIC_API_KEY` in `.env` | Models: `claude-haiku-4-5-20251001`, `claude-sonnet-4-6`, `claude-opus-4-8`. |
| **OpenAI** | `OPENAI_API_KEY` in `.env` | Models: `gpt-4o-mini`, `gpt-4o`, … |

Settings shows a green **"key found"** badge next to any provider whose key is present
in `.env`. The active provider + model is always shown in the top bar.

**Adding a new provider** is a small, obvious change: add an entry to `PROVIDERS`
and a `case` in `chat()` in [`src/lib/providers.ts`](src/lib/providers.ts).

---

## How to demo it (2 minutes)

1. **Recall (the headline).** With **Family Organiser** persona and the **👪 Family**
   space active, ask: **"What did we get Mum for her 60th?"** The assistant answers
   from the stored memory, and the reply shows a **★ Recalled** note listing the
   memory it used. The matching card in the side panel highlights amber.
2. **Switch member.** In the top bar, change **"I am"** from Dad to **Mum**. Toggle to
   **🔒 My Personal** — you'll see Mum's private notes (e.g. "Dad's surprise 50th").
   Switch to **Dad** and you'll see *his* private notes instead — **never Mum's**.
   That's the privacy rule: every member sees the Family space + only their own Personal.
3. **Add a memory.** In the side panel, click **+ Add**, write a note, save it to the
   active space. Ask a question that matches it — the assistant recalls it.
4. **Remember-that.** Type **"Remember that the spare key is under the blue pot."**
   The assistant saves it to the active space (shown with a 💾 badge) and confirms.
5. **Change persona.** Switch to **Homework Tutor** or **Tech Helper** and notice the
   assistant's behaviour change. Create/edit/delete personas in **Settings**.

---

## Privacy rule (the important bit)

There is no login. The top-bar **"I am [member]"** switcher simulates who is using the
app and sets an `x-member-id` header on every request. **All reads are scoped to that
member on the server** ([`src/lib/memories.ts`](src/lib/memories.ts)): a member can only
ever see the **Family** space plus their **own Personal** space. Even fetching another
member's personal memory by guessing its id returns **404**.

---

## Data model (Postgres)

`members` · `spaces` (`family` | `personal`, with `owner_member_id`) · `memories`
(title, body, tags, date, author, space) · `personas` · `conversations` · `messages` ·
`settings`. Schema lives in [`src/lib/db.ts`](src/lib/db.ts); seed data in
[`src/lib/seed.ts`](src/lib/seed.ts).

---

## Project layout

```
src/
  app/
    page.tsx              # main app: top bar + chat + memory panel
    settings/page.tsx     # provider/model picker + persona manager
    api/                  # members, personas, memories, settings, chat
  components/             # TopBar, Chat, MemoryPanel
  lib/
    db.ts                 # postgres.js client + schema + ensureReady() + tx()
    seed.ts               # first-run seed data
    memories.ts           # privacy-scoped reads + keyword recall
    providers.ts          # the one chat() abstraction + adapters
wrangler.jsonc            # Cloudflare Worker config (nodejs_compat)
open-next.config.ts       # OpenNext adapter config
```

---

## Notes & guardrails

- No auth and no production hardening — privacy is enforced in app code, scoped by the
  `x-member-id` header (see above).
- Keys live only in `.env` locally (git-ignored) / Cloudflare secrets in prod. Nothing
  is sent anywhere except the model provider you explicitly choose.
- Recall uses simple keyword matching (word-boundary, stopword-filtered) over the
  active space — intentionally transparent so you can see exactly why a memory matched.

# QueryMind AI

Ask questions about your data in plain English and get the answer as a clean, searchable table.

> “Show the top 5 employees with the highest salaries.”
>
> | Employee     | Salary  |
> |--------------|--------:|
> | Rahul Sharma | ₹90,000 |
> | Priya Iyer   | ₹85,000 |
> | Amit Verma   | ₹80,000 |

QueryMind uses an LLM (through [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi)) to turn the question into SQL **on the server**, checks that the SQL is a safe read-only query, runs it against your database, and sends **only the result rows** back to the browser. Users never see SQL, prompts, schema definitions or credentials.

---

## Features

- **Ask in English.** Large question box, the **Ask AI** button (or <kbd>Enter</kbd>), and clickable example questions.
- **Answer tables.** Search, type-aware sorting, pagination, CSV export, money and date formatting (₹ by default, configurable), and a big-number view for single values.
- **Clear states.** Loading progress, “no matching records”, friendly errors with retry (including rate-limit countdowns), and a polite refusal for requests to change data.
- **Demo mode.** With no database configured, questions run against a built-in fictional dataset. Demo results are always labelled **Sample data**.
- **History and saved questions.** Re-run, search, edit, duplicate and delete. Stored in the browser only.
- **Settings.** AI and database status, connection test, model choice, row limit, rows per page, currency, number format, theme, and history controls.
- **Accessible and responsive.** Light and dark themes, keyboard navigation, skip link, and layouts tested down to phone width.

## How it works

```
Browser                         Next.js server (API routes)                       External
───────                         ───────────────────────────                       ────────
question ──POST /api/ask──▶  1. validate input (zod), rate-limit
                             2. load schema (introspected from DB, cached 5 min)
                             3. pick relevant tables ───────────────────────────▶ FreeLLMAPI
                             4. LLM writes SQL (JSON response)  ◀─────────────── /v1/chat/completions
                             5. parse + validate SQL (node-sql-parser)
                                 • exactly one SELECT / WITH…SELECT
                                 • no writes anywhere (CTEs, subqueries)
                                 • no SELECT INTO, locking, or dangerous functions
                                 • tables/columns must exist (else one repair try)
                             6. run in READ ONLY transaction ───────────────────▶ PostgreSQL
                                 with statement_timeout + row cap                 (read-only user)
rows + column info ◀──────── 7. return columns, rows, safe notices. Never SQL.
```

If the generated SQL fails validation or the database rejects it (for example, a misspelled column), the server gives the model the error and asks once for a fix. Requests to add, change or delete data are refused.

### Security model

| Concern | What QueryMind does |
|---|---|
| SQL exposure | SQL is generated, validated and executed only on the server. API responses contain rows, column metadata and plain-language messages, never SQL, prompts or schema. |
| Destructive SQL | Parser-based validation (not regex): one statement only, `SELECT` only, every nested node is checked, unparseable SQL is rejected (fail closed). |
| Defence in depth | Queries run inside `BEGIN TRANSACTION READ ONLY … ROLLBACK`, so PostgreSQL itself rejects writes, and you should connect with a read-only user ([db/create-readonly-user.sql](db/create-readonly-user.sql)). |
| Runaway queries | `statement_timeout` (default 10 s), hard row cap (default 500), request rate limiting. |
| Secrets | Read from server environment variables only (no `NEXT_PUBLIC_`). Never logged, never returned. Provider error bodies aren't logged or forwarded. |
| Credentials in the browser | None. The database is configured with `DATABASE_URL` on the server, and the UI can only trigger a test of that connection. |
| Logging | Questions and SQL are not logged. `QUERYMIND_DEBUG_SQL=true` prints SQL in development only. |

Parser validation and read-only transactions greatly reduce risk but **cannot guarantee complete security**. Always use a least-privilege, read-only database account, and avoid pointing QueryMind at data that its users shouldn't see.

---

## 1. Run locally

Requirements: Node.js 20.9+ (22 recommended) and npm.

```bash
cd querymind
npm install
cp .env.example .env.local
```

Fill in `.env.local` (see the next two sections), then:

```bash
npm run dev
```

Open http://localhost:3000. With only the AI configured, you're in **demo mode** and can ask about employees, departments, customers, accounts, transactions and loans.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Run the unit and API tests (Vitest) |
| `npm run typecheck` | Generate route types and run TypeScript |
| `npm run lint` | ESLint |
| `npm run build && npm start` | Production build and server |

## 2. Configure FreeLLMAPI

FreeLLMAPI is a self-hosted router that exposes one OpenAI-compatible endpoint in front of many free-tier LLM providers.

1. **Install and start FreeLLMAPI** (Docker), following its README:
   ```bash
   curl -fsSL https://freellmapi.co/install.sh | bash
   ```
   It serves a dashboard and API on **http://localhost:3001**.
2. In the dashboard, add your provider keys. Then copy your **unified key** from the **Keys** page. It starts with `freellmapi-`.
3. In `querymind/.env.local`:
   ```bash
   FREELLMAPI_BASE_URL=http://localhost:3001/v1
   FREELLMAPI_API_KEY=freellmapi-your-unified-key
   FREELLMAPI_MODEL=auto
   ```
   - QueryMind calls `POST {BASE_URL}/chat/completions` and `GET {BASE_URL}/models` with `Authorization: Bearer <key>`, as FreeLLMAPI documents.
   - `auto` lets the router choose a model and fall back when a provider is rate-limited. `auto:fast`, `auto:smart` or a specific model id also work. Users can override the model in **Settings**, which lists what your instance reports.
4. Restart `npm run dev`. The header should show **AI ready**.

## 3. Connect your database

Leave `DATABASE_URL` empty to stay in demo mode. To use your real data (PostgreSQL):

1. **Create a read-only user** while connected as an admin to the database QueryMind should read:
   ```bash
   psql "$ADMIN_DATABASE_URL" -v ro_password="'choose-a-strong-password'" -f db/create-readonly-user.sql
   ```
   This creates `querymind_readonly` with `SELECT` on the `public` schema only, and makes its sessions read-only by default.
2. **Set the connection string** in `.env.local`:
   ```bash
   DATABASE_URL=postgresql://querymind_readonly:choose-a-strong-password@your-host:5432/your_db
   # Hosted databases (Neon, Supabase, RDS…) usually need: ?sslmode=require
   ```
3. Restart, open **Settings → Database → Test connection**. You'll see the table count, plus a warning if the account can write.
4. Ask a question. Answers are labelled **Live data**.

Tips for better answers: give tables and columns descriptive names, and add comments. QueryMind sends table comments to the model:
```sql
COMMENT ON TABLE employees IS 'Company employees. salary is the monthly salary in INR.';
```

**Try live mode locally with Docker.** `docker compose up -d` starts PostgreSQL on port 5433 with the demo data and a read-only user:
```bash
DATABASE_URL=postgresql://querymind_readonly:readonly_dev_password@localhost:5433/querymind
```

Other databases: execution goes through a small adapter interface ([src/lib/server/db/adapter.ts](src/lib/server/db/adapter.ts)). PostgreSQL is implemented. MySQL, SQLite and SQL Server can be added as adapters, since the validator already understands their dialects.

## 4. Deploy (free-tier friendly)

| Piece | Free option | Notes |
|---|---|---|
| Web app | **Vercel** Hobby | Import the repo, set the root directory to `querymind`, and add the env vars in Project → Settings → Environment Variables. |
| Database | **Neon** or **Supabase** free tier | Create the read-only user, then use its connection string with `?sslmode=require`. |
| FreeLLMAPI | Your own always-on machine + **Cloudflare Tunnel**, or a free VM (for example Oracle Cloud Always Free) | It needs persistent storage for its encrypted keys, so avoid hosts with ephemeral disks. |

**Important: a deployed site cannot reach `localhost` on your computer.** On Vercel, `FREELLMAPI_BASE_URL=http://localhost:3001/v1` points at Vercel's own server, not your laptop. Expose FreeLLMAPI at a public HTTPS URL your server can reach, for example with a Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:3001
```

Then set `FREELLMAPI_BASE_URL=https://<your-tunnel-host>/v1`. A free quick tunnel's URL changes on restart. A named tunnel on your own domain keeps it stable. FreeLLMAPI is protected by its unified key, which stays in Vercel's server-side environment.

Steps on Vercel:

1. Push the project to GitHub.
2. In Vercel, choose **New Project**, import the repo and set **Root Directory** to `querymind`.
3. Add `FREELLMAPI_BASE_URL`, `FREELLMAPI_API_KEY`, `FREELLMAPI_MODEL`, and optionally `DATABASE_URL`, `QUERY_MAX_ROW_LIMIT` and `QUERY_TIMEOUT_MS`.
4. Deploy, then open **Settings** in the app to check that both status lines are green.

Cost notes: everything above can run on free tiers. LLM usage is limited by the free quotas of the providers you add to FreeLLMAPI, and FreeLLMAPI describes itself as meant for personal experimentation, so check the providers' terms before relying on it for production traffic. Demo mode runs an in-process PostgreSQL (PGlite) that loads the sample data on each cold start. That's fine for demos. Use a real database for anything else.

---

## Project structure

```
querymind/
├─ db/
│  ├─ demo-seed.sql              Fictional demo dataset (also used by docker-compose)
│  ├─ create-readonly-user.sql   Least-privilege PostgreSQL user
│  └─ docker-readonly-user.sh    docker-compose init helper
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                Ask page
│  │  ├─ history/ saved/ settings/
│  │  └─ api/
│  │     ├─ ask/                 POST: question → rows (the core pipeline)
│  │     ├─ health/              GET: AI + database status (no secrets)
│  │     ├─ models/              GET: models offered by FreeLLMAPI
│  │     └─ database/test/       POST: test the server-configured database
│  ├─ components/                App shell, results table, states, dialogs, settings
│  └─ lib/
│     ├─ server/                 Server-only: env, LLM client, ask pipeline, http helpers
│     │  └─ db/                  Adapter interface, PostgreSQL, demo (PGlite), shared SQL
│     ├─ sql/                    Parser-based read-only validator
│     ├─ llm/                    Prompts and model-output parsing
│     ├─ client/                 Browser store, API client, formatting/CSV, theme
│     ├─ schema.ts               Schema → prompt, relevant-table selection
│     └─ types.ts                Shared types (client types carry no SQL)
└─ tests/                        Validator, parsing/formatting, /api/ask handler
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| **AI not set up** | Set `FREELLMAPI_BASE_URL` and `FREELLMAPI_API_KEY`, then restart. |
| **AI unreachable** | Is FreeLLMAPI running? Does the URL end in `/v1`? On a deployed site, use a public URL, not `localhost`. |
| “The AI provider rejected the server's API key” | Copy the unified key again from the FreeLLMAPI Keys page. |
| Rate-limit messages | Add more provider keys in FreeLLMAPI, or wait for the countdown. |
| “The server could not sign in to the database” | Check the user and password in `DATABASE_URL`. |
| SSL errors with hosted databases | Add `?sslmode=require` to `DATABASE_URL`. |
| Answers miss the point | Rephrase more specifically, add table comments, or try `auto:smart`. |

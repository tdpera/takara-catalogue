# Souq Catalogue

A mobile-first catalogue for gold and jewellery sellers in Dubai. Salespeople photograph a piece
on the scale, the app fills in the details and prices it at today's gold rate, and they share
pieces with clients as a private link, a catalogue image or a WhatsApp message they send
themselves.

**Languages:** English, Arabic (right to left), Hindi, Malayalam. **Works on bad Wi-Fi:** pieces
are saved on the phone first and upload in the background.

**What's in it**
- **Shops and roles:** owner, manager, salesperson. Every shop's data is isolated by row level
  security in the database.
- **Gold rates and pricing:** daily rates per karat (22K, 21K and 18K can be filled from 24K);
  exact decimal pricing with stones, making charges (per gram or flat), extras and VAT.
- **Capture:** photo, karat, category and weight in about 10 seconds; optional 360° spin from a
  turntable video, made on the phone.
- **AI fill:** reads the scale display, purity stamp and design, writes a name and descriptions in
  4 languages, and highlights everything it filled for checking.
- **Catalogue:** grid with spins, filters, search, a piece page with a price breakdown, editing.
- **Sharing:** private links with live prices and view tracking, a 1080 px catalogue image, and a
  WhatsApp button. Nothing is sent automatically.

Why things were built the way they were is in **[DECISIONS.md](DECISIONS.md)**.

**Stack:** Next.js 15 (App Router, TypeScript), Tailwind CSS 4, Supabase (Postgres, phone sign-in,
Storage, RLS), the Claude API (server side only), deployed on Vercel.

---

## Run it locally

You need **Node 20+**, **pnpm 10** and **Docker** (for the local Supabase).

```bash
pnpm install
```

```bash
pnpm db:start
```

`db:start` starts Supabase in Docker and prints its URL and keys (print them again any time with
`pnpm exec supabase status`). Then:

```bash
cp .env.example .env.local
```

Fill in `.env.local` from what `db:start` printed:

| `.env.local` | from `pnpm db:start` |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `API_URL` / "API URL" (usually `http://127.0.0.1:54321`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `ANON_KEY` / "anon key" (the long `eyJ…` value) |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` / "service_role key" (the long `eyJ…` value) |

Add some demo data and start the app:

```bash
pnpm seed
```

```bash
pnpm dev
```

Open http://localhost:3000 and sign in with **050 000 0001**. No message is sent locally: the
code is always **123456**. The test numbers `050 000 0001` to `050 000 0004` are set in
`supabase/config.toml`.

`pnpm seed` creates **Al Noor Jewellers (demo)**:
- 10 pieces (bangles, rings, chain, necklace, jhumkas, pendant, bracelet, bridal set), two with
  360° spins, one reserved and one sold;
- today's gold rates;
- a client and a live share link (printed at the end).

The owner is 050 000 0001 and a salesperson is 050 000 0002. Pictures are drawn illustrations
marked "DEMO". Running it again replaces the demo shop.

To try AI fill locally, add `ANTHROPIC_API_KEY` to `.env.local` and restart `pnpm dev`.

> The service worker (offline support, image cache) only runs in production builds. To try it
> locally: `pnpm build && pnpm start`.

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build`, `pnpm start` | Production build and server |
| `pnpm db:start`, `pnpm db:stop` | Local Supabase in Docker |
| `pnpm db:reset` | Recreate the local database from `supabase/migrations` (**deletes local data**) |
| `pnpm seed` | Demo shop with 10 pieces (see above) |
| `pnpm test` | Unit tests: pricing, rates, AI output checks, messages, filters |
| `pnpm test:db` | Database tests: shop isolation, roles, AI limits, share links (needs `db:start`) |
| `pnpm e2e --yes` | Browser tests on a production build (needs `db:start`; **resets the local database**) |
| `pnpm lint`, `pnpm typecheck`, `pnpm db:lint` | ESLint, TypeScript, Supabase security linter |

### Tests

- **Unit** (`src/**/*.test.ts`, about 120 tests) and **database** (`tests/db`, about 55 tests) run
  with Vitest. The database tests sign in as real users through the public API, exactly as the
  app does, and check that shops can't see each other's data.
- **Browser** (`e2e/`, about 160 checks) uses Playwright with an emulated Pixel 5. The suites:
  capture (including slow 3G and offline), AI fill, catalogue and sharing. A local stand-in
  replaces the Claude API, so the tests are free and can cover rate limits, refusals and broken
  replies. The first time, install the browser with `pnpm exec playwright install chromium`.
  Screenshots go to `e2e/.tmp/out/`.

---

## Environment variables

| Variable | Where it's used | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server. Public by design: row level security decides what each user can do. | Yes |
| `NEXT_PUBLIC_SITE_URL` | The app's address, used in share links, e.g. `https://catalogue.example.com` | Yes in production |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Signs images for the public share page; used by `pnpm seed`. Never expose it. | Yes, for share links |
| `ANTHROPIC_API_KEY` | **Server only.** AI fill and "Write with AI". Without it, those buttons say AI isn't set up. | No |
| `ANTHROPIC_MODEL` | Claude model. Default `claude-opus-5-5`. | No |
| `ANTHROPIC_EFFORT` | `low` (default), `medium`, `high`… Higher is slower and costs more. | No |

The SMS/WhatsApp provider for sign-in codes (Twilio) is configured in Supabase, not here.

---

## Deploy (Supabase + Vercel)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com). Choose the region closest to your
   shops; for Dubai that's usually Mumbai (`ap-south-1`) unless your plan offers a Middle East
   region.
2. Apply the database schema from this repo (tables, security rules, functions and storage
   buckets are all in `supabase/migrations`).

   **Easiest (no command line):** in the Supabase dashboard open **SQL Editor → New query**,
   paste the whole of [`supabase/setup.sql`](supabase/setup.sql) and press **Run**. Do this once,
   on a new empty project. (`setup.sql` is all the migrations joined, made by
   `pnpm db:setup-sql`.)

   **Or with the Supabase CLI**, which also handles later updates. Log in:

   ```bash
   pnpm exec supabase login
   ```

   Link the project (the reference is in its URL):

   ```bash
   pnpm exec supabase link --project-ref <your-project-ref>
   ```

   Then push the migrations:

   ```bash
   pnpm exec supabase db push
   ```

3. **Sign-in by phone:**
   - Authentication → Sign In / Providers → **Phone**: enable it and connect **Twilio** (Account
     SID, Auth Token, and a Message Service SID or Twilio Verify).
   - Codes are sent on WhatsApp first, with SMS as the fallback. WhatsApp needs a WhatsApp sender
     approved in Twilio. Until that's ready, staff can tap "Send by SMS instead".
   - To demo without sending messages, add test numbers and fixed codes on the same page.
4. **Plan limits:** the free plan limits uploads to **50 MB per file**. Photos and spins are far
   smaller, but original spin videos over 50 MB need the Pro plan; the bucket itself allows
   100 MB.
5. From Project Settings → API keys, copy the **URL**, the **anon/publishable key** and the
   **service_role/secret key**.

### 2. Vercel

1. Push this repository to GitHub and import it in [Vercel](https://vercel.com). It detects
   Next.js; keep the defaults (install `pnpm install`, build `pnpm build`).
2. Add the environment variables from the table above, for Production (and Preview if you use
   it). Set `NEXT_PUBLIC_SITE_URL` to the production address, e.g. `https://your-app.vercel.app`
   or your own domain.
3. In Project → Settings → Functions, set the **function region next to your Supabase region**
   (e.g. Mumbai, `bom1`). Every page talks to the database, so this matters more than anything
   else for speed.
4. Deploy. The AI route needs up to 60 seconds, which fits every Vercel plan.
5. Changing a `NEXT_PUBLIC_` variable needs a new deployment, because they're built into the app.

### 3. After the first deploy

- Sign in with your own number and create your shop, or load the demo shop for your number. Run
  this from your machine with `.env.local` pointing at the **production** project:

  ```bash
  pnpm seed --remote --owner +9715XXXXXXXX
  ```

- Set today's gold rates (Gold rates tab) before sharing prices.
- Invite staff from the Team tab. They sign in with their own numbers.
- Check on a real mid-range Android phone: capture speed, the 360° recording (Android records
  MP4), WhatsApp links and the "Add to home screen" install.
- Run Lighthouse on the live site; the local build scores 91–99 on mobile.

### Updating

New migrations in `supabase/migrations` are applied with `pnpm exec supabase db push`, before
deploying the code that needs them. When you change `public/sw.js` in a way that should drop old
caches, bump its `VERSION`.

---

## Project layout

```
src/app/            pages and server actions (/, /add, /p/[id], /share, /shares, /clients,
                    /rates, /team, /login, /s/[token] public share page, /api/ai/fill)
src/components/     shared UI (spin viewer, price breakdown, header, filters, …)
src/lib/            pricing, rates, formatting, AI (server-only Claude client + checks),
                    upload queue (IndexedDB), share messages and image, Supabase clients
src/i18n/           strings in en, ar, hi, ml (Arabic, Hindi and Malayalam need native review)
supabase/           config and SQL migrations (schema, RLS, functions, storage)
scripts/            seed script and its demo illustrations
tests/db/           database and security tests
e2e/                browser tests, fixtures and the Claude stand-in
public/sw.js        service worker (offline pages, image cache)
```

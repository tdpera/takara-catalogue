# Souq Catalogue

Mobile-first catalogue tool for gold and jewellery sellers. Next.js (App Router) + Supabase.
See `DECISIONS.md` for product and technical decisions. Full setup and deploy guide arrives in step 7.

## Local development

Needs Node 20+, pnpm and Docker.

```bash
pnpm install
pnpm db:start          # local Supabase; prints the URL and anon key
cp .env.example .env.local   # fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
pnpm dev
```

Share links (step 6) need `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (`pnpm db:start` prints it as
`SERVICE_ROLE_KEY`). It's used only on the server, to sign images for the public share page.

AI fill from photo (step 4) needs `ANTHROPIC_API_KEY` in `.env.local`. Without it the app works
normally and the capture screen says AI fill isn't set up. The key is only read on the server.

Sign in at http://localhost:3000 with a test number. No message is sent; the code is always `123456`:
`050 000 0001`, `050 000 0002`, `050 000 0003`, `050 000 0004`.

## Tests

```bash
pnpm test        # unit tests
pnpm test:db     # RLS / shop isolation tests against the local Supabase (needs pnpm db:start)
pnpm db:lint     # Supabase security and schema linter
```

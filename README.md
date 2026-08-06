# Poke Tracker

A gamified task tracker: finishing tasks feeds a bond with an assigned Pokémon, which
grows and evolves when cared for and leaves when neglected.

The vocabulary this codebase uses is defined in [`CONTEXT.md`](./CONTEXT.md). Decisions
that would otherwise look like mistakes are recorded in [`docs/adr/`](./docs/adr).

## Shape

Next.js App Router on Vercel, backed by Supabase. Server components read, server actions
write — **the browser never talks to the database**. Sign-in is Google via Supabase Auth,
restricted to an allow-list checked at `/auth/callback`; an account that fails it gets no
trainer record, and therefore no data.

Isolation is enforced by row-level security keyed on the authenticated user, not by
application-side filtering.

```
src/
  app/                 routes: / (home), /settings, /pokedex, /sign-in, /auth/callback
  app/actions/         server actions — every write goes through here
  lib/auth/            the allow-list
  lib/supabase/        request-scoped clients and the error seam
  lib/trainer/         the trainer record and its provisioning
  proxy.ts             session refresh on every request (Next 16's Middleware)
supabase/migrations/   the schema, replayed from empty on every test run
tests/                 integration tests against a real local Supabase
```

## Getting set up

Requires Node and a running Docker daemon (the Supabase CLI needs it).

```bash
npm install
cp .env.example .env.local
npm run db:start          # starts local Supabase and applies the migrations
npx supabase status       # copy the anon key into .env.local
npm run dev
```

Then put your own Google address in `POKE_TRACKER_ALLOWED_EMAILS`. The allow-list **fails
closed**: unset or empty admits nobody.

### Google sign-in locally

Create OAuth credentials in the Google Cloud console with
`http://127.0.0.1:54321/auth/v1/callback` as the authorised redirect URI, and put the
client ID and secret in `.env.local` as `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and
`SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`. The Supabase CLI reads them when the stack starts,
so restart it after changing them.

## Working on it

```bash
npm run typecheck
npm test               # starts Supabase, replays every migration, runs the suite
npm run lint
npm run build
```

`npm test` resets the local database. Anything you were looking at in Supabase Studio goes
with it.

The tests run real server actions against a real Postgres built from the real migrations —
the database is never mocked. A violated constraint surfaces as a genuine failure, which is
the point: the invariants live in the database (ADR-0001), so that is where they have to be
proved.

## Issues

Issues live in [GitLab](https://gitlab.com/Infernite/poke-tracker/-/issues), driven by
`glab`. See [`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md).

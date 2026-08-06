# poke-tracker

@AGENTS.md

## Stack

Next.js 16 App Router (Middleware is called **Proxy** and lives in `src/proxy.ts`; `cookies()`
is async) on Supabase. Server components read, server actions write — the browser never talks
to the database. Schema changes are Supabase CLI migrations under `supabase/migrations/`.

`npm test` replays every migration into a local Supabase and runs the suite against it. The
database is never mocked.

Two conventions that `CONTEXT.md` does not yet cover:

- **"Account"** in this codebase means the Supabase `auth.users` identity — the thing Google
  sign-in produces. It is deliberately *not* a **Trainer**: every account that completes
  sign-in has one, including the ones the allow-list turns away, and only an admitted account
  gets a trainer record. `CONTEXT.md` lists "account" under `_Avoid_` for **Trainer**, which
  still holds — never use it as a synonym for one. Worth putting through `/domain-modeling`.
- **Writes go through server actions.** The one exception is `/auth/callback`, which must be a
  route handler because Google arrives there by GET redirect. It performs no write of its own;
  it calls the `ensureTrainer` action.

New columns get a **column-level** `grant update` or none at all, so anything a later slice
derives (happiness, the day ledger) is read-only to a trainer's own JWT by default.

## Agent skills

### Issue tracker

Issues live in this repo's GitLab Issues (`gitlab.com:Infernite/poke-tracker`), driven by the `glab` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.

# poke-tracker

@AGENTS.md

## Stack

Next.js 16 App Router (Middleware is called **Proxy** and lives in `src/proxy.ts`; `cookies()`
is async) on Supabase. Server components read, server actions write — the browser never talks
to the database. Schema changes are Supabase CLI migrations under `supabase/migrations/`.

`npm test` replays every migration into a local Supabase and runs the suite against it. The
database is never mocked.

## Agent skills

### Issue tracker

Issues live in this repo's GitLab Issues (`gitlab.com:Infernite/poke-tracker`), driven by the `glab` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles use their default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.

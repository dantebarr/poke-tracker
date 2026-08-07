-- Adopts the `tasks` table Jarvis HUD already writes to into this repo's
-- migration history, rather than creating a new one. Poke Tracker and
-- Jarvis HUD share one Supabase project (see jarvis-hud's design doc), so
-- against the real database this is idempotent adoption: the table already
-- exists with real rows, and `create table if not exists` is a no-op on the
-- table itself. Against a fresh local database (every `npm test` run) it
-- creates the table from empty, in exactly the shape Jarvis HUD wrote it in
-- — the starting point the rest of this migration sequence transforms.
--
-- The shape mirrors jarvis-hud's design doc table description exactly:
-- nullable `due_date`/`project`, and the three-way `status` this repo's
-- CONTEXT.md already says is retired. Later migrations in this sequence are
-- what turn it into the shape #7 actually wants.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  task text not null,
  due_date date,
  status text not null default 'not_started'
    constraint tasks_status_check check (status in ('not_started', 'in_progress', 'done')),
  project text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null default 'manual',
  source_ref text,
  completed_at timestamptz
);

comment on table public.tasks is
  'The unit of work. Has a title, a due date, a label, and a size. Every task belongs to exactly one trainer.';

-- This table's prior grants are untracked history, not something this
-- migration sequence controls — it was created for Jarvis HUD outside these
-- migrations. Rather than guess what it currently has, start from a known
-- baseline of nothing and let the grants this sequence adds be the whole
-- truth, matching this project's column-level-grant-or-none convention.
-- A no-op locally, where nothing has been granted yet.
revoke all on public.tasks from anon, authenticated;

alter table public.tasks enable row level security;

-- Jarvis HUD ran as a local-only tool against the anon key with no auth of
-- its own, so it opened these four policies to `anon` outright (see its
-- design doc). That access model has no place once every row belongs to a
-- specific trainer and reads go through row-level security on `auth.uid()`.
-- `if exists` because a fresh local database never had them.
drop policy if exists "anon full access select" on public.tasks;
drop policy if exists "anon full access insert" on public.tasks;
drop policy if exists "anon full access update" on public.tasks;
drop policy if exists "anon full access delete" on public.tasks;

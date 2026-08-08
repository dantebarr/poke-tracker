-- The trainer: one row per authenticated user, holding only what this slice
-- needs. Later slices add the pool, labels, tasks, and the day ledger.
--
-- Columns are added by the migration of the slice that first uses them, so
-- happiness, the last settled day, and the active instance all arrive with
-- settlement and the pool rather than sitting here unread and unenforced.
-- The trainer's time zone follows later still, in its own migration (#17) —
-- settlement shipped first and got this wrong before it existed.

create table public.trainer (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text,

  -- The bar every day is judged against. Never below one: a target of zero
  -- would make every absent day neutral, so neglect would earn Pokémon instead
  -- of costing them. Per ADR-0001 the guarantee is the constraint, not a
  -- TypeScript check at the write seam.
  daily_target integer not null default 1
    constraint trainer_daily_target_min check (daily_target >= 1),

  created_at timestamptz not null default now()
);

comment on table public.trainer is
  'A person who uses Poke Tracker. Owns their own tasks, Pokémon, and settings.';

alter table public.trainer enable row level security;

-- Row-level security narrows which rows a role may touch; it does not grant
-- access in the first place. Both are needed.
--
-- Update is granted per column rather than wholesale. Every column added from
-- here on is therefore read-only to the trainer's own JWT until a migration
-- says otherwise — which is what keeps derived quantities like happiness, which
-- only settlement may compute, out of reach of a hand-rolled request.
--
-- Delete is granted to nobody: a trainer record goes away only with its auth
-- user, through the cascade above.
grant select, insert on public.trainer to authenticated;
grant update (daily_target) on public.trainer to authenticated;
grant all on public.trainer to service_role;

-- `anon` is granted nothing. A signed-out visitor has no business here.

-- Isolation is enforced by the database rather than by application-side
-- filtering: a trainer can only ever see and touch their own row.
create policy trainer_select_own on public.trainer
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy trainer_insert_own on public.trainer
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy trainer_update_own on public.trainer
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

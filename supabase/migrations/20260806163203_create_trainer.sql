-- The trainer: one row per authenticated user, holding only what is per-trainer
-- and current. Later slices add the pool, labels, tasks, and the day ledger.
--
-- Columns that reference tables which do not exist yet (the active instance, per
-- issue #6) are deliberately absent rather than nullable-and-unconstrained; they
-- arrive with the migration that creates the table they point at.

create table public.trainer (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text,

  -- The bar every day is judged against. Never below one: a target of zero would
  -- make every absent day neutral, so neglect would earn Pokemon instead of
  -- costing them.
  daily_target integer not null default 1
    constraint trainer_daily_target_min check (daily_target >= 1),

  -- How well the active Pokemon is being cared for. Belongs to the trainer, not
  -- to any Pokemon, and is deliberately uncapped in both directions.
  happiness integer not null default 0,

  -- The last day settlement has accounted for, in the trainer's own timezone.
  -- Null until the first settlement runs.
  last_settled_day date,

  -- The trainer's last-known IANA timezone, read from their device on app entry.
  timezone text,

  created_at timestamptz not null default now()
);

comment on table public.trainer is
  'A person who uses Poke Tracker. Owns their own tasks, Pokemon, and settings.';

alter table public.trainer enable row level security;

-- Row-level security narrows what a role may touch; it does not grant access in
-- the first place. Both are needed. Delete is granted to nobody: a trainer
-- record goes away only with its auth user, through the cascade above.
grant select, insert, update on public.trainer to authenticated;
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

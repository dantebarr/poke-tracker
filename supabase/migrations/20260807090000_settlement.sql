-- Settlement (#10): the day ledger, the two trainer columns settlement needs,
-- and the one function allowed to write either.
--
-- The decision logic — what a day did, whether a Pokémon left or arrived —
-- lives in TypeScript as a pure reducer (@/lib/settlement/reducer), tested
-- directly with no database at all. This migration's function does none of
-- that math: it is handed the reducer's already-computed output for a batch
-- of days and commits it, in full, in one transaction — a single function
-- call is one transaction for free, the same reason provision_pool() is one.

-- The day after this is where the next settlement run starts; before it, no
-- day is settled. Like happiness and active_instance_id, this is derived
-- state — settlement (the function below) is the only writer, so it gets no
-- update grant of its own.
--
-- pending_arrival_delta carries a qualifying pokemon-less day's delta across
-- runs when the arrival it earns doesn't fall inside the batch that computed
-- it (the qualifying day was the last one settled) — see the reducer's
-- `pendingArrivalDelta` for the full rule. Null means nothing is pending.
alter table public.trainer
  add column last_settled_day date not null default current_date,
  add column pending_arrival_delta integer;

comment on column public.trainer.last_settled_day is
  'The most recently settled day. Settlement starts the day after this and stops before today.';
comment on column public.trainer.pending_arrival_delta is
  'A qualifying pokemon-less day''s delta, waiting to become a future day''s arrival. Null when nothing is pending.';

-- One row per settled day, and settled days are permanent: no update or
-- delete grant exists for anyone but service_role, and the unique constraint
-- below stops the settlement function from ever writing the same day twice,
-- accidentally or otherwise.
create table public.day_ledger (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer (id) on delete cascade,
  day date not null,

  points_earned integer not null,
  -- The daily target in force when this day was settled. Copied here rather
  -- than joined from trainer.daily_target at read time, because the target
  -- can change later (settings) and an already-settled day must keep the
  -- target it actually had (see trainer.ts's updateDailyTarget).
  target integer not null,
  delta integer not null,

  -- The happiness this day left the trainer with — 0 while pokemon-less,
  -- whatever the arrival started at on an arrival day, or the ordinary
  -- running total otherwise.
  happiness_after integer not null,
  -- Which instance this day concerned: the one active going into the day, or
  -- the one that arrived during it. Null on a pokemon-less day that neither
  -- received nor produced an arrival.
  active_instance_id uuid references public.instance (id),
  -- Whether the active instance's bond rose, or it left. Neither, on every
  -- other kind of day — including an arrival, which isn't itself a bond
  -- event.
  outcome text not null check (outcome in ('bond', 'left', 'none')),

  created_at timestamptz not null default now(),

  unique (trainer_id, day)
);

comment on table public.day_ledger is
  'The append-only record of what every settled day did. Immutable: only the settlement function may insert, and nothing may update or delete.';

alter table public.day_ledger enable row level security;

grant select on public.day_ledger to authenticated;
grant all on public.day_ledger to service_role;

-- `anon` is granted nothing.

create policy day_ledger_select_own on public.day_ledger
  for select
  to authenticated
  using ((select auth.uid()) = trainer_id);

-- Commits one settlement run: every ledger row the reducer produced, the bond
-- increments those rows imply, and the trainer's resulting happiness, active
-- instance, last-settled day and pending arrival — all in the one transaction
-- a single function call already is.
--
-- Deliberately NOT security definer + granted to authenticated, unlike
-- provision_pool(). provision_pool() takes no meaningful external input —
-- only auth.uid() — so nothing a caller supplies can change what it does.
-- This function is handed the reducer's already-computed ledger rows and
-- ending state, which is exactly the shape of input a function reachable by
-- a trainer's own JWT must never trust: nothing would stop that JWT from
-- calling it directly with fabricated rows and an unrelated
-- p_ending_happiness, forging bond levels with no completed task behind
-- them at all. The only safe caller is this app's own trusted server code,
-- which has already established whose settlement this is via
-- requireTrainerId() — so p_trainer_id is trusted input here specifically
-- because the grant below hands this function to service_role and nobody
-- else. See @/lib/supabase/service for the one client that reaches it.
--
-- Two things are still checked explicitly, since a bug in that trusted
-- caller could otherwise corrupt state even without a hostile one:
--
-- 1. Staleness: p_expected_last_settled_day must still match the trainer's
--    current last_settled_day, or this is a no-op. That's what makes opening
--    the app twice in one day change nothing — the second call's expectation
--    is already out of date once the first has committed.
-- 2. Cross-trainer pointers: p_ending_active_instance_id, the one value here
--    that changes what another read can reach (which instance
--    findActivePokemon resolves), must name an instance p_trainer_id
--    actually owns.
create function public.apply_settlement(
  p_trainer_id uuid,
  p_expected_last_settled_day date,
  p_rows jsonb,
  p_ending_happiness integer,
  p_ending_active_instance_id uuid,
  p_ending_last_settled_day date,
  p_ending_pending_arrival_delta integer
)
returns void
language plpgsql
set search_path = public
as $$
declare
  entry jsonb;
begin
  if not exists (
    select 1 from trainer where id = p_trainer_id and last_settled_day = p_expected_last_settled_day
  ) then
    return;
  end if;

  if p_ending_active_instance_id is not null and not exists (
    select 1 from instance where id = p_ending_active_instance_id and trainer_id = p_trainer_id
  ) then
    raise exception 'apply_settlement: ending active instance does not belong to trainer';
  end if;

  for entry in select * from jsonb_array_elements(p_rows) loop
    insert into day_ledger (
      trainer_id, day, points_earned, target, delta, happiness_after, active_instance_id, outcome
    )
    values (
      p_trainer_id,
      (entry->>'day')::date,
      (entry->>'pointsEarned')::integer,
      (entry->>'target')::integer,
      (entry->>'delta')::integer,
      (entry->>'happinessAfter')::integer,
      (entry->>'activeInstanceId')::uuid,
      entry->>'outcome'
    );

    if entry->>'outcome' = 'bond' then
      update instance
      set bond_level = bond_level + 1
      where id = (entry->>'activeInstanceId')::uuid and trainer_id = p_trainer_id;
    end if;
  end loop;

  update trainer
  set happiness = p_ending_happiness,
      active_instance_id = p_ending_active_instance_id,
      last_settled_day = p_ending_last_settled_day,
      pending_arrival_delta = p_ending_pending_arrival_delta
  where id = p_trainer_id;
end;
$$;

-- `service_role` already bypasses row-level security and holds `grant all`
-- on every table this function touches, so unlike provision_pool() this
-- needs no security-definer privilege escalation — the safety property this
-- function needs is that nobody *else* can call it, not that its caller
-- needs *more* access. Revoked from PUBLIC explicitly rather than relying on
-- the absence of a grant, since Postgres's own default is to grant execute
-- on a new function to PUBLIC.
revoke all on function public.apply_settlement(uuid, date, jsonb, integer, uuid, date, integer) from public;
grant execute on function public.apply_settlement(uuid, date, jsonb, integer, uuid, date, integer) to service_role;

-- Arrivals land the day after they are earned (#34, ADR-0007): the draw that
-- used to wait for a second settlement run now happens on the Approaching
-- day itself, so pending_arrival_delta — the column that carried it across
-- runs — has nothing left to carry.

-- Any trainer already holding a pending delta earned it under the old rule
-- and must not lose it (there is at least one in production): for each one,
-- draw an Arrival from their own pool right here, the same way
-- apply_settlement would have on their next settlement run, and start its
-- happiness at the delta they already earned. No day_ledger row is
-- backfilled for this — it corrects trainer state, not a day already
-- settled (settled days stay immutable, ADR-0001).
do $$
declare
  r record;
  v_instance_id uuid;
begin
  for r in
    select id, pending_arrival_delta
    from public.trainer
    where pending_arrival_delta is not null
  loop
    select id into v_instance_id
    from public.instance
    where trainer_id = r.id
    order by random()
    limit 1;

    update public.trainer
    set active_instance_id = v_instance_id,
        happiness = r.pending_arrival_delta
    where id = r.id;
  end loop;
end;
$$;

alter table public.trainer drop column pending_arrival_delta;

-- 'approaching': the day a pokemon-less trainer hits their daily target and
-- earns an Arrival that lands the next day. Its row names no Pokémon, since
-- none was there yet — CONTEXT.md's "Approaching" entry and ADR-0007.
alter table public.day_ledger drop constraint day_ledger_outcome_check;
alter table public.day_ledger add constraint day_ledger_outcome_check
  check (outcome in ('bond', 'left', 'approaching', 'none'));

comment on column public.day_ledger.happiness_after is
  'The happiness this day left the trainer with — 0 while pokemon-less or on an Approaching day, or the ordinary running total otherwise. An Arrival''s first settled day is an ordinary day like any other (ADR-0007), not a special case here.';

-- The old signature (with p_ending_pending_arrival_delta) is dropped rather
-- than replaced: `create or replace` only replaces a function whose
-- parameter list matches exactly, and this one is one argument shorter, so
-- leaving the old signature in place would add a second, now-dead overload
-- instead of retiring it.
drop function public.apply_settlement(uuid, date, jsonb, integer, uuid, date, integer);

-- Redefines apply_settlement (#10, #12, #34) without the pending-arrival
-- parameter, now that nothing produces one — the reducer draws and lands an
-- Arrival within the same settlement run instead of deferring it. Otherwise
-- unchanged from the version in 20260807100000_evolution_and_pokedex.sql:
-- see that migration's comment for the pokedex-unlock rule and this
-- function's own security rationale.
create function public.apply_settlement(
  p_trainer_id uuid,
  p_expected_last_settled_day date,
  p_rows jsonb,
  p_ending_happiness integer,
  p_ending_active_instance_id uuid,
  p_ending_last_settled_day date
)
returns void
language plpgsql
set search_path = public
as $$
declare
  entry jsonb;
  v_instance_id uuid;
  v_species_id integer;
  v_bond_level integer;
  v_bond_requirement integer;
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
      v_instance_id := (entry->>'activeInstanceId')::uuid;

      update instance
      set bond_level = bond_level + 1
      where id = v_instance_id and trainer_id = p_trainer_id
      returning species_id, bond_level into v_species_id, v_bond_level;

      select bond_requirement into v_bond_requirement from species where id = v_species_id;

      if v_bond_level >= v_bond_requirement then
        insert into pokedex_entry (trainer_id, species_id, unlocked_on)
        values (p_trainer_id, v_species_id, (entry->>'day')::date)
        on conflict (trainer_id, species_id) do nothing;
      end if;
    end if;
  end loop;

  update trainer
  set happiness = p_ending_happiness,
      active_instance_id = p_ending_active_instance_id,
      last_settled_day = p_ending_last_settled_day
  where id = p_trainer_id;
end;
$$;

revoke all on function public.apply_settlement(uuid, date, jsonb, integer, uuid, date) from public;
grant execute on function public.apply_settlement(uuid, date, jsonb, integer, uuid, date) to service_role;

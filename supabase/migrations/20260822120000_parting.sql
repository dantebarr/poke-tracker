-- Parting (#5): the trainer's deliberate end to their time with the Active
-- Pokémon, and the happiness rule that absorbs it (ADR-0009).
--
-- Three things change together, because they are one decision:
--   1. `trainer.parting_on` — which day the trainer chose to part on.
--   2. A `parted` outcome for the day ledger, distinct from `left`.
--   3. `apply_settlement` credits bond on `delta >= 0` rather than on
--      `outcome = 'bond'`, and consumes the parting it just settled.
--
-- The clamp itself lives in the reducer (@/lib/settlement/reducer), like
-- every other decision about what a day did — this migration only makes the
-- new outcome representable and stops the bond credit from being keyed off a
-- label that no longer implies it.

-- Which day the trainer chose to part on, not a boolean: settlement replays
-- owed days in order, so a date is what makes a trainer who sets a parting
-- and returns five days later correct by construction — the parting lands on
-- the day they actually chose, and a date matching no day in the run simply
-- never fires.
--
-- Unlike happiness, last_settled_day and the rest of settlement's derived
-- state, this one is trainer-set, so it gets a column-level update grant to
-- `authenticated` — the same treatment daily_target, time_zone and
-- intro_seen_at get, and the only column this feature grants at all.
alter table public.trainer add column parting_on date;

comment on column public.trainer.parting_on is
  'The day the trainer chose to part with their Active Pokémon, taking effect at that day''s settlement. Null means no parting is set. Cleared by apply_settlement once the day it names has been settled.';

grant update (parting_on) on public.trainer to authenticated;

-- 'parted': the trainer chose to end the pairing, and the day settled with
-- the Pokémon still theirs for all of it. Distinct from 'left' — which is
-- the Pokémon's own act, driven by neglect — because a choice is not a
-- failure and the Logbook must not colour it as one. CONTEXT.md's "Parting"
-- entry and ADR-0009.
alter table public.day_ledger drop constraint day_ledger_outcome_check;
alter table public.day_ledger add constraint day_ledger_outcome_check
  check (outcome in ('bond', 'left', 'parted', 'approaching', 'none'));

-- Both of these claimed happiness was 0 whenever no Pokémon was involved.
-- That was true only because happiness could not survive a departure before
-- Parting existed; it now carries across the pokemon-less days between one
-- Pokémon and the next (ADR-0009). The same correction is made to
-- `SettlementState`'s doc comment in the reducer.
comment on column public.day_ledger.happiness_after is
  'The happiness this day left the trainer with. Carries across a Parting and the pokemon-less days after it (ADR-0009), so it is not 0 on a pokemon-less row; a bad pokemon-less day leaves it untouched, since there was no Pokémon there to neglect.';

-- Redefines apply_settlement (#10, #12, #34, #5) with the same signature, so
-- `create or replace` is right here — unlike the arrivals migration, which
-- changed the parameter list and had to drop first. Two changes, both from
-- ADR-0009:
--
--   * Bond is credited on `delta >= 0`, not on `outcome = 'bond'`. A `parted`
--     day the trainer hit their target on still earns its level: the level is
--     earned by the work, not by what happens at the boundary afterwards. For
--     every row settled before this, the two conditions are identical, so no
--     settled day changes meaning (ADR-0001). The `activeInstanceId is not
--     null` guard is what keeps an Approaching day — delta >= 0, but nobody
--     there to credit — out of it.
--   * The parting this run consumed is cleared, in the same transaction that
--     commits the run. Guarded on the day it names having actually been
--     settled: a parting set for *today* must survive a run that settles up
--     to yesterday, which is exactly the run that happens on the same day the
--     trainer sets it.
--
-- Otherwise unchanged from 20260811120000_arrivals_land_the_day_after.sql;
-- see that migration and 20260807090000_settlement.sql for the pokedex-unlock
-- rule and this function's security rationale.
create or replace function public.apply_settlement(
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

    if (entry->>'delta')::integer >= 0 and entry->>'activeInstanceId' is not null then
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
      last_settled_day = p_ending_last_settled_day,
      parting_on = case when parting_on <= p_ending_last_settled_day then null else parting_on end
  where id = p_trainer_id;
end;
$$;

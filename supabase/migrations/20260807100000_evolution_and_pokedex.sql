-- Evolution and Pokédex unlocks (#12): the trainer's choice to evolve an
-- instance into its next species, and the append-only record of which
-- species' bond requirement an instance has actually met while being that
-- species. See CONTEXT.md's "Evolving" and "Pokédex entry" entries for the
-- rule this schema exists to enforce: bond alone isn't enough, and neither
-- is being the species — only meeting both, at the same time, unlocks an
-- entry, which is why entries are stored with their unlock date rather than
-- derived.

-- One row per trainer per species ever unlocked. Permanent, like day_ledger:
-- no update or delete grant for anyone but service_role, and the primary key
-- stops the same species being recorded twice for the same trainer.
create table public.pokedex_entry (
  trainer_id uuid not null references public.trainer (id) on delete cascade,
  species_id integer not null references public.species (id),

  -- The day the entry was earned: the settled day whose bond increment
  -- carried an instance across a requirement it already was the species
  -- for, or the day of the evolve action when evolving directly into a
  -- species whose requirement banked bond had already met. Stored rather
  -- than derived — see CONTEXT.md's "Pokédex entry" for why bond and species
  -- alone can't answer "when" on their own.
  unlocked_on date not null,

  created_at timestamptz not null default now(),

  primary key (trainer_id, species_id)
);

comment on table public.pokedex_entry is
  'A species'' entry, unlocked at the moment an instance is that species and has met its bond requirement — never before. Permanent once earned.';

alter table public.pokedex_entry enable row level security;

-- No insert grant for authenticated at all: apply_settlement() and
-- evolve_instance() below are the only writers, the same shutout
-- instance.species_id and instance.bond_level already get.
grant select on public.pokedex_entry to authenticated;
grant all on public.pokedex_entry to service_role;

-- `anon` is granted nothing.

create policy pokedex_entry_select_own on public.pokedex_entry
  for select
  to authenticated
  using ((select auth.uid()) = trainer_id);

-- Redefines apply_settlement (#10) to also unlock a Pokédex entry the moment
-- a bond increment carries an instance's bond level across its *current*
-- species' requirement — the settlement-triggered half of the unlock rule.
-- Evolving directly into a species whose requirement banked bond already
-- meets is the other half, handled by evolve_instance() below; between the
-- two, every way bond level and species can combine to unlock an entry is
-- covered.
--
-- `on conflict do nothing` makes this safe to evaluate on every bond
-- increment rather than only the one that first crosses the requirement:
-- once earned, an entry never needs unlocking again.
create or replace function public.apply_settlement(
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
      last_settled_day = p_ending_last_settled_day,
      pending_arrival_delta = p_ending_pending_arrival_delta
  where id = p_trainer_id;
end;
$$;

revoke all on function public.apply_settlement(uuid, date, jsonb, integer, uuid, date, integer) from public;
grant execute on function public.apply_settlement(uuid, date, jsonb, integer, uuid, date, integer) to service_role;

-- Evolving: trades an instance's current species for a validated next one,
-- and unlocks the target's Pokédex entry immediately when banked bond
-- already meets its requirement — the "two evolutions in succession" case
-- CONTEXT.md's "Evolving" entry describes. Every rule the acceptance
-- criteria list is enforced here, not only in the UI that hides the
-- options: a hostile JWT calling this directly with a fabricated
-- p_target_species_id gets exactly the same refusals a trainer using the
-- picker would never trigger.
--
-- Security definer, like provision_pool(), and safe for the same reason:
-- p_instance_id, p_expected_species_id and p_target_species_id are all
-- external input, but nothing here trusts them at face value — every one is
-- revalidated against the database's own state before anything is written,
-- and the caller's identity comes from auth.uid(), never from an argument.
-- That is what makes granting this to authenticated safe in a way
-- apply_settlement's precomputed-input shape is not (see that function's
-- comment, and @/lib/supabase/service, for the contrast).
create function public.evolve_instance(
  p_instance_id uuid,
  p_expected_species_id integer,
  p_target_species_id integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := (select auth.uid());
  v_bond_level integer;
  v_species_id integer;
  v_current_requirement integer;
  v_target_evolves_from integer;
  v_target_requirement integer;
begin
  if caller is null then
    raise exception 'evolve_instance: no authenticated user';
  end if;

  select bond_level, species_id into v_bond_level, v_species_id
  from instance
  where id = p_instance_id and trainer_id = caller
  for update;

  if not found then
    raise exception 'evolve_instance: no such instance';
  end if;

  -- Stale: the instance already moved on since the caller last read it — an
  -- earlier click of this same evolution winning a race, most likely. This
  -- is exactly the double-click case the acceptance criteria call out:
  -- refused as a no-op, not an error, since the first click already did
  -- everything there was to do.
  --
  -- `is distinct from`, not `<>`: a null p_expected_species_id must refuse
  -- too, not vanish into `<>`'s three-valued NULL and skip the check
  -- entirely — the one shape of input that would otherwise defeat this
  -- guard rather than merely fail to trigger it.
  if v_species_id is distinct from p_expected_species_id then
    return;
  end if;

  select bond_requirement into v_current_requirement from species where id = v_species_id;
  if v_bond_level < v_current_requirement then
    raise exception 'evolve_instance: bond requirement not met';
  end if;

  select evolves_from_id, bond_requirement into v_target_evolves_from, v_target_requirement
  from species
  where id = p_target_species_id;

  if not found or v_target_evolves_from is distinct from v_species_id then
    raise exception 'evolve_instance: target is not a child of the current species';
  end if;

  -- Closes a check-then-act race the EXISTS check below can't close on its
  -- own: two different source instances for the same trainer, evolving into
  -- the same target species at once, would each see "not yet owned" under
  -- READ COMMITTED, since neither's write is visible to the other until it
  -- commits. Serialising on (trainer, target species) — held for the rest of
  -- this transaction — makes the second call's EXISTS check run only after
  -- the first has committed or rolled back, so it sees the real outcome
  -- rather than a stale snapshot.
  perform pg_advisory_xact_lock(hashtext(caller::text), p_target_species_id);

  if exists (
    select 1 from instance where trainer_id = caller and species_id = p_target_species_id
  ) then
    raise exception 'evolve_instance: already own an instance of that species';
  end if;

  if exists (
    select 1 from pokedex_entry where trainer_id = caller and species_id = p_target_species_id
  ) then
    raise exception 'evolve_instance: already in the pokedex';
  end if;

  update instance set species_id = p_target_species_id where id = p_instance_id;

  if v_bond_level >= v_target_requirement then
    insert into pokedex_entry (trainer_id, species_id, unlocked_on)
    values (caller, p_target_species_id, current_date)
    on conflict (trainer_id, species_id) do nothing;
  end if;
end;
$$;

-- Ownership stays with the migration role, not authenticated — the same
-- privilege-escalation boundary provision_pool()'s grant relies on.
grant execute on function public.evolve_instance(uuid, integer, integer) to authenticated;

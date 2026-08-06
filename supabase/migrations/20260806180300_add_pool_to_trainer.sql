-- The two columns the pool adds to trainer: which instance, if any, is
-- currently active, and the happiness that instance's care is measured by.
-- Both are derived — by provision_pool() below, and from the settlement
-- slice on, by settlement itself — never set directly by a trainer's own
-- JWT, so neither gets an update grant. See the trainer migration's comment
-- on this project's column-level-grant-or-none default for derived state.
alter table public.trainer
  add column active_instance_id uuid references public.instance (id),
  add column happiness integer not null default 0;

comment on column public.trainer.active_instance_id is
  'The instance currently with this trainer, or null when they have none.';
comment on column public.trainer.happiness is
  'How well the active Pokémon is being cared for. Belongs to the trainer, not the instance, and resets to zero whenever one leaves.';

-- Creates a trainer's whole 81-instance pool and activates its first slot, in
-- one transaction. Security definer because both writes it performs — the
-- insert into instance and the update of trainer.active_instance_id and
-- happiness — have no grant for authenticated; this function is the one door
-- into either, and it authorises itself against auth.uid() rather than
-- trusting a caller-supplied trainer id.
--
-- Idempotent the same way provisionTrainer is: a second call for a trainer
-- who already has instances is a no-op rather than an error, so it is safe
-- to call on every sign-in, not only the first.
create function public.provision_pool()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'provision_pool: no authenticated user';
  end if;

  if exists (select 1 from instance where trainer_id = caller) then
    return;
  end if;

  insert into instance (trainer_id, pool_slot, species_id)
  select caller, slot, species_id from pool_template;

  update trainer
  set active_instance_id = (
        select id from instance where trainer_id = caller and pool_slot = 0
      ),
      happiness = 0
  where id = caller;
end;
$$;

-- Ownership stays with the migration role, not authenticated — that is what
-- keeps "security definer" a privilege escalation limited to exactly what
-- this function's body does, rather than a general one.
grant execute on function public.provision_pool() to authenticated;

-- One specific Pokémon belonging to one trainer: its current species, bond
-- level, and nickname. A trainer's full 81-instance pool is created in one
-- transaction at signup, stamped from pool_template — see provision_pool()
-- in the migration that follows, the only thing permitted to insert here.
--
-- pool_slot pins each instance to its pool_template origin. Together with the
-- unique constraint below, it is what makes "exactly 81, never more, never
-- fewer" an invariant the database enforces rather than a rule the app
-- remembers: authenticated has no insert or delete grant on this table at
-- all, so nothing short of provision_pool() can create a row, and that
-- function is idempotent — a second call for a trainer who already has a
-- pool does nothing.
create table public.instance (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer (id) on delete cascade,
  pool_slot integer not null check (pool_slot between 0 and 80),
  species_id integer not null references public.species (id),

  -- Never falls, including when the Pokémon leaves. Belongs to the instance,
  -- is its permanent record, and — like happiness on trainer — is read-only
  -- to a trainer's own JWT: only settlement (a later slice) raises it.
  bond_level integer not null default 0 check (bond_level >= 0),

  -- The one thing about an instance its trainer may freely set.
  nickname text,

  created_at timestamptz not null default now(),

  unique (trainer_id, pool_slot)
);

comment on table public.instance is
  'One specific Pokémon belonging to one trainer: its current species, bond level, and nickname.';

alter table public.instance enable row level security;

-- No insert or delete grant for authenticated, at any column: the pool's
-- size and composition are set once, by provision_pool() (security definer,
-- next migration), never by anything running as the trainer's own JWT.
grant select on public.instance to authenticated;
grant update (nickname) on public.instance to authenticated;
grant all on public.instance to service_role;

-- `anon` is granted nothing.

create policy instance_select_own on public.instance
  for select
  to authenticated
  using ((select auth.uid()) = trainer_id);

create policy instance_update_own on public.instance
  for update
  to authenticated
  using ((select auth.uid()) = trainer_id)
  with check ((select auth.uid()) = trainer_id);

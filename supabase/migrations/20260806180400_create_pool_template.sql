-- The fixed 81-slot template every trainer's pool is stamped from at signup:
-- one row per pool instance a signup will ever create, in a fixed slot order
-- (slot 0 is the instance made active at signup). species_id is the starting
-- (root) species for that slot; Eevee's three branches are the only slots
-- that repeat a species_id. See docs/adr/0003-fixed-pool-of-instances.md for
-- why the count is 81, not the commonly-cited 80.
--
-- Populated once by the seed migration that follows, itself produced by the
-- committed generator script (scripts/generate-pool-template.mts). That
-- script makes no PokéAPI call and adds no new information — it is a
-- mechanical count over the already-seeded species table's evolves_from_id
-- column, generated the same way species itself was for the same reason:
-- reviewable, regenerable, never hand-edited.
create table public.pool_template (
  slot integer primary key,
  species_id integer not null references public.species (id)
);

comment on table public.pool_template is
  'The fixed 81-slot template a trainer''s pool is created from at signup. Static and never changes.';

alter table public.pool_template enable row level security;

-- Reference data, not trainer-owned. provision_pool() (see the instance and
-- trainer-pool-columns migrations) reads this as the function owner, which
-- bypasses grants entirely, so authenticated does not strictly need select
-- here — granted anyway, on the same reasoning species is: it is public
-- reference data, not a secret.
grant select on public.pool_template to authenticated;
grant all on public.pool_template to service_role;

-- `anon` is granted nothing.

create policy pool_template_select_all on public.pool_template
  for select
  to authenticated
  using (true);

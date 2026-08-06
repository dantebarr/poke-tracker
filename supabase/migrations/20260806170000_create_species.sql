-- Static reference data for the original 151: name, sprite, the species it
-- evolves from, and a precomputed cumulative bond requirement. Identical for
-- every trainer and never changes — the running app never calls PokéAPI, and
-- this table is populated once by the seed migration that follows, itself
-- produced by the committed generator script.
--
-- The primary key is the national Pokédex number rather than a surrogate id:
-- it is the natural, stable identifier PokéAPI itself keys evolution chains
-- and sprites by, and the domain has no separate notion of species identity.
--
-- Children of a species are found by querying which species evolve from it
-- (`where evolves_from_id = <id>`), so branching lines — Eevee's three — need
-- no join table.
create table public.species (
  id integer primary key,
  name text not null,
  sprite_path text not null,
  evolves_from_id integer references public.species (id),

  -- Cumulative along a line: each step adds the levels that step takes in the
  -- games divided by four, clamped between 2 and 7; steps that aren't
  -- level-based and final forms contribute the default 7. See CONTEXT.md's
  -- "Bond requirement" entry for the worked Charmander/Charmeleon/Charizard
  -- example the generator script's tests check against.
  bond_requirement integer not null
);

comment on table public.species is
  'One of the original 151, and the shared facts about it: name, sprite, evolutions, and the bond level those evolutions require. Identical for every trainer and never changes.';

alter table public.species enable row level security;

-- Reference data, not trainer-owned: every signed-in trainer reads the same
-- rows, so there is no per-row ownership policy the way `trainer` has one.
-- Nobody gets insert/update/delete through the API — the table is populated
-- only by migrations, run as the migration role, never as `authenticated`.
grant select on public.species to authenticated;
grant all on public.species to service_role;

-- `anon` is granted nothing. A signed-out visitor has no business here.

create policy species_select_all on public.species
  for select
  to authenticated
  using (true);

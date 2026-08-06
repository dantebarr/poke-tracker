-- Labels and the daily target's real default.
--
-- A trainer defines their own labels rather than using someone else's
-- vocabulary: a name, a colour stored as a value, and an ordering. Renaming a
-- label carries every task with it because tasks will reference the label's
-- id, not its text (#7) — no data migration is needed for a rename.

-- The walking skeleton (#3) landed `daily_target default 1` as a placeholder.
-- The real default, decided here, is 3 — one Medium task, or three Smalls.
alter table public.trainer alter column daily_target set default 3;

create table public.label (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer (id) on delete cascade,
  name text not null,
  -- A value, not a style class name: per-trainer labels can't share a fixed
  -- set of Tailwind classes the way a single hardcoded label set could.
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  -- A sort key, not a rank: reordering swaps two rows' positions rather than
  -- renumbering the whole list, so it is deliberately not unique.
  position integer not null,

  created_at timestamptz not null default now()
);

comment on table public.label is
  'Which area of life a task belongs to. Defined per trainer, not for the app.';

-- Case-insensitive: "Personal" and "personal" are the same label to a trainer
-- picking from a dropdown.
create unique index label_trainer_name_unique on public.label (trainer_id, lower(name));

alter table public.label enable row level security;

-- Unlike `trainer`, a label is fully owned by the trainer who made it: create,
-- rename, recolour, reorder and delete are all theirs to do. Delete is
-- granted here, but nothing yet references a label to refuse it — that guard
-- arrives as the default (restrictive) behaviour of the `task.label_id`
-- foreign key in #7, not as anything written in this migration.
grant select, insert, delete on public.label to authenticated;
grant update (name, color, position) on public.label to authenticated;
grant all on public.label to service_role;

create policy label_select_own on public.label
  for select
  to authenticated
  using ((select auth.uid()) = trainer_id);

create policy label_insert_own on public.label
  for insert
  to authenticated
  with check ((select auth.uid()) = trainer_id);

create policy label_update_own on public.label
  for update
  to authenticated
  using ((select auth.uid()) = trainer_id)
  with check ((select auth.uid()) = trainer_id);

create policy label_delete_own on public.label
  for delete
  to authenticated
  using ((select auth.uid()) = trainer_id);

-- A trainer signing up gets the four seed labels, inherited from the
-- Jarvis HUD data this app took over (Personal/Babylon/EA/Atlas). Seeding
-- happens as a trigger, in the same transaction as the trainer row, rather
-- than as a second application-side write — so it is atomic with signup and
-- cannot run twice for one trainer no matter how sign-in races.
create function public.seed_default_labels()
returns trigger
language plpgsql
as $$
begin
  insert into public.label (trainer_id, name, color, position) values
    (new.id, 'Personal', '#3B82F6', 0),
    (new.id, 'Babylon', '#F59E0B', 1),
    (new.id, 'EA', '#10B981', 2),
    (new.id, 'Atlas', '#8B5CF6', 3);
  return new;
end;
$$;

create trigger trainer_seed_default_labels
  after insert on public.trainer
  for each row
  execute function public.seed_default_labels();

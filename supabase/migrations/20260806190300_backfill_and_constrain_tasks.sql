-- The backfill, and the constraints it clears the way for. Order matters:
-- every update below runs before the column it touches is made NOT NULL, and
-- the status collapse runs after dropping the old check constraint so it is
-- legal to write 'open' at all.
--
-- Against the real database this rewrites Jarvis HUD's existing rows (a
-- snapshot of which the previous migration already took). Against a fresh
-- local database `tasks` is empty at this point, so every update below
-- affects zero rows — the NOT NULL constraints land trivially rather than
-- exercising the backfill logic itself. That logic is validated by careful
-- review before this migration is ever pushed to the real project, not by
-- the automated suite: there is no legacy-shaped data to replay it against
-- once the schema it targets no longer exists to create it in.

-- Owner. Jarvis HUD ran as a single local user, so every pre-existing row
-- belongs to whichever trainer signed up first — the only trainer, in
-- practice, at the moment this migration is ever applied for real.
update public.tasks
set trainer_id = (select id from public.trainer order by created_at asc limit 1)
where trainer_id is null;

-- Every pre-existing row gets the cheapest size rather than a guess at a
-- cost Jarvis HUD never tracked.
update public.tasks
set size = 'small'
where size is null;

-- Label, matched by name against the four seeded labels a Jarvis-inherited
-- trainer already has (Personal/Babylon/EA/Atlas) — the same vocabulary
-- Jarvis HUD's freeform `project` values used, case-insensitively.
update public.tasks t
set label_id = l.id
from public.label l
where t.label_id is null
  and t.project is not null
  and l.trainer_id = t.trainer_id
  and lower(l.name) = lower(t.project);

-- Anything left unmatched — no project text, or text that doesn't name one
-- of the trainer's labels — falls back to their first label. This is where
-- the old "Unlabelled" chip's cases land now: a backfill default rather
-- than a fallback the read model has to represent.
update public.tasks t
set label_id = (
  select l.id from public.label l where l.trainer_id = t.trainer_id order by l.position limit 1
)
where t.label_id is null;

-- Defensive: every row the HUD itself ever wrote has a due date (its
-- `NewTask` type required one), so this is expected to affect nothing
-- real. It exists so the NOT NULL constraint below is a guarantee about
-- every possible row, not just the ones observed so far.
update public.tasks
set due_date = current_date
where due_date is null;

-- Defensive, for the same reason: a done row should already carry the
-- `completed_at` the HUD set when it was ticked. Falling back to
-- `updated_at` keeps a stray null from breaking done-by-day grouping
-- instead of silently dropping the task from history.
update public.tasks
set completed_at = coalesce(completed_at, updated_at, created_at)
where status = 'done' and completed_at is null;

-- The former third status. Dropped and re-added rather than altered in
-- place — Postgres has no "replace the allowed values" statement — so that
-- the collapse below is legal to write. `if exists` for the same reason the
-- adopt migration's own drops are guarded: against the real database, the
-- adopt migration's `create table if not exists` never ran, so this
-- constraint's name is Jarvis HUD's own naming, not a guarantee this one.
alter table public.tasks drop constraint if exists tasks_status_check;

update public.tasks
set status = 'open'
where status in ('not_started', 'in_progress');

alter table public.tasks
  add constraint tasks_status_check check (status in ('open', 'done')),
  alter column status set default 'open';

comment on column public.tasks.status is
  'Open or done. Done is terminal (ADR-0002) — there is no third state (CONTEXT.md).';

-- The invariant, in the database rather than at a TypeScript write seam
-- (ADR-0001): every task has an owner, a due date, a label and a size.
alter table public.tasks
  alter column trainer_id set not null,
  alter column label_id set not null,
  alter column size set not null,
  alter column due_date set not null;

alter table public.tasks
  add constraint tasks_size_check check (size in ('small', 'medium', 'large'));

-- The freeform text label_id replaces. Superseded, not merely renamed —
-- unlike a label rename, which never touches a task (labels are referenced
-- by id), this column's data has already been consumed by the backfill
-- above and has no further reason to exist.
alter table public.tasks drop column project;

comment on column public.tasks.source is
  'Which system wrote this task — retained as history from Jarvis HUD, never shown in the interface.';
comment on column public.tasks.source_ref is
  'That system''s own reference for the row, if any — retained as history, never shown in the interface.';

-- Read-only: #7 ships no task creation, editing or completion action, so
-- authenticated gets exactly the access the interface it ships needs and no
-- more. A later slice grants whatever narrower write access completing a
-- task needs, the same way instance.nickname's grant arrived with the slice
-- that needed it rather than up front.
grant select on public.tasks to authenticated;
grant all on public.tasks to service_role;

-- `anon` is granted nothing.

create policy tasks_select_own on public.tasks
  for select
  to authenticated
  using ((select auth.uid()) = trainer_id);

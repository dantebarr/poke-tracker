-- The Recurrence (#13): a rule owned by a trainer that generates tasks on a
-- schedule. Deliberately not a Task — it is never due, never completed, and
-- worth nothing on its own (CONTEXT.md). Generation is driven by dates and
-- runs only at rule creation and in settlement, never on completion
-- (ADR-0010).
--
-- The date arithmetic itself lives in TypeScript
-- (@/lib/recurrence/dates), not here: month-end clamping, leap years and
-- weekday anchoring are the part most likely to be wrong, and a bug in them
-- should heal with a deploy rather than a migration. What this migration owns
-- is the shape a rule may have at all.

create table public.recurrence (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.trainer (id) on delete cascade,

  frequency text not null
    constraint recurrence_frequency_check check (frequency in ('daily', 'weekly', 'monthly')),

  -- 0 (Sunday) to 6 (Saturday), matching Postgres's `extract(dow)` and
  -- JavaScript's `getUTCDay` so the two halves of the feature cannot disagree
  -- about which day 3 is.
  day_of_week smallint
    constraint recurrence_day_of_week_range check (day_of_week between 0 and 6),

  -- A preference, not a guarantee: the 31st resolves to the last day of any
  -- shorter month. 31 is therefore legal here, and February is the resolver's
  -- problem rather than the constraint's.
  day_of_month smallint
    constraint recurrence_day_of_month_range check (day_of_month between 1 and 31),

  -- The two fields are check-constrained against the frequency in both
  -- directions: a weekly rule must carry a day of week and must not carry a
  -- day of month, and the reverse for monthly. A daily rule carries neither.
  -- Per ADR-0001 this is the guarantee, not a TypeScript check at the write
  -- seam — generation is triggered by a client effect that swallows every
  -- error, so a malformed rule must be unrepresentable rather than merely
  -- unlikely.
  constraint recurrence_day_of_week_matches_frequency check (
    (frequency = 'weekly') = (day_of_week is not null)
  ),
  constraint recurrence_day_of_month_matches_frequency check (
    (frequency = 'monthly') = (day_of_month is not null)
  ),

  -- The date the rule is anchored to. Not itself a due date unless it
  -- independently satisfies the rule.
  starts_on date not null,

  -- The watermark: the last date generation has considered, which is not the
  -- same as the last date it wrote. It, and not the presence of an open task,
  -- is what makes generation idempotent and what makes completing tomorrow's
  -- task early produce nothing new. Seeded by the trigger below.
  generated_through date not null,

  -- Stamped onto every task the rule generates. Same names and same
  -- constraints as `tasks` — `task` is the title, inherited from Jarvis HUD's
  -- column name.
  task text not null,
  -- Default NO ACTION on delete, exactly as `tasks.label_id` takes: the
  -- existing refusal to delete an in-use label extends to recurrences for
  -- free, so a rule can never be left pointing at a label that is gone.
  label_id uuid not null references public.label (id),
  size text not null
    constraint recurrence_size_check check (size in ('small', 'medium', 'large')),
  notes text,

  created_at timestamptz not null default now()
);

comment on table public.recurrence is
  'A rule owned by a trainer that generates tasks on a schedule. Not a Task (CONTEXT.md) — it is never due and never completed.';
comment on column public.recurrence.starts_on is
  'The date the rule is anchored to. A due date only when it independently satisfies the rule.';
comment on column public.recurrence.generated_through is
  'Watermark: the last date generation has considered. Authoritative — not the presence of an open task.';

-- Overwrites whatever was supplied rather than defaulting it, for the same
-- reason `seed_trainer_last_settled_day` does: `insert` on this table is
-- granted table-wide to `authenticated` (column-level grants constrain only
-- `update`), so a hand-rolled insert could otherwise seed a far-future
-- watermark and disable generation for that rule permanently. The day before
-- the start date, so the start date itself is still a date generation will
-- consider.
create function public.seed_recurrence_generated_through()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  NEW.generated_through := NEW.starts_on - 1;
  return NEW;
end;
$$;

create trigger recurrence_seed_generated_through
  before insert on public.recurrence
  for each row
  execute function public.seed_recurrence_generated_through();

alter table public.recurrence enable row level security;

-- Select, insert and delete to the trainer, and **no update grant at all**.
-- There is no edit surface in this slice, so per this project's
-- column-level-grant-or-none default a rule is immutable to a trainer's own
-- JWT: it is changed by deleting it and creating another. `generated_through`
-- in particular is generation's own derived state and must stay out of reach
-- of a hand-rolled request, the same way happiness and the day ledger do.
--
-- Generation therefore advances the watermark through the service-role client
-- (@/lib/supabase/service), which is already how the one other write that
-- computes state rather than recording a trainer's choice reaches the
-- database.
grant select, insert, delete on public.recurrence to authenticated;
grant all on public.recurrence to service_role;

-- `anon` is granted nothing.

create policy recurrence_select_own on public.recurrence
  for select
  to authenticated
  using ((select auth.uid()) = trainer_id);

-- `label_id` must name one of the caller's own labels, for exactly the reason
-- `tasks_insert_own` requires it: without the check, a direct write could
-- point a rule at another trainer's label, and every task it went on to
-- generate would read back `label: null` under the label table's own
-- row-level security — crashing `LabelChip`'s render rather than merely
-- hiding data.
create policy recurrence_insert_own on public.recurrence
  for insert
  to authenticated
  with check (
    (select auth.uid()) = trainer_id
    and exists (
      select 1 from public.label
      where label.id = label_id
        and label.trainer_id = (select auth.uid())
    )
  );

-- No update policy, to go with the absent update grant.

create policy recurrence_delete_own on public.recurrence
  for delete
  to authenticated
  using ((select auth.uid()) = trainer_id);

-- The link from a task back to the rule that generated it. Nullable — most
-- tasks are typed by hand — and `on delete set null`, so deleting a rule
-- leaves its tasks intact and independent rather than taking them with it.
-- That is what lets a trainer's completed recurring work survive the rule
-- being deleted, which ADR-0002 requires anyway.
--
-- No column-level update grant, so the reference is read-only to a trainer's
-- own JWT: a task cannot be moved between rules, or claimed by one, from the
-- browser.
alter table public.tasks
  add column recurrence_id uuid references public.recurrence (id) on delete set null;

comment on column public.tasks.recurrence_id is
  'The recurrence that generated this task, if any. Null for a task the trainer typed, and null again once the rule is deleted.';

-- What makes generation idempotent, and the safety net for retries,
-- concurrent app entries and any future change to how often generation runs:
-- one task per rule per due date. Partial, so the nulls that every
-- hand-typed task carries are outside it entirely rather than relying on
-- Postgres treating them as distinct.
create unique index tasks_recurrence_due_date_unique
  on public.tasks (recurrence_id, due_date)
  where recurrence_id is not null;

-- Recreated, not replaced: Postgres has no "add a clause to a policy"
-- statement. The only change is the final `and` — a task a trainer inserts
-- may name one of their own rules or none, never another trainer's. Every
-- other clause, and the reasoning behind it, is unchanged from
-- `20260806200000_task_writes.sql`.
drop policy tasks_insert_own on public.tasks;

create policy tasks_insert_own on public.tasks
  for insert
  to authenticated
  with check (
    (select auth.uid()) = trainer_id
    and status = 'open'
    and completed_at is null
    and completed_instance_id is null
    and exists (
      select 1 from public.label
      where label.id = label_id
        and label.trainer_id = (select auth.uid())
    )
    and (
      recurrence_id is null
      or exists (
        select 1 from public.recurrence
        where recurrence.id = recurrence_id
          and recurrence.trainer_id = (select auth.uid())
      )
    )
  );

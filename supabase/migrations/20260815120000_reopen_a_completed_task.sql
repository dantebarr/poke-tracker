-- Reopening a task completed today (#36). Done is no longer terminal: a task
-- may go back to Open, which is an update to a row whose status is already
-- 'done' — precisely what `tasks_update_own_open` was written to refuse.
--
-- ADR-0002 is amended rather than superseded, and the part of it that survives
-- is the delete rule: `tasks_delete_own_open` is deliberately left alone, so a
-- done task still cannot be deleted in one step.
--
-- No new grants: status, completed_at and completed_instance_id are already in
-- the column-level update grant that 20260806200000 issued.

drop policy tasks_update_own_open on public.tasks;

-- `using` now scopes an update to the caller's own tasks and nothing more. The
-- status half it used to carry existed solely to put a done row out of reach of
-- every write; reopening *is* that write, so the restriction goes rather than
-- growing an exception for one transition.
--
-- `with check` is carried over unchanged: retargeting `label_id` at another
-- trainer's label, and stamping `completed_instance_id` with an instance that
-- isn't the caller's own, both stay refused.
--
-- Widening `using` also makes a done task's ordinary fields writable by a
-- direct write. Accepted deliberately: an unsettled day is live and derived, so
-- correcting a task completed today is exactly as legitimate as reopening it,
-- and a settled day's ledger row is a snapshot that is never recomputed
-- (ADR-0007), so no write to a task can reach a day already recorded. What that
-- leaves reachable is re-crediting: a task completed on a settled day can be
-- reopened and completed again, scoring its points a second time while the old
-- day's row keeps its own. Self-inflicted, capped at three points, and reachable
-- only from outside the interface, which offers no path to an older completion.
--
-- "Only today's completions" is nowhere in here on purpose. It is an interface
-- affordance — the field log shows no older completion to reopen — not a rule
-- of the domain or the database; see `completedToday` in `@/lib/task/dates`.
create policy tasks_update_own on public.tasks
  for update
  to authenticated
  using ((select auth.uid()) = trainer_id)
  with check (
    (select auth.uid()) = trainer_id
    and exists (
      select 1 from public.label
      where label.id = label_id
        and label.trainer_id = (select auth.uid())
    )
    and (
      completed_instance_id is null
      or exists (
        select 1 from public.instance
        where instance.id = completed_instance_id
          and instance.trainer_id = (select auth.uid())
      )
    )
  );

-- The live column comment still asserts terminality. It is replaced here rather
-- than by editing 20260806190300, which wrote it: that file is a dated record of
-- its own moment, and an in-place edit would pass locally (the suite replays
-- every migration from empty) while the deployed database kept the stale text.
comment on column public.tasks.status is
  'Open or done — there is no third state (CONTEXT.md). Done is not terminal: a task can be reopened (#36). A done task still cannot be deleted (ADR-0002).';

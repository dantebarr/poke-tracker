-- Task writes: create, edit (while open), delete (while open), and complete.
-- #7 shipped `tasks` read-only; this is the write side #8 asks for.
--
-- Grants follow the same shape as `label`'s (create/delete are all-or-nothing,
-- update is column-restricted) rather than the narrower
-- column-level-grant-or-none convention CLAUDE.md describes for *derived*
-- columns (happiness, the day ledger) — `tasks` has none of those yet.
grant insert, delete on public.tasks to authenticated;
grant update (task, due_date, label_id, size, notes, status, completed_at, completed_instance_id)
  on public.tasks to authenticated;

-- Every task is complete by construction (title, due date, label, size are
-- already NOT NULL) and created open — a trainer's own JWT cannot insert a
-- task that is already done, so completion always goes through the update
-- policy below and always stamps `completed_at`.
--
-- `label_id` must name one of the caller's own labels, the same way
-- `tasks_update_own_open` below requires `completed_instance_id` to name one
-- of the caller's own instances — without it, a direct write (not only the
-- app's own create action) could point a task at another trainer's label,
-- and `listTasks`' embedded `label:label_id(...)` join would then read back
-- `label: null` for that row under the label table's own row-level
-- security, crashing `LabelChip`'s render rather than merely hiding data.
-- `completed_instance_id` is required null here for the same reason it's
-- ownership-checked on update: nothing about a freshly created, open task
-- should ever name an instance at all.
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
  );

-- `using` scopes which existing rows an update may reach: the caller's own,
-- and only while still open. Done is terminal (ADR-0002) — once a row's
-- status flips, no update can reach it again, in the database rather than
-- only in the app, so this one policy covers editing and completing alike.
--
-- `with check` additionally refuses retargeting `label_id` at another
-- trainer's label, and refuses stamping `completed_instance_id` with an
-- instance that isn't the caller's own — the edit and completion actions
-- never do either, but nothing stops a direct write from doing both.
create policy tasks_update_own_open on public.tasks
  for update
  to authenticated
  using ((select auth.uid()) = trainer_id and status = 'open')
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

-- Same terminality for delete: an open task can be removed (behind the UI's
-- confirmation step); a done one cannot, matching ADR-0002.
create policy tasks_delete_own_open on public.tasks
  for delete
  to authenticated
  using ((select auth.uid()) = trainer_id and status = 'open');

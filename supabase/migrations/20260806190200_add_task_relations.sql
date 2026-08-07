-- The columns #7 adds to `tasks`, nullable for now so the backfill in the
-- next migration has somewhere to write before anything requires them.
alter table public.tasks
  add column trainer_id uuid references public.trainer (id) on delete cascade,
  add column label_id uuid references public.label (id),
  add column size text,
  -- The instance active when the task was completed. Nullable forever, not
  -- just during backfill: an open task has no completion to record one for.
  -- #7's acceptance criteria asks for this column explicitly even though
  -- nothing reads it yet — a future settlement slice will.
  add column completed_instance_id uuid references public.instance (id);

comment on column public.tasks.label_id is
  'Which area of life this task belongs to. A foreign key, not the freeform text it replaces.';
comment on column public.tasks.size is
  'A task''s cost, one of Small / Medium / Large — the only thing that determines its effort points.';
comment on column public.tasks.completed_instance_id is
  'The instance active at completion, if this task is done. History, kept for a future slice — not read yet.';

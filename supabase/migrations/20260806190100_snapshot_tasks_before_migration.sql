-- A raw copy of `tasks` exactly as adopted, taken before the backfill and
-- constraint changes that follow. Recovery if the backfill in the next
-- migration turns out to be wrong against the real data — not a table
-- anything in the app ever reads.
--
-- No grants for `anon` or `authenticated`: this table has no purpose beyond
-- that recovery, so nothing but a service-role connection can see it.
create table public.tasks_pre_trainer_migration_snapshot as table public.tasks;

comment on table public.tasks_pre_trainer_migration_snapshot is
  'Point-in-time copy of tasks taken before #7''s backfill. Recovery only — nothing reads this.';

alter table public.tasks_pre_trainer_migration_snapshot enable row level security;

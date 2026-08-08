-- Time zone becomes trainer state (#17): the setting every part of the app
-- now derives "today" from, and the fix for settlement never reaching a
-- trainer's first days. See CONTEXT.md's "Day" entry and
-- docs/adr/0004-time-zone-is-a-stored-setting.md for why this is a stored
-- setting rather than one read from the browser.

-- An IANA zone name, defaulted so a freshly-provisioned trainer (no Settings
-- visit yet) still has a real one to settle and display against. Column-level
-- update, the same as daily_target — see the trainer migration's comment on
-- this project's column-level-grant-or-none default for derived-or-owned
-- state; this one is trainer-owned, like daily_target.
alter table public.trainer
  add column time_zone text not null default 'America/Vancouver';

comment on column public.trainer.time_zone is
  'The trainer''s own IANA time zone. Set in Settings, never detected from the browser — see ADR-0004.';

grant update (time_zone) on public.trainer to authenticated;

-- Validity is guaranteed here, not at the write seam (ADR-0001): an invalid
-- zone throws in both `Intl.DateTimeFormat` (breaking server rendering
-- outright) and in `now() at time zone` (breaking settlement), so it must be
-- unrepresentable rather than merely unlikely. Fires on update too, since a
-- trainer changes this from Settings after the row already exists.
create function public.validate_trainer_time_zone()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = NEW.time_zone) then
    raise exception 'trainer.time_zone: % is not a valid IANA time zone', NEW.time_zone;
  end if;
  return NEW;
end;
$$;

-- Named `..._10_...` so it sorts, and therefore fires, before
-- `..._20_seed_last_settled_day` below on INSERT — Postgres runs same-timing
-- triggers in name order, and the seed trigger's own `at time zone` expression
-- needs a zone this one has already vetted, not merely one Postgres's
-- `AT TIME ZONE` happens to accept (which is a superset of `pg_timezone_names`:
-- abbreviations like `PST` resolve there but are not real IANA names).
create trigger trainer_10_validate_time_zone
  before insert or update of time_zone on public.trainer
  for each row
  execute function public.validate_trainer_time_zone();

-- The signup day was being marked already-settled: `last_settled_day`
-- defaulted to the database server's `current_date`, in the server's own
-- zone, before the trainer had lived any of it. Settlement only ever settles
-- days *after* this watermark, so the trainer's first day — and sometimes
-- their second, for zones west of UTC — could never be reached.
--
-- The default is dropped; the column stays not null. A `BEFORE INSERT`
-- trigger seeds it instead, to the day *before* the trainer's local creation
-- day, in their own zone — already vetted by the `_10_` trigger above, which
-- fires first — which is what makes the creation day a real, settleable day
-- rather than an already-settled one.
alter table public.trainer
  alter column last_settled_day drop default;

-- Overwrites whatever was supplied rather than defaulting it: `insert` on
-- trainer is granted table-wide to `authenticated` (column-level grants
-- constrain only `update`), so a hand-rolled insert could otherwise seed a
-- far-future watermark and disable settlement for that account permanently.
-- Because time_zone always has a value by the time this fires — supplied,
-- validated by the trigger above, or defaulted — the computed watermark is
-- always a real date; the settlement function's staleness guard (which
-- compares by equality and would silently no-op forever against a null) is
-- left untouched.
create function public.seed_trainer_last_settled_day()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  NEW.last_settled_day := (now() at time zone NEW.time_zone)::date - 1;
  return NEW;
end;
$$;

create trigger trainer_20_seed_last_settled_day
  before insert on public.trainer
  for each row
  execute function public.seed_trainer_last_settled_day();

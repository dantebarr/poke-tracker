-- Warden Baoba's first-day briefing (#27): recorded against the trainer, not
-- the browser, so it plays exactly once regardless of which device the
-- Ranger is on. Client-side storage would replay a once-in-a-lifetime scene
-- on every new device; deriving it from an empty Logbook misfires for anyone
-- who signs up and then does nothing for a week (see #18's Implementation
-- Decisions, "Intro seen timestamp on trainer").
--
-- Nullable, with no default: null means the briefing hasn't been dismissed
-- yet, which is also what makes a trainer's first day detectable. Column-level
-- update, the same as daily_target and time_zone — see the trainer
-- migration's comment on this project's column-level-grant-or-none default.

alter table public.trainer add column intro_seen_at timestamptz;

-- Backfilled to each existing trainer's own creation moment, not left null:
-- a trainer who signed up before this column existed has already lived past
-- their first day, so a bare `add column` would otherwise show them a
-- "you're the new Ranger" scene addressed to someone who has never used the
-- app. Only a genuinely new sign-up gets the null this column relies on.
update public.trainer set intro_seen_at = created_at where intro_seen_at is null;

comment on column public.trainer.intro_seen_at is
  'When the trainer dismissed Warden Baoba''s first-day briefing. Null means they have not seen it yet — the briefing shows once, on their first day, and stays readable afterwards from Settings.';

grant update (intro_seen_at) on public.trainer to authenticated;

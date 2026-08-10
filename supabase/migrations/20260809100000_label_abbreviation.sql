-- A Ranger-authored abbreviation for each Label (#26), so the Field log can
-- show a short tag on every Task row instead of the full Label name pushing
-- titles into an ellipsis.
--
-- Authored, not derived: RESERVE and RESEARCH become RSV and RSH precisely
-- because naive truncation gives RES for both, and only the trainer knows
-- which Labels they're likely to confuse. Existing Labels are backfilled
-- from their names below so no Ranger sees a blank tag, but that backfill is
-- a starting point, not the feature — the point of this column is that it's
-- editable from Settings afterward.

alter table public.label add column abbreviation text;

update public.label set abbreviation = upper(left(name, 3));

alter table public.label alter column abbreviation set not null;

-- Length lives in the database (ADR-0001), not at the write seam. Four
-- characters leaves a little headroom over the three-character convention
-- the backfill and seed data use. Measured on the trimmed value so a
-- whitespace-only abbreviation — length 1 by raw character count — can't
-- slip past as the very blank tag the backfill above exists to avoid.
alter table public.label
  add constraint label_abbreviation_length check (char_length(btrim(abbreviation)) between 1 and 4);

comment on column public.label.abbreviation is
  'A short, trainer-authored tag shown on Task rows in place of the full Label name.';

grant update (abbreviation) on public.label to authenticated;

-- The seed labels get real abbreviations too, so a freshly-provisioned
-- trainer never sees a blank tag either. `create or replace` keeps this the
-- same function and trigger the labels migration created.
create or replace function public.seed_default_labels()
returns trigger
language plpgsql
as $$
begin
  insert into public.label (trainer_id, name, color, position, abbreviation) values
    (new.id, 'Personal', '#3B82F6', 0, 'PER'),
    (new.id, 'Babylon', '#F59E0B', 1, 'BAB'),
    (new.id, 'EA', '#10B981', 2, 'EA'),
    (new.id, 'Atlas', '#8B5CF6', 3, 'ATL');
  return new;
end;
$$;

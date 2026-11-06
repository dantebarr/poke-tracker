"use client";

import { keepEscapeInChip } from "@/app/field-log/chips";
import {
  DAYS_OF_MONTH,
  FREQUENCY_OPTIONS,
  type RecurringFields,
  type RecurringFormView,
} from "@/app/recurring-fields";
import type { RecurrenceFrequency } from "@/lib/recurrence/dates";
import { recurrenceSentence, shortMonthNote, WEEKDAY_NAMES } from "@/lib/recurrence/wording";
import type { TaskRecurrence } from "@/lib/task/task";

/**
 * What an opened task says about the rule that generated it (#16): its own
 * line of text, in the desktop row's expander and on the mobile detail screen,
 * telling a Ranger why the task is there and what happens after they complete
 * it.
 *
 * Not the Notes box, which stays whatever the rule stamped onto the task —
 * trainer-authored and untouched — and not the collapsed row either, which is
 * unchanged: the marker belongs to the task a Ranger opened, not to every row
 * in the log.
 *
 * The sentence comes from `recurrenceSentence`, which the add form's preview
 * reads too, so a rule cannot be worded one way while it is being created and
 * another afterwards. The glyph is the recurring toggle's own, for the same
 * reason it is drawn rather than set in type there.
 */
export function RecurrenceMarker({ recurrence }: { recurrence: TaskRecurrence }) {
  // The clamp travels with the sentence rather than being left behind on the
  // add form: a task due on the 29th whose rule says "the 31st" is exactly the
  // moment a trainer needs telling why, and this is the surface #16 asks to
  // explain why the task is there.
  const clampNote = shortMonthNote(recurrence.dayOfMonth);
  return (
    <p className="recurmarker">
      <RecurringGlyph />
      {recurrenceSentence(recurrence)}
      {clampNote && <span className="recurclamp">{clampNote}</span>}
    </p>
  );
}

/**
 * Two arrows round a circle — the mark of a rule, on the toggle that creates
 * one and on the marker of a task one generated. Drawn rather than set in
 * type: the chrome's two faces are pixel fonts, neither of which carries a
 * glyph like this, so a character would land on whatever fallback each machine
 * happened to have.
 */
function RecurringGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M3 8a5 5 0 0 1 8.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12.4 2.3v3.4H9z" fill="currentColor" />
      <path d="M13 8a5 5 0 0 1-8.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M3.6 13.7v-3.4H7z" fill="currentColor" />
    </svg>
  );
}

/**
 * The recurring toggle (#15): an icon button, and nothing else, sitting to the
 * right of every other chip on the row. Only the two add surfaces render it —
 * a **Recurrence** has no edit surface and no update grant, so there is
 * nothing for the task detail screen to show.
 *
 * A button rather than a labelled checkbox chip, and last rather than beside
 * the date: what it does is reveal a second row of settings, and a control
 * that opens something reads better as a button at the end of a row than as a
 * fourth thing to fill in halfway along it. `aria-pressed` is the state, since
 * the row appearing is a consequence of recurring being on rather than a
 * disclosure a trainer can leave open with recurring off.
 */
export function RecurringToggle({
  fields,
  onChange,
}: {
  fields: RecurringFields;
  onChange: (patch: Partial<RecurringFields>) => void;
}) {
  return (
    <button
      type="button"
      className="recurbtn"
      aria-pressed={fields.recurring}
      aria-label="Recurring"
      title="Recurring"
      onClick={() => onChange({ recurring: !fields.recurring })}
    >
      <RecurringGlyph />
    </button>
  );
}

/**
 * What the toggle opens: the frequency, the day it asks for, and the plain
 * answer to "what am I about to get" — on their own row beneath the chips
 * rather than among them. A rule is a different kind of thing from a due date
 * and a size, and reading the two apart is what the separate row buys; mixed
 * into one wrapping row they were four pills that looked alike and meant
 * different things.
 *
 * Everything shown is decided by `describeRecurringForm` rather than here —
 * which pickers appear, what day each defaults to, the resolved first date,
 * whether the clamping note applies — because the suite has no DOM tests and
 * logic left in a component is logic left unproven.
 *
 * Still one step, so capture stays single-step (`UI-CONSTRAINTS.md`): the row
 * opens in place on the same form, with nothing to navigate to and nothing
 * hidden behind it.
 *
 * "Every" and "On" rather than "Repeats" and "Frequency": CONTEXT.md puts
 * *repeat* on the Recurrence's `_Avoid_` list, and the two chips read as the
 * sentence a trainer is composing — every week, on Wednesday.
 */
export function RecurringOptions({
  fields,
  view,
  onChange,
}: {
  fields: RecurringFields;
  view: RecurringFormView;
  onChange: (patch: Partial<RecurringFields>) => void;
}) {
  if (!fields.recurring) return null;

  return (
    <>
      {/* Full-width and zero-height, so it is both the rule between the two
          rows and the thing that breaks the line: everything after it wraps
          below. That is what lets Cancel and Save, which come after these in
          the row, sit beside them rather than alone on a third line. */}
      <span className="recurrule" aria-hidden="true" />
      <label className="chip">
        Every
        <select
          value={fields.frequency}
          onChange={(event) => onChange({ frequency: event.target.value as RecurrenceFrequency })}
          onKeyDown={keepEscapeInChip}
          aria-label="Every day, week or month"
        >
          {FREQUENCY_OPTIONS.map((option) => (
            <option key={option.frequency} value={option.frequency}>
              {option.name}
            </option>
          ))}
        </select>
      </label>
      {view.dayOfWeek !== null && (
        <label className="chip">
          On
          <select
            value={String(view.dayOfWeek)}
            onChange={(event) => onChange({ dayOfWeek: Number(event.target.value) })}
            onKeyDown={keepEscapeInChip}
            aria-label="On which day of the week"
          >
            {WEEKDAY_NAMES.map((name, day) => (
              <option key={name} value={day}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      {view.dayOfMonth !== null && (
        <label className="chip">
          On the
          <select
            value={String(view.dayOfMonth)}
            onChange={(event) => onChange({ dayOfMonth: Number(event.target.value) })}
            onKeyDown={keepEscapeInChip}
            aria-label="On the day of the month"
          >
            {DAYS_OF_MONTH.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

/**
 * The plain-language answer to "what am I about to get". Its own component,
 * and rendered after the form's buttons rather than with the pickers it
 * describes, because it takes a full line of its own: sitting among them it
 * would push Cancel and Save off the row this arrangement exists to keep them
 * on.
 */
export function RecurringNote({ view }: { view: RecurringFormView }) {
  if (!view.firstTaskNote) return null;
  return (
    <p className="recurnote">
      {view.firstTaskNote}
      {view.clampNote && <span className="recurclamp">{view.clampNote}</span>}
    </p>
  );
}

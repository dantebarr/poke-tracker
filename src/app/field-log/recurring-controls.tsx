"use client";

import { recurrenceSentence, shortMonthNote } from "@/lib/recurrence/wording";
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




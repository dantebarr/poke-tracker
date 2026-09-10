import { describe, expect, it } from "vitest";

import {
  describeRecurringForm,
  newRecurringFields,
  type RecurringFields,
} from "@/app/recurring-fields";
import { recurrenceSentence } from "@/lib/recurrence/wording";

/**
 * Pure logic, no database — these run without the local Supabase stack even
 * though the global setup starts it for the suite as a whole. See
 * tests/new-task-defaults.test.ts for the same note and its shape.
 *
 * What the add form shows once a trainer turns recurring on (#15): which
 * pickers are offered, what they default to, and the plain-language answer to
 * "what am I about to get". The date arithmetic behind that answer is not
 * retested here — tests/recurrence-dates.test.ts owns it, and the point of
 * this module is that the preview calls the *same* function generation does,
 * so the two can never disagree.
 *
 * One thing these cannot reach, stated so nobody assumes otherwise: that
 * `useNewTaskDraft` actually *holds* the day fields as null rather than
 * copying the default in. That is a hook, the suite has no DOM tests, and the
 * behaviour it decides — a default that moves with the date, an override that
 * does not — is only proved here at the level of the function the hook calls.
 *
 * Fixed dates throughout: 2024-01-15 is a Monday, in a leap year.
 */

const MONDAY = "2024-01-15";
const SUNDAY = 0;
const MONDAY_DOW = 1;
const WEDNESDAY = 3;

/** The form as it stands with recurring on, before the trainer overrides anything. */
function on(overrides: Partial<RecurringFields> = {}): RecurringFields {
  return { ...newRecurringFields(), recurring: true, ...overrides };
}

describe("before recurring is turned on", () => {
  it("starts off, so the add form is an ordinary one-off task form", () => {
    expect(newRecurringFields().recurring).toBe(false);
  });

  it("leaves the date chip saying Due, and offers no rule and nothing to preview", () => {
    const view = describeRecurringForm({ ...newRecurringFields(), dueDate: MONDAY });

    expect(view.dateLabel).toBe("Due");
    expect(view.rule).toBeNull();
    expect(view.firstTaskDate).toBeNull();
    expect(view.firstTaskNote).toBeNull();
    expect(view.clampNote).toBeNull();
  });
});

describe("turning recurring on", () => {
  it("relabels the date chip, the field no longer meaning a due date", () => {
    expect(describeRecurringForm({ ...on(), dueDate: MONDAY }).dateLabel).toBe("Starts");
  });

  it("says so even before a date is chosen, the label following the toggle rather than the date", () => {
    const view = describeRecurringForm({ ...on(), dueDate: "" });

    expect(view.dateLabel).toBe("Starts");
    // Nothing to resolve a first date from yet. Save is refused in this state
    // anyway — the draft is invalid without a date — so the preview simply
    // has nothing to say rather than guessing at one.
    expect(view.rule).toBeNull();
    expect(view.firstTaskDate).toBeNull();
  });
});

describe("what each frequency asks for", () => {
  it("asks a daily rule for neither day, and carries neither into the rule", () => {
    const view = describeRecurringForm({ ...on({ frequency: "daily" }), dueDate: MONDAY });

    expect(view.dayOfWeek).toBeNull();
    expect(view.dayOfMonth).toBeNull();
    // The check constraint refuses a daily rule carrying either (ADR-0001),
    // so what the form submits has to be null and not merely unshown.
    // `startsOn`, not `dueDate`: the chip's one value is a due date to a task
    // and a start date to a rule, and this is where it becomes the latter.
    expect(view.rule).toEqual({ frequency: "daily", dayOfWeek: null, dayOfMonth: null, startsOn: MONDAY });
    expect(view.firstTaskDate).toBe(MONDAY);
  });

  it("asks a weekly rule for a day of week, defaulted to the chosen date's own", () => {
    const view = describeRecurringForm({ ...on({ frequency: "weekly" }), dueDate: MONDAY });

    expect(view.dayOfWeek).toBe(MONDAY_DOW);
    expect(view.dayOfMonth).toBeNull();
    expect(view.rule).toMatchObject({ frequency: "weekly", dayOfWeek: MONDAY_DOW, dayOfMonth: null });
    // The start date is itself a Monday, so it is the first task.
    expect(view.firstTaskDate).toBe(MONDAY);
  });

  it("asks a monthly rule for a day of month, defaulted to the chosen date's own", () => {
    const view = describeRecurringForm({ ...on({ frequency: "monthly" }), dueDate: MONDAY });

    expect(view.dayOfMonth).toBe(15);
    expect(view.dayOfWeek).toBeNull();
    expect(view.rule).toMatchObject({ frequency: "monthly", dayOfWeek: null, dayOfMonth: 15 });
    expect(view.firstTaskDate).toBe(MONDAY);
  });
});

describe("overriding a default", () => {
  it("runs on the weekday the trainer picked, not the one they dated", () => {
    const view = describeRecurringForm({
      ...on({ frequency: "weekly", dayOfWeek: WEDNESDAY }),
      dueDate: MONDAY,
    });

    expect(view.dayOfWeek).toBe(WEDNESDAY);
    expect(view.firstTaskDate).toBe("2024-01-17");
  });

  it("runs a monthly rule on the day the trainer picked", () => {
    const view = describeRecurringForm({
      ...on({ frequency: "monthly", dayOfMonth: 1 }),
      dueDate: MONDAY,
    });

    expect(view.dayOfMonth).toBe(1);
    // Never earlier than the start date: the 1st has already gone by, so the
    // first task is next month's.
    expect(view.firstTaskDate).toBe("2024-02-01");
  });

  it("moves the default when the date moves, and leaves an override where it was put", () => {
    const tuesday = "2024-01-16";

    expect(describeRecurringForm({ ...on({ frequency: "weekly" }), dueDate: tuesday }).dayOfWeek).toBe(2);
    expect(
      describeRecurringForm({ ...on({ frequency: "weekly", dayOfWeek: SUNDAY }), dueDate: tuesday }).dayOfWeek,
    ).toBe(SUNDAY);
  });
});

describe("the first task a trainer is about to get", () => {
  it("is named in plain language, so a rule starting today reads differently from one starting next week", () => {
    const today = describeRecurringForm({ ...on({ frequency: "weekly" }), dueDate: MONDAY });
    const nextWeek = describeRecurringForm({
      ...on({ frequency: "weekly", dayOfWeek: SUNDAY }),
      dueDate: MONDAY,
    });

    expect(today.firstTaskNote).toBe("First task: Monday, Jan 15");
    expect(nextWeek.firstTaskNote).toBe("First task: Sunday, Jan 21");
  });
});

describe("the rule the form hands over", () => {
  it("is worded, by the marker on the task it generates, in terms of this same resolved rule (#16)", () => {
    // The preview shows the first date and the marker shows the rule, so the
    // two never render the same string — but both resolve it with
    // `firstDueDate`, which is what keeps them from disagreeing about which
    // day the rule actually falls on.
    const view = describeRecurringForm({ ...on({ frequency: "weekly", dayOfWeek: WEDNESDAY }), dueDate: MONDAY });

    expect(recurrenceSentence(view.rule!)).toBe("Every Wednesday");
    expect(view.firstTaskNote).toBe("First task: Wednesday, Jan 17");
  });
});

describe("the clamping note", () => {
  it("says what a month-end rule will do in a shorter month, naming the day chosen", () => {
    const view = describeRecurringForm({
      ...on({ frequency: "monthly", dayOfMonth: 31 }),
      dueDate: "2024-02-01",
    });

    expect(view.clampNote).toBe("the 31st, or the last day in shorter months");
    // And the preview already shows the clamp resolved, February 2024 being a
    // leap February.
    expect(view.firstTaskDate).toBe("2024-02-29");
  });

  it.each([29, 30, 31])("appears for the %ith, which some month is short of", (dayOfMonth) => {
    const view = describeRecurringForm({ ...on({ frequency: "monthly", dayOfMonth }), dueDate: MONDAY });
    expect(view.clampNote).not.toBeNull();
  });

  it("stays away from a day every month has", () => {
    const view = describeRecurringForm({ ...on({ frequency: "monthly", dayOfMonth: 28 }), dueDate: MONDAY });
    expect(view.clampNote).toBeNull();
  });

  it("stays away from the frequencies it cannot apply to", () => {
    for (const frequency of ["daily", "weekly"] as const) {
      const view = describeRecurringForm({ ...on({ frequency, dayOfMonth: 31 }), dueDate: "2024-01-31" });
      expect(view.clampNote, `expected no clamp note for a ${frequency} rule`).toBeNull();
    }
  });
});

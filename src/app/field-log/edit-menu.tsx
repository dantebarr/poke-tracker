"use client";

import type { ReactNode } from "react";

import { keepEscapeInChip } from "@/app/field-log/chips";
import { DAYS_OF_MONTH, type RecurringFields, type RecurringFormView } from "@/app/recurring-fields";
import type { EditableFields } from "@/app/task-edit-fields";
import type { RecurrenceFrequency } from "@/lib/recurrence/dates";
import { WEEKDAY_NAMES } from "@/lib/recurrence/wording";
import { addDays } from "@/lib/day/day";
import type { Label } from "@/lib/label/label";
import { effortPoints, TASK_SIZES } from "@/lib/task/task";
import { capitalise } from "@/lib/text";

/**
 * The desktop task editor's fields, drawn as a game menu rather than a row of
 * dropdowns: every choice is on screen at once, and the chosen one carries the
 * ▶ cursor. Each line is a real radio group, so arrow keys move the cursor the
 * way they would in a menu, and Tab moves between lines.
 *
 * Shared by the two desktop forms — an open row's inline editor and the add
 * form — so editing and creating a task look and work alike. The mobile
 * detail screen and add sheet keep `TaskFieldChips`.
 */
export function TaskEditMenu({
  taskId,
  fields,
  labels,
  todayKey,
  dateLabel = "Due",
  afterEffort,
  onChange,
}: {
  /** Keeps each form's radio groups apart, since radios group by name. */
  taskId: string;
  fields: Omit<EditableFields, "title">;
  labels: Label[];
  todayKey: string;
  /** "Starts" once the add form is creating a repeating task. */
  dateLabel?: "Due" | "Starts";
  /** Extra lines between Effort and Notes — the add form's Repeat lines. */
  afterEffort?: ReactNode;
  onChange: (patch: Partial<EditableFields>) => void;
}) {
  const quickDates = [
    { label: "Today", value: todayKey },
    { label: "Tomorrow", value: addDays(todayKey, 1) },
    { label: "Next week", value: addDays(todayKey, 7) },
  ];
  const name = (field: string) => `${field}-${taskId}`;

  return (
    <div className="editmenu">
      <div className="menuline" role="radiogroup" aria-label={dateLabel}>
        <span className="menukey">{dateLabel}</span>
        <div className="menuopts">
          {quickDates.map((option) => (
            <label key={option.label} className="menuopt">
              <input
                type="radio"
                name={name("due")}
                checked={fields.dueDate === option.value}
                onChange={() => onChange({ dueDate: option.value })}
              />
              <span>{option.label}</span>
            </label>
          ))}
          <label className={`menuopt menudate${quickDates.some((d) => d.value === fields.dueDate) ? "" : " picked"}`}>
            <input
              type="date"
              value={fields.dueDate}
              onChange={(event) => event.target.value && onChange({ dueDate: event.target.value })}
              onKeyDown={keepEscapeInChip}
              aria-label={`${dateLabel} date`}
            />
          </label>
        </div>
      </div>

      <div className="menuline" role="radiogroup" aria-label="Label">
        <span className="menukey">Label</span>
        <div className="menuopts">
          {labels.map((label) => (
            <label key={label.id} className="menuopt" title={label.name}>
              <input
                type="radio"
                name={name("label")}
                checked={fields.labelId === label.id}
                onChange={() => onChange({ labelId: label.id })}
              />
              <span className="tag" style={{ backgroundColor: label.color }}>
                {label.abbreviation}
              </span>
              <span>{label.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="menuline" role="radiogroup" aria-label="Effort">
        <span className="menukey">Effort</span>
        <div className="menuopts">
          {TASK_SIZES.map((size) => (
            <label key={size} className="menuopt">
              <input
                type="radio"
                name={name("size")}
                checked={fields.size === size}
                onChange={() => onChange({ size })}
              />
              <span className="menupts">+{effortPoints(size)}</span>
              <span>{capitalise(size)}</span>
            </label>
          ))}
        </div>
      </div>

      {afterEffort}

      <label className="menuline">
        <span className="menukey">Notes</span>
        <textarea
          className="menunotes"
          rows={2}
          placeholder="Anything worth remembering"
          value={fields.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
        />
      </label>
    </div>
  );
}

const REPEAT_OPTIONS: { frequency: RecurrenceFrequency; name: string }[] = [
  { frequency: "daily", name: "Daily" },
  { frequency: "weekly", name: "Weekly" },
  { frequency: "monthly", name: "Monthly" },
];

/**
 * The add form's repeat controls as menu lines: Never or a frequency, then —
 * for weekly and monthly — which day. Replaces the chip form's icon toggle
 * and its dropdowns on desktop; the rule itself is unchanged.
 */
export function RepeatMenuLines({
  formId,
  fields,
  view,
  onChange,
}: {
  formId: string;
  fields: RecurringFields;
  view: RecurringFormView;
  onChange: (patch: Partial<RecurringFields>) => void;
}) {
  return (
    <>
      <div className="menuline" role="radiogroup" aria-label="Repeat">
        <span className="menukey">Repeat</span>
        <div className="menuopts">
          <label className="menuopt">
            <input
              type="radio"
              name={`repeat-${formId}`}
              checked={!fields.recurring}
              onChange={() => onChange({ recurring: false })}
            />
            <span>Never</span>
          </label>
          {REPEAT_OPTIONS.map((option) => (
            <label key={option.frequency} className="menuopt">
              <input
                type="radio"
                name={`repeat-${formId}`}
                checked={fields.recurring && fields.frequency === option.frequency}
                onChange={() => onChange({ recurring: true, frequency: option.frequency })}
              />
              <span>{option.name}</span>
            </label>
          ))}
        </div>
      </div>

      {fields.recurring && view.dayOfWeek !== null && (
        <div className="menuline" role="radiogroup" aria-label="On which day of the week">
          <span className="menukey">On</span>
          <div className="menuopts">
            {WEEKDAY_NAMES.map((name, day) => (
              <label key={name} className="menuopt" title={name}>
                <input
                  type="radio"
                  name={`weekday-${formId}`}
                  checked={view.dayOfWeek === day}
                  onChange={() => onChange({ dayOfWeek: day })}
                  aria-label={name}
                />
                <span>{name.slice(0, 3)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {fields.recurring && view.dayOfMonth !== null && (
        <label className="menuline">
          <span className="menukey">On the</span>
          <span className="menuopts">
            <span className="menuopt menudate picked">
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
            </span>
          </span>
        </label>
      )}

      {fields.recurring && view.firstTaskNote && (
        <p className="menunote">
          {view.firstTaskNote}
          {view.clampNote && <span className="recurclamp">{view.clampNote}</span>}
        </p>
      )}
    </>
  );
}

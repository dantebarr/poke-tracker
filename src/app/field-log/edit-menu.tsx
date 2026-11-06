"use client";

import { keepEscapeInChip } from "@/app/field-log/chips";
import type { EditableFields } from "@/app/task-edit-fields";
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
 * The mobile detail screen and both add forms keep `TaskFieldChips`; this is
 * only the inline editor an open row expands into.
 */
export function TaskEditMenu({
  taskId,
  fields,
  labels,
  todayKey,
  onChange,
}: {
  taskId: string;
  fields: EditableFields;
  labels: Label[];
  todayKey: string;
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
      <div className="menuline" role="radiogroup" aria-label="Due">
        <span className="menukey">Due</span>
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
              aria-label="Due date"
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

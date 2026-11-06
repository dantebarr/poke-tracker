"use client";

import type { KeyboardEvent } from "react";

import type { Label } from "@/lib/label/label";
import { TASK_SIZES, type TaskSize } from "@/lib/task/task";
import { capitalise } from "@/lib/text";

/**
 * Escape inside a chip belongs to the chip (#34). A native `<select>` and a
 * date `<input>` both use it to shut their own picker, and letting it reach
 * `useOverlayDismiss`'s document listener would close the whole overlay out
 * from under an open dropdown — an editor vanishing mid-pick.
 *
 * React 19 attaches at the root container, which is inside `document`, so
 * this synthetic `stopPropagation` really does halt the native event before
 * the document listener runs — which is why that listener is in the bubble
 * phase and not capture.
 *
 * The cost is that Escape while a chip merely holds focus, with no picker
 * open, does nothing at all: there is no way to tell those two states apart
 * from here. That is the right side to be wrong on — an inert keypress is a
 * smaller failure than an editor closing itself mid-pick, and Tab or a click
 * puts a Ranger somewhere Escape works again.
 */
export function keepEscapeInChip(event: KeyboardEvent<HTMLElement>) {
  if (event.key === "Escape") event.stopPropagation();
}

/**
 * The due/label/size chip trio, shared between the desktop add editor, the
 * mobile add sheet, an open row's desktop expander, and the mobile task
 * detail screen (#29's `TaskDetailScreen`). Every caller now arrives with all
 * three chosen — an existing task's fields are never blank, and the two add
 * forms open on `newTaskFields`'s defaults — so the "—" placeholder option
 * the add forms used to ask for is gone, and with it the only way to put a
 * form back into a state Save refuses.
 */
export function TaskFieldChips({
  dueDate,
  labelId,
  size,
  labels,
  dateLabel = "Due",
  onDueChange,
  onLabelChange,
  onSizeChange,
}: {
  dueDate: string;
  labelId: string;
  size: TaskSize;
  labels: Label[];
  /**
   * What the date chip is called. "Starts" once the add form's recurring
   * toggle is on (#15), the field then anchoring a rule rather than naming a
   * due date — a prop rather than a fork of this component, since the other
   * three callers are unaffected and a rule has no edit surface to relabel.
   */
  dateLabel?: "Due" | "Starts";
  onDueChange: (value: string) => void;
  onLabelChange: (value: string) => void;
  onSizeChange: (value: TaskSize) => void;
}) {
  return (
    <>
      <label className="chip">
        {dateLabel}
        <input
          type="date"
          value={dueDate}
          onChange={(event) => onDueChange(event.target.value)}
          onKeyDown={keepEscapeInChip}
          aria-label={`${dateLabel} date`}
        />
      </label>
      <label className="chip">
        Label
        <select
          value={labelId}
          onChange={(event) => onLabelChange(event.target.value)}
          onKeyDown={keepEscapeInChip}
          aria-label="Label"
        >
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </select>
      </label>
      <label className="chip">
        Size
        <select
          value={size}
          onChange={(event) => onSizeChange(event.target.value as TaskSize)}
          onKeyDown={keepEscapeInChip}
          aria-label="Size"
        >
          {TASK_SIZES.map((sizeOption) => (
            <option key={sizeOption} value={sizeOption}>
              {capitalise(sizeOption)}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

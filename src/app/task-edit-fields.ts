import { useCallback, useRef, useState } from "react";

import type { Label } from "@/lib/label/label";
import type { Task, TaskSize } from "@/lib/task/task";

export type EditableFields = {
  title: string;
  notes: string;
  dueDate: string;
  labelId: string;
  size: TaskSize;
};

export function taskToFields(task: Task): EditableFields {
  return {
    title: task.title,
    notes: task.notes ?? "",
    dueDate: task.dueDate,
    labelId: task.label.id,
    size: task.size,
  };
}

/**
 * What a brand new task's form starts filled in with: due today, the
 * trainer's first Label, and Small. Capture stays single-step (
 * `UI-CONSTRAINTS.md`) — the schema's four required fields are all still on
 * screen and still editable, this only means the common task is one title
 * and Save rather than three pickers first.
 *
 * Today is the trainer's own day key, never the device's date (ADR-0004), so
 * this comes from the same `todayKey` the field log buckets against. The
 * label is the *top* one in the trainer's own display order, which is the
 * order they arranged in Settings — the closest thing to "the one I mostly
 * work in". A trainer with no labels yet gets a blank one, which leaves Save
 * disabled rather than inventing a label they never defined. Small is the
 * cheapest size, so the default under-claims rather than over-claims effort
 * points.
 */
export function newTaskFields({
  todayKey,
  labels,
}: {
  todayKey: string;
  labels: Label[];
}): EditableFields {
  return {
    title: "",
    notes: "",
    dueDate: todayKey,
    labelId: labels[0]?.id ?? "",
    size: "small",
  };
}

/**
 * What becomes of a new task's draft when the Ranger leaves the add form
 * without using either button — Escape, or a pointer landing outside it
 * (#34). A titled draft is *kept*: walking away means attention moved on, not
 * that the draft was rejected, and the form has been one-title-and-commit
 * since `newTaskFields` started filling the rest in. The Cancel button is the
 * explicit rejection and still discards, which is the whole reason these two
 * exits differ.
 *
 * `valid` and not just `titleTyped` because a title alone is not always
 * savable: a trainer who has deleted every label in Settings has no default
 * label to start from, so the draft cannot be written at all. Discarding is
 * the only other thing to do — refusing to close would leave a form there is
 * no implicit way out of.
 */
export function dismissedDraftOutcome({ titleTyped, valid }: { titleTyped: boolean; valid: boolean }): "save" | "discard" {
  return titleTyped && valid ? "save" : "discard";
}

// Matches the server's own `notesField` (actions/task.ts): blank or
// whitespace-only notes are `null`, not an empty string, so the optimistic
// patch never disagrees with what the server is about to store.
export function normalizeNotes(notes: string): string | null {
  const trimmed = notes.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * One task's editable fields, held locally until the caller commits them.
 * Nothing is ever saved on this hook's own initiative: both the desktop
 * inline row (`OpenTaskRow` in `field-log/task-rows.tsx`) and the mobile
 * detail screen (`task-detail-screen.tsx`) are explicit Cancel/Save forms,
 * so a Ranger can change their mind, and a task never jumps to another
 * bucket while its due date is still being edited.
 *
 * `reset` and `edit` have stable identity (empty-deps `useCallback`, state
 * read via a ref) so callers can put them in effect dependency arrays.
 */
export function useTaskFields(task: Task) {
  const [fields, setFields] = useState<EditableFields>(() => taskToFields(task));
  const fieldsRef = useRef(fields);

  const reset = useCallback((nextTask: Task) => {
    const next = taskToFields(nextTask);
    fieldsRef.current = next;
    setFields(next);
  }, []);

  const edit = useCallback((patch: Partial<EditableFields>) => {
    const next = { ...fieldsRef.current, ...patch };
    fieldsRef.current = next;
    setFields(next);
  }, []);

  return { fields, edit, reset };
}

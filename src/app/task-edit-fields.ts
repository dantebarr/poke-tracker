import { useCallback, useEffect, useRef, useState } from "react";

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

// Matches the server's own `notesField` (actions/task.ts): blank or
// whitespace-only notes are `null`, not an empty string, so the optimistic
// patch never disagrees with what the server is about to store.
export function normalizeNotes(notes: string): string | null {
  const trimmed = notes.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * One task's editable fields, backing the two persistence models this app
 * has (#32).
 *
 * Pass `liveSave` and every change is debounced 600ms before it reaches it,
 * so a title typed character by character is one write, not one per
 * keystroke (UI-CONSTRAINTS.md's complaint about the mockup's own
 * per-keystroke model). That is the desktop inline expander (`OpenTaskRow`
 * in `field-log-panel.tsx`), where editing is a fast in-place thing and
 * there is no moment that reads as "done".
 *
 * Leave it out and nothing is ever saved on this hook's own initiative: the
 * caller reads `fields` and commits them itself. That is the mobile detail
 * screen (`task-detail-screen.tsx`), which since #32 is an explicit form —
 * Cancel and Save, like the add form it sits beside — so that a Ranger can
 * open a task, change their mind and leave it as it was. The two surfaces
 * therefore no longer persist a task the same way, deliberately: creating a
 * task has always been an explicit commit, and the detail screen has moved
 * to the model of the add sheet it shares a footer with.
 *
 * `reset`/`edit`/`flush` have stable identity (empty-deps `useCallback`,
 * state read via refs) so callers can put them in effect dependency arrays
 * without the effect re-running on every render.
 */
export function useTaskFields(task: Task, liveSave?: (fields: EditableFields) => void) {
  const [fields, setFields] = useState<EditableFields>(() => taskToFields(task));
  const fieldsRef = useRef(fields);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveSaveRef = useRef(liveSave);

  useEffect(() => {
    liveSaveRef.current = liveSave;
  });

  const reset = useCallback((nextTask: Task) => {
    const next = taskToFields(nextTask);
    fieldsRef.current = next;
    setFields(next);
  }, []);

  const edit = useCallback((patch: Partial<EditableFields>) => {
    const next = { ...fieldsRef.current, ...patch };
    fieldsRef.current = next;
    setFields(next);
    if (!liveSaveRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      liveSaveRef.current?.(fieldsRef.current);
    }, 600);
  }, []);

  // A no-op without a `liveSave`, since nothing was ever scheduled.
  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      liveSaveRef.current?.(fieldsRef.current);
    }
  }, []);

  return { fields, edit, reset, flush };
}

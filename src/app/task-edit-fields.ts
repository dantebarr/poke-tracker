import { useCallback, useEffect, useRef, useState } from "react";

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

// Matches the server's own `notesField` (actions/task.ts): blank or
// whitespace-only notes are `null`, not an empty string, so the optimistic
// patch never disagrees with what the server is about to store.
export function normalizeNotes(notes: string): string | null {
  const trimmed = notes.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Live-saved editing for one task's fields: every change is debounced 600ms
 * before it reaches `onSave`, so a title typed character by character is one
 * write, not one per keystroke (UI-CONSTRAINTS.md's complaint about the
 * mockup's own per-keystroke model). Shared by the desktop inline expander
 * (`OpenTaskRow` in `field-log-panel.tsx`) and the mobile full-screen detail
 * screen (`task-detail-screen.tsx`, #29) — the same editing behaviour, two
 * different shells around it.
 *
 * `reset`/`schedule`/`flush` have stable identity (empty-deps `useCallback`,
 * state read via refs) so callers can put them in effect dependency arrays
 * without the effect re-running on every render.
 */
export function useDebouncedTaskFields(task: Task, onSave: (fields: EditableFields) => void) {
  const [fields, setFields] = useState<EditableFields>(() => taskToFields(task));
  const fieldsRef = useRef(fields);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  });

  const reset = useCallback((nextTask: Task) => {
    const next = taskToFields(nextTask);
    fieldsRef.current = next;
    setFields(next);
  }, []);

  const schedule = useCallback((patch: Partial<EditableFields>) => {
    const next = { ...fieldsRef.current, ...patch };
    fieldsRef.current = next;
    setFields(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      onSaveRef.current(fieldsRef.current);
    }, 600);
  }, []);

  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      onSaveRef.current(fieldsRef.current);
    }
  }, []);

  return { fields, schedule, reset, flush };
}

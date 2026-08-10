"use client";

import { type ReactNode, useEffect, useOptimistic, useRef, useState, useTransition } from "react";

import { TwoPaneStage } from "@/app/(app)/chrome/two-pane-stage";
import { completeTaskAction, createTaskAction, deleteTaskAction, updateTaskAction } from "@/app/actions/task";
import { AddTaskSheet, FieldLogPanel } from "@/app/field-log-panel";
import { PENDING_ID_PREFIX } from "@/app/pending-task-id";
import { TaskDetailScreen } from "@/app/task-detail-screen";
import { type EditableFields, normalizeNotes } from "@/app/task-edit-fields";
import type { Label } from "@/lib/label/label";
import type { Task } from "@/lib/task/task";

type TaskListAction =
  | { type: "add"; task: Task }
  | { type: "update"; id: string; patch: Partial<Task> }
  | { type: "complete"; id: string; completedAt: string }
  | { type: "delete"; id: string };

function reduceTasks(state: Task[], action: TaskListAction): Task[] {
  switch (action.type) {
    case "add":
      return [...state, action.task];
    case "update":
      return state.map((task) => (task.id === action.id ? { ...task, ...action.patch } : task));
    case "complete":
      return state.map((task) =>
        task.id === action.id ? { ...task, status: "done" as const, completedAt: action.completedAt } : task,
      );
    case "delete":
      return state.filter((task) => task.id !== action.id);
  }
}

/**
 * The field screen's client root (#28, split from `FieldLogPanel` by #29):
 * owns the Open task list's optimistic state and every write — completion,
 * edits, deletes, creation — so the same mutations reach both surfaces a
 * task can be viewed from: the desktop field log's inline row and the
 * mobile full-screen detail screen. The two are siblings, not nested,
 * because the mobile detail replaces the *entire* two-pane stage rather
 * than living inside one pane's scroll region (mockup B's own `.detail`
 * sits beside `.stage`, not inside it) — this component is what picks
 * between them.
 *
 * Completion is the one non-negotiable (#28's brief): the row moves the
 * instant the circle is clicked, `useOptimistic` reverts it automatically
 * the moment the transition settles (success or failure alike, since a
 * throw never reaches `revalidatePath`), and a failure gets a visible flash
 * on top of that revert rather than a silent snap-back.
 */
export function FieldScreen({
  pokemonPane,
  tasks,
  labels,
  timeZone,
  todayKey,
  dailyTarget,
}: {
  pokemonPane: ReactNode;
  tasks: Task[];
  labels: Label[];
  timeZone: string;
  todayKey: string;
  dailyTarget: number;
}) {
  const [optimisticTasks, dispatch] = useOptimistic(tasks, reduceTasks);
  const [, startTransition] = useTransition();
  const [mobileDetailTaskId, setMobileDetailTaskId] = useState<string | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [erroredId, setErroredId] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A failed *completion*, *edit* or *delete* still has a real row to flash
  // — `useOptimistic` reverts it back into view the moment the transition
  // settles, and `erroredId` above just marks it. A failed *creation* has no
  // such row: the optimistic task never existed server-side, so reverting
  // removes it entirely. This holds one just long enough to flash before it
  // vanishes for good, so a failed Add still reads as a failure rather than
  // the task silently never having appeared.
  const [failedDraft, setFailedDraft] = useState<Task | null>(null);
  const failedDraftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (errorTimer.current) clearTimeout(errorTimer.current);
      if (failedDraftTimer.current) clearTimeout(failedDraftTimer.current);
    };
  }, []);

  function flashError(id: string) {
    setErroredId(id);
    if (errorTimer.current) clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setErroredId(null), 1100);
  }

  function flashFailedDraft(task: Task) {
    setFailedDraft(task);
    if (failedDraftTimer.current) clearTimeout(failedDraftTimer.current);
    failedDraftTimer.current = setTimeout(() => setFailedDraft(null), 1100);
  }

  function handleComplete(task: Task) {
    startTransition(async () => {
      dispatch({ type: "complete", id: task.id, completedAt: new Date().toISOString() });
      try {
        const formData = new FormData();
        formData.set("id", task.id);
        await completeTaskAction(formData);
      } catch {
        flashError(task.id);
      }
    });
  }

  function handleSave(task: Task, fields: EditableFields) {
    const label = labels.find((candidate) => candidate.id === fields.labelId) ?? task.label;
    startTransition(async () => {
      dispatch({
        type: "update",
        id: task.id,
        patch: {
          title: fields.title,
          dueDate: fields.dueDate,
          size: fields.size,
          notes: normalizeNotes(fields.notes),
          label,
        },
      });
      try {
        const formData = new FormData();
        formData.set("id", task.id);
        formData.set("title", fields.title);
        formData.set("dueDate", fields.dueDate);
        formData.set("labelId", fields.labelId);
        formData.set("size", fields.size);
        formData.set("notes", fields.notes);
        await updateTaskAction(formData);
      } catch {
        flashError(task.id);
      }
    });
  }

  function handleDelete(task: Task) {
    startTransition(async () => {
      dispatch({ type: "delete", id: task.id });
      try {
        const formData = new FormData();
        formData.set("id", task.id);
        await deleteTaskAction(formData);
      } catch {
        flashError(task.id);
      }
    });
  }

  function handleCreate(fields: EditableFields) {
    const label = labels.find((candidate) => candidate.id === fields.labelId);
    if (!label) return;
    startTransition(async () => {
      const tempId = `${PENDING_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const draft: Task = {
        id: tempId,
        title: fields.title,
        dueDate: fields.dueDate,
        status: "open",
        size: fields.size,
        notes: normalizeNotes(fields.notes),
        completedAt: null,
        label,
      };
      dispatch({ type: "add", task: draft });
      try {
        const formData = new FormData();
        formData.set("title", fields.title);
        formData.set("dueDate", fields.dueDate);
        formData.set("labelId", fields.labelId);
        formData.set("size", fields.size);
        formData.set("notes", fields.notes);
        await createTaskAction(formData);
      } catch {
        flashFailedDraft(draft);
      }
    });
  }

  // A successful delete removes the task the detail screen was showing out
  // from under it — `detailTask` simply goes null, falling through to the
  // stage below, with no separate "close" step needed: `mobileDetailTaskId`
  // is left stale rather than reset, harmlessly, since nothing renders off
  // it directly.
  const detailTask = mobileDetailTaskId
    ? (optimisticTasks.find((task) => task.id === mobileDetailTaskId) ?? null)
    : null;

  return (
    <>
      {/* `display: contents` rather than conditionally rendering
          `TwoPaneStage` at all: it owns its own pane-switch state
          (`showRight`), and swapping the whole component out while the
          detail screen is open would remount it on the way back, resetting
          that state — a Ranger who opened a task from the field log pane
          would land back on the Pokémon pane instead. Hidden via CSS, its
          state survives; `display: contents` (rather than `none`) when
          visible keeps `.stage` a direct flex child of `.app`, which the
          chrome layout depends on. */}
      <div style={{ display: detailTask ? "none" : "contents" }}>
        <TwoPaneStage
          leftLabel="the Pokémon"
          rightLabel="the field log"
          left={pokemonPane}
          right={
            <FieldLogPanel
              tasks={optimisticTasks}
              labels={labels}
              timeZone={timeZone}
              todayKey={todayKey}
              dailyTarget={dailyTarget}
              erroredId={erroredId}
              failedDraft={failedDraft}
              onComplete={handleComplete}
              onSave={handleSave}
              onDelete={handleDelete}
              onCreate={handleCreate}
              onOpenMobileDetail={setMobileDetailTaskId}
              onOpenAddSheet={() => setAddSheetOpen(true)}
            />
          }
        />
      </div>
      {detailTask && (
        <TaskDetailScreen
          key={detailTask.id}
          task={detailTask}
          labels={labels}
          errored={erroredId === detailTask.id}
          onClose={() => setMobileDetailTaskId(null)}
          onSave={(fields) => handleSave(detailTask, fields)}
          onComplete={() => handleComplete(detailTask)}
          onDelete={() => handleDelete(detailTask)}
        />
      )}
      {/* Rendered as a sibling of the stage, not inside `FieldLogPanel`'s
          pane: the sheet is `position: fixed` to cover the true viewport,
          and `.panes` (the pane it would otherwise sit inside) gains a CSS
          `transform` while the mobile pane-switcher shows the log pane —
          a `transform` on an ancestor turns `position: fixed` into "fixed
          to that ancestor" instead of the viewport. */}
      {addSheetOpen && (
        <AddTaskSheet
          labels={labels}
          onCancel={() => setAddSheetOpen(false)}
          onSave={(fields) => {
            setAddSheetOpen(false);
            handleCreate(fields);
          }}
        />
      )}
    </>
  );
}

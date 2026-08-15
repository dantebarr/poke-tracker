"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { ADD_FORM_HREF, FIELD_LOG_HREF, resolveFieldView, taskHref } from "@/app/(app)/chrome/navigation";
import { useOverlaySlot } from "@/app/(app)/chrome/overlay-slot";
import {
  completeTaskAction,
  createTaskAction,
  deleteTaskAction,
  reopenTaskAction,
  updateTaskAction,
} from "@/app/actions/task";
import { AddTaskSheet, FieldLogPanel } from "@/app/field-log-panel";
import { PENDING_ID_PREFIX } from "@/app/pending-task-id";
import { useSurface } from "@/app/responsive";
import { TaskDetailScreen } from "@/app/task-detail-screen";
import { type EditableFields, normalizeNotes } from "@/app/task-edit-fields";
import type { Label } from "@/lib/label/label";
import type { Task } from "@/lib/task/task";

/**
 * `reopen` is paired with `complete` rather than folded into `update` (#36).
 * `update` means "the Ranger changed the fields" and is handled by the save
 * path, which resolves a label to patch in; a status transition through it
 * would make one action mean two things. The patch is the inverse of
 * `complete`'s — the completing Pokémon is not part of the client-side Task
 * shape and is cleared server-side only.
 */
type TaskListAction =
  | { type: "add"; task: Task }
  | { type: "update"; id: string; patch: Partial<Task> }
  | { type: "complete"; id: string; completedAt: string }
  | { type: "reopen"; id: string }
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
    case "reopen":
      return state.map((task) =>
        task.id === action.id ? { ...task, status: "open" as const, completedAt: null } : task,
      );
    case "delete":
      return state.filter((task) => task.id !== action.id);
  }
}

/**
 * The field screen's client root (#28, split from `FieldLogPanel` by #29,
 * shrunk to the right pane's own content by #33): owns the Open task list's
 * optimistic state and every write — completion, edits, deletes, creation —
 * so the same mutations reach both surfaces a task can be viewed from: the
 * desktop field log's inline row and the mobile full-screen detail screen.
 * The two are siblings, not nested, because the mobile detail replaces the
 * *entire* two-pane stage rather than living inside one pane's scroll region
 * (mockup B's own `.detail` sits beside `.stage`, not inside it) — this
 * component is what picks between them, portalling the one that's showing
 * into the chrome layout's overlay slot (`useOverlaySlot`) since this
 * component itself renders only inside the right pane.
 *
 * The chrome layout (#21, restructured by #33) owns the stage, the left pane
 * and which pane a narrow screen is showing — this component no longer does;
 * see `resolveNavigation`'s `rightVisible` for where that answer moved.
 *
 * Completion is the one non-negotiable (#28's brief): the row moves the
 * instant the circle is clicked, `useOptimistic` reverts it automatically
 * the moment the transition settles (success or failure alike, since a
 * throw never reaches `revalidatePath`), and a failure gets a visible flash
 * on top of that revert rather than a silent snap-back.
 *
 * *Which* of those surfaces is showing is no longer state here (#32): the
 * open task and the add form are both search parameters, resolved by
 * `resolveFieldView`, so the device back gesture closes each of them because
 * each is real navigation. They are written with the native history API
 * rather than `useRouter`, which is what Next recommends for exactly this
 * case — these parameters select between content that is already loaded, so
 * a router navigation's refetch of the whole screen would buy nothing and
 * cost a round trip per pane switch.
 */
export function FieldScreen({
  tasks,
  labels,
  timeZone,
  todayKey,
  dailyTarget,
}: {
  tasks: Task[];
  labels: Label[];
  timeZone: string;
  todayKey: string;
  dailyTarget: number;
}) {
  const params = useSearchParams();
  const surface = useSurface();
  const [optimisticTasks, dispatch] = useOptimistic(tasks, reduceTasks);
  const [, startTransition] = useTransition();
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

  // The mirror of `handleComplete`, and it needs no new failure machinery:
  // `useOptimistic` puts the row back in "Logged today" the moment the
  // transition settles, and `flashError` marks it, exactly as a failed
  // completion is handled.
  function handleReopen(task: Task) {
    startTransition(async () => {
      dispatch({ type: "reopen", id: task.id });
      try {
        const formData = new FormData();
        formData.set("id", task.id);
        await reopenTaskAction(formData);
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

  const openTasks = optimisticTasks.filter((task) => task.status === "open");
  // Until the first effect runs there is no viewport to measure, and a
  // narrow screen is the one with something to hide: it is the surface where
  // an opened task covers the whole stage rather than expanding in place,
  // and that has to be right in the first paint of a link someone shared.
  // Getting it wrong the other way costs a wide screen one frame before a
  // row expands, with nothing on screen moving in the meantime.
  const view = resolveFieldView({ params, surface: surface ?? "narrow", openTasks });
  const detailTask = view.detailTaskId
    ? (optimisticTasks.find((task) => task.id === view.detailTaskId) ?? null)
    : null;
  const overlaySlot = useOverlaySlot();

  // True while there is a history entry of our own below this one — set by
  // opening an overlay, spent by leaving one, and cleared whenever no
  // overlay is showing, which is how a Ranger's own back gesture is
  // accounted for. A task reached by a shared link is the case this exists
  // for: nothing of ours sits underneath it.
  const pushedOverlay = useRef(false);
  const overlayShowing =
    view.detailTaskId !== null || view.expandedTaskId !== null || view.addSheetOpen || view.addEditorOpen;
  useEffect(() => {
    if (!overlayShowing) pushedOverlay.current = false;
  }, [overlayShowing]);

  function openOverlay(href: string) {
    pushedOverlay.current = true;
    window.history.pushState(null, "", href);
  }

  /**
   * Leaving an overlay any way other than the back gesture — Cancel, Save,
   * a delete — has to *pop* the entry that opened it, not replace it: the
   * replaced entry would still sit underneath, and the Ranger's next back
   * press would appear to do nothing. Popping is also what makes the back
   * gesture and Cancel agree about what happens, which is the point of both
   * being in the URL. The exception is an overlay we never pushed, reached
   * by a link straight into it, where there is nothing to pop and popping
   * would leave the app entirely.
   */
  function leaveOverlay() {
    if (pushedOverlay.current) {
      pushedOverlay.current = false;
      window.history.back();
      return;
    }
    window.history.replaceState(null, "", FIELD_LOG_HREF);
  }

  return (
    <>
      <FieldLogPanel
        tasks={optimisticTasks}
        labels={labels}
        timeZone={timeZone}
        todayKey={todayKey}
        dailyTarget={dailyTarget}
        erroredId={erroredId}
        failedDraft={failedDraft}
        expandedTaskId={view.expandedTaskId}
        addEditorOpen={view.addEditorOpen}
        onComplete={handleComplete}
        onReopen={handleReopen}
        onSave={handleSave}
        onDelete={handleDelete}
        onCreate={handleCreate}
        onOpenTask={(taskId) => openOverlay(taskHref(taskId))}
        onOpenAddForm={() => openOverlay(ADD_FORM_HREF)}
        onLeaveOverlay={leaveOverlay}
      />
      {/* Portalled into the chrome layout's overlay slot, not rendered here
          in place: the sheet and the task detail are both `position: fixed`
          to cover the true viewport, and this component renders inside the
          right pane, which gains a CSS `transform` while a narrow screen is
          showing it — a `transform` on an ancestor turns `position: fixed`
          into "fixed to that ancestor" instead of the viewport. The slot is
          a sibling of the stage, outside any transformed element, and
          `null` until the layout's ref callback has run — nothing to portal
          into on the very first render. */}
      {overlaySlot &&
        createPortal(
          <>
            {detailTask && (
              <TaskDetailScreen
                key={detailTask.id}
                task={detailTask}
                labels={labels}
                onCancel={leaveOverlay}
                onSave={(fields) => {
                  leaveOverlay();
                  handleSave(detailTask, fields);
                }}
                onDelete={() => {
                  leaveOverlay();
                  handleDelete(detailTask);
                }}
              />
            )}
            {view.addSheetOpen && (
              <AddTaskSheet
                labels={labels}
                todayKey={todayKey}
                onCancel={leaveOverlay}
                onSave={(fields) => {
                  leaveOverlay();
                  handleCreate(fields);
                }}
              />
            )}
          </>,
          overlaySlot,
        )}
    </>
  );
}

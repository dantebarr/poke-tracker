"use client";

import { useEffect, useRef, useState } from "react";

import { DeleteControl, TaskFieldChips } from "@/app/field-log-panel";
import { type EditableFields, useDebouncedTaskFields } from "@/app/task-edit-fields";
import type { Label } from "@/lib/label/label";
import type { Task } from "@/lib/task/task";

/**
 * The mobile task detail screen (#29): what a tapped row opens on a narrow
 * screen instead of the desktop's inline expander, ported from mockup B's
 * `.detail` (`docs/mockups/b/b2-forest.html`). `FieldScreen` renders this in
 * place of the whole two-pane stage — the mockup's own `.detail` sits beside
 * `.stage` as a sibling inside `.app`, not inside one pane's scroll region,
 * so a task takes over the entire screen rather than a slice of it.
 *
 * Editing reuses `useDebouncedTaskFields`, the same live-save behaviour the
 * desktop expander uses, so both surfaces persist a task the same way.
 *
 * Opening this screen pushes one history entry so the device back gesture
 * closes it (#29's acceptance criteria). Every way of leaving — the back
 * button (`goBack`), completing or deleting (`finishWith`), or the gesture
 * itself — ends in `history.back()`, so the stack never gains a dangling
 * forward entry regardless of which one a Ranger used.
 */
export function TaskDetailScreen({
  task,
  labels,
  errored,
  onClose,
  onSave,
  onComplete,
  onDelete,
}: {
  task: Task;
  labels: Label[];
  errored: boolean;
  onClose: () => void;
  onSave: (fields: EditableFields) => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const { fields, schedule, flush } = useDebouncedTaskFields(task, onSave);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    history.pushState({ taskDetail: task.id }, "");
    function handlePopState() {
      flush();
      onCloseRef.current();
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
    // `flush` has stable identity by design (task-edit-fields.ts) — safe to
    // close over without retriggering this effect.
  }, [task.id, flush]);

  function goBack() {
    flush();
    history.back();
  }

  // Complete/delete are terminal for this task, so any still-pending edit
  // must be saved *before* the terminal write fires — not after, which is
  // what plain `goBack()` here would do. Saving after would send a stray
  // `updateTaskAction` for a task that's already completed or gone, and on
  // delete that write has nothing left to land on.
  function finishWith(action: () => void) {
    flush();
    action();
    history.back();
  }

  return (
    <div className={`detail${errored ? " errored" : ""}`}>
      <div className="detailbar">
        <button type="button" className="back" aria-label="Back to the field log" onClick={goBack}>
          ←
        </button>
        <span className="pixel">Task detail</span>
      </div>
      <div className="detailbody">
        <input
          className="title"
          type="text"
          value={fields.title}
          onChange={(event) => schedule({ title: event.target.value })}
          aria-label="Title"
        />
        <textarea
          className="notes"
          placeholder="Notes (optional)"
          value={fields.notes}
          onChange={(event) => schedule({ notes: event.target.value })}
          aria-label="Notes"
        />
        <div className="chips">
          <TaskFieldChips
            dueDate={fields.dueDate}
            labelId={fields.labelId}
            size={fields.size}
            labels={labels}
            onDueChange={(value) => schedule({ dueDate: value })}
            onLabelChange={(value) => schedule({ labelId: value })}
            onSizeChange={(value) => schedule({ size: value })}
          />
        </div>
        <DeleteControl
          confirming={confirmingDelete}
          label="Delete task"
          confirmingWrapperClassName="editactions"
          onRequestConfirm={() => setConfirmingDelete(true)}
          onConfirm={() => finishWith(onDelete)}
          onCancel={() => setConfirmingDelete(false)}
        />
      </div>
      <div className="detailfoot">
        <button type="button" className="primary complete" onClick={() => finishWith(onComplete)}>
          Complete
        </button>
      </div>
    </div>
  );
}

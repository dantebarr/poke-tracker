"use client";

import { useEffect, useRef, useState } from "react";

import { DeleteControls, type PendingDelete } from "@/app/field-log/delete-controls";
import { TaskFieldChips } from "@/app/field-log/chips";
import { RecurrenceMarker } from "@/app/field-log/recurring-controls";
import { OVERLAY_OPENER_PROPS, useOverlayDismiss } from "@/app/overlay-dismiss";
import { type EditableFields, taskToFields, useTaskFields } from "@/app/task-edit-fields";
import type { Label } from "@/lib/label/label";
import { capitalise } from "@/lib/text";
import { effortPoints, type Task, type TaskSize } from "@/lib/task/task";

/**
 * What a task is worth, in the unit the header counts in: "+2", not "M". The
 * size itself stays reachable through the tooltip and the screen-reader name.
 */
function SizePill({ size }: { size: TaskSize }) {
  const points = effortPoints(size);
  return (
    <span className={`sz sz-${size}`} title={`${capitalise(size)} task, ${points} effort`} aria-label={`${capitalise(size)}, ${points} effort points`}>
      +{points}
    </span>
  );
}

// A task whose `createTaskAction` call failed — read-only, since there's no
// real row behind it to complete, edit or delete. Rendered only for the
// ~1.1s `flashFailedDraft` keeps it around; see `FieldScreen`'s doc comment
// on `failedDraft`.
export function FailedDraftRow({ task }: { task: Task }) {
  return (
    <div className="taskrow errored">
      <div className="rowhead">
        <span className="circle" aria-hidden="true" />
        <LabelTag label={task.label} />
        <span className="title">{task.title}</span>
        <SizePill size={task.size} />
      </div>
    </div>
  );
}

/**
 * A task logged today. Its circle is the reopen control (#36): the same
 * circle that completed the task sends it back to Open, which extends the
 * invariant `TaskDetailScreen` already documents — the row's circle is the
 * only place a task's doneness changes — rather than competing with it. No
 * confirmation: reopen is itself the recovery from a mis-tick, and a
 * mis-reopen costs one tap to complete again. The row stays untappable
 * otherwise; a done task still has no detail screen.
 */
export function DoneTaskRow({
  task,
  errored,
  celebrate,
  onReopen,
}: {
  task: Task;
  errored: boolean;
  /** Just completed: the check pops and the points float up. Purely visual, and dropped by the parent after ~1s. */
  celebrate: boolean;
  onReopen: () => void;
}) {
  return (
    <div className={`taskrow done${errored ? " errored" : ""}${celebrate ? " celebrate" : ""}`}>
      <div className="rowhead">
        <button
          type="button"
          className="circle check"
          aria-label={`Reopen "${task.title}"`}
          title="Reopen"
          onClick={onReopen}
        />
        <LabelTag label={task.label} muted />
        <span className="title">{task.title}</span>
        <SizePill size={task.size} />
        {celebrate && (
          <span className="floatpts" aria-hidden="true">
            +{effortPoints(task.size)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * An open task's row. Collapsed, it's a read-only summary; on desktop,
 * expanded gains an editable title and an expander with notes, due date,
 * label and size. Like the mobile detail screen, it is an explicit form:
 * nothing is written until Save, so changing the due date does not move the
 * task to another bucket while it is still being edited. On mobile, `expanded` is never
 * true: `resolveFieldView` only reports an expanded row for a wide screen,
 * so the `.expander` this row would show stays unreached rather than merely
 * hidden.
 */
export function OpenTaskRow({
  task,
  labels,
  expanded,
  errored,
  pending,
  lateText,
  onExpand,
  onCollapse,
  onComplete,
  onSave,
  onDelete,
  onDeleteRule,
}: {
  task: Task;
  labels: Label[];
  expanded: boolean;
  errored: boolean;
  pending: boolean;
  /** "2d late" for a task in the Overdue bucket, otherwise null. */
  lateText: string | null;
  onExpand: () => void;
  onCollapse: () => void;
  onComplete: () => void;
  onSave: (fields: EditableFields) => void;
  onDelete: () => void;
  onDeleteRule: () => void;
}) {
  const { fields, edit, reset } = useTaskFields(task);
  const [confirmingDelete, setConfirmingDelete] = useState<PendingDelete>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const wasExpanded = useRef(expanded);

  const stored = taskToFields(task);
  const dirty = (Object.keys(stored) as (keyof EditableFields)[]).some((key) => fields[key] !== stored[key]);
  const valid = fields.title.trim() !== "" && fields.dueDate !== "" && fields.labelId !== "";

  // Leaving before writing, like every other commit path: the row collapses
  // in place first, and only then does the saved due date move it.
  function save() {
    onCollapse();
    if (dirty && valid) onSave({ ...fields, title: fields.title.trim() });
  }

  /**
   * Escape, or a pointer landing outside the row, closes it (#34) and keeps
   * what was typed — the same rule the add form follows: walking away means
   * attention moved on, not that the edit was rejected. Cancel is the
   * explicit discard. A pointer that lands on another row (or any link) hands
   * off: the edit is saved, and leaving is left to whatever was clicked.
   *
   * Escape disarms a pending delete first and closes only on the second press.
   * The confirm pair is a loaded destructive control, and collapsing the row
   * out from under it reads as "did that just delete it?" even though it
   * didn't.
   */
  useOverlayDismiss({
    active: expanded,
    ref: rowRef,
    onDismiss: () => {
      if (confirmingDelete) {
        setConfirmingDelete(null);
        return;
      }
      save();
    },
    onHandOff: () => {
      if (dirty && valid) onSave({ ...fields, title: fields.title.trim() });
    },
  });

  // Local edit state resets only when the row *opens*: nothing is written
  // while it is expanded, so the row's due date, label and size stay exactly
  // where they were until Save — the task never jumps to another bucket
  // mid-edit.
  useEffect(() => {
    if (expanded && !wasExpanded.current) {
      reset(task);
      setConfirmingDelete(null);
    }
    wasExpanded.current = expanded;
  }, [expanded, task, reset]);

  return (
    <div ref={rowRef} className={`taskrow${expanded ? " expanded" : ""}${errored ? " errored" : ""}`}>
      {/* Marked as an opener only where it actually is one: a collapsed head
          is what takes a Ranger into a task, so an open overlay elsewhere
          hands its draft off to it rather than trying to leave at the same
          moment this row is trying to arrive. */}
      <div
        className="rowhead"
        onClick={!expanded && !pending ? onExpand : undefined}
        {...(!expanded && !pending ? OVERLAY_OPENER_PROPS : {})}
      >
        <button
          type="button"
          className="circle"
          aria-label={`Complete "${task.title}"`}
          title={pending ? "Saving…" : "Complete"}
          disabled={pending}
          onClick={(event) => {
            event.stopPropagation();
            onComplete();
          }}
        />
        <LabelTag label={task.label} />
        <input
          className="title"
          type="text"
          value={expanded ? fields.title : task.title}
          readOnly={!expanded}
          onChange={
            expanded
              ? (event) => {
                  edit({ title: event.target.value });
                }
              : undefined
          }
          onKeyDown={(event) => {
            if (event.key !== "Enter" || pending) return;
            event.preventDefault();
            if (expanded) {
              if (valid) save();
            } else {
              onExpand();
            }
          }}
          aria-label="Title"
        />
        {lateText && <span className="latechip">{lateText}</span>}
        <SizePill size={task.size} />
      </div>

      {expanded && (
        <div className="expander">
          {task.recurrence && <RecurrenceMarker recurrence={task.recurrence} />}
          <textarea
            className="notes"
            placeholder="Notes"
            value={fields.notes}
            onChange={(event) => edit({ notes: event.target.value })}
            aria-label="Notes"
          />
          <div className="chips">
            <TaskFieldChips
              dueDate={fields.dueDate}
              labelId={fields.labelId}
              size={fields.size}
              labels={labels}
              onDueChange={(value) => edit({ dueDate: value })}
              onLabelChange={(value) => edit({ labelId: value })}
              onSizeChange={(value) => edit({ size: value })}
            />
            <div className="editactions">
              <button type="button" className="ghostbtn" onClick={onCollapse}>
                Cancel
              </button>
              <button type="button" className="primary" disabled={!dirty || !valid} onClick={save}>
                Save
              </button>
              <DeleteControls
                recurring={task.recurrence !== null}
                confirming={confirmingDelete}
                label="Delete"
                onRequestConfirm={setConfirmingDelete}
                onDelete={onDelete}
                onDeleteRule={onDeleteRule}
                onCancel={() => setConfirmingDelete(null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// The colour is a stored value, not a style class name (label.ts) — the
// tag's solid fill for open tasks, dimmed for done ones (#28) since there's
// no separate stored "done" variant the way the mockup's fixed demo palette
// had one. `title` keeps the full name reachable behind the abbreviation
// (#26).
function LabelTag({ label, muted = false }: { label: Task["label"]; muted?: boolean }) {
  return (
    <span
      className="tag"
      title={label.name}
      style={{ backgroundColor: label.color, opacity: muted ? 0.55 : 1 }}
    >
      {label.abbreviation}
    </span>
  );
}

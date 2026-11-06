"use client";

import { useState } from "react";

import { TaskEditMenu } from "@/app/field-log/edit-menu";
import { DeleteControls, type PendingDelete } from "@/app/field-log/delete-controls";
import { RecurrenceMarker } from "@/app/field-log/recurring-controls";
import { useOverlayDismiss } from "@/app/overlay-dismiss";
import { type EditableFields, taskToFields, useTaskFields } from "@/app/task-edit-fields";
import type { Label } from "@/lib/label/label";
import type { Task } from "@/lib/task/task";

/**
 * The mobile task detail screen (#29, made an explicit form by #32): what a
 * tapped row opens on a narrow screen instead of the desktop's inline
 * expander, ported from mockup B's `.detail` — the mockup's own `.detail`
 * sits beside `.stage` as a sibling inside `.app`, not inside one pane's
 * scroll region, so a task takes over the entire screen rather than a slice
 * of it. `FieldScreen` portals this into the chrome layout's overlay slot
 * (#33) to get the same sibling-of-the-stage placement now that the layout,
 * not the field screen, owns the stage.
 *
 * Editing is committed by Save and by nothing else (`useTaskFields` without
 * a live save), so a Ranger can open a task, change their mind, and leave it
 * as it was. Every other way out — Cancel, the device back gesture, the home
 * arrow — discards what was typed, silently and without a confirmation.
 * That is the same footer the add form beside it has always had; the two now
 * work alike. Save applies the edit optimistically and leaves at once rather
 * than waiting on the network, so a failure has no screen of its own to
 * report on and flashes on the task's row in the field log instead — which
 * is where the Ranger now is.
 *
 * Which task is open is a search parameter, not state here (#32), so the
 * back gesture closes this screen because it is real navigation — the
 * hand-rolled `pushState` entry and `popstate` listener that used to
 * approximate that are gone, and with them the screen's own back arrow,
 * which Cancel now covers. Complete is gone too: the task row's circle is
 * the only place a task is completed, so no one has to wonder whether
 * completing also saved the edit they had open.
 */
export function TaskDetailScreen({
  task,
  labels,
  todayKey,
  onCancel,
  onSave,
  onDelete,
  onDeleteRule,
}: {
  task: Task;
  labels: Label[];
  todayKey: string;
  onCancel: () => void;
  onSave: (fields: EditableFields) => void;
  onDelete: () => void;
  onDeleteRule: () => void;
}) {
  const { fields, edit } = useTaskFields(task);
  const [confirmingDelete, setConfirmingDelete] = useState<PendingDelete>(null);
  const stored = taskToFields(task);
  const dirty = (Object.keys(stored) as (keyof EditableFields)[]).some((key) => fields[key] !== stored[key]);
  const valid = fields.title.trim() !== "" && fields.dueDate !== "" && fields.labelId !== "";

  /**
   * Escape leaves, and leaves the way Cancel does — discarding, per the
   * commit model in this component's own doc comment above (#34). No outside
   * pointer: this screen covers the whole viewport, so it has no outside.
   * Mostly it earns its keep on a tablet with a keyboard attached, where the
   * narrow surface and a real Escape key coexist.
   *
   * A pending delete is disarmed first and the screen closes only on a second
   * press, the same one-step-back the desktop row's expander does — a loaded
   * destructive control should not disappear alongside the thing it was
   * pointed at.
   */
  useOverlayDismiss({
    active: true,
    outsidePointer: false,
    onDismiss: () => {
      if (confirmingDelete) {
        setConfirmingDelete(null);
        return;
      }
      onCancel();
    },
  });

  return (
    // The root class is load-bearing beyond styling: globals.css's mobile
    // `.stage:has(~ .overlay-slot .detail)` rule hides the stage while this
    // is open, keyed off this exact class name. Renaming it needs a matching
    // update there, or the stage stops hiding behind an open task.
    <div className="detail">
      <div className="detailbar">
        <span className="pixel">Task detail</span>
      </div>
      <div className="detailbody">
        <div className="detailcard textbox">
          <input
            className="title"
            type="text"
            value={fields.title}
            onChange={(event) => edit({ title: event.target.value })}
            aria-label="Title"
          />
          {task.recurrence && <RecurrenceMarker recurrence={task.recurrence} />}
          <TaskEditMenu taskId={task.id} fields={fields} labels={labels} todayKey={todayKey} onChange={edit} />
        </div>
        <DeleteControls
          recurring={task.recurrence !== null}
          confirming={confirmingDelete}
          label="Delete task"
          confirmingWrapperClassName="editactions"
          onRequestConfirm={setConfirmingDelete}
          onDelete={onDelete}
          onDeleteRule={onDeleteRule}
          onCancel={() => setConfirmingDelete(null)}
        />
      </div>
      <div className="detailfoot">
        <button type="button" className="ghostbtn" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={!dirty || !valid}
          onClick={() => onSave({ ...fields, title: fields.title.trim() })}
        >
          Save changes
        </button>
      </div>
    </div>
  );
}

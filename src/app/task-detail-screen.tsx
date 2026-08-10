"use client";

import { useState } from "react";

import { DeleteControl, TaskFieldChips } from "@/app/field-log-panel";
import { type EditableFields, useTaskFields } from "@/app/task-edit-fields";
import type { Label } from "@/lib/label/label";
import type { Task } from "@/lib/task/task";

/**
 * The mobile task detail screen (#29, made an explicit form by #32): what a
 * tapped row opens on a narrow screen instead of the desktop's inline
 * expander, ported from mockup B's `.detail`
 * (`docs/mockups/b/b2-forest.html`). `FieldScreen` renders this in place of
 * the whole two-pane stage — the mockup's own `.detail` sits beside `.stage`
 * as a sibling inside `.app`, not inside one pane's scroll region, so a task
 * takes over the entire screen rather than a slice of it.
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
  onCancel,
  onSave,
  onDelete,
}: {
  task: Task;
  labels: Label[];
  onCancel: () => void;
  onSave: (fields: EditableFields) => void;
  onDelete: () => void;
}) {
  const { fields, edit } = useTaskFields(task);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <div className="detail">
      <div className="detailbar">
        <span className="pixel">Task detail</span>
      </div>
      <div className="detailbody">
        <input
          className="title"
          type="text"
          value={fields.title}
          onChange={(event) => edit({ title: event.target.value })}
          aria-label="Title"
        />
        <textarea
          className="notes"
          placeholder="Notes (optional)"
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
        </div>
        <DeleteControl
          confirming={confirmingDelete}
          label="Delete task"
          confirmingWrapperClassName="editactions"
          onRequestConfirm={() => setConfirmingDelete(true)}
          onConfirm={onDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      </div>
      <div className="detailfoot">
        <button type="button" className="ghostbtn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="primary" onClick={() => onSave(fields)}>
          Save
        </button>
      </div>
    </div>
  );
}

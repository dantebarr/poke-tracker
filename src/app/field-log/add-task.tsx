"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { TaskFieldChips } from "@/app/field-log/chips";
import { RepeatMenuLines, TaskEditMenu } from "@/app/field-log/edit-menu";
import { RecurringNote, RecurringOptions, RecurringToggle } from "@/app/field-log/recurring-controls";
import { useOverlayDismiss } from "@/app/overlay-dismiss";
import { newRecurringFields, describeRecurringForm, type NewTaskFields, type RecurringFields } from "@/app/recurring-fields";
import { dismissedDraftOutcome, newTaskFields } from "@/app/task-edit-fields";
import type { Label } from "@/lib/label/label";
import type { TaskSize } from "@/lib/task/task";

/**
 * The uncommitted-draft state a brand new task's form needs, shared between
 * the desktop add editor and the mobile add sheet — the same five fields and
 * the same validation rule (title, due date, label and size are the
 * schema's four required fields), kept as a hook rather than one component
 * styled two ways because the two forms are never on screen together and
 * each needs its own draft.
 *
 * Only the title starts empty: due date, label and size open on the defaults
 * `newTaskFields` picks (due today, top label, Small), so the common task is
 * a title and Save. They are ordinary draft state from there on, editable
 * like any other field, and the defaults are read once when the form opens —
 * a Ranger who has already changed the label doesn't have it moved back
 * under them mid-draft. Validation is unchanged and still guards the three:
 * the due date can be cleared, and a trainer with no labels yet has no
 * default label to start from.
 */
function useNewTaskDraft(defaults: { todayKey: string; labels: Label[] }) {
  const [initial] = useState(() => newTaskFields(defaults));
  const [title, setTitle] = useState(initial.title);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [labelId, setLabelId] = useState(initial.labelId);
  const [size, setSize] = useState<TaskSize>(initial.size);
  const [notes, setNotes] = useState(initial.notes);
  // The recurring half (#15), one piece of state rather than four: every part
  // of it is read together by `describeRecurringForm` and written together by
  // the pickers, and keeping it whole is what lets the day fields stay null —
  // "follow the date" — instead of being copied in as defaults.
  const [recurringFields, setRecurring] = useState<RecurringFields>(newRecurringFields);

  // Exactly `RecurringOptions`' own props, so both surfaces spread it in
  // rather than naming three more things apiece — the destructure below is
  // already the longest line in this file.
  const recurring = {
    fields: recurringFields,
    view: describeRecurringForm({ ...recurringFields, dueDate }),
    onChange: (patch: Partial<RecurringFields>) => setRecurring((current) => ({ ...current, ...patch })),
  };

  // Unchanged by recurring: a rule needs exactly the fields a task does, and
  // the date it starts from is the same field the chip was already holding.
  const valid = title.trim().length > 0 && dueDate !== "" && labelId !== "";

  function fields(): NewTaskFields {
    return { title: title.trim(), dueDate, labelId, size, notes, ...recurringFields };
  }

  return { title, setTitle, dueDate, setDueDate, labelId, setLabelId, size, setSize, notes, setNotes, recurring, valid, fields };
}

/**
 * The desktop pinned add control (#28): collapsed to a single dashed button
 * until clicked, so it never competes with the list beneath it — every
 * field is reachable without navigating away, and Save stays disabled until
 * title, due date, label and size are all set. Hidden on mobile in favour of
 * `AddTaskSheet` (#29): `UI-CONSTRAINTS.md` wants the add control within
 * one-handed thumb reach, which a control pinned above a scrolling list is
 * not.
 *
 * Enter saves, which is why the handler sits on the whole editor rather than
 * on the title alone: with every field but the title now opening on a
 * default, "type a title and press Enter" is the whole of the common capture,
 * and a Ranger who tabbed to a chip to change one of them shouldn't have to
 * go back to the title or reach for the mouse to commit. This is the desktop
 * surface `UI-CONSTRAINTS.md` asks to optimise for keyboard-driven speed;
 * the mobile sheet keeps its Save button as the only way through. Notes are
 * the exception — Enter there is a newline, as it is in any textarea, and
 * `submit` still refuses an invalid draft, so Enter on a blank title does
 * nothing rather than saving an untitled task.
 *
 * Escape and a pointer landing outside leave too (#34), and — unlike Cancel —
 * they *keep* a titled draft rather than throwing it away. The two exits are
 * meant to differ: pressing Cancel is a Ranger saying they reject this task,
 * while drifting away is a Ranger whose attention moved on, and only the
 * first of those is a reason to destroy what they typed. `dismissedDraftOutcome`
 * holds the rule. Landing on something that navigates on its own hands off
 * instead: the draft is still committed, but leaving is left to whatever was
 * clicked, so the address is only changed once.
 */
export function AddTaskEditor({
  labels,
  todayKey,
  onCreate,
  onLeaveOverlay,
}: {
  labels: Label[];
  todayKey: string;
  onCreate: (fields: NewTaskFields) => void;
  onLeaveOverlay: () => void;
}) {
  const { title, setTitle, dueDate, setDueDate, labelId, setLabelId, size, setSize, notes, setNotes, recurring, valid, fields } =
    useNewTaskDraft({ todayKey, labels });
  const editorRef = useRef<HTMLDivElement>(null);

  // One resolution per mount. `onLeaveOverlay` pops history asynchronously,
  // so this form is still mounted and still listening for a frame or two
  // after Save — long enough for a stray Escape in that window to commit the
  // same draft a second time. Every exit below goes through here, so whichever
  // one the Ranger reached first is the only one that counts.
  const resolved = useRef(false);

  function resolve(exit: () => void) {
    if (resolved.current) return;
    resolved.current = true;
    exit();
  }

  // Leaving before writing, the ordering every other commit path here uses:
  // the address is what unmounts this form, and the optimistic row wants to
  // land in a list that is already showing.
  function submit() {
    if (!valid) return;
    resolve(() => {
      onLeaveOverlay();
      onCreate(fields());
    });
  }

  function commitDraft() {
    if (dismissedDraftOutcome({ titleTyped: title.trim().length > 0, valid }) === "save") {
      onCreate(fields());
    }
  }

  useOverlayDismiss({
    active: true,
    ref: editorRef,
    onDismiss: () =>
      resolve(() => {
        onLeaveOverlay();
        commitDraft();
      }),
    onHandOff: () => resolve(commitDraft),
  });

  function submitOnEnter(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter") return;
    if (event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    submit();
  }

  return (
    <div ref={editorRef} className="addeditor" onKeyDown={submitOnEnter}>
      <div className="rowhead">
        <span className="circle ghost" aria-hidden="true" />
        <input
          className="title"
          type="text"
          placeholder="What needs doing?"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          autoFocus
          aria-label="Title"
        />
      </div>
      <div className="editbody">
        <TaskEditMenu
          taskId="new"
          fields={{ dueDate, labelId, size, notes }}
          labels={labels}
          todayKey={todayKey}
          dateLabel={recurring.view.dateLabel}
          onChange={(patch) => {
            if (patch.dueDate !== undefined) setDueDate(patch.dueDate);
            if (patch.labelId !== undefined) setLabelId(patch.labelId);
            if (patch.size !== undefined) setSize(patch.size);
            if (patch.notes !== undefined) setNotes(patch.notes);
          }}
          afterEffort={
            <RepeatMenuLines
              formId="new"
              fields={recurring.fields}
              view={recurring.view}
              onChange={recurring.onChange}
            />
          }
        />
        <div className="editfoot">
          <span className="editstate">{valid ? "" : "Give it a title to save"}</span>
          <button type="button" className="ghostbtn" onClick={() => resolve(onLeaveOverlay)}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={!valid} onClick={submit}>
            Add task
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The mobile add control's sheet (#29): rises from the bottom with the
 * title focused so a Ranger can start typing immediately — ported from
 * mockup B's `.sheet`. Same validation rule as the desktop editor, kept as a
 * separate component (rather than one editor styled two ways) because the
 * two forms are never on screen together and each has its own uncommitted
 * draft.
 *
 * Rendered by `FieldScreen`, not this panel: it uses `position: fixed` to
 * cover the true viewport, and this panel sits inside `.panes`, which gains
 * a CSS `transform` while a narrow screen is showing the log pane — a
 * `transform` on an ancestor turns `position: fixed` into "fixed to that
 * ancestor" instead of the viewport. `FieldScreen` portals it into the
 * chrome layout's overlay slot (#33), a sibling of the stage outside any
 * transformed element, same reasoning as why `TaskDetailScreen` replaces the
 * stage rather than living inside it.
 */
export function AddTaskSheet({
  labels,
  todayKey,
  onCancel,
  onSave,
}: {
  labels: Label[];
  todayKey: string;
  onCancel: () => void;
  onSave: (fields: NewTaskFields) => void;
}) {
  const { title, setTitle, dueDate, setDueDate, labelId, setLabelId, size, setSize, notes, setNotes, recurring, valid, fields } =
    useNewTaskDraft({ todayKey, labels });
  const [visible, setVisible] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Escape only (#34), for the tablet-with-a-keyboard case. No outside
  // pointer: the backdrop below already is one, and a second listener would
  // fire `leaveOverlay` twice for a single tap. Escape here means what the
  // backdrop means — discard — because this form, like the detail screen it
  // shares a footer with, has always committed only through Save.
  useOverlayDismiss({ active: true, outsidePointer: false, onDismiss: onCancel });

  // Mounted closed, then flipped open a frame later — a plain CSS
  // transition doesn't fire on a property's very first paint, so this is
  // what actually makes the sheet "rise from the bottom" (#29's brief)
  // rather than simply appear already in place.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    const focusTimer = setTimeout(() => titleRef.current?.focus(), 50);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(focusTimer);
    };
  }, []);

  function submit() {
    if (!valid) return;
    onSave(fields());
  }

  return (
    <>
      <div className={`sheet-backdrop${visible ? " open" : ""}`} onClick={onCancel} />
      <div className={`sheet textbox${visible ? " open" : ""}`}>
        <span className="handle" aria-hidden="true" />
        <input
          ref={titleRef}
          className="title"
          type="text"
          placeholder="Task title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Title"
        />
        <textarea
          className="notes"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          aria-label="Notes"
        />
        <div className="chips">
          <TaskFieldChips
            dueDate={dueDate}
            labelId={labelId}
            size={size}
            labels={labels}
            dateLabel={recurring.view.dateLabel}
            onDueChange={setDueDate}
            onLabelChange={setLabelId}
            onSizeChange={setSize}
          />
          <RecurringToggle fields={recurring.fields} onChange={recurring.onChange} />
          <RecurringOptions {...recurring} />
          <RecurringNote view={recurring.view} />
        </div>
        <button type="button" className="primary" disabled={!valid} onClick={submit}>
          Save
        </button>
      </div>
    </>
  );
}

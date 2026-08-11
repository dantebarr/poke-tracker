"use client";

import { useEffect, useRef, useState } from "react";

import { isPendingTaskId } from "@/app/pending-task-id";
import { type EditableFields, useTaskFields } from "@/app/task-edit-fields";
import { dayKeyInTimeZone, dayKeyToUtcDate } from "@/lib/day/day";
import type { Label } from "@/lib/label/label";
import { BUCKET_LABELS, BUCKET_ORDER, bucketOpenTasks, todayPoints } from "@/lib/task/dates";
import { TASK_SIZES, type Task, type TaskSize } from "@/lib/task/task";
import { capitalise } from "@/lib/text";

const HEADER_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const SIZE_ABBR: Record<TaskSize, string> = { small: "S", medium: "M", large: "L" };

/**
 * The field log (#28, given a mobile surface by #29): the right pane's Open
 * tasks, grouped by Bucket, plus today's completions. Every write — the
 * optimistic task list, completion, edits, deletes, creation — is owned by
 * `FieldScreen`, this panel's parent, since a task can also be edited from
 * the mobile detail screen (#29's `TaskDetailScreen`), a sibling of this
 * panel rather than a descendant. This component is purely "the list plus
 * the desktop add row and mobile add sheet".
 *
 * Opening a task is one thing a Ranger does, addressed one way (#32):
 * `onOpenTask` puts the task in the URL, and `expandedTaskId` comes back
 * only on a wide screen, where a row expands in place (`OpenTaskRow`'s own
 * `.expander`). On a narrow screen the same address instead swaps the entire
 * field screen for the full-screen detail — mockup B never draws an inline
 * expander on a narrow screen, and `UI-CONSTRAINTS.md` wants every field
 * comfortably reachable rather than folded into a cramped row. Neither this
 * panel nor the row it holds has to know which of those happened.
 */
export function FieldLogPanel({
  tasks,
  labels,
  timeZone,
  todayKey,
  dailyTarget,
  erroredId,
  failedDraft,
  expandedTaskId,
  addEditorOpen,
  onComplete,
  onSave,
  onDelete,
  onCreate,
  onOpenTask,
  onOpenAddForm,
  onLeaveOverlay,
}: {
  tasks: Task[];
  labels: Label[];
  timeZone: string;
  todayKey: string;
  dailyTarget: number;
  erroredId: string | null;
  failedDraft: Task | null;
  expandedTaskId: string | null;
  addEditorOpen: boolean;
  onComplete: (task: Task) => void;
  onSave: (task: Task, fields: EditableFields) => void;
  onDelete: (task: Task) => void;
  onCreate: (fields: EditableFields) => void;
  onOpenTask: (taskId: string) => void;
  onOpenAddForm: () => void;
  /** Closing an expanded row and cancelling the add editor are the same move: back to the plain field log. */
  onLeaveOverlay: () => void;
}) {
  // Always open on desktop regardless of this — the CSS that would hide
  // `.loggedrows` behind it only exists inside the mobile media query.
  const [loggedExpanded, setLoggedExpanded] = useState(false);

  function submitCreate(fields: EditableFields) {
    onLeaveOverlay();
    onCreate(fields);
  }

  const openTasks = tasks.filter((task) => task.status === "open");
  // Only today's completions — a day already settled has its own record in
  // the Logbook (the day ledger), an aggregate, not a raw task list, and
  // settlement runs up through yesterday on every visit (`settle-on-entry`),
  // so nothing completed before today is still waiting to be accounted for
  // here by the time this renders.
  const doneToday = tasks.filter(
    (task): task is Task & { completedAt: string } =>
      task.status === "done" &&
      task.completedAt !== null &&
      dayKeyInTimeZone(new Date(task.completedAt), timeZone) === todayKey,
  );
  // A still-flashing failed draft is folded back into the bucketed list —
  // purely for that one visible flash, never into the real task list, so it
  // can't count toward today's effort.
  const bucketSource =
    failedDraft && !openTasks.some((task) => task.id === failedDraft.id) ? [...openTasks, failedDraft] : openTasks;
  const buckets = bucketOpenTasks(bucketSource, todayKey);
  const points = todayPoints(tasks, timeZone, todayKey);
  const pct = Math.min(100, Math.round((points / dailyTarget) * 100));

  return (
    <section className="logpanel panel" aria-label="Field log">
      <div className="logtop">
        <span>Field log</span>
        <span className="date">{HEADER_DATE_FORMAT.format(dayKeyToUtcDate(todayKey)).toUpperCase()}</span>
        <span className="quota">
          <span>
            {points}/{dailyTarget}
          </span>
          <span className="track">
            <i style={{ width: `${pct}%` }} />
          </span>
        </span>
      </div>

      <div className="addrow">
        {addEditorOpen ? (
          <AddTaskEditor labels={labels} onCancel={onLeaveOverlay} onSave={submitCreate} />
        ) : (
          <button type="button" className="addbtn" onClick={onOpenAddForm}>
            + Add a task
          </button>
        )}
      </div>

      <div className="scroll">
        {openTasks.length === 0 ? (
          <p className="clearday">Nothing open. Clear day, Ranger.</p>
        ) : (
          BUCKET_ORDER.filter((bucket) => buckets[bucket].length > 0).map((bucket) => (
            <div key={bucket} className="bucket">
              <div className={`grouphead${bucket === "overdue" ? " late" : ""}`}>
                <span>{BUCKET_LABELS[bucket]}</span>
                <span className="count">{buckets[bucket].length}</span>
              </div>
              {buckets[bucket].map((task) =>
                task.id === failedDraft?.id ? (
                  <FailedDraftRow key={task.id} task={task} />
                ) : (
                  <OpenTaskRow
                    key={task.id}
                    task={task}
                    labels={labels}
                    expanded={expandedTaskId === task.id}
                    errored={erroredId === task.id}
                    pending={isPendingTaskId(task.id)}
                    onExpand={() => onOpenTask(task.id)}
                    onCollapse={onLeaveOverlay}
                    onComplete={() => {
                      if (expandedTaskId === task.id) onLeaveOverlay();
                      onComplete(task);
                    }}
                    onSave={(fields) => onSave(task, fields)}
                    onDelete={() => {
                      if (expandedTaskId === task.id) onLeaveOverlay();
                      onDelete(task);
                    }}
                  />
                ),
              )}
            </div>
          ))
        )}

        {doneToday.length > 0 && (
          <div className="bucket">
            <button
              type="button"
              className="grouphead loggedhead"
              onClick={() => setLoggedExpanded((expanded) => !expanded)}
              aria-expanded={loggedExpanded}
            >
              <span>Logged today</span>
              <span className="count">{doneToday.length}</span>
              <span className="chev" aria-hidden="true">
                {loggedExpanded ? "▴" : "▾"}
              </span>
            </button>
            <div className={`loggedrows${loggedExpanded ? " expanded" : ""}`}>
              {doneToday.map((task) => (
                <DoneTaskRow key={task.id} task={task} errored={erroredId === task.id} />
              ))}
            </div>
          </div>
        )}
      </div>

      <button type="button" className="fab" aria-label="Add a task" onClick={onOpenAddForm}>
        +
      </button>
    </section>
  );
}

// A task whose `createTaskAction` call failed — read-only, since there's no
// real row behind it to complete, edit or delete. Rendered only for the
// ~1.1s `flashFailedDraft` keeps it around; see `FieldScreen`'s doc comment
// on `failedDraft`.
function FailedDraftRow({ task }: { task: Task }) {
  return (
    <div className="taskrow errored">
      <div className="rowhead">
        <span className="circle" aria-hidden="true" />
        <LabelTag label={task.label} />
        <span className="title">{task.title}</span>
        <span className="sz">{SIZE_ABBR[task.size]}</span>
      </div>
    </div>
  );
}

function DoneTaskRow({ task, errored }: { task: Task; errored: boolean }) {
  return (
    <div className={`taskrow done${errored ? " errored" : ""}`}>
      <div className="rowhead">
        <span className="circle check" aria-hidden="true" />
        <LabelTag label={task.label} muted />
        <span className="title">{task.title}</span>
        <span className="sz">{SIZE_ABBR[task.size]}</span>
      </div>
    </div>
  );
}

/**
 * An open task's row. Collapsed, it's a read-only summary; on desktop,
 * expanded gains a live-editable title and an expander with notes, due
 * date, label and size — `useTaskFields` with a live save, the fast in-place
 * editing path, which #32 deliberately left alone when the mobile detail
 * screen became an explicit Cancel/Save form. On mobile, `expanded` is never
 * true: `resolveFieldView` only reports an expanded row for a wide screen,
 * so the `.expander` this row would show stays unreached rather than merely
 * hidden.
 */
function OpenTaskRow({
  task,
  labels,
  expanded,
  errored,
  pending,
  onExpand,
  onCollapse,
  onComplete,
  onSave,
  onDelete,
}: {
  task: Task;
  labels: Label[];
  expanded: boolean;
  errored: boolean;
  pending: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onComplete: () => void;
  onSave: (fields: EditableFields) => void;
  onDelete: () => void;
}) {
  const { fields, edit, reset, flush } = useTaskFields(task, onSave);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const wasExpanded = useRef(expanded);

  // Local edit state only resets when the row *opens* (guarded on the
  // collapsed→expanded transition) — never while it's already expanded, so
  // this component's own optimistic save further up the tree can't stomp on
  // keystrokes made after that save was scheduled.
  useEffect(() => {
    if (expanded && !wasExpanded.current) {
      reset(task);
      setConfirmingDelete(false);
    }
    wasExpanded.current = expanded;
  }, [expanded, task, reset]);

  // Flushes any still-pending debounce the moment the row leaves the
  // expanded state, whether that's a deliberate Close, a completion, or the
  // row being unmounted because a due-date edit just moved it to a
  // different Bucket's list.
  useEffect(() => {
    if (!expanded) return;
    return () => flush();
  }, [expanded, flush]);

  return (
    <div className={`taskrow${expanded ? " expanded" : ""}${errored ? " errored" : ""}`}>
      <div className="rowhead" onClick={!expanded && !pending ? onExpand : undefined}>
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
          onKeyDown={
            !expanded && !pending
              ? (event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onExpand();
                  }
                }
              : undefined
          }
          aria-label="Title"
        />
        <span className="sz">{SIZE_ABBR[task.size]}</span>
      </div>

      {expanded && (
        <div className="expander">
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
                Close
              </button>
              <DeleteControl
                confirming={confirmingDelete}
                label="Delete"
                onRequestConfirm={() => setConfirmingDelete(true)}
                onConfirm={onDelete}
                onCancel={() => setConfirmingDelete(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The uncommitted-draft state a brand new task's form needs, shared between
 * the desktop add editor and the mobile add sheet — the same five fields and
 * the same validation rule (title, due date, label and size are the
 * schema's four required fields), kept as a hook rather than one component
 * styled two ways because the two forms are never on screen together and
 * each needs its own draft.
 */
function useNewTaskDraft() {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [labelId, setLabelId] = useState("");
  const [size, setSize] = useState<TaskSize | "">("");
  const [notes, setNotes] = useState("");

  const valid = title.trim().length > 0 && dueDate !== "" && labelId !== "" && size !== "";

  function fields(): EditableFields {
    return { title: title.trim(), dueDate, labelId, size: size as TaskSize, notes };
  }

  return { title, setTitle, dueDate, setDueDate, labelId, setLabelId, size, setSize, notes, setNotes, valid, fields };
}

/**
 * The desktop pinned add control (#28): collapsed to a single dashed button
 * until clicked, so it never competes with the list beneath it — every
 * field is reachable without navigating away, and Save stays disabled until
 * title, due date, label and size are all set. Hidden on mobile in favour of
 * `AddTaskSheet` (#29): `UI-CONSTRAINTS.md` wants the add control within
 * one-handed thumb reach, which a control pinned above a scrolling list is
 * not.
 */
function AddTaskEditor({
  labels,
  onCancel,
  onSave,
}: {
  labels: Label[];
  onCancel: () => void;
  onSave: (fields: EditableFields) => void;
}) {
  const { title, setTitle, dueDate, setDueDate, labelId, setLabelId, size, setSize, notes, setNotes, valid, fields } =
    useNewTaskDraft();

  function submit() {
    if (!valid) return;
    onSave(fields());
  }

  return (
    <div className="addeditor">
      <div className="rowhead">
        <span className="circle ghost" aria-hidden="true" />
        <input
          className="title"
          type="text"
          placeholder="Task title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          autoFocus
          aria-label="Title"
        />
      </div>
      <div className="editbody">
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
            allowBlank
            onDueChange={setDueDate}
            onLabelChange={setLabelId}
            onSizeChange={setSize}
          />
          <div className="editactions">
            <button type="button" className="ghostbtn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="primary" disabled={!valid} onClick={submit}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The mobile add control's sheet (#29): rises from the bottom with the
 * title focused so a Ranger can start typing immediately — ported from
 * mockup B's `.sheet` (`docs/mockups/b/b2-forest.html`). Same validation
 * rule as the desktop editor, kept as a separate component (rather than one
 * editor styled two ways) because the two forms are never on screen
 * together and each has its own uncommitted draft.
 *
 * Rendered by `FieldScreen`, not this panel: it uses `position: fixed` to
 * cover the true viewport, and this panel sits inside `.panes`, which gains
 * a CSS `transform` while a narrow screen is showing the log pane — a
 * `transform` on an ancestor turns `position: fixed` into "fixed to that
 * ancestor" instead of the viewport. `FieldScreen` renders it as a sibling
 * of the two-pane stage, outside any transformed element, same reasoning as
 * why `TaskDetailScreen` replaces the stage rather than living inside it.
 */
export function AddTaskSheet({
  labels,
  onCancel,
  onSave,
}: {
  labels: Label[];
  onCancel: () => void;
  onSave: (fields: EditableFields) => void;
}) {
  const { title, setTitle, dueDate, setDueDate, labelId, setLabelId, size, setSize, notes, setNotes, valid, fields } =
    useNewTaskDraft();
  const [visible, setVisible] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

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
            allowBlank
            onDueChange={setDueDate}
            onLabelChange={setLabelId}
            onSizeChange={setSize}
          />
        </div>
        <button type="button" className="primary" disabled={!valid} onClick={submit}>
          Save
        </button>
      </div>
    </>
  );
}

/**
 * The delete control shared between an open row's desktop expander and the
 * mobile task detail screen (#29's `TaskDetailScreen`): a single button that
 * turns into a confirm/cancel pair rather than deleting on the first tap.
 * `confirmingWrapperClassName` wraps only the confirm/cancel pair — the
 * detail screen needs `.editactions` there for the same spacing the row's
 * expander already gets from its own, always-present `.editactions` div;
 * the row passes nothing, since the pair renders straight into that div.
 */
export function DeleteControl({
  confirming,
  label,
  confirmingWrapperClassName,
  onRequestConfirm,
  onConfirm,
  onCancel,
}: {
  confirming: boolean;
  label: string;
  confirmingWrapperClassName?: string;
  onRequestConfirm: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!confirming) {
    return (
      <button type="button" className="delbtn" onClick={onRequestConfirm}>
        {label}
      </button>
    );
  }

  const pair = (
    <>
      <button type="button" className="delbtn" onClick={onConfirm}>
        Confirm delete
      </button>
      <button type="button" className="ghostbtn" onClick={onCancel}>
        Cancel
      </button>
    </>
  );
  return confirmingWrapperClassName ? <div className={confirmingWrapperClassName}>{pair}</div> : pair;
}

/**
 * The due/label/size chip trio, shared between the desktop add editor, the
 * mobile add sheet, an open row's desktop expander, and the mobile task
 * detail screen (#29's `TaskDetailScreen`). `allowBlank` is the one
 * difference the two add forms need over the other two callers: they start
 * with nothing chosen and need a "—" placeholder option to hold that state,
 * while an existing task's fields are never blank.
 */
export function TaskFieldChips({
  dueDate,
  labelId,
  size,
  labels,
  allowBlank = false,
  onDueChange,
  onLabelChange,
  onSizeChange,
}: {
  dueDate: string;
  labelId: string;
  size: TaskSize | "";
  labels: Label[];
  allowBlank?: boolean;
  onDueChange: (value: string) => void;
  onLabelChange: (value: string) => void;
  onSizeChange: (value: TaskSize) => void;
}) {
  return (
    <>
      <label className="chip">
        Due
        <input type="date" value={dueDate} onChange={(event) => onDueChange(event.target.value)} aria-label="Due date" />
      </label>
      <label className="chip">
        Label
        <select value={labelId} onChange={(event) => onLabelChange(event.target.value)} aria-label="Label">
          {allowBlank && <option value="">—</option>}
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </select>
      </label>
      <label className="chip">
        Size
        <select
          value={size}
          onChange={(event) => onSizeChange(event.target.value as TaskSize)}
          aria-label="Size"
        >
          {allowBlank && <option value="">—</option>}
          {TASK_SIZES.map((sizeOption) => (
            <option key={sizeOption} value={sizeOption}>
              {capitalise(sizeOption)}
            </option>
          ))}
        </select>
      </label>
    </>
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

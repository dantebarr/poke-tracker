"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";

import { completeTaskAction, createTaskAction, deleteTaskAction, updateTaskAction } from "@/app/actions/task";
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

// A synthetic id for a task that only exists optimistically, still waiting
// on `createTaskAction` to hand back the real one — never a real database
// id, so any control that would send a write for this id (complete, edit,
// delete) must refuse to fire while it's still pending.
const PENDING_ID_PREFIX = "pending-";
function isPendingTaskId(id: string): boolean {
  return id.startsWith(PENDING_ID_PREFIX);
}

// Matches the server's own `notesField` (actions/task.ts): blank or
// whitespace-only notes are `null`, not an empty string, so the optimistic
// patch never disagrees with what the server is about to store.
function normalizeNotes(notes: string): string | null {
  const trimmed = notes.trim();
  return trimmed === "" ? null : trimmed;
}

type EditableFields = {
  title: string;
  notes: string;
  dueDate: string;
  labelId: string;
  size: TaskSize;
};

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
 * The field log (#28): the right pane's Open tasks, grouped by Bucket, plus
 * today's completions. This is the app's first client component with real
 * state — every write still goes through the same server actions the old
 * panel used, but they're called directly rather than bound to a
 * `<form action>`, so completion, edits and deletes can be optimistic.
 *
 * Completion is the one non-negotiable (#28's brief): the row moves the
 * instant the circle is clicked, `useOptimistic` reverts it automatically
 * the moment the transition settles (success or failure alike, since a
 * throw never reaches `revalidatePath`), and a failure gets a visible flash
 * on top of that revert rather than a silent snap-back.
 *
 * Edits save in place, debounced, with no Save button to forget — see
 * `OpenTaskRow`. Desktop only (#28's brief); the mobile field log is its
 * own ticket and still gets this same unstyled content through the pane
 * shell in the meantime.
 */
export function FieldLogPanel({
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
  const [optimisticTasks, dispatch] = useOptimistic(tasks, reduceTasks);
  const [, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingOpen, setAddingOpen] = useState(false);
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
    if (expandedId === task.id) setExpandedId(null);
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
    if (expandedId === task.id) setExpandedId(null);
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
    setAddingOpen(false);
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
  // Only today's completions — a day already settled has its own record in
  // the Logbook (the day ledger), an aggregate, not a raw task list, and
  // settlement runs up through yesterday on every visit (`settle-on-entry`),
  // so nothing completed before today is still waiting to be accounted for
  // here by the time this renders.
  const doneToday = optimisticTasks.filter(
    (task): task is Task & { completedAt: string } =>
      task.status === "done" &&
      task.completedAt !== null &&
      dayKeyInTimeZone(new Date(task.completedAt), timeZone) === todayKey,
  );
  // A still-flashing failed draft is folded back into the bucketed list —
  // purely for that one visible flash, never into `optimisticTasks` itself,
  // so it can't count toward today's effort.
  const bucketSource =
    failedDraft && !openTasks.some((task) => task.id === failedDraft.id) ? [...openTasks, failedDraft] : openTasks;
  const buckets = bucketOpenTasks(bucketSource, todayKey);
  const points = todayPoints(optimisticTasks, timeZone, todayKey);
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
        {addingOpen ? (
          <AddTaskEditor labels={labels} onCancel={() => setAddingOpen(false)} onSave={handleCreate} />
        ) : (
          <button
            type="button"
            className="addbtn"
            onClick={() => {
              setExpandedId(null);
              setAddingOpen(true);
            }}
          >
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
                    expanded={expandedId === task.id}
                    errored={erroredId === task.id}
                    pending={isPendingTaskId(task.id)}
                    onExpand={() => {
                      setAddingOpen(false);
                      setExpandedId(task.id);
                    }}
                    onCollapse={() => setExpandedId(null)}
                    onComplete={() => handleComplete(task)}
                    onSave={(fields) => handleSave(task, fields)}
                    onDelete={() => handleDelete(task)}
                  />
                ),
              )}
            </div>
          ))
        )}

        {doneToday.length > 0 && (
          <div className="bucket">
            <div className="grouphead">
              <span>Logged today</span>
              <span className="count">{doneToday.length}</span>
            </div>
            {doneToday.map((task) => (
              <DoneTaskRow key={task.id} task={task} errored={erroredId === task.id} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// A task whose `createTaskAction` call failed — read-only, since there's no
// real row behind it to complete, edit or delete. Rendered only for the
// ~1.1s `flashFailedDraft` keeps it around; see the `failedDraft` doc
// comment in `FieldLogPanel`.
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
 * An open task's row. Collapsed, it's a read-only summary; expanded, the
 * same row header gains a live-editable title and an expander with notes,
 * due date, label and size — every change debounced (600ms of quiet) before
 * it reaches `onSave`, so a title typed character by character is one write,
 * not one per keystroke (UI-CONSTRAINTS.md's complaint about the mockup's
 * own per-keystroke model).
 *
 * Local edit state only resets when the row *opens* (the effect below,
 * guarded on the collapsed→expanded transition) — never while it's already
 * expanded, so this component's own optimistic save further up the tree
 * can't stomp on keystrokes made after that save was scheduled. A second
 * effect flushes any still-pending debounce the moment the row leaves the
 * expanded state, whether that's a deliberate Close, a completion, or the
 * row being unmounted because a due-date edit just moved it to a different
 * Bucket's list.
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
  const [editTitle, setEditTitle] = useState(task.title);
  const [editNotes, setEditNotes] = useState(task.notes ?? "");
  const [editDue, setEditDue] = useState(task.dueDate);
  const [editLabelId, setEditLabelId] = useState(task.label.id);
  const [editSize, setEditSize] = useState<TaskSize>(task.size);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const wasExpanded = useRef(expanded);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors the five edit-field states for the debounce timer and the
  // flush-on-close effect below, both of which need the latest values
  // outside of render — refs are updated from effects here, never from
  // render itself (`schedule` merges into it from an event handler, which
  // is likewise outside render).
  const fieldsRef = useRef<EditableFields>({
    title: task.title,
    notes: task.notes ?? "",
    dueDate: task.dueDate,
    labelId: task.label.id,
    size: task.size,
  });
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onSaveRef.current = onSave;
  });

  useEffect(() => {
    if (expanded && !wasExpanded.current) {
      setEditTitle(task.title);
      setEditNotes(task.notes ?? "");
      setEditDue(task.dueDate);
      setEditLabelId(task.label.id);
      setEditSize(task.size);
      setConfirmingDelete(false);
      fieldsRef.current = {
        title: task.title,
        notes: task.notes ?? "",
        dueDate: task.dueDate,
        labelId: task.label.id,
        size: task.size,
      };
    }
    wasExpanded.current = expanded;
  }, [expanded, task]);

  useEffect(() => {
    if (!expanded) return;
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        onSaveRef.current(fieldsRef.current);
      }
    };
  }, [expanded]);

  function schedule(next: Partial<EditableFields>) {
    fieldsRef.current = { ...fieldsRef.current, ...next };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      onSaveRef.current(fieldsRef.current);
    }, 600);
  }

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
          value={expanded ? editTitle : task.title}
          readOnly={!expanded}
          onChange={
            expanded
              ? (event) => {
                  const value = event.target.value;
                  setEditTitle(value);
                  schedule({ title: value });
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
            value={editNotes}
            onChange={(event) => {
              const value = event.target.value;
              setEditNotes(value);
              schedule({ notes: value });
            }}
            aria-label="Notes"
          />
          <div className="chips">
            <TaskFieldChips
              dueDate={editDue}
              labelId={editLabelId}
              size={editSize}
              labels={labels}
              onDueChange={(value) => {
                setEditDue(value);
                schedule({ dueDate: value });
              }}
              onLabelChange={(value) => {
                setEditLabelId(value);
                schedule({ labelId: value });
              }}
              onSizeChange={(value) => {
                setEditSize(value);
                schedule({ size: value });
              }}
            />
            <div className="editactions">
              <button type="button" className="ghostbtn" onClick={onCollapse}>
                Close
              </button>
              {confirmingDelete ? (
                <>
                  <button type="button" className="delbtn" onClick={onDelete}>
                    Confirm delete
                  </button>
                  <button type="button" className="ghostbtn" onClick={() => setConfirmingDelete(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="delbtn" onClick={() => setConfirmingDelete(true)}>
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The pinned add control (#28): collapsed to a single dashed button until
 * clicked, so it never competes with the list beneath it — every field is
 * reachable without navigating away, and Save stays disabled until title,
 * due date, label and size are all set (the schema's four required fields).
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
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [labelId, setLabelId] = useState("");
  const [size, setSize] = useState<TaskSize | "">("");
  const [notes, setNotes] = useState("");

  const valid = title.trim().length > 0 && dueDate !== "" && labelId !== "" && size !== "";

  function submit() {
    if (!valid) return;
    onSave({ title: title.trim(), dueDate, labelId, size: size as TaskSize, notes });
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
 * The due/label/size chip trio, shared between the add editor and an open
 * row's expander (#28's code review flagged the pre-extraction duplicate).
 * `allowBlank` is the one difference between the two callers: the add
 * editor starts with nothing chosen and needs a "—" placeholder option to
 * hold that state, while an existing task's fields are never blank.
 */
function TaskFieldChips({
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

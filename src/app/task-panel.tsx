import {
  completeTaskAction,
  deleteTaskAction,
  updateTaskAction,
} from "@/app/actions/task";
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  bucketOpenTasks,
  getBucket,
  groupDoneByDay,
  humanizeDueDate,
} from "@/lib/task/dates";
import type { Label } from "@/lib/label/label";
import { TASK_SIZES, type Task } from "@/lib/task/task";
import { capitalise } from "@/lib/text";

/** A `<form action>` must return `void`; both the task panel and the create-task panel wrap their server actions in one of these to discard the return value. */
export type FormAction = (formData: FormData) => Promise<void>;

/**
 * The trainer's tasks: open ones grouped into urgency buckets, with controls
 * to complete, edit or delete each; done ones collapsed out of the way,
 * read-only. Done is terminal (ADR-0002) — no control here can reach a done
 * row, and row-level security refuses the underlying writes regardless.
 * Creation lives in its own left-column panel (#14) — this one is the list.
 *
 * Every form here works before hydration: completing, editing and deleting
 * are plain `<form action>`s, and the edit and delete-confirmation
 * disclosures are native `<details>` elements, not client state.
 *
 * Overdue is the only alarm state (#7's acceptance criteria) — Today gets no
 * competing accent of its own.
 */
export function TaskPanel({
  tasks,
  labels,
  timeZone,
  todayKey,
  className = "",
}: {
  tasks: Task[];
  labels: Label[];
  timeZone: string;
  todayKey: string;
  className?: string;
}) {
  // `updateTaskAction` and `completeTaskAction` return the changed task —
  // useful to callers that need it (the tests do). A `<form action>` must
  // return `void`, so each is wrapped here to discard that value, the same
  // way the settings page wraps the label actions. `deleteTaskAction`
  // already returns `void` and needs no wrapper.
  async function submitUpdateTask(formData: FormData) {
    "use server";
    await updateTaskAction(formData);
  }
  async function submitCompleteTask(formData: FormData) {
    "use server";
    await completeTaskAction(formData);
  }

  const openTasks = tasks.filter((task) => task.status === "open");
  // Done is terminal (ADR-0002) and the backfill guarantees `completed_at`
  // for every done row, so this narrows `completedAt` for `groupDoneByDay`
  // rather than merely filtering.
  const doneTasks = tasks.filter(
    (task): task is Task & { completedAt: string } => task.status === "done" && task.completedAt !== null,
  );
  const buckets = bucketOpenTasks(openTasks, todayKey);
  const doneGroups = groupDoneByDay(doneTasks, timeZone, todayKey);

  return (
    <section className={`rounded-lg border border-border bg-surface p-6 ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Tasks</h2>
        <span className="font-mono text-xs text-muted">{openTasks.length} open</span>
      </div>

      {openTasks.length === 0 ? (
        <p className="mt-4 rounded-md border border-border px-4 py-6 text-center text-sm text-muted">
          Nothing open — clear day.
        </p>
      ) : (
        BUCKET_ORDER.filter((bucket) => buckets[bucket].length > 0).map((bucket) => (
          <div key={bucket} className="mt-4">
            <h3
              className={`mb-2 flex items-baseline gap-2 font-mono text-xs uppercase tracking-widest ${
                bucket === "overdue" ? "text-urgent" : "text-muted"
              }`}
            >
              {BUCKET_LABELS[bucket]}
              <span className="text-muted/70">{buckets[bucket].length}</span>
            </h3>
            <ul className="flex flex-col gap-2">
              {buckets[bucket].map((task) => (
                <OpenTaskRow
                  key={task.id}
                  task={task}
                  todayKey={todayKey}
                  labels={labels}
                  onComplete={submitCompleteTask}
                  onUpdate={submitUpdateTask}
                />
              ))}
            </ul>
          </div>
        ))
      )}

      {doneTasks.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer font-mono text-xs uppercase tracking-widest text-muted">
            Done <span className="text-muted/70">{doneTasks.length}</span>
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            {doneGroups.map((group) => (
              <div key={group.key}>
                <h4 className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
                  {group.label} <span className="text-muted/70">{group.tasks.length}</span>
                </h4>
                <ul className="flex flex-col gap-2">
                  {group.tasks.map((task) => (
                    <DoneTaskRow key={task.id} task={task} todayKey={todayKey} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function DoneTaskRow({ task, todayKey }: { task: Task; todayKey: string }) {
  return (
    <li className="rounded-lg border border-border p-3 opacity-50">
      <div className="flex items-baseline justify-between gap-2">
        <LabelChip label={task.label} />
        <span className="shrink-0 font-mono text-[0.7rem] uppercase tracking-wide text-muted">
          {humanizeDueDate(task.dueDate, todayKey, true)}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-muted line-through">{task.title}</p>
      <p className="mt-1 text-xs text-muted">{capitalise(task.size)}</p>
    </li>
  );
}

function OpenTaskRow({
  task,
  todayKey,
  labels,
  onComplete,
  onUpdate,
}: {
  task: Task;
  todayKey: string;
  labels: Label[];
  onComplete: FormAction;
  onUpdate: FormAction;
}) {
  const dueDateClass = getBucket(task.dueDate, todayKey) === "overdue" ? "text-urgent" : "text-muted";

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <LabelChip label={task.label} />
        <span className={`shrink-0 font-mono text-[0.7rem] uppercase tracking-wide ${dueDateClass}`}>
          {humanizeDueDate(task.dueDate, todayKey)}
        </span>
      </div>
      <p className="mt-1.5 text-sm">{task.title}</p>
      <p className="mt-1 text-xs text-muted">{capitalise(task.size)}</p>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <form action={onComplete}>
          <input type="hidden" name="id" value={task.id} />
          <button
            type="submit"
            className="rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
          >
            Complete
          </button>
        </form>

        <details>
          <summary className="cursor-pointer text-xs text-accent underline underline-offset-4">
            Edit
          </summary>
          <form action={onUpdate} className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="id" value={task.id} />
            <input
              type="text"
              name="title"
              defaultValue={task.title}
              required
              aria-label="Title"
              className="rounded-md border border-border px-2 py-1 text-sm focus:border-accent"
            />
            <input
              type="date"
              name="dueDate"
              defaultValue={task.dueDate}
              required
              aria-label="Due date"
              className="rounded-md border border-border px-2 py-1 text-sm focus:border-accent"
            />
            <select
              name="labelId"
              defaultValue={task.label.id}
              aria-label="Label"
              className="rounded-md border border-border px-2 py-1 text-sm focus:border-accent"
            >
              {labels.map((label) => (
                <option key={label.id} value={label.id}>
                  {label.name}
                </option>
              ))}
            </select>
            <select
              name="size"
              defaultValue={task.size}
              aria-label="Size"
              className="rounded-md border border-border px-2 py-1 text-sm focus:border-accent"
            >
              {TASK_SIZES.map((size) => (
                <option key={size} value={size}>
                  {capitalise(size)}
                </option>
              ))}
            </select>
            <textarea
              name="notes"
              defaultValue={task.notes ?? ""}
              placeholder="Notes"
              aria-label="Notes"
              className="rounded-md border border-border px-2 py-1 text-sm focus:border-accent"
            />
            <button
              type="submit"
              className="self-start rounded-md border border-border px-3 py-1 text-xs font-medium transition-colors hover:border-accent hover:text-accent"
            >
              Save
            </button>
          </form>
        </details>

        <details>
          <summary className="cursor-pointer text-xs text-caution underline underline-offset-4">
            Delete
          </summary>
          <form action={deleteTaskAction} className="mt-2">
            <input type="hidden" name="id" value={task.id} />
            <button type="submit" className="text-xs text-urgent underline underline-offset-4">
              Confirm delete
            </button>
          </form>
        </details>
      </div>
    </li>
  );
}

// The colour is a stored value, not a style class name (label.ts) — an
// alpha-suffixed hex for the chip's tint, the bare hex for its text.
function LabelChip({ label }: { label: { name: string; color: string } }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 font-mono text-[0.7rem] uppercase tracking-wide"
      style={{ backgroundColor: `${label.color}1A`, color: label.color }}
    >
      {label.name}
    </span>
  );
}

import {
  completeTaskAction,
  createTaskAction,
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
import type { Task, TaskSize } from "@/lib/task/task";
import { capitalise } from "@/lib/text";

const SIZES: TaskSize[] = ["small", "medium", "large"];

/**
 * The trainer's tasks: open ones grouped into urgency buckets, with controls
 * to complete, edit or delete each; done ones collapsed out of the way,
 * read-only. Done is terminal (ADR-0002) — no control here can reach a done
 * row, and row-level security refuses the underlying writes regardless.
 *
 * Every form here works before hydration: completing, editing and deleting
 * are plain `<form action>`s, and the edit and delete-confirmation
 * disclosures are native `<details>` elements, not client state.
 *
 * Overdue is the only alarm state (#7's acceptance criteria) — Today gets no
 * competing accent of its own.
 */
export function TaskPanel({ tasks, labels }: { tasks: Task[]; labels: Label[] }) {
  // `createTaskAction`, `updateTaskAction` and `completeTaskAction` return
  // the changed task — useful to callers that need it (the tests do). A
  // `<form action>` must return `void`, so each is wrapped here to discard
  // that value, the same way the settings page wraps the label actions.
  // `deleteTaskAction` already returns `void` and needs no wrapper.
  async function submitCreateTask(formData: FormData) {
    "use server";
    await createTaskAction(formData);
  }
  async function submitUpdateTask(formData: FormData) {
    "use server";
    await updateTaskAction(formData);
  }
  async function submitCompleteTask(formData: FormData) {
    "use server";
    await completeTaskAction(formData);
  }

  const today = new Date();
  const openTasks = tasks.filter((task) => task.status === "open");
  // Done is terminal (ADR-0002) and the backfill guarantees `completed_at`
  // for every done row, so this narrows `completedAt` for `groupDoneByDay`
  // rather than merely filtering.
  const doneTasks = tasks.filter(
    (task): task is Task & { completedAt: string } => task.status === "done" && task.completedAt !== null,
  );
  const buckets = bucketOpenTasks(openTasks, today);
  const doneGroups = groupDoneByDay(doneTasks, today);

  return (
    <section className="rounded-lg border border-black/10 p-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-black/60">Tasks</h2>
        <span className="font-mono text-xs text-black/60">{openTasks.length} open</span>
      </div>

      {openTasks.length === 0 ? (
        <p className="mt-4 rounded-md border border-black/10 px-4 py-6 text-center text-sm text-black/60">
          Nothing open — clear day.
        </p>
      ) : (
        BUCKET_ORDER.filter((bucket) => buckets[bucket].length > 0).map((bucket) => (
          <div key={bucket} className="mt-4">
            <h3
              className={`mb-2 flex items-baseline gap-2 font-mono text-xs uppercase tracking-widest ${
                bucket === "overdue" ? "text-red-700" : "text-black/60"
              }`}
            >
              {BUCKET_LABELS[bucket]}
              <span className="text-black/40">{buckets[bucket].length}</span>
            </h3>
            <ul className="flex flex-col gap-2">
              {buckets[bucket].map((task) => (
                <OpenTaskRow
                  key={task.id}
                  task={task}
                  today={today}
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
          <summary className="cursor-pointer font-mono text-xs uppercase tracking-widest text-black/60">
            Done <span className="text-black/40">{doneTasks.length}</span>
          </summary>
          <div className="mt-3 flex flex-col gap-4">
            {doneGroups.map((group) => (
              <div key={group.key}>
                <h4 className="mb-2 font-mono text-xs uppercase tracking-widest text-black/60">
                  {group.label} <span className="text-black/40">{group.tasks.length}</span>
                </h4>
                <ul className="flex flex-col gap-2">
                  {group.tasks.map((task) => (
                    <DoneTaskRow key={task.id} task={task} today={today} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}

      <CreateTaskForm labels={labels} onCreate={submitCreateTask} />
    </section>
  );
}

function DoneTaskRow({ task, today }: { task: Task; today: Date }) {
  return (
    <li className="rounded-lg border border-black/10 p-3 opacity-50">
      <div className="flex items-baseline justify-between gap-2">
        <LabelChip label={task.label} />
        <span className="shrink-0 font-mono text-[0.7rem] uppercase tracking-wide text-black/60">
          {humanizeDueDate(task.dueDate, today, true)}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-black/60 line-through">{task.title}</p>
      <p className="mt-1 text-xs text-black/60">{capitalise(task.size)}</p>
    </li>
  );
}

type FormAction = (formData: FormData) => Promise<void>;

function OpenTaskRow({
  task,
  today,
  labels,
  onComplete,
  onUpdate,
}: {
  task: Task;
  today: Date;
  labels: Label[];
  onComplete: FormAction;
  onUpdate: FormAction;
}) {
  const dueDateClass = getBucket(task.dueDate, today) === "overdue" ? "text-red-700" : "text-black/60";

  return (
    <li className="rounded-lg border border-black/10 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <LabelChip label={task.label} />
        <span className={`shrink-0 font-mono text-[0.7rem] uppercase tracking-wide ${dueDateClass}`}>
          {humanizeDueDate(task.dueDate, today)}
        </span>
      </div>
      <p className="mt-1.5 text-sm">{task.title}</p>
      <p className="mt-1 text-xs text-black/60">{capitalise(task.size)}</p>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <form action={onComplete}>
          <input type="hidden" name="id" value={task.id} />
          <button
            type="submit"
            className="rounded-md border border-black/15 px-2 py-1 text-xs font-medium"
          >
            Complete
          </button>
        </form>

        <details>
          <summary className="cursor-pointer text-xs underline underline-offset-4">Edit</summary>
          <form action={onUpdate} className="mt-2 flex flex-col gap-2">
            <input type="hidden" name="id" value={task.id} />
            <input
              type="text"
              name="title"
              defaultValue={task.title}
              required
              aria-label="Title"
              className="rounded-md border border-black/15 px-2 py-1 text-sm"
            />
            <input
              type="date"
              name="dueDate"
              defaultValue={task.dueDate}
              required
              aria-label="Due date"
              className="rounded-md border border-black/15 px-2 py-1 text-sm"
            />
            <select
              name="labelId"
              defaultValue={task.label.id}
              aria-label="Label"
              className="rounded-md border border-black/15 px-2 py-1 text-sm"
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
              className="rounded-md border border-black/15 px-2 py-1 text-sm"
            >
              {SIZES.map((size) => (
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
              className="rounded-md border border-black/15 px-2 py-1 text-sm"
            />
            <button
              type="submit"
              className="self-start rounded-md border border-black/15 px-3 py-1 text-xs font-medium"
            >
              Save
            </button>
          </form>
        </details>

        <details>
          <summary className="cursor-pointer text-xs text-red-700 underline underline-offset-4">
            Delete
          </summary>
          <form action={deleteTaskAction} className="mt-2">
            <input type="hidden" name="id" value={task.id} />
            <button type="submit" className="text-xs text-red-700 underline underline-offset-4">
              Confirm delete
            </button>
          </form>
        </details>
      </div>
    </li>
  );
}

function CreateTaskForm({ labels, onCreate }: { labels: Label[]; onCreate: FormAction }) {
  return (
    <form
      action={onCreate}
      className="mt-6 flex flex-wrap items-end gap-3 border-t border-black/10 pt-4"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-black/60" htmlFor="new-task-title">
          Title
        </label>
        <input
          id="new-task-title"
          type="text"
          name="title"
          required
          className="w-40 rounded-md border border-black/15 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-black/60" htmlFor="new-task-due-date">
          Due
        </label>
        <input
          id="new-task-due-date"
          type="date"
          name="dueDate"
          required
          className="rounded-md border border-black/15 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-black/60" htmlFor="new-task-label">
          Label
        </label>
        <select
          id="new-task-label"
          name="labelId"
          required
          className="rounded-md border border-black/15 px-3 py-2 text-sm"
        >
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-black/60" htmlFor="new-task-size">
          Size
        </label>
        <select
          id="new-task-size"
          name="size"
          required
          className="rounded-md border border-black/15 px-3 py-2 text-sm"
        >
          {SIZES.map((size) => (
            <option key={size} value={size}>
              {capitalise(size)}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium"
      >
        Add task
      </button>
    </form>
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

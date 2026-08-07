import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  bucketOpenTasks,
  getBucket,
  groupDoneByDay,
  humanizeDueDate,
} from "@/lib/task/dates";
import type { Task } from "@/lib/task/task";

/**
 * The trainer's tasks, read-only: open tasks grouped into urgency buckets,
 * done tasks collapsed out of the way and grouped by completion day. #7
 * ships no way to create, edit or complete a task — see `@/lib/task/task`.
 *
 * Overdue is the only alarm state (#7's acceptance criteria) — Today gets no
 * competing accent of its own.
 */
export function TaskPanel({ tasks }: { tasks: Task[] }) {
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
                <TaskRow key={task.id} task={task} today={today} />
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
                    <TaskRow key={task.id} task={task} today={today} />
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

function TaskRow({ task, today }: { task: Task; today: Date }) {
  const isDone = task.status === "done";
  const dueDateClass = !isDone && getBucket(task.dueDate, today) === "overdue" ? "text-red-700" : "text-black/60";

  return (
    <li className={`rounded-lg border border-black/10 p-3 ${isDone ? "opacity-50" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <LabelChip label={task.label} />
        <span className={`shrink-0 font-mono text-[0.7rem] uppercase tracking-wide ${dueDateClass}`}>
          {humanizeDueDate(task.dueDate, today, isDone)}
        </span>
      </div>
      <p className={`mt-1.5 text-sm ${isDone ? "text-black/60 line-through" : ""}`}>{task.title}</p>
      <p className="mt-1 text-xs text-black/60">{capitalise(task.size)}</p>
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

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

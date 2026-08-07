import type { FormAction } from "@/app/task-panel";
import type { Label } from "@/lib/label/label";
import { TASK_SIZES } from "@/lib/task/task";
import { capitalise } from "@/lib/text";

/**
 * Task creation, split out from the task list (#14): it sits in the left
 * column next to stats, so adding a task never competes for space with the
 * list of them on the right.
 */
export function CreateTaskPanel({
  labels,
  onCreate,
  className = "",
}: {
  labels: Label[];
  onCreate: FormAction;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-border bg-surface p-6 ${className}`}>
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Add task</h2>

      <form action={onCreate} className="mt-4 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted" htmlFor="new-task-title">
            Title
          </label>
          <input
            id="new-task-title"
            type="text"
            name="title"
            required
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm transition-colors focus:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted" htmlFor="new-task-due-date">
            Due
          </label>
          <input
            id="new-task-due-date"
            type="date"
            name="dueDate"
            required
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm transition-colors focus:border-accent"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted" htmlFor="new-task-label">
            Label
          </label>
          <select
            id="new-task-label"
            name="labelId"
            required
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm transition-colors focus:border-accent"
          >
            {labels.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted" htmlFor="new-task-size">
            Size
          </label>
          <select
            id="new-task-size"
            name="size"
            required
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm transition-colors focus:border-accent"
          >
            {TASK_SIZES.map((size) => (
              <option key={size} value={size}>
                {capitalise(size)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="mt-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90"
        >
          Add task
        </button>
      </form>
    </section>
  );
}

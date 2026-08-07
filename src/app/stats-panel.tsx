import { todayPoints } from "@/lib/task/dates";
import type { Task } from "@/lib/task/task";

/**
 * Today's earned points against the daily target — derived by summing
 * today's completions every render, never a stored counter (CONTEXT.md), so
 * it is always exactly what the task list would add up to.
 */
export function StatsPanel({
  tasks,
  dailyTarget,
  className = "",
}: {
  tasks: Task[];
  dailyTarget: number;
  className?: string;
}) {
  const points = todayPoints(tasks);
  const metTarget = points >= dailyTarget;

  return (
    <section className={`rounded-lg border border-border bg-surface p-6 ${className}`}>
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Today</h2>
      <p className={`mt-2 text-2xl font-semibold ${metTarget ? "text-success" : ""}`}>
        {points}
        <span className="text-base font-normal text-muted"> / {dailyTarget}</span>
      </p>
    </section>
  );
}

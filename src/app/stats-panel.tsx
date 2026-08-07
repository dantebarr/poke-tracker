import { todayPoints } from "@/lib/task/dates";
import type { Task } from "@/lib/task/task";

/**
 * Today's earned points against the daily target — derived by summing
 * today's completions every render, never a stored counter (CONTEXT.md), so
 * it is always exactly what the task list would add up to.
 */
export function StatsPanel({ tasks, dailyTarget }: { tasks: Task[]; dailyTarget: number }) {
  const points = todayPoints(tasks);
  const metTarget = points >= dailyTarget;

  return (
    <section className="rounded-lg border border-black/10 p-6">
      <h2 className="text-sm font-medium uppercase tracking-wide text-black/60">Today</h2>
      <p className={`mt-2 text-2xl font-semibold ${metTarget ? "text-emerald-700" : ""}`}>
        {points}
        <span className="text-base font-normal text-black/60"> / {dailyTarget}</span>
      </p>
    </section>
  );
}

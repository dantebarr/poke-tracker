import { listLabels } from "@/lib/label/label";
import type { McpCaller } from "@/lib/mcp/auth";
import { listRecentTasks, type Task } from "@/lib/task/task";

/**
 * The MCP tools. Each calls the same `src/lib/task` and `src/lib/label`
 * functions the server components and actions do, through the caller's own
 * client (ADR-0013).
 */
export type Tool = {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, never>; additionalProperties: false };
  run(caller: McpCaller): Promise<unknown>;
};

const NO_ARGUMENTS = { type: "object", properties: {}, additionalProperties: false } as const;

/** Done tasks stay visible to Claude for this long after completion. */
const RECENTLY_DONE_DAYS = 7;

function describeTask(task: Task) {
  return {
    id: task.id,
    title: task.title,
    dueDate: task.dueDate,
    status: task.status,
    label: task.label.name,
    size: task.size,
    notes: task.notes,
    completedAt: task.completedAt,
    fromRecurrence: task.recurrence !== null,
  };
}

export const TOOLS: Tool[] = [
  {
    name: "list_tasks",
    description:
      `The trainer's open tasks, plus tasks they completed in the last ${RECENTLY_DONE_DAYS} days. ` +
      "Dates are YYYY-MM-DD in the trainer's own time zone.",
    inputSchema: NO_ARGUMENTS,
    async run({ client, trainer }) {
      const since = new Date(Date.now() - RECENTLY_DONE_DAYS * 24 * 60 * 60 * 1000);
      return (await listRecentTasks(client, trainer.id, since)).map(describeTask);
    },
  },
  {
    name: "list_labels",
    description: "The trainer's label names, in the order they have arranged them.",
    inputSchema: NO_ARGUMENTS,
    async run({ client, trainer }) {
      return (await listLabels(client, trainer.id)).map((label) => label.name);
    },
  },
];

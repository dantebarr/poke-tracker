import { revalidatePath } from "next/cache";

import { listLabels } from "@/lib/label/label";
import {
  checkArgs,
  parseDueDate,
  parseNotes,
  parseSize,
  parseTitle,
  requireId,
  resolveLabelId,
  ToolError,
  type Args,
} from "@/lib/mcp/arguments";
import type { McpCaller } from "@/lib/mcp/auth";
import { DatabaseError } from "@/lib/supabase/errors";
import { activeInstanceId } from "@/lib/pokemon/pokemon";
import {
  completeTask,
  createTask,
  deleteTask,
  findTask,
  listRecentTasks,
  reopenTask,
  TASK_SIZES,
  updateTask,
  type Task,
} from "@/lib/task/task";

/**
 * The MCP tools. Each calls the same `src/lib/task` and `src/lib/label`
 * functions the server components and actions do, through the caller's own
 * client (ADR-0013).
 */
export type Tool = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
  run(caller: McpCaller, args: unknown): Promise<unknown>;
};

const NO_ARGUMENTS = { type: "object", properties: {}, additionalProperties: false } as const;

const FIELD_SCHEMAS = {
  title: { type: "string", description: "What needs doing." },
  dueDate: { type: "string", description: "The day it is due, YYYY-MM-DD, in the trainer's own time zone." },
  label: { type: "string", description: "One of the trainer's label names (see list_labels); case does not matter." },
  size: { type: "string", enum: TASK_SIZES, description: "How big the task is." },
} as const;

const NOTES_SCHEMA = { type: ["string", "null"], description: "Optional notes. Blank is stored as none." } as const;
const ID_SCHEMA = { type: "string", description: "A task id, as list_tasks returns it." } as const;

/** Every write changes what the layout draws, as the server actions do (#33). */
function revalidate() {
  revalidatePath("/", "layout");
}

/** The caller's own task, or an error Claude can act on. */
async function ownTask({ client }: McpCaller, args: Args): Promise<Task> {
  const id = requireId(args);
  // Postgres refuses a malformed uuid (22P02); that is a bad id, not an outage.
  const task = await findTask(client, id).catch((error: unknown) => {
    if (error instanceof DatabaseError && error.code === "22P02") return null;
    throw error;
  });
  if (!task) throw new ToolError(`No task with id ${JSON.stringify(id)}. Use list_tasks to see the ids.`);
  return task;
}

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
  {
    name: "create_task",
    description: "Adds an open task for the trainer and returns it.",
    inputSchema: {
      type: "object",
      properties: { ...FIELD_SCHEMAS, notes: NOTES_SCHEMA },
      required: ["title", "dueDate", "label", "size"],
      additionalProperties: false,
    },
    async run({ client, trainer }, raw) {
      const args = checkArgs(raw, ["title", "dueDate", "label", "size", "notes"]);
      const title = parseTitle(args.title);
      const dueDate = parseDueDate(args.dueDate);
      const size = parseSize(args.size);
      const notes = args.notes === undefined ? null : parseNotes(args.notes);
      const labelId = await resolveLabelId(client, trainer.id, args.label);

      const task = await createTask(client, trainer.id, { title, dueDate, labelId, size, notes });
      revalidate();
      return describeTask(task);
    },
  },
  {
    name: "update_task",
    description:
      "Edits a task. Send the id and only the fields to change; the rest are kept. " +
      "Send notes as null to clear them.",
    inputSchema: {
      type: "object",
      properties: { id: ID_SCHEMA, ...FIELD_SCHEMAS, notes: NOTES_SCHEMA },
      required: ["id"],
      additionalProperties: false,
    },
    async run(caller, raw) {
      const args = checkArgs(raw, ["id", "title", "dueDate", "label", "size", "notes"]);
      const task = await ownTask(caller, args);

      const fields: Parameters<typeof updateTask>[2] = {};
      if (args.title !== undefined) fields.title = parseTitle(args.title);
      if (args.dueDate !== undefined) fields.dueDate = parseDueDate(args.dueDate);
      if (args.size !== undefined) fields.size = parseSize(args.size);
      if (args.notes !== undefined) fields.notes = parseNotes(args.notes);
      if (args.label !== undefined) {
        fields.labelId = await resolveLabelId(caller.client, caller.trainer.id, args.label);
      }
      if (Object.keys(fields).length === 0) {
        throw new ToolError("Nothing to change: send at least one of title, dueDate, label, size, notes.");
      }

      const updated = await updateTask(caller.client, task.id, fields);
      revalidate();
      return describeTask(updated);
    },
  },
  {
    name: "complete_task",
    description:
      "Marks a task done. It credits the trainer's current Active Pokémon and earns effort points for today.",
    inputSchema: { type: "object", properties: { id: ID_SCHEMA }, required: ["id"], additionalProperties: false },
    async run(caller, raw) {
      const task = await ownTask(caller, checkArgs(raw, ["id"]));
      const instanceId = await activeInstanceId(caller.client, caller.trainer.id);

      const completed = await completeTask(caller.client, task.id, instanceId);
      revalidate();
      return describeTask(completed);
    },
  },
  {
    name: "reopen_task",
    description: "Sends a done task back to open, erasing its completion.",
    inputSchema: { type: "object", properties: { id: ID_SCHEMA }, required: ["id"], additionalProperties: false },
    async run(caller, raw) {
      const task = await ownTask(caller, checkArgs(raw, ["id"]));

      const reopened = await reopenTask(caller.client, task.id);
      revalidate();
      return describeTask(reopened);
    },
  },
  {
    name: "delete_task",
    description: "Deletes an open task. A done task cannot be deleted: reopen it first with reopen_task.",
    inputSchema: { type: "object", properties: { id: ID_SCHEMA }, required: ["id"], additionalProperties: false },
    async run(caller, raw) {
      const task = await ownTask(caller, checkArgs(raw, ["id"]));
      if (task.status === "done") {
        throw new ToolError(
          `Task ${JSON.stringify(task.title)} is done, and a done task cannot be deleted. Call reopen_task first, then delete_task.`,
        );
      }

      await deleteTask(caller.client, task.id);
      revalidate();
      return { deleted: task.id };
    },
  },
];

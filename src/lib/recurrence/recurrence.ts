import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecurrenceFrequency, RecurrenceRule } from "@/lib/recurrence/dates";
import { DatabaseError, unwrap } from "@/lib/supabase/errors";
import type { TaskContent, TaskSize } from "@/lib/task/task";

/**
 * A **Recurrence**, as the app reads one: the rule that decides *when* (the
 * `RecurrenceRule` half, which the pure date module reasons about) plus the
 * fields stamped onto every task it generates, plus the watermark generation
 * moves.
 *
 * There is no update here, and there is no update grant behind one: a rule is
 * immutable to a trainer's own JWT and is changed by deleting it and creating
 * another. The one exception is `advanceGeneratedThrough`, which is
 * generation's own derived state and reaches the database through the
 * service-role client.
 */
export type Recurrence = RecurrenceRule &
  TaskContent & {
    id: string;
    trainerId: string;
    generatedThrough: string;
  };

type RecurrenceRow = {
  id: string;
  trainer_id: string;
  frequency: RecurrenceFrequency;
  day_of_week: number | null;
  day_of_month: number | null;
  starts_on: string;
  generated_through: string;
  task: string;
  label_id: string;
  size: TaskSize;
  notes: string | null;
};

const COLUMNS =
  "id, trainer_id, frequency, day_of_week, day_of_month, starts_on, generated_through, task, label_id, size, notes";

function toRecurrence(row: RecurrenceRow): Recurrence {
  return {
    id: row.id,
    trainerId: row.trainer_id,
    frequency: row.frequency,
    dayOfWeek: row.day_of_week,
    dayOfMonth: row.day_of_month,
    startsOn: row.starts_on,
    generatedThrough: row.generated_through,
    title: row.task,
    labelId: row.label_id,
    size: row.size,
    notes: row.notes,
  };
}

/**
 * Everything a trainer chooses when they turn recurring on: the rule that
 * decides when, and the content every task it generates will carry.
 */
export type RecurrenceFields = RecurrenceRule & TaskContent;

/**
 * Creates a rule. The database refuses a weekly rule without a day of week, a
 * monthly one without a day of month, and either carrying the other's field
 * (ADR-0001) — this passes what it is given and lets the check constraints be
 * the guarantee.
 *
 * `generated_through` is not written here: a trigger seeds it to the day
 * before the start date, so nothing generation derives can be supplied by the
 * caller.
 */
export async function createRecurrence(
  client: SupabaseClient,
  trainerId: string,
  fields: RecurrenceFields,
): Promise<Recurrence> {
  const row = unwrap(
    "Creating recurrence",
    await client
      .from("recurrence")
      .insert({
        trainer_id: trainerId,
        frequency: fields.frequency,
        day_of_week: fields.dayOfWeek,
        day_of_month: fields.dayOfMonth,
        starts_on: fields.startsOn,
        task: fields.title,
        label_id: fields.labelId,
        size: fields.size,
        notes: fields.notes,
      })
      .select(COLUMNS)
      .single<RecurrenceRow>(),
  );
  return toRecurrence(row);
}

/**
 * A trainer's rules. Row-level security scopes this to the caller's own when
 * the client carries their JWT; generation reads it through the service-role
 * client and scopes it by `trainerId` itself.
 */
export async function listRecurrences(
  client: SupabaseClient,
  trainerId: string,
): Promise<Recurrence[]> {
  const { data, error } = await client
    .from("recurrence")
    .select(COLUMNS)
    .eq("trainer_id", trainerId)
    .order("created_at")
    .returns<RecurrenceRow[]>();

  if (error) {
    throw new DatabaseError("Listing recurrences", error);
  }
  return data.map(toRecurrence);
}

/**
 * Moves the watermark to the last date generation has considered. Needs a
 * service-role client: `recurrence` has no update grant at all, so this is
 * out of reach of a trainer's own JWT by design.
 */
export async function advanceGeneratedThrough(
  client: SupabaseClient,
  id: string,
  through: string,
): Promise<void> {
  const { error } = await client
    .from("recurrence")
    .update({ generated_through: through })
    .eq("id", id);

  if (error) {
    throw new DatabaseError("Advancing recurrence watermark", error);
  }
}

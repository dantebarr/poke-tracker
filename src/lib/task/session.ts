import { listTasks, type Task } from "@/lib/task/task";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The read side. Server components call this; #7 ships no write side for
 * tasks yet.
 */

/** The given trainer's tasks. Row-level security scopes this to the caller's own. */
export async function currentTasks(trainerId: string): Promise<Task[]> {
  const client = await createSupabaseServerClient();
  return listTasks(client, trainerId);
}

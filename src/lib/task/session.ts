import { cache } from "react";

import { listTasks, type Task } from "@/lib/task/task";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The read side. Server components call this; #7 ships no write side for
 * tasks yet.
 */

/**
 * The given trainer's tasks. Row-level security scopes this to the caller's
 * own. `cache`d per request (#33): the chrome layout needs the open count for
 * Warden Baoba's overdue clause, and the home page needs the full list for
 * the field log — without memoization the home address would run this query
 * twice.
 */
export const currentTasks = cache(async (trainerId: string): Promise<Task[]> => {
  const client = await createSupabaseServerClient();
  return listTasks(client, trainerId);
});

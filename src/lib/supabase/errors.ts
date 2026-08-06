import type { PostgrestError } from "@supabase/supabase-js";

/**
 * A failure that came from Postgres itself — a constraint violation, an RLS
 * refusal — rather than from application logic.
 *
 * The invariants of this app live in the database (ADR-0001), so a rejected
 * write is the guarantee working, not an unexpected condition. It surfaces as a
 * thrown error carrying the SQLSTATE code so callers can tell a violated
 * constraint from a lost connection.
 */
export class DatabaseError extends Error {
  readonly code: string;
  readonly details: string | null;
  readonly hint: string | null;

  constructor(context: string, error: PostgrestError) {
    super(`${context}: ${error.message}`);
    this.name = "DatabaseError";
    this.code = error.code;
    this.details = error.details;
    this.hint = error.hint;
  }
}

/**
 * Unwraps a Supabase result, throwing on failure. Supabase returns errors in
 * the result rather than throwing, which makes them easy to ignore by accident;
 * every call site in this app goes through here so that cannot happen.
 */
export function unwrap<T>(
  context: string,
  result: { data: T | null; error: PostgrestError | null },
): T {
  if (result.error) {
    throw new DatabaseError(context, result.error);
  }
  if (result.data === null) {
    throw new Error(`${context}: expected a row, got none`);
  }
  return result.data;
}

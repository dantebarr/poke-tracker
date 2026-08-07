import { Client, type QueryResultRow } from "pg";
import { inject } from "vitest";

const { dbUrl } = inject("supabaseEnv");

/**
 * Runs against the database directly rather than through PostgREST, which
 * exposes only the `public` schema — `pg_catalog` (where row-level security
 * is recorded) isn't reachable any other way. Used only for the schema-wide
 * audit; nothing the app does connects to Postgres directly.
 */
export async function queryCatalog<Row extends QueryResultRow>(sql: string): Promise<Row[]> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const result = await client.query<Row>(sql);
    return result.rows;
  } finally {
    await client.end();
  }
}

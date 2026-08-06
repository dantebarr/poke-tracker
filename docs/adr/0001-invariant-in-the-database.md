# Enforce the task invariant in the database, not the TypeScript write seam

**Status:** accepted

Every task must carry a due date, a label, and a size. These are `NOT NULL` columns with a
foreign key and a check constraint — the database is the guarantee.

This **directly reverses** jarvis-hud's `docs/adr/0002-label-invariant-at-the-write-seam.md`,
which argued at length for the opposite: nullable columns plus a split read/write type in
TypeScript. That reasoning was correct at the time and rested on one premise — the `tasks` table
had a second writer nobody controlled (Jarvis email ingestion, `source='email'`), so a `NOT NULL`
constraint would have broken a pipeline outside that codebase's authority to fix.

Poke Tracker retires Jarvis's write path. With a single writer, the premise is gone and the
guarantee can live where it's actually enforceable. The read model no longer needs to represent
malformed rows, which deletes the `Unlabelled` chip, the `"No date"` fallback, and the
`Task`/`NewTask`/`TaskEdit` three-way type split as unreachable code.

Recorded because a reader who finds jarvis-hud's ADR-0002 will otherwise conclude this was a
mistake — it makes the exact opposite argument, in writing, about the same table.

**Consequence:** Jarvis's write path must be disabled *before* the constraints land. Its next
insert after that migration would fail.

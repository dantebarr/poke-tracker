# Claude reaches a trainer's tasks through an MCP route in the app, authenticated by Supabase OAuth

**Status:** accepted

Claude gets at a trainer's tasks through a remote MCP endpoint served by this Next.js app on
Vercel. Its tools (list tasks and labels; create, update, complete, reopen and delete a task) call
the same `src/lib/task` functions the server actions call. Supabase Auth acts as the OAuth 2.1
server for that endpoint, so every tool call runs under the trainer's own JWT. Row-level security,
the database's task invariants (ADR-0001) and the rule that a done task cannot be deleted
(ADR-0002) therefore hold for Claude exactly as they hold for the browser. To the domain, Claude
*is* the trainer. It is not a second writer, and nothing it creates is marked as coming from it.

This makes the MCP route the second exception to "writes go through server actions", alongside
`/auth/callback`. An MCP client speaks HTTP to a fixed endpoint and cannot invoke a server action.

## Considered Options

**Direct SQL access** (e.g. a database MCP with a privileged key) is what this replaces. It
bypasses row-level security and every invariant the write seam enforces, so a single wrong
statement can corrupt the **day ledger** or delete a done task.

**A separate service or a Supabase Edge Function** would have to re-implement the task seam in a
second codebase, and that second writer is exactly what ADR-0001's premise rules out.

**A static bearer token with a service-role client and a hard-coded trainer id** is simpler, but
it bypasses row-level security, and claude.ai's custom connectors need OAuth anyway.

## Consequences

- Dynamic client registration is on. Registering a client grants nothing: a client still needs
  Google sign-in, the allow-list, and approval on the app's consent page.
- An **account** that has no trainer record gets no tool access.
- Grants are revoked from the Supabase dashboard. The app has no "connected apps" screen.

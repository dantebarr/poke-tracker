# CI applies migrations on push to main, not ordered against the Vercel deploy

**Status:** accepted

The GitLab CI job that pushes pending `supabase/migrations/` files to the remote database
(`.gitlab-ci.yml`) runs on the same trigger as the Vercel deploy — a push to `main` — but the two
are not sequenced against each other. Whichever finishes first, finishes first.

This is a gap, not an oversight: the Vercel deploy is wired through the GitLab↔Vercel
integration, which reacts to the push itself, not to GitLab CI's pipeline result. Making the
migration a true precondition of the deploy would mean disconnecting that integration and
triggering Vercel from CI instead (via its API or CLI) once the migration job succeeds — a second
piece of infrastructure, and a slower deploy on every push, including the far more common case of
a push with no migration in it at all.

`npm test` replays every migration from empty and runs the full suite against it, so a developer
who runs it before pushing has already proven the migration applies cleanly and leaves the schema
the app code expects — but nothing in CI enforces that run; it is still developer discipline, not
a gate. Given that, the risk this gap leaves open is narrower than "an unreviewed migration
reaching main," it's specifically "a brief window, on push, where old app code and new schema (or
new app code and old schema) are both live." For a solo-trainer-per-row app with no
backward/forward compatibility currently designed into any migration, that window is judged
acceptable.

Considered and rejected: switching Vercel to a CI-triggered deploy so this job can gate it. Ruled
out for now as disproportionate to a repo that has shipped no backward-incompatible migration yet
— see the parent issue's own open question about whether this repo even distinguishes
backward-compatible migrations from ones that aren't (it doesn't).

**Consequence:** a migration that changes a column an in-flight deploy already depends on can
still race it. If a future migration is genuinely backward-incompatible (a rename, a drop, a new
`NOT NULL` with no default), do the migration and the app change in separate pushes — migration
first, confirmed applied, then the app change — rather than relying on this pipeline to order them
for you.

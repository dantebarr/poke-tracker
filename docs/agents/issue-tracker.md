# Issue tracker: GitLab

Issues and specs for this repo live as GitLab issues. Use the [`glab`](https://gitlab.com/gitlab-org/cli) CLI for all operations.

## Conventions

- **Create an issue**: `glab issue create --title "..." --description "..."`. Use a heredoc for multi-line descriptions. Pass `--description -` to open an editor.
- **Read an issue**: `glab issue view <number> --comments`. Use `-F json` for machine-readable output.
- **List issues**: `glab issue list --output json` with appropriate `--label` filters. **Not `-F json`** — `glab issue list` ignores `-F` and prints its human table anyway (checked on glab 1.112.0), so a script piping it into a JSON parser fails on the `Showing N open issues…` header. `glab issue view` accepts either flag.
- **Comment on an issue**: `glab issue note <number> --message "..."`. GitLab calls comments "notes".
- **Apply / remove labels**: `glab issue update <number> --label "..."` / `--unlabel "..."`. Multiple labels can be comma-separated or by repeating the flag.
- **Close**: `glab issue close <number>`. `glab issue close` does not accept a closing comment, so post the explanation first with `glab issue note <number> --message "..."`, then close.
- **Merge requests**: GitLab calls PRs "merge requests". Use `glab mr create`, `glab mr view`, `glab mr note`, etc. — the same shape as `gh pr ...` with `mr` in place of `pr` and `note`/`--message` in place of `comment`/`--body`.

Infer the repo from `git remote -v` — `glab` does this automatically when run inside a clone.

## Merge requests as a triage surface

**MRs as a request surface: no.** _(Set to `yes` if this repo treats external merge requests as feature requests; `/triage` reads this flag.)_

When set to `yes`, MRs run through the same labels and states as issues, using the `glab mr` equivalents:

- **Read an MR**: `glab mr view <number> --comments` and `glab mr diff <number>` for the diff.
- **List external MRs for triage**: `glab mr list -F json`, then keep only MRs whose author is not a project member/owner (a contributor's MR, not a maintainer's in-flight work).
- **Comment / label / close**: `glab mr note`, `glab mr update --label`/`--unlabel`, `glab mr close`.

Unlike GitHub, GitLab numbers issues and MRs separately, so `#42` is unambiguous once you know which surface the maintainer means.

## When a skill says "publish to the issue tracker"

Create a GitLab issue.

## When a skill says "fetch the relevant ticket"

Run `glab issue view <number> --comments`.

## Blocking edges

**This project is on a GitLab tier without native blocking links.** Verified 2026-08-06: posting
the `/blocked_by #<n>` quick action as a note is silently consumed — the note vanishes, no link is
created, and `glab api projects/:id/issues/:iid/links` stays empty. Nothing errors, so an agent
that fires the quick action and moves on will believe it recorded an edge it did not record.
**Do not rely on it. Check the `links` endpoint before trusting a native link.**

The fallback in use is a **`Blocked by` section in the issue description**, listing one blocking
issue per line as `- #<n> — <title>`, or the single line `None — can start immediately`:

```markdown
## Blocked by

- #7 — Task table migration and the read-only task list
```

A ticket is unblocked when every issue referenced there is closed. To find a ticket's blockers,
read its description — there is nowhere else to look. To find what a ticket blocks, search
descriptions for its number (`glab issue list --search "#<n>"`, then confirm the hit is under the
`Blocked by` heading rather than elsewhere in the body).

Anything reading these edges should tolerate both shapes: the `## Blocked by` section above, and
the `Blocked by: #<n>, #<n>` line some skills place at the top of the description. Both mean the
same thing.

If this project later moves to a Premium/Ultimate tier, native links become the canonical
representation and these sections should be migrated into them.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `glab issue create --label wayfinder:map`. (On GitLab tiers with native epics, an epic may hold the map instead; a labelled issue works everywhere.)
- **Child ticket**: an issue carrying `Part of #<map>` at the top of its description and labels `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: see [Blocking edges](#blocking-edges) above. Native links are unavailable on this project's tier, so the `Blocked by` description section is the representation. A ticket is unblocked when every blocker is closed.
- **Frontier query**: `glab issue list --output json` scoped to the map's children, drop any with an open blocker — read each candidate's description and check every issue in its `Blocked by` section is closed — or an assignee; first in map order wins.
- **Claim**: `glab issue update <n> --assignee @me` — the session's first write.
- **Resolve**: `glab issue note <n> --message "<answer>"`, then `glab issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.

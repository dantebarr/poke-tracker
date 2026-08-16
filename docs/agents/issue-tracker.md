# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the [`gh`](https://cli.github.com) CLI
for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`. Add `--json` for machine-readable output.
- **List issues**: `gh issue list --state open --json number,title,body,labels --jq '[.[] | {number, title, labels: [.labels[].name]}]'` with appropriate `--label` and `--state` filters. `--json` requires the field list to be named explicitly; there is no bare form that returns everything, and `gh issue list --json` with no fields errors out rather than defaulting.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."` — one call, the comment lands before the close.

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`, then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with
`gh pr view 42` and fall back to `gh issue view 42`.

## Blocking edges

GitHub's **native issue dependencies** are the canonical, UI-visible representation. A blocked
issue shows a "Blocked" marker in the issue list and on project boards.

```sh
gh issue edit <blocked> --add-blocked-by <blocker>    # by issue number
gh issue edit <blocked> --remove-blocked-by <blocker>
gh issue create --blocked-by <n>,<n> --blocking <n>   # at creation time
```

Reading them back, with two traps worth knowing:

```sh
# `blockedBy` is an object, NOT a flat array — `[.blockedBy[].number]` fails.
gh issue view <n> --json number,blockedBy --jq '.blockedBy.nodes[] | "\(.number) \(.state)"'
gh issue view <n> --json blockedBy --jq '.blockedBy.totalCount'

# The REST summary counts open blockers only, which makes it the live gate.
gh api repos/:owner/:repo/issues/<n> --jq '.issue_dependencies_summary.blocked_by'
```

**Writes are not immediately readable.** Verified 2026-08-16: `issue_dependencies_summary`
reported `blocked_by: 0` immediately after a successful `--add-blocked-by`, then `1` a moment
later. An agent that writes an edge and instantly reads it back can conclude the write failed and
"fix" a link that was never broken. Re-read before acting on a zero.

Limits: up to 50 links per relationship type, and triage permission or above to set one.

The older fallback — a `Blocked by: #<n>, #<n>` line at the top of the body — is still understood
by some skills. Treat it as equivalent when it appears, but write native dependencies.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: see [Blocking edges](#blocking-edges) above. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.

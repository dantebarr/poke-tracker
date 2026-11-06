# On a phone, home is the field log

**Status:** accepted

On a narrow screen only one pane shows at a time. Home used to be the encounter view, so opening
the app on a phone showed the Pokémon and nothing else; the task list — the reason a Ranger
opens the app — was one unlabeled button away.

Home (`/`) on a narrow screen is now the field log, under a compact Pokémon card (sprite, bond,
mood, today's points). The full encounter view and Warden Baoba's tray are at
`/?pane=encounter`, reached by tapping the card or the Partner tab in the bottom tab bar. The
old `/?pane=log` address still opens the field log. A wide screen is unchanged: both panes are
drawn at once.

## Consequences

The navigation rules in `src/app/(app)/chrome/navigation.ts` treat the encounter view, not the
field log, as the destination that needs an explicit parameter. Any new link to the field log
should use `FIELD_LOG_HREF` rather than spelling out a pane parameter.

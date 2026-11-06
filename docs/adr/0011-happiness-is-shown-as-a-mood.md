# Happiness is shown as a mood

**Status:** accepted

Happiness used to have no surface at all — no number, no bar, no face — and Warden Baoba's line
was the only place a Ranger could read how their Pokémon felt. In practice that meant a Pokémon
could leave with nothing on screen having warned that it was close, which reads as the app being
arbitrary rather than the Ranger falling short.

The Pokémon's status box now carries a **mood**: five hearts and a word (Restless, Settled,
Content, Thriving). It is cut from the very same bands Baoba speaks from (`moodFor` in
`src/lib/baoba/dialogue.ts`), measured in days of slack rather than raw happiness, so the hearts
and the dialogue can never disagree. The two lowest bands are marked at risk and warn visibly.

## Considered Options

**Show the raw number.** Rejected: happiness is uncapped and means different things on different
daily targets; slack is the figure that actually tells a Ranger how many quiet days they have.

**Keep it hidden.** Rejected for the reason above. Baoba stays the only surface that explains
*why* a bad day costs something — the hearts only say *how much* room is left.

# Happiness clamps at zero rather than resetting

**Status:** accepted

Adding **Parting** — the trainer's deliberate end to their time with the Active Pokémon —
needed the trainer to keep their happiness across the departure, where a departure by neglect
zeroes it. Rather than branch settlement on *why* the Pokémon went, the general rule absorbed
both: happiness moves by the delta every day and is **clamped at zero only when a day would
take it negative**. Nothing resets it, ever. A neglect departure *is* that clamp firing; a
parting is a departure the clamp was never involved in, so the number simply carries.

## Considered Options

**A parting-specific carry-over** was the obvious first design, and is how the feature was
originally described: leave the reset in place and add "unless the trainer chose it" beside it.
Rejected because it makes happiness's lifecycle depend on the *reason* for a departure, which
is a fact about the trainer's intent leaking into a number that `CONTEXT.md` already says
belongs to the trainer and not to any Pokémon. It also needed a rule for what a parting does
with *negative* happiness — a question the clamp answers by never letting the case exist.

The clamp is strictly simpler than what it replaces. `settleActiveDay`'s `happiness: 0` on
departure becomes the clamp; `settlePokemonlessDay`'s `happiness: delta` on a qualifying day
becomes `happiness + delta`. Both are identical to today's behaviour for every day already
settled, because carried happiness could only ever be zero before Parting existed.

## Consequences

Two invariants that hold everywhere in the current code stop holding, and reintroducing either
would silently break Parting:

- **`happiness` is no longer 0 whenever no instance is active.** `reducer.ts`'s
  `SettlementState` documents that as a rule and it becomes false; the trainer carries a real
  number through their pokemon-less days.
- **`day_ledger.happiness_after` is no longer 0 on pokemon-less rows**, and its column comment
  says it is.

A pokemon-less day with a negative delta still costs nothing — `settlePokemonlessDay` leaves
state untouched on a bad day, and that is deliberate rather than incidental: there is no
Pokémon present to be neglected, so carried happiness sits still until an **Arrival** picks it
up. Do not "fix" this into a subtraction.

Bond is credited on `delta >= 0` rather than on `outcome = 'bond'`, so that a **Parting** day
the trainer actually hit their target on still earns its level. For every row settled before
this decision the two conditions are identical, so no settled day changes meaning (ADR-0001).

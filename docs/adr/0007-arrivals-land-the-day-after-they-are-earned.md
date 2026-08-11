# Arrivals land the day after they are earned

Settlement runs between days, so a Pokémon earned by hitting the daily target on
a pokemon-less day is drawn at that boundary and is active from the *next* day —
never the qualifying day, which the trainer spent alone. The qualifying day's
ledger row therefore names no Pokémon and carries the `approaching` outcome; the
following day's row is the first to name it.

## Considered Options

**Arriving on the qualifying day** was the obvious alternative, and CONTEXT.md
described it that way until this decision. It was rejected because a day-ledger
row means "who was with the trainer during this day", and on the qualifying day
nobody was. Letting the new Pokémon appear on that row would also raise the
question of whether it earned a bond level for work done before it existed.

**Deferring via stored state** is what the code did first: a qualifying day set
a `pending_arrival_delta` on the trainer, and the arrival materialized on the
next day *settled*. That is not the same as the next day — when the qualifying
day was the last one settled, the arrival waited for a whole further day to
pass, so a trainer who hit their target went two days without a Pokémon. It also
discarded the arrival day's own effort, since that day's happiness was
overwritten with the stored delta rather than added to it. Drawing eagerly and
storing the instance on the trainer gets the intended timing with no extra state.

## Consequences

`approaching` is stored on the row rather than derived from `delta >= 0` and a
null instance. Deriving would be equivalent today, but it would let a future
change to the arrival rule silently relabel days already settled — the same
hazard `day_ledger.target` is snapshotted to avoid. Storing it also makes the
day ledger's read model identical to its stored outcomes, so no event inference
is needed at all.

Days settled before this decision keep whatever their rows already say. Settled
days are immutable (ADR-0001), so a qualifying day from the old scheme still
reads as an ordinary pokemon-less day.

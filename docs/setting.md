# Setting: The Safari Zone Reserve

The fiction Poke Tracker is told through. This is a **narrative design doc**, not a
glossary and not a spec — it records the world, the role the trainer plays in it,
and the tone everything else should be written in. Where it introduces vocabulary
that competes with `CONTEXT.md`, `CONTEXT.md` still wins until the term is properly
resolved (see [Open vocabulary questions](#open-vocabulary-questions)).

## Premise

You are a **Ranger** on the staff of the Safari Zone, working under **Warden
Baoba** — the actual warden from the games, who runs the reserve. The job is not
catching and it is not battling. It is upkeep: the reserve needs looking after,
every day, and that is what the daily tasks are.

Pokémon are not caught, assigned, or won. They **wander by on their own** and
choose to stick around, because the work you are doing is work they benefit from.
Having chosen to stay, they stay — a Pokémon never leaves on a schedule or by
mechanic-with-no-fiction. It leaves only when the relationship stops being worth
it to them, which in game terms is happiness falling below zero.

The Ranger can still end a pairing, but the fiction stays the same in both
directions: the Pokémon never goes anywhere. The **Ranger** is the one who moves,
on to a new area of the reserve, and the Pokémon stays behind in the area it
belongs to — which is why the interface's word for it is "MOVE ON" and never
release, rehome, or send away. Nothing is ever given up: the reserve's Pokémon
are not the Ranger's to release, and meeting one again later is meeting the same
individual you left. See `CONTEXT.md`'s **Parting** and **Zone** entries.

## Cast

### Warden Baoba

The reserve's warden and the player's boss. He appears on **first run** in an
intro modal to onboard the Ranger — explaining the reserve, what the daily work
is for, and how Pokémon come to stay with you. He should use his **actual game
model/sprite** for authenticity, not an original character design.

He is the only voice in the app that speaks in first person. He is warm,
unhurried, and matter-of-fact about the work — a man who has run this place for
decades and does not need to oversell it.

> _Asset status:_ Warden Baoba's sprite lives in `public/npc/`, sourced from his
> HGSS game model as this setting requires.

### The Ranger

The player. Staff, not a visitor — which is the whole reason the daily-upkeep
framing works. A Ranger has a name, a daily quota of work, and a reputation
built out of showing up.

### The Pokémon

Residents and passers-through of the reserve. The one currently with you is your
working partner for as long as it wants to be there.

## Core loop, in fiction

| Mechanic | Fiction |
| --- | --- |
| Daily target | The day's share of reserve upkeep Baoba expects from you. |
| Completing a task | Work done, with your partner Pokémon alongside you. |
| Effort points | How much a job actually took out of the day. |
| Delta ≥ 0 | A good day's work. The Pokémon noticed. |
| Delta < 0 | A day the reserve went short. |
| Happiness | How the Pokémon currently feels about sticking around. |
| Bond level | How much you two have actually been through together. Never falls. |
| Leaves | It wanders off back into the reserve. It remembers you. |
| A Pokémon arrives | One wanders by, sees the work, and decides to lend a hand. |
| Pokédex entry unlocks | You know this species well enough to write it up properly. |
| Evolution unlocks | It trusts you enough to change in front of you. |

## The bond, and why it keeps mattering

The bond is the spine of the whole thing. Two separate rewards hang off the same
threshold:

1. **The Pokédex entry unlocks.** You have worked with this species long enough
   to describe it first-hand. This is the research half of a Ranger's job.
2. **For species that can evolve, the evolve option appears.** Not automatic —
   offered. It is the Pokémon's change and your choice to invite it.

Pinning both to one threshold is deliberate: it means "researched" is not the end
of a Pokémon. There is still a reason to keep working with the same partner after
its entry is written, because the thing you are building with it was never really
about the entry.

## Tone

- **Befriending and cooperating**, never capturing or commanding. No verb in the
  UI should imply ownership or force.
- **Consistency over intensity.** The reserve rewards turning up, not heroics.
  Copy should never congratulate a binge or shame a quiet day harder than the
  numbers already do.
- **Warm and practical.** This is a workplace with animals in it. Slightly worn,
  slightly sun-bleached, genuinely fond of its residents.
- **No filler enthusiasm.** Baoba does not use exclamation marks he has not
  earned, and the app does not either.

### Words to prefer and avoid

| Prefer | Avoid |
| --- | --- |
| stays with you, sticks around | assigned, granted, awarded |
| wanders off | despawns, is removed, you lose it |
| works with you | is used, is equipped |
| upkeep, the day's work | quests, missions, chores |
| bond | affection score, loyalty points |

## Open vocabulary questions

The setting introduces terms that overlap with the existing ubiquitous language.
Three of the four below are now resolved, by ADR and by `CONTEXT.md` itself; the
fourth is still open.

- **Ranger vs. Trainer — resolved.** Ranger is the interface's register for
  Trainer, not a second concept and not a rename: the database, the code, and
  `CONTEXT.md` keep saying Trainer. See ADR-0005 and `CONTEXT.md`'s Trainer and
  Ranger entries.
- **Warden — resolved.** Baoba is a domain term after all: he's the only surface
  that states why a bad day costs something, and appears in the dialogue tray on
  every visit to the field screen, not only the intro modal. See `CONTEXT.md`'s
  Warden Baoba entry.
- **The reserve / Safari Zone — resolved.** It became **Zone**: presentation
  over the existing draw, exactly as anticipated here — one of six areas a
  Species (not an Instance) stands in on the encounter view, the pool draw
  itself untouched. See `CONTEXT.md`'s Zone entry.
- **"Wandering by."** Still open. The pool draw already has the right shape for
  this. The fiction adds nothing mechanical — it renames a random selection into
  a thing with a reason.

## Where this shows up

- **First run:** Baoba's intro modal. The only long-form prose in the app.
- **Home:** the reserve as the setting for the active Pokémon, and today's work
  as the reason you are both standing there.
- **Pokédex:** framed as the Ranger's field research, not a collection checklist.
- **Empty state (no Pokémon):** the reserve is quiet. Do the work and something
  will come by. Never phrased as a punishment.

## Mockups

Retired (#33). Three UI directions were built against this setting to find the
interface before implementation started; the app is the source of truth for
its own appearance now. `UI-CONSTRAINTS.md` carries forward the surface,
touch and animation rules the implementation still answers to.

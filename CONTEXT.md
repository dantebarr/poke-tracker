# Context: Poke Tracker

The ubiquitous language for this project. Glossary only — no implementation
details, no specs. If a term here disagrees with the code, one of them is wrong
and it is worth finding out which.

Poke Tracker is a gamified task tracker: finishing tasks feeds a bond with an
assigned Pokémon, which grows and evolves when cared for and leaves when
neglected. It supersedes **Jarvis HUD**, whose task vocabulary it inherits
wholesale except where noted below.

## Language

### Core

**Trainer**:
A person who uses Poke Tracker. Owns their own tasks, their own Pokémon, and
their own settings — nothing is shared between trainers.
_Avoid_: User, account, player
_See also_: Ranger, the interface's register for this same concept.

**Ranger**:
The Safari Zone interface's word for a **Trainer** — the same concept, addressed differently on
screen, not a second one. Warden Baoba, the status strip, and every screen's copy say Ranger;
the domain model, the code, and this glossary keep saying Trainer. See ADR-0005.
_Avoid_: as a domain term outside interface copy — describe the concept as Trainer instead.

**Task**:
The unit of work. Has a title, a due date, a label, a size, and optional
notes. Every task belongs to exactly one trainer.

**Notes**:
Free text a trainer attaches to a task. Optional and inert — it earns nothing,
affects no part of the loop, and is visible only when a task is open.
_Avoid_: Description, details, body

**Label**:
Which area of life a task belongs to. Every task has exactly one. The set of
available labels is **defined by each trainer** in their settings — a closed set
per trainer, not a closed set for the app.
_Avoid_: Project, category, tag

**Panel**:
A region of the home screen devoted to one thing — stats, the Pokémon, the task
list. Inherited from Jarvis HUD, where it anticipated email and calendar
panels that were never built.

### Status

**Open**:
Not finished. The default state of a task and the primary thing the app shows.

**Done**:
Finished, and **terminal** — a task cannot be un-completed, and cannot be
deleted either. Done tasks are
history, not content: kept, grouped by the day they were completed, and
collapsed out of the primary view. Terminality is what keeps a task's record
and the day ledger from ever disagreeing.

**In progress**:
Removed. Jarvis HUD carried a third status between Open and Done on the theory
that its non-use was an interface problem; given a first-class control it still
went unused, so the vocabulary is genuinely binary. Deliberately not carried
over — do not reintroduce it.

### Time

**Day**:
A calendar day in the trainer's own time zone, read from their device when the
app starts. The unit everything in the game loop is measured in.

**Bucket**:
How open tasks are grouped for reading, by due date relative to today:
**Overdue** (due before today), **Today**, **Tomorrow**, **Later** (beyond
tomorrow). Buckets replace raw dates as the thing you read.

**Settlement**:
Working out what each unsettled day did to the trainer's Pokémon. Days are
settled one at a time, in order, up to yesterday — never in aggregate.

**Missed day**:
A day that was never settled at the time because the trainer didn't open the
app. It is settled later like any other day and carries no amnesty: nothing
completed means the target was missed.

### The Loop

**Effort points**:
What a task is worth when completed. **Small** is 1, **Medium** is 2, **Large**
is 3.
_Avoid_: Score, XP, value

**Size**:
A task's cost, one of Small / Medium / Large. The only thing that determines its
effort points.

**Daily target**:
The effort points a trainer aims to earn in a day. Set by the trainer, and the
bar every day is judged against. Never below one — a target of zero would make
every absent day neutral, so neglect would *earn* Pokémon instead of costing
them.

**Delta**:
Effort points earned in a day minus the daily target. The single number that
decides what a day did: a day at or above target is good, below is bad.

**Happiness**:
How well the **active** Pokémon is being cared for. Starts at zero, moves by the
delta every day — a big surplus banks real slack, a big shortfall burns it — and
is not capped. It belongs to the **trainer**, not to any Pokémon: only one
Pokémon is ever active, and happiness resets to zero the moment one leaves.

**Bond level**:
How far a specific Pokémon has come with its trainer. Rises on good days,
**never falls** — not on bad days, and not when the Pokémon leaves. It belongs
to the **instance**, is that Pokémon's permanent record, and is what evolution
and Pokédex entries are gated on.

**Leaves**:
What a Pokémon does when its happiness falls below zero. It returns to the pool
in its current form, keeping its bond level; happiness resets to zero. The
trainer has no Pokémon until they hit their daily target again — and the new
arrival is credited with that qualifying day's delta as its starting happiness.

**Day ledger**:
The append-only record of what every settled day did — points earned, the target
at the time, the resulting delta, and which Pokémon was active. A settled day is
**immutable**: re-opening a task completed last Tuesday does not change what
Tuesday was worth.

### Pokémon

**Species**:
One of the original 151, and the shared facts about it — name, sprite,
evolutions, and the levels those evolutions happen at. Identical for every
trainer and never changes.

**Zone**:
The habitat a Species stands in on the Safari Zone interface's encounter view, one of six areas.
Belongs to the **Species**, not the **Instance**: the Pool is fixed for life, so an Instance-held
Zone would be decided once at signup and never carry meaning again. Every Instance of a given
Species is met in the same Zone.

**Instance**:
One specific Pokémon belonging to one trainer, carrying its own bond level, its
current species, and its nickname. Two trainers' Charmanders are unrelated, and
so are a trainer's three Eevees. An instance's species changes when it evolves;
its identity doesn't.
_Avoid_: Copy, slot, card

**Active Pokémon**:
The instance currently with the trainer. There is at most one, and a trainer can
have none. A trainer is granted their first at signup, at happiness zero.

**Pool**:
Every instance a trainer owns. Created in full at signup: **one instance per
evolutionary line**, plus an extra instance per branch where a line splits (so
three Eevees). A trainer never gains or loses instances — the pool is fixed for
life, and being drawn a second time means meeting the same instance again, in
whatever form you left it in.

**Bond requirement**:
The bond level at which a species' Pokédex entry unlocks and, if it has an
evolution, its evolve button appears. **Cumulative across a line**: each step
adds the levels that step would take in the games, divided by four and clamped
between 2 and 7. Charmander is 4; Charmeleon is 4 + 5 = 9; Charizard, which
evolves no further, adds the default 7 for 16. Steps that don't happen by
levelling — stones, friendship, trade — and final forms all use 7.

**Evolving**:
Trading an instance's current species for the next one in its line. It is the
trainer's choice and never automatic: reaching the bond requirement only offers
it. An instance can sit at its bond requirement indefinitely, still gaining
bond — and a trainer who banks bond that way can evolve twice in a row, since
the second step's requirement may already be met by the time the first is taken.

**Pokédex entry**:
A species' entry, unlocked at the moment an instance **is** that species and has
met its bond requirement — never before. Bond alone isn't enough: a Charmander
at bond 9 has no Charmeleon entry. Nor is being the species enough: a
Charmander at bond 14 that evolves twice ends up a Charizard with no Charizard
entry, and has to reach bond 16 to earn it. Limited to the original 151.

**Nickname**:
A name the trainer gives a Pokémon when it arrives.

**Naming**:
The moment a trainer gives their **Active Pokémon** its **Nickname**. Offered whenever the Active
Pokémon has none — on arrival, and again on every later visit if skipped — and never offered to a
returning instance, which keeps the Nickname it already has.

### Interface

Vocabulary the Safari Zone interface (mockup B) introduces. See ADR-0004 and ADR-0005.

**Warden Baoba**:
The Safari Zone's warden, and the only surface in the interface that states **why** a bad day
costs something. Speaks in a dialogue tray on every visit to the field screen, narrating facts the
loop has already computed — never a second source of truth for them.

**Field log**:
The interface's name for a trainer's **task** list.

**Logbook**:
The interface's name for the **day ledger**.

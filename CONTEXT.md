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
Finished. A done task cannot be **deleted** — it is the only record that the
work happened. It can be **reopened**. Done tasks are history, not content:
kept, grouped by the day they were completed, and collapsed out of the primary
view.

**Reopen**:
Sending a done task back to **Open**. Its completion is erased — the timestamp,
and the Pokémon that completion credited — so a reopened task is
indistinguishable from one never completed; there is no third state. The day it
was completed on loses its points, if that day is still in progress; a day
already settled is unaffected, because its ledger row is a snapshot (see **Day
ledger**). See ADR-0002.
_Avoid_: Un-complete, un-tick, undo

**In progress**:
Removed. Jarvis HUD carried a third status between Open and Done on the theory
that its non-use was an interface problem; given a first-class control it still
went unused, so the vocabulary is genuinely binary. Deliberately not carried
over — do not reintroduce it.

### Time

**Day**:
A calendar day in the trainer's own time zone — a setting the trainer sets in
Settings, never detected from their device (see ADR-0004). The unit everything
in the game loop is measured in.

**Bucket**:
How open tasks are grouped for reading, by due date relative to today:
**Overdue** (due before today), **Today**, **Tomorrow**, **Later** (beyond
tomorrow). Buckets replace raw dates as the thing you read.

**Settlement**:
Working out what each unsettled day did to the trainer's Pokémon. Days are
settled one at a time, in order, up to yesterday — never in aggregate. It runs
*between* days, not during one: a Pokémon **leaves** or **arrives** at that
boundary, so a **day ledger** row records only who was with the trainer during
the day itself.
_Avoid_: overnight — interface flavour, not the domain term.

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
is not capped. It belongs to the **trainer**, not to any Pokémon, and it is
never reset: the only thing that ever pulls it back is a **clamp at zero**, when
a day's delta would take it negative. That clamp *is* a departure — a Pokémon
**leaves** at exactly the moment happiness would have gone below zero, so the
two are one event, not two rules. Nothing else touches it. Happiness therefore
survives a **parting**, and survives the pokemon-less days that follow one,
where it sits still (a bad day with nobody there costs nothing) until an
**arrival** picks it back up. See ADR-0009.

**Bond level**:
How far a specific Pokémon has come with its trainer. Rises on good days,
**never falls** — not on bad days, not when the Pokémon **leaves**, and not when
the trainer **parts** with it. A good day still earns its level even when it is
the last day the two spend together: the level is earned by the work, not by
what happens at the boundary afterwards. It belongs to the **instance**, is
that Pokémon's permanent record, and is what evolution and Pokédex entries are
gated on.

**Leaves**:
What a Pokémon does when its happiness would fall below zero — the Pokémon's own
act, driven by neglect, and never the trainer's choice. It happens at
**settlement**, after the day that caused it: the day's ledger row still names
the Pokémon, because it was there for all of it. It returns to the pool in its
current form, keeping its bond level; happiness is clamped to zero, which is the
same event (see **Happiness**). Contrast **Parting**, the other way a Pokémon
stops being active — and the one that keeps the happiness.

**Parting**:
The trainer's deliberate end to their time with the **active** Pokémon, chosen
during a day and taking effect at that day's **settlement**, exactly where a
departure by neglect would. Everything after the boundary is identical: the
Pokémon returns to the **pool** in its current form, keeping its bond level and
its nickname, and the trainer spends the next day alone. The one difference is
what the trainer keeps — happiness is not clamped, because it never went
negative, so it carries to whoever arrives next.

A parting is a choice, not a failure, and the two never both happen: if the
parting day's own delta would take happiness below zero, the Pokémon **leaves**
and the day is recorded that way. The trainer missed the target, the row's delta
says so, and calling that a parting would let the app flatter a day that was
lost.
_Avoid_: Release (the **pool** is fixed for life — nothing is ever released),
abandon, remove.

**Arrival**:
The Pokémon a trainer earns by hitting their daily target on a day they had
none. Drawn from the **pool** at **settlement**, it is active from the *next*
day — never the qualifying day, which the trainer spent alone — and starts with
whatever happiness the trainer was already carrying plus that day's delta. That
carried figure is zero after a departure by neglect and non-zero after a
**parting**, which is the whole of the difference between them. It gains no
bond level for a day it wasn't there for.
_Avoid_: Attracted, encounter (the interface's **encounter view** is unrelated).

**Approaching**:
What a day is called when the trainer hit their target with no Pokémon: the day
that earns an **arrival**. Its ledger row names no Pokémon, since none was there
yet.

**Day ledger**:
The append-only record of what every settled day did — points earned, the target
at the time, the resulting delta, and which Pokémon was active. A settled day is
**immutable**: its row is a **snapshot**, authoritative for that day, and is
never recomputed from the tasks behind it. Reopening a task completed last
Tuesday therefore does not change what Tuesday was worth — not because the task
is beyond reach, but because Tuesday's row no longer reads from it.

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
_Note_: where interface copy talks about moving to a new **area** — the **field menu**'s
"MOVE ON" — it is the **Ranger** who moves, never the Species. A Species cannot change Zone.

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

Vocabulary the Safari Zone interface (mockup B) introduces. See ADR-0008 and ADR-0005.

**Warden Baoba**:
The Safari Zone's warden, and the only surface in the interface that states **why** a bad day
costs something. Speaks in a dialogue tray on every visit to the field screen, narrating facts the
loop has already computed — never a second source of truth for them.

**Encounter view**:
The interface's name for the scene a trainer's **Active Pokémon** stands in, in its **Zone**.

**Field log**:
The interface's name for a trainer's **task** list.

**Logbook**:
The interface's name for the **day ledger**.

**Field menu**:
The collapsed menu in the corner of the **encounter view**, holding the actions a Ranger takes
on their **Active Pokémon** rather than ones the app offers them. Today it holds one, "MOVE ON"
— the interface's word for a **Parting**, framed as the Ranger moving on to a new area of the
Safari Zone while the Pokémon stays in its own **Zone**. Absent entirely when there is no Active
Pokémon.

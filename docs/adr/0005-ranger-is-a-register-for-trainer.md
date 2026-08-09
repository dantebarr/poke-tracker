# Ranger is a UI register for Trainer, not a second domain concept

**Status:** accepted

The Safari Zone interface (#18) addresses the person using the app as a **Ranger** throughout —
Warden Baoba's dialogue, the status strip, every screen's copy. The domain model still knows
exactly one concept for that person: **Trainer**, as `CONTEXT.md` has always defined it.

This is recorded because the glossary's existing `_Avoid_` list for Trainer (User, account,
player) already trains a reader to treat any second word for this concept as drift to be rejected.
Ranger would default to reading the same way — a new entity, or worse a silent rename — without a
decision saying otherwise. It's neither: Ranger is vocabulary for interface copy only, chosen
because the fiction is a field station and "Trainer" doesn't fit its register. Every server
action, every table, every ADR, and every other doc in this repo keeps saying Trainer.

Considered and rejected: renaming Trainer to Ranger throughout the codebase and glossary. Would
make the domain model itself read as reserve-specific fiction, and would collide with **Account**
(the Supabase `auth.users` identity — see `CLAUDE.md`), an existing, distinct concept that has
nothing to do with the Safari Zone framing.

**Consequence:** code, migrations, and domain docs never say Ranger. Only interface copy does. A
future comment or commit message describing the domain should still say Trainer.

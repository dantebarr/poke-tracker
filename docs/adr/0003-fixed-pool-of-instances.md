# The pool is a fixed set of instances, created once at signup

**Status:** accepted

A trainer's pool is created in full when they sign up: one instance per Gen 1 evolutionary line,
plus an extra per branch where a line splits — 80 rows (78 lines, with Eevee contributing three).
Instances are never added or removed. Being drawn a Pokémon you've met before means meeting *that
same instance*, in whatever form you left it in, with its bond level intact.

This is what makes evolution one-way and permanent. There is exactly one Charmander line per
trainer, so evolving it into Charizard means Charmander is gone for good — not gone from the
Pokédex, but genuinely unobtainable again. Bond therefore belongs to the instance and never
resets, and a trainer's collection is a record of what they did rather than a rolling inventory.

Considered and rejected: creating instances lazily on first encounter. It's fewer rows, but the
branching-exclusion rule ("you may only evolve into a form you don't already have") has to inspect
instances that may not exist yet, and the pool becomes a computed set rather than a queryable one.

**Consequence:** close to impossible to unwind later. Changing the pool's shape — adding
generations, making instances repeatable, resetting bond on evolution — would have to reconcile
against instances that already carry bond levels earned under the old rules.

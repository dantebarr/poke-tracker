Got it — updating the doc with those clarifications:

---

## Poke Tracker — Project Description

### Overview
A gamified, Pokémon-themed task tracker for personal use. Completing tasks builds a bond with an assigned Pokémon over time — care for it well and it evolves; neglect it and it leaves.

### Core Loop
- On start, the user is assigned a Pokémon, shown as a sprite on the home screen.
- Tasks are sized **Small / Medium / Large**, worth **1 / 2 / 3 effort points** respectively.
- The user sets a **daily target effort score** (configurable).
- At the end of each day, the system calculates the **delta**: `points earned − daily target`.
  - **Delta ≥ 0:** happiness increases, bond level increases.
  - **Delta < 0:** happiness decreases, bond level stays the same.
  - **If happiness drops below 0:** the Pokémon leaves. The user has no Pokémon until they meet or exceed their daily target again — a new Pokémon then appears the following day.
- Each task record includes a field for which Pokémon it was completed with (nullable, since tasks can be completed with no active Pokémon).

### Bond Level & Evolution
- A Pokémon arrives with **happiness = 0** and keeps whatever bond level it had if re-encountered later.
- **Bond level requirement to evolve** = (number of levels needed to evolve) ÷ 4, clamped between **2 and 7**.
  - Pokémon that evolve by non-level means (stones, friendship, etc.) or don't evolve at all: bond level requirement is **7**.
- Reaching a Pokémon's bond level requirement unlocks its **Pokédex entry** and, if applicable, the option to **evolve** it.
- Pokédex is limited to the **original 151**.
- **Branching evolutions (e.g. Eevee):** when the user chooses which form to evolve into, they can only pick a form they don't currently have in their pool. Eevee has 3 Gen 1 evolutions — Vaporeon, Jolteon, Flareon.

### Pokémon Pool
- Each user has a pool containing the **base forms of all 151**, with duplicates for branching evolutions (3 Eevee entries, one per possible evolution).
- New Pokémon are drawn **at random** from this pool, so repeats are possible.
- When a Pokémon leaves, it **keeps its current bond level** and returns to the pool (in whatever form it was in — base or evolved).
- On arrival, the user can give the Pokémon a **nickname**.

### Tech Stack
- **Framework:** Next.js, deployed on Vercel
- **Database:** Supabase or Neon (whichever fits better)
- **Auth:** Google OAuth, restricted to an allow-list (just me, for now)
- **Update model:** Lazy reload — backend recalculates rollover, missed days, happiness deltas, etc. only on login, not continuously

### Screens
1. **Home Screen** — Center: Pokémon sprite. Left: stats (bond level, happiness, today's effort) + task creation. Right: task list.
2. **Settings Screen** — configuration (daily target effort, etc.)
3. **Pokédex Screen** — unlocked entries for the original 151

---
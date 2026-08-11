import { buildEncounterView, type MoodTier } from "@/lib/pokemon/encounter-view";
import type { ActivePokemon } from "@/lib/pokemon/pokemon";
import type { LatestDayLedgerEvent } from "@/lib/settlement/ledger";
import { capitalise } from "@/lib/text";

/**
 * Everything Warden Baoba's line (#23) is chosen from — every one of them
 * already loaded by the field screen for something else. See CONTEXT.md's
 * "Warden Baoba" entry: he narrates facts the loop has already computed,
 * never a second source of truth for them, which is why this takes the same
 * `pokemon`/`dailyTarget` pair the encounter view does rather than a mood
 * already picked — `buildBaobaLine` reuses `buildEncounterView` itself so
 * the two surfaces can never disagree.
 */
export type BaobaLineFacts = {
  pokemon: ActivePokemon | null;
  dailyTarget: number;
  /** The most recently settled day's event — null when the trainer has no settled days yet. */
  latestDay: LatestDayLedgerEvent;
  /** Met its species' bond requirement and has somewhere to evolve to — the same gate the evolve prompt (#25) sits behind. */
  readyToEvolve: boolean;
  overdueCount: number;
};

const MOOD_LINES: Record<MoodTier, (nickname: string) => string> = {
  sad: (nickname) => `${nickname}'s not looking good, Ranger — one more bad day and it's gone for good.`,
  worried: (nickname) => `${nickname}'s restless. Best not let it go another quiet day.`,
  neutral: (nickname) => `${nickname}'s settled in fine, Ranger — steady as you keep it.`,
  happy: (nickname) => `${nickname}'s content, and banking a good stretch of slack.`,
  beaming: (nickname) => `${nickname}'s thriving, Ranger — couldn't ask for better care.`,
};

function overdueClause(overdueCount: number): string {
  if (overdueCount === 0) return "";
  return ` ${overdueCount} job${overdueCount === 1 ? "" : "s"} already late.`;
}

/**
 * Warden Baoba's line (#23): an ordered rule list over already-loaded facts,
 * issuing no query of its own. Special states — an arrival, a departure,
 * readiness to evolve, having no Active Pokémon at all — are checked before
 * falling back to the Happiness tier, and an Overdue clause is appended
 * wherever there's a job late, regardless of which line fired. The copy
 * lives here, next to the rules it belongs to, so adding a line never means
 * touching a component.
 */
export function buildBaobaLine(facts: BaobaLineFacts): string {
  const overdue = overdueClause(facts.overdueCount);
  const view = buildEncounterView(facts.pokemon, facts.dailyTarget);

  if (view.hasPokemon && facts.latestDay?.event === "arrived") {
    return `${view.nickname}'s turned up at camp, Ranger — go say hello.${overdue}`;
  }

  // Guarded on `!view.hasPokemon`, the same way the arrival branch above is
  // guarded on the opposite — `pokemon` and `latestDay` come from two
  // independent reads (page.tsx's `Promise.all`), so a settlement landing
  // between them could otherwise leave this narrating a departure the scene
  // hasn't caught up to yet. Falling through instead means the two panes can
  // never contradict each other, even for that one stale render.
  if (!view.hasPokemon && facts.latestDay?.event === "left") {
    const name = capitalise(facts.latestDay.pokemonName ?? "Your Pokémon");
    return `${name} couldn't wait any longer and slipped off — missed the target by ${-facts.latestDay.delta} yesterday. Hit it again and another will come find you.${overdue}`;
  }

  // `view.prompt` here can only ever be `"naming"` or `null` — this call
  // passes no evolution options, so it never resolves `"evolve"` itself —
  // but that's enough to know whether the naming prompt (#24) would win the
  // same precedence encounter-view.ts's `buildEncounterView` enforces for
  // real: an un-named Instance that's also ready to evolve gets the naming
  // box, not the evolve one, and Baoba shouldn't say otherwise.
  if (view.hasPokemon && facts.readyToEvolve && view.prompt !== "naming") {
    return `${view.nickname}'s come as far as it can as what it is, Ranger. Say the word and it'll take the next step.${overdue}`;
  }

  if (!view.hasPokemon) {
    return `No Pokémon keeping you company right now, Ranger. Hit your daily target and one's bound to come find you.${overdue}`;
  }

  return `${MOOD_LINES[view.mood.tier](view.nickname)}${overdue}`;
}

import type { EvolutionOption } from "@/lib/pokemon/evolution";
import type { ActivePokemon } from "@/lib/pokemon/pokemon";
import { capitalise } from "@/lib/text";

/**
 * The five happiness tiers (#22), cut by **slack** — happiness measured in
 * daily targets, i.e. how many quiet days are banked — never by the raw
 * value. Doubles as the mood asset name (`/mood/{tier}.svg`).
 */
export type MoodTier = "sad" | "worried" | "neutral" | "happy" | "beaming";

export type EncounterMood = {
  tier: MoodTier;
  label: string;
  /** Below one day of banked slack, the one thing in the status box allowed to draw attention to itself. */
  warn: boolean;
};

export type EncounterBond = {
  level: number;
  requirement: number;
  /** 0-100, clamped at 100 once the requirement is met — the bar stays full while `level` keeps counting past it. */
  percent: number;
};

/**
 * Which prompt-box slot (#24, #25) the encounter view is offering, decided
 * here rather than by whichever component renders it — see CONTEXT.md's
 * "Naming" and "Evolving" entries. `"naming"` fires on a Nickname of `null`;
 * `"evolve"` fires once the caller hands over a non-empty `evolutionOptions`
 * — itself already gated on the bond requirement being met, so this function
 * never re-derives that gate. The two share one slot and can't both show:
 * naming wins when both are true at once, which only happens to an instance
 * that sat at its requirement, left un-named and un-evolved, and has now
 * returned still meeting it — the evolve prompt just waits for the next
 * visit, since bond banked at the requirement never goes away.
 */
export type EncounterPrompt = "naming" | "evolve" | null;

export type EncounterView =
  | { hasPokemon: false }
  | {
      hasPokemon: true;
      nickname: string;
      speciesName: string;
      speciesNumber: number;
      zone: string;
      spritePath: string;
      mood: EncounterMood;
      bond: EncounterBond;
      prompt: EncounterPrompt;
    };

const MOOD_TIERS: { max: number; tier: MoodTier; label: string }[] = [
  { max: 0, tier: "sad", label: "Gone" },
  { max: 1, tier: "worried", label: "Restless" },
  { max: 2, tier: "neutral", label: "Settled" },
  { max: 4, tier: "happy", label: "Content" },
  { max: Infinity, tier: "beaming", label: "Thriving" },
];

/** Happiness measured in daily targets, cut at 0, 1, 2 and 4 — see CONTEXT.md's "Happiness" entry. */
function moodFor(happiness: number, dailyTarget: number): EncounterMood {
  const slack = happiness / dailyTarget;
  const { tier, label } = MOOD_TIERS.find((t) => slack < t.max) ?? MOOD_TIERS[MOOD_TIERS.length - 1];
  return { tier, label, warn: slack < 1 };
}

/** Climbs toward `requirement` and stays full past it, while `level` keeps counting — see CONTEXT.md's "Bond level" entry. */
function bondFor(level: number, requirement: number): EncounterBond {
  const percent = requirement <= 0 ? 100 : Math.min(100, Math.round((level / requirement) * 100));
  return { level, requirement, percent };
}

/**
 * The whole view model for the encounter view (#22) — the pane's one pure
 * function. The component renders this and derives nothing of its own: no
 * numeric happiness ever reaches it, and the mood/bond math lives here so it
 * stays covered by tests that never touch a database.
 *
 * `evolutionOptions` decides `"evolve"` outright — pass an empty list when
 * there's nothing to evolve into, whether that's because the bond
 * requirement isn't met yet or the instance's line has no further target.
 * Callers gate the database lookup behind the requirement themselves (see
 * `@/lib/pokemon/session`'s `currentEvolutionOptions`); this function only
 * ever reads whether the list it was handed is empty.
 */
export function buildEncounterView(
  pokemon: ActivePokemon | null,
  dailyTarget: number,
  evolutionOptions: EvolutionOption[] = [],
): EncounterView {
  if (!pokemon) {
    return { hasPokemon: false };
  }

  const speciesName = capitalise(pokemon.species.name);

  const prompt: EncounterPrompt =
    pokemon.nickname === null ? "naming" : evolutionOptions.length > 0 ? "evolve" : null;

  return {
    hasPokemon: true,
    nickname: pokemon.nickname ?? speciesName,
    speciesName,
    speciesNumber: pokemon.species.id,
    zone: pokemon.species.zone,
    spritePath: pokemon.species.animatedSpritePath,
    mood: moodFor(pokemon.happiness, dailyTarget),
    bond: bondFor(pokemon.bondLevel, pokemon.bondRequirement),
    prompt,
  };
}

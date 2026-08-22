import type { EvolutionOption } from "@/lib/pokemon/evolution";
import type { ActivePokemon } from "@/lib/pokemon/pokemon";
import { capitalise } from "@/lib/text";

export type EncounterBond = {
  level: number;
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

/**
 * What the field menu (#5) offers. A list rather than a single value so a
 * second action is copy rather than restructuring — today the two entries
 * are the two directions of one decision, and exactly one of them is ever
 * offered at a time. The `CLOSE` row that returns the menu to its icon is
 * chrome, not an item: it costs nothing and is always there.
 */
export type FieldMenuItem = "move-on" | "cancel-move";

export type EncounterView =
  | { hasPokemon: false; fieldMenu: null }
  | {
      hasPokemon: true;
      nickname: string;
      speciesName: string;
      speciesNumber: number;
      zone: string;
      spritePath: string;
      bond: EncounterBond;
      prompt: EncounterPrompt;
      /** A Parting is set for today — the status box's `MOVING ON` marker (#5). */
      parting: boolean;
      fieldMenu: FieldMenuItem[];
    };

/**
 * Climbs toward `requirement` and stays full past it, while `level` keeps
 * counting — see CONTEXT.md's "Bond level" entry.
 *
 * The requirement itself never reaches the view. Bond is free to rise
 * forever, so putting a ceiling next to it ("7 / 7") would name a limit that
 * isn't one; the bar carries the distance to the next thing bond unlocks and
 * the bare number carries how far this instance has come. Past the last
 * requirement in a line the bar simply stays full — there is nothing further
 * gated on it, and that is the honest reading.
 */
function bondFor(level: number, requirement: number): EncounterBond {
  const percent = requirement <= 0 ? 100 : Math.min(100, Math.round((level / requirement) * 100));
  return { level, percent };
}

/**
 * The whole view model for the encounter view (#22) — the pane's one pure
 * function. The component renders this and derives nothing of its own.
 *
 * Happiness is deliberately absent, and so is the `dailyTarget` this used to
 * take alongside it: it is a background number with no surface of its own —
 * no face, no bar, no label — and Warden Baoba's dialogue
 * (`@/lib/baoba/dialogue`) is the only place a Ranger ever feels it. Don't
 * reintroduce it here; the mood bands and the copy they pick live together
 * next to the one surface that speaks them.
 *
 * `parting` decides both the `MOVING ON` marker and what the field menu
 * offers — the components keep deriving nothing of their own. The menu is
 * `null`, not empty, when there is no Active Pokémon: an empty menu is worse
 * than no menu, and there is nothing a Ranger can do to a Pokémon they
 * haven't got (CONTEXT.md's "Field menu" entry).
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
  evolutionOptions: EvolutionOption[] = [],
  parting: boolean = false,
): EncounterView {
  if (!pokemon) {
    return { hasPokemon: false, fieldMenu: null };
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
    bond: bondFor(pokemon.bondLevel, pokemon.bondRequirement),
    prompt,
    parting,
    fieldMenu: [parting ? "cancel-move" : "move-on"],
  };
}

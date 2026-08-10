import { evolvePokemon } from "@/app/actions/pokemon";
import type { EvolutionOption } from "@/lib/pokemon/evolution";
import { capitalise } from "@/lib/text";

/**
 * The evolve prompt's buttons (#25), rendered in two shapes by
 * `PokemonPane` — `variant="box"` for the desktop corner slot
 * `EncounterView` exposes, `variant="fold"` for the mobile slot inside
 * Warden Baoba's tray `BaobaTray` exposes (globals.css's `.evolve`/
 * `.evolvesay` decide, per breakpoint, which one is actually visible) —
 * mirroring `@/app/naming-prompt`'s split exactly, the two prompts sharing
 * one slot (CONTEXT.md's "Evolving" entry).
 *
 * No skip: an Instance can sit at its bond requirement indefinitely, so
 * there is nothing to dismiss, unlike the naming prompt's session-scoped
 * Skip. One `<form>` per option, each stamping the same hidden
 * `expectedSpeciesId` the caller's own render saw — the guard
 * `evolve_instance` enforces server-side against a stale resubmission (a
 * double-click racing itself), see `@/lib/pokemon/evolution`.
 */
const COPY: Record<"box" | "fold", { wrapClass: string; labelClass: string }> = {
  box: { wrapClass: "evolve textbox", labelClass: "head" },
  fold: { wrapClass: "lines evolvesay", labelClass: "who" },
};

export function EvolvePrompt({
  instanceId,
  expectedSpeciesId,
  nickname,
  options,
  variant,
}: {
  instanceId: string;
  expectedSpeciesId: number;
  nickname: string;
  options: EvolutionOption[];
  variant: "box" | "fold";
}) {
  const copy = COPY[variant];

  return (
    <div className={copy.wrapClass}>
      <div className={copy.labelClass}>! READY TO CHANGE</div>
      <p>{nickname} trusts you enough to evolve.</p>
      <div className="evolveactions">
        {options.map((option) => (
          <form key={option.speciesId} action={evolvePokemon}>
            <input type="hidden" name="instanceId" value={instanceId} />
            <input type="hidden" name="expectedSpeciesId" value={expectedSpeciesId} />
            <input type="hidden" name="targetSpeciesId" value={option.speciesId} />
            <button type="submit" className="primary">
              {capitalise(option.name)}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}

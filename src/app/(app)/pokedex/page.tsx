import { redirect } from "next/navigation";

import { PokedexPanel } from "@/app/pokedex-panel";
import { currentActivePokemon, currentDexLine, currentPokedex } from "@/lib/pokemon/session";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * The Pokédex, as a screen of its own (#13): the original 151, read-only,
 * unlocked entries shown in full and locked ones as silhouettes. See
 * CONTEXT.md's "Pokédex entry" for the unlock rule this screen only ever
 * reads — never derives from what an instance currently is. Alongside the
 * entries it reads the Ranger's current Pokémon and its evolutionary line, so
 * the panel can say which entries that Pokémon is working toward.
 *
 * Renders straight into the chrome layout's right pane (#33) — the stage,
 * the pane grid and the persistent left pane are the layout's now, not this
 * page's own wrapper.
 */
export default async function PokedexPage() {
  const trainer = await currentTrainer();

  if (!trainer) {
    redirect("/sign-in");
  }

  const [entries, active] = await Promise.all([currentPokedex(trainer.id), currentActivePokemon()]);
  const line = active ? await currentDexLine(active.species.id) : [];

  return (
    <PokedexPanel
      entries={entries}
      focus={
        active
          ? {
              pokemonName: active.nickname ?? active.species.name,
              speciesName: active.species.name,
              bondLevel: active.bondLevel,
              steps: line,
            }
          : null
      }
    />
  );
}

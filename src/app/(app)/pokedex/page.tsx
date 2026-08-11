import { redirect } from "next/navigation";

import { PokedexPanel } from "@/app/pokedex-panel";
import { currentPokedex } from "@/lib/pokemon/session";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * The Pokédex, as a screen of its own (#13): the original 151, read-only,
 * unlocked entries shown in full and locked ones as silhouettes. See
 * CONTEXT.md's "Pokédex entry" for the unlock rule this screen only ever
 * reads — never derives from what an instance currently is.
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

  const entries = await currentPokedex(trainer.id);

  return <PokedexPanel entries={entries} />;
}

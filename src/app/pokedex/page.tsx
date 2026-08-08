import Link from "next/link";
import { redirect } from "next/navigation";

import { PokedexPanel } from "@/app/pokedex-panel";
import { currentPokedex } from "@/lib/pokemon/session";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * The Pokédex, as a screen of its own (#13): the original 151, read-only,
 * unlocked entries shown in full and locked ones as silhouettes. See
 * CONTEXT.md's "Pokédex entry" for the unlock rule this screen only ever
 * reads — never derives from what an instance currently is.
 */
export default async function PokedexPage() {
  const trainer = await currentTrainer();

  if (!trainer) {
    redirect("/sign-in");
  }

  const entries = await currentPokedex(trainer.id);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Pokédex</h1>
        <Link className="text-sm text-accent underline underline-offset-4" href="/">
          Back to home
        </Link>
      </header>

      <PokedexPanel entries={entries} />
    </main>
  );
}

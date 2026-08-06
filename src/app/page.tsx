import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/actions/trainer";
import { PokemonPanel } from "@/app/pokemon-panel";
import { currentActivePokemon } from "@/lib/pokemon/session";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * Home. Eventually three panels — stats and task creation, the Pokémon, the
 * task list. For now it shows the signed-in trainer and their active
 * Pokémon, the centrepiece the rest of the game loop feeds.
 */
export default async function HomePage() {
  const trainer = await currentTrainer();

  // No trainer record means the account never cleared the allow-list at the
  // callback. There is nothing here for it.
  if (!trainer) {
    redirect("/sign-in");
  }

  const activePokemon = await currentActivePokemon();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Poke Tracker</h1>
        <form action={signOut}>
          <button type="submit" className="text-sm underline underline-offset-4">
            Sign out
          </button>
        </form>
      </header>

      <section className="rounded-lg border border-black/10 p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-black/60">
          Signed in as
        </h2>
        <p className="mt-2 text-lg">{trainer.displayName ?? trainer.email}</p>
        <p className="text-sm text-black/60">{trainer.email}</p>
      </section>

      <PokemonPanel pokemon={activePokemon} />

      <nav className="flex gap-4 text-sm">
        <Link className="underline underline-offset-4" href="/settings">
          Settings
        </Link>
        <Link className="underline underline-offset-4" href="/pokedex">
          Pokédex
        </Link>
      </nav>
    </main>
  );
}

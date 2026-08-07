import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/actions/trainer";
import { PokemonPanel } from "@/app/pokemon-panel";
import { StatsPanel } from "@/app/stats-panel";
import { TaskPanel } from "@/app/task-panel";
import { currentLabels } from "@/lib/label/session";
import { currentActivePokemon, currentEvolutionOptions } from "@/lib/pokemon/session";
import { currentTasks } from "@/lib/task/session";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * Home: the signed-in trainer, today's stats, their active Pokémon, and
 * their tasks. Full layout and theming land with the home layout slice
 * (#14) — this arrangement just needs to show what it shows.
 */
export default async function HomePage() {
  const trainer = await currentTrainer();

  // No trainer record means the account never cleared the allow-list at the
  // callback. There is nothing here for it.
  if (!trainer) {
    redirect("/sign-in");
  }

  const [activePokemon, tasks, labels] = await Promise.all([
    currentActivePokemon(),
    currentTasks(trainer.id),
    currentLabels(trainer.id),
  ]);

  // Only queried once the bond requirement is actually met — the same gate
  // the evolve button itself is under, so a trainer who isn't there yet
  // costs nothing extra.
  const evolutionOptions =
    activePokemon && activePokemon.distanceToBondRequirement === 0
      ? await currentEvolutionOptions(trainer.id, activePokemon.species.id)
      : [];

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

      <StatsPanel tasks={tasks} dailyTarget={trainer.dailyTarget} />

      <PokemonPanel pokemon={activePokemon} evolutionOptions={evolutionOptions} />

      <TaskPanel tasks={tasks} labels={labels} />

      <nav className="flex gap-4 text-sm">
        <Link className="underline underline-offset-4" href="/settings">
          Settings
        </Link>
        <Link className="underline underline-offset-4" href="/pokedex">
          Pokédex
        </Link>
        <Link className="underline underline-offset-4" href="/history">
          History
        </Link>
      </nav>
    </main>
  );
}

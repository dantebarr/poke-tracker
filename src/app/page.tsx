import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/actions/trainer";
import { createTaskAction } from "@/app/actions/task";
import { CreateTaskPanel } from "@/app/create-task-panel";
import { PokemonPanel } from "@/app/pokemon-panel";
import { StatsPanel } from "@/app/stats-panel";
import { TaskPanel } from "@/app/task-panel";
import { currentLabels } from "@/lib/label/session";
import { currentActivePokemon, currentEvolutionOptions } from "@/lib/pokemon/session";
import { currentTasks } from "@/lib/task/session";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * Home (#14): stats and task creation on the left, the active Pokémon in the
 * centre, the task list on the right. The three panels are placed by grid
 * column, independent of DOM order, so the Pokémon — first in the markup —
 * can lead the mobile stack (the acceptance criterion) while still landing
 * in the centre column at desktop widths.
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

  // `createTaskAction` returns the created task — useful to callers that
  // need it (the tests do). A `<form action>` must return `void`, so it's
  // wrapped here to discard that value, the same way the settings page
  // wraps the label actions.
  async function submitCreateTask(formData: FormData) {
    "use server";
    await createTaskAction(formData);
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-semibold">Poke Tracker</h1>
          <p className="text-sm text-muted">{trainer.displayName ?? trainer.email}</p>
          {trainer.displayName && <p className="text-xs text-muted">{trainer.email}</p>}
        </div>

        <nav className="flex flex-wrap items-baseline gap-4 text-sm">
          <Link className="text-accent underline underline-offset-4" href="/settings">
            Settings
          </Link>
          <Link className="text-accent underline underline-offset-4" href="/pokedex">
            Pokédex
          </Link>
          <Link className="text-accent underline underline-offset-4" href="/history">
            History
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-muted underline underline-offset-4">
              Sign out
            </button>
          </form>
        </nav>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(260px,300px)_minmax(320px,1fr)_minmax(280px,340px)] lg:items-start">
        <PokemonPanel
          pokemon={activePokemon}
          evolutionOptions={evolutionOptions}
          className="lg:col-start-2"
        />

        <div className="flex flex-col gap-6 lg:col-start-1">
          <StatsPanel tasks={tasks} dailyTarget={trainer.dailyTarget} />
          <CreateTaskPanel labels={labels} onCreate={submitCreateTask} />
        </div>

        <TaskPanel tasks={tasks} labels={labels} className="lg:col-start-3" />
      </div>
    </main>
  );
}

import { redirect } from "next/navigation";

import { TwoPaneStage } from "@/app/(app)/chrome/two-pane-stage";
import { createTaskAction } from "@/app/actions/task";
import { CreateTaskPanel } from "@/app/create-task-panel";
import { PokemonPanel } from "@/app/pokemon-panel";
import { TaskPanel } from "@/app/task-panel";
import { dayKeyInTimeZone } from "@/lib/day/day";
import { currentLabels } from "@/lib/label/session";
import { currentActivePokemon, currentEvolutionOptions } from "@/lib/pokemon/session";
import { todayPoints } from "@/lib/task/dates";
import { currentTasks } from "@/lib/task/session";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * Home / the field screen (#14, restyled by #21): the active Pokémon and
 * today's effort in the left pane, task creation and the task list in the
 * right — the stage's two-pane shell, with its content still exactly what
 * it was before the chrome (#21's brief: fill the shell, don't redesign
 * what's inside it yet).
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

  const todayKey = dayKeyInTimeZone(new Date(), trainer.timeZone);
  const points = todayPoints(tasks, trainer.timeZone, todayKey);

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
    <TwoPaneStage
      leftLabel="the Pokémon"
      rightLabel="the field log"
      left={
        <PokemonPanel
          pokemon={activePokemon}
          evolutionOptions={evolutionOptions}
          points={points}
          dailyTarget={trainer.dailyTarget}
        />
      }
      right={
        <div className="flex flex-col gap-6">
          <CreateTaskPanel labels={labels} onCreate={submitCreateTask} />
          <TaskPanel tasks={tasks} labels={labels} timeZone={trainer.timeZone} todayKey={todayKey} />
        </div>
      }
    />
  );
}

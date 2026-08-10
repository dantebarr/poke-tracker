import { redirect } from "next/navigation";

import { TwoPaneStage } from "@/app/(app)/chrome/two-pane-stage";
import { createTaskAction } from "@/app/actions/task";
import { CreateTaskPanel } from "@/app/create-task-panel";
import { EncounterView } from "@/app/encounter-view";
import { TaskPanel } from "@/app/task-panel";
import { dayKeyInTimeZone } from "@/lib/day/day";
import { currentLabels } from "@/lib/label/session";
import { currentActivePokemon } from "@/lib/pokemon/session";
import { currentTasks } from "@/lib/task/session";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * Home / the field screen (#14, restyled by #21, given its encounter view by
 * #22): the Active Pokémon's encounter scene in the left pane, task creation
 * and the task list in the right. Nickname editing and the evolve prompt
 * come back with #24 and #25, in the encounter view's own prompt-box slot —
 * this ticket is display-only. Today's effort against the Daily target,
 * previously shown here, moves to the Field log header with #28, which is
 * where mockup B draws it.
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
      left={<EncounterView pokemon={activePokemon} dailyTarget={trainer.dailyTarget} />}
      right={
        <div className="flex flex-col gap-6">
          <CreateTaskPanel labels={labels} onCreate={submitCreateTask} />
          <TaskPanel tasks={tasks} labels={labels} timeZone={trainer.timeZone} todayKey={todayKey} />
        </div>
      }
    />
  );
}

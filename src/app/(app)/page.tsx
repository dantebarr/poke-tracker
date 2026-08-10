import { redirect } from "next/navigation";

import { TwoPaneStage } from "@/app/(app)/chrome/two-pane-stage";
import { EncounterView } from "@/app/encounter-view";
import { FieldLogPanel } from "@/app/field-log-panel";
import { dayKeyInTimeZone } from "@/lib/day/day";
import { currentLabels } from "@/lib/label/session";
import { currentActivePokemon } from "@/lib/pokemon/session";
import { currentTasks } from "@/lib/task/session";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * Home / the field screen (#14, restyled by #21, given its encounter view by
 * #22, its right pane rebuilt as the field log by #28): the Active Pokémon's
 * encounter scene in the left pane, the field log — task creation and the
 * task list, restyled to mockup B and desktop only — in the right. Nickname
 * editing and the evolve prompt come back with #24 and #25, in the encounter
 * view's own prompt-box slot — that pane is display-only for now. Today's
 * effort against the Daily target lives in the Field log header (#28),
 * which is where mockup B draws it, not here.
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

  return (
    <TwoPaneStage
      leftLabel="the Pokémon"
      rightLabel="the field log"
      left={<EncounterView pokemon={activePokemon} dailyTarget={trainer.dailyTarget} />}
      right={
        <FieldLogPanel
          tasks={tasks}
          labels={labels}
          timeZone={trainer.timeZone}
          todayKey={todayKey}
          dailyTarget={trainer.dailyTarget}
        />
      }
    />
  );
}

import { redirect } from "next/navigation";

import { TwoPaneStage } from "@/app/(app)/chrome/two-pane-stage";
import { BaobaTray } from "@/app/baoba-tray";
import { EncounterView } from "@/app/encounter-view";
import { FieldLogPanel } from "@/app/field-log-panel";
import { buildBaobaLine } from "@/lib/baoba/dialogue";
import { dayKeyInTimeZone } from "@/lib/day/day";
import { currentLabels } from "@/lib/label/session";
import { currentActivePokemon, currentEvolutionOptions } from "@/lib/pokemon/session";
import { currentLatestDayLedgerEvent } from "@/lib/settlement/session";
import { bucketOpenTasks } from "@/lib/task/dates";
import { currentTasks } from "@/lib/task/session";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * Home / the field screen (#14, restyled by #21, given its encounter view by
 * #22, given Warden Baoba's dialogue tray by #23, its right pane rebuilt as
 * the field log by #28): the Active Pokémon's encounter scene and Baoba's
 * tray in the left pane, the field log — task creation and the task list,
 * restyled to mockup B and desktop only — in the right. Nickname editing and
 * the evolve prompt come back with #24 and #25, in the encounter view's own
 * prompt-box slot — that pane is otherwise display-only for now. Today's
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

  const [activePokemon, tasks, labels, latestDay] = await Promise.all([
    currentActivePokemon(),
    currentTasks(trainer.id),
    currentLabels(trainer.id),
    currentLatestDayLedgerEvent(trainer.id),
  ]);

  // Only worth asking once an instance has met its current species' bond
  // requirement — the same gate the evolve prompt (#25) itself sits behind.
  const evolutionOptions =
    activePokemon && activePokemon.distanceToBondRequirement === 0
      ? await currentEvolutionOptions(trainer.id, activePokemon.species.id)
      : [];

  const todayKey = dayKeyInTimeZone(new Date(), trainer.timeZone);
  // The same bucketing the field log itself groups by — Baoba's Overdue
  // clause can never drift from the Overdue group the Ranger is already
  // looking at.
  const overdueCount = bucketOpenTasks(
    tasks.filter((task) => task.status === "open"),
    todayKey,
  ).overdue.length;

  const baobaLine = buildBaobaLine({
    pokemon: activePokemon,
    dailyTarget: trainer.dailyTarget,
    latestDay,
    readyToEvolve: evolutionOptions.length > 0,
    overdueCount,
  });

  return (
    <TwoPaneStage
      leftLabel="the Pokémon"
      rightLabel="the field log"
      left={
        <>
          <EncounterView pokemon={activePokemon} dailyTarget={trainer.dailyTarget} />
          <BaobaTray line={baobaLine} />
        </>
      }
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

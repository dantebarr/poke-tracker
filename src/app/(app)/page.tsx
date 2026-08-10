import { redirect } from "next/navigation";

import { FieldScreen } from "@/app/field-screen";
import { PokemonPane } from "@/app/pokemon-pane";
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
 * the field log by #28, given a mobile surface by #29): the Active
 * Pokémon's encounter scene and Baoba's tray in the left pane, the field
 * log — task creation and the task list, restyled to mockup B — in the
 * right, and on a narrow screen, `FieldScreen` swaps the whole stage for
 * the full-screen task detail while one is open. Naming (#24) and the
 * evolve prompt (#25) both come back as `PokemonPane`'s shared prompt-box
 * slot. Today's effort against the Daily target lives in the Field log
 * header (#28), which is where mockup B draws it, not here.
 */
export default async function HomePage() {
  const trainer = await currentTrainer();

  // No trainer record means the account never cleared the allow-list at the
  // callback. There is nothing here for it.
  if (!trainer) {
    redirect("/sign-in");
  }

  // Fetched alone because the evolution-options query below depends on its
  // result — everything else that doesn't runs alongside that query instead
  // of waiting for it to finish first.
  const activePokemon = await currentActivePokemon();

  // Only worth asking once an instance has met its current species' bond
  // requirement — the same gate the evolve prompt (#25) itself sits behind.
  const [tasks, labels, latestDay, evolutionOptions] = await Promise.all([
    currentTasks(trainer.id),
    currentLabels(trainer.id),
    currentLatestDayLedgerEvent(trainer.id),
    activePokemon && activePokemon.distanceToBondRequirement === 0
      ? currentEvolutionOptions(trainer.id, activePokemon.species.id)
      : Promise.resolve([]),
  ]);

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
    <FieldScreen
      pokemonPane={
        <PokemonPane
          pokemon={activePokemon}
          dailyTarget={trainer.dailyTarget}
          evolutionOptions={evolutionOptions}
          baobaLine={baobaLine}
        />
      }
      tasks={tasks}
      labels={labels}
      timeZone={trainer.timeZone}
      todayKey={todayKey}
      dailyTarget={trainer.dailyTarget}
    />
  );
}

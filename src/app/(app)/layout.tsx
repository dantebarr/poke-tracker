import { redirect } from "next/navigation";

import { AppStage } from "@/app/(app)/chrome/app-stage";
import { FirstDayBriefing } from "@/app/(app)/chrome/first-day-briefing";
import { OverlaySlot } from "@/app/(app)/chrome/overlay-slot";
import { StatusStrip } from "@/app/(app)/chrome/status-strip";
import { PokemonPane } from "@/app/pokemon-pane";
import { buildBaobaLine } from "@/lib/baoba/dialogue";
import { dayKeyInTimeZone } from "@/lib/day/day";
import { currentMoment } from "@/lib/day/session";
import { currentActivePokemon, currentEvolutionOptions } from "@/lib/pokemon/session";
import { currentLatestDayLedgerEvent } from "@/lib/settlement/session";
import { bucketOpenTasks } from "@/lib/task/dates";
import { currentTasks } from "@/lib/task/session";
import { dayCount } from "@/lib/trainer/day-count";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * The Safari Zone chrome (#21, given its persistent left pane by #33): every
 * authenticated screen wears the same status strip and the same two-pane
 * stage, the Active Pokémon's scene and Warden Baoba's tray fixed in the left
 * pane and whichever destination a Ranger has chosen filling the right — so
 * this is the one place that fetches both the trainer's identity and
 * everything the left pane needs, and redirects a signed-out visitor. Each
 * page still reads its own trainer for its own data — see `currentTrainer`'s
 * own doc comment.
 *
 * It's also the one place every authenticated screen is reached through, so
 * it's where the first-day briefing (#27) is decided: shown on top of
 * whichever screen a Ranger's first visit happens to land on, rather than
 * hard-coded to the field screen.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const trainer = await currentTrainer();

  if (!trainer) {
    redirect("/sign-in");
  }

  const day = dayCount(trainer.createdAt, currentMoment(), trainer.timeZone);
  const briefingUnseen = !trainer.introSeenAt;

  // Fetched alone because the evolution-options query below depends on its
  // result — everything else that doesn't runs alongside that query instead
  // of waiting for it to finish first.
  const activePokemon = await currentActivePokemon();

  // Only worth asking once an instance has met its current species' bond
  // requirement — the same gate the evolve prompt (#25) itself sits behind.
  const [tasks, latestDay, evolutionOptions] = await Promise.all([
    currentTasks(trainer.id),
    currentLatestDayLedgerEvent(trainer.id),
    activePokemon && activePokemon.distanceToBondRequirement === 0
      ? currentEvolutionOptions(trainer.id, activePokemon.species.id)
      : Promise.resolve([]),
  ]);

  // The same bucketing the field log itself groups by, against the same
  // `currentMoment()` the home page's own todayKey resolves from — Baoba's
  // Overdue clause can never drift from the Overdue group a Ranger sees on
  // the field log, wherever they're standing when he says it.
  const overdueCount = bucketOpenTasks(
    tasks.filter((task) => task.status === "open"),
    dayKeyInTimeZone(currentMoment(), trainer.timeZone),
  ).overdue.length;

  const baobaLine = buildBaobaLine({
    pokemon: activePokemon,
    dailyTarget: trainer.dailyTarget,
    latestDay,
    readyToEvolve: evolutionOptions.length > 0,
    overdueCount,
  });

  return (
    <div className="app">
      {/* `inert` keeps the strip and page content out of tab order and
          off-limits to assistive tech while the briefing sits on top of
          them — no client JS needed, unlike a focus trap. `contents` keeps
          this wrapper out of `.app`'s flex layout: `.strip`, `.stage` and the
          overlay slot still need to be its direct flex children, not this
          div's. */}
      <div inert={briefingUnseen} className="contents">
        <StatusStrip rangerName={trainer.displayName ?? trainer.email} day={day} />
        <AppStage
          left={
            <PokemonPane
              pokemon={activePokemon}
              dailyTarget={trainer.dailyTarget}
              evolutionOptions={evolutionOptions}
              baobaLine={baobaLine}
            />
          }
          right={children}
        />
        <OverlaySlot />
      </div>
      {briefingUnseen && <FirstDayBriefing />}
    </div>
  );
}

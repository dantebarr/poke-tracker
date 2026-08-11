import { redirect } from "next/navigation";

import { FieldScreen } from "@/app/field-screen";
import { dayKeyInTimeZone } from "@/lib/day/day";
import { currentMoment } from "@/lib/day/session";
import { currentLabels } from "@/lib/label/session";
import { currentTasks } from "@/lib/task/session";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * Home / the field screen (#14, restyled by #21, given its encounter view by
 * #22, given Warden Baoba's dialogue tray by #23, its right pane rebuilt as
 * the field log by #28, given a mobile surface by #29): the field log — task
 * creation and the task list, restyled to mockup B — filling the right pane
 * the chrome layout hands it. The encounter view and Baoba's tray moved to
 * the chrome layout's persistent left pane by #33; this page owns only the
 * field log's own data now.
 *
 * Which task is open and whether the add form is up are search parameters
 * since #32, but they are read on the client (`FieldScreen`) rather than
 * through this page's `searchParams` prop: they choose between content this
 * page has already fetched, so re-running the queries below for an overlay
 * would buy nothing.
 */
export default async function HomePage() {
  const trainer = await currentTrainer();

  // No trainer record means the account never cleared the allow-list at the
  // callback. There is nothing here for it.
  if (!trainer) {
    redirect("/sign-in");
  }

  const [tasks, labels] = await Promise.all([currentTasks(trainer.id), currentLabels(trainer.id)]);

  const todayKey = dayKeyInTimeZone(currentMoment(), trainer.timeZone);

  return (
    <FieldScreen
      tasks={tasks}
      labels={labels}
      timeZone={trainer.timeZone}
      todayKey={todayKey}
      dailyTarget={trainer.dailyTarget}
    />
  );
}

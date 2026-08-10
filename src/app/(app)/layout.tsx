import { redirect } from "next/navigation";

import { FirstDayBriefing } from "@/app/(app)/chrome/first-day-briefing";
import { StatusStrip } from "@/app/(app)/chrome/status-strip";
import { dayCount } from "@/lib/trainer/day-count";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * The Safari Zone chrome (#21): every authenticated screen wears the same
 * status strip and stage shell, so this is the one place that fetches the
 * trainer for that purpose and redirects a signed-out visitor. Each page
 * still reads its own trainer for its own data — see `currentTrainer`'s own
 * doc comment — this layout only needs the identity and day count.
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

  const day = dayCount(trainer.createdAt, new Date(), trainer.timeZone);
  const briefingUnseen = !trainer.introSeenAt;

  return (
    <div className="app">
      {/* `inert` keeps the strip and page content out of tab order and
          off-limits to assistive tech while the briefing sits on top of
          them — no client JS needed, unlike a focus trap. `contents` keeps
          this wrapper out of `.app`'s flex layout: `.strip` and `.stage`
          still need to be its direct flex children, not this div's. */}
      <div inert={briefingUnseen} className="contents">
        <StatusStrip rangerName={trainer.displayName ?? trainer.email} day={day} />
        {children}
      </div>
      {briefingUnseen && <FirstDayBriefing />}
    </div>
  );
}

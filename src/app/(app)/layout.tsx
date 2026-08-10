import { redirect } from "next/navigation";

import { StatusStrip } from "@/app/(app)/chrome/status-strip";
import { dayCount } from "@/lib/trainer/day-count";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * The Safari Zone chrome (#21): every authenticated screen wears the same
 * status strip and stage shell, so this is the one place that fetches the
 * trainer for that purpose and redirects a signed-out visitor. Each page
 * still reads its own trainer for its own data — see `currentTrainer`'s own
 * doc comment — this layout only needs the identity and day count.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const trainer = await currentTrainer();

  if (!trainer) {
    redirect("/sign-in");
  }

  const day = dayCount(trainer.createdAt, new Date(), trainer.timeZone);

  return (
    <div className="app">
      <StatusStrip rangerName={trainer.displayName ?? trainer.email} day={day} />
      {children}
    </div>
  );
}

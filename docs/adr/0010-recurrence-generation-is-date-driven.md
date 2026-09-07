# Recurrence generation is driven by dates, never by completion

**Status:** accepted; amended by #13, which names rule creation as generation's second trigger

A **Recurrence** generates its tasks from dates alone — the rule's start date, its frequency, and
the day keys **settlement** already walks in the trainer's own time zone (ADR-0004). Completing a
generated task generates nothing.

Generation has two triggers, and neither of them is a completion: **settlement**, which is where
it runs from then on, and the moment the rule is created, which runs it once so the rule's first
task exists immediately rather than at next app entry. The second was written here as "nowhere but
settlement" when this was recorded; #13 corrects it. The distinction the decision actually turns on
is date-driven versus completion-driven, and creating a rule is neither a completion nor a second
way to earn one — it produces the one task the rule's own first date calls for, and no more.

## Considered Options

**Generating the next task when the current one is completed** is how most repeating-to-do lists
work and is the obvious design: one task alive at a time, and no backfill to think about.

It is rejected because Poke Tracker scores days, not tasks. A completed task is worth its **effort
points** on the day it is completed, and that day's **delta** against the **daily target** is the
only thing that moves **happiness**. Completion-driven generation would hand a trainer the next
task the moment they finished the last one, so a daily recurrence could be completed seven times
in one afternoon — a week of an obligation earning a week of points against a single day's target.
The day would read as a triumph, and the six days it was borrowed from would arrive empty. That is
not a bug a reader would find in the generation code; it is the reason the generation code is
shaped the way it is, which is why it is recorded here.

Date-driven generation cannot do this: a date has one slot, and the slot can be filled once.
Working ahead stays free — completing tomorrow's task today is fine, and produces nothing new,
because tomorrow's date has already been generated — but it can never pay twice.

**A scheduled job** was the alternative home for generation. Settlement already is what generation
needs: it runs on app entry, it knows the trainer's time zone, it walks every unsettled **Day** in
order and refuses to aggregate them, and it holds a compare-and-set watermark that makes
double-running impossible. A cron would be a second, weaker copy of all of that, with its own
answer owed for a trainer who changes time zone.

## Consequences

**Generation is lazy.** A trainer who does not open the app generates no tasks. That is harmless
while nobody is looking, and the backfill on return produces exactly the rows the days would have
produced at the time. But it means there is nothing to notify on — a later notification feature
cannot assume a task row already exists for tomorrow.

**A trainer returning after a gap gets every missed task, uncapped.** A fortnight away from a daily
recurrence is fourteen overdue tasks, which is the honest picture and consistent with a **Missed
day** carrying no amnesty. If that proves unusable, the fix is a bulk clear on the **Overdue**
bucket, not a cap on generation: a cap would make the **field log** under-report work that
genuinely went undone.

**No settled day changes meaning.** Generation only adds open tasks, and an open task is worth
nothing until it is completed, so no **day ledger** row can be affected by it — a settled day's
row is a snapshot and is never recomputed from the tasks behind it.

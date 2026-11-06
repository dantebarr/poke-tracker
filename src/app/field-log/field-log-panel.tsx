"use client";

import { useEffect, useRef, useState } from "react";

import { AddTaskEditor } from "@/app/field-log/add-task";
import { DoneTaskRow, FailedDraftRow, OpenTaskRow } from "@/app/field-log/task-rows";
import { useAddShortcut } from "@/app/field-log/use-add-shortcut";
import { OVERLAY_OPENER_PROPS } from "@/app/overlay-dismiss";
import { isPendingTaskId } from "@/app/pending-task-id";
import type { NewTaskFields } from "@/app/recurring-fields";
import type { EditableFields } from "@/app/task-edit-fields";
import { dayKeyToUtcDate } from "@/lib/day/day";
import type { Label } from "@/lib/label/label";
import { bucketOpenTasks, completedToday, lateLabel, sortForFieldLog, todayPoints } from "@/lib/task/dates";
import { effortPoints, type Task } from "@/lib/task/task";

const HEADER_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** How long a completion's celebration stays mounted. Under the 1.5s cap; a newer completion restarts it. */
const CELEBRATION_MS = 1300;

/**
 * The field log (#28, given a mobile surface by #29): the right pane's Open
 * tasks, grouped by Bucket, plus today's completions. Every write — the
 * optimistic task list, completion, edits, deletes, creation — is owned by
 * `FieldScreen`, this panel's parent, since a task can also be edited from
 * the mobile detail screen (#29's `TaskDetailScreen`), a sibling of this
 * panel rather than a descendant. This component is purely "the list plus
 * the desktop add row and mobile add sheet".
 *
 * Opening a task is one thing a Ranger does, addressed one way (#32):
 * `onOpenTask` puts the task in the URL, and `expandedTaskId` comes back
 * only on a wide screen, where a row expands in place (`OpenTaskRow`'s own
 * `.expander`). On a narrow screen the same address instead swaps the entire
 * field screen for the full-screen detail — mockup B never draws an inline
 * expander on a narrow screen, and `UI-CONSTRAINTS.md` wants every field
 * comfortably reachable rather than folded into a cramped row. Neither this
 * panel nor the row it holds has to know which of those happened.
 */
export function FieldLogPanel({
  tasks,
  labels,
  timeZone,
  todayKey,
  dailyTarget,
  erroredId,
  failedDraft,
  expandedTaskId,
  addEditorOpen,
  overlayOpen,
  onComplete,
  onReopen,
  onSave,
  onDelete,
  onDeleteRule,
  onCreate,
  onOpenTask,
  onOpenAddForm,
  onLeaveOverlay,
}: {
  tasks: Task[];
  labels: Label[];
  timeZone: string;
  todayKey: string;
  dailyTarget: number;
  erroredId: string | null;
  failedDraft: Task | null;
  expandedTaskId: string | null;
  addEditorOpen: boolean;
  /** Any overlay (detail, add form, expanded row) is showing — the add shortcut stands down. */
  overlayOpen: boolean;
  onComplete: (task: Task) => void;
  onReopen: (task: Task) => void;
  onSave: (task: Task, fields: EditableFields) => void;
  onDelete: (task: Task) => void;
  /** The rule and every open task it generated (#16) — only reachable from a task that has one. */
  onDeleteRule: (task: Task) => void;
  onCreate: (fields: NewTaskFields) => void;
  onOpenTask: (taskId: string) => void;
  onOpenAddForm: () => void;
  /** Closing an expanded row and cancelling the add editor are the same move: back to the plain field log. */
  onLeaveOverlay: () => void;
}) {
  // Always open on desktop regardless of this — the CSS that would hide
  // `.loggedrows` behind it only exists inside the mobile media query.
  const [loggedExpanded, setLoggedExpanded] = useState(false);
  // The reward for a completion (#28): a pop on the new logged row and a "+N"
  // floating up from the header's readout, which is on screen on mobile too,
  // where Logged today is collapsed. Both are keyed CSS animations on opacity
  // and transform, so a newer completion simply restarts them — nothing queues
  // and nothing waits on the network; completion itself stays the parent's
  // optimistic dispatch.
  const [celebrating, setCelebrating] = useState<ReadonlySet<string>>(new Set());
  const [burst, setBurst] = useState<{ key: number; points: number } | null>(null);
  const burstKey = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useAddShortcut(onOpenAddForm, !overlayOpen);

  function completeWithCelebration(task: Task) {
    const key = ++burstKey.current;
    setBurst({ key, points: effortPoints(task.size) });
    setCelebrating((current) => new Set(current).add(task.id));
    timers.current.push(
      setTimeout(() => {
        setBurst((current) => (current?.key === key ? null : current));
        setCelebrating((current) => {
          const next = new Set(current);
          next.delete(task.id);
          return next;
        });
      }, CELEBRATION_MS),
    );
    onComplete(task);
  }

  const openTasks = tasks.filter((task) => task.status === "open");
  // The logged rows and the reopen controls on them come from the same named
  // set the points readout below is summed from — see `completedToday` for
  // why the set stops at today, and for why that limit lives there rather
  // than being written out again here.
  const doneToday = completedToday(tasks, timeZone, todayKey);
  // A still-flashing failed draft is folded back into the bucketed list —
  // purely for that one visible flash, never into the real task list, so it
  // can't count toward today's effort.
  const bucketSource =
    failedDraft && !openTasks.some((task) => task.id === failedDraft.id) ? [...openTasks, failedDraft] : openTasks;
  const buckets = bucketOpenTasks(sortForFieldLog(bucketSource), todayKey);
  const points = todayPoints(tasks, timeZone, todayKey);
  const pct = dailyTarget > 0 ? Math.min(100, Math.round((points / dailyTarget) * 100)) : 100;
  const met = points >= dailyTarget;
  const over = points > dailyTarget;

  return (
    <section className="logpanel panel" aria-label="Field log">
      <div className="logtop">
        <span>Field log</span>
        <span className="date">{HEADER_DATE_FORMAT.format(dayKeyToUtcDate(todayKey)).toUpperCase()}</span>
        <span className={`quota${met ? " met" : ""}${over ? " over" : ""}`}>
          <span className="qtext">
            Today <b key={points}>{points}</b> / {dailyTarget} pts
          </span>
          <span
            className="track"
            role="progressbar"
            aria-label="Today's effort points"
            aria-valuemin={0}
            aria-valuemax={dailyTarget}
            aria-valuenow={Math.min(points, dailyTarget)}
            aria-valuetext={`${points} of ${dailyTarget} points${over ? ", target exceeded" : met ? ", target met" : ""}`}
          >
            <i style={{ width: `${pct}%` }} />
          </span>
          {met && (
            <span className="qmark" aria-hidden="true">
              {over ? "★" : "✓"}
            </span>
          )}
          {burst && (
            <span key={burst.key} className="floatpts quotaburst" aria-hidden="true">
              +{burst.points}
            </span>
          )}
        </span>
      </div>

      <div className="addrow">
        {addEditorOpen ? (
          <AddTaskEditor labels={labels} todayKey={todayKey} onCreate={onCreate} onLeaveOverlay={onLeaveOverlay} />
        ) : (
          <button type="button" className="addbtn" onClick={onOpenAddForm} {...OVERLAY_OPENER_PROPS}>
            <span>+ Add a task</span>
            <kbd className="kbdhint" aria-hidden="true">
              N
            </kbd>
          </button>
        )}
      </div>

      <div className="scroll">
        {openTasks.length === 0 ? (
          <div className="clearday">
            <span className="clearmark" aria-hidden="true">
              ✓
            </span>
            <p className="clearhead">Clear day, Ranger</p>
            <p className="clearsub">
              {doneToday.length > 0 ? "Everything is logged. Nice work." : "Nothing open. Add a task when you are ready."}
            </p>
          </div>
        ) : (
          buckets.map((bucket) => (
            <div key={bucket.key} className="bucket">
              <div className={`grouphead${bucket.overdue ? " late" : ""}`}>
                <span>{bucket.heading}</span>
                <span className="count">{bucket.tasks.length}</span>
              </div>
              {bucket.tasks.map((task) =>
                task.id === failedDraft?.id ? (
                  <FailedDraftRow key={task.id} task={task} />
                ) : (
                  <OpenTaskRow
                    key={task.id}
                    task={task}
                    labels={labels}
                    expanded={expandedTaskId === task.id}
                    errored={erroredId === task.id}
                    pending={isPendingTaskId(task.id)}
                    lateText={bucket.overdue ? lateLabel(task.dueDate, todayKey) : null}
                    todayKey={todayKey}
                    onExpand={() => onOpenTask(task.id)}
                    onCollapse={onLeaveOverlay}
                    onComplete={() => {
                      if (expandedTaskId === task.id) onLeaveOverlay();
                      completeWithCelebration(task);
                    }}
                    onSave={(fields) => onSave(task, fields)}
                    onDelete={() => {
                      if (expandedTaskId === task.id) onLeaveOverlay();
                      onDelete(task);
                    }}
                    onDeleteRule={() => {
                      if (expandedTaskId === task.id) onLeaveOverlay();
                      onDeleteRule(task);
                    }}
                  />
                ),
              )}
            </div>
          ))
        )}

        {doneToday.length > 0 && (
          <div className="bucket loggedbucket">
            <button
              type="button"
              className="grouphead loggedhead"
              onClick={() => setLoggedExpanded((expanded) => !expanded)}
              aria-expanded={loggedExpanded}
            >
              <span>Logged today</span>
              <span className="count">{doneToday.length}</span>
              <span className="chev" aria-hidden="true">
                {loggedExpanded ? "▴" : "▾"}
              </span>
            </button>
            <div className={`loggedrows${loggedExpanded ? " expanded" : ""}`}>
              {doneToday.map((task) => (
                <DoneTaskRow
                  key={task.id}
                  task={task}
                  errored={erroredId === task.id}
                  celebrate={celebrating.has(task.id)}
                  onReopen={() => onReopen(task)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <button type="button" className="fab" aria-label="Add a task" onClick={onOpenAddForm} {...OVERLAY_OPENER_PROPS}>
        +
      </button>
    </section>
  );
}

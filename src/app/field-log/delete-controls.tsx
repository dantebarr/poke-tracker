"use client";

/**
 * Which destructive verb a Ranger has armed, if either (#16). The two are one
 * piece of state rather than a boolean each because they are alternatives: a
 * loaded control should be the only one showing, so there is never a pair of
 * confirm buttons on screen for a Ranger to mistake for each other.
 */
export type PendingDelete = null | "task" | "rule";

/**
 * The delete controls shared between an open row's desktop expander and the
 * mobile task detail screen (#29's `TaskDetailScreen`): a button that turns
 * into a confirm/cancel pair rather than deleting on the first tap.
 *
 * A task a **Recurrence** generated offers two of them (#16), on the task
 * itself, since rules are reached through the tasks they generate and there is
 * no recurrences screen to hunt one down on. "Delete this one" leaves the rule
 * running — the watermark has passed that date, so it does not come back — and
 * "Delete and stop recurring" takes the rule and every open task it generated.
 * A task with no rule shows neither variant, only the plain `label`.
 *
 * The confirm words differ per verb rather than both saying "Confirm delete":
 * arming the second one is the moment to be sure it is the rule and not the
 * one task that is about to go.
 *
 * `confirmingWrapperClassName` wraps only the confirm/cancel pair — the detail
 * screen needs `.editactions` there for the same spacing the row's expander
 * already gets from its own, always-present `.editactions` div; the row passes
 * nothing, since the pair renders straight into that div.
 */
export function DeleteControls({
  recurring,
  confirming,
  label,
  confirmingWrapperClassName,
  onRequestConfirm,
  onDelete,
  onDeleteRule,
  onCancel,
}: {
  recurring: boolean;
  confirming: PendingDelete;
  label: string;
  confirmingWrapperClassName?: string;
  onRequestConfirm: (pending: Exclude<PendingDelete, null>) => void;
  onDelete: () => void;
  onDeleteRule: () => void;
  onCancel: () => void;
}) {
  if (!confirming) {
    return (
      <>
        <button type="button" className="delbtn" onClick={() => onRequestConfirm("task")}>
          {recurring ? "Delete this one" : label}
        </button>
        {recurring && (
          <button type="button" className="delbtn" onClick={() => onRequestConfirm("rule")}>
            Delete and stop recurring
          </button>
        )}
      </>
    );
  }

  // Which verb was armed decides which one confirms, here rather than at each
  // call site: both surfaces would otherwise carry the same branch, and the
  // one that got it backwards would delete the wrong thing.
  const pair = (
    <>
      <button type="button" className="delbtn" onClick={confirming === "rule" ? onDeleteRule : onDelete}>
        {confirming === "rule" ? "Confirm delete and stop" : "Confirm delete"}
      </button>
      <button type="button" className="ghostbtn" onClick={onCancel}>
        Cancel
      </button>
    </>
  );
  return confirmingWrapperClassName ? <div className={confirmingWrapperClassName}>{pair}</div> : pair;
}

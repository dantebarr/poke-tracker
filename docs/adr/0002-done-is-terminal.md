# A completed task cannot be un-completed or deleted

**Status:** accepted

Completing a task is one-way. There is no un-check, and delete is rejected on done tasks — the
only escape from a mis-tick is to live with it.

The reason is that effort points are the game's currency and settled days are immutable. If a
done task could disappear, today's score could no longer be *derived* by summing the tasks
completed today; it would have to be a stored counter that survives the task's deletion, giving
two representations of one number that can drift apart. Making Done terminal removes the second
representation entirely, and reduces the whole model to one rule: **unsettled days are live,
settled days are stone.**

Considered and rejected: allowing deletion but never recomputing points (the stored-counter
design), and allowing un-complete only within the current unsettled day (a special case that
buys forgiveness at the cost of a second timing rule).

**Consequence:** a task ticked by accident permanently awards its points — at most 3. That was
judged cheaper than a second bookkeeping mechanism. If this becomes a real irritation in use, the
fix is the stored-counter design above, not a partial exception.

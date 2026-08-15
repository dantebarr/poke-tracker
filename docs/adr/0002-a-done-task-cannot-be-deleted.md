# A done task cannot be deleted

**Status:** accepted; amended by #36, which removed the rule that Done is terminal

Delete is rejected on a done task. Deleting one would destroy the only record that the work
happened while the day it belongs to still counts its points — the record and the score would
disagree with nothing left to reconcile them from.

A trainer who wants a done task gone can still get there: **reopen** it, then delete it. That
route reaches the same place through two states the model already knows, each of which reads
honestly on its own, rather than through one step that leaves a hole.

Considered and rejected: allowing deletion but never recomputing points (a stored counter for
today's score, surviving the task's deletion — two representations of one number that can drift
apart). Today's score stays *derived* by summing today's completions, which is what makes the
stored counter unnecessary.

Also considered and still rejected: teaching the model that a task may only be reversed *within
the current unsettled day* — forgiveness bought at the cost of a second timing rule, in a model
that already has exactly one. Reopen's "today only" limit is an interface affordance; no policy,
action or glossary entry learns what "today" means for it.

**Consequence:** deleting a done task is two steps rather than one. That is the intended cost —
enough friction that finished work cannot vanish from the record by accident.

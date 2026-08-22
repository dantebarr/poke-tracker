import { effortPoints, type TaskSize } from "@/lib/task/task";

/**
 * Settlement's pure state machine (#10): a day at a time, oldest first, from
 * a starting state to an ending one plus the ledger rows each day produced.
 * The clock, the timezone and the random draw are all supplied by the caller
 * — see `@/lib/settlement/settlement` — so nothing here is nondeterministic
 * and nothing here touches a database.
 */

export type SettlementState = {
  /**
   * Belongs to the trainer, not any one instance, and is never reset — the
   * only thing that pulls it back is the clamp at zero, which *is* a
   * departure by neglect (ADR-0009). It is therefore **not** 0 whenever no
   * instance is active: it carries through a Parting and through the
   * pokemon-less days after one, where a bad day leaves it untouched
   * because there is nobody there to neglect.
   */
  happiness: number;
  activeInstanceId: string | null;
};

export type LedgerOutcome = "bond" | "left" | "parted" | "approaching" | "none";

export type LedgerRow = {
  day: string;
  pointsEarned: number;
  target: number;
  delta: number;
  happinessAfter: number;
  activeInstanceId: string | null;
  outcome: LedgerOutcome;
};

export type SettlementResult = {
  state: SettlementState;
  ledgerRows: LedgerRow[];
};

type SettledDay = { state: SettlementState; row: LedgerRow };

function pointsFor(tasks: { size: TaskSize }[] | undefined): number {
  return (tasks ?? []).reduce((sum, task) => sum + effortPoints(task.size), 0);
}

/**
 * Settles each of `days` in order, folding one day's ending state into the
 * next day's starting one. `tasksByDay` and `target` are already resolved by
 * the caller — grouped by local day and read once, respectively — this
 * function only decides what each day did.
 *
 * `partingOn` is the day the trainer chose to part on (#5), a day key rather
 * than a flag: a trainer who sets one and then doesn't open the app for a
 * week has their parting land on the day they actually chose, because the
 * days below are replayed in order and only the matching one fires. A key
 * matching no day in the run does nothing. Resolving "today" in the
 * trainer's own zone (ADR-0004) stays the caller's job, like the clock and
 * the draw. Defaulted so a caller with no parting to supply — and every
 * test that predates the feature — reads as the ordinary case it is.
 */
export function settleDays(
  startingState: SettlementState,
  days: string[],
  tasksByDay: Map<string, { size: TaskSize }[]>,
  target: number,
  drawArrivalInstanceId: () => string,
  partingOn: string | null = null,
): SettlementResult {
  let state = startingState;
  const ledgerRows: LedgerRow[] = [];

  for (const day of days) {
    const pointsEarned = pointsFor(tasksByDay.get(day));
    const delta = pointsEarned - target;
    const settled = settleDay(state, day, pointsEarned, target, delta, drawArrivalInstanceId, day === partingOn);
    state = settled.state;
    ledgerRows.push(settled.row);
  }

  return { state, ledgerRows };
}

function settleDay(
  state: SettlementState,
  day: string,
  pointsEarned: number,
  target: number,
  delta: number,
  drawArrivalInstanceId: () => string,
  isParting: boolean,
): SettledDay {
  if (state.activeInstanceId !== null) {
    return settleActiveDay(state, day, pointsEarned, target, delta, isParting);
  }
  return settlePokemonlessDay(state, day, pointsEarned, target, delta, drawArrivalInstanceId);
}

/**
 * The delta moves happiness, and what happens next is decided in one fixed
 * order (ADR-0009):
 *
 *   1. Below zero clamps to zero and the Pokémon **leaves**. This wins even
 *      on a day the trainer chose to part on — they missed the target, the
 *      row's own delta says so, and calling that a parting would let the app
 *      flatter a day that was lost.
 *   2. A parting ends the pairing with the happiness **unclamped**, because
 *      it never went negative. It carries to whoever arrives next.
 *   3. Otherwise the day is an ordinary one: at or above target raises
 *      happiness by the surplus, below drops it by the shortfall.
 *
 * `outcome` no longer decides the bond credit — `delta >= 0` does, in
 * `apply_settlement` — so a `parted` day the trainer hit their target on
 * still earns its level.
 */
function settleActiveDay(
  state: SettlementState,
  day: string,
  pointsEarned: number,
  target: number,
  delta: number,
  isParting: boolean,
): SettledDay {
  const activeInstanceId = state.activeInstanceId as string;
  const happinessAfter = state.happiness + delta;

  if (happinessAfter < 0) {
    return {
      state: { happiness: 0, activeInstanceId: null },
      row: { day, pointsEarned, target, delta, happinessAfter: 0, activeInstanceId, outcome: "left" },
    };
  }

  if (isParting) {
    return {
      state: { happiness: happinessAfter, activeInstanceId: null },
      row: { day, pointsEarned, target, delta, happinessAfter, activeInstanceId, outcome: "parted" },
    };
  }

  return {
    state: { ...state, happiness: happinessAfter },
    row: {
      day,
      pointsEarned,
      target,
      delta,
      happinessAfter,
      activeInstanceId,
      outcome: delta >= 0 ? "bond" : "none",
    },
  };
}

/**
 * With no active Pokémon: hitting the target draws an Arrival right away —
 * ADR-0007. The row this day produces still names no Pokémon and carries the
 * `approaching` outcome, since nobody was with the trainer during it; the
 * drawn instance only becomes `state.activeInstanceId`, which is what makes
 * it the Active Pokémon from the very next day settled — an ordinary
 * `settleActiveDay`, starting from the happiness this day's delta banked on
 * top of whatever the trainer was already carrying (ADR-0009).
 *
 * A day below target leaves state untouched, and that is deliberate rather
 * than incidental: there is no Pokémon present to be neglected, so carried
 * happiness sits still until an Arrival picks it up. Do not "fix" this into
 * a subtraction.
 */
function settlePokemonlessDay(
  state: SettlementState,
  day: string,
  pointsEarned: number,
  target: number,
  delta: number,
  drawArrivalInstanceId: () => string,
): SettledDay {
  if (delta >= 0) {
    const happinessAfter = state.happiness + delta;
    const activeInstanceId = drawArrivalInstanceId();
    return {
      state: { happiness: happinessAfter, activeInstanceId },
      row: { day, pointsEarned, target, delta, happinessAfter, activeInstanceId: null, outcome: "approaching" },
    };
  }

  return {
    state,
    row: { day, pointsEarned, target, delta, happinessAfter: state.happiness, activeInstanceId: null, outcome: "none" },
  };
}

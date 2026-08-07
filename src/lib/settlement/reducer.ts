import { effortPoints, type TaskSize } from "@/lib/task/task";

/**
 * Settlement's pure state machine (#10): a day at a time, oldest first, from
 * a starting state to an ending one plus the ledger rows each day produced.
 * The clock, the timezone and the random draw are all supplied by the caller
 * — see `@/lib/settlement/settlement` — so nothing here is nondeterministic
 * and nothing here touches a database.
 */

export type SettlementState = {
  /** Belongs to the trainer, not any one instance — 0 whenever none is active. */
  happiness: number;
  activeInstanceId: string | null;
  /**
   * A qualifying pokemon-less day's delta, waiting to become the next day's
   * arrival. Set the day it qualifies, consumed the day after — unless that
   * day falls outside the batch being settled, in which case it survives in
   * the ending state for a later run to pick up.
   */
  pendingArrivalDelta: number | null;
};

export type LedgerOutcome = "bond" | "left" | "none";

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
 */
export function settleDays(
  startingState: SettlementState,
  days: string[],
  tasksByDay: Map<string, { size: TaskSize }[]>,
  target: number,
  drawArrivalInstanceId: () => string,
): SettlementResult {
  let state = startingState;
  const ledgerRows: LedgerRow[] = [];

  for (const day of days) {
    const pointsEarned = pointsFor(tasksByDay.get(day));
    const delta = pointsEarned - target;
    const settled = settleDay(state, day, pointsEarned, target, delta, drawArrivalInstanceId);
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
): SettledDay {
  if (state.activeInstanceId !== null) {
    return settleActiveDay(state, day, pointsEarned, target, delta);
  }
  return settlePokemonlessDay(state, day, pointsEarned, target, delta, drawArrivalInstanceId);
}

/** At or above target raises happiness by the surplus and bond by one; below drops happiness by the shortfall and leaves bond alone. Happiness below zero and the Pokémon leaves. */
function settleActiveDay(
  state: SettlementState,
  day: string,
  pointsEarned: number,
  target: number,
  delta: number,
): SettledDay {
  const activeInstanceId = state.activeInstanceId as string;
  const happinessAfter = state.happiness + delta;

  if (delta >= 0) {
    return {
      state: { ...state, happiness: happinessAfter },
      row: { day, pointsEarned, target, delta, happinessAfter, activeInstanceId, outcome: "bond" },
    };
  }

  if (happinessAfter < 0) {
    return {
      state: { happiness: 0, activeInstanceId: null, pendingArrivalDelta: null },
      row: { day, pointsEarned, target, delta, happinessAfter: 0, activeInstanceId, outcome: "left" },
    };
  }

  return {
    state: { ...state, happiness: happinessAfter },
    row: { day, pointsEarned, target, delta, happinessAfter, activeInstanceId, outcome: "none" },
  };
}

/** With no active Pokémon: a pending arrival materializes unconditionally; otherwise a qualifying day marks one pending for the day after. */
function settlePokemonlessDay(
  state: SettlementState,
  day: string,
  pointsEarned: number,
  target: number,
  delta: number,
  drawArrivalInstanceId: () => string,
): SettledDay {
  if (state.pendingArrivalDelta !== null) {
    const activeInstanceId = drawArrivalInstanceId();
    const happinessAfter = state.pendingArrivalDelta;
    return {
      state: { happiness: happinessAfter, activeInstanceId, pendingArrivalDelta: null },
      row: { day, pointsEarned, target, delta, happinessAfter, activeInstanceId, outcome: "none" },
    };
  }

  if (delta >= 0) {
    return {
      state: { happiness: 0, activeInstanceId: null, pendingArrivalDelta: delta },
      row: { day, pointsEarned, target, delta, happinessAfter: 0, activeInstanceId: null, outcome: "none" },
    };
  }

  return {
    state,
    row: { day, pointsEarned, target, delta, happinessAfter: 0, activeInstanceId: null, outcome: "none" },
  };
}

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
};

export type LedgerOutcome = "bond" | "left" | "approaching" | "none";

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
      state: { happiness: 0, activeInstanceId: null },
      row: { day, pointsEarned, target, delta, happinessAfter: 0, activeInstanceId, outcome: "left" },
    };
  }

  return {
    state: { ...state, happiness: happinessAfter },
    row: { day, pointsEarned, target, delta, happinessAfter, activeInstanceId, outcome: "none" },
  };
}

/**
 * With no active Pokémon: hitting the target draws an Arrival right away —
 * ADR-0007. The row this day produces still names no Pokémon and carries the
 * `approaching` outcome, since nobody was with the trainer during it; the
 * drawn instance only becomes `state.activeInstanceId`, which is what makes
 * it the Active Pokémon from the very next day settled — an ordinary
 * `settleActiveDay`, starting from the happiness this day's delta banked.
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
    const activeInstanceId = drawArrivalInstanceId();
    return {
      state: { happiness: delta, activeInstanceId },
      row: { day, pointsEarned, target, delta, happinessAfter: 0, activeInstanceId: null, outcome: "approaching" },
    };
  }

  return {
    state,
    row: { day, pointsEarned, target, delta, happinessAfter: 0, activeInstanceId: null, outcome: "none" },
  };
}

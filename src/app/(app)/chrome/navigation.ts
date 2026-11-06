import { isPendingTaskId } from "@/app/pending-task-id";
import type { Task } from "@/lib/task/task";

/**
 * The one navigation system the Safari Zone chrome has (#32), as two pure
 * functions: `resolveNavigation` answers "what does the status strip look
 * like from here" and `resolveFieldView` answers "what is the field screen
 * showing". Both take the address and the width of the screen and nothing
 * else, so both the strip and the field screen read their behaviour from
 * here rather than each deriving it — and so every rule below is assertable
 * without rendering anything.
 *
 * Before #32 the same job was spread over three mechanisms (the strip's icon
 * nav, a floating arrow in a pane corner, and a `← Field log` button that
 * appeared on every screen that was not the field screen) and three pieces
 * of component state. The state moved into the address for the reason Next's
 * own guide on preserving UI state gives: `Activity` keeps client state alive
 * across navigations, so a pane or an overlay held in `useState` can come
 * back set when a Ranger returns — and because a real URL is the only thing
 * the device back gesture and a shared link both understand.
 */

/**
 * Which of the two screen widths the chrome behaves as. The breakpoint
 * itself is CSS's (`responsive.ts`); these functions only ever receive the
 * answer.
 */
export type Surface = "narrow" | "wide";

/**
 * The places the nav can take a Ranger. `encounter` exists only on a narrow
 * screen, where the Pokémon's scene is a screen of its own; a wide screen
 * draws it beside the field log all the time, so there it is never marked.
 */
export type Destination = "field-log" | "encounter" | "pokedex" | "logbook" | "settings";

/** The two halves of the chrome shell. On a wide screen both are drawn at once. */
type Pane = "encounter" | "log";

export const PANE_PARAM = "pane";
export const TASK_PARAM = "task";
export const ADD_PARAM = "add";

/**
 * The pane parameter's only recognised value — its absence means the field
 * log. A narrow screen's home is the field log (the thing a task tracker is
 * for), with the Pokémon's full scene one tap away at `?pane=encounter`.
 */
const ENCOUNTER_PANE_VALUE = "encounter";
/** The add parameter's only recognised value; it is a flag, so the value is just "on". */
const ADD_FLAG_VALUE = "1";

/** Whatever `useSearchParams` hands back, narrowed to the one method these functions need. */
export type ReadableSearchParams = Pick<URLSearchParams, "get">;

/** The field log's address — also the plain home address, on both surfaces. */
export const FIELD_LOG_HREF = "/";

/**
 * The full encounter scene (Pokémon, status box, Warden Baoba) as a narrow
 * screen's own screen. On a wide screen it resolves to the same two-pane home
 * as everything else, so a shared link works on either.
 */
export const ENCOUNTER_HREF = `/?${PANE_PARAM}=${ENCOUNTER_PANE_VALUE}`;

export const ADD_FORM_HREF = `${FIELD_LOG_HREF}?${ADD_PARAM}=${ADD_FLAG_VALUE}`;

/**
 * A task's own address. Naming a task implies the log, so leaving the task
 * is a matter of dropping one parameter.
 */
export function taskHref(taskId: string): string {
  return `${FIELD_LOG_HREF}?${TASK_PARAM}=${encodeURIComponent(taskId)}`;
}

const PATH_DESTINATIONS: Record<string, Destination> = {
  "/pokedex": "pokedex",
  "/history": "logbook",
  "/settings": "settings",
};

function readPane(params: ReadableSearchParams): Pane {
  // Naming a task implies the log pane regardless of the pane parameter's
  // own value, so a link that names a task but also asks for the encounter
  // scene still resolves to the log rather than stranding a Ranger on the
  // scene while a task is actually open.
  if (params.get(TASK_PARAM) !== null) return "log";
  return params.get(PANE_PARAM) === ENCOUNTER_PANE_VALUE ? "encounter" : "log";
}

export type NavigationState = {
  /** The destination to mark as the one the Ranger is on, or `null` for none. */
  destination: Destination | null;
  /**
   * Whether the right pane — whichever destination the address names — is
   * showing. Always true on a wide screen, which draws both panes at once;
   * on a narrow screen it is the one thing that decides whether the chrome
   * shell is sitting on the encounter scene or on a destination (#33).
   * `AppStage` is the one place that reads it.
   */
  rightVisible: boolean;
};

/**
 * What the nav shows from a given address, and whether the chrome shell's
 * right pane is showing (#33).
 *
 * The field log's marking is surface-dependent: on a wide screen it is part
 * of the home screen and is marked the whole time a Ranger is there, while on
 * a narrow screen the plain home address is the field log and the encounter
 * scene (`?pane=encounter`) is marked as its own destination — so the marking
 * never claims a Ranger is somewhere they are not.
 *
 * `rightVisible` follows from the same reading: a wide screen draws both
 * panes regardless of the address, and a narrow screen shows the right pane
 * for every address except the encounter scene's.
 */
export function resolveNavigation({
  pathname,
  params,
  surface,
}: {
  pathname: string;
  params: ReadableSearchParams;
  surface: Surface;
}): NavigationState {
  if (pathname !== "/") {
    return { destination: PATH_DESTINATIONS[pathname] ?? null, rightVisible: true };
  }

  const onEncounterScene = surface === "narrow" && readPane(params) === "encounter";

  return {
    destination: onEncounterScene ? "encounter" : "field-log",
    rightVisible: !onEncounterScene,
  };
}

export type FieldView = {
  /** The task taking over a narrow screen. Always `null` on a wide screen. */
  detailTaskId: string | null;
  /** The field log row expanded in place. Always `null` on a narrow screen. */
  expandedTaskId: string | null;
  /** The add form as a narrow screen wears it: a sheet rising over everything. */
  addSheetOpen: boolean;
  /** The add form as a wide screen wears it: the editor pinned above the list. */
  addEditorOpen: boolean;
};

/**
 * What the field screen is showing from a given address.
 *
 * `openTasks` is what an address naming a task is resolved against, so a link
 * to a task that has since been completed or deleted resolves to nothing. A
 * task still being created is refused outright even though it is in the
 * list: its id is synthetic and stops meaning anything the moment the page
 * reloads.
 *
 * Which pane a narrow screen is showing is no longer this function's answer
 * (#33) — that moved to `resolveNavigation`'s `rightVisible`, now that the
 * pane a Ranger is looking at is chrome-level, not field-screen-level.
 */
export function resolveFieldView({
  params,
  surface,
  openTasks,
}: {
  params: ReadableSearchParams;
  surface: Surface;
  openTasks: readonly Pick<Task, "id">[];
}): FieldView {
  const namedTaskId = params.get(TASK_PARAM);
  const openTaskId =
    namedTaskId !== null && !isPendingTaskId(namedTaskId) && openTasks.some((task) => task.id === namedTaskId)
      ? namedTaskId
      : null;
  const addOpen = params.get(ADD_PARAM) === ADD_FLAG_VALUE;

  return {
    detailTaskId: surface === "narrow" ? openTaskId : null,
    expandedTaskId: surface === "wide" ? openTaskId : null,
    addSheetOpen: surface === "narrow" && addOpen,
    addEditorOpen: surface === "wide" && addOpen,
  };
}

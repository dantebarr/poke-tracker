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

/** The four places the nav row can take a Ranger. */
export type Destination = "field-log" | "pokedex" | "logbook" | "settings";

/** The two halves of the field screen. On a wide screen both are drawn at once. */
export type Pane = "encounter" | "log";

export const PANE_PARAM = "pane";
export const TASK_PARAM = "task";
export const ADD_PARAM = "add";

/** The pane parameter's only recognised value — its absence means the encounter view. */
const LOG_PANE_VALUE = "log";
/** The add parameter's only recognised value; it is a flag, so the value is just "on". */
const ADD_FLAG_VALUE = "1";

/** Whatever `useSearchParams` hands back, narrowed to the one method these functions need. */
export type ReadableSearchParams = Pick<URLSearchParams, "get">;

export const ENCOUNTER_HREF = "/";

/**
 * The field log's address. It carries the pane parameter on both surfaces
 * — a single link, inert on a wide screen where the log is already drawn,
 * rather than one computed from the viewport, which would make the link's
 * destination differ between the server-rendered HTML and the hydrated page.
 */
export const FIELD_LOG_HREF = `/?${PANE_PARAM}=${LOG_PANE_VALUE}`;

export const ADD_FORM_HREF = `${FIELD_LOG_HREF}&${ADD_PARAM}=${ADD_FLAG_VALUE}`;

/**
 * A task's own address. The pane parameter rides alongside the task, so
 * leaving the task is a matter of dropping one parameter rather than
 * reconstructing where the Ranger was.
 */
export function taskHref(taskId: string): string {
  return `${FIELD_LOG_HREF}&${TASK_PARAM}=${encodeURIComponent(taskId)}`;
}

const PATH_DESTINATIONS: Record<string, Destination> = {
  "/pokedex": "pokedex",
  "/history": "logbook",
  "/settings": "settings",
};

function readPane(params: ReadableSearchParams): Pane {
  return params.get(PANE_PARAM) === LOG_PANE_VALUE ? "log" : "encounter";
}

export type NavigationState = {
  /** The destination to mark as the one the Ranger is on, or `null` for none. */
  destination: Destination | null;
  /** Whether the home arrow belongs on the nav row. */
  homeVisible: boolean;
};

/**
 * What the status strip's nav row shows from a given address.
 *
 * The field log's marking is deliberately surface-dependent: on a wide
 * screen the field log is part of the home screen and is marked the whole
 * time a Ranger is there, while on a narrow screen it is a separate
 * destination and is marked only while it is the pane actually showing —
 * so the marking never claims a Ranger is somewhere they are not.
 *
 * The home arrow follows from the same reading: it exists to get back to the
 * encounter view, so it is drawn everywhere except where a Ranger is already
 * looking at it, and never on a wide screen, where the field log icon
 * already leads to the one screen holding both panes.
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
    return { destination: PATH_DESTINATIONS[pathname] ?? null, homeVisible: surface === "narrow" };
  }

  const onEncounterView = surface === "narrow" && readPane(params) === "encounter";

  return {
    destination: onEncounterView ? null : "field-log",
    homeVisible: surface === "narrow" && !onEncounterView,
  };
}

export type FieldView = {
  /** The pane filling a narrow screen. Inert on a wide screen, which draws both. */
  pane: Pane;
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
 * to a task that has since been completed or deleted resolves to nothing —
 * and, because naming a task also means naming the field log, lands the
 * Ranger on their field log rather than on their Pokémon. A task still being
 * created is refused outright even though it is in the list: its id is
 * synthetic and stops meaning anything the moment the page reloads.
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
    pane: namedTaskId !== null ? "log" : readPane(params),
    detailTaskId: surface === "narrow" ? openTaskId : null,
    expandedTaskId: surface === "wide" ? openTaskId : null,
    addSheetOpen: surface === "narrow" && addOpen,
    addEditorOpen: surface === "wide" && addOpen,
  };
}

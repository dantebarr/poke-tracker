import { describe, expect, it } from "vitest";

import {
  ADD_PARAM,
  PANE_PARAM,
  TASK_PARAM,
  resolveFieldView,
  resolveNavigation,
} from "@/app/(app)/chrome/navigation";
import { PENDING_ID_PREFIX } from "@/app/pending-task-id";

/**
 * Pure logic, no database — these run without the local Supabase stack even
 * though the global setup starts it for the suite as a whole. See
 * tests/encounter-view.test.ts for the same note and its shape.
 *
 * Every case here is written the way a Ranger meets it: an address plus the
 * width of the screen they are holding, asserted against what is on screen
 * and what is marked. Nothing below knows how the components are organised.
 */

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

const openTasks = [{ id: "task-1" }, { id: "task-2" }];

describe("which destination the nav marks", () => {
  it.each([
    ["/pokedex", "pokedex"],
    ["/history", "logbook"],
    ["/settings", "settings"],
  ] as const)("marks %s as %s on either surface", (pathname, destination) => {
    for (const surface of ["narrow", "wide"] as const) {
      expect(resolveNavigation({ pathname, params: params(""), surface }).destination).toBe(destination);
    }
  });

  it("marks nothing on a path it does not recognise", () => {
    expect(resolveNavigation({ pathname: "/nowhere", params: params(""), surface: "wide" }).destination).toBeNull();
  });

  it("marks the field log on the plain home address on either surface, since a narrow screen's home is the log", () => {
    for (const surface of ["narrow", "wide"] as const) {
      expect(resolveNavigation({ pathname: "/", params: params(""), surface }).destination).toBe("field-log");
    }
  });

  it("marks the encounter scene on a narrow screen asking for it", () => {
    expect(
      resolveNavigation({ pathname: "/", params: params(`${PANE_PARAM}=encounter`), surface: "narrow" }).destination,
    ).toBe("encounter");
  });

  it("marks the field log on a wide screen asking for the encounter scene, which it already draws beside the log", () => {
    expect(
      resolveNavigation({ pathname: "/", params: params(`${PANE_PARAM}=encounter`), surface: "wide" }).destination,
    ).toBe("field-log");
  });

  it("keeps the field log marked on a narrow screen while a task from it is open", () => {
    expect(
      resolveNavigation({ pathname: "/", params: params(`${TASK_PARAM}=task-1`), surface: "narrow" }).destination,
    ).toBe("field-log");
  });

  it("prefers the log when an address names a task and also asks for the encounter scene", () => {
    expect(
      resolveNavigation({
        pathname: "/",
        params: params(`${PANE_PARAM}=encounter&${TASK_PARAM}=task-1`),
        surface: "narrow",
      }).destination,
    ).toBe("field-log");
  });

  it("still reads the legacy log pane parameter as the log", () => {
    expect(
      resolveNavigation({ pathname: "/", params: params(`${PANE_PARAM}=log`), surface: "narrow" }).destination,
    ).toBe("field-log");
  });
});

describe("whether the right pane is visible", () => {
  it("is true for the plain home address on a narrow screen, where the field log fills the screen", () => {
    expect(resolveNavigation({ pathname: "/", params: params(""), surface: "narrow" }).rightVisible).toBe(true);
  });

  it("is false on a narrow screen asking for the encounter scene", () => {
    expect(
      resolveNavigation({ pathname: "/", params: params(`${PANE_PARAM}=encounter`), surface: "narrow" }).rightVisible,
    ).toBe(false);
  });

  it("is true on a narrow screen for each of the three destination paths", () => {
    for (const pathname of ["/pokedex", "/history", "/settings"]) {
      expect(resolveNavigation({ pathname, params: params(""), surface: "narrow" }).rightVisible).toBe(true);
    }
  });

  it("is true on a narrow screen for an address naming a task", () => {
    expect(
      resolveNavigation({ pathname: "/", params: params(`${TASK_PARAM}=task-1`), surface: "narrow" }).rightVisible,
    ).toBe(true);
  });

  it("is true on a wide screen for every address, since a wide screen always draws both", () => {
    for (const query of ["", `${PANE_PARAM}=encounter`]) {
      expect(resolveNavigation({ pathname: "/", params: params(query), surface: "wide" }).rightVisible).toBe(true);
    }
    for (const pathname of ["/pokedex", "/history", "/settings"]) {
      expect(resolveNavigation({ pathname, params: params(""), surface: "wide" }).rightVisible).toBe(true);
    }
  });
});

describe("which task the field screen opens", () => {
  it("opens a task that is still Open, full screen on a narrow screen", () => {
    const view = resolveFieldView({ params: params(`${TASK_PARAM}=task-1`), surface: "narrow", openTasks });
    expect(view.detailTaskId).toBe("task-1");
    expect(view.expandedTaskId).toBeNull();
  });

  it("opens the same task as an expanded row on a wide screen", () => {
    const view = resolveFieldView({ params: params(`${TASK_PARAM}=task-1`), surface: "wide", openTasks });
    expect(view.expandedTaskId).toBe("task-1");
    expect(view.detailTaskId).toBeNull();
  });

  it("opens nothing when the task has since been completed or deleted", () => {
    const view = resolveFieldView({ params: params(`${TASK_PARAM}=task-9`), surface: "narrow", openTasks });
    expect(view.detailTaskId).toBeNull();
  });

  it("refuses a task that is still being created, whose id stops meaning anything on reload", () => {
    const pendingId = `${PENDING_ID_PREFIX}42`;
    const view = resolveFieldView({
      params: params(`${TASK_PARAM}=${pendingId}`),
      surface: "narrow",
      openTasks: [...openTasks, { id: pendingId }],
    });
    expect(view.detailTaskId).toBeNull();
  });

  it("opens nothing when the address names no task", () => {
    const view = resolveFieldView({ params: params(`${PANE_PARAM}=log`), surface: "wide", openTasks });
    expect(view.detailTaskId).toBeNull();
    expect(view.expandedTaskId).toBeNull();
  });
});

describe("whether the add form is up", () => {
  it("stays closed when the address does not flag it", () => {
    const view = resolveFieldView({ params: params(`${PANE_PARAM}=log`), surface: "narrow", openTasks });
    expect(view.addSheetOpen).toBe(false);
    expect(view.addEditorOpen).toBe(false);
  });

  it("rises as a sheet on a narrow screen", () => {
    const view = resolveFieldView({ params: params(`${ADD_PARAM}=1`), surface: "narrow", openTasks });
    expect(view.addSheetOpen).toBe(true);
    expect(view.addEditorOpen).toBe(false);
  });

  it("opens as the pinned editor on a wide screen", () => {
    const view = resolveFieldView({ params: params(`${ADD_PARAM}=1`), surface: "wide", openTasks });
    expect(view.addEditorOpen).toBe(true);
    expect(view.addSheetOpen).toBe(false);
  });

  it("ignores a flag value it does not recognise", () => {
    const view = resolveFieldView({ params: params(`${ADD_PARAM}=maybe`), surface: "narrow", openTasks });
    expect(view.addSheetOpen).toBe(false);
  });
});

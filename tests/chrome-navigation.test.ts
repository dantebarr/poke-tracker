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

  it("marks the field log on a wide screen's plain home address, where the log is already on screen", () => {
    expect(resolveNavigation({ pathname: "/", params: params(""), surface: "wide" }).destination).toBe("field-log");
  });

  it("marks nothing on a narrow screen's plain home address, which is showing the encounter view", () => {
    expect(resolveNavigation({ pathname: "/", params: params(""), surface: "narrow" }).destination).toBeNull();
  });

  it("marks the field log on a narrow screen only once the log pane is the one showing", () => {
    expect(
      resolveNavigation({ pathname: "/", params: params(`${PANE_PARAM}=log`), surface: "narrow" }).destination,
    ).toBe("field-log");
  });

  it("keeps the field log marked on a narrow screen while a task from it is open", () => {
    expect(
      resolveNavigation({
        pathname: "/",
        params: params(`${PANE_PARAM}=log&${TASK_PARAM}=task-1`),
        surface: "narrow",
      }).destination,
    ).toBe("field-log");
  });
});

describe("whether the home arrow is drawn", () => {
  it("is never drawn on a wide screen, where the field log icon already goes home", () => {
    for (const query of ["", `${PANE_PARAM}=log`]) {
      expect(resolveNavigation({ pathname: "/", params: params(query), surface: "wide" }).homeVisible).toBe(false);
    }
    expect(resolveNavigation({ pathname: "/settings", params: params(""), surface: "wide" }).homeVisible).toBe(false);
  });

  it("is not drawn on a narrow screen already showing the encounter view", () => {
    expect(resolveNavigation({ pathname: "/", params: params(""), surface: "narrow" }).homeVisible).toBe(false);
  });

  it("is drawn on a narrow screen showing the field log", () => {
    expect(
      resolveNavigation({ pathname: "/", params: params(`${PANE_PARAM}=log`), surface: "narrow" }).homeVisible,
    ).toBe(true);
  });

  it("is drawn on a narrow screen showing an open task", () => {
    expect(
      resolveNavigation({
        pathname: "/",
        params: params(`${PANE_PARAM}=log&${TASK_PARAM}=task-1`),
        surface: "narrow",
      }).homeVisible,
    ).toBe(true);
  });

  it("is drawn on every other narrow screen", () => {
    for (const pathname of ["/pokedex", "/history", "/settings"]) {
      expect(resolveNavigation({ pathname, params: params(""), surface: "narrow" }).homeVisible).toBe(true);
    }
  });
});

describe("which pane the field screen shows", () => {
  it("shows the encounter view when the address says nothing, so the front door stays undecorated", () => {
    expect(resolveFieldView({ params: params(""), surface: "narrow", openTasks }).pane).toBe("encounter");
  });

  it("shows the field log when the address asks for it", () => {
    expect(resolveFieldView({ params: params(`${PANE_PARAM}=log`), surface: "narrow", openTasks }).pane).toBe("log");
  });

  it("falls back to the encounter view on a pane it does not recognise", () => {
    expect(resolveFieldView({ params: params(`${PANE_PARAM}=jungle`), surface: "narrow", openTasks }).pane).toBe(
      "encounter",
    );
  });

  it("shows the field log whenever a task is named, so a stale link lands there rather than on the Pokémon", () => {
    expect(resolveFieldView({ params: params(`${TASK_PARAM}=gone`), surface: "narrow", openTasks }).pane).toBe("log");
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
    expect(view.pane).toBe("log");
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

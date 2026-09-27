import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startBridge } from "../src/bridge/server.js";
import { TaskStore } from "../src/control/task-store.js";
import { createMissionControlState, renderMissionControlHtml } from "../src/mission-control/view.js";
import { cleanup, makeTmpDir } from "./helpers.js";

describe("Mission Control", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) cleanup(dir);
    dirs.length = 0;
  });

  it("selects the most recently updated active task", () => {
    const oldTask = {
      id: "task_old",
      goal: "Old goal",
      title: "Old task",
      status: "open" as const,
      surface: "chat" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const currentTask = {
      ...oldTask,
      id: "task_current",
      goal: "Build Mission Control",
      title: "Mission Control",
      surface: "codex" as const,
      updatedAt: "2026-01-02T00:00:00.000Z",
      metadata: {
        decisions: ["Keep the control layer thin"],
        nextAction: "Validate locally",
      },
    };

    const state = createMissionControlState(currentTask, new Date("2026-01-03T00:00:00.000Z"));
    const html = renderMissionControlHtml(state);

    expect(state.activeTask).toEqual(currentTask);
    expect(state.currentSurface).toBe("codex");
    expect(state.nextAction).toBe("Validate locally");
    expect(html).toContain("Mission Control");
    expect(html).toContain("Keep the control layer thin");
    expect(html).toContain("Validate locally");
    expect(html).toContain("Codex");
    expect(html).toContain("is-active");
  });

  it("serves the local Mission Control page from the bridge", async () => {
    const workspace = makeTmpDir("mission-control-workspace");
    const auth = makeTmpDir("mission-control-auth");
    dirs.push(workspace, auth);

    const bridge = await startBridge({
      workspaceRoot: workspace,
      port: 0,
      persistRuntime: false,
      authStoreFile: path.join(auth, "store.json"),
    });

    try {
      const response = await fetch(`${bridge.localBaseUrl()}/mission-control`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(html).toContain("Wingwoman Mission Control");
      expect(html).toContain("Chat");
      expect(html).toContain("Work");
      expect(html).toContain("Codex");
    } finally {
      await bridge.close();
    }
  });
});

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { beginExecutionGate, completeExecutionGate, handleCodexTurn } from "../src/control/codex-turn.js";
import { TaskStore, getWingwomanWorkspaceDir } from "../src/control/task-store.js";
import { createMissionControlState } from "../src/mission-control/view.js";
import { Workspace } from "../src/workspace/manager.js";
import { cleanup, makeTmpDir } from "./helpers.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = path.join(projectRoot, "src/cli/index.ts");

function runCli(cwd: string, args: string[], stateDir: string) {
  return spawnSync(process.execPath, ["--import", "tsx", cliEntry, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, C2C_STATE_DIR: stateDir },
  });
}

function makeProject(name: string): string {
  const dir = makeTmpDir(name);
  return dir;
}

describe("Wingwoman workspace isolation", () => {
  it("A. project-a tasks are invisible from project-b task list", () => {
    const stateDir = makeTmpDir("wingwoman-state");
    const projectA = makeProject("project-a");
    const projectB = makeProject("project-b");
    try {
      expect(runCli(projectA, ["project", "set", "default", "--json"], stateDir).status).toBe(0);
      expect(runCli(projectB, ["project", "set", "default", "--json"], stateDir).status).toBe(0);
      const created = runCli(projectA, ["task", "create", "--goal", "Project A task", "--json"], stateDir);
      expect(created.status).toBe(0);

      const listA = JSON.parse(runCli(projectA, ["task", "list", "--json"], stateDir).stdout) as { tasks: { goal: string }[] };
      const listB = JSON.parse(runCli(projectB, ["task", "list", "--json"], stateDir).stdout) as { tasks: { goal: string }[] };

      expect(listA.tasks.map((task) => task.goal)).toContain("Project A task");
      expect(listB.tasks).toEqual([]);
    } finally {
      cleanup(stateDir);
      cleanup(projectA);
      cleanup(projectB);
    }
  });

  it("B. project-a and project-b can each have independent active tasks", () => {
    const stateDir = makeTmpDir("wingwoman-state-active");
    const previous = process.env.C2C_STATE_DIR;
    process.env.C2C_STATE_DIR = stateDir;
    const projectA = makeProject("project-a-active");
    const projectB = makeProject("project-b-active");
    try {
      const storeA = TaskStore.forWorkspaceRoot(projectA);
      const storeB = TaskStore.forWorkspaceRoot(projectB);
      const taskA = storeA.createTask({ goal: "A active", surface: "codex" });
      const taskB = storeB.createTask({ goal: "B active", surface: "chat" });

      expect(storeA.getActiveTask()?.id).toBe(taskA.id);
      expect(storeB.getActiveTask()?.id).toBe(taskB.id);
      expect(storeA.getActiveTask()?.goal).toBe("A active");
      expect(storeB.getActiveTask()?.goal).toBe("B active");
    } finally {
      if (previous === undefined) delete process.env.C2C_STATE_DIR;
      else process.env.C2C_STATE_DIR = previous;
      cleanup(stateDir);
      cleanup(projectA);
      cleanup(projectB);
    }
  });

  it("C. route, handoff, and drift state do not cross workspace boundaries", () => {
    const stateDir = makeTmpDir("wingwoman-state-route");
    const previous = process.env.C2C_STATE_DIR;
    process.env.C2C_STATE_DIR = stateDir;
    const projectA = makeProject("project-a-route");
    const projectB = makeProject("project-b-route");
    try {
      const storeA = TaskStore.forWorkspaceRoot(projectA);
      const storeB = TaskStore.forWorkspaceRoot(projectB);

      handleCodexTurn({ currentQuestion: "Analyze repo bug", needsWorkspaceRead: true }, storeA);
      handleCodexTurn({ currentQuestion: "Brainstorm name", canAnswerWithoutWorkspace: true }, storeB);
      beginExecutionGate("Update auth router validation", storeA);
      completeExecutionGate(
        { actualChanges: "Changed billing dashboard copy", verification: "Typecheck passed" },
        storeA
      );

      const stateA = createMissionControlState(storeA.getActiveTask());
      const stateB = createMissionControlState(storeB.getActiveTask());

      expect(stateA.routeDecision?.target).toBe("codex");
      expect(stateA.execution?.driftDetected).toBe(true);
      expect(stateA.latestHandoff).toBeNull();
      expect(stateB.routeDecision?.target).toBe("chat");
      expect(stateB.latestHandoff?.target).toBe("chat");
      expect(stateB.execution).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.C2C_STATE_DIR;
      else process.env.C2C_STATE_DIR = previous;
      cleanup(stateDir);
      cleanup(projectA);
      cleanup(projectB);
    }
  });

  it("stores workspace state under wingwoman/workspaces/<workspaceId>", () => {
    const stateDir = makeTmpDir("wingwoman-state-dir");
    const previous = process.env.C2C_STATE_DIR;
    process.env.C2C_STATE_DIR = stateDir;
    const project = makeProject("project-state-dir");
    try {
      const workspace = new Workspace(project);
      TaskStore.forWorkspace(workspace).createTask({ goal: "Scoped task", surface: "codex" });

      expect(getWingwomanWorkspaceDir(workspace.id)).toBe(path.join(stateDir, "wingwoman", "workspaces", workspace.id));
    } finally {
      if (previous === undefined) delete process.env.C2C_STATE_DIR;
      else process.env.C2C_STATE_DIR = previous;
      cleanup(stateDir);
      cleanup(project);
    }
  });

  it("D. runtime can be invoked from a repo unrelated to the Wingwoman source checkout", () => {
    const stateDir = makeTmpDir("wingwoman-state-runtime");
    const project = makeProject("unrelated-runtime-repo");
    try {
      const result = spawnSync(process.execPath, ["--import", "tsx", cliEntry, "task", "create", "--goal", "Runtime works", "--json"], {
        cwd: project,
        encoding: "utf8",
        env: { ...process.env, C2C_STATE_DIR: stateDir },
      });
      expect(result.status).not.toBe(0);
      expect(result.stdout).toContain("projectScope=unresolved");

      expect(runCli(project, ["project", "set", "default", "--json"], stateDir).status).toBe(0);
      const created = spawnSync(process.execPath, ["--import", "tsx", cliEntry, "task", "create", "--goal", "Runtime works", "--json"], {
        cwd: project,
        encoding: "utf8",
        env: { ...process.env, C2C_STATE_DIR: stateDir },
      });
      expect(created.status).toBe(0);
      const payload = JSON.parse(created.stdout) as { task: { goal: string } };
      expect(payload.task.goal).toBe("Runtime works");

      const list = runCli(project, ["task", "list", "--json"], stateDir);
      const listed = JSON.parse(list.stdout) as { tasks: { goal: string }[] };
      expect(listed.tasks.map((task) => task.goal)).toContain("Runtime works");
    } finally {
      cleanup(stateDir);
      cleanup(project);
    }
  });
});

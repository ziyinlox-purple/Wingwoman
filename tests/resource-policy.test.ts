import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decideResourcePolicy } from "../src/control/resource-policy.js";
import { TaskStore } from "../src/control/task-store.js";
import { routeTask } from "../src/control/router.js";
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

describe("Resource Policy Engine", () => {
  it("A. routes strategy brainstorming for Example Workspace/project-a to Chat", () => {
    expect(
      decideResourcePolicy({
        currentSurface: "codex",
        workspaceId: "Example Workspace",
        projectId: "project-a",
        role: "strategy",
        canAnswerWithoutWorkspace: true,
      })
    ).toMatchObject({ target: "chat", action: "demote", resourceClass: "cognition", groundingRequired: false });
  });

  it("B. routes real current-code architecture analysis to Codex", () => {
    expect(
      decideResourcePolicy({
        currentSurface: "chat",
        workspaceId: "Example Workspace",
        projectId: "project-a",
        role: "strategy",
        needsWorkspaceRead: true,
      })
    ).toMatchObject({ target: "codex", action: "escalate", groundingRequired: true });
  });

  it("C. routes external market research to Work", () => {
    expect(
      decideResourcePolicy({
        currentSurface: "chat",
        workspaceId: "Example Workspace",
        projectId: "project-a",
        role: "research",
        needsResearch: true,
      })
    ).toMatchObject({ target: "work", action: "escalate", resourceClass: "research" });
  });

  it("D. keeps operator copywriting in Chat", () => {
    expect(
      decideResourcePolicy({
        currentSurface: "chat",
        role: "operator",
        canAnswerWithoutWorkspace: true,
      })
    ).toMatchObject({ target: "chat", action: "stay" });
  });
});

describe("Project scope", () => {
  it("accepts chief-of-staff and rejects unknown roles", () => {
    const stateDir = makeTmpDir("role-chief-of-staff");
    const workspaceRoot = makeTmpDir("example-role-workspace");
    try {
      expect(runCli(workspaceRoot, ["project", "set", "project-a", "--json"], stateDir).status).toBe(0);

      const accepted = runCli(workspaceRoot, ["role", "set", "chief-of-staff", "--json"], stateDir);
      expect(accepted.status).toBe(0);
      expect(JSON.parse(accepted.stdout)).toMatchObject({ ok: true, role: "chief-of-staff" });

      const rejected = runCli(workspaceRoot, ["role", "set", "legacy-role", "--json"], stateDir);
      expect(rejected.status).not.toBe(0);
      expect(JSON.parse(rejected.stdout)).toMatchObject({ ok: false, error: "Invalid role: legacy-role" });
    } finally {
      cleanup(stateDir);
      cleanup(workspaceRoot);
    }
  });

  it("E. isolates active tasks by workspace + project", () => {
    const stateDir = makeTmpDir("project-scope-active");
    const previous = process.env.C2C_STATE_DIR;
    process.env.C2C_STATE_DIR = stateDir;
    const workspaceRoot = makeTmpDir("example-project");
    try {
      const workspace = new Workspace(workspaceRoot);
      const projectA = TaskStore.forProject(workspace, "project-a").withScope({ workspaceId: workspace.id, projectId: "project-a" });
      const projectB = TaskStore.forProject(workspace, "project-b").withScope({ workspaceId: workspace.id, projectId: "project-b" });
      const a = projectA.createTask({ goal: "Example Project active" });
      const b = projectB.createTask({ goal: "Project B active" });

      expect(projectA.getActiveTask()?.id).toBe(a.id);
      expect(projectB.getActiveTask()?.id).toBe(b.id);
      expect(projectA.getActiveTask()?.goal).toBe("Example Project active");
      expect(projectB.getActiveTask()?.goal).toBe("Project B active");
    } finally {
      if (previous === undefined) delete process.env.C2C_STATE_DIR;
      else process.env.C2C_STATE_DIR = previous;
      cleanup(stateDir);
      cleanup(workspaceRoot);
    }
  });

  it("A. keeps chief-of-staff and research task roles isolated in one workspace project", () => {
    const stateDir = makeTmpDir("task-role-isolation");
    const previous = process.env.C2C_STATE_DIR;
    process.env.C2C_STATE_DIR = stateDir;
    const workspaceRoot = makeTmpDir("example-task-role-workspace");
    try {
      const workspace = new Workspace(workspaceRoot);
      const store = TaskStore.forProject(workspace, "project-a").withScope({
        workspaceId: workspace.id,
        projectId: "project-a",
        projectName: "Example Project",
      });

      const chief = store.createTask({ goal: "Coordinate project-a", role: "chief-of-staff" });
      const research = store.createTask({ goal: "Research project-a market", role: "research" });

      expect(store.getTask(chief.id)?.role).toBe("chief-of-staff");
      expect(store.getTask(research.id)?.role).toBe("research");
    } finally {
      if (previous === undefined) delete process.env.C2C_STATE_DIR;
      else process.env.C2C_STATE_DIR = previous;
      cleanup(stateDir);
      cleanup(workspaceRoot);
    }
  });

  it("B. routes a research task doing external research to Work", () => {
    const task = {
      id: "task_research",
      goal: "Research market",
      title: "Research market",
      status: "open" as const,
      surface: "chat" as const,
      role: "research" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(routeTask({ currentSurface: task.surface, role: task.role, needsResearch: true })).toMatchObject({
      surface: "work",
      action: "escalate",
    });
  });

  it("C. routes a reviewer task reviewing repo diff to Codex", () => {
    const task = {
      id: "task_reviewer",
      goal: "Review diff",
      title: "Review diff",
      status: "open" as const,
      surface: "chat" as const,
      role: "reviewer" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(routeTask({ currentSurface: task.surface, role: task.role, needsWorkspaceRead: true, needsGit: true })).toMatchObject({
      surface: "codex",
      action: "escalate",
    });
  });

  it("D. Mission Control shows the active task role after switching active tasks", () => {
    const stateDir = makeTmpDir("mission-control-task-role");
    const previous = process.env.C2C_STATE_DIR;
    process.env.C2C_STATE_DIR = stateDir;
    const workspaceRoot = makeTmpDir("example-mission-role-workspace");
    try {
      const workspace = new Workspace(workspaceRoot);
      const store = TaskStore.forProject(workspace, "project-a").withScope({
        workspaceId: workspace.id,
        projectId: "project-a",
        projectName: "Example Project",
      });
      const chief = store.createTask({ goal: "Coordinate", role: "chief-of-staff" });
      const reviewer = store.createTask({ goal: "Review", role: "reviewer" });

      expect(createMissionControlState(store.getActiveTask()).role).toBe("reviewer");
      store.activateTask(chief.id);
      expect(createMissionControlState(store.getActiveTask()).role).toBe("chief-of-staff");
      store.activateTask(reviewer.id);
      expect(createMissionControlState(store.getActiveTask()).role).toBe("reviewer");
    } finally {
      if (previous === undefined) delete process.env.C2C_STATE_DIR;
      else process.env.C2C_STATE_DIR = previous;
      cleanup(stateDir);
      cleanup(workspaceRoot);
    }
  });

  it("F. leaves projectScope unresolved without explicit project context", () => {
    const stateDir = makeTmpDir("project-scope-unresolved");
    const workspaceRoot = makeTmpDir("example-project-unresolved");
    try {
      const current = runCli(workspaceRoot, ["project", "current", "--json"], stateDir);
      expect(current.status).toBe(0);
      expect(JSON.parse(current.stdout).projectScope).toMatchObject({ status: "unresolved" });

      const create = runCli(workspaceRoot, ["task", "create", "--goal", "Should not guess", "--json"], stateDir);
      expect(create.status).not.toBe(0);
      expect(JSON.parse(create.stdout)).toMatchObject({ ok: false });
      expect(create.stdout).toContain("projectScope=unresolved");
    } finally {
      cleanup(stateDir);
      cleanup(workspaceRoot);
    }
  });

  it("G. reads old tasks without projectId as default", () => {
    const dir = makeTmpDir("legacy-default-task");
    try {
      const legacy = {
        tasks: [
          {
            id: "task_legacy",
            goal: "Legacy task",
            title: "Legacy task",
            status: "open",
            surface: "chat",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      };
      fs.writeFileSync(path.join(dir, "tasks.json"), JSON.stringify(legacy));
      const store = new TaskStore(path.join(dir, "tasks.json"));
      expect(store.getTask("task_legacy")).toMatchObject({ projectId: "default", role: "unknown" });
    } finally {
      cleanup(dir);
    }
  });
});

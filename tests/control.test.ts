import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createHandoff } from "../src/control/handoff.js";
import { routeTask } from "../src/control/router.js";
import { TaskStore } from "../src/control/task-store.js";
import type { RouteDecision, Surface, Task } from "../src/control/types.js";
import { Workspace } from "../src/workspace/manager.js";
import { cleanup, makeTmpDir } from "./helpers.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = path.join(projectRoot, "src/cli/index.ts");

function task(surface: Surface): Task {
  return {
    id: `task_${surface}`,
    goal: "Ship Wingwoman routing",
    title: "Ship Wingwoman routing",
    status: "open",
    surface,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function decision(target: Surface, action: RouteDecision["action"]): RouteDecision {
  return {
    surface: target,
    action,
    reason: "Route decision reason",
    downgradedToChat: target === "chat",
  };
}

describe("TaskStore", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) cleanup(dir);
    dirs.length = 0;
  });

  it("creates, reads, updates, and lists tasks from a JSON file", () => {
    const dir = makeTmpDir("task-store");
    dirs.push(dir);
    const store = new TaskStore(path.join(dir, "tasks.json"));

    const created = store.createTask({
      goal: "  Draft launch plan  ",
      description: "Keep it local",
      surface: "work",
      metadata: { phase: 1 },
    });

    expect(created.id).toMatch(/^task_[a-f0-9]{16}$/);
    expect(created.goal).toBe("Draft launch plan");
    expect(created.title).toBe("Draft launch plan");
    expect(created.status).toBe("open");
    expect(store.getTask(created.id)).toEqual(created);
    expect(store.getActiveTaskId()).toBe(created.id);
    expect(store.getActiveTask()).toEqual(created);

    const updated = store.updateTask(created.id, { status: "in_progress", surface: "codex" });
    expect(updated.status).toBe("in_progress");
    expect(updated.surface).toBe("codex");
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
    expect(store.listTasks()).toEqual([updated]);
  });

  it("activates a task and persists the active task id separately", () => {
    const dir = makeTmpDir("task-store-active");
    dirs.push(dir);
    const store = new TaskStore(path.join(dir, "tasks.json"));

    const first = store.createTask({ goal: "First", surface: "chat" });
    const second = store.createTask({ goal: "Second", surface: "work" });

    expect(store.getActiveTaskId()).toBe(second.id);
    expect(store.activateTask(first.id)).toEqual(first);

    const reopened = new TaskStore(path.join(dir, "tasks.json"));
    expect(reopened.getActiveTaskId()).toBe(first.id);
    expect(reopened.getActiveTask()).toEqual(first);
  });

  it("records the last route decision on the task", () => {
    const dir = makeTmpDir("task-store-route");
    dirs.push(dir);
    const store = new TaskStore(path.join(dir, "tasks.json"));
    const created = store.createTask({ goal: "Route me", surface: "chat" });
    const decision = routeTask({ currentSurface: "chat", needsRepoWrite: true });

    const updated = store.recordRouteDecision(created.id, decision);

    expect(updated.surface).toBe("codex");
    expect(updated.metadata?.nextAction).toBe("Continue in codex.");
    expect(updated.metadata?.lastRouteDecision).toMatchObject({
      target: "codex",
      action: "escalate",
      reason: decision.reason,
      nextAction: "Continue in codex.",
    });
  });

  it("persists CLI-created handoffs alongside the route decision", () => {
    const dir = makeTmpDir("task-store-cli-handoff");
    dirs.push(dir);
    const env = { ...process.env, C2C_STATE_DIR: dir };

    const project = spawnSync(process.execPath, ["--import", "tsx", cliEntry, "project", "set", "default", "--json"], {
      cwd: projectRoot,
      encoding: "utf8",
      env,
    });
    expect(project.status).toBe(0);

    const create = spawnSync(
      process.execPath,
      ["--import", "tsx", cliEntry, "task", "create", "--goal", "Need repo edits", "--surface", "chat", "--json"],
      { cwd: projectRoot, encoding: "utf8", env }
    );
    expect(create.status).toBe(0);
    const created = JSON.parse(create.stdout) as { task: Task };

    const handoff = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        cliEntry,
        "task",
        "handoff",
        created.task.id,
        "--target",
        "codex",
        "--current-question",
        "Need repo edits",
        "--json",
      ],
      { cwd: projectRoot, encoding: "utf8", env }
    );

    expect(handoff.status).toBe(0);
    const workspace = new Workspace(projectRoot);
    const store = new TaskStore(path.join(dir, "wingwoman", "workspaces", workspace.id, "projects", "default", "tasks.json"));
    const updated = store.getTask(created.task.id);
    expect(updated?.metadata?.lastRouteDecision).toMatchObject({ target: "codex", action: "escalate" });
    expect(updated?.metadata?.latestHandoff).toMatchObject({ target: "codex", nextAction: "Continue in codex." });
  });

  it("treats a missing task file as an empty store", () => {
    const dir = makeTmpDir("task-store-missing");
    dirs.push(dir);
    const store = new TaskStore(path.join(dir, "missing", "tasks.json"));

    expect(store.listTasks()).toEqual([]);
    expect(store.getTask("task_nope")).toBeNull();
  });
});

describe("routeTask", () => {
  it("A. keeps complex backend architecture analysis in Codex when it depends on the repo", () => {
    expect(
      routeTask({
        currentSurface: "codex",
        needsWorkspaceRead: true,
      })
    ).toMatchObject({
      surface: "codex",
      action: "stay",
      downgradedToChat: false,
    });
  });

  it("B. demotes pure product brainstorming to Chat when it does not depend on the repo", () => {
    expect(
      routeTask({
        currentSurface: "codex",
        canAnswerWithoutWorkspace: true,
      })
    ).toMatchObject({ surface: "chat", action: "demote", downgradedToChat: true });
  });

  it("C. routes external competitor research to Work", () => {
    expect(
      routeTask({
        currentSurface: "codex",
        needsResearch: true,
      })
    ).toMatchObject({ surface: "work", action: "handoff" });
  });

  it("escalates from Chat to Codex when repo writes are needed", () => {
    expect(
      routeTask({
        currentSurface: "chat",
        needsRepoWrite: true,
      })
    ).toMatchObject({ surface: "codex", action: "escalate" });
  });

  it("stays in Work when the current Work surface can complete external execution", () => {
    expect(
      routeTask({
        needsGeneralExecution: true,
        currentSurface: "work",
      })
    ).toMatchObject({ surface: "work", action: "stay" });
  });

  it("keeps repo-dependent discussion in Codex instead of demoting just because it is planning", () => {
    expect(
      routeTask({
        currentSurface: "codex",
        canAnswerWithoutWorkspace: true,
        needsWorkspaceRead: true,
      })
    ).toMatchObject({ surface: "codex", action: "stay" });
  });
});

describe("createHandoff", () => {
  it("creates a short codex to chat handoff", () => {
    const handoff = createHandoff(task("codex"), decision("chat", "demote"), {
      currentQuestion: "Can Chat finish the explanation?",
      decisions: ["No repo change is needed"],
      constraints: ["Do not include logs"],
      nextAction: "Answer in Chat",
    });

    expect(handoff.from).toBe("codex");
    expect(handoff.target).toBe("chat");
    expect(handoff.text).toContain("继续任务 task_codex");
    expect(handoff.text).toContain("目标：Ship Wingwoman routing");
    expect(handoff.text).toContain("下一步：Answer in Chat");
    expect(handoff.text).not.toContain("diff --git");
  });

  it("creates a chat to codex handoff", () => {
    const handoff = createHandoff(task("chat"), decision("codex", "escalate"), {
      currentQuestion: "Need repo edits",
      decisions: ["Use local tests after edits"],
      constraints: ["No tunnel setup"],
      nextAction: "Open Codex and modify files",
    });

    expect(handoff.from).toBe("chat");
    expect(handoff.target).toBe("codex");
    expect(handoff.text).toContain("当前问题：Need repo edits");
  });

  it("creates a chat to work handoff", () => {
    const handoff = createHandoff(task("chat"), decision("work", "escalate"), {
      currentQuestion: "Need research synthesis",
      decisions: ["Research first, implementation later"],
      constraints: ["Keep it short"],
      nextAction: "Continue in Work",
    });

    expect(handoff.from).toBe("chat");
    expect(handoff.target).toBe("work");
    expect(handoff.text).toContain("已确定：Research first, implementation later");
  });
});

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type {
  Handoff,
  Role,
  RouteDecision,
  RouteInput,
  StoredExecutionGate,
  StoredRouteDecision,
  Surface,
  Task,
  TaskCreateInput,
  TaskUpdateInput,
} from "./types.js";
import { ensureDir, getStateDir } from "../config/paths.js";
import { Workspace } from "../workspace/manager.js";

interface TaskStoreFile {
  tasks: Task[];
}

interface ActiveTaskFile {
  activeTaskId: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newTaskId(): string {
  return `task_${randomBytes(8).toString("hex")}`;
}

function readStore(filePath: string): TaskStoreFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as TaskStoreFile).tasks)) {
      return { tasks: [] };
    }
    return { tasks: (parsed as TaskStoreFile).tasks.map(compatTask) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { tasks: [] };
    throw error;
  }
}

function compatTask(task: Task): Task {
  return {
    ...task,
    taskId: task.taskId ?? task.id,
    projectId: task.projectId ?? "default",
    role: (task.role as Role | undefined) ?? "unknown",
  };
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function writeStore(filePath: string, store: TaskStoreFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, filePath);
}

export class TaskStore {
  constructor(
    private readonly filePath: string,
    private readonly activeFilePath = path.join(path.dirname(filePath), "active.json"),
    private readonly scope: { workspaceId?: string; workspaceName?: string; projectId?: string; projectName?: string; role?: Role } = {}
  ) {}

  static default(): TaskStore {
    return TaskStore.forWorkspaceRoot(process.cwd());
  }

  static forWorkspace(workspace: Workspace): TaskStore {
    return TaskStore.forProject(workspace, "default");
  }

  static forProject(workspace: Workspace, projectId: string): TaskStore {
    const legacyFile = path.join(getWingwomanWorkspaceDir(workspace.id), "tasks.json");
    const projectFile = path.join(getWingwomanProjectDir(workspace.id, projectId), "tasks.json");
    if (projectId === "default" && fs.existsSync(legacyFile) && !fs.existsSync(projectFile)) {
      return new TaskStore(legacyFile, path.join(path.dirname(legacyFile), "active.json"), {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        projectId,
        projectName: "default",
        role: "unknown",
      });
    }
    return new TaskStore(projectFile, path.join(path.dirname(projectFile), "active.json"), {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      projectId,
      projectName: projectId,
      role: "unknown",
    });
  }

  withScope(scope: { workspaceId?: string; workspaceName?: string; projectId?: string; projectName?: string; role?: Role }): TaskStore {
    return new TaskStore(this.filePath, this.activeFilePath, { ...this.scope, ...scope });
  }

  static forWorkspaceRoot(workspaceRoot: string): TaskStore {
    return TaskStore.forWorkspace(new Workspace(workspaceRoot));
  }

  createTask(input: TaskCreateInput): Task {
    const goal = input.goal.trim();
    if (!goal) throw new Error("Task goal is required");
    const title = input.title?.trim() || goal;

    const store = readStore(this.filePath);
    const timestamp = nowIso();
    const task = withoutUndefined({
      id: newTaskId(),
      taskId: undefined,
      workspaceId: this.scope.workspaceId,
      projectId: this.scope.projectId ?? "default",
      projectName: this.scope.projectName,
      role: input.role ?? this.scope.role ?? "unknown",
      goal,
      title,
      description: input.description,
      status: input.status ?? "open",
      surface: input.surface ?? "chat",
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: this.scope.workspaceName ? { ...input.metadata, workspaceName: this.scope.workspaceName } : input.metadata,
    }) as Task;
    task.taskId = task.id;
    store.tasks.push(task);
    writeStore(this.filePath, store);
    this.writeActiveTaskId(task.id);
    return task;
  }

  getActiveTaskId(): string | null {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.activeFilePath, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object") return null;
      const activeTaskId = (parsed as ActiveTaskFile).activeTaskId;
      return typeof activeTaskId === "string" && activeTaskId ? activeTaskId : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  getActiveTask(): Task | null {
    const activeTaskId = this.getActiveTaskId();
    return activeTaskId ? this.getTask(activeTaskId) : null;
  }

  activateTask(id: string): Task {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    this.writeActiveTaskId(id);
    return task;
  }

  getTask(id: string): Task | null {
    return readStore(this.filePath).tasks.find((task) => task.id === id) ?? null;
  }

  updateTask(id: string, input: TaskUpdateInput): Task {
    const store = readStore(this.filePath);
    const index = store.tasks.findIndex((task) => task.id === id);
    if (index < 0) throw new Error(`Task not found: ${id}`);

    const previous = store.tasks[index];
    const next: Task = {
      ...previous,
      ...input,
      title: input.title !== undefined ? input.title.trim() : previous.title,
      updatedAt: nowIso(),
    };
    if (!next.title) throw new Error("Task title is required");
    store.tasks[index] = next;
    writeStore(this.filePath, store);
    return next;
  }

  recordRouteDecision(id: string, decision: RouteDecision, nextAction?: string): Task {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    const resolvedNextAction = nextAction?.trim() || `Continue in ${decision.surface}.`;
    const stored: StoredRouteDecision = {
      target: decision.surface,
      action: decision.action,
      reason: decision.reason,
      nextAction: resolvedNextAction,
      createdAt: nowIso(),
    };
    return this.updateTask(id, {
      surface: decision.surface,
      metadata: {
        ...task.metadata,
        lastRouteDecision: stored,
        nextAction: resolvedNextAction,
      },
    });
  }

  recordCodexTurn(id: string, input: { currentQuestion: string; currentSurface: Surface; capabilities: RouteInput }): Task {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    return this.updateTask(id, {
      surface: input.currentSurface,
      metadata: {
        ...task.metadata,
        currentQuestion: input.currentQuestion,
        currentSurface: input.currentSurface,
        capabilities: input.capabilities,
      },
    });
  }

  recordHandoff(id: string, handoff: Handoff): Task {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    return this.updateTask(id, {
      metadata: {
        ...task.metadata,
        latestHandoff: handoff,
        nextAction: handoff.nextAction,
      },
    });
  }

  recordExecutionGateStart(id: string, intendedAction: string): Task {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    const timestamp = nowIso();
    const execution: StoredExecutionGate = {
      intendedAction,
      actualChanges: null,
      verification: null,
      driftDetected: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return this.updateTask(id, {
      metadata: {
        ...task.metadata,
        execution,
      },
    });
  }

  recordExecutionGateResult(
    id: string,
    result: { actualChanges: string; verification: string; driftDetected: boolean }
  ): Task {
    const task = this.getTask(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    const previous = task.metadata?.execution as Partial<StoredExecutionGate> | undefined;
    const execution: StoredExecutionGate = {
      intendedAction: typeof previous?.intendedAction === "string" ? previous.intendedAction : "",
      actualChanges: result.actualChanges,
      verification: result.verification,
      driftDetected: result.driftDetected,
      createdAt: typeof previous?.createdAt === "string" ? previous.createdAt : nowIso(),
      updatedAt: nowIso(),
    };
    return this.updateTask(id, {
      status: result.driftDetected ? "blocked" : task.status,
      metadata: {
        ...task.metadata,
        execution,
        nextAction: result.driftDetected ? "重新规划" : task.metadata?.nextAction,
        replanRequired: result.driftDetected || undefined,
      },
    });
  }

  listTasks(): Task[] {
    return [...readStore(this.filePath).tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private writeActiveTaskId(activeTaskId: string | null): void {
    fs.mkdirSync(path.dirname(this.activeFilePath), { recursive: true });
    const tmp = `${this.activeFilePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ activeTaskId }, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(tmp, this.activeFilePath);
  }
}

export function getWingwomanTasksDir(): string {
  return ensureDir(path.join(getStateDir(), "wingwoman", "tasks"));
}

export function getWingwomanWorkspaceDir(workspaceId: string): string {
  return ensureDir(path.join(getStateDir(), "wingwoman", "workspaces", workspaceId));
}

export function getWingwomanProjectDir(workspaceId: string, projectId: string): string {
  return ensureDir(path.join(getWingwomanWorkspaceDir(workspaceId), "projects", projectId));
}

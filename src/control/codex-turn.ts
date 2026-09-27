import { evaluateExecutionDrift } from "../execution/drift.js";
import { createHandoff } from "./handoff.js";
import { routeTask } from "./router.js";
import { TaskStore } from "./task-store.js";
import type { Handoff, Role, RouteDecision, RouteInput, Task } from "./types.js";

export interface CodexTurnInput {
  currentQuestion: string;
  canAnswerWithoutWorkspace?: boolean;
  needsWorkspaceRead?: boolean;
  needsRuntimeEvidence?: boolean;
  needsResearch?: boolean;
  needsGeneralExecution?: boolean;
  needsRepoWrite?: boolean;
  needsTerminal?: boolean;
  needsTests?: boolean;
  needsGit?: boolean;
  role?: Role;
  nextAction?: string;
}

export interface CodexTurnResult {
  task: Task;
  routeDecision: RouteDecision;
  latestHandoff: Handoff | null;
  shouldExecuteInCodex: boolean;
}

export interface ExecutionGateStart {
  task: Task;
  intendedAction: string;
}

export interface ExecutionGateResult {
  task: Task;
  driftDetected: boolean;
  shouldContinue: boolean;
}

function existingStringList(task: Task, key: string): string[] {
  const value = task.metadata?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function ensureActiveTask(store: TaskStore, currentQuestion: string, role?: Role): Task {
  const active = store.getActiveTask();
  if (active) return active;
  return store.createTask({
    goal: currentQuestion,
    title: currentQuestion,
    surface: "codex",
    role,
  });
}

function nextActionFor(decision: RouteDecision, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  if (decision.surface === "codex") return "Continue in Codex.";
  return `Continue in ${decision.surface}.`;
}

export function handleCodexTurn(input: CodexTurnInput, store = TaskStore.default()): CodexTurnResult {
  const task = ensureActiveTask(store, input.currentQuestion, input.role);
  const capabilities: RouteInput = {
    currentSurface: "codex",
    role: task.role ?? input.role ?? "unknown",
    canAnswerWithoutWorkspace: input.canAnswerWithoutWorkspace,
    needsWorkspaceRead: input.needsWorkspaceRead,
    needsRuntimeEvidence: input.needsRuntimeEvidence,
    needsResearch: input.needsResearch,
    needsGeneralExecution: input.needsGeneralExecution,
    needsRepoWrite: input.needsRepoWrite,
    needsTerminal: input.needsTerminal,
    needsTests: input.needsTests,
    needsGit: input.needsGit,
  };
  const taskWithTurn = store.recordCodexTurn(task.id, {
    currentQuestion: input.currentQuestion,
    currentSurface: "codex",
    capabilities,
  });
  const routeDecision = routeTask(capabilities);
  const nextAction = nextActionFor(routeDecision, input.nextAction);
  const routedTask = store.recordRouteDecision(taskWithTurn.id, routeDecision, nextAction);

  if (routeDecision.surface === "codex" && routeDecision.action === "stay") {
    return { task: routedTask, routeDecision, latestHandoff: null, shouldExecuteInCodex: true };
  }

  const handoff = createHandoff(routedTask, routeDecision, {
    currentQuestion: input.currentQuestion,
    decisions: existingStringList(routedTask, "decisions"),
    constraints: existingStringList(routedTask, "constraints"),
    nextAction,
  });
  const taskWithHandoff = store.recordHandoff(routedTask.id, handoff);
  return { task: taskWithHandoff, routeDecision, latestHandoff: handoff, shouldExecuteInCodex: false };
}

export function beginExecutionGate(intendedAction: string, store = TaskStore.default()): ExecutionGateStart {
  const task = store.getActiveTask();
  if (!task) throw new Error("No active Wingwoman task");
  return { task: store.recordExecutionGateStart(task.id, intendedAction), intendedAction };
}

export function completeExecutionGate(
  input: { actualChanges: string; verification: string },
  store = TaskStore.default()
): ExecutionGateResult {
  const task = store.getActiveTask();
  if (!task) throw new Error("No active Wingwoman task");
  const intendedAction =
    task.metadata?.execution && typeof task.metadata.execution === "object"
      ? String((task.metadata.execution as { intendedAction?: unknown }).intendedAction ?? "")
      : "";
  const drift = evaluateExecutionDrift({
    intendedAction,
    actualChanges: input.actualChanges,
    verification: input.verification,
  });
  const updated = store.recordExecutionGateResult(task.id, {
    actualChanges: drift.actualChanges,
    verification: drift.verification,
    driftDetected: drift.driftDetected,
  });
  return { task: updated, driftDetected: drift.driftDetected, shouldContinue: !drift.driftDetected };
}

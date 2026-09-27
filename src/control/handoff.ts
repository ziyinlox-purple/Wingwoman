import type { Handoff, HandoffContext, RouteDecision, Task } from "./types.js";

const MAX_FIELD_CHARS = 260;
const MAX_ITEMS = 5;

function compact(value: string | undefined, fallback: string): string {
  const raw = (value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return fallback;
  return raw.length > MAX_FIELD_CHARS ? `${raw.slice(0, MAX_FIELD_CHARS - 1)}…` : raw;
}

function compactList(values: string[] | undefined, fallback: string): string[] {
  const items = (values ?? [])
    .map((value) => compact(value, ""))
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
  return items.length > 0 ? items : [fallback];
}

function line(label: string, values: string[]): string {
  return `${label}${values.join("; ")}`;
}

export function createHandoff(task: Task, routeDecision: RouteDecision, context: HandoffContext = {}): Handoff {
  const currentQuestion = compact(context.currentQuestion, "继续判断并推进下一步。");
  const decisions = compactList(context.decisions, routeDecision.reason);
  const constraints = compactList(context.constraints, "不要粘贴源码、diff、日志或完整聊天记录。");
  const nextAction = compact(context.nextAction, `在 ${routeDecision.surface} 中继续处理。`);

  const handoff: Handoff = {
    taskId: task.id,
    workspaceId: task.workspaceId,
    workspaceName: typeof task.metadata?.workspaceName === "string" ? task.metadata.workspaceName : task.workspaceId,
    projectId: task.projectId,
    projectName: task.projectName ?? task.projectId,
    role: task.role,
    from: task.surface,
    target: routeDecision.surface,
    goal: compact(task.goal, task.title),
    currentQuestion,
    decisions,
    constraints,
    nextAction,
    text: "",
  };

  handoff.text = [
    `继续任务 ${handoff.taskId}`,
    "",
    `Workspace: ${handoff.workspaceName ?? handoff.workspaceId ?? "Unknown"}`,
    `Project: ${handoff.projectName ?? handoff.projectId ?? "default"}`,
    `Role: ${handoff.role ?? "unknown"}`,
    `From: ${handoff.from}`,
    `Target: ${handoff.target}`,
    "",
    `目标：${handoff.goal}`,
    `当前问题：${handoff.currentQuestion}`,
    line("已确定：", handoff.decisions),
    line("限制：", handoff.constraints),
    `下一步：${handoff.nextAction}`,
  ].join("\n");

  return handoff;
}

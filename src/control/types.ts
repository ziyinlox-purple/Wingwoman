export type Surface = "chat" | "work" | "codex";
export type Role = "chief-of-staff" | "research" | "strategy" | "operator" | "reviewer" | "user" | "unknown";

export type TaskStatus = "open" | "in_progress" | "blocked" | "done" | "cancelled";

export interface Task {
  id: string;
  taskId?: string;
  workspaceId?: string;
  projectId?: string;
  projectName?: string;
  role?: Role;
  goal: string;
  title: string;
  description?: string;
  status: TaskStatus;
  surface: Surface;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type TaskCreateInput = {
  goal: string;
  title?: string;
  description?: string;
  surface?: Surface;
  status?: TaskStatus;
  role?: Role;
  metadata?: Record<string, unknown>;
};

export type TaskUpdateInput = Partial<Pick<Task, "title" | "description" | "status" | "surface" | "metadata">>;

export interface RouteInput {
  currentSurface: Surface;
  role?: Role;
  chatCanComplete?: boolean;
  canAnswerWithoutWorkspace?: boolean;
  needsWorkspaceRead?: boolean;
  needsRuntimeEvidence?: boolean;
  needsResearch?: boolean;
  needsGeneralExecution?: boolean;
  needsRepoWrite?: boolean;
  needsTerminal?: boolean;
  needsTests?: boolean;
  needsGit?: boolean;
  possibleSurfaces?: Surface[];
}

export type ResourceClass = "cognition" | "workspace" | "research" | "execution";

export interface ResourcePolicyInput extends RouteInput {
  workspaceId?: string;
  projectId?: string;
  role?: Role;
}

export interface ResourcePolicyDecision {
  target: Surface;
  action: "stay" | "demote" | "escalate" | "handoff";
  reason: string;
  resourceClass: ResourceClass;
  groundingRequired: boolean;
}

export type RouteRequest = RouteInput;

export interface RouteDecision {
  surface: Surface;
  action: "stay" | "demote" | "escalate" | "handoff";
  reason: string;
  downgradedToChat: boolean;
}

export interface StoredRouteDecision {
  target: Surface;
  action: RouteDecision["action"];
  reason: string;
  nextAction: string;
  createdAt: string;
}

export interface StoredExecutionGate {
  intendedAction: string;
  actualChanges: string | null;
  verification: string | null;
  driftDetected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Handoff {
  taskId: string;
  workspaceId?: string;
  workspaceName?: string;
  projectId?: string;
  projectName?: string;
  role?: Role;
  from: Surface;
  target: Surface;
  goal: string;
  currentQuestion: string;
  decisions: string[];
  constraints: string[];
  nextAction: string;
  text: string;
}

export interface HandoffContext {
  currentQuestion?: string;
  decisions?: string[];
  constraints?: string[];
  nextAction?: string;
}

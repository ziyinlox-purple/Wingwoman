import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Workspace } from "../workspace/manager.js";
import type { Role } from "./types.js";
import { getWingwomanProjectDir, getWingwomanWorkspaceDir } from "./task-store.js";

export type ProjectScope =
  | { status: "selected"; projectId: string; projectName: string; workspaceId: string; workspaceName: string }
  | { status: "unresolved"; workspaceId: string; workspaceName: string };

interface WorkspaceContextFile {
  currentProjectId?: string | null;
  projects?: Record<string, { projectId: string; projectName: string; workspaceId: string; updatedAt: string }>;
}

interface ProjectContextFile {
  projectId: string;
  projectName: string;
  workspaceId: string;
  role?: Role;
  updatedAt: string;
}

const ROLES: Role[] = ["chief-of-staff", "research", "strategy", "operator", "reviewer", "user", "unknown"];

function nowIso(): string {
  return new Date().toISOString();
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(tmp, filePath);
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

function workspaceContextPath(workspaceId: string): string {
  return path.join(getWingwomanWorkspaceDir(workspaceId), "context.json");
}

function projectContextPath(workspaceId: string, projectId: string): string {
  return path.join(getWingwomanProjectDir(workspaceId, projectId), "context.json");
}

export function parseRole(value: string): Role {
  const normalized = value.trim().toLowerCase() as Role;
  if (!ROLES.includes(normalized)) throw new Error(`Invalid role: ${value}`);
  return normalized;
}

export function setProjectContext(
  workspace: Workspace,
  input: { projectId: string; projectName?: string }
): Extract<ProjectScope, { status: "selected" }> {
  const projectId = input.projectId.trim();
  if (!projectId) throw new Error("Project id is required");
  const projectName = input.projectName?.trim() || projectId;
  const context = readJson<WorkspaceContextFile>(workspaceContextPath(workspace.id), {});
  const projects = context.projects ?? {};
  projects[projectId] = { projectId, projectName, workspaceId: workspace.id, updatedAt: nowIso() };
  writeJson(workspaceContextPath(workspace.id), { ...context, currentProjectId: projectId, projects });
  writeJson(projectContextPath(workspace.id, projectId), {
    projectId,
    projectName,
    workspaceId: workspace.id,
    role: readRole(workspace.id, projectId) ?? "unknown",
    updatedAt: nowIso(),
  } satisfies ProjectContextFile);
  return { status: "selected", projectId, projectName, workspaceId: workspace.id, workspaceName: workspace.name };
}

export function clearProjectContext(workspace: Workspace): ProjectScope {
  const context = readJson<WorkspaceContextFile>(workspaceContextPath(workspace.id), {});
  writeJson(workspaceContextPath(workspace.id), { ...context, currentProjectId: null });
  return { status: "unresolved", workspaceId: workspace.id, workspaceName: workspace.name };
}

export function resolveProjectScope(workspace: Workspace): ProjectScope {
  const context = readJson<WorkspaceContextFile>(workspaceContextPath(workspace.id), {});
  const projectId = context.currentProjectId;
  if (!projectId) return { status: "unresolved", workspaceId: workspace.id, workspaceName: workspace.name };
  const saved = context.projects?.[projectId];
  return {
    status: "selected",
    projectId,
    projectName: saved?.projectName ?? projectId,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
  };
}

export function readRole(workspaceId: string, projectId: string): Role | null {
  const context = readJson<Partial<ProjectContextFile>>(projectContextPath(workspaceId, projectId), {});
  return context.role ? parseRole(context.role) : null;
}

export function setRoleContext(workspace: Workspace, projectId: string, role: Role): Role {
  const projectScope = resolveProjectScope(workspace);
  const projectName = projectScope.status === "selected" && projectScope.projectId === projectId ? projectScope.projectName : projectId;
  writeJson(projectContextPath(workspace.id, projectId), {
    projectId,
    projectName,
    workspaceId: workspace.id,
    role,
    updatedAt: nowIso(),
  } satisfies ProjectContextFile);
  return role;
}

export function clearRoleContext(workspace: Workspace, projectId: string): Role {
  setRoleContext(workspace, projectId, "unknown");
  return "unknown";
}

export function currentRole(workspace: Workspace, projectId: string): Role {
  return readRole(workspace.id, projectId) ?? "unknown";
}

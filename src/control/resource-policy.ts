import type { ResourceClass, ResourcePolicyDecision, ResourcePolicyInput, Surface } from "./types.js";

const CODEX_CAPABILITIES = ["workspace", "runtime", "repo", "terminal", "tests", "git"] as const;

function needsCodex(input: ResourcePolicyInput): boolean {
  return Boolean(
    input.needsWorkspaceRead ||
      input.needsRuntimeEvidence ||
      input.needsRepoWrite ||
      input.needsTerminal ||
      input.needsTests ||
      input.needsGit
  );
}

function needsWork(input: ResourcePolicyInput): boolean {
  return Boolean((input.needsResearch || input.needsGeneralExecution) && !needsCodex(input));
}

function canUseChat(input: ResourcePolicyInput): boolean {
  return Boolean(input.canAnswerWithoutWorkspace && !needsCodex(input) && !needsWork(input));
}

function actionFor(currentSurface: Surface, target: Surface): ResourcePolicyDecision["action"] {
  if (currentSurface === target) return "stay";
  if (target === "chat") return "demote";
  if (currentSurface === "chat") return "escalate";
  return "handoff";
}

function decide(
  input: ResourcePolicyInput,
  target: Surface,
  resourceClass: ResourceClass,
  groundingRequired: boolean,
  reason: string
): ResourcePolicyDecision {
  return {
    target,
    action: actionFor(input.currentSurface, target),
    reason,
    resourceClass,
    groundingRequired,
  };
}

export function decideResourcePolicy(input: ResourcePolicyInput): ResourcePolicyDecision {
  if (needsCodex(input)) {
    const needed = CODEX_CAPABILITIES.filter((capability) => {
      switch (capability) {
        case "workspace":
          return input.needsWorkspaceRead;
        case "runtime":
          return input.needsRuntimeEvidence;
        case "repo":
          return input.needsRepoWrite;
        case "terminal":
          return input.needsTerminal;
        case "tests":
          return input.needsTests;
        case "git":
          return input.needsGit;
      }
    });
    return decide(
      input,
      "codex",
      "workspace",
      true,
      `This turn needs Codex capability: ${needed.join(", ")}. Role is context only and does not override capability.`
    );
  }

  if (canUseChat(input)) {
    return decide(
      input,
      "chat",
      "cognition",
      false,
      "This turn can be answered without workspace context or execution, so the policy chooses Chat."
    );
  }

  if (needsWork(input)) {
    return decide(
      input,
      "work",
      "research",
      true,
      "This turn needs external research or general execution that does not depend on the current workspace."
    );
  }

  return decide(
    input,
    input.currentSurface,
    "cognition",
    false,
    "No stronger capability was declared; staying on the current surface."
  );
}

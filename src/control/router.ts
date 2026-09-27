import { decideResourcePolicy } from "./resource-policy.js";
import type { RouteDecision, RouteInput } from "./types.js";

export function routeTask(request: RouteInput): RouteDecision {
  const decision = decideResourcePolicy(request);
  return {
    surface: decision.target,
    action: decision.action,
    reason: decision.reason,
    downgradedToChat: request.currentSurface !== "chat" && decision.target === "chat",
  };
}

import path from "node:path";
import { describe, expect, it } from "vitest";
import { beginExecutionGate, completeExecutionGate, handleCodexTurn } from "../src/control/codex-turn.js";
import { TaskStore } from "../src/control/task-store.js";
import { createMissionControlState } from "../src/mission-control/view.js";
import { makeTmpDir } from "./helpers.js";

function store(name: string): TaskStore {
  const dir = makeTmpDir(name);
  return new TaskStore(path.join(dir, "tasks.json"));
}

describe("Wingwoman Codex turn state", () => {
  it("A. auto-creates an active task and stays in Codex for repo-grounded backend analysis", () => {
    const taskStore = store("codex-turn-a");

    const result = handleCodexTurn(
      {
        currentQuestion: "分析当前后端为什么会出现这个并发问题",
        needsWorkspaceRead: true,
      },
      taskStore
    );
    const state = createMissionControlState(taskStore.getActiveTask());

    expect(result.shouldExecuteInCodex).toBe(true);
    expect(result.routeDecision).toMatchObject({ surface: "codex", action: "stay" });
    expect(state.activeTask?.id).toBe(result.task.id);
    expect(state.currentQuestion).toBe("分析当前后端为什么会出现这个并发问题");
    expect(state.routeDecision).toMatchObject({ target: "codex", action: "stay" });
  });

  it("B. demotes workspace-free brainstorming to Chat and stores latestHandoff", () => {
    const taskStore = store("codex-turn-b");

    const result = handleCodexTurn(
      {
        currentQuestion: "帮我 brainstorm 一个产品名字",
        canAnswerWithoutWorkspace: true,
      },
      taskStore
    );
    const state = createMissionControlState(taskStore.getActiveTask());

    expect(result.shouldExecuteInCodex).toBe(false);
    expect(result.routeDecision).toMatchObject({ surface: "chat", action: "demote" });
    expect(state.latestHandoff?.target).toBe("chat");
    expect(state.latestHandoff?.text).toContain("帮我 brainstorm 一个产品名字");
  });

  it("C. blocks the task and exposes drift in Mission Control when actual changes diverge", () => {
    const taskStore = store("codex-turn-c");
    handleCodexTurn({ currentQuestion: "修改 auth router", needsRepoWrite: true }, taskStore);

    beginExecutionGate("Update auth router expired pairing validation", taskStore);
    const gate = completeExecutionGate(
      {
        actualChanges: "Changed billing dashboard copy and invoice table styles",
        verification: "Typecheck passed",
      },
      taskStore
    );
    const state = createMissionControlState(taskStore.getActiveTask());

    expect(gate.driftDetected).toBe(true);
    expect(gate.shouldContinue).toBe(false);
    expect(state.activeTask?.status).toBe("blocked");
    expect(state.nextAction).toBe("重新规划");
    expect(state.execution?.driftDetected).toBe(true);
  });
});

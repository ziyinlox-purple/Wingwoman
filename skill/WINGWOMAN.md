---
name: wingwoman
description: 根据当前请求的真实 capability needs，在 Chat / Work / Codex 之间做资源策略路由。
---

# Wingwoman

Wingwoman decides where the current turn belongs:

- `chat`: discussion, thinking, explanation, writing, planning, review of ideas.
- `work`: research, broad synthesis, or general execution that does not need the repo.
- `codex`: repository edits, terminal commands, tests, git operations, or local files.

## Runtime

Use the globally installed Wingwoman runtime from the user's current workspace:

- Preferred: `wingwoman ...`
- Also valid: `c2c ...`

Do not assume the current workspace is the Wingwoman source checkout. For
workspace-scoped state, run commands from the user's current repo, or pass
`-w <workspace root>` explicitly. Do not `cd` into the Wingwoman source checkout
just to manage tasks.

## Internal Protocol

At the start of every new user request, classify the current turn by capability,
not by keywords. Do not route merely because the request mentions "code",
"website", "design", "copy", "homepage", or a tool name. Ask: what capability
is truly required to satisfy this turn?

Produce these booleans internally:

- `canAnswerWithoutWorkspace`
- `needsWorkspaceRead`
- `needsRuntimeEvidence`
- `needsResearch`
- `needsGeneralExecution`
- `needsRepoWrite`
- `needsTerminal`
- `needsTests`
- `needsGit`

Then apply the Wingwoman Router:

1. If `canAnswerWithoutWorkspace=true` and no execution capability is needed,
   target `chat`.
2. If `needsWorkspaceRead=true`, target `codex`.
3. If `needsRuntimeEvidence=true`, target `codex`.
4. If external research is needed and it does not depend on the current repo,
   target `work`.
5. If repo write, terminal, tests, or git are needed, target `codex`.

In this Skill, the current surface is normally `codex`.

## Workspace-Dependent Discussion Rule

Do not demote merely because the request is discussion, planning, analysis, or
architecture review. If the discussion depends on the current repo's real files,
state, diffs, runtime output, tests, or logs, stay in Codex.

Do not inspect or edit files just to keep the task in Codex. For pure product
brainstorming or explanation that can be answered without workspace context or
execution, route to Chat. Grounding beats cheapness: demote only when the
answer remains correct without workspace or runtime evidence.

## Execution Drift Rule

Every execution must preserve:

- `intendedAction`
- `actualChanges`
- `verification`
- `driftDetected`

If `actualChanges` clearly do not match `intendedAction`, stop continuing the
task, set `driftDetected=true`, and require replanning before any further
execution. Do not silently continue after execution drift.

## Behavior

If the route action is `stay`:

- Continue normally and complete the task in Codex.
- Do not mention Wingwoman unless it helps clarify a boundary.

If the route action is `demote`, `escalate`, or `handoff`:

- Do not execute the target task.
- Generate a short handoff.
- Tell the user: `这个任务更适合 Chat / Work / Codex。`
- Provide one copyable handoff block.

The handoff must be short and must not include:

- source code
- diffs
- logs
- complete chat history
- long pasted context

Handoff format:

```text
继续任务 <taskId or short label>

目标：...
当前问题：...
已确定：...
限制：...
下一步：...
```

Use a short label if no local task id exists yet.

## Boundaries

- Do not start tunnels.
- Do not run `c2c setup`.
- Do not modify ChatGPT settings.
- Do not modify `~/.codex`.
- Do not use MCP.
- Do not automatically switch UI surfaces.
- Do not invoke the old codex-with-chatgpt workflow.

Wingwoman is a routing and handoff protocol first. It should keep Codex focused
on execution and move lightweight thinking out of Codex when execution is not
needed.

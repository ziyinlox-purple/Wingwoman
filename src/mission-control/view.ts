import type { Handoff, StoredExecutionGate, Task, Surface, StoredRouteDecision } from "../control/types.js";

export interface MissionControlState {
  activeTask: Task | null;
  currentSurface: Surface | null;
  currentQuestion: string | null;
  projectName: string | null;
  role: string;
  lastRouteDecision: StoredRouteDecision | null;
  routeDecision: StoredRouteDecision | null;
  latestHandoff: Handoff | null;
  execution: StoredExecutionGate | null;
  decisions: string[];
  constraints: string[];
  nextAction: string | null;
  surfaces: Surface[];
  generatedAt: string;
}

const SURFACES: Surface[] = ["chat", "work", "codex"];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stringListMetadata(task: Task, key: string): string[] {
  const value = task.metadata?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function stringMetadata(task: Task, key: string): string | null {
  const value = task.metadata?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function routeDecisionMetadata(task: Task): StoredRouteDecision | null {
  const value = task.metadata?.lastRouteDecision;
  if (!value || typeof value !== "object") return null;
  const candidate = value as StoredRouteDecision;
  if (
    (candidate.target === "chat" || candidate.target === "work" || candidate.target === "codex") &&
    (candidate.action === "stay" ||
      candidate.action === "demote" ||
      candidate.action === "escalate" ||
      candidate.action === "handoff") &&
    typeof candidate.reason === "string" &&
    typeof candidate.nextAction === "string" &&
    typeof candidate.createdAt === "string"
  ) {
    return candidate;
  }
  return null;
}

function handoffMetadata(task: Task): Handoff | null {
  const value = task.metadata?.latestHandoff;
  if (!value || typeof value !== "object") return null;
  const candidate = value as Handoff;
  return typeof candidate.text === "string" && typeof candidate.nextAction === "string" ? candidate : null;
}

function executionMetadata(task: Task): StoredExecutionGate | null {
  const value = task.metadata?.execution;
  if (!value || typeof value !== "object") return null;
  const candidate = value as StoredExecutionGate;
  return typeof candidate.intendedAction === "string" && typeof candidate.driftDetected === "boolean" ? candidate : null;
}

function fallbackNextAction(task: Task | null): string | null {
  if (!task) return null;
  return task.surface === "codex"
    ? "Continue implementation in Codex."
    : task.surface === "work"
      ? "Continue research or broad execution in Work."
      : "Continue thinking and product decisions in Chat.";
}

export function createMissionControlState(activeTask: Task | null, now = new Date()): MissionControlState {
  const lastRouteDecision = activeTask ? routeDecisionMetadata(activeTask) : null;
  const latestHandoff = activeTask ? handoffMetadata(activeTask) : null;
  const execution = activeTask ? executionMetadata(activeTask) : null;

  return {
    activeTask,
    currentSurface: activeTask?.surface ?? null,
    currentQuestion: activeTask ? stringMetadata(activeTask, "currentQuestion") : null,
    projectName: activeTask?.projectName ?? (activeTask?.projectId && activeTask.projectId !== "default" ? activeTask.projectId : null),
    role: activeTask?.role ?? "unknown",
    lastRouteDecision,
    routeDecision: lastRouteDecision,
    latestHandoff,
    execution,
    decisions: activeTask ? stringListMetadata(activeTask, "decisions") : [],
    constraints: activeTask ? stringListMetadata(activeTask, "constraints") : [],
    nextAction: activeTask ? stringMetadata(activeTask, "nextAction") ?? lastRouteDecision?.nextAction ?? fallbackNextAction(activeTask) : null,
    surfaces: SURFACES,
    generatedAt: now.toISOString(),
  };
}

function renderSurfacePill(surface: Surface, current: Surface | null): string {
  const active = surface === current;
  const label = surface[0].toUpperCase() + surface.slice(1);
  return `
    <li class="surface ${active ? "is-active" : ""}" aria-current="${active ? "step" : "false"}">
      <span class="surface-dot"></span>
      <span>${label}</span>
    </li>`;
}

function renderDecisions(state: MissionControlState): string {
  if (!state.activeTask) return `<li>Create or route a Wingwoman task to populate this panel.</li>`;
  const decisions = state.decisions;
  const items =
    decisions.length > 0
      ? decisions
      : [
          "Mission Control stays thin: it shows state, it does not become chat.",
          `The current surface is ${state.currentSurface}.`,
          "The next action should be obvious before any connector work begins.",
        ];
  if (state.lastRouteDecision) {
    items.push(`${state.lastRouteDecision.action} → ${state.lastRouteDecision.target}: ${state.lastRouteDecision.reason}`);
  }
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

export function renderMissionControlHtml(state: MissionControlState): string {
  const task = state.activeTask;
  const currentSurface = state.currentSurface;
  const title = task?.title ?? "No active task";
  const goal = task?.goal ?? "Wingwoman is ready to route the next mission.";
  const question = task ? stringMetadata(task, "currentQuestion") : null;
  const projectLabel = state.projectName ?? "Not selected";
  const roleLabel = state.role;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Wingwoman Mission Control</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #18191f;
      --muted: #68707f;
      --line: #d9dee8;
      --paper: #f7f5ef;
      --panel: #ffffff;
      --chat: #2f7d62;
      --work: #4c67b0;
      --codex: #b84d34;
      --active: ${currentSurface === "chat" ? "var(--chat)" : currentSurface === "work" ? "var(--work)" : "var(--codex)"};
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      background: var(--paper);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    main {
      width: min(1120px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 32px 0;
    }

    .shell {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
      gap: 18px;
      align-items: stretch;
    }

    .mission, .side {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 8px;
    }

    .mission {
      min-height: 520px;
      padding: 30px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .eyebrow {
      margin: 0 0 18px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      max-width: 740px;
      font-size: clamp(40px, 6vw, 76px);
      line-height: .94;
      letter-spacing: 0;
    }

    .goal {
      margin: 22px 0 0;
      max-width: 640px;
      color: #424955;
      font-size: 19px;
      line-height: 1.55;
    }

    .question {
      margin-top: 24px;
      padding-left: 16px;
      border-left: 4px solid var(--active);
      color: #2e3440;
      font-size: 16px;
      line-height: 1.5;
    }

    .surfaces {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin: 36px 0 0;
      padding: 0;
      list-style: none;
    }

    .surface {
      min-height: 58px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      color: #555f70;
      font-weight: 700;
    }

    .surface-dot {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: currentColor;
    }

    .surface.is-active {
      border-color: var(--active);
      background: color-mix(in srgb, var(--active) 12%, white);
      color: var(--active);
      box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--active) 42%, transparent);
    }

    .route-note {
      margin: 12px 0 0;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
    }

    .side {
      padding: 22px;
      display: grid;
      gap: 16px;
    }

    .panel {
      border-top: 1px solid var(--line);
      padding-top: 18px;
    }

    .panel:first-child {
      border-top: 0;
      padding-top: 0;
    }

    h2 {
      margin: 0 0 12px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: .08em;
      color: var(--muted);
    }

    .status {
      display: inline-flex;
      align-items: center;
      min-height: 34px;
      padding: 0 12px;
      border-radius: 999px;
      background: #eef1f5;
      color: #384151;
      font-weight: 700;
      font-size: 13px;
    }

    .decision-list {
      margin: 0;
      padding-left: 18px;
      color: #323946;
      line-height: 1.55;
    }

    .decision-list li + li { margin-top: 10px; }

    .next {
      margin: 0;
      font-size: 24px;
      line-height: 1.2;
      font-weight: 800;
    }

    .meta {
      margin: 18px 0 0;
      color: var(--muted);
      font-size: 12px;
    }

    @media (max-width: 860px) {
      main { width: min(100vw - 22px, 680px); padding: 18px 0; }
      .shell { grid-template-columns: 1fr; }
      .mission { min-height: auto; padding: 22px; }
      .surfaces { grid-template-columns: 1fr; }
      h1 { font-size: 42px; line-height: 1; }
    }
  </style>
</head>
<body>
  <main>
    <section class="shell" aria-label="Wingwoman Mission Control">
      <div class="mission">
        <div>
          <p class="eyebrow">Wingwoman Mission Control</p>
          <h1 data-field="title">${escapeHtml(title)}</h1>
          <p class="goal" data-field="goal">${escapeHtml(goal)}</p>
          <p class="goal" data-field="scope">Project ${escapeHtml(projectLabel)} · Role ${escapeHtml(roleLabel)}</p>
          <p class="question" data-field="question" ${question ? "" : "hidden"}>${escapeHtml(question ?? "")}</p>
        </div>
        <ul class="surfaces" aria-label="Available surfaces">
          ${state.surfaces.map((surface) => renderSurfacePill(surface, currentSurface)).join("")}
        </ul>
      </div>

      <aside class="side" aria-label="Current task controls">
        <section class="panel">
          <h2>Current Surface</h2>
          <span class="status" data-field="currentSurface">${escapeHtml(currentSurface ?? "none")}</span>
        </section>
        <section class="panel">
          <h2>Decisions</h2>
          <ul class="decision-list" data-field="decisions">${renderDecisions(state)}</ul>
        </section>
        <section class="panel">
          <h2>Next Action</h2>
          <p class="next" data-field="nextAction">${escapeHtml(state.nextAction ?? "Create the first Wingwoman task.")}</p>
          <p class="route-note" data-field="routeNote">${
            escapeHtml(
              [
                state.lastRouteDecision
                  ? `Last route: ${state.lastRouteDecision.action} to ${state.lastRouteDecision.target}. ${state.lastRouteDecision.reason}`
                  : "",
                state.execution?.driftDetected ? "Execution drift detected. Replan before continuing." : "",
              ]
                .filter(Boolean)
                .join(" ")
            )
          }</p>
          <p class="meta">Generated <span data-field="generatedAt">${escapeHtml(state.generatedAt)}</span></p>
        </section>
      </aside>
    </section>
  </main>
  <script>
    const surfaces = ${JSON.stringify(SURFACES)};
    const labels = { chat: "Chat", work: "Work", codex: "Codex" };
    const escapeText = (value) => String(value ?? "");
    const setText = (selector, value) => {
      const node = document.querySelector(selector);
      if (node) node.textContent = escapeText(value);
    };
    const renderDecisionItems = (state) => {
      const list = document.querySelector('[data-field="decisions"]');
      if (!list) return;
      const items = state.activeTask
        ? [...(state.decisions?.length ? state.decisions : [
            "Mission Control stays thin: it shows state, it does not become chat.",
            "The current surface is " + state.currentSurface + ".",
            "The next action should be obvious before any connector work begins.",
          ])]
        : ["Create or route a Wingwoman task to populate this panel."];
      if (state.lastRouteDecision) {
        items.push(state.lastRouteDecision.action + " → " + state.lastRouteDecision.target + ": " + state.lastRouteDecision.reason);
      }
      list.replaceChildren(...items.map((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        return li;
      }));
    };
    const renderSurfaces = (currentSurface) => {
      document.querySelectorAll(".surface").forEach((node, index) => {
        const surface = surfaces[index];
        const active = surface === currentSurface;
        node.classList.toggle("is-active", active);
        node.setAttribute("aria-current", active ? "step" : "false");
      });
    };
    const renderState = (state) => {
      const task = state.activeTask;
      setText('[data-field="title"]', task?.title ?? "No active task");
      setText('[data-field="goal"]', task?.goal ?? "Wingwoman is ready to route the next mission.");
      setText('[data-field="currentSurface"]', state.currentSurface ?? "none");
      setText('[data-field="nextAction"]', state.nextAction ?? "Create the first Wingwoman task.");
      setText('[data-field="generatedAt"]', state.generatedAt);
      const question = document.querySelector('[data-field="question"]');
      const currentQuestion = state.currentQuestion;
      if (question) {
        question.textContent = typeof currentQuestion === "string" ? currentQuestion : "";
        question.hidden = !question.textContent;
      }
      const routeNote = (state.lastRouteDecision
        ? "Last route: " + state.lastRouteDecision.action + " to " + state.lastRouteDecision.target + ". " + state.lastRouteDecision.reason
        : "") + (state.execution?.driftDetected ? " Execution drift detected. Replan before continuing." : "");
      setText('[data-field="routeNote"]', routeNote);
      renderDecisionItems(state);
      renderSurfaces(state.currentSurface);
      const activeColor = state.currentSurface === "chat"
        ? "var(--chat)"
        : state.currentSurface === "work"
          ? "var(--work)"
          : "var(--codex)";
      document.documentElement.style.setProperty("--active", activeColor);
    };
    const refreshState = async () => {
      try {
        const response = await fetch("/mission-control/state.json", { cache: "no-store" });
        if (!response.ok) return;
        renderState(await response.json());
      } catch {
      }
    };
    setInterval(refreshState, 2000);
  </script>
</body>
</html>`;
}

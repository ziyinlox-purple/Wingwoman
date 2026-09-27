# Wingwoman

A resource policy layer for AI agents across Chat, Work, and Codex.

Wingwoman does not decide **which agent works**. Your user, chief of staff, planner, reviewer, researcher, or operator role can decide who owns the next step.

Wingwoman decides **what resources this step should use**:

- **Chat**: low-cost cognition for answers that remain correct without workspace or runtime evidence.
- **Work**: external research and general agent execution outside the local coding harness.
- **Codex**: workspace-grounded reasoning, local runtime evidence, code execution, diffs, tests, and repository state.

Roles are not surfaces. A `strategy` task can belong in Chat when it is brainstorming, Work when it needs external market research, or Codex when it must inspect the current repo. Routing is based on capability needs, not job title.

```text
User / Chief of Staff
        ↓
Agents / Roles
        ↓
Wingwoman Resource Policy
        ↓
Chat / Work / Codex
```

中文文档见 [README.zh-CN.md](README.zh-CN.md).

## Routing Examples

| Current step | Capability need | Wingwoman route |
| --- | --- | --- |
| Strategy explores open product brainstorming and does not need workspace context | Low-cost cognition | Chat |
| Research investigates an external market | Web/research execution | Work |
| Reviewer checks a real repo diff, test output, or runtime behavior | Workspace/runtime evidence | Codex |

## Grounding Principle

Demote to Chat only when both are true:

- `canAnswerWithoutWorkspace = true`
- No execution evidence is required

Escalate to Codex when either is true:

- `needsWorkspaceRead = true`
- `needsRuntimeEvidence = true`

Grounding beats cheapness. Wingwoman should demote aggressively only when the answer remains correct without workspace or runtime evidence.

## Execution Drift

Wingwoman treats execution as something to verify, not something to trust by narration.

```text
intendedAction
      ↓
execute
      ↓
actualChanges
      ↓
verification
      ↓
driftDetected
```

When `driftDetected = true`, stop and replan before continuing. The point is to catch cases where the work that actually happened no longer matches the plan, even if each individual command looked successful.

## Scope Model

Wingwoman keeps project work scoped like this:

```text
workspace
   ↓
project
   ↓
tasks
   ↓
task.role
```

`role` is task-scoped. It is not global project state, and it does not permanently bind a task to Chat, Work, or Codex.

## CLI

Wingwoman keeps the existing `c2c` command as a compatibility alias while adding the clearer `wingwoman` entry point.

```bash
wingwoman --help
wingwoman project --help
wingwoman task --help

# Compatibility alias:
c2c --help
```

Useful developer commands:

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

## Legacy / Inherited Bridge Capabilities

Wingwoman is derived from an earlier local bridge project that connected ChatGPT to a Codex workspace through a read-only MCP server. Those capabilities are still present and intentionally not deleted:

- loopback bridge process and local runtime management
- OAuth-protected, read-only MCP tools
- ChatGPT connector setup and pairing flow
- workspace path containment and sensitive-file denial
- git diff/status, file read/search, execution summaries, and test records
- Cloudflare quick/named tunnel support for the connector

These inherited pieces are now infrastructure under the Wingwoman resource policy model, not the primary product story.

## Architecture Notes

The existing bridge remains read-only by construction: write/delete/shell/commit MCP tools are not exposed. Workspace access is scoped by canonical paths, sensitive defaults such as `.env*`, keys, SSH material, and credentials are denied, and `.c2cignore` can add project-specific exclusions.

The local CLI still uses some compatibility names (`c2c`, `.c2cignore`, `.c2c.json`, `c2c_*` token prefixes, and the historical state directory) so existing installs do not break.

Detailed docs:

- [Architecture](docs/architecture.md)
- [Protocol](docs/protocol.md)
- [Security](docs/security.md)
- [Troubleshooting](docs/troubleshooting.md)

## Project Layout

```text
src/
  control/    resource policy, routing, task/project/role scope
  bridge/     loopback HTTP server, port recovery, admin API
  mcp/        read-only tools, stateless Streamable HTTP
  auth/       OAuth 2.1, PKCE, client registration, refresh rotation
  pairing/    one-time pairing codes
  workspace/  path containment, sensitive-file policy, search, git
  tunnel/     Cloudflare quick/named tunnel support
  execution/  execution records and drift checks
  process/    daemon lifecycle
  cli/        wingwoman / c2c CLI
skill/        Codex Skill instructions
tests/        unit and integration tests
docs/         architecture, protocol, security, troubleshooting
```

## Attribution

Wingwoman is derived from and builds on [XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt), licensed under the MIT License.

The original MIT [LICENSE](LICENSE) is retained, including the original copyright.

## Status & Disclaimer

Wingwoman is an unofficial community project. It is not affiliated with or endorsed by OpenAI.

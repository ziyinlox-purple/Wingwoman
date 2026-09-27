# Wingwoman

[English](README.md) | **简体中文**

Wingwoman 是一个面向 Chat、Work、Codex 的 AI agent 资源策略层。

它不决定“哪个 agent 干活”。谁来干，可以由用户、Chief of Staff、规划者、研究员、Reviewer 或 Operator 这样的角色来决定。

Wingwoman 决定的是：**这一轮应该用什么资源干活**。

- **Chat**：低成本认知。适合不需要工作区、不需要运行证据也能答对的问题。
- **Work**：外部研究 / 通用 agent 执行。适合市场调研、资料搜集、非本地代码执行类任务。
- **Codex**：工作区扎根 / 运行时 / 代码执行。适合需要读仓库、看 diff、跑测试、看日志、验证真实改动的任务。

`role` 不等于 `surface`。一个 `strategy` 任务可以因为开放 brainstorming 去 Chat，也可以因为外部市场研究去 Work，还可以因为要读当前 repo 架构去 Codex。路由依据是能力需求，不是职位名。

```text
User / Chief of Staff
        ↓
Agents / Roles
        ↓
Wingwoman Resource Policy
        ↓
Chat / Work / Codex
```

## 路由例子

| 当前步骤 | 需要什么能力 | Wingwoman 路由 |
| --- | --- | --- |
| Strategy 做开放产品 brainstorming，不需要当前工作区 | 低成本认知 | Chat |
| Research 做外部市场研究 | 外部研究 / 通用执行 | Work |
| Reviewer 检查真实 repo diff、测试输出或运行行为 | 工作区 / 运行时证据 | Codex |

## Grounding 原则

只有同时满足下面两点，才应该降级到 Chat：

- `canAnswerWithoutWorkspace = true`
- 不需要执行证据

只要出现下面任意一点，就应该去 Codex：

- `needsWorkspaceRead = true`
- `needsRuntimeEvidence = true`

便宜很重要，但正确性更重要。Wingwoman 可以积极降级，但前提是离开工作区和运行时证据后，答案仍然可靠。

## Execution Drift

Wingwoman 不只听“我执行完了”，而是把执行当成需要核对的事实。

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

当 `driftDetected = true`，应该停止继续推进，先重新规划。这样可以发现“命令都成功了，但实际改动已经偏离原计划”的情况。

## Scope 模型

Wingwoman 的项目上下文是这样分层的：

```text
workspace
   ↓
project
   ↓
tasks
   ↓
task.role
```

`role` 是 task 级别的，不是 project 的全局状态，也不会把某个任务永久绑定到 Chat、Work 或 Codex。

## CLI

新的公开入口是 `wingwoman`。为了不破坏现有安装，旧的 `c2c` 命令会继续作为兼容 alias 保留。

```bash
wingwoman --help
wingwoman project --help
wingwoman task --help

# 兼容旧安装：
c2c --help
```

开发常用命令：

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

## 继承的桥接能力

Wingwoman 继承自一个把 ChatGPT 通过只读 MCP 安全连接到 Codex 工作区的本地桥接项目。这些能力仍然存在，也不应该被删除：

- 本机 loopback bridge 和 runtime 管理
- OAuth 保护的只读 MCP 工具
- ChatGPT connector 配置和一次性配对码
- 工作区路径收敛和敏感文件拒绝
- git diff/status、文件读取/搜索、执行摘要、测试记录
- Cloudflare quick/named tunnel，用于 connector 公网地址

这些能力现在是 Wingwoman resource policy 的基础设施，不再是主产品定位本身。

## 架构说明

现有 bridge 仍然是只读设计：服务端不暴露写文件、删除、Shell、提交等 MCP 工具。工作区访问通过 canonical path 限定，`.env*`、密钥、SSH 材料、凭据等敏感默认项会被拒绝，`.c2cignore` 可以继续添加项目自己的排除规则。

本地 CLI 仍保留一些兼容命名：`c2c`、`.c2cignore`、`.c2c.json`、`c2c_*` token 前缀，以及历史 state directory。这样做是为了不破坏已经可用的全局 runtime。

详细文档：

- [架构](docs/architecture.md)
- [协议](docs/protocol.md)
- [安全](docs/security.md)
- [故障排查](docs/troubleshooting.md)

## 目录结构

```text
src/
  control/    resource policy、routing、task/project/role scope
  bridge/     本机回环 HTTP 服务、端口恢复、管理 API
  mcp/        只读工具、无状态 Streamable HTTP
  auth/       OAuth 2.1、PKCE、客户端注册、refresh 轮换
  pairing/    一次性配对码
  workspace/  路径收敛、敏感文件策略、搜索、git
  tunnel/     Cloudflare quick/named tunnel
  execution/  执行记录和 drift 检查
  process/    守护进程生命周期
  cli/        wingwoman / c2c CLI
skill/        Codex Skill 指令
tests/        单元和集成测试
docs/         架构、协议、安全、故障排查
```

## Attribution

Wingwoman is derived from and builds on [XiaoDuoYa/codex-with-chatgpt](https://github.com/XiaoDuoYa/codex-with-chatgpt), licensed under the MIT License.

原 MIT [LICENSE](LICENSE) 保留，包括原 copyright。

## 状态与声明

Wingwoman 是非官方社区项目，与 OpenAI 无关联，未获其背书。

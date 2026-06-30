# open-agent-ide 设计文档

**日期**: 2026-07-01  
**状态**: 设计稿，待审阅  
**参考项目**: Proma (D:\Proma) + free-code-main (D:\free-code-main)

---

## 1. 项目定位

`open-agent-ide` 是一个**桌面优先、后端可独立运行的 AI Agent IDE**。

它融合两个参考项目的优势：
- **Proma** 的 Electron 桌面 UI、Jotai 状态管理、类型安全 IPC、多 Provider 适配器
- **free-code-main** 的开放 Agent runtime、Bash/PowerShell/MCP 工具链、权限系统、实验性功能

目标不是简单拼接，而是把 free-code-main 的 CLI-first runtime 改造成无头后端服务，由 Proma 风格的 Electron 前端驱动。

---

## 2. 核心设计决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 产品形态 | Electron 桌面应用 | 保留 Proma 的桌面体验和现代 UI 能力 |
| 进程架构 | 3 进程 | 渲染进程 + Electron 主进程 + Bun Agent Runtime 子进程 |
| 后端运行时 | Bun | free-code-main 和 Proma 都基于 Bun |
| 前后端通信 | stdio + NDJSON | 简单、可扩展、类似 MCP server |
| 状态归属 | 前端持有权威状态 | 后端无状态执行器，每次请求带完整上下文 |
| 持久化 | 主进程 JSONL | Proma 已验证的模式 |
| 开发策略 | 完整复制 free-code-main 后逐步拆解 | 保证不偷工减料，每模块补测试 |
| 开发方法 | TDD | 复制过来的模块先补测试，改造时红-绿-重构 |

---

## 3. 参考来源映射

### 从 Proma 借鉴
- Electron + React + Jotai 前端架构
- `shared` → `core` → `ui` → `electron` 的 workspace 分层
- 类型安全 IPC 四层模式：shared types → main handler → preload → renderer
- 多 Provider 适配器注册表（`packages/core/src/providers`）
- 本地 JSON/JSONL 配置存储（`~/.proma/` 模式）
- Chat/Agent 双模式 UI 结构（MVP 先做 Agent 模式）

### 从 free-code-main 借鉴
- `src/entrypoints/cli.tsx:main` 的 Agent 主循环
- `src/tools/BashTool/`、`src/tools/PowerShellTool/` 等系统工具
- `src/tools/AgentTool/` 的 Agent/Swarm 能力
- `src/services/mcp/` 的 MCP client
- `src/services/tools/StreamingToolExecutor.ts` 的流式工具执行
- `src/utils/permissions/` 的权限规则
- `src/commands/ultraplan.tsx` 等实验性功能的设计思路
- 多 Provider 切换逻辑（Anthropic/OpenAI/Bedrock/Vertex/Foundry）

---

## 4. 架构图

```text
┌─────────────────────────────────────────────────────────────┐
│                     渲染进程 (React UI)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Agent View  │  │ Chat View   │  │ Settings Panel      │  │
│  │ (MVP 核心)  │  │ (v2)        │  │ Channels / Workspaces│  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                    │             │
│         └────────────────┴────────────────────┘             │
│                          │                                  │
│                    Jotai Atoms                              │
│                          │                                  │
└──────────────────────────┼──────────────────────────────────┘
                           │ IPC
┌──────────────────────────┼──────────────────────────────────┐
│              Electron 主进程 (Node.js/Bun)                   │
│  ┌───────────────────────┴──────────────────────────────┐   │
│  │                   IPC Router                          │   │
│  │  (接收渲染进程请求，转发给 Bun Runtime，回推事件流)    │   │
│  └───────────────────────┬──────────────────────────────┘   │
│                          │ spawn + stdio                    │
│  ┌───────────────────────┴──────────────────────────────┐   │
│  │              文件持久化服务 (JSONL)                    │   │
│  │              配置路径管理 (~/.open-agent-ide/)         │   │
│  └───────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
                           │ stdio + NDJSON
┌──────────────────────────┼──────────────────────────────────┐
│              Bun Agent Runtime 子进程                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ AgentLoop   │  │ ToolRegistry│  │ ProviderRegistry    │  │
│  │ 主循环      │  │ 工具注册表  │  │ 多 Provider 适配    │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                    │             │
│         └────────────────┴────────────────────┘             │
│                          │                                  │
│  ┌───────────────────────┼──────────────────────────────┐  │
│  │ MCP Client Manager    │  Permission Service          │  │
│  │ Workspace Manager     │  EventStreamer (NDJSON)      │  │
│  └───────────────────────┴──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. 通信协议

### 传输层
- Electron 主进程 `spawn('bun', ['packages/runtime/src/stdio-server.ts'])`
- 通过子进程 `stdin` 发送请求
- 通过子进程 `stdout` 读取 NDJSON 事件流
- `stderr` 用于日志/调试

### 协议版本与能力协商

启动时，runtime 先输出 ready 事件：

```ndjson
{"version":"1.0","type":"runtime.ready","capabilities":["bash","powershell","mcp","anthropic","openai"]}
```

### 请求格式

```ndjson
{"version":"1.0","id":"req-1","method":"agent.run","params":{"messages":[{"role":"user","content":"List files"}],"tools":["BashTool"],"model":"claude-opus-4-6","workspace":"/path/to/workspace","permissionMode":"ask"}}
```

### 事件流格式

```ndjson
{"version":"1.0","id":"req-1","type":"text_delta","content":"I'll"}
{"version":"1.0","id":"req-1","type":"text_delta","content":" list"}
{"version":"1.0","id":"req-1","type":"tool_start","tool":"BashTool","input":{"command":"ls -la"}}
{"version":"1.0","id":"req-1","type":"tool_result","tool":"BashTool","output":"...","success":true}
{"version":"1.0","id":"req-1","type":"done"}
```

### 错误事件

```ndjson
{"version":"1.0","id":"req-1","type":"error","code":"TOOL_EXECUTION_FAILED","message":"..."}
```

### 扩展性约定
- 未知 `type` 必须被忽略
- 未知 `method` 返回 `error`
- 新功能通过增加 `type`/`method`/`capabilities` 实现，不改传输层

---

## 6. Monorepo 结构

```text
open-agent-ide/
├── apps/
│   └── desktop/              # Electron 桌面应用
│       ├── src/
│       │   ├── main/         # 主进程：IPC 路由、子进程管理、文件持久化
│       │   ├── preload/      # contextBridge 暴露安全 API
│       │   └── renderer/     # React + Jotai UI
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── shared/               # IPC 协议类型、NDJSON 事件类型、常量
│   │   └── src/
│   │       ├── ipc.ts
│   │       ├── runtime.ts
│   │       └── events.ts
│   ├── core/                 # 模型 Provider 适配器
│   │   └── src/providers/
│   └── runtime/              # Bun Agent Runtime（初始为 free-code-main 完整副本）
│       ├── src/              # 从 free-code-main 复制
│       ├── package.json      # 从 free-code-main 复制并调整
│       ├── bun.lock          # 从 free-code-main 复制
│       ├── REFACTOR.md       # 拆解记录
│       └── tsconfig.json
├── package.json              # Bun workspace root
└── tsconfig.json
```

### 包命名
- `@open-agent-ide/shared`
- `@open-agent-ide/core`
- `@open-agent-ide/runtime`
- `open-agent-ide-desktop`

---

## 7. MVP 功能范围

### 必须包含（MVP）
1. **Agent 模式 UI**
   - 消息列表（文本、工具调用、工具结果）
   - 输入框
   - 会话列表
   - 工作区选择器
2. **Agent Runtime**
   - 模型调用循环
   - BashTool
   - PowerShellTool
   - ReadTool / EditTool（如 free-code-main 中有）
   - MCP client（基础连接+工具调用）
3. **权限系统**
   - safe / ask / allow-all 三种模式
   - 权限请求弹窗
4. **多 Provider 支持**
   - Anthropic（默认）
   - OpenAI
   - AWS Bedrock
   - Google Vertex
   - Anthropic Foundry
5. **工作区管理**
   - 创建/切换工作区
   - 每个工作区独立 cwd
   - MCP server 配置按工作区隔离
6. **设置面板**
   - 渠道（Provider + API Key）配置
   - 工作区管理
   - 权限模式选择

### 延后（v2）
- Chat 模式
- 语音模式
- Ultraplan
- Swarm / 多 Agent
- 自动更新
- 文件附件/文档解析
- 实验性功能解锁开关

---

## 8. 实施策略

### 阶段 1：项目骨架（第 1 周）
1. 创建 `open-agent-ide` monorepo
2. 设置 workspace、TypeScript、基础脚本
3. 创建 `packages/shared` 的 IPC/NDJSON 类型
4. 创建 `apps/desktop` 的 Electron 空壳
5. 创建 `packages/runtime`，**完整复制** free-code-main
6. 验证 `packages/runtime` 能独立 `bun run dev` 跑起来

### 阶段 2：Runtime 无头化（第 2-3 周）
1. 在 `packages/runtime` 中新建 `src/stdio-server.ts` 入口
2. 复制并改造 Agent 主循环，使其能接收 NDJSON 请求并输出事件流
3. 逐步删除/禁用 Ink TUI 组件，保留后端逻辑
4. 每保留一个模块，补单元测试
5. 记录所有改造到 `REFACTOR.md`

### 阶段 3：Electron 集成（第 3-4 周）
1. 主进程实现 runtime 子进程管理
2. 实现 IPC ↔ NDJSON 协议转换
3. 渲染进程实现 Agent UI 和 Jotai 状态流
4. 端到端测试：从 UI 输入到工具执行到结果展示

### 阶段 4：MVP 完善（第 4-5 周）
1. 工作区管理
2. MCP client 集成
3. 权限系统 UI
4. 设置面板
5. 文档和 README

---

## 9. TDD 执行规则

1. **复制过来的模块先补测试**：即使原模块没有测试，迁移后必须先写测试覆盖核心路径。
2. **改造前测试先行**：修改一个接口前，先写新接口的测试，看到失败，再实现。
3. **测试粒度**：
   - 单元测试：工具执行、权限规则、协议序列化/反序列化
   - 集成测试：Runtime 端到端请求/响应
   - E2E 测试：Electron 主进程 + Runtime 子进程联动
4. **CI 要求**：每次提交必须通过 `bun test`。

---

## 10. 风险与回退方案

| 风险 | 影响 | 回退方案 |
|---|---|---|
| free-code-main 代码与 Ink TUI 强耦合 | 拆解困难 | 先保留 TUI 作为 fallback，只把后端能力暴露出来 |
| Bun runtime 崩溃影响 Electron | 中 | 子进程隔离，崩溃后自动重启 |
| Provider API 变更 | 中 | ProviderRegistry 封装变更点 |
| 项目体积过大 | 低 | 后期删除未使用的实验性代码和依赖 |
| Windows 兼容性问题 | 中 | 优先保证 macOS/Linux，Windows 问题单独跟踪 |

---

## 11. 待确认事项

1. 设计文档审阅通过后，是否立即进入实施计划？
2. 是否需要先创建 GitHub 仓库，还是本地开发即可？
3. 是否需要保留 free-code-main 的 git 历史（通过 subtree/submodule），还是只复制当前快照？

---

## 12. 附录：关键文件索引

| 文件 | 职责 |
|---|---|
| `apps/desktop/src/main/runtime-manager.ts` | 启动/停止 Bun runtime，管理 stdio 通信 |
| `apps/desktop/src/main/ipc.ts` | IPC handler 注册 |
| `apps/desktop/src/preload/index.ts` | 暴露 `window.electronAPI` |
| `apps/desktop/src/renderer/components/AgentView.tsx` | Agent 模式主界面 |
| `packages/shared/src/runtime.ts` | NDJSON 协议类型定义 |
| `packages/runtime/src/stdio-server.ts` | Bun runtime 入口 |
| `packages/runtime/src/loop.ts` | Agent 主循环 |
| `packages/runtime/REFACTOR.md` | 拆解改造记录 |

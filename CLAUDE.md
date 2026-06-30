# open-agent-ide

**定位**：桌面优先、后端可独立运行的 AI Agent IDE。

**参考项目**：
- `D:\Proma` —— 借鉴 Electron 桌面架构、Jotai 状态管理、类型安全 IPC、多 Provider 适配器、JSONL 持久化
- `D:\free-code-main` —— 借鉴开放 Agent runtime、Bash/PowerShell/MCP 工具链、权限系统、实验性功能

> 注意：本项目**不修改**上述两个参考目录，仅以它们为架构和代码参考来源。

---

## 技术栈

- **桌面框架**：Electron
- **前端**：React 18+、Jotai、Tailwind CSS、Radix UI / Shadcn UI
- **后端运行时**：Bun
- **语言**：TypeScript
- **通信协议**：stdio + NDJSON（可扩展）
- **构建工具**：Vite（渲染进程）、esbuild（主进程/后端）
- **测试**：Bun 内置测试运行器

---

## 进程架构

```text
渲染进程 (React UI)
    ↓ IPC
Electron 主进程 (IPC 路由器 + 文件持久化)
    ↓ spawn + stdio
Bun Agent Runtime 子进程 (模型、工具、MCP)
```

---

## 领域驱动设计（DDD）分层

由于项目代码量大、模块耦合风险高，采用 DDD 思想组织代码，但避免过度设计。

### 限界上下文（Bounded Contexts）

| 上下文 | 核心实体 | 说明 |
|---|---|---|
| **Conversation** | Session、Message、Event | Agent 会话生命周期、消息历史 |
| **Tool Execution** | Tool、ToolRegistry、ToolResult | Bash、PowerShell、MCP 等工具执行 |
| **Permission** | PermissionRule、PermissionMode | 工具权限决策 |
| **Provider** | Provider、Model、API Key | 多模型 Provider 适配 |
| **Workspace** | Workspace、McpConfig、Skill | 工作区隔离、MCP 配置 |
| **Runtime** | AgentLoop、EventStreamer | Agent 主循环和事件流输出 |

### 分层结构

```text
packages/runtime/src/
├── domain/           # 领域层：实体、值对象、领域服务
│   ├── conversation/
│   ├── tool/
│   ├── permission/
│   ├── provider/
│   └── workspace/
├── application/      # 应用层：用例、工作流编排
│   ├── agent-loop/
│   └── runtime-service/
├── infrastructure/   # 基础设施层：外部依赖实现
│   ├── providers/
│   ├── tools/
│   ├── mcp/
│   └── persistence/
└── interfaces/       # 接口适配层：stdio server、NDJSON 协议
    └── stdio-server.ts
```

### DDD 应用原则

1. **领域层不依赖基础设施**：`Tool` 接口定义在 `domain/tool/`，具体 `BashTool` 实现在 `infrastructure/tools/`。
2. **用例驱动**：`application/agent-loop/` 表达"运行一轮 Agent"的完整业务流程。
3. **防腐层（Anti-Corruption Layer）**：从 free-code-main 复制过来的代码先放在 `infrastructure/_legacy/`，逐步重构到领域层。
4. **聚合根**：`Session` 是 Conversation 上下文的聚合根，`Workspace` 是 Workspace 上下文的聚合根。
5. **避免贫血模型**：实体不仅存数据，也包含业务规则（如 `PermissionRule.canExecute()`）。

---

## 模块依赖关系

```text
apps/desktop
    ↓ depends on
packages/shared
    ↓ depends on
packages/core
    ↓ depends on
packages/shared

packages/runtime
    ↓ depends on
packages/core
packages/shared
```

---

## 通信协议

### 传输层

Electron 主进程 spawn Bun runtime 子进程：
- `stdin`：发送 JSON 请求
- `stdout`：读取 NDJSON 事件流
- `stderr`：日志输出

### 示例

请求：
```ndjson
{"version":"1.0","id":"req-1","method":"agent.run","params":{"messages":[{"role":"user","content":"List files"}],"tools":["BashTool"],"model":"claude-opus-4-6","workspace":"/path/to/workspace","permissionMode":"ask"}}
```

事件流：
```ndjson
{"version":"1.0","id":"req-1","type":"text_delta","content":"I'll"}
{"version":"1.0","id":"req-1","type":"tool_start","tool":"BashTool","input":{"command":"ls -la"}}
{"version":"1.0","id":"req-1","type":"tool_result","tool":"BashTool","output":"...","success":true}
{"version":"1.0","id":"req-1","type":"done"}
```

---

## 代码探索工具（强制优先使用）

本项目代码量大、跨包引用多，开发时必须优先使用代码智能工具，避免低效地批量 grep/cat 读文件。

### CodeGraph（首选）

- **工具**：`mcp__codegraph__codegraph_explore`
- **用途**：理解"某段代码如何工作"、查找符号定义和调用链、修改前看爆炸半径
- **规则**：
  - 提问或修改代码前，先用 `codegraph_explore` 定位相关符号
  - 一个调用通常能替代多次 Grep/Read 循环
  - 若查询结果不足，再用 `Read` 读取具体片段

### GitNexus（次选，适合执行流和影响分析）

- **工具**：`mcp__gitnexus__query`、`mcp__gitnexus__context`、`mcp__gitnexus__impact`
- **用途**：
  - `query`：查找与某功能相关的执行流（processes）
  - `context`：查看某个符号的 360 度引用图
  - `impact`：修改函数/类前，分析上游依赖和爆炸半径
- **规则**：
  - 编辑任何函数/类/方法前，先用 `gitnexus impact` 评估风险
  - 提交前用 `gitnexus detect_changes` 验证只影响了预期符号
  - 理解不熟悉的模块时，优先 `gitnexus_query` 而不是 Grep

### 禁止行为

- 不要为了"了解上下文"连续读取 5 个以上完整文件
- 不要用 `grep`/`cat` 做广撒网式探索
- 不要直接修改未理解的代码

---

## 开发策略

1. **完整复制 free-code-main 到 `packages/runtime/` 作为起点**
2. **按 DDD 分层逐步拆解**复制过来的代码
3. **TDD 驱动**：复制模块后先补测试，改造时遵循红-绿-重构
4. **不修改参考目录**：`D:\Proma` 和 `D:\free-code-main` 保持只读参考
5. **文档同步**：所有架构变更同步更新本文件和 `docs/superpowers/specs/`

---

## 目录结构

```text
open-agent-ide/
├── apps/
│   └── desktop/              # Electron 桌面应用
│       ├── src/
│       │   ├── main/         # 主进程
│       │   ├── preload/      # IPC 桥接
│       │   └── renderer/     # React UI
│       └── package.json
├── packages/
│   ├── shared/               # IPC 协议类型、NDJSON 事件类型
│   ├── core/                 # Provider 适配器
│   └── runtime/              # Bun Agent Runtime（DDD 分层）
│       ├── src/
│       │   ├── domain/
│       │   ├── application/
│       │   ├── infrastructure/
│       │   └── interfaces/
│       └── REFACTOR.md       # 拆解记录
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-07-01-open-agent-ide-design.md
├── package.json              # Bun workspace root
└── CLAUDE.md                 # 本文件
```

---

## 设计文档

详细设计见：
- `docs/superpowers/specs/2026-07-01-open-agent-ide-design.md`

---

## 常用命令

```bash
# 安装依赖
bun install

# 开发模式
bun run dev

# 测试
bun test

# 构建
bun run build
```

---

## 注意事项

- 本项目为新建项目，不改动 `D:\Proma` 和 `D:\free-code-main`
- 从 free-code-main 复制过来的代码视为"遗留代码"，逐步按 DDD 分层重构
- 所有新增模块必须附带测试
- 中文注释优先，保留必要专业术语

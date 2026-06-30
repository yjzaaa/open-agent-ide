# Claude Code 架构分析（导航索引）

> 版本: 2.1.87 | 分析日期: 2026-04-10

本文档为 Claude Code 项目架构的导航索引。概要信息在下方，详细分析请点击各子系统链接。

---

## 架构全景图

```
┌──────────────────────────────────────────────────────┐
│                    入口层 (Entry)                      │
│  cli.tsx → main.tsx → init.ts → replLauncher.tsx     │
├──────────────────────────────────────────────────────┤
│                  表现层 (UI Layer)                     │
│  screens/REPL.tsx · components/ · hooks/ · ink/       │
├──────────────────────────────────────────────────────┤
│                 命令/工具层 (Commands & Tools)          │
│  commands.ts → commands/* · tools.ts → tools/*        │
├──────────────────────────────────────────────────────┤
│                  查询引擎层 (Query Engine)              │
│  QueryEngine.ts · query.ts · query/                   │
├──────────────────────────────────────────────────────┤
│                   服务层 (Services)                    │
│  api/ · mcp/ · oauth/ · analytics/ · compact/         │
│  policyLimits/ · plugins/ · lsp/                      │
├──────────────────────────────────────────────────────┤
│               状态管理层 (State)                       │
│  AppState.tsx → AppStateStore · context.ts            │
├──────────────────────────────────────────────────────┤
│              基础设施层 (Infrastructure)                │
│  utils/ · constants/ · schemas/ · memdir/ · bridge/   │
└──────────────────────────────────────────────────────┘
```

---

## 子系统详细文档

| 子系统 | 文档链接 | 说明 | 架构图 |
|--------|----------|------|--------|
| **入口与启动** | [architecture-entry-startup.md](architecture-entry-startup.md) | CLI 入口路由、快速路径、init 初始化流程、启动优化 | [entry-startup-flow.excalidraw](diagrams/entry-startup-flow.excalidraw) |
| **查询引擎** | [architecture-query-engine.md](architecture-query-engine.md) | AsyncGenerator 管道、权限追踪、成本监控、工具执行循环 | [query-engine-pipeline.excalidraw](diagrams/query-engine-pipeline.excalidraw) |
| **工具系统** | [architecture-tools-system.md](architecture-tools-system.md) | 45+ 工具注册、分类、条件导入、权限门控、MCP 去重 | [tools-system.excalidraw](diagrams/tools-system.excalidraw) |
| **服务层** | [architecture-services.md](architecture-services.md) | API 客户端、MCP 集成、OAuth、分析、压缩、策略限制 | [services-layer.excalidraw](diagrams/services-layer.excalidraw) |
| **状态管理** | [architecture-state-management.md](architecture-state-management.md) | AppStateStore、React Context、响应式更新、权限状态 | — |
| **构建系统** | [architecture-build-system.md](architecture-build-system.md) | Bun compile 管道、54 个 Feature Flags、死代码消除 | — |
| **桥接系统** | [architecture-bridge.md](architecture-bridge.md) | 远程控制、WebSocket 通信、JWT 认证、会话管理 | [bridge-system.excalidraw](diagrams/bridge-system.excalidraw) |
| **MCP 协议** | [architecture-mcp.md](architecture-mcp.md) | MCP 客户端/服务器、工具发现、资源协议、认证流程 | [mcp-protocol.excalidraw](diagrams/mcp-protocol.excalidraw) |

---

## 总体架构图

- [overall-architecture.excalidraw](diagrams/overall-architecture.excalidraw) — 六层分层架构全景图

---

## 技术栈速览

| 层次 | 技术选型 |
|------|----------|
| **运行时** | Bun >= 1.3.11 |
| **语言** | TypeScript (ESNext) |
| **UI 框架** | React 19 + Ink 6 |
| **AI SDK** | @anthropic-ai/sdk, Bedrock SDK, Vertex SDK |
| **协议** | MCP, LSP |
| **可观测性** | OpenTelemetry |
| **特性管理** | GrowthBook + bun feature() DCE |
| **构建产物** | 单一二进制文件（Bun compile） |

---

## 数据流总览

```
用户输入 → REPL.tsx → 斜杠命令(commands/*) 或 QueryEngine.ts
  QueryEngine → 上下文加载 → API 调用(Anthropic/Bedrock/Vertex)
    → 工具执行循环(文件/Shell/搜索/网络/Agent/MCP/任务)
    → 流式输出 → UI 渲染
```

---

## 模块依赖关系

```
cli.tsx → main.tsx → Commander + 初始化
  ├── replLauncher.tsx → REPL.tsx → components/ + hooks/ + state/
  ├── QueryEngine.ts → query.ts + commands.ts + tools.ts
  ├── services/ → api/ + mcp/ + oauth/ + analytics/
  ├── bridge/ → 远程控制
  ├── skills/ + plugins/ → 扩展系统
  └── utils/ → 工具函数库
```

---

## 关键设计决策

| 决策 | 理由 |
|------|------|
| Bun 运行时 | 极快启动、原生 TS、内置打包器 |
| React + Ink | 组件化终端 UI，声明式渲染 |
| AsyncGenerator 查询引擎 | 流式处理、可中断、可组合 |
| Feature Flags + DCE | 单一代码库多产品线，零运行时开销 |
| MCP 协议 | 标准化工具集成，支持第三方扩展 |
| 单二进制产物 | 简化分发 |

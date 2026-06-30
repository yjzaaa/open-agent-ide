# Runtime 拆解记录

## 来源

- 初始代码完整复制自 `D:\free-code-main`（commit: initial）
- 包名从 `claude-code-source-snapshot` 改为 `@open-agent-ide/runtime`
- 新增 workspace 依赖 `@open-agent-ide/shared` 和 `@open-agent-ide/core`

## 改造计划

1. 新增 `src/interfaces/stdio-server.ts` 作为无头入口
2. 逐步删除 React Ink TUI 组件
3. 把核心能力迁移到 DDD 分层：
   - `domain/`：事件、会话、工具、权限值对象
   - `application/`：AgentLoop、RuntimeService
   - `infrastructure/`：具体 Provider、工具、MCP client
   - `interfaces/`：stdio server、NDJSON 协议
4. 每改造一个模块，补测试并记录

## 已改造

- 包重命名和 workspace 化
- 新增 `stdio` script

## 待改造

- CLI 入口 (`src/entrypoints/cli.tsx`)
- Ink 组件
- Agent 主循环
- 工具系统
- MCP client
- 权限系统
- Provider 多后端适配

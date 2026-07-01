# 架构说明

## 总体架构

```text
┌─────────────────────────────────────────────────────────────┐
│                        渲染进程                              │
│  React + Jotai + Tailwind CSS                               │
│  ChatView / MessageList / ChatInput / useRuntime           │
└──────────────────────┬──────────────────────────────────────┘
│                      │ IPC
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                      主进程                                  │
│  BrowserWindow + RuntimeManager + registerRuntimeIpc       │
└──────────────────────┬──────────────────────────────────────┘
│                      │ spawn + stdio + NDJSON
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Bun Agent Runtime                          │
│  stdio-server → AgentLoop → Provider / Tool / MCP          │
└─────────────────────────────────────────────────────────────┘
```

## Runtime DDD 分层

```text
packages/runtime/src/
├── domain/          # 领域对象与规则
│   ├── tool/Tool.ts
│   └── workspace/McpServerConfig.ts
├── application/     # 应用服务与编排
│   ├── agent-loop/AgentLoop.ts
│   ├── permission/PermissionService.ts
│   ├── provider/ProviderRegistry.ts
│   ├── tool/ToolRegistry.ts
│   └── workspace/WorkspaceManager.ts
├── infrastructure/  # 技术实现
│   ├── providers/AnthropicAdapter.ts
│   ├── tools/BashTool.ts
│   ├── tools/PowerShellTool.ts
│   ├── tools/ReadTool.ts
│   ├── tools/EditTool.ts
│   └── mcp/McpClientManager.ts
└── interfaces/      # 对外接口
    └── stdio-server.ts
```

## 通信协议

Runtime 通过 stdio 使用 NDJSON 与主进程通信。

### 请求格式

```json
{
  "version": "1.0",
  "id": "req-1",
  "method": "agent.run",
  "params": {
    "id": "run-1",
    "messages": [{"role": "user", "content": "Hello"}],
    "tools": ["BashTool"],
    "model": "claude-sonnet-4-6",
    "providerId": "anthropic",
    "apiKey": "..."
  }
}
```

### 事件格式

```json
{"version":"1.0","type":"text_delta","content":"Hi"}
{"version":"1.0","type":"tool_start","tool":"BashTool","input":{"command":"ls"}}
{"version":"1.0","type":"tool_result","tool":"BashTool","output":"...","success":true}
{"version":"1.0","type":"done"}
```

## 数据流

1. 用户在 ChatInput 输入消息
2. `sendAgentRunAtom` 调用 `window.electronAPI.runtime.sendRequest`
3. 主进程 IPC handler 调用 `RuntimeManager.sendRequest`
4. NDJSON 写入 runtime 子进程 stdin
5. `AgentLoop` 处理请求，调用 Provider 流式接口
6. Provider 返回 `text_delta` / `tool_use` 等事件
7. AgentLoop 执行工具（如 BashTool）并产出 `tool_result`
8. 事件通过 stdout 返回主进程
9. 主进程通过 `runtime:event` IPC 推送到渲染进程
10. `useRuntime` hook 接收事件并写入 `runtimeEventsAtom`
11. `MessageList` 组件订阅 atom 并渲染

## 权限模型

- **safe**: 只允许只读工具（如 ReadTool、BashTool 白名单命令）
- **ask**: 非只写工具需要用户确认（发送 `permission_request`）
- **allow-all**: 允许所有工具执行

## 扩展点

- **Provider**: 实现 `ProviderAdapter` 并注册到 `ProviderRegistry`
- **Tool**: 实现 `Tool` 接口并注册到 `ToolRegistry`
- **MCP Server**: 在工作区 `mcp.json` 中声明，自动包装为 domain Tool

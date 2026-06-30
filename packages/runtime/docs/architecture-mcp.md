# MCP 协议集成架构文档

## 1. 概述

MCP (Model Context Protocol) 是一个开放协议，使 AI 应用程序能够与外部系统进行动态工具发现和执行。Claude Code 在 MCP 架构中扮演双重角色：

- **MCP 客户端**：连接到外部 MCP 服务器，发现并使用其提供的工具和资源
- **MCP 服务器**：将自己的工具暴露给外部消费者使用

这种架构实现了工具生态的开放扩展，允许 Claude Code 无缝集成第三方服务，同时也能作为服务提供给其他应用。

## 2. MCP 客户端架构 (`src/services/mcp/`)

### 2.1 核心组件

#### MCPConnectionManager.tsx
**集中式连接管理器**

- 作为 React 组件实现，通过 Context API 向下级组件提供 MCP 连接管理功能
- 管理所有 MCP 服务器连接的生命周期（创建、维护、断开、重连）
- 提供两个核心操作：
  - `reconnectMcpServer(serverName)`: 重新连接指定的 MCP 服务器
  - `toggleMcpServer(serverName)`: 切换 MCP 服务器的启用/禁用状态
- 集成 `useManageMCPConnections` hook，实现连接状态的响应式管理

**类型定义**：
```typescript
interface MCPConnectionContextValue {
  reconnectMcpServer: (serverName: string) => Promise<{
    client: MCPServerConnection;
    tools: Tool[];
    commands: Command[];
    resources?: ServerResource[];
  }>;
  toggleMcpServer: (serverName: string) => Promise<void>;
}
```

#### client.ts
**MCP 客户端实现**

基于 `@modelcontextprotocol/sdk` 实现的完整 MCP 客户端，负责与 MCP 服务器通信。

**核心功能**：
- **传输层支持**：
  - `StdioClientTransport`: 基于标准输入输出的进程间通信
  - `SSEClientTransport`: 基于 Server-Sent Events 的 HTTP 连接
  - `StreamableHTTPClientTransport`: 可流式传输的 HTTP 客户端
  - `WebSocketTransport`: WebSocket 双向通信

- **工具发现与执行**：
  - `listTools()`: 发现服务器提供的所有工具
  - `callTool()`: 执行指定的工具调用
  - 工具元数据解析（name, description, inputSchema）

- **资源协议**：
  - `listResources()`: 列出服务器提供的资源
  - `readResource()`: 读取特定资源的内容

- **Prompt 协议**：
  - `listPrompts()`: 列出可用的提示模板
  - `ElicitRequest`: 处理用户提示请求

- **错误处理**：
  - `McpError`: MCP 协议错误的标准化处理
  - 重试机制和连接恢复

**关键流程**：
```typescript
// 1. 建立连接
const transport = new StdioClientTransport({
  command: serverConfig.command,
  args: serverConfig.args,
  env: serverConfig.env,
})
const client = new Client({
  name: 'claude-code',
  version: MACRO.VERSION,
}, {
  capabilities: {}
})
await client.connect(transport)

// 2. 发现工具
const { tools } = await client.listTools()

// 3. 执行工具
const result = await client.callTool({
  name: toolName,
  arguments: toolArgs
})
```

#### config.ts
**服务器配置解析**

从 `.claude/settings.json` 读取和管理 MCP 服务器配置。

**配置来源**（按优先级排序）：
1. **Enterprise**: 企业级托管配置 (`getEnterpriseMcpFilePath()`)
2. **Managed**: 托管配置路径
3. **Project**: 项目级配置 (`.claude/settings.json`)
4. **User**: 用户级配置 (`~/.claude/settings.json`)
5. **Plugin**: 插件提供的 MCP 服务器

**配置格式**：
```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/files"]
    },
    "github": {
      "type": "sse",
      "url": "https://github.commy-mcp-server.com/sse",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}"
      }
    },
    "database": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "oauth": {
        "clientId": "your-client-id",
        "authServerMetadataUrl": "https://auth.example.com/.well-known/oauth-authorization-server"
      }
    }
  }
}
```

**环境变量展开**：
- 支持 `${VAR_NAME}` 语法在配置中引用环境变量
- 通过 `expandEnvVarsInString()` 函数实现安全的变量展开

**配置作用域**：
```typescript
type ConfigScope =
  | 'local'      // 本地配置
  | 'user'       // 用户级配置
  | 'project'    // 项目级配置
  | 'dynamic'    // 动态配置
  | 'enterprise' // 企业级配置
  | 'claudeai'   // Claude.ai 代理配置
  | 'managed'    // 托管配置
```

#### auth.ts
**OAuth 认证处理**

处理需要 OAuth 认证的 MCP 服务器。

**认证流程**：
1. 检查服务器配置中的 `oauth` 字段
2. 启动本地 OAuth 回调服务器（默认端口）
3. 重定向用户到授权页面
4. 接收授权码并交换访问令牌
5. 将令牌注入到后续请求的 headers 中

**支持的认证方式**：
- **OAuth 2.0**: 标准授权码流程
- **Cross-App Access (XAA)**: 跨应用访问（SEP-990）
- **API Key**: 基于 `headers` 字段的简单认证

#### officialRegistry.ts
**官方 MCP 服务器注册表**

管理 Anthropic 官方维护的 MCP 服务器列表。

**功能**：
- `prefetchOfficialMcpUrls()`: 预取官方 MCP 服务器的配置 URL
- 官方服务器列表的版本管理
- 自动发现和更新官方服务器配置

#### InProcessTransport.ts
**进程内传输层**

为bundled（内置）的 MCP 服务器提供进程内通信机制。

**用途**：
- 避免为内置工具启动单独的进程
- 直接调用 MCP 服务器的实现函数
- 提高性能，减少进程间通信开销

#### SdkControlTransport.ts
**SDK 控制传输**

用于与 SDK 实现的 MCP 服务器进行通信。

**场景**：
- IDE 扩展通过 SDK 暴露 MCP 服务器
- 允许 IDE 直接向 Claude Code 暴露工具

#### envExpansion.ts
**环境变量展开**

安全地展开 MCP 配置中的环境变量引用。

**功能**：
- 解析 `${VAR_NAME}` 语法
- 支持默认值：`${VAR_NAME:-default_value}`
- 支持错误提示：`${VAR_NAME:?error_message}`
- 保护敏感信息（不在日志中暴露）

#### normalization.ts
**工具名称规范化**

处理 MCP 工具名称的规范化和去重。

**规范化规则**：
1. 转换为小写
2. 替换特殊字符为下划线
3. 移除前后空格
4. 确保名称唯一性

**去重策略**：
```typescript
// MCP 工具优先级低于内置工具
// 如果名称冲突，MCP 工具会被重命名
const normalizedToolName = `${serverName}_${originalToolName}`
```

#### mcpStringUtils.ts
**MCP 字符串工具**

提供 MCP 协议相关的字符串处理工具函数。

#### headersHelper.ts
**HTTP 头部管理**

管理 MCP 请求的 HTTP 头部，包括：
- 认证令牌注入
- 自定义 headers 配置
- User-Agent 设置

#### channelAllowlist.ts
**频道白名单**

基于频道的权限控制，定义哪些 MCP 服务器可以在特定频道中使用。

#### channelPermissions.ts
**频道权限**

细粒度的权限控制系统：
- 按频道限制 MCP 工具访问
- 按服务器配置工具权限
- 运行时权限检查

#### channelNotification.ts
**频道通知**

处理 MCP 相关的频道通知消息。

#### elicitationHandler.ts
**提示处理**

处理 MCP 的 elicitation（用户提示）协议：
- 解析 elicitation 请求
- 向用户呈现提示
- 收集用户响应
- 返回结果给 MCP 服务器

#### oauthPort.ts
**OAuth 端口管理**

管理 OAuth 认证流程中的本地回调端口：
- 自动选择可用端口
- 避免端口冲突
- 临时服务器生命周期管理

#### types.ts
**核心类型定义**

定义 MCP 集成的所有核心类型：

**服务器配置类型**：
```typescript
// Stdio 服务器配置
type McpStdioServerConfig = {
  type: 'stdio'
  command: string
  args: string[]
  env?: Record<string, string>
}

// SSE 服务器配置
type McpSSEServerConfig = {
  type: 'sse'
  url: string
  headers?: Record<string, string>
  headersHelper?: string
  oauth?: McpOAuthConfig
}

// HTTP 服务器配置
type McpHTTPServerConfig = {
  type: 'http'
  url: string
  headers?: Record<string, string>
  oauth?: McpOAuthConfig
}

// WebSocket 服务器配置
type McpWebSocketServerConfig = {
  type: 'ws'
  url: string
  headers?: Record<string, string>
}

// SDK 服务器配置
type McpSdkServerConfig = {
  type: 'sdk'
  name: string
}
```

**连接状态类型**：
```typescript
type MCPServerConnection =
  | ConnectedMCPServer      // 已连接
  | FailedMCPServer         // 连接失败
  | NeedsAuthMCPServer      // 需要认证
  | PendingMCPServer        // 等待连接/重连
  | DisabledMCPServer       // 已禁用
```

**资源类型**：
```typescript
type ServerResource = Resource & { server: string }
```

#### useManageMCPConnections.ts
**React Hook - 连接管理**

提供 MCP 连接管理的 React Hook。

**功能**：
- 自动连接配置的 MCP 服务器
- 处理连接失败和重连
- 管理连接生命周期
- 提供连接状态查询

**使用方式**：
```typescript
const { reconnectMcpServer, toggleMcpServer } = useManageMCPConnections(
  dynamicMcpConfig,
  isStrictMcpConfig
)
```

#### utils.ts
**工具函数**

提供各种辅助工具函数：
- 连接状态检查
- 配置验证
- 错误格式化
- 工具列表处理

## 3. MCP 服务器模式 (`src/entrypoints/mcp.ts`)

Claude Code 可以作为 MCP 服务器运行，将自己的工具暴露给外部消费者。

### 3.1 服务器实现

```typescript
export async function startMCPServer(
  cwd: string,
  debug: boolean,
  verbose: boolean,
): Promise<void>
```

**功能**：
- 使用 `StdioServerTransport` 通过标准输入输出通信
- 实现以下 MCP 协议：
  - `tools/tools`: 列出所有可用工具
  - `tools/call`: 执行工具调用
  - `resources/list`: 列出可用资源（未实现）
  - `resources/read`: 读取资源（未实现）

**暴露的工具**：
- 所有内置工具（通过 `getTools()` 获取）
- 特定命令：`review`（通过 `MCP_COMMANDS` 配置）

**权限控制**：
- 使用 `hasPermissionsToUseTool()` 检查工具调用权限
- 确保只有允许的工具被执行

### 3.2 启动方式

```bash
# 作为 MCP 服务器启动
./cli mcp-server --cwd /path/to/project
```

## 4. 工具发现与注入流程

### 4.1 完整流程图

```
1. 读取配置
   ├─ 从 .claude/settings.json 读取 mcpServers 配置
   ├─ 从企业级配置读取托管服务器
   ├─ 从插件加载 MCP 服务器
   └─ 合并所有配置源（按优先级）

2. 建立连接
   ├─ 对于每个服务器配置：
   │  ├─ 检查认证需求
   │  ├─ 创建传输层（stdio/sse/http/ws/sdk）
   │  ├─ 初始化 MCP Client
   │  ├─ 执行连接
   │  └─ 处理连接失败（标记为 failed/needs-auth/pending）
   └─ 更新连接状态

3. 工具发现
   ├─ 对每个已连接的服务器调用 client.listTools()
   ├─ 接收工具元数据（name, description, inputSchema）
   ├─ 规范化工具名称
   └─ 构建工具列表

4. 工具注入
   ├─ 创建 MCPTool 实例
   ├─ 添加到全局工具注册表
   ├─ 处理名称冲突（MCP vs 内置）
   └─ 创建元数据工具（ListMcpResourcesTool）

5. 工具去重
   ├─ 扫描所有工具名称
   ├─ 检测冲突
   ├─ MCP 工具重命名：${serverName}_${toolName}
   └─ 更新规范化映射表

6. 工具执行
   ├─ 接收工具调用请求
   ├─ 识别工具类型（MCP vs 内置）
   ├─ 对于 MCP 工具：
   │  ├─ 查找对应的服务器连接
   │  ├─ 调用 client.callTool()
   │  ├─ 处理响应内容
   │  ├─ 截断过大的输出
   │  ├─ 持久化二进制内容
   │  └─ 返回格式化结果
   └─ 返回给调用者
```

### 4.2 工具包装

每个 MCP 工具被包装为 `MCPTool` 实例：

```typescript
class MCPTool extends Tool {
  constructor(
    private serverName: string,
    private client: Client,
    private toolDefinition: Tool,
  ) {}

  async call(params: unknown, context: ToolUseContext) {
    // 1. 验证输入
    // 2. 调用 MCP 服务器
    const result = await this.client.callTool({
      name: this.toolDefinition.name,
      arguments: params,
    })
    // 3. 处理响应
    // 4. 截断/持久化内容
    // 5. 返回格式化结果
  }
}
```

## 5. 资源协议

MCP 资源协议允许服务器暴露可读的数据资源。

### 5.1 资源发现

```typescript
const { resources } = await client.listResources()
```

**资源结构**：
```typescript
type Resource = {
  uri: string           // 资源唯一标识符
  name: string          // 资源名称
  description?: string  // 资源描述
  mimeType?: string     // MIME 类型
}
```

### 5.2 资源读取

```typescript
const { contents } = await client.readResource({
  uri: resourceUri
})
```

### 5.3 元数据工具

**ListMcpResourcesTool**:
- 列出所有 MCP 服务器提供的资源
- 按服务器分组显示

**ReadMcpResourceTool**:
- 读取指定的 MCP 资源
- 支持多种内容格式（text, image, etc.）

## 6. 认证流程

### 6.1 OAuth 2.0 流程

```
1. 检查配置
   ├─ 读取 oauth.clientId
   ├─ 读取 oauth.authServerMetadataUrl
   └─ 读取 oauth.callbackPort（可选）

2. 启动回调服务器
   ├─ 选择可用端口（默认或指定）
   ├─ 启动临时 HTTP 服务器
   └─ 等待授权回调

3. 生成授权 URL
   ├─ 从 authServerMetadataUrl 获取配置
   ├─ 构建授权请求
   └─ 生成重定向 URL

4. 用户授权
   ├─ 打开浏览器到授权页面
   ├─ 用户登录并授权
   └─ 服务器重定向到回调 URL

5. 交换令牌
   ├─ 从回调 URL 中提取授权码
   ├─ 用授权码交换访问令牌
   └─ 存储令牌（可选刷新令牌）

6. 注入令牌
   ├─ 将访问令牌添加到请求 headers
   └─ 使用 Bearer 认证
```

### 6.2 API Key 认证

```json
{
  "mcpServers": {
    "api-server": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}",
        "X-Custom-Header": "value"
      }
    }
  }
}
```

### 6.3 Cross-App Access (XAA)

XAA 允许跨应用访问 MCP 服务器：

```json
{
  "mcpServers": {
    "shared-server": {
      "type": "sse",
      "url": "https://shared.example.com/sse",
      "oauth": {
        "xaa": true
      }
    }
  },
  "xaaIdp": {
    "issuer": "https://idp.example.com",
    "clientId": "shared-client-id",
    "callbackPort": 3000
  }
}
```

## 7. 配置格式

### 7.1 Stdio 服务器（基于命令）

```json
{
  "mcpServers": {
    "filesystem": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 7.2 SSE 服务器（Server-Sent Events）

```json
{
  "mcpServers": {
    "sse-server": {
      "type": "sse",
      "url": "https://sse.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${TOKEN}"
      },
      "oauth": {
        "clientId": "client-id",
        "authServerMetadataUrl": "https://auth.example.com/.well-known/oauth-authorization-server",
        "callbackPort": 3000
      }
    }
  }
}
```

### 7.3 HTTP 服务器

```json
{
  "mcpServers": {
    "http-server": {
      "type": "http",
      "url": "https://http.example.com/mcp",
      "headers": {
        "X-API-Key": "${API_KEY}"
      }
    }
  }
}
```

### 7.4 WebSocket 服务器

```json
{
  "mcpServers": {
    "ws-server": {
      "type": "ws",
      "url": "wss://ws.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${TOKEN}"
      }
    }
  }
}
```

### 7.5 SDK 服务器（IDE 扩展）

```json
{
  "mcpServers": {
    "vscode-extension": {
      "type": "sdk",
      "name": "vscode-mcp-server"
    }
  }
}
```

### 7.6 IDE 扩展服务器

```json
{
  "mcpServers": {
    "ide-bridge": {
      "type": "sse-ide",
      "url": "http://localhost:3000/mcp",
      "ideName": "VSCode"
    }
  }
}
```

### 7.7 Claude.ai 代理服务器

```json
{
  "mcpServers": {
    "claudeai-proxy": {
      "type": "claudeai-proxy",
      "url": "https://proxy.claude.ai/mcp/abc123",
      "id": "abc123"
    }
  }
}
```

### 7.8 配置作用域

**项目级配置** (`.claude/settings.json`)：
```json
{
  "mcpServers": {
    "project-tool": { /* ... */ }
  }
}
```

**用户级配置** (`~/.claude/settings.json`)：
```json
{
  "mcpServers": {
    "global-tool": { /* ... */ }
  }
}
```

**动态配置**（运行时注入）：
```typescript
const dynamicConfig: Record<string, ScopedMcpServerConfig> = {
  "dynamic-tool": {
    type: "stdio",
    command: "node",
    args: ["server.js"],
    scope: "dynamic"
  }
}
```

## 8. 工具去重

### 8.1 冲突检测

当多个服务器提供同名工具时，需要进行去重处理：

```typescript
// 检测冲突
const toolName = "read_file"
const isBuiltIn = builtInTools.has(toolName)
const isMcpTool = mcpTools.has(toolName)

if (isBuiltIn && isMcpTool) {
  // 冲突：重命名 MCP 工具
  const newName = `${serverName}_read_file`
}
```

### 8.2 去重策略

**优先级**：
1. 内置工具优先（保留原始名称）
2. MCP 工具重命名（添加服务器前缀）

**重命名规则**：
```typescript
const normalizedToolName = `${serverName}_${originalToolName}`
// 例如：github_create_issue vs create_issue
```

### 8.3 规范化映射

维护原始名称到规范化名称的映射：

```typescript
const normalizedNames: Record<string, string> = {
  "read_file": "filesystem_read_file",
  "create_issue": "github_create_issue",
  // ...
}
```

## 9. 错误处理

### 9.1 连接失败

```typescript
type FailedMCPServer = {
  name: string
  type: 'failed'
  config: ScopedMcpServerConfig
  error?: string
}
```

**处理策略**：
- 标记服务器为 `failed` 状态
- 记录错误信息
- 不影响其他服务器的连接
- 允许手动重连

### 9.2 需要认证

```typescript
type NeedsAuthMCPServer = {
  name: string
  type: 'needs-auth'
  config: ScopedMcpServerConfig
}
```

**处理策略**：
- 标记服务器为 `needs-auth` 状态
- 提示用户进行认证
- 提供 `McpAuthTool` 引导认证流程

### 9.3 工具执行失败

```typescript
try {
  const result = await client.callTool({
    name: toolName,
    arguments: params,
  })
} catch (error) {
  if (error instanceof McpError) {
    // 处理 MCP 协议错误
    switch (error.code) {
      case ErrorCode.InvalidRequest:
        // 无效的请求参数
        break
      case ErrorCode.MethodNotFound:
        // 工具不存在
        break
      // ...
    }
  }
}
```

## 10. 性能优化

### 10.1 连接复用

- 使用连接池管理 MCP 服务器连接
- 避免频繁建立和断开连接
- 保持长连接（SSE, WebSocket）

### 10.2 缓存策略

- 缓存工具列表（避免重复发现）
- 缓存资源列表
- 使用 LRU 缓存限制内存使用

### 10.3 并行处理

```typescript
// 并行连接多个服务器
await pMap(
  Object.entries(servers),
  async ([name, config]) => {
    return connectToServer(name, config)
  },
  { concurrency: 5 }
)
```

### 10.4 流式响应

对于支持流式响应的传输层（SSE, HTTP），使用流式处理减少延迟：

```typescript
const transport = new StreamableHTTPClientTransport({
  url: serverConfig.url,
})
```

## 11. 安全考虑

### 11.1 权限控制

- 基于频道的工具权限
- 工具白名单/黑名单
- 运行时权限检查

### 11.2 输入验证

- 验证所有工具参数
- 防止注入攻击
- 限制资源访问路径

### 11.3 敏感信息保护

- 不在日志中暴露认证令牌
- 安全的环境变量展开
- 加密存储敏感配置

### 11.4 沙箱执行

- stdio 服务器在独立进程中运行
- 限制资源访问
- 超时控制

## 12. 监控与调试

### 12.1 日志记录

```typescript
logMCPDebug('Connecting to server', { name, config })
logMCPError('Connection failed', { name, error })
```

### 12.2 状态查询

```typescript
// 获取所有 MCP 连接状态
const state: MCPCliState = {
  clients: [...],
  configs: {...},
  tools: [...],
  resources: {...},
  normalizedNames: {...}
}
```

### 12.3 调试模式

```bash
# 启用 MCP 调试日志
MCP_DEBUG=1 ./cli
```

## 13. 扩展性

### 13.1 自定义传输层

```typescript
class CustomTransport implements Transport {
  async start() {
    // 自定义连接逻辑
  }

  async send(message: JSONRPCMessage) {
    // 自定义发送逻辑
  }

  onmessage(handler: (message: JSONRPCMessage) => void) {
    // 自定义接收逻辑
  }
}
```

### 13.2 插件集成

插件可以提供 MCP 服务器配置：

```typescript
// 插件 manifest.json
{
  "mcpServers": {
    "plugin-tool": {
      "type": "stdio",
      "command": "node",
      "args": ["plugin-mcp-server.js"]
    }
  }
}
```

### 13.3 自定义工具包装

```typescript
class CustomMCPTool extends MCPTool {
  async call(params: unknown, context: ToolUseContext) {
    // 自定义调用逻辑
    // 添加预处理/后处理
    // 实现自定义错误处理
  }
}
```

## 14. 最佳实践

### 14.1 配置管理

- 使用环境变量管理敏感信息
- 分离项目级和用户级配置
- 文档化所有 MCP 服务器依赖

### 14.2 错误处理

- 优雅处理连接失败
- 提供清晰的错误消息
- 实现自动重连机制

### 14.3 性能优化

- 延迟连接非关键服务器
- 使用连接池
- 实现缓存策略

### 14.4 安全性

- 最小权限原则
- 定期审计 MCP 服务器
- 保持依赖更新

## 15. 故障排除

### 15.1 连接问题

**问题**: 无法连接到 MCP 服务器

**解决方案**:
1. 检查服务器配置（command, url, etc.）
2. 验证网络连接
3. 检查防火墙设置
4. 查看服务器日志

### 15.2 认证问题

**问题**: OAuth 认证失败

**解决方案**:
1. 验证 `clientId` 和 `authServerMetadataUrl`
2. 检查回调端口是否可用
3. 确认授权服务器状态
4. 检查令牌有效期

### 15.3 工具问题

**问题**: MCP 工具无法执行

**解决方案**:
1. 验证工具名称（检查规范化）
2. 检查参数格式
3. 查看服务器错误消息
4. 确认工具权限

### 15.4 性能问题

**问题**: MCP 响应缓慢

**解决方案**:
1. 使用更快的传输层（SSE vs stdio）
2. 启用缓存
3. 减少工具调用次数
4. 优化服务器实现

## 16. 参考资源

- [MCP 协议规范](https://modelcontextprotocol.io)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- [Claude Code 文档](https://claude.ai/code)
- [官方 MCP 服务器列表](https://github.com/modelcontextprotocol/servers)

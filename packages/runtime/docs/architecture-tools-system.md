# Tools System Architecture

## 1. 概述

Claude Code 的工具系统是一个高度模块化、可扩展的架构，目前支持 **45+ 工具**，通过 `src/tools.ts` 进行统一注册和管理。系统采用以下关键设计原则：

- **条件加载**：通过特性标志（feature flags）实现实验性工具的死代码消除（dead code elimination）
- **权限控制**：细粒度的权限系统，基于工具名称和 MCP 服务器前缀进行访问控制
- **动态扩展**：支持 MCP（Model Context Protocol）工具的动态注入
- **去重策略**：内置工具优先于 MCP 同名工具，确保行为一致性

## 2. 工具注册架构

### 2.1 注册模式

`src/tools.ts` 实现了分层工具注册模式：

```typescript
// 基础工具：直接导入
import { BashTool } from './tools/BashTool/BashTool.js'
import { FileReadTool } from './tools/FileReadTool/FileReadTool.js'

// 条件工具：通过 feature() 条件导入
const SleepTool = feature('PROACTIVE') || feature('KAIROS')
  ? require('./tools/SleepTool/SleepTool.js').SleepTool
  : null

// Anthropic 内部工具：通过环境变量控制
const REPLTool = process.env.USER_TYPE === 'ant'
  ? require('./tools/REPLTool/REPLTool.js').REPLTool
  : null

// 循环依赖解决：懒加载（lazy require）
const getTeamCreateTool = () =>
  require('./tools/TeamCreateTool/TeamCreateTool.js').TeamCreateTool
```

### 2.2 关键注册函数

#### `getAllBaseTools()`
返回所有内置工具的完整列表，是工具系统的**单一事实来源**（Single Source of Truth）：

```typescript
export function getAllBaseTools(): Tools {
  return [
    AgentTool,
    TaskOutputTool,
    BashTool,
    ...(hasEmbeddedSearchTools() ? [] : [GlobTool, GrepTool]),
    ExitPlanModeV2Tool,
    FileReadTool,
    FileEditTool,
    FileWriteTool,
    // ... 45+ tools
  ]
}
```

**关键特性**：
- 内置搜索工具检测（`hasEmbeddedSearchTools()`）
- 环境变量条件工具（`process.env.USER_TYPE === 'ant'`）
- 特性标志工具（`feature('PROACTIVE')`）
- 懒加载工具（TeamCreateTool, TeamDeleteTool, SendMessageTool）

#### `getTools(permissionContext)`
返回经过权限过滤的内置工具列表：

```typescript
export const getTools = (permissionContext: ToolPermissionContext): Tools => {
  // Simple mode: 仅 Bash, Read, Edit
  if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
    // REPL 模式包装
    if (isReplModeEnabled() && REPLTool) {
      return filterToolsByDenyRules([REPLTool], permissionContext)
    }
    return filterToolsByDenyRules(
      [BashTool, FileReadTool, FileEditTool],
      permissionContext
    )
  }

  // 标准模式：所有基础工具
  const tools = getAllBaseTools().filter(tool => !specialTools.has(tool.name))
  let allowedTools = filterToolsByDenyRules(tools, permissionContext)

  // REPL 模式：隐藏原始工具（通过 VM 访问）
  if (isReplModeEnabled()) {
    allowedTools = allowedTools.filter(tool => !REPL_ONLY_TOOLS.has(tool.name))
  }

  const isEnabled = allowedTools.map(_ => _.isEnabled())
  return allowedTools.filter((_, i) => isEnabled[i])
}
```

#### `assembleToolPool(permissionContext, mcpTools)`
**工具池组装的单一事实来源**，合并内置工具和 MCP 工具：

```typescript
export function assembleToolPool(
  permissionContext: ToolPermissionContext,
  mcpTools: Tools,
): Tools {
  const builtInTools = getTools(permissionContext)
  const allowedMcpTools = filterToolsByDenyRules(mcpTools, permissionContext)

  // 去重：内置工具优先（保持插入顺序）
  const byName = (a: Tool, b: Tool) => a.name.localeCompare(b.name)
  return uniqBy(
    [...builtInTools].sort(byName).concat(allowedMcpTools.sort(byName)),
    'name'
  )
}
```

**关键设计**：
1. 内置工具作为连续前缀（保持提示缓存稳定性）
2. MCP 工具按名称排序（避免缓存失效）
3. 名称去重（内置工具优先于 MCP 工具）

### 2.3 MCP 工具注入

MCP 工具通过 `MCPConnectionManager` 动态注入：

```typescript
// MCP 工具结构
interface MCPTool extends Tool {
  mcpInfo: {
    serverName: string
    toolName: string
  }
}

// MCP 工具通过 appState.mcp.tools 注入
const mcpTools = appState.mcp.tools
const mergedTools = assembleToolPool(permissionContext, mcpTools)
```

## 3. 工具分类详解

### 3.1 文件操作工具

#### FileReadTool
- **路径**: `src/tools/FileReadTool/FileReadTool.ts`
- **功能**: 文件读取，支持行范围、图片、PDF、Jupyter Notebook
- **特性**:
  - 二进制扩展名检测（`hasBinaryExtension`）
  - 图片自动调整大小（`maybeResizeAndDownsampleImageBuffer`）
  - PDF 页面提取（`extractPDFPages`）
  - Notebook 单元格映射（`mapNotebookCellsToToolResult`）
  - 技能目录发现（`discoverSkillDirsForPaths`）

#### FileEditTool
- **路径**: `src/tools/FileEditTool/FileEditTool.ts`
- **功能**: 精确字符串替换编辑
- **特性**:
  - 精确匹配（`old_string` 必须唯一）
  - 全局替换选项（`replace_all`）
  - 文件历史跟踪（`fileHistoryTrackEdit`）

#### FileWriteTool
- **路径**: `src/tools/FileWriteTool/FileWriteTool.ts`
- **功能**: 完整文件写入/覆盖
- **特性**:
  - 必须先读取文件（防止意外覆盖）
  - 原子写入操作

#### GlobTool
- **路径**: `src/tools/GlobTool/GlobTool.ts`
- **功能**: 文件模式匹配（glob 语法）
- **特性**:
  - 支持通配符：`**/*.js`, `src/**/*.ts`
  - 按修改时间排序
  - 内置搜索工具替代（Ant-native builds）

#### GrepTool
- **路径**: `src/tools/GrepTool/GrepTool.ts`
- **功能**: 内容搜索（基于 ripgrep）
- **特性**:
  - 正则表达式支持
  - 上下文行控制（`-C`, `-A`, `-B`）
  - 文件类型过滤（`glob`, `type`）
  - 多行匹配（`multiline: true`）

### 3.2 Shell 执行工具

#### BashTool
- **路径**: `src/tools/BashTool/BashTool.tsx`
- **功能**: Shell 命令执行
- **特性**:
  - 超时控制（`timeout`，默认 120s，最大 600s）
  - 后台执行（`run_in_background`）
  - 沙箱模式（`shouldUseSandbox`）
  - 只读约束验证（`checkReadOnlyConstraints`）
  - sed 编辑解析（`parseSedEditCommand`）
  - 命令语义分析（`isSearchOrReadBashCommand`）
  - Git 操作跟踪（`trackGitOperations`）

**关键子模块**：
- `bashPermissions.ts`: 权限规则匹配
- `bashSecurity.ts`: 安全解析（`parseForSecurity`）
- `commandSemantics.ts`: 命令结果解释
- `sedValidation.ts`: sed 命令验证
- `shouldUseSandbox.ts`: 沙箱决策

#### PowerShellTool
- **路径**: `src/tools/PowerShellTool/PowerShellTool.ts`
- **功能**: PowerShell 特定执行
- **条件**: `isPowerShellToolEnabled()` 检查

### 3.3 Agent 工具

#### AgentTool
- **路径**: `src/tools/AgentTool/AgentTool.ts`
- **功能**: 子代理委托
- **支持的代理类型**:
  - `general-purpose`: 通用代理
  - `explore`: 代码探索代理
  - `plan`: 规划代理
  - `executor`: 执行代理
  - `architect`: 架构代理
  - `document-specialist`: 文档专家
  - `code-reviewer`: 代码审查代理
  - `verifier`: 验证代理

**关键特性**：
- 模型路由（`haiku`, `sonnet`, `opus`）
- 静默委托检查（`checkSilentDelegate`）
- 协调器模式支持（`COORDINATOR_MODE`）

#### SkillTool
- **路径**: `src/tools/SkillTool/SkillTool.ts`
- **功能**: 技能调用
- **技能系统**：
  - 层级 0 工作流：`autopilot`, `ultrawork`, `ralph`, `team`
  - 关键词触发：`"autopilot"`, `"ralph"`, `"ulw"`
  - 团队编排：`/team`

### 3.4 网络工具

#### WebFetchTool
- **路径**: `src/tools/WebFetchTool/WebFetchTool.ts`
- **功能**: URL 内容获取
- **特性**:
  - 超时控制（默认 20s）
  - 缓存支持（`no_cache`）
  - 返回格式：Markdown 或文本

#### WebSearchTool
- **路径**: `src/tools/WebSearchTool/WebSearchTool.ts`
- **功能**: Web 搜索
- **特性**:
  - 域名过滤（`allowed_domains`, `blocked_domains`）
  - 结果计数（`count`）
  - 来源引用（必须在响应末尾包含）

### 3.5 开发者工具

#### LSPTool
- **路径**: `src/tools/LSPTool/LSPTool.ts`
- **功能**: Language Server Protocol 集成
- **条件**: `process.env.ENABLE_LSP_TOOL`
- **用途**: 代码诊断、跳转定义、查找引用

#### NotebookEditTool
- **路径**: `src/tools/NotebookEditTool/NotebookEditTool.ts`
- **功能**: Jupyter Notebook 编辑
- **特性**:
  - 单元格替换（`edit_mode: replace`）
  - 单元格插入（`edit_mode: insert`）
  - 单元格删除（`edit_mode: delete`）

### 3.6 任务管理工具

#### TaskCreateTool
- **路径**: `src/tools/TaskCreateTool/TaskCreateTool.ts`
- **功能**: 创建后台任务
- **条件**: `isTodoV2Enabled()`

#### TaskGetTool / TaskListTool / TaskUpdateTool / TaskStopTool
- **功能**: 任务查询、列表、更新、停止
- **用途**: 后台任务生命周期管理

#### TaskOutputTool
- **路径**: `src/tools/TaskOutputTool/TaskOutputTool.ts`
- **功能**: 任务输出流式传输
- **特性**:
  - 实时输出（`TaskOutput`）
  - 磁盘持久化（`getToolResultPath`）

### 3.7 规划工具

#### EnterPlanModeTool / ExitPlanModeV2Tool
- **路径**: `src/tools/EnterPlanModeTool/`, `src/tools/ExitPlanModeTool/`
- **功能**: 进入/退出规划模式
- **特性**:
  - 计划模式状态管理
  - 权限模式保存/恢复（`prePlanMode`）

#### EnterWorktreeTool / ExitWorktreeTool
- **路径**: `src/tools/EnterWorktreeTool/`, `src/tools/ExitWorktreeTool/`
- **功能**: Git worktree 管理
- **条件**: `isWorktreeModeEnabled()`
- **特性**:
  - 隔离工作环境（`.claude/worktrees/`）
  - 会话切换

### 3.8 用户交互工具

#### AskUserQuestionTool
- **路径**: `src/tools/AskUserQuestionTool/AskUserQuestionTool.ts`
- **功能**: 向用户提问
- **用途**: 需要用户输入的场景（确认、选择）

#### TodoWriteTool
- **路径**: `src/tools/TodoWriteTool/TodoWriteTool.ts`
- **功能**: 任务列表显示
- **用途**: 跟踪待办事项进度

### 3.9 MCP 工具

#### ListMcpResourcesTool / ReadMcpResourceTool
- **路径**: `src/tools/ListMcpResourcesTool/`, `src/tools/ReadMcpResourceTool/`
- **功能**: MCP 资源管理
- **用途**: 列出和读取 MCP 服务器资源

#### MCPTool
- **功能**: 通用 MCP 工具调用
- **特性**:
  - 动态工具注入
  - 服务器前缀去重

#### McpAuthTool
- **功能**: MCP 身份验证
- **用途**: MCP 服务器权限管理

### 3.10 条件工具（Feature Flags）

#### PROACTIVE / KAIROS 工具
- **SleepTool**: 延迟执行
- **SendUserFileTool**: 文件发送
- **PushNotificationTool**: 推送通知

#### AGENT_TRIGGERS 工具
- **CronCreateTool / CronDeleteTool / CronListTool**: Cron 任务管理
- **RemoteTriggerTool**: 远程触发器

#### MONITOR_TOOL
- **MonitorTool**: 监控工具

#### COORDINATOR_MODE
- **协调器模式**: 支持多代理协调

#### WORKFLOW_SCRIPTS
- **WorkflowTool**: 工作流脚本执行
- **特性**: 打包工作流（`bundled/index.js`）

#### Anthropic 内部工具
- **REPLTool**: REPL 模式（`USER_TYPE === 'ant'`）
- **ConfigTool**: 配置管理
- **TungstenTool**: 内部工具
- **SuggestBackgroundPRTool**: PR 建议

#### 其他实验性工具
- **BriefTool**: 摘要工具
- **ToolSearchTool**: 工具搜索
- **VerifyPlanExecutionTool**: 计划验证
- **OverflowTestTool**: 溢出测试
- **CtxInspectTool**: 上下文检查
- **TerminalCaptureTool**: 终端捕获
- **WebBrowserTool**: Web 浏览器
- **SnipTool**: 历史剪裁
- **ListPeersTool**: 对等列表

## 4. 工具接口（Tool.ts）

### 4.1 Tool 接口

```typescript
export interface Tool {
  /** 工具唯一标识符 */
  name: string

  /** 工具显示名称 */
  userFacingName: string

  /** 工具描述（用于系统提示） */
  description: string

  /** 是否启用（动态检查） */
  isEnabled: () => boolean

  /** 输入验证 */
  input_schema: ToolInputJSONSchema

  /** 工具执行 */
  execute: (
    input: unknown,
    context: ToolUseContext
  ) => Promise<ToolResultBlockParam>

  /** 可选：权限验证 */
  permission?: PermissionConfig

  /** 可选：MCP 信息 */
  mcpInfo?: {
    serverName: string
    toolName: string
  }
}
```

### 4.2 Tools 类型

```typescript
export type Tools = readonly Tool[]
```

### 4.3 toolMatchesName

工具名称匹配函数（支持 MCP 前缀）：

```typescript
export function toolMatchesName(tool: Tool, name: string): boolean {
  // 处理 MCP 工具前缀：mcp__server__toolName
  const toolName = tool.mcpInfo
    ? `mcp__${tool.mcpInfo.serverName}__${tool.mcpInfo.toolName}`
    : tool.name
  return toolName === name
}
```

### 4.4 ToolUseContext

工具执行上下文：

```typescript
export type ToolUseContext = {
  // 应用状态
  appState: AppState

  // 权限函数
  canUseTool: CanUseToolFn

  // 进度回调
  setToolJSX: SetToolJSXFn

  // 工具进度
  toolProgress?: (data: ToolProgressData) => void

  // 查询链跟踪
  queryChainTracking?: QueryChainTracking

  // 其他上下文
  model?: string
  source?: QuerySource
  agentId?: AgentId
  // ...
}
```

## 5. 权限与安全

### 5.1 PermissionContext

```typescript
export type ToolPermissionContext = DeepImmutable<{
  mode: PermissionMode  // 'default' | 'auto' | 'bypass'
  additionalWorkingDirectories: Map<string, AdditionalWorkingDirectory>
  alwaysAllowRules: ToolPermissionRulesBySource
  alwaysDenyRules: ToolPermissionRulesBySource
  alwaysAskRules: ToolPermissionRulesBySource
  isBypassPermissionsModeAvailable: boolean
  shouldAvoidPermissionPrompts?: boolean
  awaitAutomatedChecksBeforeDialog?: boolean
  prePlanMode?: PermissionMode
}>
```

### 5.2 权限过滤

#### filterToolsByDenyRules
基于拒绝规则过滤工具：

```typescript
export function filterToolsByDenyRules<T extends { name: string }>(
  tools: readonly T[],
  permissionContext: ToolPermissionContext
): T[] {
  return tools.filter(
    tool => !getDenyRuleForTool(permissionContext, tool)
  )
}
```

**规则匹配**：
1. 工具名称精确匹配
2. MCP 服务器前缀匹配（`mcp__server*`）
3. 通配符模式匹配

### 5.3 安全模式

#### Simple Mode
```bash
CLAUDE_CODE_SIMPLE=true  # 仅 Bash, Read, Edit
```

#### REPL Mode
```bash
# 原始工具通过 VM 访问
REPL_ONLY_TOOLS = ['bash', 'file_read', 'file_edit', ...]
```

#### 沙箱模式
```bash
# 自动决策沙箱使用
shouldUseSandbox(command, permissionContext)
```

## 6. 去重策略

### 6.1 名称去重

```typescript
export function assembleToolPool(
  permissionContext: ToolPermissionContext,
  mcpTools: Tools,
): Tools {
  const builtInTools = getTools(permissionContext)
  const allowedMcpTools = filterToolsByDenyRules(mcpTools, permissionContext)

  // uniqBy 保留插入顺序，内置工具优先
  return uniqBy(
    [...builtInTools].sort(byName).concat(allowedMcpTools.sort(byName)),
    'name'
  )
}
```

### 6.2 缓存稳定性

内置工具作为连续前缀，确保提示缓存稳定：

```typescript
// builtInTools 排序后保持连续
[...builtInTools].sort(byName)
  .concat(allowedMcpTools.sort(byName))
```

**缓存策略**：
- 全局缓存断点设置在最后一个内置工具之后
- MCP 工具排序不会影响内置工具的缓存键

## 7. 工具搜索

### 7.1 ToolSearchTool

- **路径**: `src/tools/ToolSearchTool/ToolSearchTool.ts`
- **功能**: 工具搜索和延迟决策
- **条件**: `isToolSearchEnabledOptimistic()`

### 7.2 延迟策略

当工具数量超过阈值时，启用工具搜索：

```typescript
// 在 claude.ts 中请求时决定
const shouldDeferTools = isToolSearchEnabled(totalTools)
```

## 8. 测试与验证

### 8.1 TestingPermissionTool

- **路径**: `src/tools/testing/TestingPermissionTool.ts`
- **条件**: `process.env.NODE_ENV === 'test'`
- **用途**: 测试权限系统

### 8.2 OverflowTestTool

- **条件**: `feature('OVERFLOW_TEST_TOOL')`
- **用途**: 测试溢出行为

## 9. 协调器模式

### 9.1 Coordinator Mode

```typescript
// 协调器获得 Task+TaskStop
// 工作者获得 Bash/Read/Edit
if (coordinatorModeModule?.isCoordinatorMode()) {
  simpleTools.push(AgentTool, TaskStopTool, getSendMessageTool())
}
```

### 9.2 代理通信

- **TeamCreateTool / TeamDeleteTool**: 团队创建/删除
- **SendMessageTool**: 代理间消息传递

## 10. 性能优化

### 10.1 懒加载

循环依赖工具使用懒加载：

```typescript
const getTeamCreateTool = () =>
  require('./tools/TeamCreateTool/TeamCreateTool.js').TeamCreateTool
```

### 10.2 条件导入

实验性工具使用条件导入（死代码消除）：

```typescript
const SleepTool = feature('PROACTIVE') || feature('KAIROS')
  ? require('./tools/SleepTool/SleepTool.js').SleepTool
  : null
```

### 10.3 内联优化

```typescript
// Ant-native builds: 内置 bfs/ugrep
// 避免使用 Glob/Grep 工具
...(hasEmbeddedSearchTools() ? [] : [GlobTool, GrepTool])
```

## 11. 扩展性

### 11.1 添加新工具

1. 在 `src/tools/YourTool/` 创建工具目录
2. 实现 `Tool` 接口
3. 在 `src/tools.ts` 中导入并添加到 `getAllBaseTools()`

### 11.2 MCP 工具

MCP 工具自动注入，无需修改核心代码：

```typescript
// MCP 工具通过 MCPConnectionManager 注入
const mcpTools = appState.mcp.tools
```

### 11.3 特性标志

使用 `feature()` 函数控制工具可用性：

```typescript
const MyTool = feature('MY_FEATURE')
  ? require('./tools/MyTool/MyTool.js').MyTool
  : null
```

## 12. 监控与分析

### 12.1 分析事件

```typescript
logEvent('tool_called', {
  tool_name: tool.name,
  ...analyticsMetadata
})
```

### 12.2 进度跟踪

```typescript
toolProgress?.({
  type: 'bash',
  status: 'running',
  output: '...'
})
```

## 13. 故障处理

### 13.1 错误处理

```typescript
try {
  const result = await tool.execute(input, context)
} catch (error) {
  logError('tool_execution_failed', { tool: tool.name, error })
  return renderToolUseErrorMessage(error)
}
```

### 13.2 超时处理

```typescript
const timeout = input.timeout ?? getDefaultTimeoutMs()
const maxTimeout = getMaxTimeoutMs()
```

## 14. 文档与资源

- **主注册文件**: `src/tools.ts`
- **工具接口**: `src/Tool.ts`
- **权限系统**: `src/utils/permissions/`
- **MCP 集成**: `src/services/mcp/`
- **任务系统**: `src/tasks/`

## 15. 总结

Claude Code 的工具系统通过分层注册、条件加载、权限过滤和动态扩展实现了高度的模块化和可扩展性。系统设计确保了：

1. **性能优化**: 死代码消除、懒加载、内置工具优先
2. **安全性**: 细粒度权限控制、沙箱模式、只读约束
3. **可维护性**: 单一事实来源、清晰的分类、统一的接口
4. **可扩展性**: MCP 工具注入、特性标志、插件系统

系统支持 45+ 工具，涵盖文件操作、Shell 执行、Agent 委托、网络请求、开发工具、任务管理、规划模式等核心功能，为 Claude Code 提供了强大的自动化能力。

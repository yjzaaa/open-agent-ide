# Query Engine 架构文档

## 1. 概述

`QueryEngine.ts` 是 Claude Code 项目的核心调度器，负责管理整个查询生命周期。它使用 `AsyncGenerator` 模式实现流式消息处理，作为 SDK 和 REPL 路径的统一入口点。

**核心职责**：
- 协调用户输入、权限检查、上下文加载、系统提示组装
- 管理多轮对话和工具执行循环
- 追踪使用量、成本和权限拒绝记录
- 提供可中断的查询能力（通过 AbortController）
- 支持会话持久化和恢复

## 2. 核心数据流

```
用户输入
    ↓
权限检查（PermissionTracker）
    ↓
上下文加载（CLAUDE.md + Memory + Skills）
    ↓
系统提示组装
    ↓
API 调用（Anthropic/Bedrock/Vertex）
    ↓
流式响应处理
    ↓
工具执行循环（tool_use → execute → result）
    ↓
输出渲染
```

## 3. AsyncGenerator 管道设计

### 3.1 基本架构

`QueryEngine.submitMessage()` 返回一个 `AsyncGenerator<SDKMessage>`，允许调用者以流式方式消费响应：

```typescript
async *submitMessage(
  prompt: string | ContentBlockParam[],
  options?: { uuid?: string; isMeta?: boolean }
): AsyncGenerator<SDKMessage, void, unknown>
```

### 3.2 消息流

消息通过生成器的 `yield` 点流向调用者：

1. **系统初始化消息**（`buildSystemInitMessage`）：
   - 包含工具列表、MCP 客户端、模型、权限模式
   - 在查询开始时首先 yield

2. **流式事件**（`stream_event`）：
   - `message_start`: 新消息开始
   - `content_block_delta`: 内容块增量更新
   - `message_delta`: 消息级别元数据更新（使用量、stop_reason）
   - `message_stop`: 消息完成

3. **助手消息**（`assistant`）：
   - 文本块、thinking 块、工具调用块
   - 通过 `normalizeMessage()` 转换为 SDK 兼容格式

4. **用户消息**（`user`）：
   - 工具执行结果
   - 用户重新输入（用于 max_output_tokens 恢复）

5. **系统消息**（`system`）：
   - `compact_boundary`: 历史压缩边界
   - `api_retry`: API 错误重试通知

6. **附件消息**（`attachment`）：
   - `structured_output`: 结构化输出
   - `max_turns_reached`: 达到最大轮次
   - `hook_stopped_continuation`: Hook 阻止继续

### 3.3 中断和终止支持

**AbortController 集成**：

```typescript
private abortController: AbortController

interrupt(): void {
  this.abortController.abort()
}
```

中断检查点：
- 工具执行前
- API 调用期间（通过 `signal` 传递）
- 工具执行循环中

中断处理：
- 生成未完成的工具结果的合成错误消息
- 清理资源（如 MCP Computer Use 锁释放）
- 返回带有 `reason: 'aborted_streaming'` 或 `reason: 'aborted_tools'` 的终端状态

### 3.4 多轮对话支持

**轮次计数器**：

```typescript
let turnCount = 1
// 每次用户消息递增
if (message.type === 'user') {
  turnCount++
}
```

**最大轮次限制**：
- 通过 `maxTurns` 参数配置
- 达到限制时 yield `max_turns_reached` 附件并返回

**轮次间状态传递**：
- `mutableMessages`: 在轮次间累积的消息历史
- `totalUsage`: 累积的 token 使用量
- `readFileState`: 文件读取缓存

## 4. 权限追踪（PermissionTracker）

### 4.1 PermissionMode 类型

权限模式定义在 `src/types/permissions.ts`：

```typescript
type PermissionMode =
  | 'default'        // 默认模式，根据规则决定
  | 'plan'           // 计划模式，只读操作
  | 'acceptEdits'    // 自动接受编辑
  | 'bypassPermissions'  // 绕过所有权限检查
  | 'dontAsk'        // 不询问，自动拒绝
  | 'auto'           // 自动模式（仅内部）
```

### 4.2 工具权限上下文（ToolPermissionContext）

```typescript
type ToolPermissionContext = {
  readonly mode: PermissionMode
  readonly additionalWorkingDirectories: ReadonlyMap<string, AdditionalWorkingDirectory>
  readonly alwaysAllowRules: ToolPermissionRulesBySource
  readonly alwaysDenyRules: ToolPermissionRulesBySource
  readonly alwaysAskRules: ToolPermissionRulesBySource
  readonly isBypassPermissionsModeAvailable: boolean
}
```

### 4.3 CanUseToolFn 接口

```typescript
type CanUseToolFn<Input extends Record<string, unknown>> = (
  tool: ToolType,
  input: Input,
  toolUseContext: ToolUseContext,
  assistantMessage: AssistantMessage,
  toolUseID: string,
  forceDecision?: PermissionDecision<Input>
) => Promise<PermissionDecision<Input>>
```

**包装函数**：
QueryEngine 将 `canUseTool` 包装以追踪拒绝记录：

```typescript
const wrappedCanUseTool: CanUseToolFn = async (
  tool, input, toolUseContext, assistantMessage, toolUseID, forceDecision
) => {
  const result = await canUseTool(...)

  // 追踪拒绝记录用于 SDK 报告
  if (result.behavior !== 'allow') {
    this.permissionDenials.push({
      tool_name: sdkCompatToolName(tool.name),
      tool_use_id: toolUseID,
      tool_input: input,
    })
  }

  return result
}
```

### 4.4 权限拒绝处理

**拒绝记录类型**：

```typescript
type SDKPermissionDenial = {
  tool_name: string
  tool_use_id: string
  tool_input: Record<string, unknown>
}
```

**结果报告**：
在最终的 `result` 消息中包含：

```typescript
permission_denials: this.permissionDenials
```

## 5. 成本监控（Cost Tracker）

### 5.1 Token 使用量累积

**更新函数**（`src/services/api/claude.ts`）：

```typescript
export function updateUsage(
  base: NonNullableUsage,
  delta: Usage
): NonNullableUsage

export function accumulateUsage(
  total: NonNullableUsage,
  current: NonNullableUsage
): NonNullableUsage
```

**流式更新**：

```typescript
let currentMessageUsage: NonNullableUsage = EMPTY_USAGE

// message_start 事件
if (message.event.type === 'message_start') {
  currentMessageUsage = updateUsage(
    currentMessageUsage,
    message.event.message.usage
  )
}

// message_delta 事件
if (message.event.type === 'message_delta') {
  currentMessageUsage = updateUsage(
    currentMessageUsage,
    message.event.usage
  )
}

// message_stop 事件 - 累积到总量
if (message.event.type === 'message_stop') {
  this.totalUsage = accumulateUsage(
    this.totalUsage,
    currentMessageUsage
  )
}
```

### 5.2 成本追踪

**导出函数**（`src/cost-tracker.ts`）：

```typescript
// 总成本（USD）
getTotalCost(): number

// API 调用持续时间
getTotalAPIDuration(): number
getTotalAPIDurationWithoutRetries(): number

// 模型使用量
getModelUsage(): { [modelName: string]: ModelUsage }

// 添加到会话成本
addToTotalSessionCost(
  cost: number,
  usage: Usage,
  model: string
): number
```

**ModelUsage 类型**：

```typescript
type ModelUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  webSearchRequests: number
  costUSD: number
  contextWindow: number
  maxOutputTokens: number
}
```

### 5.3 使用量类型

**NonNullableUsage**：

```typescript
type NonNullableUsage = {
  input_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  output_tokens: number
  server_tool_use: {
    web_search_requests: number
    web_fetch_requests: number
  }
  service_tier: 'standard' | 'beta'
  cache_creation: {
    ephemeral_1h_input_tokens: number
    ephemeral_5m_input_tokens: number
  }
  inference_geo: string
  iterations: unknown[]
  speed: 'standard' | 'fast'
}
```

**EMPTY_USAGE**（`src/services/api/emptyUsage.ts`）：
零初始化的使用量对象，用于重置和默认值。

## 6. 上下文管理

### 6.1 消息压缩（Compact）

**压缩服务**：
- `autoCompact`: 自动压缩以控制上下文大小
- `snipCompact`: 基于启发式的压缩（特性门控）
- `reactiveCompact`: 响应式压缩，在 API 413 错误后触发
- `contextCollapse`: 上下文投影和崩溃

**压缩边界消息**：

```typescript
type SDKCompactBoundaryMessage = {
  type: 'system'
  subtype: 'compact_boundary'
  session_id: string
  uuid: string
  compact_metadata: {
    preservedSegment: {
      tailUuid: string
    }
    summaryMessageUuid: string
    messagesRemoved: number
  }
}
```

**处理流程**：

```typescript
if (message.subtype === 'compact_boundary' && message.compactMetadata) {
  // 释放预压缩消息以供 GC
  const mutableBoundaryIdx = this.mutableMessages.length - 1
  if (mutableBoundaryIdx > 0) {
    this.mutableMessages.splice(0, mutableBoundaryIdx)
  }
  // ... 对本地 messages 做同样操作
}
```

### 6.2 Memory 加载

**loadMemoryPrompt**（`src/memdir/memdir.ts`）：

```typescript
async function loadMemoryPrompt(): Promise<string | null>
```

加载机制：
- 当 `CLAUDE_COWORK_MEMORY_PATH_OVERRIDE` 设置时注入
- 使用 Write/Edit 工具约定
- 包含 MEMORY.md 文件名和加载语义

### 6.3 文件历史快照

**fileHistoryMakeSnapshot**（特性门控）：

```typescript
if (fileHistoryEnabled() && persistSession) {
  messagesFromUserInput
    .filter(messageSelector().selectableUserMessagesFilter)
    .forEach(message => {
      void fileHistoryMakeSnapshot(
        (updater: (prev: FileHistoryState) => FileHistoryState) => {
          setAppState(prev => ({
            ...prev,
            fileHistory: updater(prev.fileHistory),
          }))
        },
        message.uuid,
      )
    })
}
```

### 6.4 文件状态缓存

**FileStateCache**：

```typescript
private readFileState: FileStateCache

getReadFileState(): FileStateCache {
  return this.readFileState
}
```

用于跨轮次缓存文件读取结果，避免重复读取。

## 7. 工具执行循环

### 7.1 工具调用检测

API 响应流中的工具调用检测：

```typescript
const assistantMessages: AssistantMessage[] = []
const toolUseBlocks: ToolUseBlock[] = []

for await (const message of callModel(...)) {
  if (message.type === 'assistant') {
    assistantMessages.push(message)

    const msgToolUseBlocks = message.message.content.filter(
      content => content.type === 'tool_use'
    ) as ToolUseBlock[]

    if (msgToolUseBlocks.length > 0) {
      toolUseBlocks.push(...msgToolUseBlocks)
      needsFollowUp = true
    }
  }
}
```

### 7.2 工具执行分发

**流式工具执行**（特性门控）：

```typescript
const useStreamingToolExecution = config.gates.streamingToolExecution
let streamingToolExecutor = useStreamingToolExecution
  ? new StreamingToolExecutor(
      toolUseContext.options.tools,
      canUseTool,
      toolUseContext,
    )
  : null
```

**执行流程**：

```typescript
const toolUpdates = streamingToolExecutor
  ? streamingToolExecutor.getRemainingResults()
  : runTools(toolUseBlocks, assistantMessages, canUseTool, toolUseContext)

for await (const update of toolUpdates) {
  if (update.message) {
    yield update.message
    toolResults.push(
      ...normalizeMessagesForAPI(
        [update.message],
        toolUseContext.options.tools,
      ).filter(_ => _.type === 'user'),
    )
  }
  if (update.newContext) {
    updatedToolUseContext = {
      ...update.newContext,
      queryTracking,
    }
  }
}
```

### 7.3 结果累积

工具结果作为用户消息添加到对话历史：

```typescript
const toolResults: (UserMessage | AttachmentMessage)[] = []

// ... 执行工具后
toolResults.push(...normalizedResults)

// 下一轮递归调用包含工具结果
const next: State = {
  messages: [
    ...messagesForQuery,
    ...assistantMessages,
    ...toolResults,
  ],
  // ...
}
```

### 7.4 重试机制

**最大输出令牌恢复**：

```typescript
const MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3

if (isWithheldMaxOutputTokens(lastMessage)) {
  // 升级重试：8k → 64k
  if (capEnabled && maxOutputTokensOverride === undefined) {
    state = {
      ...state,
      maxOutputTokensOverride: ESCALATED_MAX_TOKENS,
      transition: { reason: 'max_output_tokens_escalate' },
    }
    continue
  }

  // 多轮重试
  if (maxOutputTokensRecoveryCount < MAX_OUTPUT_TOKENS_RECOVERY_LIMIT) {
    const recoveryMessage = createUserMessage({
      content: 'Output token limit hit. Resume directly...',
      isMeta: true,
    })

    state = {
      ...state,
      messages: [
        ...messagesForQuery,
        ...assistantMessages,
        recoveryMessage,
      ],
      maxOutputTokensRecoveryCount: maxOutputTokensRecoveryCount + 1,
      transition: { reason: 'max_output_tokens_recovery' },
    }
    continue
  }

  // 恢复耗尽 - surface 错误
  yield lastMessage
}
```

**API 错误重试**（`src/services/api/withRetry.ts`）：
- 内部处理，不暴露给 QueryEngine
- 通过 `categorizeRetryableAPIError` 分类错误

## 8. 错误处理

### 8.1 错误分类

**categorizeRetryableAPIError**（`src/services/api/errors.ts`）：

```typescript
function categorizeRetryableAPIError(
  error: APIError
): 'rate_limit' | 'timeout' | 'server_error' | 'overloaded' | 'unknown'
```

### 8.2 恢复策略

**提示过长恢复**：

1. **Context Collapse Drain**（优先）：
   ```typescript
   const drained = contextCollapse.recoverFromOverflow(
     messagesForQuery,
     querySource,
   )
   if (drained.committed > 0) {
     state = {
       messages: drained.messages,
       transition: { reason: 'collapse_drain_retry', committed: drained.committed },
     }
     continue
   }
   ```

2. **Reactive Compact**（备用）：
   ```typescript
   const compacted = await reactiveCompact.tryReactiveCompact({...})
   if (compacted) {
     const postCompactMessages = buildPostCompactMessages(compacted)
     state = {
       messages: postCompactMessages,
       transition: { reason: 'reactive_compact_retry' },
     }
     continue
   }
   ```

3. **失败**：
   ```typescript
   yield lastMessage  // surface the withheld error
   void executeStopFailureHooks(lastMessage, toolUseContext)
   return { reason: 'prompt_too_long' }
   ```

**模型回退**（`FallbackTriggeredError`）：
- 切换到 fallback 模型并重试
- 清除部分消息以避免签名不匹配
- 生成墓碑消息移除孤立消息

**执行期间错误**：

```typescript
if (!isResultSuccessful(result, lastStopReason)) {
  yield {
    type: 'result',
    subtype: 'error_during_execution',
    // ... 错误详情
    errors: [
      `[ede_diagnostic] result_type=${edeResultType} last_content_type=${edeLastContentType} stop_reason=${lastStopReason}`,
      ...getInMemoryErrors().slice(start).map(_ => _.error),
    ],
  }
  return
}
```

## 9. 与 query.ts 的关系

### 9.1 职责分离

**QueryEngine.ts**（高级编排）：
- 会话状态管理
- 权限包装
- 使用量累积
- 消息持久化
- SDK 消息转换
- 生命周期钩子

**query.ts**（低级查询）：
- 单轮查询循环
- API 调用执行
- 消息压缩调度
- 工具执行编排
- Stop hooks 处理

### 9.2 交互模式

```typescript
// QueryEngine 调用 query()
for await (const message of query({
  messages,
  systemPrompt,
  userContext,
  systemContext,
  canUseTool: wrappedCanUseTool,
  toolUseContext: processUserInputContext,
  fallbackModel,
  querySource: 'sdk',
  maxTurns,
  taskBudget,
})) {
  // QueryEngine 处理每条消息
  // - 追踪到 mutableMessages
  - 持久化到 transcript
  // - 转换为 SDK 格式并 yield
}
```

### 9.3 递归结构

`query()` 实现了内部递归循环（while(true)）来处理多轮对话，而 `QueryEngine.submitMessage()` 则在其上添加了会话级别的状态管理。

## 10. 关键类型

### 10.1 SDKMessage

```typescript
type SDKMessage =
  | { type: 'system'; subtype: 'init'; ... }          // 系统初始化
  | { type: 'assistant'; message: ... }               // 助手消息
  | { type: 'user'; message: ...; isReplay?: boolean } // 用户消息
  | { type: 'system'; subtype: 'compact_boundary'; ... } // 压缩边界
  | { type: 'system'; subtype: 'api_retry'; ... }     // API 重试
  | { type: 'attachment'; ... }                       // 附件
  | { type: 'tool_use_summary'; ... }                 // 工具使用摘要
  | { type: 'stream_event'; ... }                     // 流事件
  | { type: 'result'; subtype: 'success' | 'error_...', ... } // 结果
```

### 10.2 SDKCompactBoundaryMessage

```typescript
type SDKCompactBoundaryMessage = {
  type: 'system'
  subtype: 'compact_boundary'
  session_id: string
  uuid: string
  compact_metadata: {
    preservedSegment?: {
      headUuid: string
      tailUuid: string
    }
    summaryMessageUuid: string
    messagesRemoved: number
    tokensFreed?: number
  }
}
```

### 10.3 SDKPermissionDenial

```typescript
type SDKPermissionDenial = {
  tool_name: string
  tool_use_id: string | null
  tool_input: Record<string, unknown>
}
```

### 10.4 SDKStatus

用于 SDK 状态更新的回调（可选）：

```typescript
type SDKStatus =
  | { status: 'thinking' }
  | { status: 'processing'; detail?: string }
  | { status: 'idle' }

setSDKStatus?: (status: SDKStatus) => void
```

### 10.5 其他重要类型

**QueryEngineConfig**：
完整的配置接口，包含所有可选参数。

**Terminal**（query.ts）：
```typescript
type Terminal = {
  reason: string
  turnCount?: number
  error?: unknown
}
```

**Continue**（query.ts）：
状态转换标记，用于指示为什么循环继续到下一次迭代。

## 11. 总结

QueryEngine 是 Claude Code 的核心编排器，它：
1. 使用 AsyncGenerator 模式实现流式响应
2. 通过 PermissionTracker 追踪权限决策
3. 通过 cost-tracker 累积使用量和成本
4. 管理上下文压缩和文件缓存
5. 协调工具执行循环和多轮对话
6. 提供健壮的错误处理和恢复机制
7. 与 query.ts 协同工作，实现完整的查询生命周期

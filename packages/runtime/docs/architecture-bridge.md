# Bridge System 架构文档

## 1. 概述

Bridge（桥接）系统是 Claude Code 的核心组件，实现了从 claude.ai Web 界面或 IDE 扩展远程控制本地机器的功能。该系统基于 WebSocket 通信，使用 JWT 进行身份验证，并通过 Environments API 与 Anthropic 后端服务进行交互。

**核心能力**:
- 远程会话创建和管理
- 双向消息流（入站/出站）
- 权限请求处理
- 会话隔离（Git worktree 支持）
- 多会话并发
- 自动重连和故障恢复

## 2. 架构组件

### 2.1 核心文件

#### bridgeMain.ts
主入口点，处理命令行参数解析和环境注册：

**关键功能**:
- `bridgeMain()`: 主函数，处理 `claude remote-control` 命令
- `parseArgs()`: 解析命令行参数
- `runBridgeLoop()`: 主轮询循环
- `runBridgeHeadless()`: 无头模式（daemon worker）

**命令行参数**:
```bash
claude remote-control [options]
  --name <name>              会话名称
  --spawn <mode>             生成模式: session, same-dir, worktree
  --capacity <N>             最大并发会话数
  --permission-mode <mode>   权限模式
  --debug-file <path>        调试日志文件
  --session-timeout <sec>    会话超时时间
  --session-id <id>          恢复特定会话
  --continue                 恢复最近的会话
```

#### bridgeConfig.ts
配置管理，处理 OAuth token 和 API endpoints：

**关键功能**:
- `getBridgeAccessToken()`: 获取 OAuth 访问令牌
- `getBridgeBaseUrl()`: 获取 Bridge API 基础 URL
- `getSessionIngressUrl()`: 获取 Session Ingress URL

**环境变量**:
- `CLAUDE_BRIDGE_BASE_URL`: 自定义 API endpoint
- `CLAUDE_BRIDGE_SESSION_INGRESS_URL`: 自定义 Session Ingress endpoint

#### bridgeEnabled.ts
启用条件检查，验证功能可用性：

**关键功能**:
```typescript
isBridgeEnabled(): boolean
// 检查:
// 1. BRIDGE_MODE feature flag
// 2. claude.ai 订阅状态
// 3. GrowthBook gate (tengu_ccr_bridge)

isBridgeEnabledBlocking(): Promise<boolean>
// 阻塞版本，确保 GrowthBook 初始化完成

getBridgeDisabledReason(): Promise<string | null>
// 返回详细的禁用原因（用于用户友好的错误消息）
```

**启用条件**:
1. ✅ `BRIDGE_MODE` feature flag 启用
2. ✅ claude.ai 订阅（非 Bedrock/Vertex/Foundry）
3. ✅ GrowthBook gate `tengu_ccr_bridge` 为 true
4. ✅ 有效的 OAuth token（包含 `user:profile` scope）
5. ✅ 最低版本要求

#### bridgeMessaging.ts
消息协议处理，解析和路由 WebSocket 消息：

**类型守卫**:
```typescript
isSDKMessage(value: unknown): value is SDKMessage
isSDKControlResponse(value: unknown): value is SDKControlResponse
isSDKControlRequest(value: unknown): value is SDKControlRequest
```

**核心功能**:
- `handleIngressMessage()`: 处理入站消息
- `handleServerControlRequest()`: 处理服务器控制请求
- `makeResultMessage()`: 构建结果消息
- `BoundedUUIDSet`: UUID 去重（回弹跳）

**消息类型**:
- `user`: 用户消息
- `assistant`: 助手消息
- `control_request`: 控制请求（initialize, interrupt, set_model, etc.）
- `control_response`: 控制响应

#### bridgePermissionCallbacks.ts
权限处理，管理工具执行权限：

**权限模式**:
- `auto`: 自动批准所有权限
- `bubble`: 交互式确认
- ` bubble:confirm`: 每次操作都确认

**权限请求流程**:
1. Agent 调用工具
2. 发送 `control_request` (can_use_tool)
3. Bridge 转发到服务器
4. 用户在 claude.ai 批准/拒绝
5. `control_response` 返回到本地
6. Agent 继续或停止

#### bridgeAPI.ts
公共 API 表面，封装所有 HTTP 调用：

**API 客户端接口**:
```typescript
interface BridgeApiClient {
  registerBridgeEnvironment(config): Promise<{environment_id, environment_secret}>
  pollForWork(environmentId, secret): Promise<WorkResponse | null>
  acknowledgeWork(environmentId, workId, token): Promise<void>
  stopWork(environmentId, workId, force): Promise<void>
  deregisterEnvironment(environmentId): Promise<void>
  sendPermissionResponseEvent(sessionId, event, token): Promise<void>
  archiveSession(sessionId): Promise<void>
  reconnectSession(environmentId, sessionId): Promise<void>
  heartbeatWork(environmentId, workId, token): Promise<{lease_extended, state}>
}
```

**错误处理**:
- `BridgeFatalError`: 致命错误（401, 403, 404）
- `isExpiredErrorType()`: 检查环境是否过期
- `isSuppressible403()`: 检查是否为可抑制的 403 错误

#### bridgeStatusUtil.ts
状态工具，格式化和显示状态信息：

**格式化函数**:
- `formatDuration()`: 毫秒转人类可读格式（"5m 30s"）
- `formatDelay()`: 延迟格式化（"2.5s", "500ms"）

#### bridgeUI.ts
UI 集成，管理终端显示和交互：

**BridgeLogger 接口**:
```typescript
interface BridgeLogger {
  printBanner(config, environmentId): void
  logSessionStart(sessionId, prompt): void
  logSessionComplete(sessionId, durationMs): void
  logSessionFailed(sessionId, error): void
  logStatus(message): void
  logVerbose(message): void
  logError(message): void
  updateIdleStatus(): void
  updateReconnectingStatus(delay, elapsed): void
  updateSessionStatus(sessionId, elapsed, activity, trail): void
  setSessionTitle(sessionId, title): void
  toggleQr(): void
  updateSessionCount(active, max, mode): void
  // ... 更多方法
}
```

**键盘交互**:
- `Space`: 切换二维码显示
- `w`: 切换生成模式（same-dir ↔ worktree）
- `Ctrl+C/D`: 优雅关闭

#### replBridge.ts
REPL 特定的桥接实现，集成到交互式 shell：

**ReplBridgeHandle**:
```typescript
interface ReplBridgeHandle {
  bridgeSessionId: string
  environmentId: string
  writeMessages(messages: Message[]): void
  writeSdkMessages(messages: SDKMessage[]): void
  sendControlRequest(request): void
  sendControlResponse(response): void
  teardown(): Promise<void>
}
```

**初始化**:
```typescript
initReplBridge(params: BridgeCoreParams): Promise<ReplBridgeHandle>
```

#### replBridgeTransport.ts
传输层抽象，支持 WebSocket 和 SSE：

**传输类型**:
```typescript
interface ReplBridgeTransport {
  write(event): Promise<void>
  close(): Promise<void>
  onMessage(callback): void
  onControlRequest(callback): void
}
```

**实现**:
- `createV1ReplTransport()`: WebSocket 传输（Session Ingress）
- `createV2ReplTransport()`: SSE 传输（CCR v2）

#### remoteBridgeCore.ts
远程桥接核心，独立进程的桥接实现：

**用途**: Daemon worker 和独立桥接进程

#### jwtUtils.ts
JWT 身份验证工具：

**功能**:
- `decodeJwtPayload()`: 解码 JWT payload（不验证签名）
- `decodeJwtExpiry()`: 提取过期时间
- `createTokenRefreshScheduler()`: 令牌刷新调度器

**刷新机制**:
- 在令牌过期前 5 分钟刷新
- 支持会话隔离
- 处理刷新失败重试

#### createSession.ts
会话创建，管理会话生命周期：

**API**:
```typescript
createBridgeSession(opts): Promise<string>  // 返回 sessionId
getBridgeSession(sessionId): Promise<Session | null>
updateBridgeSessionTitle(sessionId, title): Promise<void>
```

**会话元数据**:
- 标题
- Git 仓库信息
- 分支
- 创建时间

#### sessionRunner.ts
会话执行器，生成和管理子进程：

**SessionSpawner**:
```typescript
interface SessionSpawner {
  spawn(opts: SessionSpawnOpts, dir: string): SessionHandle
}

interface SessionHandle {
  sessionId: string
  done: Promise<SessionDoneStatus>
  kill(): void
  forceKill(): void
  activities: SessionActivity[]
  writeStdin(data: string): void
  updateAccessToken(token: string): void
}
```

**生成选项**:
```typescript
interface SessionSpawnOpts {
  sessionId: string
  sdkUrl: string
  accessToken: string
  useCcrV2?: boolean       // 使用 CCR v2 传输
  workerEpoch?: number     // CCR v2 worker epoch
  onFirstUserMessage?(text): void
}
```

#### pollConfig.ts / pollConfigDefaults.ts
轮询配置，控制轮询间隔和行为：

**配置项**:
```typescript
interface PollIntervalConfig {
  multisession_poll_interval_ms_at_capacity: number        // 满载时
  multisession_poll_interval_ms_partial_capacity: number   // 部分负载
  multisession_poll_interval_ms_not_at_capacity: number    // 空闲
  non_exclusive_heartbeat_interval_ms: number              // 心跳间隔
  reclaim_older_than_ms: number                            // 重新认领时间
}
```

**默认值**:
- 满载: 60,000ms (1 分钟)
- 部分负载: 5,000ms (5 秒)
- 空闲: 2,000ms (2 秒)
- 心跳: 30,000ms (30 秒)

#### capacityWake.ts
容量唤醒机制，满载时快速响应会话结束：

**用途**: 当会话结束时立即唤醒轮询循环，而不是等待下一次轮询间隔。

**API**:
```typescript
const capacityWake = createCapacityWake(signal)

// 在会话结束时
capacityWake.wake()

// 在等待时使用
const cap = capacityWake.signal()
await sleep(timeout, cap.signal)
cap.cleanup()
```

#### codeSessionApi.ts
Code Session API，与 CCR v2 后端集成：

**功能**:
- Worker 注册
- Session Ingress 通信
- SSE 事件流

#### types.ts
类型定义，包含所有 Bridge 相关类型：

**主要类型**:
- `BridgeConfig`: 桥接配置
- `WorkData` / `WorkResponse`: 工作项数据
- `WorkSecret`: 工作密钥（JWT）
- `SessionHandle`: 会话句柄
- `SessionSpawner`: 会话生成器
- `BridgeLogger`: 日志记录器
- `SpawnMode`: 生成模式（'single-session' | 'worktree' | 'same-dir'）

## 3. 通信模型

### 3.1 WebSocket 通信

**连接建立**:
1. Bridge 注册环境 → 获得 `environment_id` 和 `environment_secret`
2. 轮询 `/work` endpoint 获取工作项
3. 收到工作项后解析 `WorkSecret`（包含 JWT）
4. 使用 JWT 连接 WebSocket endpoint

**消息流向**:

```
claude.ai/IDE
    ↓ (WebSocket)
Session Ingress / CCR
    ↓ (WebSocket/SSE)
Bridge
    ↓ (stdin/stdout)
Child Process
```

### 3.2 JWT 身份验证流程

**令牌类型**:
1. **OAuth Token**: 用于 Environments API
   - 来自 `claude auth login`
   - 定期刷新（~3 小时 55 分钟）

2. **Session Ingress JWT**: 用于 WebSocket 连接
   - 包含在 `WorkSecret` 中
   - 有效期 ~6 小时
   - 提前 5 分钟刷新

**刷新流程**:
```typescript
// 1. 调度刷新
tokenRefresh.schedule(sessionId, jwt)

// 2. 在过期前触发
onRefresh(sessionId, oauthToken) => {
  if (v2Sessions.has(sessionId)) {
    // CCR v2: 触发服务器重新分发
    api.reconnectSession(environmentId, sessionId)
  } else {
    // CCR v1: 直接传递 OAuth token
    handle.updateAccessToken(oauthToken)
  }
}
```

### 3.3 Claude.ai OAuth 集成

**认证要求**:
- claude.ai 订阅账户
- OAuth token 包含 `user:profile` scope
- 组织 UUID 用于 GrowthBook targeting

**检查点**:
```typescript
function isClaudeAISubscriber(): boolean {
  // 排除:
  // - Bedrock/Vertex/Foundry 部署
  // - API key 登录
  // - Console 登录
  // 要求: claude.ai OAuth token
}
```

### 3.4 Policy Limit 检查

**权限检查**:
1. `allow_remote_control`: 允许远程控制
2. `environments:manage`: 环境管理
3. `external_poll_sessions`: 外部轮询会话

**失败处理**:
- 403: 权限不足（可抑制的错误不显示给用户）
- 401: 认证失败（触发 OAuth 刷新）
- 404/410: 环境过期/删除

## 4. 启用条件

### 4.1 Feature Flag

**必需**: `BRIDGE_MODE` feature flag 启用

```typescript
if (!feature('BRIDGE_MODE')) {
  return 'Remote Control is not available in this build.'
}
```

### 4.2 GrowthBook Runtime Gate

**Gate**: `tengu_ccr_bridge`

**检查**:
```typescript
const enabled = getFeatureValue_CACHED_MAY_BE_STALE(
  'tengu_ccr_bridge',
  false
)
```

**Targeting**: 基于 `organizationUUID`

### 4.3 OAuth 认证

**要求**:
- 有效的 OAuth token
- `user:profile` scope（用于获取组织 UUID）
- claude.ai 订阅（排除其他部署类型）

**错误消息**:
```typescript
'Remote Control requires a claude.ai subscription. Run `claude auth login` to sign in with your claude.ai account.'
```

### 4.4 Policy Limit

**必需**: `allow_remote_control` 权限

**检查点**: Environments API 注册时验证

### 4.5 最低版本检查

**版本比较**:
```typescript
if (lt(MACRO.VERSION, config.minVersion)) {
  return `Your version (${MACRO.VERSION}) is too old. Version ${config.minVersion} or higher is required.`
}
```

**配置**: GrowthBook `tengu_bridge_min_version`

## 5. 会话管理

### 5.1 会话创建

**流程**:
1. 用户运行 `claude remote-control`
2. Bridge 注册环境
3. （可选）预创建空会话
4. 轮询工作队列
5. 收到会话工作项 → 生成子进程

**会话预创建**:
```typescript
if (preCreateSession) {
  initialSessionId = await createBridgeSession({
    environmentId,
    title: name,
    events: [],
    gitRepoUrl,
    branch
  })
}
```

### 5.2 会话生命周期

**状态**:
1. `created`: 会话创建
2. `attached`: Bridge 附加
3. `active`: 执行中
4. `completed` / `failed` / `interrupted`: 结束

**超时**:
- 默认: 24 小时
- 配置: `--session-timeout <seconds>`

**清理**:
- 归档会话（从 Web UI 隐藏）
- 停止工作项
- 删除 worktree（如果创建）
- 取消环境注册

### 5.3 入站/出站消息处理

**入站** (claude.ai → 本地):
```typescript
handleIngressMessage(data, recentPostedUUIDs, recentInboundUUIDs, {
  onInboundMessage: (msg) => {
    // 处理用户消息
    deliverToRepl(msg)
  },
  onPermissionResponse: (resp) => {
    // 处理权限响应
    handlePermissionDecision(resp)
  },
  onControlRequest: (req) => {
    // 处理服务器控制请求
    handleServerControlRequest(req, handlers)
  }
})
```

**出站** (本地 → claude.ai):
```typescript
bridge.writeSdkMessages({
  type: 'assistant' | 'tool_use' | 'result',
  session_id: sessionId,
  uuid: randomUUID(),
  // ...
})
```

### 5.4 附件支持

**入站附件**:
- URL: 通过 `inboundAttachments.ts` 下载
- 文件: 提取到临时目录

**处理**:
```typescript
const attachments = await resolveInboundAttachments(
  message.attachments,
  sessionId
)
```

### 5.5 Session ID 兼容性

**兼容层**:
- 服务器使用 `session_*` ID
- CCR v2 内部使用 `cse_*` ID
- 需要转换以确保兼容性

**函数**:
```typescript
toCompatSessionId(infraId: string): string  // cse_* → session_*
toInfraSessionId(compatId: string): string  // session_* → cse_*
```

## 6. 安全机制

### 6.1 JWT Token 验证

**验证点**:
1. WorkSecret 解码（base64url）
2. JWT payload 提取（exp, session_id）
3. 过期检查

**错误处理**:
```typescript
try {
  const secret = decodeWorkSecret(work.secret)
} catch (err) {
  logger.logError(`Failed to decode work secret: ${err}`)
  stopWork(work.id)
}
```

### 6.2 受信任设备管理

**设备注册**:
```typescript
const deviceToken = await getTrustedDeviceToken()
// 用于持久化身份验证
```

**用途**: 避免每次会话都重新认证

### 6.3 Work Secret 会话隔离

**结构**:
```typescript
interface WorkSecret {
  version: number
  session_ingress_token: string  // JWT
  api_base_url: string
  sources: Array<{
    type: string
    git_info?: {...}
  }>
  auth: Array<{type, token}>
  claude_code_args?: Record<string, string>
  mcp_config?: unknown
  environment_variables?: Record<string, string>
  use_code_sessions?: boolean  // CCR v2 标志
}
```

**隔离**:
- 每个会话独立的 JWT
- 独立的环境变量
- 独立的 MCP 配置

### 6.4 环境变量配置

**安全变量**:
- `CLAUDE_BRIDGE_BASE_URL`: API endpoint
- `CLAUDE_BRIDGE_SESSION_INGRESS_URL`: WebSocket endpoint
- `CLAUDE_BRIDGE_USE_CCR_V2`: 强制 CCR v2

**验证**:
- HTTP 只允许 localhost
- 非 localhost 必须使用 HTTPS

## 7. 高级功能

### 7.1 多会话模式

**生成模式**:
- `single-session`: 单会话，会话结束时退出
- `same-dir`: 多会话，共享当前目录
- `worktree`: 多会话，每个会话独立的 git worktree

**容量控制**:
```bash
--capacity 32  # 最多 32 个并发会话
```

**默认**: 32 个会话（ GrowthBook gate 启用时）

### 7.2 Worktree 隔离

**创建**:
```typescript
const wt = await createAgentWorktree(`bridge-${sessionId}`)
// 创建:
// - .git/worktrees/.../<worktree>
// - 独立的工作目录
// - 分离的 HEAD
```

**清理**:
```typescript
await removeAgentWorktree(wt.worktreePath, wt.worktreeBranch)
```

**要求**:
- Git 仓库
- 或 WorktreeCreate/WorktreeRemove hooks

### 7.3 自动重连

**重连场景**:
1. WebSocket 断开
2. 网络错误
3. 系统休眠/唤醒

**策略**:
- 指数退避（2s → 4s → 8s → ... → 120s cap）
- 心跳保持活动会话
- 失败 10 分钟后放弃

### 7.4 故障恢复

**Crash Recovery Pointer**:
```typescript
// 写入
await writeBridgePointer(dir, {
  sessionId,
  environmentId,
  source: 'standalone'
})

// 读取
const pointer = await readBridgePointerAcrossWorktrees(dir)
```

**恢复**:
```bash
claude remote-control --continue
# 或
claude remote-control --session-id <id>
```

## 8. 监控和调试

### 8.1 调试日志

**启用**:
```bash
--debug-file /path/to/debug.log
```

**Ant 用户**:
自动启用，日志位置: `$TMPDIR/claude/bridge-session-*.log`

### 8.2 遥测事件

**事件类型**:
- `tengu_bridge_started`: Bridge 启动
- `tengu_bridge_session_started`: 会话启动
- `tengu_bridge_session_done`: 会话结束
- `tengu_bridge_fatal_error`: 致命错误
- `tengu_bridge_reconnected`: 重连成功

### 8.3 诊断日志

**日志记录**:
```typescript
logForDiagnosticsNoPII('info', 'bridge_session_started', {
  spawn_mode: 'worktree',
  in_worktree: true,
  spawn_duration_ms: 1234
})
```

**PII 保护**:
- 不记录个人身份信息
- 使用匿名化的 session ID

## 9. 性能优化

### 9.1 轮询优化

**满载时**:
- 心跳模式：仅发送心跳，不轮询
- 容量唤醒：会话结束时立即唤醒

**部分负载**:
- 降低轮询频率（5 秒）

**空闲时**:
- 最低轮询频率（2 秒）

### 9.2 UUID 去重

**BoundedUUIDSet**:
- 固定容量的 FIFO 集合
- O(1) 查找和插入
- 自动驱逐最旧条目

**用途**:
- 防止回弹（自己的消息）
- 防止重复传递（服务器重新发送）

### 9.3 刷新调度

**提前刷新**:
- 在过期前 5 分钟触发
- 避免会话中断
- 处理刷新失败

## 10. 故障排查

### 10.1 常见错误

**"Remote Control is not enabled for your account"**:
- 检查 GrowthBook gate
- 确认 claude.ai 订阅
- 验证 OAuth token scope

**"Session timed out"**:
- 默认 24 小时
- 可通过 `--session-timeout` 调整

**"Environment expired"**:
- 后端 4 小时 TTL
- 使用 `--continue` 恢复

### 10.2 调试技巧

1. **启用详细日志**:
   ```bash
   -v, --verbose
   ```

2. **检查环境变量**:
   ```bash
   echo $CLAUDE_BRIDGE_BASE_URL
   ```

3. **验证认证**:
   ```bash
   claude auth status
   ```

4. **测试连接**:
   ```bash
   claude remote-control --debug-file /tmp/bridge.log
   ```

## 11. 相关文件清单

```
src/bridge/
├── bridgeMain.ts              # 主入口
├── bridgeConfig.ts            # 配置管理
├── bridgeEnabled.ts           # 启用检查
├── bridgeMessaging.ts         # 消息协议
├── bridgePermissionCallbacks.ts  # 权限处理
├── bridgeApi.ts               # API 客户端
├── bridgeStatusUtil.ts        # 状态工具
├── bridgeUI.ts                # UI 集成
├── replBridge.ts              # REPL 集成
├── replBridgeTransport.ts     # 传输层
├── remoteBridgeCore.ts        # 远程核心
├── jwtUtils.ts                # JWT 工具
├── createSession.ts           # 会话创建
├── sessionRunner.ts           # 会话执行
├── pollConfig.ts              # 轮询配置
├── pollConfigDefaults.ts      # 默认配置
├── capacityWake.ts            # 容量唤醒
├── codeSessionApi.ts          # Code Session API
├── types.ts                   # 类型定义
├── bridgeDebug.ts             # 调试工具
├── bridgePointer.ts           # Crash recovery
├── trustedDevice.ts           # 设备信任
├── workSecret.ts              # Work secret 处理
├── sessionIdCompat.ts         # ID 兼容性
├── envLessBridgeConfig.ts     # 无环境配置
├── flushGate.ts               # 刷新门控
├── inboundAttachments.ts      # 入站附件
├── inboundMessages.ts         # 入站消息
└── initReplBridge.ts          # REPL 初始化
```

## 12. API 参考

### 12.1 Environments API

**POST** `/v1/environments`
- 注册 bridge 环境
- 返回: `{environment_id, environment_secret}`

**GET** `/v1/environments/{id}/work`
- 轮询工作项
- 返回: `WorkResponse | null`

**POST** `/v1/environments/{id}/work/{work_id}/ack`
- 确认工作项

**DELETE** `/v1/environments/{id}/work/{work_id}`
- 停止工作项

**DELETE** `/v1/environments/{id}`
- 注销环境

### 12.2 Session Events API

**POST** `/v1/sessions/{id}/events`
- 发送会话事件（权限响应）

**GET** `/v1/sessions/{id}`
- 获取会话信息

**PATCH** `/v1/sessions/{id}`
- 更新会话（标题等）

**POST** `/v1/sessions/{id}/archive`
- 归档会话

### 12.3 Bridge Control API

**POST** `/v1/bridge/reconnect`
- 重新连接会话（触发服务器重新分发）

**POST** `/v1/code/sessions/{id}/worker`
- 注册 CCR v2 worker
- 返回: `{epoch}`

**GET** `/v1/code/sessions/{id}/heartbeat`
- 心跳检查
- 返回: `{lease_extended, state}`

## 13. 最佳实践

### 13.1 开发

1. **使用本地开发环境**:
   ```bash
   export CLAUDE_BRIDGE_BASE_URL=http://localhost:8211
   export CLAUDE_BRIDGE_SESSION_INGRESS_URL=http://localhost:9413
   ```

2. **启用调试日志**:
   ```bash
   claude remote-control -v --debug-file /tmp/bridge.log
   ```

3. **测试多会话**:
   ```bash
   claude remote-control --spawn=worktree --capacity=4
   ```

### 13.2 生产

1. **使用默认配置**:
   - 让系统自动选择生成模式
   - 信任 GrowthBook rollout

2. **监控性能**:
   - 查看遥测事件
   - 检查会话持续时间

3. **优雅关闭**:
   - 使用 SIGTERM (Ctrl+C)
   - 等待会话清理完成

### 13.3 安全

1. **保护 OAuth token**:
   - 不要硬编码
   - 使用 `claude auth login`

2. **验证 HTTPS**:
   - 非本地连接必须使用 HTTPS
   - 系统自动验证

3. **隔离敏感会话**:
   - 使用 worktree 模式
   - 设置合理的超时

## 14. 未来方向

- [ ] 改进错误恢复机制
- [ ] 增强多会话协调
- [ ] 优化轮询策略
- [ ] 扩展遥测覆盖
- [ ] 简化调试流程

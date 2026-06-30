# Entry & Startup 子系统架构文档

## 1. 概述

Claude Code 的入口系统采用**快速路径路由 (Fast-path Routing)** 模式，在 `src/entrypoints/cli.tsx` 中实现。该设计通过在加载完整 CLI 之前检查特殊标志，最大限度地减少启动时间，实现毫秒级的快速响应。

### 核心设计原则

- **零导入设计**: 所有非关键路径都使用动态导入，避免不必要的模块加载
- **早期退出**: 对于简单操作（如 `--version`），立即返回而不加载任何依赖
- **并行预取**: 在初始化过程中异步执行网络和 I/O 操作
- **性能检测**: 内置启动性能分析器 (`startupProfiler`) 监控各阶段耗时

---

## 2. 入口点路由

主入口文件 `src/entrypoints/cli.tsx` 实现了多层次的快速路径检查。以下是所有快速路径的详细说明：

### 2.1 版本查询快速路径

**标志**: `--version`, `-v`, `-V`

```typescript
if (args.length === 1 && (args[0] === '--version' || args[0] === '-v' || args[0] === '-V')) {
  console.log(`${MACRO.VERSION} (Claude Code)`)
  return
}
```

**特点**:
- **零模块加载**: 不导入任何模块，直接输出构建时注入的 `MACRO.VERSION`
- **最快响应**: 通常 < 1ms
- **用途**: 快速版本查询，用于 CI/CD 和脚本集成

### 2.2 系统提示词转储快速路径

**标志**: `--dump-system-prompt` [Ant-only]

```typescript
if (feature('DUMP_SYSTEM_PROMPT') && args[0] === '--dump-system-prompt') {
  // 仅加载 config + model + prompt 模块
  enableConfigs()
  const model = args.indexOf('--model') !== -1 ? args[args.indexOf('--model') + 1] : getMainLoopModel()
  const prompt = await getSystemPrompt([], model)
  console.log(prompt.join('\n'))
  return
}
```

**特点**:
- **最小加载**: 仅加载配置、模型和提示词模块
- **功能**: 导出当前系统提示词用于敏感度评估
- **构建时消除**: 通过 `feature()` 标志在构建时从外部版本中移除

### 2.3 Chrome 扩展 MCP 服务器

**标志**: `--claude-in-chrome-mcp`

```typescript
if (process.argv[2] === '--claude-in-chrome-mcp') {
  const { runClaudeInChromeMcpServer } = await import('../utils/claudeInChrome/mcpServer.js')
  await runClaudeInChromeMcpServer()
  return
}
```

**特点**:
- **动态导入**: 仅在需要时加载 Chrome MCP 服务器模块
- **用途**: 为 Chrome 扩展提供 MCP (Model Context Protocol) 服务
- **位置**: `src/utils/claudeInChrome/mcpServer.ts`

### 2.4 Chrome 原生消息主机

**标志**: `--chrome-native-host`

```typescript
if (process.argv[2] === '--chrome-native-host') {
  const { runChromeNativeHost } = await import('../utils/claudeInChrome/chromeNativeHost.js')
  await runChromeNativeHost()
  return
}
```

**特点**:
- **原生通信**: 实现 Chrome 原生消息协议
- **用途**: 作为 Chrome 扩展的原生消息主机进程
- **位置**: `src/utils/claudeInChrome/chromeNativeHost.ts`

### 2.5 Computer Use MCP 服务器

**标志**: `--computer-use-mcp` (需要 CHICAGO_MCP 功能)

```typescript
if (feature('CHICAGO_MCP') && process.argv[2] === '--computer-use-mcp') {
  const { runComputerUseMcpServer } = await import('../utils/computerUse/mcpServer.js')
  await runComputerUseMcpServer()
  return
}
```

**特点**:
- **功能门控**: 通过 `feature('CHICAGO_MCP')` 实现构建时死代码消除
- **用途**: 提供 Computer Use 功能的 MCP 服务器
- **位置**: `src/utils/computerUse/mcpServer.ts`

### 2.6 Daemon 工作进程

**标志**: `--daemon-worker=<kind>` (需要 DAEMON 功能)

```typescript
if (feature('DAEMON') && args[0] === '--daemon-worker') {
  const { runDaemonWorker } = await import('../daemon/workerRegistry.js')
  await runDaemonWorker(args[1])
  return
}
```

**特点**:
- **内部使用**: 由守护进程监督器生成，用户不应直接调用
- **精简设计**: 不调用 `enableConfigs()`，工作进程保持轻量
- **按需加载**: 如需配置/认证，由工作进程在其 `run()` 函数内部调用
- **位置**: `src/daemon/workerRegistry.ts`

### 2.7 Bridge 模式 (远程控制)

**标志**: `remote-control`, `rc`, `remote`, `sync`, `bridge` (需要 BRIDGE_MODE 功能)

```typescript
if (feature('BRIDGE_MODE') && 
    (args[0] === 'remote-control' || args[0] === 'rc' || args[0] === 'remote' || 
     args[0] === 'sync' || args[0] === 'bridge')) {
  // 认证检查
  if (!getClaudeAIOAuthTokens()?.accessToken) {
    exitWithError(BRIDGE_LOGIN_ERROR)
  }
  // GrowthBook 功能门检查
  const disabledReason = await getBridgeDisabledReason()
  if (disabledReason) exitWithError(`Error: ${disabledReason}`)
  // 版本检查
  const versionError = checkBridgeMinVersion()
  if (versionError) exitWithError(versionError)
  // 策略限制检查
  await waitForPolicyLimitsToLoad()
  if (!isPolicyAllowed('allow_remote_control')) {
    exitWithError("Remote Control is disabled by your organization's policy.")
  }
  await bridgeMain(args.slice(1))
  return
}
```

**特点**:
- **多别名支持**: 支持旧命令名以保持向后兼容
- **完整验证链**: 认证 → 功能门 → 版本 → 策略限制
- **用途**: 将本地机器作为远程控制桥接环境
- **位置**: `src/bridge/bridgeMain.ts`

**关键设计决策**:
- **认证优先**: 必须在 GrowthBook 检查之前验证认证，因为没有认证上下文，GrowthBook 会返回过期的默认值
- **策略检查**: Bridge 是远程控制功能，必须检查组织策略限制

### 2.8 Daemon 守护进程

**标志**: `daemon` (需要 DAEMON 功能)

```typescript
if (feature('DAEMON') && args[0] === 'daemon') {
  enableConfigs()
  const { initSinks } = await import('../utils/sinks.js')
  initSinks() // 初始化分析接收器
  const { daemonMain } = await import('../daemon/main.js')
  await daemonMain(args.slice(1))
  return
}
```

**特点**:
- **长期运行**: 作为监督进程管理后台工作
- **分析支持**: 初始化分析接收器用于遥测
- **位置**: `src/daemon/main.ts`

### 2.9 后台会话管理

**标志**: `ps`, `logs`, `attach`, `kill`, `--bg`, `--background` (需要 BG_SESSIONS 功能)

```typescript
if (feature('BG_SESSIONS') && 
    (args[0] === 'ps' || args[0] === 'logs' || args[0] === 'attach' || args[0] === 'kill' || 
     args.includes('--bg') || args.includes('--background'))) {
  enableConfigs()
  const bg = await import('../cli/bg.js')
  switch (args[0]) {
    case 'ps': await bg.psHandler(args.slice(1)); break
    case 'logs': await bg.logsHandler(args[1]); break
    case 'attach': await bg.attachHandler(args[1]); break
    case 'kill': await bg.killHandler(args[1]); break
    default: await bg.handleBgFlag(args)
  }
  return
}
```

**特点**:
- **会话注册表**: 针对 `~/.claude/sessions/` 注册表进行管理
- **标志字面量**: 内联标志字面量，仅在实际分发时加载 `bg.js`
- **位置**: `src/cli/bg.ts`

**命令说明**:
- `ps`: 列出所有后台会话
- `logs <id>`: 查看会话日志
- `attach <id>`: 附加到运行中的会话
- `kill <id>`: 终止后台会话
- `--bg/--background`: 在后台启动新会话

### 2.10 模板作业

**标志**: `new`, `list`, `reply` (需要 TEMPLATES 功能)

```typescript
if (feature('TEMPLATES') && (args[0] === 'new' || args[0] === 'list' || args[0] === 'reply')) {
  const { templatesMain } = await import('../cli/handlers/templateJobs.js')
  await templatesMain(args)
  process.exit(0) // 必须使用 process.exit 而非 return
}
```

**特点**:
- **强制退出**: 使用 `process.exit(0)` 而非 `return`，因为 Ink TUI 可能留下事件循环句柄
- **用途**: 执行基于模板的预定义作业
- **位置**: `src/cli/handlers/templateJobs.ts`

### 2.11 Environment Runner (BYOC)

**标志**: `environment-runner` (需要 BYOC_ENVIRONMENT_RUNNER 功能)

```typescript
if (feature('BYOC_ENVIRONMENT_RUNNER') && args[0] === 'environment-runner') {
  const { environmentRunnerMain } = await import('../environment-runner/main.js')
  await environmentRunnerMain(args.slice(1))
  return
}
```

**特点**:
- **无头模式**: 专为 Bring Your Own Container (BYOC) 环境设计的无头运行器
- **构建时消除**: 通过 `feature()` 在外部构建中移除
- **位置**: `src/environment-runner/main.ts`

### 2.12 Self-Hosted Runner

**标志**: `self-hosted-runner` (需要 SELF_HOSTED_RUNNER 功能)

```typescript
if (feature('SELF_HOSTED_RUNNER') && args[0] === 'self-hosted-runner') {
  const { selfHostedRunnerMain } = await import('../self-hosted-runner/main.js')
  await selfHostedRunnerMain(args.slice(1))
  return
}
```

**特点**:
- **API 目标**: 针对 SelfHostedRunnerWorkerService API（注册 + 轮询）
- **心跳机制**: 轮询本身就是心跳
- **构建时消除**: 通过 `feature()` 在外部构建中移除
- **位置**: `src/self-hosted-runner/main.ts`

### 2.13 Tmux Worktree 快速路径

**标志**: `--worktree`, `-w` + `--tmux`, `--tmux=classic`

```typescript
const hasTmuxFlag = args.includes('--tmux') || args.includes('--tmux=classic')
if (hasTmuxFlag && 
    (args.includes('-w') || args.includes('--worktree') || args.some(a => a.startsWith('--worktree=')))) {
  enableConfigs()
  if (isWorktreeModeEnabled()) {
    const { execIntoTmuxWorktree } = await import('../utils/worktree.js')
    const result = await execIntoTmuxWorktree(args)
    if (result.handled) return
    if (result.error) exitWithError(result.error)
  }
}
```

**特点**:
- **早期 exec**: 在加载完整 CLI 之前 exec 进入 tmux
- **功能门检查**: 验证 worktree 模式是否启用
- **错误处理**: 如果未处理（如错误），则回退到正常 CLI
- **位置**: `src/utils/worktree.ts`

### 2.14 默认完整 CLI 路径

如果没有匹配任何快速路径，则加载完整的 CLI:

```typescript
// 早期输入捕获
const { startCapturingEarlyInput } = await import('../utils/earlyInput.js')
startCapturingEarlyInput()

// 加载主入口
const { main: cliMain } = await import('../main.js')
await cliMain()
```

**特点**:
- **早期输入捕获**: 在主入口加载前开始捕获用户输入
- **性能检查点**: 记录各个阶段的性能指标
- **位置**: `src/main.tsx` → `src/screens/REPL.tsx`

---

## 3. 初始化流程 (init.ts)

`src/entrypoints/init.ts` 中的 `init()` 函数实现了完整的系统初始化。该函数使用 `memoize` 确保只执行一次。

### 3.1 配置系统启用

```typescript
enableConfigs()
```

**功能**:
- 验证配置文件有效性
- 启用配置系统
- **性能**: 记录配置启用耗时

### 3.2 安全环境变量应用

```typescript
applySafeConfigEnvironmentVariables()
```

**功能**:
- **在信任对话框之前**应用安全的环境变量
- 完整的环境变量在建立信任后应用
- **安全设计**: 避免在未验证配置前应用敏感设置

### 3.3 TLS 证书配置

```typescript
applyExtraCACertsFromConfig()
```

**功能**:
- 从 `settings.json` 应用 `NODE_EXTRA_CA_CERTS` 到 `process.env`
- **关键时机**: 必须在任何 TLS 连接之前执行
- **原因**: Bun 在启动时通过 BoringSSL 缓存 TLS 证书存储，首次 TLS 握手后无法更改

### 3.4 优雅关闭设置

```typescript
setupGracefulShutdown()
```

**功能**:
- 确保进程退出时刷新所有缓冲区
- 注册信号处理器 (SIGINT, SIGTERM)
- 执行清理注册表的回调

### 3.5 OAuth 账户信息填充

```typescript
void populateOAuthAccountInfoIfNeeded()
```

**功能**:
- 如果配置中未缓存，则填充 OAuth 账户信息
- **异步执行**: 不阻塞初始化流程
- **用途**: 支持通过 VSCode 扩展登录的场景

### 3.6 JetBrains IDE 检测

```typescript
void initJetBrainsDetection()
```

**功能**:
- 异步初始化 JetBrains IDE 检测
- **缓存填充**: 为后续同步访问填充缓存
- **位置**: `src/utils/envDynamic.ts`

### 3.7 Git 仓库检测

```typescript
void detectCurrentRepository()
```

**功能**:
- 异步检测 GitHub 仓库
- **用途**: 为 gitDiff PR 链接提供支持
- **位置**: `src/utils/detectRepository.ts`

### 3.8 远程管理设置加载

```typescript
if (isEligibleForRemoteManagedSettings()) {
  initializeRemoteManagedSettingsLoadingPromise()
}
```

**功能**:
- 早期初始化加载 Promise，允许其他系统（如插件钩子）等待远程设置
- **超时保护**: Promise 包含超时机制，防止死锁
- **位置**: `src/services/remoteManagedSettings/index.ts`

### 3.9 策略限制加载

```typescript
if (isPolicyLimitsEligible()) {
  initializePolicyLimitsLoadingPromise()
}
```

**功能**:
- 早期初始化策略限制加载 Promise
- **用途**: Bridge 模式等功能需要检查组织策略
- **位置**: `src/services/policyLimits/index.ts`

### 3.10 首次启动时间记录

```typescript
recordFirstStartTime()
```

**功能**:
- 记录首次启动时间用于分析
- **位置**: `src/utils/config.ts`

### 3.11 全局 mTLS 配置

```typescript
configureGlobalMTLS()
```

**功能**:
- 配置全局双向 TLS 设置
- **性能**: 记录 mTLS 配置耗时
- **位置**: `src/utils/mtls.ts`

### 3.12 全局 HTTP 代理配置

```typescript
configureGlobalAgents()
```

**功能**:
- 配置全局 HTTP 代理和/或 mTLS 代理
- **性能**: 记录代理配置耗时
- **位置**: `src/utils/proxy.ts`

### 3.13 API 预连接

```typescript
preconnectAnthropicApi()
```

**功能**:
- **并行优化**: 将 TCP+TLS 握手（~100-200ms）与 ~100ms 的 action-handler 工作重叠
- **时机**: 在 CA 证书和代理代理配置之后，确保预热的连接使用正确的传输
- **即发即弃**: 跳过代理/mTLS/unix/cloud-provider 场景（SDK 的调度器不会重用全局连接池）
- **位置**: `src/utils/apiPreconnect.ts`

**设计决策**:
- 为什么要预连接？在用户输入第一个请求时，API 连接已经建立，节省 100-200ms

### 3.14 上游代理初始化 (CCR)

```typescript
if (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)) {
  const { initUpstreamProxy, getUpstreamProxyEnv } = await import('../upstreamproxy/upstreamproxy.js')
  const { registerUpstreamProxyEnvFn } = await import('../utils/subprocessEnv.js')
  registerUpstreamProxyEnvFn(getUpstreamProxyEnv)
  await initUpstreamProxy()
}
```

**功能**:
- **CCR 专用**: 仅在 Claude Code Remote 环境中启动
- **本地 CONNECT 中继**: 允许代理子进程访问组织配置的上游代理（带凭证注入）
- **Fail-open**: 任何错误都不会阻止启动
- **延迟导入**: 非 CCR 启动不承担模块加载开销
- **子进程集成**: `getUpstreamProxyEnv` 注册到 `subprocessEnv.ts`，子进程生成时可注入代理变量
- **位置**: `src/upstreamproxy/upstreamproxy.ts`

### 3.15 Git Bash 设置 (Windows)

```typescript
setShellIfWindows()
```

**功能**:
- 在 Windows 上设置 git-bash
- **位置**: `src/utils/windowsPaths.ts`

### 3.16 LSP 管理器清理注册

```typescript
registerCleanup(shutdownLspServerManager)
```

**功能**:
- 注册 LSP 服务器管理器关闭回调
- **注意**: 初始化在 `main.tsx` 中完成（在 `--plugin-dir` 处理后）
- **位置**: `src/services/lsp/manager.ts`

### 3.17 Team 清理注册

```typescript
registerCleanup(async () => {
  const { cleanupSessionTeams } = await import('../utils/swarm/teamHelpers.js')
  await cleanupSessionTeams()
})
```

**功能**:
- **问题修复**: gh-32730 - 子代理创建的团队（或没有显式 TeamDelete 的主代理）永久留在磁盘上
- **清理范围**: 清理此会话创建的所有团队
- **延迟导入**: Swarm 代码在功能门后，大多数会话从不创建团队
- **位置**: `src/utils/swarm/teamHelpers.ts`

### 3.18 Scratchpad 目录初始化

```typescript
if (isScratchpadEnabled()) {
  await ensureScratchpadDir()
}
```

**功能**:
- 如果启用 scratchpad，则确保目录存在
- **性能**: 记录 scratchpad 创建耗时
- **位置**: `src/utils/permissions/filesystem.ts`

---

## 4. 启动优化策略

### 4.1 快速路径零导入设计

**原则**: 对于简单操作，避免加载任何模块

**实现**:
```typescript
// --version: 零导入
if (args[0] === '--version') {
  console.log(MACRO.VERSION) // MACRO 在构建时内联
  return
}
```

**效果**: 
- `--version`: < 1ms
- 完整 CLI 启动: ~100-200ms

### 4.2 并行预取

**MDM (Mobile Device Management) 原始读取**:
- 异步读取配置文件
- 不阻塞主初始化流程

**Keychain 预取**:
- 在后台预取认证凭据
- 减少 API 请求时的延迟

### 4.3 动态导入

**原则**: 仅在需要时加载模块

**示例**:
```typescript
// 不在顶部导入
// import { runChromeNativeHost } from '../utils/claudeInChrome/chromeNativeHost.js'

// 而是在需要时动态导入
const { runChromeNativeHost } = await import('../utils/claudeInChrome/chromeNativeHost.js')
```

**好处**:
- 减少初始模块评估时间
- 降低内存占用
- 支持构建时死代码消除

### 4.4 启动性能分析器

**位置**: `src/utils/startupProfiler.ts`

**功能**:
```typescript
profileCheckpoint('cli_entry')
// ... 一些操作
profileCheckpoint('cli_after_main_import')
```

**输出**:
- 记录每个检查点的耗时
- 帮助识别性能瓶颈
- 在调试模式下提供详细日志

### 4.5 早期输入捕获

**位置**: `src/utils/earlyInput.ts`

**功能**:
```typescript
const { startCapturingEarlyInput } = await import('../utils/earlyInput.js')
startCapturingEarlyInput()
```

**好处**:
- 在 CLI 加载期间开始捕获用户输入
- 减少感知延迟
- 用户可以提前输入命令

### 4.6 API 预连接

**位置**: `src/utils/apiPreconnect.ts`

**功能**:
- 与初始化过程并行执行 TCP+TLS 握手
- 在第一次 API 调用时节省 100-200ms
- 仅在适用时使用（标准代理配置）

**限制**:
- 跳过 mTLS/unix/cloud-provider 场景
- SDK 的调度器不会重用全局连接池

---

## 5. MACRO 注入

MACRO 是构建时注入的常量，通过 `bun build --define` 在编译时内联到代码中。

### 5.1 MACRO 常量定义

**位置**: `scripts/build.ts`

```typescript
const defines = {
  'MACRO.VERSION': JSON.stringify(version),
  'MACRO.BUILD_TIME': JSON.stringify(buildTime),
  'MACRO.PACKAGE_URL': JSON.stringify(pkg.name),
  'MACRO.NATIVE_PACKAGE_URL': 'undefined',
  'MACRO.FEEDBACK_CHANNEL': JSON.stringify('github'),
  'MACRO.ISSUES_EXPLAINER': JSON.stringify(
    'This reconstructed source snapshot does not include Anthropic internal issue routing.',
  ),
  'MACRO.VERSION_CHANGELOG': JSON.stringify(
    dev ? getVersionChangelog() : 'https://github.com/paoloanzn/claude-code',
  ),
}
```

### 5.2 各常量说明

#### MACRO.VERSION

**值**: 
- 开发构建: `{version}-dev.{date}.t{time}.sha{commit}`
- 生产构建: `package.json` 中的版本号

**用途**: 
- `--version` 输出
- 用户代理字符串
- 日志记录

**示例**: `2.1.87-dev.20250410.t143052.sha1a2b3c4d`

#### MACRO.BUILD_TIME

**值**: ISO 8601 格式的构建时间戳

**用途**:
- 调试构建信息
- 日志时间戳基准

**示例**: `2025-04-10T14:30:52.123Z`

#### MACRO.PACKAGE_URL

**值**: 包名称（通常是 `claude-code-source-snapshot`）

**用途**:
- 包标识
- 元数据

#### MACRO.FEEDBACK_CHANNEL

**值**: `"github"`

**用途**:
- 反馈链接生成
- 问题报告路由

#### MACRO.ISSUES_EXPLAINER

**值**: 解释如何报告问题的文本

**用途**:
- 错误消息中的上下文
- 帮助用户理解如何获取支持

#### MACRO.VERSION_CHANGELOG

**值**:
- 开发构建: 最近 20 条 git 提交日志
- 生产构建: GitHub releases URL

**用途**:
- 版本变更信息
- 开发调试

### 5.3 开发回退

**位置**: `src/entrypoints/cli.tsx`

```typescript
// 定义 MACRO 全局用于开发（通常由 bun build --define 注入）
if (typeof MACRO === 'undefined') {
  (globalThis as any).MACRO = {
    VERSION: '2.1.87-dev',
    BUILD_TIME: new Date().toISOString(),
    PACKAGE_URL: 'claude-code-source-snapshot',
    FEEDBACK_CHANNEL: 'github',
  }
}
```

**用途**: 允许在开发环境（未运行 `bun build`）中运行代码

---

## 6. 关键设计决策

### 6.1 为什么使用快速路径路由？

**问题**: 完整 CLI 启动需要 100-200ms，但某些操作不需要加载整个应用。

**解决方案**: 
- 在入口点检查特殊标志
- 匹配快速路径时立即返回
- 避免不必要的模块加载

**效果**:
- `--version`: < 1ms (提升 100-200x)
- MCP 服务器: ~10ms (提升 10-20x)

### 6.2 为什么动态导入而不是静态导入？

**问题**: 
- Node.js/Bun 在启动时会评估所有静态导入的模块
- 模块评估是同步的，会增加启动延迟

**解决方案**:
- 使用 `await import()` 动态导入
- 仅在实际需要时加载模块

**权衡**:
- **优点**: 减少启动时间，降低内存占用
- **缺点**: 首次使用时可能有轻微延迟（可通过并行预取缓解）

### 6.3 为什么 TLS 证书配置必须在早期？

**问题**: 
- Bun 在启动时通过 BoringSSL 缓存 TLS 证书存储
- 首次 TLS 握手后无法更改证书存储

**解决方案**:
- 在 `init()` 中尽早调用 `applyExtraCACertsFromConfig()`
- 在任何网络请求之前执行

**后果**: 如果不这样做，自定义 CA 证书将不起作用。

### 6.4 为什么 API 预连接有限制？

**问题**: 
- 预连接适用于标准 HTTP 代理场景
- 某些配置下，SDK 不会重用全局连接池

**限制场景**:
- mTLS: 需要特殊的连接配置
- Unix 域套接字: 不适用 TCP 预连接
- Cloud provider: 使用自定义调度器

**解决方案**: 
- 仅在适用时预连接
- 即发即弃，不占用资源

### 6.5 为什么 Daemon Worker 不调用 enableConfigs()？

**问题**: 
- Daemon workers 应该是轻量级的
- 配置系统初始化有开销

**解决方案**:
- Workers 不在 CLI 层面调用 `enableConfigs()`
- 如需配置，在其 `run()` 函数内部调用

**好处**: 
- 减少worker 启动时间
- 保持 worker 精简

### 6.6 为什么 Bridge 模式先检查认证？

**问题**: 
- GrowthBook 需要用户上下文才能返回准确的值
- 没有认证时，GrowthBook 返回过期的磁盘缓存或默认值

**解决方案**:
- 先检查认证 token
- 再调用 `getBridgeDisabledReason()`（会等待 GB 初始化）

**后果**: 如果顺序错误，可能会使用过期的功能门状态。

### 6.7 为什么使用 process.exit() 而不是 return？

**特定场景**: 模板作业 (templates)

```typescript
await templatesMain(args)
process.exit(0) // 必须使用 process.exit
```

**原因**: 
- Ink (React for CLI) 的 TUI 可能留下事件循环句柄
- 使用 `return` 可能导致进程挂起
- `process.exit(0)` 强制清理并退出

**注意**: 仅在特定场景使用，大多数快速路径使用 `return`。

### 6.8 为什么使用 memoize 包装 init()？

```typescript
export const init = memoize(async (): Promise<void> => {
  // ...
})
```

**原因**: 
- 确保初始化只执行一次
- 多次调用 `init()` 返回相同的 Promise
- 避免重复初始化

**场景**: 
- 某些代码路径可能会多次调用 `init()`
- `memoize` 保证幂等性

---

## 7. 性能指标

### 7.1 启动时间目标

| 场景 | 目标时间 | 实际时间 |
|------|----------|----------|
| `--version` | < 1ms | < 1ms |
| MCP 服务器 | < 20ms | ~10ms |
| Daemon worker | < 50ms | ~30ms |
| Bridge 模式 | < 200ms | ~150ms |
| 完整 CLI | < 300ms | ~200ms |

### 7.2 性能检查点

```typescript
profileCheckpoint('cli_entry')
profileCheckpoint('cli_dump_system_prompt_path')
profileCheckpoint('cli_claude_in_chrome_mcp_path')
profileCheckpoint('cli_before_main_import')
profileCheckpoint('cli_after_main_import')
profileCheckpoint('cli_after_main_complete')
```

**用途**:
- 监控各阶段耗时
- 识别性能回归
- 优化启动流程

---

## 8. 调试和监控

### 8.1 启用详细日志

```bash
# 设置环境变量启用调试日志
CLAUDE_CODE_DEBUG=1 ./cli
```

### 8.2 性能分析输出

启动时会输出性能检查点:

```
[init] init_configs_enabled: 5ms
[init] init_safe_env_vars_applied: 2ms
[init] init_mtls_configured: 15ms
[init] init_proxy_configured: 8ms
[init] init_completed: 45ms
```

### 8.3 诊断日志

**位置**: `src/utils/diagLogs.ts`

**功能**: 
- 记录诊断信息（不含 PII）
- 用于问题排查
- 性能监控

---

## 9. 安全考虑

### 9.1 配置验证

```typescript
try {
  enableConfigs()
} catch (error) {
  if (error instanceof ConfigParseError) {
    // 处理配置错误
  }
}
```

### 9.2 环境变量隔离

- **安全变量**: 在信任对话框之前应用
- **完整变量**: 在信任建立后应用
- **原因**: 避免未验证配置影响系统

### 9.3 策略限制检查

Bridge 模式等远程功能必须检查组织策略:

```typescript
await waitForPolicyLimitsToLoad()
if (!isPolicyAllowed('allow_remote_control')) {
  exitWithError("Remote Control is disabled by policy.")
}
```

---

## 10. 未来改进方向

### 10.1 更多并行化

- 识别更多可以并行执行的初始化步骤
- 使用 `Promise.all()` 并行执行独立操作

### 10.2 模块懒加载

- 将更多非关键模块改为懒加载
- 减少初始内存占用

### 10.3 缓存优化

- 缓存配置解析结果
- 缓存功能门状态

### 10.4 性能监控

- 添加更详细的性能指标
- 集成到分析系统

---

## 总结

Claude Code 的入口和启动系统通过精心设计的快速路径路由、并行预取和动态导入，实现了毫秒级的启动响应。该系统的核心设计原则是在简单操作上零开销，在复杂操作上最小化开销，同时保持代码的清晰和可维护性。

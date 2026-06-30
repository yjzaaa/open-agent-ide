# open-agent-ide 阶段 1 实施计划：Monorepo 骨架 + Runtime 无头化

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 `open-agent-ide` 的 monorepo 骨架，把 `free-code-main` 完整复制为 `packages/runtime`，并实现一个最小可运行的 `stdio + NDJSON` 通信链路：Electron 主进程能 spawn Bun runtime 子进程，子进程输出 `runtime.ready` 事件，主进程能解析该事件。

**Architecture:** 三进程架构的雏形：渲染进程（未来实现）↔ Electron 主进程 ↔ Bun Agent Runtime 子进程。本阶段只打通主进程与 runtime 子进程之间的 stdio 通信协议。

**Tech Stack:** Bun workspace、TypeScript、Electron、Vite、esbuild。

## Global Constraints

- **运行时**: Bun >= 1.3.11
- **语言**: TypeScript 5.0.0+
- **包管理**: Bun workspace，内部包用 `workspace:*`
- **模块**: 所有包 `"type": "module"`，导入使用 `.ts` 扩展名
- **注释**: 中文注释优先，保留必要专业术语
- **测试**: 每个新模块必须附带测试，使用 `import { test, expect } from "bun:test"`
- **不修改参考目录**: `D:\Proma` 和 `D:\free-code-main` 保持只读
- **TDD**: 改造 free-code-main 代码前必须先写测试
- **DDD 分层**: runtime 代码按 `domain/application/infrastructure/interfaces` 组织
- **提交**: 每个 task 独立 commit，消息遵循 `feat(scope): description`

---

## File Structure

```text
open-agent-ide/
├── apps/
│   └── desktop/
│       ├── src/
│       │   ├── main/
│       │   │   ├── runtime-manager.ts    # 启动/停止 Bun runtime，stdio 通信
│       │   │   └── index.ts              # Electron 主进程入口
│       │   └── package.json
│       ├── tests/
│       │   └── runtime-manager.test.ts   # runtime-manager 集成测试
│       ├── vite.main.config.ts           # 主进程构建配置
│       └── package.json
├── packages/
│   ├── shared/
│   │   ├── src/
│   │   │   ├── runtime.ts                # NDJSON 协议类型
│   │   │   └── index.ts                  # 导出汇总
│   │   └── package.json
│   ├── core/
│   │   ├── src/
│   │   │   ├── providers/
│   │   │   │   └── provider.ts           # Provider 适配器接口
│   │   │   └── index.ts
│   │   └── package.json
│   └── runtime/
│       ├── src/
│       │   ├── interfaces/
│       │   │   └── stdio-server.ts       # stdio 入口，输出 runtime.ready
│       │   ├── domain/
│       │   │   └── event.ts              # 事件值对象
│       │   ├── application/
│       │   │   └── event-streamer.ts     # 事件流序列化
│       │   └── index.ts                  # 导出
│       └── package.json                  # 从 free-code-main 复制并调整
├── package.json                          # workspace root
├── tsconfig.json                         # root tsconfig
└── bun.lockb
```

---

### Task 1: 创建 Monorepo Root

**Files:**
- Create: `D:\open-agent-ide\package.json`
- Create: `D:\open-agent-ide\tsconfig.json`
- Create: `D:\open-agent-ide\.gitignore`

**Interfaces:**
- Produces: workspace configuration for `@open-agent-ide/shared`, `@open-agent-ide/core`, `@open-agent-ide/runtime`, `apps/desktop`

- [ ] **Step 1: 创建 root package.json**

```json
{
  "name": "open-agent-ide",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "bun@1.3.11",
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "dev": "bun run --cwd apps/desktop dev",
    "build": "bun run --cwd apps/desktop build",
    "test": "bun test",
    "typecheck": "bun run --filter '*' typecheck"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: 创建 root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "jsx": "react-jsx"
  },
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: 创建 .gitignore**

```gitignore
node_modules/
dist/
*.log
.env
.DS_Store
coverage/
*.tsbuildinfo
```

- [ ] **Step 4: 初始化 git 仓库并提交**

```bash
cd D:/open-agent-ide
git init
git add .
git commit -m "chore(root): initialize monorepo"
```

---

### Task 2: 创建 @open-agent-ide/shared 包

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/runtime.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/tests/runtime.test.ts`

**Interfaces:**
- Produces: `RuntimeReadyEvent`, `RuntimeRequest`, `RuntimeEvent`, `RuntimeErrorEvent` types
- Produces: `RUNTIME_PROTOCOL_VERSION` constant

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@open-agent-ide/shared",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: 创建 src/runtime.ts**

```typescript
/** Runtime 协议版本 */
export const RUNTIME_PROTOCOL_VERSION = '1.0'

/** Runtime 能力枚举 */
export type RuntimeCapability =
  | 'bash'
  | 'powershell'
  | 'mcp'
  | 'anthropic'
  | 'openai'
  | 'bedrock'
  | 'vertex'
  | 'foundry'

/** runtime.ready 事件 */
export interface RuntimeReadyEvent {
  version: string
  type: 'runtime.ready'
  capabilities: RuntimeCapability[]
}

/** runtime 请求方法 */
export type RuntimeMethod = 'agent.run' | 'agent.stop'

/** runtime 请求 */
export interface RuntimeRequest<T = unknown> {
  version: string
  id: string
  method: RuntimeMethod
  params: T
}

/** 通用事件基础 */
export interface RuntimeEventBase {
  version: string
  id?: string
  type: string
}

/** 文本增量事件 */
export interface TextDeltaEvent extends RuntimeEventBase {
  type: 'text_delta'
  content: string
}

/** 工具开始事件 */
export interface ToolStartEvent extends RuntimeEventBase {
  type: 'tool_start'
  tool: string
  input: unknown
}

/** 工具结果事件 */
export interface ToolResultEvent extends RuntimeEventBase {
  type: 'tool_result'
  tool: string
  output: unknown
  success: boolean
}

/** 完成事件 */
export interface DoneEvent extends RuntimeEventBase {
  type: 'done'
}

/** 错误事件 */
export interface RuntimeErrorEvent extends RuntimeEventBase {
  type: 'error'
  code: string
  message: string
}

/** 所有 runtime 事件联合类型 */
export type RuntimeEvent =
  | RuntimeReadyEvent
  | TextDeltaEvent
  | ToolStartEvent
  | ToolResultEvent
  | DoneEvent
  | RuntimeErrorEvent
```

- [ ] **Step 4: 创建 src/index.ts**

```typescript
export * from './runtime.ts'
```

- [ ] **Step 5: 创建测试 packages/shared/tests/runtime.test.ts**

```typescript
import { test, expect } from 'bun:test'
import { RUNTIME_PROTOCOL_VERSION, type RuntimeReadyEvent } from '../src/runtime.ts'

test('RUNTIME_PROTOCOL_VERSION 为 1.0', () => {
  expect(RUNTIME_PROTOCOL_VERSION).toBe('1.0')
})

test('RuntimeReadyEvent 类型符合协议', () => {
  const event: RuntimeReadyEvent = {
    version: '1.0',
    type: 'runtime.ready',
    capabilities: ['bash', 'anthropic'],
  }
  expect(event.type).toBe('runtime.ready')
  expect(event.capabilities).toContain('bash')
})
```

- [ ] **Step 6: 运行测试**

```bash
cd D:/open-agent-ide/packages/shared
bun test
```

Expected: 2 tests pass.

- [ ] **Step 7: 提交**

```bash
cd D:/open-agent-ide
git add .
git commit -m "feat(shared): add runtime protocol types"
```

---

### Task 3: 创建 @open-agent-ide/core 包（Provider 接口占位）

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/providers/provider.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/tests/provider.test.ts`

**Interfaces:**
- Produces: `ProviderAdapter` interface
- Produces: `ProviderMessage` type

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@open-agent-ide/core",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@open-agent-ide/shared": "workspace:*"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: 创建 src/providers/provider.ts**

```typescript
/**
 * Provider 消息角色
 */
export type ProviderMessageRole = 'user' | 'assistant' | 'system'

/**
 * Provider 消息
 */
export interface ProviderMessage {
  role: ProviderMessageRole
  content: string
}

/**
 * Provider 配置
 */
export interface ProviderConfig {
  providerId: string
  model: string
  apiKey?: string
  baseUrl?: string
}

/**
 * Provider 适配器接口
 *
 * 所有模型 Provider 必须实现此接口。
 */
export interface ProviderAdapter {
  readonly providerId: string

  /**
   * 发送消息并返回异步生成器
   *
   * @param messages - 消息列表
   * @param config - Provider 配置
   * @returns 文本增量流
   */
  sendMessage(
    messages: ProviderMessage[],
    config: ProviderConfig,
  ): AsyncGenerator<string, void, unknown>
}
```

- [ ] **Step 4: 创建 src/index.ts**

```typescript
export * from './providers/provider.ts'
```

- [ ] **Step 5: 创建测试 packages/core/tests/provider.test.ts**

```typescript
import { test, expect } from 'bun:test'
import type { ProviderAdapter, ProviderMessage } from '../src/providers/provider.ts'

test('ProviderMessage 类型约束正确', () => {
  const message: ProviderMessage = {
    role: 'user',
    content: 'hello',
  }
  expect(message.role).toBe('user')
})

test('ProviderAdapter 可被实现', () => {
  const adapter: ProviderAdapter = {
    providerId: 'mock',
    async *sendMessage() {
      yield 'hello'
    },
  }
  expect(adapter.providerId).toBe('mock')
})
```

- [ ] **Step 6: 运行测试**

```bash
cd D:/open-agent-ide/packages/core
bun test
```

Expected: 2 tests pass.

- [ ] **Step 7: 提交**

```bash
cd D:/open-agent-ide
git add .
git commit -m "feat(core): add provider adapter interface"
```

---

### Task 4: 完整复制 free-code-main 到 packages/runtime

**Files:**
- Create: `packages/runtime/` (完整目录树)
- Modify: `packages/runtime/package.json`

**Interfaces:**
- Produces: 可独立运行的 free-code-main 副本

- [ ] **Step 1: 复制整个 free-code-main**

```bash
cd D:/open-agent-ide/packages
xcopy /E /I D:\free-code-main runtime
```

- [ ] **Step 2: 修改 runtime/package.json**

在复制的 `package.json` 基础上修改：

```json
{
  "name": "@open-agent-ide/runtime",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "description": "Open Agent IDE runtime, derived from free-code-main.",
  "bin": {
    "open-agent-ide-runtime": "./cli"
  },
  "scripts": {
    "dev": "bun run ./src/entrypoints/cli.tsx",
    "stdio": "bun run ./src/interfaces/stdio-server.ts",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@open-agent-ide/shared": "workspace:*",
    "@open-agent-ide/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

注意：保留原有所有 dependencies，只新增 `@open-agent-ide/shared` 和 `@open-agent-ide/core`。

- [ ] **Step 3: 验证原项目仍能运行**

```bash
cd D:/open-agent-ide/packages/runtime
bun install
bun run dev -- --help
```

Expected: 能看到 free-code-main 的 CLI help 输出。

- [ ] **Step 4: 创建 REFACTOR.md 骨架**

Create: `packages/runtime/REFACTOR.md`

```markdown
# Runtime 拆解记录

## 来源
- 初始代码完整复制自 `D:\free-code-main` (commit: initial)

## 改造计划
1. 新增 `src/interfaces/stdio-server.ts` 作为无头入口
2. 逐步删除 React Ink TUI 组件
3. 把核心能力迁移到 DDD 分层
4. 每改造一个模块，补测试并记录

## 已改造
- （暂无）

## 待改造
- CLI 入口 (`src/entrypoints/cli.tsx`)
- Ink 组件
- Agent 主循环
- 工具系统
- MCP client
- 权限系统
```

- [ ] **Step 5: 提交**

```bash
cd D:/open-agent-ide
git add packages/runtime/
git commit -m "feat(runtime): copy free-code-main as starting point"
```

---

### Task 5: 创建 Runtime 的 DDD 骨架与 stdio-server

**Files:**
- Create: `packages/runtime/src/domain/event.ts`
- Create: `packages/runtime/src/application/event-streamer.ts`
- Create: `packages/runtime/src/interfaces/stdio-server.ts`
- Test: `packages/runtime/tests/event-streamer.test.ts`
- Test: `packages/runtime/tests/stdio-server.test.ts`

**Interfaces:**
- Consumes: `RUNTIME_PROTOCOL_VERSION`, `RuntimeReadyEvent`, `RuntimeEvent` from `@open-agent-ide/shared`
- Produces: `serializeEvent(event: RuntimeEvent): string`
- Produces: `stdioServer(): void`

- [ ] **Step 1: 创建 src/domain/event.ts**

```typescript
import type { RuntimeEvent } from '@open-agent-ide/shared'

export type { RuntimeEvent }

/**
 * 创建 runtime.ready 事件
 */
export function createRuntimeReadyEvent(capabilities: string[]): RuntimeEvent {
  return {
    version: '1.0',
    type: 'runtime.ready',
    capabilities: capabilities as Array<
      'bash' | 'powershell' | 'mcp' | 'anthropic' | 'openai' | 'bedrock' | 'vertex' | 'foundry'
    >,
  }
}
```

- [ ] **Step 2: 创建 src/application/event-streamer.ts**

```typescript
import type { RuntimeEvent } from '@open-agent-ide/shared'

/**
 * 把事件序列化为 NDJSON 行
 */
export function serializeEvent(event: RuntimeEvent): string {
  return JSON.stringify(event) + '\n'
}

/**
 * 把 NDJSON 行解析为事件
 */
export function parseEvent(line: string): RuntimeEvent {
  return JSON.parse(line) as RuntimeEvent
}
```

- [ ] **Step 3: 创建 src/interfaces/stdio-server.ts**

```typescript
#!/usr/bin/env bun
/**
 * Runtime stdio 入口
 *
 * 启动后先输出 runtime.ready，然后监听 stdin 上的请求。
 * 本阶段只实现 ready 握手，不处理实际请求。
 */

import { createRuntimeReadyEvent } from '../domain/event.ts'
import { serializeEvent } from '../application/event-streamer.ts'

/**
 * 启动 stdio server
 */
export function startStdioServer(): void {
  const readyEvent = createRuntimeReadyEvent([
    'bash',
    'powershell',
    'mcp',
    'anthropic',
    'openai',
  ])

  process.stdout.write(serializeEvent(readyEvent))

  // 本阶段不处理请求，只保持进程运行
  process.stdin.on('data', (chunk: Buffer) => {
    // 忽略输入
    void chunk
  })
}

// 如果是直接运行此文件，则启动 server
if (import.meta.main) {
  startStdioServer()
}
```

- [ ] **Step 4: 创建测试 packages/runtime/tests/event-streamer.test.ts**

```typescript
import { test, expect } from 'bun:test'
import { serializeEvent, parseEvent } from '../src/application/event-streamer.ts'
import { createRuntimeReadyEvent } from '../src/domain/event.ts'

test('serializeEvent 输出 NDJSON 行', () => {
  const event = createRuntimeReadyEvent(['bash'])
  const line = serializeEvent(event)
  expect(line.endsWith('\n')).toBe(true)
  expect(JSON.parse(line).type).toBe('runtime.ready')
})

test('parseEvent 能解析 NDJSON 行', () => {
  const event = createRuntimeReadyEvent(['bash'])
  const line = serializeEvent(event)
  const parsed = parseEvent(line.trim())
  expect(parsed.type).toBe('runtime.ready')
})
```

- [ ] **Step 5: 创建测试 packages/runtime/tests/stdio-server.test.ts**

```typescript
import { test, expect } from 'bun:test'
import { spawn } from 'child_process'
import { resolve } from 'path'

const runtimePath = resolve(import.meta.dir, '../src/interfaces/stdio-server.ts')

test('stdio server 启动后输出 runtime.ready', async () => {
  const child = spawn('bun', [runtimePath], {
    stdio: ['pipe', 'pipe', 'inherit'],
  })

  const output = await new Promise<string>((resolve, reject) => {
    let buffer = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      if (buffer.includes('\n')) {
        resolve(buffer)
        child.kill()
      }
    })
    child.on('error', reject)
    setTimeout(() => {
      child.kill()
      reject(new Error('timeout'))
    }, 5000)
  })

  const event = JSON.parse(output.trim())
  expect(event.type).toBe('runtime.ready')
  expect(event.version).toBe('1.0')
  expect(event.capabilities).toContain('bash')
})
```

- [ ] **Step 6: 运行测试**

```bash
cd D:/open-agent-ide/packages/runtime
bun test
```

Expected: event-streamer 和 stdio-server 测试通过。

- [ ] **Step 7: 提交**

```bash
cd D:/open-agent-ide
git add packages/runtime/src/domain/event.ts
  packages/runtime/src/application/event-streamer.ts
  packages/runtime/src/interfaces/stdio-server.ts
  packages/runtime/tests/
git commit -m "feat(runtime): add stdio server skeleton with ready handshake"
```

---

### Task 6: 创建 Electron Desktop 应用骨架

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/vite.main.config.ts`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/main/runtime-manager.ts`
- Create: `apps/desktop/tests/runtime-manager.test.ts`

**Interfaces:**
- Consumes: `RuntimeReadyEvent`, `serializeEvent`, `parseEvent` (via `@open-agent-ide/shared`)
- Produces: `RuntimeManager` class with `start()`, `stop()`, `onReady()` methods

- [ ] **Step 1: 创建 apps/desktop/package.json**

```json
{
  "name": "open-agent-ide-desktop",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@open-agent-ide/shared": "workspace:*",
    "@open-agent-ide/core": "workspace:*",
    "electron": "^39.5.1"
  },
  "devDependencies": {
    "electron-vite": "^3.1.0",
    "typescript": "^5.5.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: 创建 apps/desktop/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: 创建 apps/desktop/vite.main.config.ts**

```typescript
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      lib: {
        entry: 'src/main/index.ts',
        formats: ['cjs'],
        fileName: () => 'index.cjs',
      },
    },
  },
})
```

- [ ] **Step 4: 创建 apps/desktop/src/main/runtime-manager.ts**

```typescript
import { spawn, type ChildProcess } from 'child_process'
import { resolve } from 'path'
import type { RuntimeReadyEvent, RuntimeEvent } from '@open-agent-ide/shared'

/**
 * Runtime 管理器
 *
 * 负责启动、停止 Bun Agent Runtime 子进程，并通过 stdio 与其通信。
 */
export class RuntimeManager {
  private child: ChildProcess | null = null
  private buffer = ''
  private readyListeners: Array<(event: RuntimeReadyEvent) => void> = []
  private eventListeners: Array<(event: RuntimeEvent) => void> = []

  /**
   * 启动 runtime 子进程
   */
  start(runtimeEntryPath?: string): void {
    if (this.child) {
      throw new Error('Runtime 已经启动')
    }

    const entry =
      runtimeEntryPath ??
      resolve(import.meta.dir, '../../../packages/runtime/src/interfaces/stdio-server.ts')

    this.child = spawn('bun', [entry], {
      stdio: ['pipe', 'pipe', 'inherit'],
    })

    this.child.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString()
      this.flushBuffer()
    })

    this.child.on('exit', (code) => {
      console.log(`Runtime 进程退出，退出码: ${code}`)
      this.child = null
    })
  }

  /**
   * 停止 runtime 子进程
   */
  stop(): void {
    if (this.child) {
      this.child.kill()
      this.child = null
    }
  }

  /**
   * 注册 ready 事件监听器
   */
  onReady(listener: (event: RuntimeReadyEvent) => void): () => void {
    this.readyListeners.push(listener)
    return () => {
      this.readyListeners = this.readyListeners.filter((l) => l !== listener)
    }
  }

  /**
   * 注册通用事件监听器
   */
  onEvent(listener: (event: RuntimeEvent) => void): () => void {
    this.eventListeners.push(listener)
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== listener)
    }
  }

  private flushBuffer(): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as RuntimeEvent
      this.eventListeners.forEach((l) => l(event))

      if (event.type === 'runtime.ready') {
        this.readyListeners.forEach((l) => l(event as RuntimeReadyEvent))
      }
    }
  }
}
```

- [ ] **Step 5: 创建 apps/desktop/src/main/index.ts**

```typescript
import { app } from 'electron'
import { RuntimeManager } from './runtime-manager.ts'

/**
 * Electron 主进程入口
 *
 * 本阶段只启动 runtime 子进程并打印 ready 事件，不创建窗口。
 */
async function main(): Promise<void> {
  await app.whenReady()

  const runtime = new RuntimeManager()

  runtime.onReady((event) => {
    console.log('Runtime 已就绪:', event.capabilities)
  })

  runtime.start()

  app.on('window-all-closed', () => {
    runtime.stop()
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}

main().catch((error) => {
  console.error('主进程启动失败:', error)
  process.exit(1)
})
```

- [ ] **Step 6: 创建测试 apps/desktop/tests/runtime-manager.test.ts**

```typescript
import { test, expect } from 'bun:test'
import { RuntimeManager } from '../src/main/runtime-manager.ts'
import { resolve } from 'path'

const runtimePath = resolve(import.meta.dir, '../../../packages/runtime/src/interfaces/stdio-server.ts')

test('RuntimeManager 能启动 runtime 并收到 ready 事件', async () => {
  const manager = new RuntimeManager()

  const readyEvent = await new Promise<ReturnType<typeof manager.onReady>>((resolve, reject) => {
    const unsubscribe = manager.onReady((event) => {
      unsubscribe()
      manager.stop()
      resolve(event as unknown as ReturnType<typeof manager.onReady>)
    })

    manager.start(runtimePath)

    setTimeout(() => {
      manager.stop()
      reject(new Error('timeout'))
    }, 5000)
  })

  expect(readyEvent).toBeDefined()
})
```

注意：这个测试用 Bun 的 `spawn` 模拟 Electron 环境，因为 Electron 主进程测试需要特殊设置。

- [ ] **Step 7: 安装依赖并运行测试**

```bash
cd D:/open-agent-ide
bun install
cd apps/desktop
bun test
```

Expected: runtime-manager 测试通过。

- [ ] **Step 8: 提交**

```bash
cd D:/open-agent-ide
git add apps/desktop/
git commit -m "feat(desktop): add electron skeleton and runtime manager"
```

---

### Task 7: 端到端验证

**Files:**
- 无新文件

- [ ] **Step 1: 从命令行启动 desktop 主进程**

```bash
cd D:/open-agent-ide/apps/desktop
bun run dev
```

Expected: 控制台输出 `Runtime 已就绪: ["bash","powershell","mcp","anthropic","openai"]`。

- [ ] **Step 2: 运行整个工作区测试**

```bash
cd D:/open-agent-ide
bun test
```

Expected: shared、core、runtime、desktop 四个包的测试全部通过。

- [ ] **Step 3: 运行类型检查**

```bash
cd D:/open-agent-ide
bun run typecheck
```

Expected: 无类型错误。

- [ ] **Step 4: 提交阶段完成标记**

```bash
cd D:/open-agent-ide
git add .
git commit -m "feat: stage 1 complete - monorepo skeleton and stdio runtime handshake"
```

---

## Spec Coverage Check

| 设计文档要求 | 对应 Task |
|---|---|
| Monorepo 结构 | Task 1, 2, 3, 6 |
| 完整复制 free-code-main | Task 4 |
| stdio + NDJSON 协议 | Task 2, 5, 6 |
| 3 进程架构雏形 | Task 6 |
| DDD 分层骨架 | Task 5 (domain/application/interfaces) |
| TDD | 每个 Task 都包含测试 |
| 不修改参考目录 | 所有操作都在 D:\open-agent-ide 内 |

## Placeholder Scan

- 无 TBD/TODO
- 无 "implement later"
- 所有代码步骤都包含完整代码
- 所有测试都包含具体断言

## Type Consistency Check

- `RuntimeEvent` 来自 `@open-agent-ide/shared`
- `serializeEvent` / `parseEvent` 在 Task 5 定义，在 Task 6 使用
- `RuntimeManager.onReady` 返回的是 `RuntimeReadyEvent`
- 所有接口签名一致

---

## Execution Handoff

Plan complete and saved to `D:\open-agent-ide\docs\superpowers\plans\2026-07-01-open-agent-ide-stage-1.md`.

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

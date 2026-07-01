# open-agent-ide 阶段 3 实施计划：Desktop 集成

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Electron 桌面应用能启动 runtime 子进程、通过 IPC 桥接渲染进程与 runtime，并在 UI 中发送 Agent 消息、展示文本增量和工具结果。

**Architecture:** 主进程 `RuntimeManager` 维护 stdio 子进程；`RuntimeIpcService` 把渲染进程的 `runtime.sendRequest` / `runtime.onEvent` 桥接到 `RuntimeManager`；渲染进程用 Jotai atoms 管理 runtime 状态，提供最小化的 Chat UI。

**Tech Stack:** Electron 39, electron-vite 3, React 18, Jotai 2, Tailwind CSS 3, Radix UI, Lucide React.

## Global Constraints

- 所有包 `"type": "module"`，导入使用 `.ts` 扩展名
- 禁止使用 `any`，优先使用 `interface`
- 中文注释优先，保留必要专业术语
- 每个新模块必须附带测试
- 不修改 `D:\Proma` 和 `D:\free-code-main`
- 状态管理采用 Jotai
- UI 组件推荐 ShadcnUI / Radix UI，卡片+阴影取代边框
- 主进程通过 `ipcMain.handle/on` 暴露 API；preload 通过 `contextBridge` 暴露类型安全 API

---

### Task 1: RuntimeManager 支持发送请求与事件分发

**Files:**
- Create: `packages/runtime/src/application/event-streamer.ts` 已存在（NDJSON 序列化）
- Modify: `apps/desktop/src/main/runtime-manager.ts`
- Test: `apps/desktop/tests/runtime-manager.test.ts`

**Interfaces:**
- Consumes: `@open-agent-ide/shared` 的 `RuntimeEvent`, `RuntimeRequest`, `AgentRunParams`
- Produces: `RuntimeManager.sendRequest(request: RuntimeRequest): void`, `RuntimeManager.onEvent(listener): () => void`, `RuntimeManager.onReady(listener): () => void`

- [ ] **Step 1: 编写测试**

```typescript
import { test, expect } from 'bun:test'
import { RuntimeManager } from '../src/main/runtime-manager.ts'

test('RuntimeManager 发送请求后子进程 stdout 收到 NDJSON', () => {
  const runtime = new RuntimeManager()
  runtime.start()

  let ready = false
  runtime.onReady(() => { ready = true })

  // 等待 ready
  // ...
})
```

- [ ] **Step 2: 实现 sendRequest 方法**

在 `RuntimeManager` 中添加：

```typescript
sendRequest(request: RuntimeRequest): void {
  if (!this.child || !this.child.stdin) {
    throw new Error('Runtime 未启动')
  }
  this.child.stdin.write(JSON.stringify(request) + '\n')
}
```

- [ ] **Step 3: 验证启动 + ready 事件**

运行测试，确保能捕获 `runtime.ready`。

- [ ] **Step 4: 提交**

```bash
git add apps/desktop/src/main/runtime-manager.ts apps/desktop/tests/runtime-manager.test.ts
git commit -m "feat(desktop): RuntimeManager 支持发送请求与事件分发"
```

---

### Task 2: 主进程 IPC 服务

**Files:**
- Create: `apps/desktop/src/main/ipc/runtime-ipc.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Test: `apps/desktop/tests/runtime-ipc.test.ts`

**Interfaces:**
- Consumes: `RuntimeManager`
- Produces: `registerRuntimeIpc(runtime: RuntimeManager): void`

- [ ] **Step 1: 定义 IPC 通道常量**

```typescript
export const RUNTIME_IPC_CHANNELS = {
  SEND_REQUEST: 'runtime:send-request',
  ON_EVENT: 'runtime:on-event',
  ON_READY: 'runtime:on-ready',
}
```

- [ ] **Step 2: 实现 IPC 注册函数**

```typescript
export function registerRuntimeIpc(runtime: RuntimeManager): void {
  ipcMain.handle(RUNTIME_IPC_CHANNELS.SEND_REQUEST, (_event, request) => {
    runtime.sendRequest(request)
  })

  ipcMain.on(RUNTIME_IPC_CHANNELS.ON_EVENT, (event) => {
    const listener = (runtimeEvent: RuntimeEvent) => {
      event.sender.send(RUNTIME_IPC_CHANNELS.ON_EVENT, runtimeEvent)
    }
    runtime.onEvent(listener)
  })
}
```

- [ ] **Step 3: 在 main/index.ts 中注册**

- [ ] **Step 4: 测试**

- [ ] **Step 5: 提交**

---

### Task 3: Preload 脚本

**Files:**
- Create: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/vite.main.config.ts`（或新增 `vite.preload.config.ts`）
- Test: 通过类型检查验证

**Interfaces:**
- Consumes: `RUNTIME_IPC_CHANNELS`
- Produces: `window.electronAPI.runtime.sendRequest`, `window.electronAPI.runtime.onEvent`

- [ ] **Step 1: 创建 preload 脚本**

```typescript
import { contextBridge, ipcRenderer } from 'electron'
import { RUNTIME_IPC_CHANNELS } from '../main/ipc/runtime-ipc.ts'

contextBridge.exposeInMainWorld('electronAPI', {
  runtime: {
    sendRequest: (request: RuntimeRequest) =>
      ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.SEND_REQUEST, request),
    onEvent: (callback: (event: RuntimeEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: RuntimeEvent) =>
        callback(data)
      ipcRenderer.on(RUNTIME_IPC_CHANNELS.ON_EVENT, listener)
      return () => ipcRenderer.off(RUNTIME_IPC_CHANNELS.ON_EVENT, listener)
    },
  },
})
```

- [ ] **Step 2: 配置 electron-vite preload 构建**

- [ ] **Step 3: 类型声明**

创建 `apps/desktop/src/preload/types.d.ts`。

- [ ] **Step 4: 提交**

---

### Task 4: 渲染进程骨架（React + Vite）

**Files:**
- Create: `apps/desktop/src/renderer/index.html`
- Create: `apps/desktop/src/renderer/main.tsx`
- Create: `apps/desktop/src/renderer/App.tsx`
- Create: `apps/desktop/src/renderer/index.css`
- Modify: `apps/desktop/vite.main.config.ts` → `electron-vite` 完整配置
- Modify: `apps/desktop/package.json` 添加 React/Jotai/Tailwind 依赖
- Test: `bun run dev` 能启动窗口

- [ ] **Step 1: 安装依赖**

```bash
cd apps/desktop
bun add react react-dom jotai tailwindcss postcss autoprefixer @radix-ui/react-scroll-area lucide-react
bun add -D @types/react @types/react-dom
```

- [ ] **Step 2: 初始化 Tailwind**

创建 `tailwind.config.js` 和 `postcss.config.js`。

- [ ] **Step 3: 创建渲染入口**

- [ ] **Step 4: 配置 electron-vite**

```typescript
export default defineConfig({
  main: { ... },
  preload: { input: 'src/preload/index.ts' },
  renderer: { root: 'src/renderer', build: { outDir: 'dist/renderer' } },
})
```

- [ ] **Step 5: 提交**

---

### Task 5: Jotai 状态与 Chat UI

**Files:**
- Create: `apps/desktop/src/renderer/atoms/runtime-atoms.ts`
- Create: `apps/desktop/src/renderer/components/ChatView.tsx`
- Create: `apps/desktop/src/renderer/components/ChatInput.tsx`
- Create: `apps/desktop/src/renderer/components/MessageList.tsx`
- Create: `apps/desktop/src/renderer/hooks/useRuntime.ts`
- Modify: `apps/desktop/src/renderer/App.tsx`
- Test: `apps/desktop/tests/runtime-atoms.test.ts`

**Interfaces:**
- Consumes: `window.electronAPI.runtime`
- Produces: `runtimeEventsAtom`, `sendAgentRun(params: AgentRunParams): Promise<void>`

- [ ] **Step 1: 创建 Jotai atoms**

```typescript
export const runtimeEventsAtom = atom<RuntimeEvent[]>([])
export const runtimeReadyAtom = atom<boolean>(false)
```

- [ ] **Step 2: 创建 useRuntime hook**

挂载 IPC 事件监听，提供 `sendAgentRun`。

- [ ] **Step 3: 创建 Chat UI 组件**

- `ChatView`: 布局容器
- `MessageList`: 展示 text_delta / tool_start / tool_result / done / error
- `ChatInput`: 输入框 + 发送按钮

- [ ] **Step 4: 测试 atoms/hook**

- [ ] **Step 5: 提交**

---

### Task 6: 主进程创建 BrowserWindow

**Files:**
- Modify: `apps/desktop/src/main/index.ts`

- [ ] **Step 1: 创建窗口**

```typescript
const win = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    preload: path.join(__dirname, '../preload/index.cjs'),
    contextIsolation: true,
  },
})

if (app.isPackaged) {
  win.loadFile(path.join(__dirname, '../renderer/index.html'))
} else {
  win.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173')
}
```

- [ ] **Step 2: 启动 runtime 并注册 IPC**

- [ ] **Step 3: 提交**

---

### Task 7: 端到端验证

**Files:**
- 无新增文件

- [ ] **Step 1: 运行 `bun run dev`**

期望：窗口打开，显示 Chat UI，runtime ready 后控制台打印 capabilities。

- [ ] **Step 2: 手动发送 `agent.run` 请求**

在 UI 输入 "hello"，使用 mock provider（可选）或真实 Anthropic key，观察 text_delta 事件。

- [ ] **Step 3: 运行全部测试**

```bash
bun test
bun run typecheck
```

- [ ] **Step 4: 提交并推送**

---

## 验证步骤

1. 单元测试：`bun test`
2. 类型检查：`bun run typecheck`
3. 桌面启动：`cd apps/desktop && bun run dev`
4. 手动 Chat 测试：输入消息后看到模型响应

## 交付标准

阶段 3 完成后，运行 `bun run dev` 应能打开 Electron 窗口，输入消息后可触发 Agent Runtime，并在 UI 中展示文本增量和工具结果。

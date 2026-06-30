# State Management Architecture

## 1. 概述

Claude Code 使用自定义的状态管理系统，主要由 `src/state/AppState.tsx` 和 `src/state/AppStateStore.ts` 实现。该系统基于 React Context 和自定义 store 模式，提供类型安全、响应式的状态管理。

### 核心文件
- `src/state/AppState.tsx`: React Provider 组件和 Hooks
- `src/state/AppStateStore.ts`: Store 接口和类型定义
- `src/state/store.ts`: Store 实现工厂函数
- `src/state/onChangeAppState.ts`: 状态变更回调
- `src/state/selectors.ts`: 状态选择器
- `src/state/teammateViewHelpers.ts`: 队友视图辅助函数

## 2. AppState 接口

### 2.1 核心状态属性

```typescript
export type AppState = DeepImmutable<{
  // 设置
  settings: SettingsJson
  verbose: boolean
  
  // 模型配置
  mainLoopModel: ModelSetting
  mainLoopModelForSession: ModelSetting
  
  // UI 状态
  statusLineText: string | undefined
  expandedView: 'none' | 'tasks' | 'teammates'
  isBriefOnly: boolean
  showTeammateMessagePreview?: boolean  // ENABLE_AGENT_SWARMS 特性
  selectedIPAgentIndex: number
  coordinatorTaskIndex: number
  viewSelectionMode: 'none' | 'selecting-agent' | 'viewing-agent'
  footerSelection: FooterItem | null
  
  // 权限状态
  toolPermissionContext: ToolPermissionContext
  
  // 执行状态
  spinnerTip?: string
  agent: string | undefined
  kairosEnabled: boolean
  
  // 远程会话状态
  remoteSessionUrl: string | undefined
  remoteConnectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  remoteBackgroundTaskCount: number
  
  // Bridge 状态
  replBridgeEnabled: boolean
  replBridgeExplicit: boolean
  replBridgeOutboundOnly: boolean
  replBridgeConnected: boolean
  replBridgeSessionActive: boolean
  replBridgeReconnecting: boolean
  replBridgeConnectUrl: string | undefined
  replBridgeSessionUrl: string | undefined
  replBridgeEnvironmentId: string | undefined
  
  // 消息和任务
  messages: Message[]
  tasks: TaskState[]
  
  // 投机执行
  speculatingState: SpeculationState
  
  // 完成边界
  completionBoundaries: CompletionBoundary[]
  
  // 通知
  notifications: Notification[]
  
  // 待办列表
  todoList: TodoList | null
  
  // 其他状态
  // ... (更多属性见完整类型定义)
}>
```

### 2.2 SpeculationState

投机执行状态用于提前执行和缓存结果：

```typescript
export type SpeculationState =
  | { status: 'idle' }
  | {
      status: 'active'
      id: string
      abort: () => void
      startTime: number
      messagesRef: { current: Message[] }
      writtenPathsRef: { current: Set<string> }
      boundary: CompletionBoundary | null
      suggestionLength: number
      toolUseCount: number
      isPipelined: boolean
      contextRef: { current: REPLHookContext }
      pipelinedSuggestion?: {
        text: string
        promptId: 'user_intent' | 'stated_intent'
        generationRequestId: string | null
      } | null
    }
```

### 2.3 CompletionBoundary

完成边界标记执行完成点：

```typescript
export type CompletionBoundary =
  | { type: 'complete'; completedAt: number; outputTokens: number }
  | { type: 'bash'; command: string; completedAt: number }
  | { type: 'edit'; toolName: string; filePath: string; completedAt: number }
  | {
      type: 'denied_tool'
      toolName: string
      detail: string
      completedAt: number
    }
```

## 3. AppStateProvider

### 3.1 单例模式

`AppStateProvider` 使用 React Context 实现单例模式，防止嵌套：

```typescript
const HasAppStateContext = React.createContext<boolean>(false)

export function AppStateProvider({ children, initialState, onChangeAppState }: Props) {
  const hasAppStateContext = useContext(HasAppStateContext)
  if (hasAppStateContext) {
    throw new Error("AppStateProvider can not be nested within another AppStateProvider")
  }
  // ...
}
```

### 3.2 集成其他 Provider

#### VoiceProvider (VOICE_MODE 特性)
```typescript
const VoiceProvider = feature('VOICE_MODE') 
  ? require('../context/voice.js').VoiceProvider 
  : ({ children }) => children
```

#### MailboxProvider
始终集成的邮箱提供者，处理消息传递。

### 3.3 React Compiler 优化

使用 React Compiler 的 `_c` 运行时进行优化：

```typescript
import { c as _c } from "react/compiler-runtime";

export function AppStateProvider(t0) {
  const $ = _c(13);  // 编译器运行时优化
  // ...
}
```

### 3.4 Provider 层级结构

```
HasAppStateContext.Provider (value={true})
  └── AppStoreContext.Provider (value={store})
      └── MailboxProvider
          └── VoiceProvider (条件性)
              └── {children}
```

## 4. Store 创建 (createStore)

### 4.1 Store 接口

```typescript
export type Store<T> = {
  getState: () => T
  setState: (updater: (prev: T) => T) => void
  subscribe: (listener: () => void) => () => void
}
```

### 4.2 实现细节

```typescript
export function createStore<T>(
  initialState: T,
  onChange?: OnChange<T>,
): Store<T> {
  let state = initialState
  const listeners = new Set<Listener>()

  return {
    getState: () => state,

    setState: (updater: (prev: T) => T) => {
      const prev = state
      const next = updater(prev)
      if (Object.is(next, prev)) return  // 引用相等检查
      state = next
      onChange?.({ newState: next, oldState: prev })
      for (const listener of listener) listener()
    },

    subscribe: (listener: Listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

### 4.3 初始状态

```typescript
const [store] = useState(() => 
  createStore(
    initialState ?? getDefaultAppState(), 
    onChangeAppState
  )
)
```

## 5. 响应式更新

### 5.1 useSettingsChange Hook

监听外部设置变化并同步到 AppState：

```typescript
const onSettingsChange = useEffectEvent(
  (source: SettingSource) => 
    applySettingsChange(source, store.setState)
)
useSettingsChange(onSettingsChange)
```

### 5.2 applySettingsChange

应用设置变更的核心函数：

```typescript
export function applySettingsChange(
  source: SettingSource,
  setState: (updater: (prev: AppState) => AppState) => void
): void {
  // 根据来源应用设置变更
}
```

### 5.3 settingsChangeDetector

检测设置文件变化的机制。

### 5.4 useSyncExternalStore

使用 React 的 `useSyncExternalStore` 订阅状态变化：

```typescript
export function useAppState<T>(selector: (state: AppState) => T): T {
  const store = useAppStore()
  const get = () => {
    const state = store.getState()
    const selected = selector(state)
    return selected
  }
  return useSyncExternalStore(store.subscribe, get, get)
}
```

## 6. 权限状态管理

### 6.1 toolPermissionContext

工具权限上下文管理：

```typescript
toolPermissionContext: ToolPermissionContext
```

包含：
- 权限模式
- 工具权限映射
- 绕过权限模式可用性

### 6.2 Bypass Permissions Mode

绕过权限模式的特殊模式：

```typescript
isBypassPermissionsModeAvailable?: boolean
```

### 6.3 createDisabledBypassPermissionsContext

创建禁用的绕过权限上下文：

```typescript
function createDisabledBypassPermissionsContext(
  prev: ToolPermissionContext
): ToolPermissionContext {
  return {
    ...prev,
    isBypassPermissionsModeAvailable: false,
  }
}
```

## 7. Context 系统

### 7.1 AppStoreContext

主 store context：

```typescript
export const AppStoreContext = React.createContext<AppStateStore | null>(null)
```

### 7.2 HasAppStateContext

防止嵌套的标记 context：

```typescript
const HasAppStateContext = React.createContext<boolean>(false)
```

### 7.3 context.ts Providers

其他 context 提供者位于 `src/context/`：
- `notifications.js`: 通知 context
- `voice.js`: 语音 context
- `mailbox.js`: 邮箱 context

## 8. Hooks API

### 8.1 useAppState

订阅状态切片：

```typescript
export function useAppState<T>(selector: (state: AppState) => T): T
```

**使用示例**:
```typescript
const verbose = useAppState(s => s.verbose)
const model = useAppState(s => s.mainLoopModel)
const { text, promptId } = useAppState(s => s.promptSuggestion)
```

**重要提示**:
- 只返回现有对象引用，不要创建新对象
- 选择器应该返回属性，而不是整个状态
- 使用 `Object.is` 比较检测变化

### 8.2 useSetAppState

获取 setState 更新器而不订阅状态：

```typescript
export function useSetAppState(): (
  updater: (prev: AppState) => AppState
) => void
```

**特性**:
- 返回稳定的引用，从不改变
- 使用此 hook 的组件不会因状态变化而重新渲染

### 8.3 useAppStateStore

直接获取 store 用于传递给非 React 代码：

```typescript
export function useAppStateStore(): AppStateStore
```

### 8.4 useAppStateMaybeOutsideOfProvider

安全版本，在 Provider 外部返回 undefined：

```typescript
export function useAppStateMaybeOutsideOfProvider<T>(
  selector: (state: AppState) => T
): T | undefined
```

## 9. 状态更新模式

### 9.1 不可变更新

所有状态更新都应该是不可变的：

```typescript
setState(prev => ({
  ...prev,
  messages: [...prev.messages, newMessage],
  counter: prev.counter + 1
}))
```

### 9.2 引用稳定性

- 保持不变的对象引用以避免不必要的重新渲染
- 使用 `Object.is` 检测变化
- 避免在 selector 中创建新对象

### 9.3 批量更新

使用函数式更新确保基于最新状态：

```typescript
setState(prev => {
  const newState = computeFrom(prev)
  return newState
})
```

## 10. 性能优化

### 10.1 选择器优化

- 选择细粒度的状态切片
- 避免返回派生值，选择现有引用
- 多个独立字段使用多个 hook 调用

### 10.2 订阅优化

- `useSyncExternalStore` 提供高效的订阅机制
- 只在选择的值变化时重新渲染
- 使用 `Object.is` 进行引用比较

### 10.3 React Compiler 集成

- 使用 `_c` 运行时优化
- 自动记忆化和优化
- 编译时优化建议

### 10.4 条件渲染优化

- 使用特性标志（feature flags）进行条件编译
- DCE（死代码消除）减少包大小
- 懒加载非关键代码

## 11. 测试支持

### 11.1 测试工具

- `getDefaultAppState()`: 获取默认状态
- 自定义初始状态支持
- 可注入的 `onChangeAppState` 回调

### 11.2 Mock 模式

- 可替换的 store 实现
- 测试钩子和辅助函数
- 状态快照和验证

## 12. 最佳实践

### 12.1 状态设计

- 保持状态扁平化和规范化
- 避免冗余数据
- 使用 TypeScript 确保类型安全
- 使用 `DeepImmutable` 确保不可变性

### 12.2 组件集成

- 在组件顶层使用 hooks
- 避免在循环或条件中使用 hooks
- 使用 selector 优化渲染
- 将状态更新逻辑与 UI 分离

### 12.3 性能考虑

- 避免不必要的状态派生
- 使用选择器而不是订阅整个状态
- 考虑使用 memo 和 useMemo
- 批量更新状态

## 13. 故障排除

### 13.1 常见问题

**嵌套 Provider 错误**:
```
Error: AppStateProvider can not be nested within another AppStateProvider
```
**解决方案**: 确保只有一个 AppStateProvider 实例。

**选择器返回整个状态**:
```
Error: Your selector returned the original state, which is not allowed
```
**解决方案**: 选择器应该返回特定属性，而不是整个状态对象。

### 13.2 调试技巧

- 使用 `verbose` 模式查看状态变化
- 检查 `onChangeAppState` 回调
- 验证选择器返回值
- 使用 React DevTools 检查 context 值

import { atom } from 'jotai'
import type { RuntimeEvent, AgentRunParams } from '@open-agent-ide/shared'

/**
 * Runtime 事件列表
 */
export const runtimeEventsAtom = atom<RuntimeEvent[]>([])

/**
 * Runtime 是否已就绪
 */
export const runtimeReadyAtom = atom<boolean>(false)

/**
 * 当前是否正在等待响应
 */
export const isRunningAtom = atom<boolean>(false)

/**
 * 待发送的输入文本
 */
export const inputTextAtom = atom<string>('')

/**
 * 发送 AgentRun 请求的 action atom
 */
export const sendAgentRunAtom = atom(
  null,
  (_get, set, params: AgentRunParams) => {
    set(isRunningAtom, true)

    window.electronAPI.runtime
      .sendRequest({
        version: '1.0',
        id: params.id,
        method: 'agent.run',
        params,
      })
      .catch((error) => {
        console.error('发送 agent.run 失败:', error)
        set(isRunningAtom, false)
      })
  },
)

/**
 * 追加 runtime 事件的 action atom
 */
export const appendRuntimeEventAtom = atom(
  null,
  (get, set, event: RuntimeEvent) => {
    const events = get(runtimeEventsAtom)
    set(runtimeEventsAtom, [...events, event])

    if (event.type === 'done' || event.type === 'error') {
      set(isRunningAtom, false)
    }

    if (event.type === 'runtime.ready') {
      set(runtimeReadyAtom, true)
    }
  },
)

/**
 * 清空事件的 action atom
 */
export const clearEventsAtom = atom(null, (_get, set) => {
  set(runtimeEventsAtom, [])
})

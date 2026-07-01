import { useEffect } from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import {
  runtimeReadyAtom,
  runtimeEventsAtom,
  appendRuntimeEventAtom,
  clearEventsAtom,
  isRunningAtom,
} from '../atoms/runtime-atoms.ts'

/**
 * Runtime 连接 hook
 *
 * 负责订阅主进程推送的 runtime 事件，并暴露当前状态。
 */
export function useRuntime() {
  const ready = useAtomValue(runtimeReadyAtom)
  const events = useAtomValue(runtimeEventsAtom)
  const isRunning = useAtomValue(isRunningAtom)
  const appendEvent = useSetAtom(appendRuntimeEventAtom)
  const clearEvents = useSetAtom(clearEventsAtom)

  useEffect(() => {
    // 通知主进程订阅 runtime 事件
    window.electronAPI.runtime.subscribeEvents()

    const unsubscribe = window.electronAPI.runtime.onEvent((event) => {
      appendEvent(event)
    })

    return () => {
      unsubscribe()
    }
  }, [appendEvent])

  return {
    ready,
    events,
    isRunning,
    clearEvents,
  }
}

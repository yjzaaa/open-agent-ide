import type { RuntimeEvent, RuntimeRequest } from '@open-agent-ide/shared'

/**
 * 渲染进程全局 window.electronAPI 类型声明
 */
declare global {
  interface Window {
    electronAPI: {
      runtime: {
        sendRequest: (request: RuntimeRequest) => Promise<void>
        onEvent: (callback: (event: RuntimeEvent) => void) => () => void
        subscribeEvents: () => void
      }
    }
  }
}

export {}

import { contextBridge, ipcRenderer } from 'electron'
import type { RuntimeEvent, RuntimeRequest } from '@open-agent-ide/shared'
import { RUNTIME_IPC_CHANNELS } from '../main/ipc/runtime-ipc-channels.ts'

/**
 * Preload 脚本
 *
 * 通过 contextBridge 向渲染进程暴露类型安全的 runtime API。
 */
contextBridge.exposeInMainWorld('electronAPI', {
  runtime: {
    /**
     * 发送 runtime 请求到主进程
     */
    sendRequest: (request: RuntimeRequest): Promise<void> =>
      ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.SEND_REQUEST, request),

    /**
     * 订阅 runtime 事件
     *
     * @returns 取消订阅函数
     */
    onEvent: (callback: (event: RuntimeEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: RuntimeEvent) => {
        callback(data)
      }
      ipcRenderer.on(RUNTIME_IPC_CHANNELS.EVENT, listener)
      return () => ipcRenderer.off(RUNTIME_IPC_CHANNELS.EVENT, listener)
    },

    /**
     * 通知主进程订阅 runtime 事件
     */
    subscribeEvents: (): void => {
      ipcRenderer.send(RUNTIME_IPC_CHANNELS.SUBSCRIBE_EVENTS)
    },
  },
})

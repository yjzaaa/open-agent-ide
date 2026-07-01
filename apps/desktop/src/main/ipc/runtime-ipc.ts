import { ipcMain } from 'electron'
import type { RuntimeEvent, RuntimeRequest } from '@open-agent-ide/shared'
import { RuntimeManager } from '../runtime-manager.ts'
import { RUNTIME_IPC_CHANNELS } from './runtime-ipc-channels.ts'

/**
 * 注册 Runtime 相关 IPC 处理
 *
 * @param runtime - RuntimeManager 实例
 */
export function registerRuntimeIpc(runtime: RuntimeManager): void {
  /**
   * 渲染进程发送请求到 runtime
   */
  ipcMain.handle(
    RUNTIME_IPC_CHANNELS.SEND_REQUEST,
    (_event: Electron.IpcMainInvokeEvent, request: RuntimeRequest) => {
      runtime.sendRequest(request)
    },
  )

  /**
   * 渲染进程订阅 runtime 事件
   *
   * 主进程会在事件到达时通过 EVENT 通道推送回该 webContents。
   */
  ipcMain.on(
    RUNTIME_IPC_CHANNELS.SUBSCRIBE_EVENTS,
    (event: Electron.IpcMainEvent) => {
      const sender = event.sender
      const listener = (runtimeEvent: RuntimeEvent) => {
        sender.send(RUNTIME_IPC_CHANNELS.EVENT, runtimeEvent)
      }

      runtime.onEvent(listener)
    },
  )
}

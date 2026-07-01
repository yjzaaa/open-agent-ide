/**
 * Runtime IPC 通道常量
 *
 * 单独文件，避免在测试和非 Electron 环境中引入 electron 模块。
 */
export const RUNTIME_IPC_CHANNELS = {
  /** 渲染进程 → 主进程：发送 runtime 请求 */
  SEND_REQUEST: 'runtime:send-request',

  /** 渲染进程 → 主进程：订阅 runtime 事件 */
  SUBSCRIBE_EVENTS: 'runtime:subscribe-events',

  /** 主进程 → 渲染进程：推送 runtime 事件 */
  EVENT: 'runtime:event',
} as const

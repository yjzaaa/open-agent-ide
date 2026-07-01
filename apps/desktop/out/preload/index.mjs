import { contextBridge, ipcRenderer } from "electron";
const RUNTIME_IPC_CHANNELS = {
  /** 渲染进程 → 主进程：发送 runtime 请求 */
  SEND_REQUEST: "runtime:send-request",
  /** 渲染进程 → 主进程：订阅 runtime 事件 */
  SUBSCRIBE_EVENTS: "runtime:subscribe-events",
  /** 主进程 → 渲染进程：推送 runtime 事件 */
  EVENT: "runtime:event"
};
contextBridge.exposeInMainWorld("electronAPI", {
  runtime: {
    /**
     * 发送 runtime 请求到主进程
     */
    sendRequest: (request) => ipcRenderer.invoke(RUNTIME_IPC_CHANNELS.SEND_REQUEST, request),
    /**
     * 订阅 runtime 事件
     *
     * @returns 取消订阅函数
     */
    onEvent: (callback) => {
      const listener = (_event, data) => {
        callback(data);
      };
      ipcRenderer.on(RUNTIME_IPC_CHANNELS.EVENT, listener);
      return () => ipcRenderer.off(RUNTIME_IPC_CHANNELS.EVENT, listener);
    },
    /**
     * 通知主进程订阅 runtime 事件
     */
    subscribeEvents: () => {
      ipcRenderer.send(RUNTIME_IPC_CHANNELS.SUBSCRIBE_EVENTS);
    }
  }
});

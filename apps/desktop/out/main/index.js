import { ipcMain, app, BrowserWindow } from "electron";
import { resolve } from "path";
import { spawn } from "child_process";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
class RuntimeManager {
  child = null;
  buffer = "";
  readyListeners = [];
  eventListeners = [];
  /**
   * 启动 runtime 子进程
   */
  start(runtimeEntryPath) {
    if (this.child) {
      throw new Error("Runtime 已经启动");
    }
    const entry = runtimeEntryPath ?? resolve(
      import.meta.dir,
      "../../../packages/runtime/src/interfaces/stdio-server.ts"
    );
    this.child = spawn("bun", [entry], {
      stdio: ["pipe", "pipe", "inherit"]
    });
    this.child.stdout?.on("data", (chunk) => {
      this.buffer += chunk.toString();
      this.flushBuffer();
    });
    this.child.on("exit", (code) => {
      console.log(`Runtime 进程退出，退出码: ${code}`);
      this.child = null;
    });
  }
  /**
   * 发送 NDJSON 请求到 runtime 子进程
   */
  sendRequest(request) {
    if (!this.child || !this.child.stdin) {
      throw new Error("Runtime 未启动");
    }
    this.child.stdin.write(JSON.stringify(request) + "\n");
  }
  /**
   * 停止 runtime 子进程
   */
  stop() {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }
  /**
   * 注册 ready 事件监听器
   */
  onReady(listener) {
    this.readyListeners.push(listener);
    return () => {
      this.readyListeners = this.readyListeners.filter((l) => l !== listener);
    };
  }
  /**
   * 注册通用事件监听器
   */
  onEvent(listener) {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== listener);
    };
  }
  flushBuffer() {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      this.eventListeners.forEach((l) => l(event));
      if (event.type === "runtime.ready") {
        this.readyListeners.forEach((l) => l(event));
      }
    }
  }
}
const RUNTIME_IPC_CHANNELS = {
  /** 渲染进程 → 主进程：发送 runtime 请求 */
  SEND_REQUEST: "runtime:send-request",
  /** 渲染进程 → 主进程：订阅 runtime 事件 */
  SUBSCRIBE_EVENTS: "runtime:subscribe-events",
  /** 主进程 → 渲染进程：推送 runtime 事件 */
  EVENT: "runtime:event"
};
function registerRuntimeIpc(runtime) {
  ipcMain.handle(
    RUNTIME_IPC_CHANNELS.SEND_REQUEST,
    (_event, request) => {
      runtime.sendRequest(request);
    }
  );
  ipcMain.on(
    RUNTIME_IPC_CHANNELS.SUBSCRIBE_EVENTS,
    (event) => {
      const sender = event.sender;
      const listener = (runtimeEvent) => {
        sender.send(RUNTIME_IPC_CHANNELS.EVENT, runtimeEvent);
      };
      runtime.onEvent(listener);
    }
  );
}
async function main() {
  await app.whenReady();
  const runtime = new RuntimeManager();
  runtime.start();
  registerRuntimeIpc(runtime);
  const mainWindow = createMainWindow();
  app.on("window-all-closed", () => {
    runtime.stop();
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
  mainWindow.webContents.on("did-finish-load", () => {
    console.log("主窗口加载完成");
  });
}
function createMainWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Open Agent IDE",
    webPreferences: {
      preload: resolve(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (app.isPackaged) {
    window.loadFile(resolve(__dirname, "../renderer/index.html"));
  } else {
    window.loadURL(process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173");
    window.webContents.openDevTools();
  }
  return window;
}
main().catch((error) => {
  console.error("主进程启动失败:", error);
  process.exit(1);
});

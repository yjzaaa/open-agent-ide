import { app, BrowserWindow } from 'electron'
import { resolve } from 'path'
import { RuntimeManager } from './runtime-manager.ts'
import { registerRuntimeIpc } from './ipc/runtime-ipc.ts'

/**
 * Electron 主进程入口
 *
 * 启动 runtime 子进程、注册 IPC、创建主窗口。
 */
async function main(): Promise<void> {
  await app.whenReady()

  const runtimeEntryPath =
    process.env.RUNTIME_ENTRY_PATH ??
    resolve(
      app.getAppPath(),
      '../packages/runtime/src/interfaces/stdio-server.ts',
    )

  const runtime = new RuntimeManager()
  runtime.start(runtimeEntryPath)

  registerRuntimeIpc(runtime)

  const mainWindow = createMainWindow()

  app.on('window-all-closed', () => {
    runtime.stop()
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })

  // 等待窗口加载完成后再触发 ready 事件订阅
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('主窗口加载完成')
  })
}

/**
 * 创建主窗口
 */
function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Open Agent IDE',
    webPreferences: {
      preload: resolve(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (app.isPackaged) {
    window.loadFile(resolve(__dirname, '../renderer/index.html'))
  } else {
    window.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173')
    window.webContents.openDevTools()
  }

  return window
}

main().catch((error) => {
  console.error('主进程启动失败:', error)
  process.exit(1)
})

import { app } from 'electron'
import { RuntimeManager } from './runtime-manager.ts'

/**
 * Electron 主进程入口
 *
 * 本阶段只启动 runtime 子进程并打印 ready 事件，不创建窗口。
 */
async function main(): Promise<void> {
  await app.whenReady()

  const runtime = new RuntimeManager()

  runtime.onReady((event) => {
    console.log('Runtime 已就绪:', event.capabilities)
  })

  runtime.start()

  app.on('window-all-closed', () => {
    runtime.stop()
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}

main().catch((error) => {
  console.error('主进程启动失败:', error)
  process.exit(1)
})

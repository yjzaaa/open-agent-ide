import type { RuntimeEvent, RuntimeCapability } from '@open-agent-ide/shared'

export type { RuntimeEvent }

/**
 * 创建 runtime.ready 事件
 */
export function createRuntimeReadyEvent(
  capabilities: RuntimeCapability[],
): RuntimeEvent {
  return {
    version: '1.0',
    type: 'runtime.ready',
    capabilities,
  }
}

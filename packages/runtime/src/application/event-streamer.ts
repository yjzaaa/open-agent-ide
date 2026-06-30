import type { RuntimeEvent } from '@open-agent-ide/shared'

/**
 * 把事件序列化为 NDJSON 行
 */
export function serializeEvent(event: RuntimeEvent): string {
  return JSON.stringify(event) + '\n'
}

/**
 * 把 NDJSON 行解析为事件
 */
export function parseEvent(line: string): RuntimeEvent {
  return JSON.parse(line) as RuntimeEvent
}

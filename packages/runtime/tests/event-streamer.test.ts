import { test, expect } from 'bun:test'
import { serializeEvent, parseEvent } from '../src/application/event-streamer.ts'
import { createRuntimeReadyEvent } from '../src/domain/event.ts'

test('serializeEvent 输出 NDJSON 行', () => {
  const event = createRuntimeReadyEvent(['bash'])
  const line = serializeEvent(event)
  expect(line.endsWith('\n')).toBe(true)
  expect(JSON.parse(line).type).toBe('runtime.ready')
})

test('parseEvent 能解析 NDJSON 行', () => {
  const event = createRuntimeReadyEvent(['bash'])
  const line = serializeEvent(event)
  const parsed = parseEvent(line.trim())
  expect(parsed.type).toBe('runtime.ready')
})

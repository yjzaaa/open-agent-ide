import { test, expect } from 'bun:test'
import { createStore } from 'jotai'
import {
  runtimeEventsAtom,
  runtimeReadyAtom,
  isRunningAtom,
  appendRuntimeEventAtom,
  clearEventsAtom,
} from '../src/renderer/atoms/runtime-atoms.ts'

test('appendRuntimeEventAtom 追加事件', () => {
  const store = createStore()

  store.set(appendRuntimeEventAtom, {
    version: '1.0',
    type: 'text_delta',
    content: 'hello',
  })

  const events = store.get(runtimeEventsAtom)
  expect(events).toHaveLength(1)
  expect(events[0].type).toBe('text_delta')
})

test('appendRuntimeEventAtom 收到 done 后重置 isRunning', () => {
  const store = createStore()

  store.set(isRunningAtom, true)
  store.set(appendRuntimeEventAtom, { version: '1.0', type: 'done' })

  expect(store.get(isRunningAtom)).toBe(false)
})

test('appendRuntimeEventAtom 收到 runtime.ready 后设置 ready', () => {
  const store = createStore()

  store.set(appendRuntimeEventAtom, {
    version: '1.0',
    type: 'runtime.ready',
    capabilities: ['bash'],
  })

  expect(store.get(runtimeReadyAtom)).toBe(true)
})

test('clearEventsAtom 清空事件', () => {
  const store = createStore()

  store.set(appendRuntimeEventAtom, {
    version: '1.0',
    type: 'text_delta',
    content: 'hello',
  })
  store.set(clearEventsAtom)

  expect(store.get(runtimeEventsAtom)).toHaveLength(0)
})

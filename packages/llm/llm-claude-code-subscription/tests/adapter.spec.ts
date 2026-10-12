import { expect, it, vi } from 'vitest'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
import { ClaudeCodeSubscriptionAdapter } from '../src/adapter.ts'

it('passes native tool-role text to the subscription process', async () => {
  const stop = new Error('captured request')
  const spawn = vi.fn(() => { throw stop })
  const adapter = new ClaudeCodeSubscriptionAdapter({ resolveExecutable: async () => 'claude', spawn, cwd: () => process.cwd(), graceMs: 10 })
  const stream = adapter.stream({ provider: 'claude', model: 'test', messages: [
    { id: MessageId('result'), role: 'tool', toolCallId: ToolCallId('call'), source: { kind: 'tool', callId: ToolCallId('call') }, content: [{ type: 'text', text: 'retained tool output' }] },
  ] })
  await expect(stream[Symbol.asyncIterator]().next()).rejects.toBe(stop)
  const stdio: unknown = expect.objectContaining({ stdin: { data: '[tool]\nretained tool output' } })
  expect(spawn).toHaveBeenCalledWith(expect.objectContaining({ stdio }))
})

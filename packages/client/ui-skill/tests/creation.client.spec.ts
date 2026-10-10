import { expect, it, vi } from 'vitest'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/types'
import { createDraftHandoff, draftingPrompt, toolDraftingPrompt } from '../src/client/creation.ts'

it('retries uncertain sends with the same fresh session and submission identity', async () => {
  const create = vi.fn().mockResolvedValue('created')
  const prompt = vi.fn().mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue({ ok: true, value: { accepted: true } })
  const beginSubmission = vi.fn().mockReturnValue({ requestId: 'request-1' })
  const release = vi.fn()
  const openSession = vi.fn()
  const sessions = {
    create,
    retain: vi.fn(() => ({ ready: Promise.resolve(), binding: { session: { prompt, beginSubmission } }, release })),
  } as unknown as ISessions
  const handoff = createDraftHandoff(sessions, 'workspace-1' as WorkspaceId, 'draft this', openSession)
  await expect(handoff()).rejects.toThrow('connection lost')
  await Promise.all([handoff(), handoff()])
  expect(release).toHaveBeenCalledTimes(2)
  expect(openSession).toHaveBeenCalledTimes(2)
  expect(create).toHaveBeenCalledTimes(1)
  expect(create.mock.calls[0]?.[0]).toMatchObject({ workspaceId: 'workspace-1', sessionId: expect.any(String) })
  expect(beginSubmission).toHaveBeenCalledTimes(1)
  expect(prompt).toHaveBeenCalledTimes(2)
  expect(prompt.mock.calls[0]).toEqual(prompt.mock.calls[1])
  await handoff()
  expect(prompt).toHaveBeenCalledTimes(2)
})

it('pins the drafting instructions without inventing a test or audit workflow', () => {
  expect(draftingPrompt({ name: '', references: 'reference.md', instructions: 'Summarize notes', category: 'capture', scope: 'personal', invocation: 'user' }, '/home/user/.agents/skills')).toMatchSnapshot()
})

it('preserves name and description as task data with guidance specific to each tool', () => {
  const draft = { name: '/review', description: 'Review current changes' }
  for (const kind of ['commands', 'mcp', 'hooks', 'plugins'] as const) {
    const prompt = toolDraftingPrompt(kind, draft)
    expect(prompt).toContain(JSON.stringify({ kind, ...draft }, null, 2))
    expect(prompt).toContain('ask the user in this new chat')
  }
  expect(toolDraftingPrompt('commands', draft)).toContain('real DSH slash command')
  expect(toolDraftingPrompt('mcp', draft)).toContain('never in source or chat history')
  expect(toolDraftingPrompt('hooks', draft)).toContain('triggering event')
  expect(toolDraftingPrompt('plugins', draft)).toContain('plugin loads')
})

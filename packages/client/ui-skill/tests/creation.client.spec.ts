import { expect, it, vi } from 'vitest'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/types'
import { createDraftHandoff, draftingPrompt } from '../src/client/creation.ts'

it('retries uncertain sends with the same fresh session and submission identity', async () => {
  const create = vi.fn().mockResolvedValue('created')
  const prompt = vi.fn().mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue({ ok: true, value: { accepted: true } })
  const beginSubmission = vi.fn().mockReturnValue({ requestId: 'request-1' })
  const sessions = { create, open: vi.fn(), binding: () => ({ session: { prompt, beginSubmission } }) } as unknown as ISessions
  const handoff = createDraftHandoff(sessions, 'workspace-1' as WorkspaceId, 'draft this')
  await expect(handoff()).rejects.toThrow('connection lost')
  await Promise.all([handoff(), handoff()])
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

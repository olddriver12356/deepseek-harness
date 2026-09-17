import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { openDistillationDraft } from '../src/client/distillation.ts'
import { en, zh } from '../src/client/locales.ts'

describe('distillation draft', () => {
  it('creates in the source workspace and seeds the new composer before opening it', async () => {
    const sourceId = 'source' as SessionId
    const childId = 'child' as SessionId
    const scope = {}
    const setDraft = vi.fn()
    const open = vi.fn(() => { expect(setDraft).toHaveBeenCalledWith('Review source') })
    const create = vi.fn(async () => childId)
    const inputFor = vi.fn(() => ({ setDraft }))
    const ctx = {
      workspaces: { list: { getSnapshot: () => ({ items: [{ workspaceId: 'workspace', path: '/vault', sessionIds: [sourceId] }] }) } },
      sessions: {
        list: { getSnapshot: () => ({ byId: { [sourceId]: { cwd: '/vault' } } }) },
        create, scope: vi.fn(() => scope), open,
      },
      conversation: { input: { for: inputFor } },
    } as unknown as Context
    await openDistillationDraft(ctx, sourceId, 'Review source')
    expect(create).toHaveBeenCalledExactlyOnceWith({ workspaceId: 'workspace' })
    expect(ctx.sessions.scope).toHaveBeenCalledWith(childId)
    expect(inputFor).toHaveBeenCalledExactlyOnceWith(scope)
    expect(open).toHaveBeenCalledExactlyOnceWith(childId)
  })

  it('rejects a missing source without creating a session', async () => {
    const create = vi.fn()
    const ctx = {
      sessions: { list: { getSnapshot: () => ({ byId: {} }) }, create },
    } as unknown as Context
    await expect(openDistillationDraft(ctx, 'missing' as SessionId, 'Review')).rejects.toThrow('workspace')
    expect(create).not.toHaveBeenCalled()
  })

  it('pins the source-reading and owner-approval instructions in both languages', () => {
    expect({ en: en.distillationPrompt, zh: zh.distillationPrompt }).toMatchSnapshot()
  })
})

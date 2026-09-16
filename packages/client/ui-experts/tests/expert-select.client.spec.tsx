// @vitest-environment jsdom
/**
 * The selector is the prompt-notebook surface: it composes selected Experts into
 * a conversation prefix that rides along on the Session's next ordinary send. A
 * delegated Expert has no such representation — it runs as a forked child with a
 * task and a returned result — so offering one here would inject its text while
 * silently applying none of its persona, model, or tool scoping.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ExpertRecord } from '@deepseek-ai/dsh-host-experts/types'
import { ExpertSelect } from '../src/client/ExpertSelect.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const t = ((key: keyof typeof zh, params?: Record<string, unknown>): string =>
  zh[key].replace(/\{(\w+)\}/gu, (match, name: string) =>
    name in (params ?? {}) ? String(params?.[name]) : match)) as never

const CONVERSATIONAL: ExpertRecord = {
  id: 'agent-socratic', name: '苏格拉底追问专家', category: 'Learning', description: '',
  instructions: '只问不答。', status: 'approved', execution: 'conversational',
  model: 'inherit', reasoning: 'inherit', updatedAt: '2026-09-06',
}
const DELEGATED: ExpertRecord = {
  id: 'agent-root-cause', name: '根因判定专家', category: 'Engineering', description: '',
  instructions: '先复现，再改代码。', status: 'approved', execution: 'delegated',
  model: 'inherit', reasoning: 'inherit', updatedAt: '2026-09-06',
}
const DRAFT: ExpertRecord = { ...CONVERSATIONAL, id: 'agent-draft', name: '草稿专家', status: 'draft' }

function renderSelect(roster: readonly ExpertRecord[]) {
  const setSelection = vi.fn()
  const props = {
    listExperts: () => Promise.resolve(roster),
    setSelection,
    t,
  } as unknown as Parameters<typeof ExpertSelect>[0]
  const view = render(<ExpertSelect {...props} />)
  return { ...view, setSelection }
}

describe('ExpertSelect roster', () => {
  it('offers a conversational Expert and hides a delegated one', async () => {
    renderSelect([CONVERSATIONAL, DELEGATED])
    fireEvent.click(await screen.findByRole('button', { name: /选择专家/ }))
    expect(await screen.findByRole('option', { name: /苏格拉底追问专家/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /根因判定专家/ })).toBeNull()
  })

  it('still hides an unapproved Expert', async () => {
    renderSelect([CONVERSATIONAL, DRAFT])
    fireEvent.click(await screen.findByRole('button', { name: /选择专家/ }))
    expect(await screen.findByRole('option', { name: /苏格拉底追问专家/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /草稿专家/ })).toBeNull()
  })

  it('shows the existing empty state when every approved Expert is delegated', async () => {
    renderSelect([DELEGATED])
    fireEvent.click(await screen.findByRole('button', { name: /选择专家/ }))
    expect(await screen.findByText(zh.selectorEmpty)).toBeTruthy()
  })

  it('never composes a delegated Expert into the prefix selection', async () => {
    const { setSelection } = renderSelect([CONVERSATIONAL, DELEGATED])
    fireEvent.click(await screen.findByRole('button', { name: /选择专家/ }))
    fireEvent.click(await screen.findByRole('option', { name: /苏格拉底追问专家/ }))
    expect(setSelection).toHaveBeenCalledTimes(1)
    const [chosen] = setSelection.mock.calls[0] as [readonly ExpertRecord[]]
    expect(chosen.map(expert => expert.id)).toEqual(['agent-socratic'])
  })
})

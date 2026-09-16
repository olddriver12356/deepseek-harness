// @vitest-environment jsdom
// @vitest-environment jsdom
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import { ConnectedKnowledgePanel, CaptureButton } from '../src/client/ConnectedKnowledgePanel.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) { this.open = true },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')) },
  })
})
const item = { id: 'agent-test', title: 'Saved source', layer: '1 Intake', status: 'intake', workflow: 'pending', revision: 'r1', updatedAt: '2026-09-07', topics: ['dsh'], derivedFrom: [], path: '1 Intake/Saved source/ARTIFACT.md' } as const
const t = (key: keyof typeof zh) => zh[key]

it('opens immediately while reading and keeps read errors inside the reader', async () => {
  const appPanels = new AppPanelsController()
  appPanels.setActive('knowledge')
  let rejectRead!: (error: Error) => void
  const api = { list: async () => [item], read: () => new Promise((_, reject) => { rejectRead = reject }) }
  render(<ConnectedKnowledgePanel appPanels={appPanels} api={api as never} t={t} />)
  fireEvent.click(await screen.findByRole('button', { name: /Saved source/u }))
  const reader = screen.getByRole('dialog', { name: zh.reader })
  expect(reader.textContent).toContain(zh.loading)
  rejectRead(new Error('Source unavailable'))
  expect((await screen.findByRole('alert')).closest('dialog')).toBe(reader)
  fireEvent.click(screen.getByRole('button', { name: zh.close }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('navigates from saved evidence to its processing item and back', async () => {
  const appPanels = new AppPanelsController()
  appPanels.setActive('knowledge')
  const attempt = { ...item, id: 'agent-attempt', title: 'Distilled draft', layer: '2 AI Processing', workflow: 'awaiting-review', derivedFrom: [{ id: item.id, link: item.path }] }
  const read = vi.fn(async (id: string) => ({ ...(id === item.id ? item : attempt), markdown: '# Artifact', evidence: id === item.id ? 'Saved evidence' : '', content: '' }))
  render(<ConnectedKnowledgePanel appPanels={appPanels} api={{ list: async () => [item, attempt], read } as never} t={t} />)
  fireEvent.click(await screen.findByRole('button', { name: /Saved source/u }))
  await screen.findByText('Saved evidence', { selector: 'article p' })
  const reader = screen.getByRole('dialog')
  const related = [...reader.querySelectorAll('button')].find(button => button.textContent?.includes('Distilled draft'))
  expect(related).toBeTruthy()
  fireEvent.click(related!)
  await screen.findByRole('group', { name: zh.review })
  fireEvent.click(screen.getByRole('button', { name: zh.back }))
  await screen.findByText('Saved evidence', { selector: 'article p' })
  expect(read.mock.calls.map(call => call[0])).toEqual([item.id, attempt.id, item.id])
})

it('opens a card directly in a modal reader without interpreting HTML', async () => {
  const appPanels = new AppPanelsController()
  appPanels.setActive('knowledge')
  const api = { list: async () => [item], read: async () => ({ ...item, content: '', markdown: '# Saved source', evidence: '<script>not executed</script>' }) }
  render(<ConnectedKnowledgePanel appPanels={appPanels} api={api as never} t={t} />)
  const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
  fireEvent.click(await screen.findByRole('button', { name: /Saved source/u }))
  const reader = await screen.findByRole<HTMLDialogElement>('dialog', { name: zh.reader })
  expect(showModal).toHaveBeenCalledOnce()
  expect(reader.querySelector('script')).toBeNull()
  expect(reader.querySelector('pre')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: zh.close }))
  expect(reader.open).toBe(false)
  expect(screen.queryByRole('button', { name: '5 Methods' })).toBeNull()
})

it('renders Markdown as a readable document while keeping unsafe HTML and links inert', async () => {
  const appPanels = new AppPanelsController()
  appPanels.setActive('knowledge')
  const content = '## Readable heading\n\nA **strong** claim.\n\n- Evidence\n\n<script>unsafe()</script>\n\n[bad](javascript:alert(1))'
  render(<ConnectedKnowledgePanel appPanels={appPanels} api={{ list: async () => [item], read: async () => ({ ...item, content, markdown: '# Metadata', evidence: '' }) } as never} t={t} />)
  fireEvent.click(await screen.findByRole('button', { name: /Saved source/u }))
  expect(await screen.findByRole('heading', { name: 'Readable heading' })).toBeTruthy()
  const reader = screen.getByRole('dialog')
  expect(reader.querySelector('article strong')?.textContent).toBe('strong')
  expect(reader.querySelector('article li')?.textContent).toBe('Evidence')
  expect(reader.querySelector('script, a[href^="javascript:"]')).toBeNull()
  expect(reader.querySelector('details')?.open).toBe(false)
})

it('projects committed conversation text without replaying injected context or stream duplicates', async () => {
  const appPanels = new AppPanelsController()
  appPanels.setActive('knowledge')
  const evidence = [
    { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Human question' }] } },
    { type: 'user/message', data: { source: { kind: 'system' }, content: [{ type: 'text', text: 'Injected instructions' }] } },
    { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: '## Answer' }, { type: 'reasoning', text: 'Private reasoning' }] }, stream: [{ text: 'Duplicate' }] } },
  ].map(row => JSON.stringify(row)).join('\n')
  render(<ConnectedKnowledgePanel appPanels={appPanels} api={{ list: async () => [item], read: async () => ({ ...item, content: '', markdown: '# Metadata', evidence }) } as never} t={t} />)
  fireEvent.click(await screen.findByRole('button', { name: /Saved source/u }))
  expect(await screen.findByRole('heading', { name: 'Answer' })).toBeTruthy()
  const article = screen.getByRole('dialog').querySelector('article')!
  expect(article.textContent).toContain('Human question')
  expect(article.textContent).not.toMatch(/Injected instructions|Private reasoning|Duplicate/u)
  const raw = [...screen.getByRole('dialog').querySelectorAll('details')].find(detail => detail.querySelector('summary')?.textContent === zh.evidence)!
  expect(raw.open).toBe(false)
  expect(raw.querySelector('pre')).toBeNull()
})

it('requires a content preview and a separate owner approval before promotion', async () => {
  const appPanels = new AppPanelsController()
  appPanels.setActive('knowledge')
  const document = { ...item, layer: '3 Knowledge', workflow: 'accepted', reviewed: true, learned: true, markdown: '# Artifact', evidence: '', content: '# Draft' }
  const promote = vi.fn(async () => ({ ...document, revision: 'r2' }))
  const api = {
    list: async () => [document], read: async () => document, promote,
    preview: async ({ destination }: { destination: string }) => ({ id: item.id, destination, before: '', after: '# Draft', token: 'approved-bytes' }),
  }
  render(<ConnectedKnowledgePanel appPanels={appPanels} api={api as never} t={t} />)
  fireEvent.click(await screen.findByRole('button', { name: /打开 ARTIFACT/u }))
  const destination = await screen.findByRole('textbox', { name: zh.destination })
  fireEvent.change(destination, { target: { value: 'Knowledge/Testing/Draft.md' } })
  fireEvent.click(screen.getByRole('button', { name: zh.preview }))
  expect((await screen.findByRole<HTMLButtonElement>('button', { name: zh.promote })).disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: zh.approvePromotion }))
  fireEvent.change(destination, { target: { value: 'Knowledge/Testing/Other.md' } })
  expect(screen.queryByRole('button', { name: zh.promote })).toBeNull()
  expect(promote).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: zh.preview }))
  expect((await screen.findByRole<HTMLButtonElement>('button', { name: zh.promote })).disabled).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: zh.approvePromotion }))
  fireEvent.click(screen.getByRole('button', { name: zh.promote }))
  expect(promote).toHaveBeenCalledWith({ id: item.id, destination: 'Knowledge/Testing/Other.md', token: 'approved-bytes', approved: true })
})

it('does not fetch or render original records until explicitly requested', async () => {
  const appPanels = new AppPanelsController()
  appPanels.setActive('knowledge')
  const raw = vi.fn(async () => ({ ...item, content: 'Body', markdown: 'Metadata', evidence: '<script>raw source</script>' }))
  render(<ConnectedKnowledgePanel appPanels={appPanels} api={{ list: async () => [item], read: async () => ({ ...item, content: 'Body', markdown: '', evidence: '' }), raw } as never} t={t} />)
  fireEvent.click(await screen.findByRole('button', { name: /Saved source/u }))
  await screen.findByText('Body')
  expect(raw).not.toHaveBeenCalled()
  const details = screen.getByRole('dialog').querySelector('details')!
  details.open = true
  fireEvent(details, new Event('toggle'))
  fireEvent.click(await screen.findByRole('button', { name: zh.loadSource }))
  expect(await screen.findByText('<script>raw source</script>', { selector: 'pre' })).toBeTruthy()
  expect(raw).toHaveBeenCalledOnce()
  expect(screen.getByRole('dialog').querySelector('script')).toBeNull()
})

it('requires learning before exposing publication and reviews without six gates', async () => {
  const appPanels = new AppPanelsController()
  appPanels.setActive('knowledge')
  const draft = { ...item, layer: '2 AI Processing', workflow: 'awaiting-review', content: 'Concept', markdown: '', evidence: '' }
  const approved = { ...draft, layer: '3 Knowledge', workflow: 'accepted', reviewed: true, learned: false }
  const review = vi.fn(async () => approved)
  const learn = vi.fn(async () => ({ ...approved, learned: true }))
  const api = { list: async () => [draft], read: async () => draft, review, learn }
  render(<ConnectedKnowledgePanel appPanels={appPanels} api={api as never} t={t} />)
  fireEvent.click(await screen.findByRole('button', { name: /Saved source/u }))
  fireEvent.click(await screen.findByRole('button', { name: zh.accept }))
  expect(review).toHaveBeenCalledWith({ id: item.id, revision: item.revision, decision: 'accept' })
  const mark = await screen.findByRole('button', { name: zh.markLearned })
  expect(screen.queryByRole('textbox', { name: zh.destination })).toBeNull()
  fireEvent.click(mark)
  expect(await screen.findByRole('textbox', { name: zh.destination })).toBeTruthy()
})

it('keeps a failed distillation visible after refreshing the artifact list', async () => {
  const appPanels = new AppPanelsController()
  appPanels.setActive('knowledge')
  const api = {
    list: async () => [item], read: async () => ({ ...item, markdown: '# Source', content: '', evidence: 'source' }),
    distill: async () => { throw new Error('Model unavailable') },
  }
  render(<ConnectedKnowledgePanel appPanels={appPanels} api={api as never} t={t} />)
  fireEvent.click(await screen.findByRole('button', { name: /打开 ARTIFACT/u }))
  fireEvent.click(await screen.findByRole('button', { name: zh.distill }))
  expect((await screen.findByRole('alert')).textContent).toContain('Model unavailable')
})

it('saves once while pending and opens Knowledge only after success', async () => {
  let finish!: () => void
  const save = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
  const open = vi.fn()
  render(<CaptureButton save={save} open={open} t={t} />)
  expect(screen.getByText('⇣ 沉淀本次对话')).toBeTruthy()
  expect(screen.getByText('先保存至 Intake')).toBeTruthy()
  expect(screen.getByRole('button').getAttribute('title')).toBe(zh.notice)
  fireEvent.click(screen.getByRole('button', { name: zh.capture }))
  expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.saving }).disabled).toBe(true)
  expect(open).not.toHaveBeenCalled()
  finish()
  expect(await screen.findByText(zh.saved)).toBeTruthy()
  expect(save).toHaveBeenCalledOnce()
  expect(open).toHaveBeenCalledOnce()
})

// @vitest-environment jsdom
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotTestRuntime, TestRemote, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { UiConversation } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { RemoteStream } from '@deepseek-ai/dsh-api-gateway/client'
import type { Context } from '@deepseek-ai/cordis'
import { registerInboxConversationNodes } from '../../ui-chat/src/client/conversation-nodes/inbox.ts'
import { registerMessageConversationNode } from '../../ui-chat/src/client/conversation-nodes/message.ts'
import { registerChatConversationView } from '../../ui-chat/src/client/conversation-nodes/chat-snapshot-builder.ts'
import * as CollaborationUi from '../src/client/index.ts'
import { sid, peer, snapshot } from './fixtures.client.ts'
import { original, truncatedWindow } from './events.client.ts'

usePinnedBrowserLanguages('en-US')
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { while (cleanups.length > 0) await cleanups.pop()!() })

it('composes real slots and Peer renderer through Loader, then restores truthful generic attribution on unload and remount', async () => {
  const runtime = await SlotTestRuntime.create()
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
  const root = await mkdtemp(join(tmpdir(), 'dsh-collaboration-ui-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  cleanups.push(() => runtime.ctx.fiber.dispose())
  cleanups.push(() => runtime.dispose())
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale); runtime.slots.installLocale(locale)
  let active = 0
  const api = { controlSnapshot: vi.fn(async () => ({ ok: true, value: snapshot })),
    async *controlFollow(_request: unknown, signal: AbortSignal) {
      active++
      try {
        yield snapshot
        await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }); if (signal.aborted) resolve() })
      } finally { active-- }
    } }
  const remote = new TestRemote(runtime.ctx, { collaboration: api })
  Object.assign(remote, { $stream: (options: ConstructorParameters<typeof RemoteStream>[1]) => new RemoteStream({
    generation: { getSnapshot: () => 1, subscribe: () => () => {} },
  } as never, options) })
  await runtime.declare({
    'shell.activity.selectors': { kind: 'list', scope: 'session' },
    'shell.app-overlay': { kind: 'list', scope: 'session-maybe' },
    'conversation.chat.node': { kind: 'keyed', scope: 'session', inject: { hooks: { turnData: () => () => undefined } } },
  })
  const owner = { inject: ['sessions'], apply(ctx: Context) {
    new UiConversation(ctx, ctx.sessions)
    registerInboxConversationNodes(ctx); registerMessageConversationNode(ctx); registerChatConversationView(ctx)
  } }
  const config = join(root, 'cordis.yml')
  await writeFile(config, JSON.stringify([{ id: 'chat-owner', name: 'chat-owner' }, { id: 'discussion', name: 'discussion' }]))
  runtime.ctx.baseUrl = pathToFileURL(root).href + '/'
  await runtime.ctx.plugin(Loader)
  runtime.ctx.loader.builtins.include = Include
  runtime.ctx.loader.internal = { version: 'v2', async import(name: string) {
    if (name === 'chat-owner') return owner
    if (name === 'discussion') return CollaborationUi
    throw new Error(`Unexpected import ${name}`)
  } } as unknown as NonNullable<typeof runtime.ctx.loader.internal>
  await runtime.ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
  await runtime.ctx.loader.await()
  for (const row of runtime.ctx.loader.entries()) await row.fiber?.await()
  expect([...runtime.ctx.loader.entries()].filter(entry => !entry.disabled && entry.fiber === undefined)).toEqual([])
  expect(CollaborationUi.inject.filter(name => runtime.ctx.get(name) === undefined)).toEqual([])
  expect(runtime.ctx.uiConversation.events.entries().map(definition => definition.kind)).toContain('collaboration-peer')
  await vi.waitFor(() => { expect(runtime.slots.entries('shell.activity.selectors')).toHaveLength(1) })
  const overlay = runtime.renderSlot('shell.app-overlay', {})
  expect(overlay.view.queryByRole('dialog')).toBeNull()
  await runtime.sessions.add({ id: sid, summary: { displayTitle: 'Author', cwd: 'C:/author' } }, { current: true })
  await runtime.sessions.add({ id: peer, summary: { displayTitle: 'Reviewer', cwd: 'C:/review' } }, { current: false })
  await runtime.sessions.replaceEvents(sid, truncatedWindow, true)
  const binding = runtime.ctx.uiConversation.binding(sid)
  binding.activate('chat')
  const nodes = () => binding.target('chat').getSnapshot()!.nodes.values()
  await vi.waitFor(() => { expect(nodes().filter(node => node.kind === 'collaboration-peer')).toHaveLength(1) })
  expect(nodes().filter(node => node.kind === 'user')).toHaveLength(1)
  expect(nodes().filter(node => node.kind === 'context')).toHaveLength(0)
  const message = nodes().find(node => node.kind === 'collaboration-peer')!
  const rendered = runtime.renderSlot('conversation.chat.node', { node: message } as never, { entryKey: 'collaboration-peer', hookContext: {} })
  expect(rendered.view.getByText('<script>Peer body</script>')).toBeDefined()
  expect(rendered.container.querySelector('script')).toBeNull()
  expect(rendered.view.getByText(original.messageId)).toBeDefined()
  const portal = runtime.renderSlot('shell.activity.selectors', {})
  await vi.waitFor(() => { expect(portal.view.getByRole('button', { name: /Reviewer/ })).toBeDefined() })
  expect(portal.view.getByText('Unread messages: 1')).toBeDefined()
  const opener = portal.view.getByRole('button', { name: /Reviewer/ })
  opener.focus(); fireEvent.click(opener)
  await runtime.flush()
  expect(overlay.view.getByRole('dialog')).toBeDefined()
  await vi.waitFor(() => { expect(portal.view.queryByText(/Unread messages/u)).toBeNull() })
  expect(document.activeElement).toBe(overlay.view.getByRole('button', { name: 'Close' }))
  fireEvent(overlay.view.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true })); await runtime.flush()
  expect(overlay.view.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(opener)
  fireEvent.click(opener); await runtime.flush()
  expect(overlay.view.getByText('Check the parser')).toBeDefined()
  const entry = [...runtime.ctx.loader.entries()].find(row => row.options.id === 'discussion')!
  await entry.fiber!.dispose(); await runtime.flush()
  await vi.waitFor(() => { expect(active).toBe(0); expect(nodes().filter(node => node.kind === 'collaboration-peer')).toHaveLength(0) })
  expect(nodes().filter(node => node.kind === 'user')).toHaveLength(1)
  expect(nodes().find(node => node.kind === 'context')?.data).toMatchObject({ source: original })
  expect(runtime.slots.entries('conversation.chat.node')).toHaveLength(0)
  expect(runtime.slots.entries('shell.activity.selectors')).toHaveLength(0)
  await runtime.ctx.loader.create({ name: 'discussion' }); await runtime.ctx.loader.await(); await runtime.flush()
  await vi.waitFor(() => { expect(nodes().filter(node => node.kind === 'collaboration-peer')).toHaveLength(1) })
  expect(nodes().filter(node => node.kind === 'context')).toHaveLength(0)
  expect(runtime.slots.entries('shell.activity.selectors')).toHaveLength(1)
})

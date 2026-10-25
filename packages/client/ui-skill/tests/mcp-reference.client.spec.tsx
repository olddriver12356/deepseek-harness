// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { McpReference } from '../src/client/McpReference.tsx'
import { panelEn, type PanelTranslate } from '../src/client/panel-locales.ts'
import type { ToolReferenceDetail } from '@deepseek-ai/dsh-host-plugin-inventory/types'
const t: PanelTranslate = key => panelEn[key]
afterEach(cleanup)
it('shows actual connection independently of plugin activation and renders provider content inertly', () => {
  const detail: Extract<ToolReferenceDetail, { kind: 'mcp' }> = {
    id: 'mcp' as ToolReferenceDetail['id'], kind: 'mcp', scope: { kind: 'host' }, moduleName: 'mcp-client', name: 'docs', description: '', documentation: 'supplied', state: 'connected',
    transport: 'stdio', instructions: '<script>secret()</script> [open](https://example.test)', toolsAvailability: 'current',
    tools: [{ publicName: 'public', rawName: 'raw', description: '<img src=x onerror=secret()>', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', description: 'Search phrase', default: 'all', enum: ['all', 'recent'] } } }, annotations: { readOnlyHint: true } }],
  }
  const view = render(<McpReference detail={detail} t={t} />)
  expect(screen.getByText('Connected')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'raw' })).toBeTruthy()
  expect(screen.getByText('Search phrase')).toBeTruthy()
  expect(screen.getByText(/Required.*string/)).toBeTruthy()
  expect(screen.getByText(detail.instructions)).toBeTruthy()
  expect(view.container.querySelector('script,img,a')).toBeNull()
  expect(screen.getByText(/"query":/)).toBeTruthy()
  expect(screen.getByText('Provider annotations (not a security guarantee)')).toBeTruthy()
  for (const schema of [
    { type: 'object', properties: { token: { type: 'string' } }, allOf: [{ required: ['token'] }] },
    { $ref: '#/$defs/credentials', properties: { token: { type: 'string' } }, $defs: { credentials: { required: ['token'] } } },
  ]) {
    view.rerender(<McpReference detail={{ ...detail, tools: [{ publicName: 'complex', rawName: 'complex', description: '', inputSchema: schema }] }} t={t} />)
    expect(screen.getByText(panelEn.referenceComplexSchema)).toBeTruthy()
    expect(screen.queryByText(/Optional/)).toBeNull()
    expect(screen.getByText(/"token":/)).toBeTruthy()
  }
  view.rerender(<McpReference detail={{ ...detail, state: 'disconnected', toolsAvailability: 'unavailable', tools: [] }} t={t} />)
  expect(screen.getByText('Disconnected')).toBeTruthy()
  expect(screen.getByText(panelEn.referenceToolsUnavailable)).toBeTruthy()
  expect(screen.queryByText('raw')).toBeNull()
})

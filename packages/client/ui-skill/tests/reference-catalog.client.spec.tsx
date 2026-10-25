// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import type { UseResource, ResourceSnapshot } from '@deepseek-ai/dsh-client-resources/client'
import type { ReferenceResource } from '../src/client/reference-resources.ts'
import { cleanup, render, screen } from '@testing-library/react'
import type { ToolReferenceSnapshot, ToolReferenceDetail } from '@deepseek-ai/dsh-host-plugin-inventory/types'
import { ReferenceCatalog } from '../src/client/ReferenceCatalog.tsx'
import { panelEn, panelZh } from '../src/client/panel-locales.ts'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
const t = makeTranslate(panelZh)
afterEach(cleanup)
it('keeps the actual input hint when an extension has no authored manual', () => {
  const snapshot: ToolReferenceSnapshot = { observedAt: 1, sessionAvailability: 'live', commands: [{ name: 'review', description: 'Review path', input: { hint: '<path>' } }], mcp: { kind: 'ready', items: [] }, hooks: { kind: 'ready', items: [] } }
  const useResource = vi.fn((address: string): ResourceSnapshot<ReferenceResource> => ({ status: 'live', failure: undefined,
    value: address.includes('/catalog?') ? { kind: 'catalog', snapshot, plugins: { entries: [] } } : { kind: 'command', guide: null },
  })) as UseResource
  render(<ReferenceCatalog section="commands" useReferenceLocale={selector => selector({ active: 'zh', locales: [], revision: 0 })} generation={0} t={t} useResource={useResource} />)
  expect(screen.getByText('/review <path>')).toBeTruthy()
  expect(screen.getByText(panelZh.referenceNoGuide)).toBeTruthy()
})
it('shows Chinese filter chrome and explicit unavailable history rather than a success timestamp', () => {
  const snapshot: ToolReferenceSnapshot = { observedAt: 1, sessionAvailability: 'not-selected', commands: [], mcp: { kind: 'ready', items: [] }, hooks: { kind: 'ready', items: [{ id: 'hook' as import('@deepseek-ai/dsh-host-plugin-inventory/types').ToolReferenceId, kind: 'hook', moduleName: 'adapter', scope: { kind: 'host' }, name: 'PreToolUse · 1.1', description: '', documentation: 'supplied', types: ['tool'], events: ['PreToolUse'], enabled: true }] } }
  const detail: ToolReferenceDetail = {
    id: 'hook' as ToolReferenceDetail['id'], kind: 'hook', moduleName: 'adapter', scope: { kind: 'host' }, name: 'PreToolUse · 1.1', description: '', documentation: 'supplied', types: ['tool'], events: ['PreToolUse'], enabled: true,
    adapter: 'claude-code', trigger: 'Before a tool', effects: [], limitations: [], lastExecution: { kind: 'unavailable', reason: 'uncorrelated-history' },
  }
  const useResource = vi.fn((address: string): ResourceSnapshot<ReferenceResource> => ({
    status: 'live', failure: undefined, value: address.includes('/catalog?')
      ? { kind: 'catalog', snapshot, plugins: { entries: [] } } : { kind: 'detail', detail },
  })) as UseResource
  render(<ReferenceCatalog section="hooks" useReferenceLocale={selector => selector({ active: 'zh', locales: [], revision: 0 })} generation={0} t={t} useResource={useResource} />)
  expect(screen.getByRole('combobox', { name: panelZh.hookType })).toBeTruthy()
  expect(screen.getByRole('option', { name: panelZh.hookAll })).toBeTruthy()
  expect(screen.getByText(panelZh.referenceUncorrelated)).toBeTruthy()
  expect(screen.queryByText(panelEn.referenceUncorrelated)).toBeNull()
})

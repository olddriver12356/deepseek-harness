// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import type { UseResource } from '@deepseek-ai/dsh-client-resources/client'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ToolReferenceSnapshot, ToolReferenceSummary } from '@deepseek-ai/dsh-host-plugin-inventory/types'
import { ReferenceCatalog } from '../src/client/ReferenceCatalog.tsx'
import { panelEn } from '../src/client/panel-locales.ts'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'

const t = makeTranslate(panelEn)
afterEach(cleanup)
const hook = (name: string, events: string[], types: ('tool' | 'prompt')[]): ToolReferenceSummary => ({
  id: name as ToolReferenceSummary['id'], name, kind: 'hook', moduleName: 'owner', scope: { kind: 'host' },
  description: name, documentation: 'supplied', events, types, enabled: true,
})
it('combines a Skills-style hook type filter with search and clears detail when no rows match', () => {
  const items = [hook('Before tools', ['PreToolUse'], ['tool']), hook('After tools', ['PostToolUse'], ['tool']), hook('Prompt check', ['UserPromptSubmit'], ['prompt'])]
  const snapshot: ToolReferenceSnapshot = { observedAt: 1, sessionAvailability: 'not-selected', commands: [], mcp: { kind: 'ready', items: [] }, hooks: { kind: 'ready', items } }
  render(<ReferenceCatalog section="hooks" useReferenceLocale={selector => selector({ active: 'en', locales: [], revision: 0 })} generation={0} t={t} useResource={vi.fn().mockReturnValue({ status: 'live', value: { kind: 'catalog', snapshot, plugins: { entries: [] } }, failure: undefined }) as UseResource} />)
  const filter = screen.getByRole('combobox', { name: 'Hook type' })
  expect(screen.getByRole('option', { name: 'All types' })).toBeTruthy()
  fireEvent.change(filter, { target: { value: 'tool' } })
  expect(screen.getByRole('button', { name: /Before tools/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /After tools/ })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Prompt check/ })).toBeNull()
  fireEvent.change(screen.getByRole('textbox', { name: panelEn.catalogSearch }), { target: { value: 'After' } })
  expect(screen.queryByRole('button', { name: /Before tools/ })).toBeNull()
  fireEvent.change(filter, { target: { value: 'prompt' } })
  expect(screen.queryByRole('button', { name: /After tools/ })).toBeNull()
  expect(screen.getByText(panelEn.catalogEmpty)).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'After tools' })).toBeNull()
})

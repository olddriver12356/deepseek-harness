// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CommandReference } from '../src/client/CommandReference.tsx'
import { panelEn, type PanelTranslate } from '../src/client/panel-locales.ts'
import type { CommandUsageGuide } from '@deepseek-ai/dsh-commands/types'
const t: PanelTranslate = key => panelEn[key]
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const guide: CommandUsageGuide = {
  purpose: 'Inspect project', when: 'Before work', syntax: '/inspect [mode]',
  arguments: { kind: 'documented', items: [{ name: 'mode', required: false, description: 'What to inspect', defaultValue: 'status', acceptedValues: ['status'] }] },
  subcommands: [{ name: 'status', syntax: '/inspect status', description: 'Read current status', arguments: [] }],
  examples: [{ title: 'Inspect', input: '/inspect status', expectedResult: 'Displays project status' }], effects: ['Does not change files'], limitations: ['Requires a live Session'],
}
it('renders authored grammar and copies without submitting command input', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  render(<CommandReference guide={guide} t={t} />)
  expect(screen.getByText('What to inspect')).toBeTruthy()
  expect(screen.getByText('Displays project status')).toBeTruthy()
  fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0]!)
  await waitFor(() => { expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy() })
  expect(writeText).toHaveBeenCalledExactlyOnceWith('/inspect [mode]')
})
it('distinguishes an absent guide from no arguments and reports clipboard failure locally', async () => {
  const view = render(<CommandReference guide={null} t={t} />)
  expect(screen.getByText(panelEn.referenceNoGuide)).toBeTruthy()
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('SECRET_CLIPBOARD')) } })
  view.rerender(<CommandReference guide={{ ...guide, arguments: { kind: 'none' } }} t={t} />)
  expect(screen.getByText('No arguments')).toBeTruthy()
  fireEvent.click(screen.getAllByRole('button', { name: 'Copy' })[0]!)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', panelEn.referenceCopyFailed)
})

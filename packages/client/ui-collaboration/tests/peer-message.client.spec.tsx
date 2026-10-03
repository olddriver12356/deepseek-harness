// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { PeerMessage } from '../src/client/PeerMessage.tsx'
import { en, zh } from '../src/client/locales.ts'
import { original } from './events.ts'

afterEach(cleanup)

it.each([en, zh])('renders attributed Peer identities and inert text in each locale', (dictionary) => {
  const view = render(<PeerMessage {...{ node: { data: { source: original, content: [{ type: 'text', text: '<img src=x onerror=alert(1)>' }] } }, t: makeTranslate(dictionary) } as never} />)
  expect(view.getByRole('article', { name: dictionary.peerMessage })).toBeDefined()
  expect(view.getByText(dictionary.peerWarning)).toBeDefined()
  expect(view.getByText(original.messageId)).toBeDefined()
  expect(view.getByText('<img src=x onerror=alert(1)>')).toBeDefined()
  expect(view.container.querySelector('img')).toBeNull()
})

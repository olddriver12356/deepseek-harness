import { expect, it } from 'vitest'
import { cleanExternalText, extractHtmlText } from '@deepseek-ai/dsh-web-fetch-http/src/content.ts'
import { processingInput, parseCards } from '../src/processing.ts'

it('removes executable, hidden, and control content without treating that as proof of trust', () => {
  expect(extractHtmlText('<p>Visible</p><script>steal()</script><span hidden>secret</span><form>submit</form><p style="display:none">hidden</p>')).toBe('Visible')
  expect(cleanExternalText('A\u202eB\u0000C')).toBe('ABC')
})

it('processes only committed conversation text, not local instructions, tools, or stream events', () => {
  const rows = [
    { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Question' }] } },
    { type: 'user/message', data: { source: { kind: 'plugin' }, content: [{ type: 'text', text: 'PRIVATE MEMORY' }] } },
    { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'Answer' }, { type: 'tool-call', arguments: 'SECRET' }] } } },
  ].map(row => JSON.stringify(row)).join('\n')
  expect(processingInput(rows)).toBe('USER\nQuestion\n\nASSISTANT\nAnswer')
})

it('validates card structure and refuses arbitrary output destinations', () => {
  const card = { title: 'Topic', content: '# Topic\nExplanation', tags: ['learning'], suggestedDestination: 'Knowledge/AI Engineering' }
  expect(parseCards(JSON.stringify({ cards: [card] }), ['Knowledge/AI Engineering'])).toEqual([card])
  expect(() => parseCards(JSON.stringify({ cards: [{ ...card, suggestedDestination: '../AGENTS.md' }] }), ['Knowledge/AI Engineering'])).toThrow()
  expect(() => parseCards(JSON.stringify({ cards: [{ ...card, execute: 'shell' }] }), ['Knowledge/AI Engineering'])).toThrow()
})

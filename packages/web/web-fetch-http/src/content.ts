import { parseFragment, type DefaultTreeAdapterMap } from 'parse5'

/** Display cleanup only. Returned text remains untrusted and must never authorize actions. */
export function cleanExternalText(text: string): string {
  if (Buffer.byteLength(text, 'utf8') > 4 * 1024 * 1024) throw new Error('intake: source exceeds 4 MiB')
  return text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu, '').trim()
}

/** Extract visible text without fetching resources or interpreting active content. */
export function extractHtmlText(html: string): string {
  const parts: string[] = []
  const excluded = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed', 'form', 'svg', 'canvas', 'head'])
  const blocks = new Set(['p', 'div', 'section', 'article', 'br', 'li', 'h1', 'h2', 'h3', 'tr', 'blockquote'])
  const visit = (node: DefaultTreeAdapterMap['node'], depth: number): void => {
    if (depth > 128) return
    if (node.nodeName === '#text' && 'value' in node) { parts.push(node.value); return }
    if ('tagName' in node) {
      if (excluded.has(node.tagName) || node.attrs.some(a => a.name === 'hidden'
        || a.name === 'aria-hidden' && a.value.toLowerCase() === 'true'
        || a.name === 'style' && /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$))/iu.test(a.value))) return
      if (blocks.has(node.tagName)) parts.push('\n')
    }
    if ('childNodes' in node) for (const child of node.childNodes) visit(child, depth + 1)
    if ('tagName' in node && blocks.has(node.tagName)) parts.push('\n')
  }
  visit(parseFragment(cleanExternalText(html)), 0)
  return parts.join('').replace(/[ \t]+/gu, ' ').replace(/\n[ \t]+/gu, '\n').replace(/\n{3,}/gu, '\n\n').trim()
}

import { isMap, parseDocument } from 'yaml'

export type Invocation = 'both' | 'user' | 'agent' | 'neither'
export interface SkillFields { name: string; description: string; category: string; invocation: Invocation; instructions: string }

/** Parse only the YAML envelope; its document preserves unknown keys and comments. */
function envelope(source: string) {
  const match = /^(\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)
  if (match === null) throw new Error('Missing YAML frontmatter')
  const doc = parseDocument(match[2] ?? '')
  if (doc.errors[0] !== undefined) throw doc.errors[0]
  if (!isMap(doc.contents)) throw new Error('Frontmatter must be a mapping')
  return { doc, instructions: source.slice(match[0].length), bom: match[1] ?? '', newline: source.includes('\r\n') ? '\r\n' : '\n' }
}
export function invocationOf(user: boolean, model: boolean): Invocation { return user ? model ? 'both' : 'user' : model ? 'agent' : 'neither' }
export function readFields(source: string): SkillFields {
  const { doc, instructions } = envelope(source)
  const text = (key: string): string => {
    const value = doc.get(key)
    if (value === undefined) return ''
    if (typeof value !== 'string') throw new Error(`${key} must be a string`)
    return value
  }
  const metadata = doc.get('metadata', true)
  if (metadata !== undefined && !isMap(metadata)) throw new Error('metadata must be a mapping')
  const category = doc.getIn(['metadata', 'category'])
  if (category !== undefined && typeof category !== 'string') throw new Error('metadata.category must be a string')
  const user = doc.get('user-invocable') ?? true
  const disabled = doc.get('disable-model-invocation') ?? false
  if (typeof user !== 'boolean' || typeof disabled !== 'boolean') throw new Error('Invocation flags must be booleans')
  return { name: text('name'), description: text('description'), category: category ?? '', invocation: invocationOf(user, !disabled), instructions }
}
/** Update one known field without rebuilding the rest of the YAML mapping. */
export function editField(source: string, key: keyof SkillFields, value: string): string {
  const { doc, instructions, bom, newline } = envelope(source)
  if (key === 'instructions') return source.slice(0, source.length - instructions.length) + value
  if (key === 'category') {
    if (value === '') doc.deleteIn(['metadata', 'category'])
    else doc.setIn(['metadata', 'category'], value)
  } else if (key === 'invocation') {
    doc.set('user-invocable', value === 'both' || value === 'user')
    doc.set('disable-model-invocation', value === 'user' || value === 'neither')
  } else doc.set(key, value)
  return `${bom}---${newline}${doc.toString().replace(/\n/g, newline)}---${newline}${instructions}`
}

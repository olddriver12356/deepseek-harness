import { describe, expect, it } from 'vitest'
import { editField, readFields } from '../src/client/skill-document.ts'
describe('source-backed skill fields', () => {
  const source = '---\n# keep this comment\nname: summarize\ndescription: Summarize sources\nunknown: keep\nmetadata:\n  requires_tools: [read]\n  category: writing\n---\n# Procedure\nRead the source.\n'
  it('updates one field without dropping comments, unknown metadata or body', () => {
    const changed = editField(source, 'category', 'research')
    expect(changed).toContain('# keep this comment')
    expect(changed).toContain('unknown: keep')
    expect(changed).toContain('requires_tools: [ read ]')
    expect(readFields(changed)).toMatchObject({ category: 'research', instructions: '# Procedure\nRead the source.\n' })
    expect(readFields(editField(changed, 'category', '')).category).toBe('')
  })
  it('round-trips all invocation policies and keeps invalid YAML repairable', () => {
    for (const mode of ['both', 'user', 'agent', 'neither']) expect(readFields(editField(source, 'invocation', mode)).invocation).toBe(mode)
    expect(() => readFields('---\nname: [\n---\n')).toThrow()
    expect(() => readFields(source.replace('category: writing', 'category: [writing]'))).toThrow('must be a string')
  })
})

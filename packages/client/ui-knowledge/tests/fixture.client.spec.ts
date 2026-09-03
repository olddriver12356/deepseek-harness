import { describe, expect, it } from 'vitest'
import { KNOWLEDGE_FIXTURE } from '../src/client/fixture.ts'

describe('Knowledge fixture', () => {
  it('contains the approved read-only layer distribution', () => {
    expect(KNOWLEDGE_FIXTURE.layers).toHaveLength(6)
    expect(KNOWLEDGE_FIXTURE.artifacts).toHaveLength(5)
    expect(KNOWLEDGE_FIXTURE.artifacts.filter(artifact => artifact.layerId === 'intake')).toHaveLength(3)
    expect(KNOWLEDGE_FIXTURE.artifacts.filter(artifact => artifact.layerId === 'knowledge' && artifact.state === 'ACTIVE')).toHaveLength(2)
    expect(KNOWLEDGE_FIXTURE.artifacts.filter(artifact => artifact.layerId === 'methods')).toHaveLength(0)
    expect(KNOWLEDGE_FIXTURE.featuredArtifactId).toBe('powershell-json-contract')
  })

  it('freezes the root, arrays, and every record', () => {
    expect(Object.isFrozen(KNOWLEDGE_FIXTURE)).toBe(true)
    expect(Object.isFrozen(KNOWLEDGE_FIXTURE.layers)).toBe(true)
    expect(Object.isFrozen(KNOWLEDGE_FIXTURE.artifacts)).toBe(true)
    expect(KNOWLEDGE_FIXTURE.layers.every(Object.isFrozen)).toBe(true)
    expect(KNOWLEDGE_FIXTURE.artifacts.every(Object.isFrozen)).toBe(true)
  })
})

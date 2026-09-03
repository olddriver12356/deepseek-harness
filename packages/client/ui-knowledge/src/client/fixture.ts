import type { KnowledgeSnapshot } from './types.ts'

export const KNOWLEDGE_FIXTURE: KnowledgeSnapshot = Object.freeze({
  layers: Object.freeze([
    Object.freeze({ id: 'intake', ordinal: 1, label: 'Intake' }),
    Object.freeze({ id: 'ai-processing', ordinal: 2, label: 'AI Processing' }),
    Object.freeze({ id: 'knowledge', ordinal: 3, label: 'Knowledge' }),
    Object.freeze({ id: 'personal', ordinal: 4, label: 'Personal' }),
    Object.freeze({ id: 'methods', ordinal: 5, label: 'Methods' }),
    Object.freeze({ id: 'feedback', ordinal: 6, label: 'Feedback' }),
  ]),
  artifacts: Object.freeze([
    Object.freeze({
      id: 'powershell-json-contract',
      layerId: 'knowledge',
      state: 'ACTIVE',
      title: 'PowerShell ConvertTo-Json Contract',
      summary: 'Validated vendor behavior and cross-host evidence.',
      updatedAt: '2026-09-02',
    }),
    Object.freeze({
      id: 'agent-layer-access-boundary',
      layerId: 'knowledge',
      state: 'ACTIVE',
      title: 'Agent Layer Access Boundary',
      summary: 'Read-only package fixture with no vault navigation or mutation.',
      updatedAt: '2026-09-01',
    }),
    Object.freeze({
      id: 'historical-json-retrieval-failure',
      layerId: 'intake',
      state: 'REJECTED',
      title: 'Historical JSON Retrieval Failure',
      summary: 'Rejected artifact retained with evidence and processing history.',
      updatedAt: '2026-08-31',
    }),
    Object.freeze({
      id: 'vault-surface-review',
      layerId: 'intake',
      state: 'READY',
      title: 'Vault Surface Review',
      summary: 'Candidate boundary notes waiting for triage.',
      updatedAt: '2026-09-01',
    }),
    Object.freeze({
      id: 'panel-plugin-migration-notes',
      layerId: 'intake',
      state: 'READY',
      title: 'Panel Plugin Migration Notes',
      summary: 'Proposed package split for the remaining application panels.',
      updatedAt: '2026-09-01',
    }),
  ]),
  featuredArtifactId: 'powershell-json-contract',
})

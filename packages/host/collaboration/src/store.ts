/** Single-record durable V1a writes over the storage-domain serialized update primitive. */
import { Buffer } from 'node:buffer'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { Domain, DomainFacility, KvTable } from '@deepseek-ai/dsh-storage-domain'
import { collaborationDomain, collaborationStateSchema, stateLimitsSchema } from './schema.ts'
import { emptyCollaborationState } from './state.ts'
import type { CollaborationState, StateLimits } from './types.ts'

/** Storage owner; consumers publish snapshots only from committed domain/changed events. */
export class CollaborationStore {
  private readonly table: KvTable<'current', CollaborationState>
  private disposing = false

  private constructor(private readonly domain: Domain<typeof collaborationDomain>, private readonly limits: StateLimits) {
    this.table = domain.table('state')
  }

  /**
   * Open authoritative data and initialize the current record before admitting updates.
   * Failed validation or initialization releases the storage handle.
   * @param facility - actual injected storage-domain facility.
   * @param limits - explicit validated capacities, applied also to restored data.
   * @returns opened store owning its domain lifecycle.
   */
  static async open(facility: DomainFacility, limits: StateLimits): Promise<CollaborationStore> {
    const capacity = stateLimitsSchema.parse(limits)
    const domain = await facility.open(collaborationDomain)
    const store = new CollaborationStore(domain, capacity)
    try {
      const table = domain.table('state')
      if (table.size === 0) {
        const initial = emptyCollaborationState()
        store.assertCapacity(initial)
        await table.put('current', initial)
      } else if (table.size !== 1 || table.get('current') === undefined) {
        throw new Error('collaboration state must contain exactly the current aggregate record')
      }
      store.assertCapacity(store.read())
      return store
    } catch (error) {
      await domain.close()
      throw error
    }
  }

  /**
   * Read the authoritative immutable committed aggregate; no secondary cache exists.
   * @returns current state; reads reject after storage closes.
   */
  read(): CollaborationState {
    const current = this.table.get('current')
    if (current === undefined) throw new Error('collaboration current aggregate is absent')
    return current
  }

  /**
   * Serialize one synchronous pure transform with revision checking at its queue slot.
   * Persistence failure leaves reads and notifications unchanged. Stale revisions reject before transformation.
   * Consumers resolve actor-scoped retry receipts before calling, then reread after a concurrency conflict.
   * @param expectedRevision - aggregate revision observed by the caller.
   * @param transform - pure operation producing the next state and one appended journal entry.
   * @returns new state after durable commit and domain/changed publication.
   */
  transact(expectedRevision: number, transform: (current: CollaborationState) => CollaborationState): Promise<CollaborationState> {
    if (this.disposing) return Promise.reject(new RemoteError('collaboration/closed', 'collaboration store is closed', {}))
    return this.table.update('current', (current) => {
      if (current.revision !== expectedRevision) {
        throw new RemoteError('collaboration/revision-conflict', 'Collaboration changed. Reload the committed snapshot and retry.', { revision: current.revision })
      }
      const transformed = transform(current)
      const next = collaborationStateSchema.parse({ ...transformed, revision: current.revision + 1 })
      if (next.journal.length !== current.journal.length + 1
        || current.journal.some((entry, index) => JSON.stringify(entry) !== JSON.stringify(next.journal[index]))) {
        throw new Error('collaboration transaction must preserve the journal and append exactly one entry')
      }
      if (current.requests.some(receipt => !next.requests.some(row => JSON.stringify(row) === JSON.stringify(receipt)))) {
        throw new Error('collaboration transaction cannot discard original request receipts')
      }
      if (current.outbox.some(message => !next.outbox.some(row => row.id === message.id
        && row.connectionId === message.connectionId && row.sender === message.sender
        && row.recipient === message.recipient && row.text === message.text
        && (message.state === 'queued' || row.state === message.state || message.state === 'admitted' && row.state === 'failed')
        && (message.activationReserved !== true || row.activationReserved === true)))) {
        throw new Error('collaboration transaction cannot discard or rewrite retained messages or activation reservations')
      }
      this.assertCapacity(next)
      return next
    })
  }

  /**
   * Reject new writes immediately, drain admitted updates, and release the domain handle.
   * @returns storage teardown completion; repeated calls share the domain's close promise.
   */
  close(): Promise<void> {
    this.disposing = true
    return this.domain.close()
  }

  private assertCapacity(state: CollaborationState): void {
    const bytes = Buffer.byteLength(JSON.stringify({ unit: { name: 'collaboration', version: 1 }, global: null, tables: { state: { current: state } } }, null, 2) + '\n', 'utf8')
    for (const [limit, actual] of [['maxStateBytes', bytes], ['maxJournalEntries', state.journal.length], ['maxRequests', state.requests.length]] as const) {
      if (actual > this.limits[limit]) {
        throw new RemoteError('collaboration/capacity', `Collaboration ${limit} capacity exceeded (${actual}/${this.limits[limit]}). Increase the configured capacity or export and review retained state before retrying.`, { limit, maximum: this.limits[limit], actual })
      }
    }
  }
}

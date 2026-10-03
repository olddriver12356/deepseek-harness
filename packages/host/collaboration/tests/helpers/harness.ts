/**
 * Test-only Loader composition using production runtime services and JSONL storage.
 * The model and tool definitions are deterministic fixtures; execution and filesystem outcomes are real.
 */
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { pathToFileURL } from 'node:url'
import AgentRegistry, { type AgentHandle } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentDefaultModel from '@deepseek-ai/dsh-agent-default-model'
import SqliteSessionQuery from '@deepseek-ai/dsh-session-query-sqlite'
import { ApiSessionAgentController } from '../../../../api/session-controller/src/agent.ts'
import { installModelSelectionProjection } from '../../../../api/session-controller/src/model-selection-projection.ts'
import type { SessionController } from '@deepseek-ai/dsh-api-session-controller'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LlmRuntime, { createUserMessage, LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk, UserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import type { SessionHandle } from '@deepseek-ai/dsh-session-persistence'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import * as collaboration from '../../src/index.ts'
import { createHumanControlAdmission, requireHumanControl, type HumanControlAdmission } from '../../src/authority.ts'

/** The model's next reply: plain text, or one tool call followed by a closing text reply. */
type ModelStep = { readonly kind: 'text' } | { readonly kind: 'tool'; readonly name: string; readonly args: object }
  | { readonly kind: 'pending'; readonly started: () => void; readonly stopped: () => void }

class ScriptedAdapter extends LlmAdapter {
  readonly steps: ModelStep[] = []
  readonly requests: GenerateOptions[] = []
  private call = 0
  override async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(_options)
    const step = this.steps.shift() ?? { kind: 'text' }
    if (step.kind === 'pending') {
      const signal = _options.signal
      if (signal === undefined) throw new Error('loop request has no cancellation signal')
      step.started()
      if (!signal.aborted) await new Promise<void>((resolve) =>{  signal.addEventListener('abort', () =>{  resolve() }, { once: true }) })
      step.stopped()
      yield { type: 'finish', reason: { kind: 'aborted', failure: { message: 'fixture request aborted', code: 'ABORTED' } } }
      return
    }
    if (step.kind === 'tool') {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield {
        type: 'block-end', index: 0,
        block: { type: 'tool-call', id: ToolCallId(`call-${++this.call}`), name: step.name, arguments: JSON.stringify(step.args) },
      }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'done' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/** Outcome of one tool call as the Executor decided it. */
export interface ToolOutcome {
  readonly accepted: boolean
  readonly result: ToolExecutionResult
}

/** Test driver over the assembled runtime. */
export interface CollaborationHarness {
  readonly ctx: Context
  readonly agent: Agent
  readonly requests: readonly GenerateOptions[]
  /** Test-owned UI adapter minting; never registered as a model tool. */
  admitUiDiscussion(): HumanControlAdmission
  controlDiscussion(admission: unknown): void
  /** Deliver one user-typed message as a new turn and wait for the agent to go idle. */
  deliverHumanTurn(text: string): Promise<void>
  /** Deliver one message that did not come from the user, as a peer message will, and wait for idle. */
  deliverPeerDiscussion(text: string): Promise<void>
  /** Deliver a user message and a peer message in the same inbox batch, then wait for idle. */
  deliverMixedTurn(humanText: string, peerText: string): Promise<void>
  /** Supported plugin context is neutral when delivered alongside a human message. */
  deliverHumanWithContext(text: string): Promise<void>
  /** Queue the model's next reply as a call to `name`; the following reply is plain text. */
  scriptModelToolCall(name: string, args: object): void
  /** Hold one model request until production cancellation stops it. */
  holdModelRequest(): { readonly started: Promise<void>; readonly stopped: Promise<void> }
  /** Execute a tool directly through the Executor on behalf of the agent, as dynamic code or a loopback call would. */
  executeCurrentTool(name: string, args: object): Promise<ToolOutcome>
  /** Tool names whose bodies actually ran, in order. */
  readonly executed: readonly string[]
  workspaceFileExists(name: string): Promise<boolean>
  /** Dispose the current Agent and create a new durable session through the factory. */
  createSession(id: string): Promise<void>
  /** Dispose and resume the current session from its production JSONL log. */
  resumeSession(interruptedEvents?: readonly SessionEvent[]): Promise<void>
  /** Fail the next production handle append at the storage boundary. */
  failNextDurableWrite(error: Error): void
  storedEvents(): Promise<readonly SessionEvent[]>
  /** Dispose only the collaboration plugin, leaving the rest of the runtime running. */
  unloadCollaboration(): Promise<void>
  dispose(): Promise<void>
}

/** Options for {@link createCollaborationHarness}. */
export interface HarnessOptions {
  /** Mount the collaboration plugin; false models a runtime where it is absent. Default true. */
  readonly withCollaboration?: boolean
  /** Replace the plugin's peer-discussion allowlist. */
  readonly peerDiscussionTools?: readonly string[]
}

/**
 * Boot the real runtime with the collaboration plugin and one agent.
 * @param options - harness variations.
 * @returns a driver; call `dispose()` when done.
 */
export async function createCollaborationHarness(options: HarnessOptions = {}): Promise<CollaborationHarness> {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-collaboration-harness-'))
  const adapter = new ScriptedAdapter()
  const executed: string[] = []
  const ctx = new Context()
  try {
    const modules = new Map<string, unknown>([
      ['llm', LlmRuntime], ['session', SessionStore], ['projection', SessionProjectionRegistry],
      ['prompt', SystemPrompt], ['tools', ToolRuntime], ['agents', AgentRegistry],
      ['persistence', JsonlSessionPersistence], ['loop', AgentLoop], ['collaboration', collaboration],
      ['storage', Storage], ['storage-json', StorageJson], ['storage-domain', StorageDomain],
      ['default-model', AgentDefaultModel], ['query', SqliteSessionQuery], ['typert', TypertRegistry],
      ['ordinary-resolver', { inject: ['agents', 'sessions', 'sessionQuery', 'sessionProjections', 'agentDefaultModel', 'typert'], apply(context: Context) {
        installModelSelectionProjection(context)
        const resolver = new ApiSessionAgentController(context)
        context.provide('sessionController', { resolveAgent: resolver.resolveAgent.bind(resolver) } as SessionController)
      } }],
    ])
    const rows = [...modules.keys()]
      .filter(name => name !== 'collaboration' || options.withCollaboration !== false)
      .map(name => ({ name, ...(name === 'persistence'
        ? { config: { root: join(workspace, 'sessions'), compression: 'none' } }
        : name === 'default-model' ? { config: { provider: 'mock', model: 'mock' } }
          : name === 'query' ? { config: { path: ':memory:', openAt: 'never' } }
            : name === 'loop' ? { config: { agents: [] } }
              : name === 'storage-json' ? { config: { root: join(workspace, 'storage') } }
                : name === 'storage-domain' ? { config: { backend: 'json' } }
                  : name === 'collaboration' ? { config: { maxFramedMessageBytes: 16384, peerDiscussionTools: options.peerDiscussionTools ?? ['read'], stateLimits: { maxStateBytes: 1000000, maxJournalEntries: 1000, maxRequests: 1000 } } } : {}) }))
    const configPath = join(workspace, 'cordis.yml')
    await writeFile(configPath, JSON.stringify(rows))
    ctx.baseUrl = pathToFileURL(workspace).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unknown fixture plugin ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()
    if (options.withCollaboration !== false && ctx.get('collaborationStore') === undefined) throw new Error('collaboration plugin did not activate')
    const inactive = [...ctx.loader.entries()].filter(entry => !entry.disabled && entry.fiber === undefined)
    if (inactive.length > 0) throw new Error(`inactive fixture plugins: ${inactive.map(entry => entry.options.name).join(', ')}`)
    ctx.llm.registerAdapter(['mock'], adapter)
    let failWrite: Error | undefined
    const instrument = (stored: SessionHandle): SessionHandle => {
      if (stored.access !== 'write') return stored
      const append = stored.append.bind(stored)
      stored.append = async (events, appendOptions) => {
        if (failWrite !== undefined) {
          const error = failWrite
          failWrite = undefined
          throw error
        }
        await append(events, appendOptions)
      }
      return stored
    }
    const create = ctx.sessionPersistence.create.bind(ctx.sessionPersistence)
    const open = ctx.sessionPersistence.open.bind(ctx.sessionPersistence)
    ctx.sessionPersistence.create = async (...args) => instrument(await create(...args))
    ctx.sessionPersistence.open = async (...args) => instrument(await open(...args))
    for (const name of ['read', 'write', 'bash', 'cordis_run', 'delegate', 'publish', 'collaboration_status', 'peer_send']) {
      ctx.tools.register(defineContentToolFixture({
        name,
        description: `fixture ${name}`,
        parameters: {},
        async execute(args) {
          executed.push(name)
          if (name === 'write') {
            await writeFile(join(workspace, (args as { file_path?: string }).file_path ?? 'unnamed'), 'x')
          }
          return [{ type: 'text' as const, text: `${name} ran` }]
        },
      }))
    }
    let handle: AgentHandle = await ctx.agents.create({
      sessionId: SessionId('collaboration-harness'), meta: { cwd: workspace },
      agentOptions: { provider: 'mock', model: 'mock' },
    })

    const send = async (messages: UserMessage[]): Promise<void> => {
      for (const message of messages.slice(0, -1)) handle.agent.inject(message)
      handle.agent.followup(messages[messages.length - 1]!)
      await handle.agent.whenIdle()
    }
    const peer = (text: string): UserMessage => createUserMessage({
      content: [{ type: 'text', text }],
      // Peer messages carry a source kind that is neither user, plugin, nor tool; Task 4 declares the real one.
      source: { kind: 'peer', from: 'fixture-peer' } as never,
    })
    const human = (text: string): UserMessage => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })

    return {
      ctx,
      get agent() { return handle.agent },
      requests: adapter.requests,
      admitUiDiscussion: () => createHumanControlAdmission('discussion'),
      controlDiscussion: (admission) => { requireHumanControl(admission) },
      deliverHumanTurn: text => send([human(text)]),
      deliverPeerDiscussion: text => send([peer(text)]),
      deliverMixedTurn: (humanText, peerText) => send([peer(peerText), human(humanText)]),
      deliverHumanWithContext: text => send([
        createUserMessage({ content: [{ type: 'text', text: 'trusted context' }], source: { kind: 'plugin', plugin: 'fixture' } }), human(text),
      ]),
      scriptModelToolCall: (name, args) => { adapter.steps.push({ kind: 'tool', name, args }, { kind: 'text' }) },
      holdModelRequest() {
        const started = Promise.withResolvers<undefined>()
        const stopped = Promise.withResolvers<undefined>()
        adapter.steps.push({ kind: 'pending', started: () => { started.resolve(undefined) }, stopped: () => { stopped.resolve(undefined) } })
        return { started: started.promise, stopped: stopped.promise }
      },
      async executeCurrentTool(name, args) {
        const result = await ctx.tools.execute({
          signal: new AbortController().signal, callId: ToolCallId(`direct-${name}`), name, arguments: args, agent: handle.agent,
        })
        return { accepted: !result.isError, result }
      },
      executed,
      async workspaceFileExists(name) {
        try {
          await access(join(workspace, name))
          return true
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
          throw error
        }
      },
      async createSession(id) {
        await handle.dispose()
        handle = await ctx.agents.create({ sessionId: SessionId(id), meta: { cwd: workspace }, agentOptions: { provider: 'mock', model: 'mock' } })
      },
      async resumeSession(interruptedEvents) {
        const id = interruptedEvents === undefined ? handle.agent.session.id : SessionId('interrupted-collaboration')
        await handle.dispose()
        if (interruptedEvents !== undefined) {
          const session = ctx.sessions.prepare(id, { meta: { cwd: workspace } })
          const stored = await ctx.sessionPersistence.create(session.header)
          try { await stored.append(interruptedEvents) } finally { await stored.close() }
        }
        handle = await ctx.agents.resume({ resumeSessionId: id, agentOptions: { provider: 'mock', model: 'mock' } })
      },
      failNextDurableWrite: (error) => { failWrite = error },
      async storedEvents() {
        await ctx.sessionPersistence.flush()
        const stored = await ctx.sessionPersistence.open(handle.agent.session.id, 'read')
        try { return (await stored.read()).events } finally { await stored.close() }
      },
      async unloadCollaboration() {
        const entry = [...ctx.loader.entries()].find(candidate => candidate.options.name === 'collaboration')
        await entry?.fiber?.dispose()
      },
      async dispose() {
        try { await ctx.fiber.dispose() } finally { await rm(workspace, { recursive: true, force: true }) }
      },
    }
  } catch (error) {
    try { await ctx.fiber.dispose() } finally { await rm(workspace, { recursive: true, force: true }) }
    throw error
  }
}

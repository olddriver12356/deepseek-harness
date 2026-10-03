/**
 * Real-composition test harness with production AgentLoop, ToolRuntime, and the collaboration plugin.
 * The plugin loads through the Loader export path. Only the model adapter and three tool bodies are fixtures.
 */
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk, UserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import * as collaboration from '../../src/index.ts'

/** The model's next reply: plain text, or one tool call followed by a closing text reply. */
type ModelStep = { readonly kind: 'text' } | { readonly kind: 'tool'; readonly name: string; readonly args: object }

class ScriptedAdapter extends LlmAdapter {
  readonly steps: ModelStep[] = []
  override async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    const step = this.steps.shift() ?? { kind: 'text' }
    if (step.kind === 'tool') {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield {
        type: 'block-end', index: 0,
        block: { type: 'tool-call', id: ToolCallId(`call-${String(Date.now())}`), name: step.name, arguments: JSON.stringify(step.args) },
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
  /** Deliver one user-typed message as a new turn and wait for the agent to go idle. */
  deliverHumanTurn(text: string): Promise<void>
  /** Deliver one message that did not come from the user, as a peer message will, and wait for idle. */
  deliverPeerDiscussion(text: string): Promise<void>
  /** Deliver a user message and a peer message in the same inbox batch, then wait for idle. */
  deliverMixedTurn(humanText: string, peerText: string): Promise<void>
  /** Queue the model's next reply as a call to `name`; the following reply is plain text. */
  scriptModelToolCall(name: string, args: object): void
  /** Execute a tool directly through the Executor on behalf of the agent, as dynamic code or a loopback call would. */
  executeCurrentTool(name: string, args: object): Promise<ToolOutcome>
  /** Tool names whose bodies actually ran, in order. */
  readonly executed: readonly string[]
  workspaceFileExists(name: string): Promise<boolean>
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
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['mock'], adapter)
  for (const name of ['read', 'write', 'bash']) {
    ctx.tools.register(defineContentToolFixture({
      name,
      description: `fixture ${name}`,
      parameters: {},
      async execute(args) {
        executed.push(name)
        if (name === 'write') {
          await writeFile(join(workspace, String((args as { file_path?: string }).file_path ?? 'unnamed')), 'x')
        }
        return [{ type: 'text' as const, text: `${name} ran` }]
      },
    }))
  }
  let fiber: { dispose(): Promise<void> | void } | undefined
  if (options.withCollaboration !== false) {
    const loader = Object.create(Loader.prototype) as Loader
    const plugin = loader.unwrapExports(collaboration) as Parameters<Context['plugin']>[0]
    fiber = await ctx.plugin(plugin, { peerDiscussionTools: options.peerDiscussionTools ?? ['read'] })
  }
  const agent: Agent = await ctx.agentLoop.create(SessionId('collaboration-harness'), { provider: 'mock', model: 'mock' })

  const send = async (messages: UserMessage[]): Promise<void> => {
    for (const message of messages) agent.followup(message)
    await agent.whenIdle()
  }
  const peer = (text: string): UserMessage => createUserMessage({
    content: [{ type: 'text', text }],
    // Peer messages carry a source kind that is neither user, plugin, nor tool; Task 4 declares the real one.
    source: { kind: 'peer', from: 'fixture-peer' } as never,
  })
  const human = (text: string): UserMessage => createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })

  return {
    ctx,
    deliverHumanTurn: text => send([human(text)]),
    deliverPeerDiscussion: text => send([peer(text)]),
    deliverMixedTurn: (humanText, peerText) => send([human(humanText), peer(peerText)]),
    scriptModelToolCall: (name, args) => { adapter.steps.push({ kind: 'tool', name, args }, { kind: 'text' }) },
    async executeCurrentTool(name, args) {
      const result = await ctx.tools.execute({
        signal: new AbortController().signal, callId: ToolCallId(`direct-${name}`), name, arguments: args, agent,
      })
      return { accepted: !result.isError, result }
    },
    executed,
    async workspaceFileExists(name) {
      try {
        await access(join(workspace, name))
        return true
      } catch (_error) {
        // Absence is the answer this probe reports.
        return false
      }
    },
    async unloadCollaboration() { await fiber?.dispose() },
    async dispose() {
      await ctx.fiber.dispose()
      await rm(workspace, { recursive: true, force: true })
    },
  }
}

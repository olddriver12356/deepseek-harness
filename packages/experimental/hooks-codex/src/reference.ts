/** Human-only metadata for registered synchronous Codex command handlers. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-plugin-inventory'
import type { HookType } from '@deepseek-ai/dsh-host-plugin-inventory/types'
import type { CodexHookConfig } from './config.ts'

const events: Readonly<Record<string, { type: HookType; en: readonly [string, string]; zh: readonly [string, string] }>> = {
  SessionStart: {
    type: 'session',
    en: ['After Agent creation, matched against its creation source; runs detached.', 'May inject structured additional context or successful plain stdout into the Agent.'],
    zh: ['Agent 创建后触发，按创建来源匹配，独立运行。', '可以向 Agent 注入结构化附加上下文或成功运行的纯文本 stdout。'],
  },
  UserPromptSubmit: {
    type: 'prompt',
    en: ['At pre-step admission when pending user messages are present; matchers are ignored.', 'May reject admission or append structured context/successful plain stdout to an accepted downstream decision.'],
    zh: ['步骤准入时存在待处理用户消息则触发；忽略匹配器。', '可以拒绝准入，或向下游接受的决定追加结构化上下文或成功运行的纯文本 stdout。'],
  },
  PreToolUse: {
    type: 'tool',
    en: ['Before tool execution, matched by regex against the literal tool name.', 'May deny execution; allow/ask decisions and input rewriting are not honored.'],
    zh: ['工具执行前触发，按正则匹配原始工具名。', '可以拒绝执行；不执行 allow、ask 决定或输入重写。'],
  },
  PostToolUse: {
    type: 'tool',
    en: ['After tool execution, matched by regex against the literal tool name.', 'May block the result with feedback or attach context; tool side effects are not undone.'],
    zh: ['工具执行后触发，按正则匹配原始工具名。', '可以用反馈阻止结果或附加上下文，不撤销工具副作用。'],
  },
  Stop: {
    type: 'turn-completion',
    en: ['At the turn-stopping boundary; matchers are ignored.', 'A deny decision steers input to force another step. stop_hook_active is always false; hooks must self-limit.'],
    zh: ['轮次即将停止的边界触发；忽略匹配器。', '拒绝决定通过注入输入强制下一步骤；stop_hook_active 始终为 false，钩子必须自行限制续轮。'],
  },
}

/**
 * Publish only parsed supported handlers, with no raw command or inferred execution record.
 * @param ctx - adapter owner whose effects own the references.
 * @param config - successfully parsed runnable handlers, or null for a failed configuration read.
 */
export function registerReferences(ctx: Context, config: CodexHookConfig | null): void {
  ctx.inject(['pluginInventory'], (scope) => {
    const inventory = scope.get('pluginInventory')
    if (inventory === undefined) return
    if (config === null) {
      inventory.registerReference({
        kind: 'hook', moduleName: '@deepseek-ai/dsh-hooks-codex',
        summary: () => { throw new Error('Hook configuration unavailable') },
        detail: () => { throw new Error('Hook configuration unavailable') },
      })
      return
    }
    for (const [event, groups] of Object.entries(config)) {
      const metadata = events[event]
      if (metadata === undefined) continue
      groups.forEach((group, groupIndex) => { group.hooks.forEach((_hook, hookIndex) => {
        inventory.registerReference({
          kind: 'hook', moduleName: '@deepseek-ai/dsh-hooks-codex',
          summary: locale => ({
            name: `${event} · ${groupIndex + 1}.${hookIndex + 1}`,
            description: metadata[locale][0], documentation: 'supplied', types: [metadata.type], events: [event], enabled: true,
          }),
          detail: locale => ({
            adapter: 'codex', ...group.matcher === undefined ? {} : { matcher: group.matcher },
            trigger: metadata[locale][0], effects: [metadata[locale][1]],
            limitations: locale === 'en'
              ? ['Only synchronous command hooks run; no environment or command substitution is supplied.', 'systemMessage and continue:false are not honored.', 'Invocation IDs do not identify configured handlers; detached SessionStart has no durable run pair.']
              : ['仅运行同步命令钩子，不提供环境或命令替换。', '不执行 systemMessage 和 continue:false。', '调用 ID 不标识配置的处理器，独立的 SessionStart 没有持久化运行记录对。'],
            lastExecution: { kind: 'unavailable', reason: 'uncorrelated-history' },
          }),
        })
      }) })
    }
  })
}

/** Human-only metadata for registered Claude Code command handlers. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-plugin-inventory'
import type { HookType } from '@deepseek-ai/dsh-host-plugin-inventory/types'
import type { ClaudeCodeHookConfig } from './config.ts'

const events: Readonly<Record<string, { type: HookType; en: readonly [string, string]; zh: readonly [string, string] }>> = {
  SessionStart: {
    type: 'session',
    en: ['After Agent creation, matched against its creation source.', 'May inject additional context into the created Agent.'],
    zh: ['Agent 创建后触发，按创建来源匹配。', '可以向新建 Agent 注入附加上下文。'],
  },
  UserPromptSubmit: {
    type: 'prompt',
    en: ['At pre-step admission when pending user messages are present; matchers are ignored.', 'May reject admission or append context to an accepted downstream decision.'],
    zh: ['步骤准入时存在待处理用户消息则触发；忽略匹配器。', '可以拒绝准入，或向下游已接受的决定追加上下文。'],
  },
  PreToolUse: {
    type: 'tool',
    en: ['Before tool execution, matched against the literal tool name.', 'May deny execution or request approval; otherwise delegates to later listeners.'],
    zh: ['工具执行前触发，按原始工具名匹配。', '可以拒绝执行或请求审批；否则委托后续监听器。'],
  },
  PostToolUse: {
    type: 'tool',
    en: ['After tool execution, matched against the literal tool name.', 'May block the result with feedback or attach additional context; it does not undo tool side effects.'],
    zh: ['工具执行后触发，按原始工具名匹配。', '可以用反馈阻止结果或附加上下文，但不会撤销工具的副作用。'],
  },
  Stop: {
    type: 'turn-completion',
    en: ['At the turn-stopping boundary; matchers are ignored.', 'A deny decision steers new input to force another step. Hooks must self-limit continuations.'],
    zh: ['轮次即将停止的边界触发；忽略匹配器。', '拒绝决定会注入新输入并强制继续下一步骤；钩子必须自行限制续轮。'],
  },
  SubagentStart: {
    type: 'subagent',
    en: ['On the subagent start edge, matched against general-purpose; runs detached.', 'May inject additional context into the child when its Agent is available.'],
    zh: ['子 Agent 开始边沿触发，按 general-purpose 匹配，独立运行。', '子 Agent 可用时可以向其注入附加上下文。'],
  },
  SubagentStop: {
    type: 'subagent',
    en: ['On the subagent end edge after child disposal, matched against general-purpose; runs detached.', 'Observes completion using the child’s committed directory; does not veto completion or inject context.'],
    zh: ['子 Agent 释放后的结束边沿触发，按 general-purpose 匹配，独立运行。', '使用子 Agent 已提交的目录观察完成，不否决完成或注入上下文。'],
  },
}

/**
 * Publish each parsed command handler without its command or invocation history.
 * @param ctx - adapter owner whose effects own these registrations.
 * @param config - successfully parsed runnable handlers, or null for a failed configuration read.
 */
export function registerReferences(ctx: Context, config: ClaudeCodeHookConfig | null): void {
  ctx.inject(['pluginInventory'], (scope) => {
    const inventory = scope.get('pluginInventory')
    if (inventory === undefined) return
    if (config === null) {
      inventory.registerReference({
        kind: 'hook', moduleName: '@deepseek-ai/dsh-hooks-claude-code',
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
          kind: 'hook', moduleName: '@deepseek-ai/dsh-hooks-claude-code',
          summary: locale => ({
            name: `${event} · ${groupIndex + 1}.${hookIndex + 1}`,
            description: metadata[locale][0], documentation: 'supplied', types: [metadata.type], events: [event], enabled: true,
          }),
          detail: locale => ({
            adapter: 'claude-code', ...group.matcher === undefined ? {} : { matcher: group.matcher },
            trigger: metadata[locale][0], effects: [metadata[locale][1]],
            limitations: locale === 'en'
              ? ['updatedInput, systemMessage and continue:false are not honored.', 'Invocation IDs do not identify configured handlers. Detached lifecycle hooks have no durable run pair.']
              : ['不执行 updatedInput、systemMessage 和 continue:false。', '调用 ID 不标识配置的处理器，独立生命周期钩子没有持久化运行记录对。'],
            lastExecution: { kind: 'unavailable', reason: 'uncorrelated-history' },
          }),
        })
      }) })
    }
  })
}

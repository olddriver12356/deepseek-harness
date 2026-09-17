/**
 * Ponytail's lazy-senior-dev ruleset for DeepSeek Harness, adopted the same
 * way ponytail's own Claude Code / Codex adapters work: an always-on ruleset
 * section rebuilt from the shared skill body on every turn, plus a
 * `/ponytail <level>` command tracked across turns. See
 * `packages/experimental/dsh-ponytail/README.md` in github.com/olddriver12356/ponytail — DSH has
 * no row there, so this plugin is the local adapter, built on DSH's own
 * `systemPrompt.section()` seam (the same one `dsh-persona` uses) in place of
 * ponytail's SessionStart/UserPromptSubmit hooks.
 *
 * @module @deepseek-ai/dsh-ponytail
 */

import { join } from 'node:path'
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { DEFAULT_MODE, getPonytailInstructions, isDeactivationCommand, parsePonytailCommand, RUNTIME_MODES, type PonytailMode } from './instructions.ts'
import { readMode, writeMode } from './state.ts'

export { DEFAULT_MODE, RUNTIME_MODES, type PonytailMode }

/** Cordis plugin name. */
export const name = 'dsh-ponytail'

/** The prompt registry this row contributes to. */
export const inject = ['systemPrompt', 'session']

/** Plugin config. */
export interface Config {
  /** Level applied when no `/ponytail <level>` switch has run yet this DSH home. */
  defaultMode?: PonytailMode
  /** Absolute path to ponytail's `skills/ponytail/SKILL.md`. Defaults to the shared `~/.agents/skills` store. */
  skillPath?: string
  /** Absolute path to the live mode flag file. Defaults to `<dshHome>/ponytail-active`. */
  statePath?: string
}

export const Config: z<Config> = z.object({
  defaultMode: z.union([...RUNTIME_MODES]).default(DEFAULT_MODE),
  skillPath: z.string().default(''),
  statePath: z.string().default(''),
})

function defaultSkillPath(): string {
  return join(homedir(), '.agents', 'skills', 'ponytail', 'SKILL.md')
}

function textOf(event: SessionEvent): string | undefined {
  if (event.type !== 'user/message') return undefined
  return event.data.content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

/**
 * Register the always-on ponytail section and track `/ponytail <level>` switches.
 * @param ctx - plugin context; unscoped, so the ruleset applies to every agent.
 * @param config - level default and shared-file overrides.
 */
export function apply(ctx: Context, config: Config): void {
  const skillPath = config.skillPath || defaultSkillPath()
  const statePath = config.statePath || dshHomePath('ponytail-active')
  const defaultMode = config.defaultMode ?? DEFAULT_MODE

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'ponytail:ruleset',
    order: ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX') + 1,
    text: () => getPonytailInstructions(skillPath, readMode(statePath, defaultMode)),
  }), 'ponytail.section()')

  ctx.on('session/event', (_session, event) => {
    const text = textOf(event)
    if (text === undefined) return
    if (isDeactivationCommand(text)) {
      writeMode(statePath, 'off')
      return
    }
    const mode = parsePonytailCommand(text)
    if (mode !== undefined) writeMode(statePath, mode)
  })
}

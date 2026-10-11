/**
 * Ponytail ruleset text, ported from ponytail's shared Claude/Codex instruction
 * builder (`hooks/ponytail-instructions.js` in github.com/olddriver12356/ponytail).
 * Reads the same `skills/ponytail/SKILL.md` body other hosts read, so the
 * ruleset text has one source of truth on this machine.
 */

import { readFileSync } from 'node:fs'

/**
 * Accepted persistent Ponytail modes, including explicit deactivation.
 */
export const RUNTIME_MODES = ['off', 'lite', 'full', 'ultra'] as const
/**
 * One accepted Ponytail mode.
 */
export type PonytailMode = typeof RUNTIME_MODES[number]

/**
 * Intensity selected when an activation command omits a valid level.
 */
export const DEFAULT_MODE: PonytailMode = 'full'

/**
 * Normalize a stored or requested mode without accepting unknown levels.
 * @param value - Optional mode text.
 * @returns Recognized mode, or undefined for an absent or invalid value.
 */
export function normalizeMode(value: string | undefined): PonytailMode | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim().toLowerCase()
  return (RUNTIME_MODES as readonly string[]).includes(normalized) ? normalized as PonytailMode : undefined
}

// "stop ponytail" / "normal mode" turn ponytail off, but only as the whole
// message — matching the phrase anywhere would turn it off mid-task for an
// ordinary request like "add a normal mode toggle".
/**
 * Recognize a whole-message deactivation command, ignoring case and trailing punctuation.
 * @param text - Complete user message.
 * @returns Whether the message requests deactivation.
 */
export function isDeactivationCommand(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[.!?\s]+$/, '')
  return normalized === 'stop ponytail' || normalized === 'normal mode'
}

const COMMAND = /^[/@$]ponytail\b/i

/**
 * Parse a Ponytail activation message and its optional level.
 * @param text - Complete user message.
 * @returns Requested mode, or undefined when the message is not an activation command.
 */
export function parsePonytailCommand(text: string): PonytailMode | undefined {
  const trimmed = text.trim().toLowerCase()
  if (!COMMAND.test(trimmed)) return undefined
  const [, arg] = trimmed.split(/\s+/)
  return normalizeMode(arg) ?? DEFAULT_MODE
}

/** Drop intensity-table rows and worked examples that belong to a different mode. */
function filterSkillBodyForMode(body: string, mode: PonytailMode): string {
  const withoutFrontmatter = body.replace(/^---[\s\S]*?---\s*/, '')
  return withoutFrontmatter
    .split(/\r?\n/)
    .filter((line) => {
      const tableLabel = /^\|\s*\*\*(.+?)\*\*\s*\|/.exec(line)
      if (tableLabel?.[1] !== undefined) {
        const labelMode = normalizeMode(tableLabel[1].trim())
        if (labelMode) return labelMode === mode
      }
      const exampleLabel = /^-\s*([^:]+):\s*/.exec(line)
      if (exampleLabel?.[1] !== undefined) {
        const labelMode = normalizeMode(exampleLabel[1].trim())
        if (labelMode) return labelMode === mode
      }
      return true
    })
    .join('\n')
}

/**
 * Render the active ruleset with a bounded fallback when the shared skill is unavailable.
 * @param skillPath - Absolute path to the shared Ponytail skill.
 * @param mode - Requested mode; off produces empty text.
 * @returns Mode-specific instructions or the fallback ruleset.
 */
export function getPonytailInstructions(skillPath: string, mode: PonytailMode): string {
  if (mode === 'off') return ''
  const header = `PONYTAIL MODE ACTIVE — level: ${mode}\n\n`
  try {
    return header + filterSkillBodyForMode(readFileSync(skillPath, 'utf8'), mode)
  } catch {
    // Skill store not present on this machine (skill path moved or unmounted):
    // degrade to the ladder's essence rather than silently drop the rules.
    return header
      + 'You are a lazy senior developer. Lazy means efficient, not careless. The best code is the code never written.\n\n'
      + 'The ladder: (1) does this need to exist? (2) already in this codebase? (3) stdlib? (4) native platform feature? '
      + '(5) already-installed dependency? (6) one line? (7) only then, minimum code that works. '
      + 'Bug fix = root cause: fix the shared function once, not every caller.'
  }
}

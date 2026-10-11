/**
 * Live mode flag, ported from ponytail's `hooks/ponytail-runtime.js` state file
 * (Claude/Codex/Copilot each keep one flat mode file in their own plugin-data
 * dir). DSH's equivalent is `<dshHome>/ponytail-active`.
 */

import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { normalizeMode, type PonytailMode } from './instructions.ts'

/**
 * Read the persistent mode, using the supplied fallback for unreadable or invalid state.
 * @param statePath - Machine-local mode file.
 * @param fallback - Mode to use when no valid state can be read.
 * @returns Effective mode.
 */
export function readMode(statePath: string, fallback: PonytailMode): PonytailMode {
  try {
    return normalizeMode(readFileSync(statePath, 'utf8').trim()) ?? fallback
  } catch {
    return fallback
  }
}

/**
 * Persist an active mode or remove its state file when deactivated.
 * @param statePath - Machine-local mode file.
 * @param mode - Mode to persist.
 */
export function writeMode(statePath: string, mode: PonytailMode): void {
  if (mode === 'off') {
    try { unlinkSync(statePath) } catch { /* already absent */ }
    return
  }
  mkdirSync(dirname(statePath), { recursive: true })
  writeFileSync(statePath, mode)
}

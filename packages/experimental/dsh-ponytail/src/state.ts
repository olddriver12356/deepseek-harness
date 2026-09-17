/**
 * Live mode flag, ported from ponytail's `hooks/ponytail-runtime.js` state file
 * (Claude/Codex/Copilot each keep one flat mode file in their own plugin-data
 * dir). DSH's equivalent is `<dshHome>/ponytail-active`.
 */

import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { normalizeMode, type PonytailMode } from './instructions.ts'

export function readMode(statePath: string, fallback: PonytailMode): PonytailMode {
  try {
    return normalizeMode(readFileSync(statePath, 'utf8').trim()) ?? fallback
  } catch {
    return fallback
  }
}

export function writeMode(statePath: string, mode: PonytailMode): void {
  if (mode === 'off') {
    try { unlinkSync(statePath) } catch { /* already absent */ }
    return
  }
  mkdirSync(dirname(statePath), { recursive: true })
  writeFileSync(statePath, mode)
}

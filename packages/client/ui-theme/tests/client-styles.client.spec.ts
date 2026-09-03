// @vitest-environment jsdom
/** Dynamic ui-theme entry owns the global styles in dependency order. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { installThemeStyles } from '../src/client/styles.ts'

const PLUGIN_ID = '@deepseek-ai/dsh-client-ui-theme'

afterEach(() => {
  document.head.querySelectorAll(`style[data-plugin="${PLUGIN_ID}"]`).forEach((node) => { node.remove() })
})

describe('ui-theme client styles', () => {
  it('mounts every global sheet in dependency order and removes them on dispose', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin({
      apply(scope) { installThemeStyles(scope) },
    })
    await fiber.await()

    const styles = [...document.head.querySelectorAll<HTMLStyleElement>(`style[data-plugin="${PLUGIN_ID}"]`)]
    expect(styles.map(style => style.dataset.pluginCss)).toEqual([
      `${PLUGIN_ID}/base.css`,
      `${PLUGIN_ID}/design-platform.css`,
      `${PLUGIN_ID}/scrollbar.css`,
      `${PLUGIN_ID}/gradient-shadow-text.css`,
      `${PLUGIN_ID}/shiki.css`,
    ])
    await fiber.dispose()
    expect(document.head.querySelectorAll(`style[data-plugin="${PLUGIN_ID}"]`)).toHaveLength(0)
  })

  it('owns the fixed Knowledge art palette and display-font alias', () => {
    const source = readFileSync(resolve(process.cwd(), 'packages/client/ui-theme/src/styles/design-platform.css'), 'utf8')
    for (const declaration of [
      '--dsw-specific-knowledge-canvas: rgb(25, 28, 35);',
      '--dsw-specific-knowledge-surface: rgb(34, 38, 46);',
      '--dsw-specific-knowledge-surface-raised: rgb(41, 46, 55);',
      '--dsw-specific-knowledge-text: rgb(241, 234, 220);',
      '--dsw-specific-knowledge-muted: rgb(166, 169, 179);',
      '--dsw-specific-knowledge-line: rgb(255 255 255 / 11%);',
      '--dsw-specific-knowledge-card-line: rgb(255 255 255 / 14%);',
      '--dsw-specific-knowledge-contrast: rgb(255, 255, 255);',
      '--dsw-specific-knowledge-acid: rgb(210, 255, 0);',
      '--dsw-specific-knowledge-blue: rgb(36, 57, 255);',
      '--dsw-specific-knowledge-pink: rgb(255, 43, 139);',
      '--dsw-specific-knowledge-cyan: rgb(50, 228, 210);',
      '--dsw-specific-knowledge-yellow: rgb(255, 214, 41);',
      '--dsw-specific-knowledge-collage-fade-top: rgb(25 28 35 / 20%);',
      '--dsw-specific-knowledge-collage-fade-bottom: rgb(25 28 35 / 62%);',
      "--dsw-specific-knowledge-display-font: 'DSH Knowledge Fusion Pixel', var(--dsw-font-family);",
    ]) expect(source).toContain(declaration)
  })

  it('owns the Agent panel art palette and display-font alias', () => {
    const source = readFileSync(resolve(process.cwd(), 'packages/client/ui-theme/src/styles/design-platform.css'), 'utf8')
    for (const declaration of [
      '--dsw-specific-agent-canvas: rgb(25, 28, 35);',
      '--dsw-specific-agent-surface: rgb(34, 38, 46);',
      '--dsw-specific-agent-surface-raised: rgb(41, 46, 55);',
      '--dsw-specific-agent-text: rgb(241, 234, 220);',
      '--dsw-specific-agent-muted: rgb(166, 169, 179);',
      '--dsw-specific-agent-line: rgb(255 255 255 / 11%);',
      '--dsw-specific-agent-acid: rgb(210, 255, 0);',
      '--dsw-specific-agent-blue: rgb(36, 57, 255);',
      '--dsw-specific-agent-pink: rgb(255, 43, 139);',
      '--dsw-specific-agent-cyan: rgb(50, 228, 210);',
      '--dsw-specific-agent-yellow: rgb(255, 214, 41);',
      "--dsw-specific-agent-display-font: 'DSH Agent Fusion Pixel', var(--dsw-font-family);",
    ]) expect(source).toContain(declaration)
  })
})

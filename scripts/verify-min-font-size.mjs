import assert from 'node:assert/strict'
import { globSync, readFileSync, writeFileSync } from 'node:fs'

// Audit authored app CSS, not generated bundles or third-party stylesheets.
const files = globSync(['packages/**/src/**/*.css', 'apps/**/src/**/*.css'], {
  // Owner-requested compact typography exceptions for navigation and news cards.
  exclude: ['**/node_modules/**', '**/vendor/**', '**/lib/**', '**/dist/**', '**/AppRail.module.css', '**/NewsPanel.module.css'],
})
const changed = []
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const clamped = source.replaceAll('max(13px,', 'max(14px,')
    .replace(/(?<!max\(14px, )var\(--dsh-content-font-size, 14px\)/g, 'max(14px, var(--dsh-content-font-size, 14px))')
  const next = clamped.replace(/((?:^|[;{}\n])\s*)([\w-]+)(\s*:\s*)([^;{}]+)/g, (all, prefix, property, colon, value) => {
    const size = property === 'font-size' || property.endsWith('-font-size')
    const font = property === 'font' || (property.startsWith('--dsw-font-') && !/-(?:family|weight|height|style)$/.test(property))
    if (!size && !font) return all
    // Fixed sizes only: relative expressions are checked in the browser and at their owning tokens.
    const match = size ? /^(\d*\.?\d+)px\b/.exec(value) : /(?:^|\s)(\d*\.?\d+)px\b/.exec(value)
    if (!match || Number(match[1]) >= 14) return all
    const offset = match.index + match[0].indexOf(match[1])
    return prefix + property + colon + value.slice(0, offset) + '14' + value.slice(offset + match[1].length)
  })
  if (next !== source) {
    changed.push(file)
    if (process.argv.includes('--write')) writeFileSync(file, next)
  }
}
if (!process.argv.includes('--write')) assert.deepEqual(changed, [], 'Authored CSS contains font sizes below the 14px usage-filter baseline')
console.log(`${files.length} CSS files audited; ${changed.length} files ${process.argv.includes('--write') ? 'updated' : 'below minimum'}.`)

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('AppFrame overlay geometry', () => {
  it('starts after the persistent AppRail while retaining the absolute overlay', () => {
    const css = readFileSync(new URL('../src/client/AppFrame.module.css', import.meta.url), 'utf8')

    expect(css).toMatch(/\.overlayLayer\s*\{[^}]*grid-column:\s*2\s*\/\s*-1/s)
    expect(css).toMatch(/\.overlayLayer\s*\{[^}]*grid-row:\s*1/s)
    expect(css).toMatch(/\.overlayLayer\s*\{[^}]*position:\s*absolute/s)
    expect(css).toMatch(/\.overlayLayer\s*\{[^}]*inset:\s*0/s)
  })

  it('owns the phone sidebar drawer above the center column', () => {
    const css = readFileSync(new URL('../src/client/AppFrame.module.css', import.meta.url), 'utf8')

    expect(css).toMatch(/\.frame\[data-sidebar-drawer]\s+\.sidebarCol\s*\{[^}]*position:\s*absolute/s)
    expect(css).toMatch(/\.frame\[data-sidebar-drawer]\s+\.sidebarCol\s*\{[^}]*left:\s*72px/s)
    expect(css).toMatch(/\.frame\[data-sidebar-drawer-open]\s+\.sidebarCol\s*\{[^}]*box-shadow:/s)
  })
})

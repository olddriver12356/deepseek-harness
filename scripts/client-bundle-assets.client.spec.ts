import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { clientBundle } from '../packages/client/tsdown.client.ts'

interface EmittedAsset {
  type: 'asset'
  fileName: string
  source: Uint8Array
  originalFileName: string
}

interface CssPlugin {
  name: string
  resolveId?: (source: string, importer?: string) => string | null
  load?: (this: {
    addWatchFile(id: string): void
    emitFile(file: EmittedAsset): string
  }, id: string) => Promise<string | null>
}

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

function cssPlugin(): CssPlugin {
  const configs = clientBundle(
    '@deepseek-ai/dsh-client-test',
    ['lib/types/index.js', 'lib/types/invariant.js'],
  )({ env: { DSH_BUILD_FACE: 'client' } })
  const client = configs.find(config => config.platform === 'browser')
  if (client === undefined) throw new Error('client config missing')
  const plugins = (client as { plugins: CssPlugin[] }).plugins
  const plugin = plugins.find(candidate => candidate.name === 'dsh-css-modules-inline')
  if (plugin?.resolveId === undefined || plugin.load === undefined) {
    throw new Error('CSS Modules plugin hooks are incomplete')
  }
  return plugin
}

async function fixture(css: string): Promise<{
  stylesheet: string
  importer: string
  png: string
  font: string
  pngBytes: Uint8Array
  fontBytes: Uint8Array
}> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-client-assets-'))
  roots.push(root)
  const client = join(root, 'packages', 'client', 'test-fixture', 'src', 'client')
  const assets = join(client, 'assets')
  await mkdir(assets, { recursive: true })
  const stylesheet = join(client, 'Fixture.module.css')
  const importer = join(client, 'index.ts')
  const png = join(assets, 'panel.png')
  const font = join(assets, 'display.woff2')
  const pngBytes = Uint8Array.of(0x89, 0x50, 0x4e, 0x47)
  const fontBytes = Uint8Array.of(0x77, 0x4f, 0x46, 0x32)
  await Promise.all([
    writeFile(stylesheet, css),
    writeFile(png, pngBytes),
    writeFile(font, fontBytes),
  ])
  return { stylesheet, importer, png, font, pngBytes, fontBytes }
}

async function loadCss(css: string): Promise<{
  output: string
  watched: string[]
  emitted: EmittedAsset[]
  files: Awaited<ReturnType<typeof fixture>>
}> {
  const files = await fixture(css)
  const plugin = cssPlugin()
  const virtualId = plugin.resolveId!('./Fixture.module.css', files.importer)
  if (typeof virtualId !== 'string') throw new Error('CSS Modules virtual id missing')
  const watched: string[] = []
  const emitted: EmittedAsset[] = []
  const output = await plugin.load!.call({
    addWatchFile: id => watched.push(id),
    emitFile: (file) => {
      emitted.push(file)
      return String(emitted.length)
    },
  }, virtualId)
  if (output === null) throw new Error('CSS Modules output missing')
  return { output, watched, emitted, files }
}

describe('dynamic client CSS assets', () => {
  it('emits byte-identical PNG and WOFF2 assets once and rewrites their URLs', async () => {
    const result = await loadCss(`
      @font-face { font-family: Fixture; src: url('./assets/display.woff2') format('woff2'); }
      .root { background: url('./assets/panel.png'), url('./assets/panel.png'); }
    `)

    expect(result.watched).toEqual([result.files.stylesheet, result.files.font, result.files.png])
    expect(result.emitted.map(file => file.fileName)).toEqual(['assets/display.woff2', 'assets/panel.png'])
    expect(result.emitted.map(file => [...file.source])).toEqual([
      [...result.files.fontBytes],
      [...result.files.pngBytes],
    ])
    expect(result.output).toContain('/plugins/@deepseek-ai/dsh-client-test/assets/display.woff2')
    expect(result.output).toContain('/plugins/@deepseek-ai/dsh-client-test/assets/panel.png')
    expect(result.output).not.toContain('./assets/')
  })

  it('leaves non-local URLs unchanged without emitting assets', async () => {
    const result = await loadCss(`
      .root {
        background-image: url('https://example.test/a.png'), url('//cdn.test/b.png'), url('/root.png'), url('#fragment'), url('data:image/png;base64,AA==');
      }
    `)

    expect(result.watched).toEqual([result.files.stylesheet])
    expect(result.emitted).toEqual([])
    expect(result.output).toContain('https://example.test/a.png')
    expect(result.output).toContain('//cdn.test/b.png')
    expect(result.output).toContain('/root.png')
    expect(result.output).toContain('#fragment')
    expect(result.output).toContain('data:image/png;base64,AA==')
  })

  it.each([
    ['./assets/icon.svg', /unsupported local asset/],
    ['../../../../outside.png', /outside package src/],
  ])('rejects unsafe local URL %s', async (url, message) => {
    await expect(loadCss(`.root { background: url('${url}'); }`)).rejects.toThrow(message)
  })
})

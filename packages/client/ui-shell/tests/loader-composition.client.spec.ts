import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import * as UiShell from '@deepseek-ai/dsh-client-ui-shell'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('ui-shell through a real Loader composition', () => {
  it('mounts the browser package row from cordis.yml', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-ui-shell-loader-'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, "- id: ui-shell\n  name: '@deepseek-ai/dsh-client-ui-shell'\n")

    context = new Context()
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (specifier !== '@deepseek-ai/dsh-client-ui-shell') {
          throw new Error(`unexpected Loader import: ${specifier}`)
        }
        return UiShell
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()

    const shell = [...context.loader.entries()]
      .find(entry => entry.options.name === '@deepseek-ai/dsh-client-ui-shell')
    expect(shell?.disabled).toBe(false)
    expect(shell?.fiber).toBeDefined()
    expect([...context.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)).toEqual([])
  })
})

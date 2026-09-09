import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { clientBundle } from '../tsdown.client.ts'

const configure = clientBundle('@deepseek-ai/dsh-client-ui-skill', ['lib/types/index.js'])
const browserYaml = join(dirname(createRequire(import.meta.url).resolve('yaml/package.json')), 'browser/index.js')

// Pin YAML's browser implementation; the Host parser retains its Node export.
export default (options: Parameters<typeof configure>[0]) => configure(options).map(config =>
  config.platform === 'browser' ? { ...config, alias: { yaml: browserYaml } } : config)

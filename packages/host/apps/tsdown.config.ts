import { defineConfig } from 'tsdown'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WorkspaceTypertGenerator } from '../../typert/generator/lib/types/workspace.js'
export default defineConfig({ entry: ['lib/types/index.js'], outDir: 'lib', platform: 'node', format: ['esm'], target: 'es2024', fixedExtension: false, clean: false, dts: false, plugins: [{
  name: 'apps-remote',
  writeBundle() {
    const directory = import.meta.dirname
    const generator = new WorkspaceTypertGenerator(resolve(directory, '../../..'), { checkDiagnostics: false })
    for (const artifact of generator.generate(['@deepseek-ai/dsh-host-apps'], ['host'])) {
      writeFileSync(resolve(directory, `lib/typert.${artifact.face}.js`), artifact.js)
      writeFileSync(resolve(directory, `lib/typert.${artifact.face}.d.ts`), artifact.dts)
      if (artifact.remote) {
        writeFileSync(resolve(directory, 'lib/typert.remote-client.js'), artifact.remote.js)
        writeFileSync(resolve(directory, 'lib/typert.remote-client.d.ts'), artifact.remote.dts)
      }
    }
  },
}] })

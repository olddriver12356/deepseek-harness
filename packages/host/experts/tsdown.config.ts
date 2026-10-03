import { defineConfig } from 'tsdown'

/** Both Host CRUD and agent-scoped dispatch are public Loader entries. */
export default defineConfig(['index', 'tool'].map(name => ({
  entry: [`lib/types/${name}.js`], outDir: 'lib', format: ['esm'] as const,
  platform: 'node' as const, target: 'es2024' as const,
  fixedExtension: false, dts: false, clean: false,
})))

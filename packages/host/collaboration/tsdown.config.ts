import { defineConfig } from 'tsdown'

/** Public Host and tool entries share the private authority identity and admission set. */
export default defineConfig({
  entry: ['lib/types/index.js', 'lib/types/tool.js'],
  outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
  fixedExtension: false, dts: false, clean: false,
})

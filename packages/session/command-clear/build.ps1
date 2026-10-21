# Build and verify this optional plugin without rebuilding or restarting the Web app.
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '../../..')
Push-Location $root
try {
    & node node_modules/typescript/bin/tsc -b packages/session/command-clear/tsconfig.json --pretty false
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript build failed.' }
    & node node_modules/vitest/vitest.mjs run packages/session/command-clear/tests/clear.spec.ts
    if ($LASTEXITCODE -ne 0) { throw 'Command behavior tests failed.' }
    & node node_modules/tsdown/dist/run.mjs --filter '@deepseek-ai/dsh-command-clear' --env.DSH_BUILD_FACE host --logLevel error
    if ($LASTEXITCODE -ne 0) { throw 'Plugin bundle failed.' }
    # This filename is the live profile's activation identity after its first update.
    Copy-Item (Join-Path $PSScriptRoot 'lib/index.js') (Join-Path $PSScriptRoot 'lib/clear-v2.js') -Force
    Copy-Item (Join-Path $PSScriptRoot 'lib/index.js') (Join-Path $PSScriptRoot 'lib/clear-ui-v3.js') -Force
    & node --input-type=module -e "const m = await import('./packages/session/command-clear/lib/clear-v2.js'); if (m.name !== 'command-clear') throw Error('Unexpected plugin'); console.log('clear plugin build verified')"
    if ($LASTEXITCODE -ne 0) { throw 'Built plugin import failed.' }
} finally {
    Pop-Location
}

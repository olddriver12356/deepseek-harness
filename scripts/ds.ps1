[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$MarttyArgs
)

$dshRoot = Split-Path -Parent $PSScriptRoot
$dshRuntime = Join-Path $dshRoot 'node_modules\.pnpm\node_modules'
$profileRoot = Join-Path $env:USERPROFILE '.dsh\profiles\tui'
$martty = Join-Path $profileRoot 'node_modules\martty\bin\martty.js'
$marttyBin = Join-Path $dshRoot 'tools\martty\bin\martty.exe'
$acpEntry = Join-Path $profileRoot 'node_modules\@openma\deepseek-harness-acp\dist\bin.js'

if (-not (Test-Path $dshRuntime)) {
    Write-Error "DSH dependencies are missing. Run pnpm install in $dshRoot."
    return
}
if (-not (Test-Path $martty)) {
    Write-Error 'Martty TUI is missing. Reinstall the tui profile.'
    return
}
if (-not (Test-Path $marttyBin)) {
    Write-Error "Customized Martty renderer is missing. Run $dshRoot\tools\martty\build.ps1."
    return
}
if (-not (Test-Path $acpEntry)) {
    Write-Error 'Martty ACP runtime is missing. Reinstall the tui profile.'
    return
}

$originalDshPath = $env:DSH_PATH
$originalMarttyBin = $env:MARTTY_BIN
$launchArgs = @($MarttyArgs)
if ($launchArgs.Count -gt 0 -and $launchArgs[0] -eq '--resume') {
    $launchArgs[0] = '--session-id'
}

try {
    $env:DSH_PATH = $dshRuntime
    $env:MARTTY_BIN = $marttyBin
    & node $martty --agent node --agent-arg $acpEntry @launchArgs
}
finally {
    if ($null -eq $originalDshPath) { Remove-Item Env:DSH_PATH -ErrorAction SilentlyContinue }
    else { $env:DSH_PATH = $originalDshPath }
    if ($null -eq $originalMarttyBin) { Remove-Item Env:MARTTY_BIN -ErrorAction SilentlyContinue }
    else { $env:MARTTY_BIN = $originalMarttyBin }
}

[CmdletBinding()]
param(
    [int]$Port = 3910
)

$dshRoot = Split-Path -Parent $PSScriptRoot
# Bitdefender blocks the exact path apps\cli\lib\bin.js on this machine, so tsdown cannot write
# the bundle there and the build fails with access denied before emitting it. The unbundled
# TypeScript compiler output under lib\types is the same entry and is not blocked, so fall back
# to it when the bundle is absent. That entry also needs apps\cli\lib\package.json to exist,
# because its readVersion resolves package.json one directory above the running file.
# See the vault note 2026-09-14-dsh-autostart-bitdefender-path-block.
$binJs = Join-Path $dshRoot 'apps\cli\lib\bin.js'
if (-not (Test-Path $binJs)) {
    $binJs = Join-Path $dshRoot 'apps\cli\lib\types\bin.js'
}
$distIndex = Join-Path $dshRoot 'apps\web\dist\index.html'

if (-not (Test-Path $binJs)) {
    Write-Error "DSH CLI is not built. Run pnpm run build in $dshRoot."
    return
}
if (-not (Test-Path $distIndex)) {
    Write-Error "Web frontend is not built. Run pnpm run build:web in $dshRoot."
    return
}

# Boot repeatedly collides with a still-running instance's lock on the shared
# .dsh\profiles\node_modules\@deepseek-ai\dsh-client-ui-attachment symlink
# (EBUSY), so a stale process from a previous attempt has to be cleared first.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match [regex]::Escape('bin.js web') -and $_.CommandLine -match "--port $Port" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

$orcaExe = Join-Path $env:LOCALAPPDATA 'Programs\orca\resources\bin\orca.exe'

# Orca routing (a managed terminal + tab in the calling room) only applies when actually
# running inside an Orca pane. Any other terminal — a plain PowerShell window included —
# just launches the server in the foreground here, no Orca dependency required.
if ((-not (Test-Path $orcaExe)) -or (-not $env:ORCA_WORKTREE_ID)) {
    & node $binJs web --port $Port
    return
}

# --worktree current resolves by cwd, which lands in the plain worktree sharing this path
# instead of the caller's workspace room, so the explicit room id from Orca is required here.
$room = "id:$($env:ORCA_WORKTREE_ID)"
$command = "`$env:BROWSER='none'; node '$binJs' web --port $Port"
$raw = & $orcaExe terminal create --worktree $room --command $command --title 'DeepSeek Harness' --json 2>&1 | Out-String
$handle = [regex]::Match($raw, '"handle"\s*:\s*"([^"]+)"').Groups[1].Value
if (-not $handle) {
    Write-Error "DeepSeek Harness terminal could not start: $raw"
    return
}

$deadline = (Get-Date).AddSeconds(30)
do {
    $ready = Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue
    if (-not $ready) { Start-Sleep -Seconds 1 }
} until ($ready -or (Get-Date) -ge $deadline)
if (-not $ready) {
    $output = & $orcaExe terminal read --terminal $handle 2>&1 | Out-String
    Write-Warning "Harness started in $handle but port $Port did not open within 30 seconds. Terminal output:`n$output"
    return
}

$url = "http://localhost:$Port/"
& $orcaExe tab create --worktree $room --url $url --json 2>&1 | Out-Null
Write-Host "DeepSeek Harness: terminal $handle, UI $url" -ForegroundColor Green

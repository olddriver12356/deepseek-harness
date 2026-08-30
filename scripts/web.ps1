[CmdletBinding()]
param(
    [int]$Port = 3910
)

$dshRoot = Split-Path -Parent $PSScriptRoot
$binJs = Join-Path $dshRoot 'apps\cli\lib\bin.js'
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
if (-not (Test-Path $orcaExe)) {
    & node $binJs web --port $Port
    return
}

# --worktree current resolves by cwd, which lands in the plain worktree sharing this path
# instead of the caller's workspace room, so require the explicit room id.
if (-not $env:ORCA_WORKTREE_ID) {
    Write-Error "ORCA_WORKTREE_ID is not set; cannot target the calling room. Run web from an Orca pane."
    return
}
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

[CmdletBinding()]
param(
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
$marttyCommit = 'd8916c049691651440ed016931b3e44c0c554930'
$toolRoot = $PSScriptRoot
$targetDir = Join-Path $toolRoot '.build\target'
$outputDir = Join-Path $toolRoot 'bin'
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)
$buildRoot = Join-Path $tempBase ("dsh-martty-{0}" -f [guid]::NewGuid().ToString('N'))
$checkout = Join-Path $buildRoot 'source'
$originalLto = $env:CARGO_PROFILE_RELEASE_LTO

New-Item -ItemType Directory -Path $checkout | Out-Null

try {
    & git init --quiet $checkout
    if ($LASTEXITCODE -ne 0) { throw 'Unable to initialize the Martty source checkout.' }
    & git -C $checkout remote add origin https://github.com/openma-ai/Martty.git
    if ($LASTEXITCODE -ne 0) { throw 'Unable to configure the Martty upstream remote.' }
    & git -C $checkout fetch --quiet --depth 1 origin $marttyCommit
    if ($LASTEXITCODE -ne 0) { throw "Unable to fetch Martty commit $marttyCommit." }
    & git -C $checkout checkout --quiet --detach FETCH_HEAD
    if ($LASTEXITCODE -ne 0) { throw "Unable to check out Martty commit $marttyCommit." }

    $sourcePath = Join-Path $checkout 'src\deepseek_logo.rs'
    $content = [IO.File]::ReadAllText($sourcePath)
    $constantsStart = $content.IndexOf('const WORDMARK:', [StringComparison]::Ordinal)
    $whaleRendererStart = $content.IndexOf('fn whale_for_width', $constantsStart, [StringComparison]::Ordinal)
    if ($constantsStart -lt 0 -or $whaleRendererStart -le $constantsStart) {
        throw 'Pinned Martty source no longer has the expected wordmark constants.'
    }

    $constants = @'
const WORDMARK: [&str; 3] = [
    "\u{2588}\u{2580}\u{2584} \u{2588}\u{2580}\u{2580} \u{2588}\u{2580}\u{2580} \u{2588}\u{2580}\u{2584} \u{2588}\u{2580}  \u{2588}\u{2580}\u{2580} \u{2588}\u{2580}\u{2580} \u{2588}\u{2584}\u{2580}",
    "\u{2588} \u{2588} \u{2588}\u{2580}\u{2580} \u{2588}\u{2580}\u{2580} \u{2588}\u{2580}\u{2580}  \u{2580}\u{2588} \u{2588}\u{2580}\u{2580} \u{2588}\u{2580}\u{2580} \u{2588}\u{2580}\u{2584}",
    "\u{2588}\u{2584}\u{2580} \u{2580}\u{2580}\u{2580} \u{2580}\u{2580}\u{2580} \u{2580}   \u{2580}\u{2580}\u{2580} \u{2580}\u{2580}\u{2580} \u{2580}\u{2580}\u{2580} \u{2588} \u{2580}",
];

'@
    $content = $content.Substring(0, $constantsStart) + $constants + $content.Substring($whaleRendererStart)

    $functionsStart = $content.IndexOf('fn hollow(', [StringComparison]::Ordinal)
    $publicLinesStart = $content.IndexOf('pub fn lines', $functionsStart, [StringComparison]::Ordinal)
    if ($functionsStart -lt 0 -or $publicLinesStart -le $functionsStart) {
        throw 'Pinned Martty source no longer has the expected wordmark renderer.'
    }

    $renderer = @'
fn wordmark_lines(theme: &Theme, width: u16) -> Vec<Line<'static>> {
    let (_, belly) = theme.whale_gradient();
    let ink = Style::default().fg(belly);
    if width < 35 {
        let pad = (width as usize).saturating_sub(8) / 2;
        return vec![Line::from(vec![
            Span::raw(" ".repeat(pad)),
            Span::styled("DEEPSEEK", ink.add_modifier(Modifier::BOLD)),
        ])];
    }
    let pad = (width as usize).saturating_sub(35) / 2;
    WORDMARK
        .iter()
        .map(|row| {
            Line::from(vec![
                Span::raw(" ".repeat(pad)),
                Span::styled((*row).to_string(), ink),
            ])
        })
        .collect()
}

'@
    $content = $content.Substring(0, $functionsStart) + $renderer + $content.Substring($publicLinesStart)
    [IO.File]::WriteAllText($sourcePath, $content, [Text.UTF8Encoding]::new($false))

    $manifest = Join-Path $checkout 'Cargo.toml'
    if ($Check) {
        & cargo check --manifest-path $manifest --target-dir $targetDir
        if ($LASTEXITCODE -ne 0) { throw 'Customized Martty cargo check failed.' }
        Write-Host "Checked customized Martty at $marttyCommit"
        return
    }

    $env:CARGO_PROFILE_RELEASE_LTO = 'false'
    & cargo build --manifest-path $manifest --target-dir $targetDir --release -j 1
    if ($LASTEXITCODE -ne 0) { throw 'Customized Martty release build failed.' }
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
    Copy-Item -Force -LiteralPath (Join-Path $targetDir 'release\martty.exe') -Destination (Join-Path $outputDir 'martty.exe')
    Write-Host "Installed customized Martty at $(Join-Path $outputDir 'martty.exe')"
}
finally {
    if ($null -eq $originalLto) { Remove-Item Env:CARGO_PROFILE_RELEASE_LTO -ErrorAction SilentlyContinue }
    else { $env:CARGO_PROFILE_RELEASE_LTO = $originalLto }

    if (Test-Path -LiteralPath $buildRoot) {
        $resolvedBuildRoot = (Resolve-Path -LiteralPath $buildRoot).Path
        $expectedPrefix = $tempBase + [IO.Path]::DirectorySeparatorChar + 'dsh-martty-'
        if (-not $resolvedBuildRoot.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing to remove unexpected build directory: $resolvedBuildRoot"
        }
        Remove-Item -LiteralPath $resolvedBuildRoot -Recurse -Force
    }
}

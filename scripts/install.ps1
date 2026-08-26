<#
.SYNOPSIS
    Canvas CLI installer (Windows).

.DESCRIPTION
    Downloads canvas-windows.exe from the latest cli-v* GitHub Release,
    verifies it against SHA256SUMS, installs it as canvas.exe and adds the
    install directory to the user PATH.

.EXAMPLE
    irm https://raw.githubusercontent.com/canvas-ui/canvas/main/apps/cli/scripts/install.ps1 | iex

.EXAMPLE
    .\install.ps1 -Version 2.1.11 -InstallDir "$env:LOCALAPPDATA\Programs\canvas"
#>
[CmdletBinding()]
param(
    [string]$Version = '',
    [string]$InstallDir = "$env:LOCALAPPDATA\Programs\canvas",
    [switch]$NoShortcuts,
    [switch]$NoPath
)

$ErrorActionPreference = 'Stop'
$Repo = 'canvas-ui/canvas'
$Asset = 'canvas-windows.exe'

function Write-Log     { param($m) Write-Host "[info] $m" -ForegroundColor Cyan }
function Write-Ok      { param($m) Write-Host "[ ok ] $m" -ForegroundColor Green }
function Write-Warn    { param($m) Write-Host "[warn] $m" -ForegroundColor Yellow }
function Write-Fail    { param($m) Write-Host "[fail] $m" -ForegroundColor Red; exit 1 }

function Resolve-CliTag {
    # The monorepo publishes cli-v*, web-v*, extension-v* and desktop-v* into
    # one release feed, so /releases/latest is not necessarily a CLI release.
    $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases?per_page=50" -UseBasicParsing
    $tag = ($releases | Where-Object { $_.tag_name -like 'cli-v*' } | Select-Object -First 1).tag_name
    if (-not $tag) { Write-Fail 'Could not resolve the latest cli-v* release from GitHub' }
    return $tag
}

if ($Version) {
    $tag = if ($Version -like 'cli-v*') { $Version } elseif ($Version -like 'v*') { "cli-$Version" } else { "cli-v$Version" }
} else {
    Write-Log 'Resolving latest release...'
    $tag = Resolve-CliTag
}

$base = "https://github.com/$Repo/releases/download/$tag"
$target = Join-Path $InstallDir 'canvas.exe'

Write-Log "Release:  $tag"
Write-Log "Target:   $target"

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("canvas-install-" + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
    $dl = Join-Path $tmp $Asset
    Write-Log 'Downloading...'
    Invoke-WebRequest -Uri "$base/$Asset" -OutFile $dl -UseBasicParsing

    # Checksum
    try {
        $sums = (Invoke-WebRequest -Uri "$base/SHA256SUMS" -UseBasicParsing).Content
        $line = ($sums -split "`n" | Where-Object { $_ -match "\s\*?$([regex]::Escape($Asset))\s*$" } | Select-Object -First 1)
        if ($line) {
            $expected = ($line -split '\s+')[0]
            $actual = (Get-FileHash -Path $dl -Algorithm SHA256).Hash.ToLower()
            if ($expected.ToLower() -ne $actual) { Write-Fail "Checksum mismatch for $Asset" }
            Write-Ok 'Checksum verified'
        } else {
            Write-Warn "$Asset not listed in SHA256SUMS - skipping checksum verification"
        }
    } catch {
        Write-Warn "SHA256SUMS not available for $tag - skipping checksum verification"
    }

    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Move-Item -Path $dl -Destination $target -Force
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

$ver = & $target --version 2>&1
if ($LASTEXITCODE -ne 0 -and "$ver" -notmatch 'canvas-cli') { Write-Fail 'Installed binary does not run' }
Write-Ok "Installed $ver"

# Shortcut shims: ws / ctx / context / dot / agent / ag / hi
if (-not $NoShortcuts) {
    $map = @{ ws = 'workspace'; ctx = 'context'; context = 'context'; dot = 'dot'; agent = 'agent'; ag = 'agent'; hi = 'agent' }
    foreach ($name in $map.Keys) {
        $shim = Join-Path $InstallDir "$name.cmd"
        "@echo off`r`n`"$target`" $($map[$name]) %*" | Set-Content -Path $shim -Encoding ASCII
    }
    Write-Ok "Shortcuts: $($map.Keys -join ' ')"
}

# PATH
if (-not $NoPath) {
    $userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
    if ($userPath -notlike "*$InstallDir*") {
        [Environment]::SetEnvironmentVariable('PATH', "$userPath;$InstallDir", 'User')
        Write-Ok "Added $InstallDir to your user PATH - restart your terminal"
    } else {
        Write-Log 'Install directory already on PATH'
    }
}

Write-Host ''
Write-Log 'Quick start:'
Write-Host '  canvas --help'
Write-Host '  canvas remote add user@home http://127.0.0.1:8001'
Write-Host '  canvas remote bind user@home'
Write-Host '  canvas contexts'
Write-Host ''
Write-Warn 'The Windows binary is not code-signed yet - SmartScreen will warn on first run.'
Write-Log 'The prompt (PS1) integration is bash/zsh only; see scripts/update-prompt.sh.'

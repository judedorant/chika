# Run from PowerShell: .\scripts\setup-windows.ps1
[CmdletBinding()]
param([switch]$SkipMobileInstall)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE. Fix the reported problem and rerun setup." }
}
$repoRoot = Split-Path $PSScriptRoot -Parent
Push-Location $repoRoot
try {
    foreach ($tool in @('git', 'docker', 'node', 'npm')) {
        if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "Install $tool and reopen PowerShell before continuing." }
    }
    $nodeVersion = & node --version
    $nodeMajor = [int]($nodeVersion.TrimStart('v').Split('.')[0])
    if ($nodeMajor -ne 24) { throw 'Use Node.js 24 LTS for this verified toolchain.' }
    Invoke-Checked -Program docker -Arguments @('version', '--format', '{{.Server.Os}}')
    $serverOs = & docker info --format '{{.OSType}}'
    if ($LASTEXITCODE -ne 0 -or $serverOs -ne 'linux') { throw 'Start Docker Desktop with the WSL 2 Linux-container engine.' }
    Invoke-Checked -Program docker -Arguments @('compose', 'version')
    Invoke-Checked -Program node -Arguments @('scripts/prepare-local.cjs')
    # --quiet validates without exposing interpolated credentials.
    Invoke-Checked -Program docker -Arguments @('compose', 'config', '--quiet')
    Invoke-Checked -Program docker -Arguments @('compose', 'build')
    Invoke-Checked -Program docker -Arguments @('compose', 'up', '-d', '--wait', 'mysql', 'redis')
    Invoke-Checked -Program docker -Arguments @('compose', 'stop', 'api', 'worker', 'reverb')
    Invoke-Checked -Program docker -Arguments @('compose', 'run', '--rm', 'api', 'composer', 'install', '--no-interaction', '--prefer-dist')
    Invoke-Checked -Program docker -Arguments @('compose', 'run', '--rm', 'api', 'php', 'bin/prepare-local.php')
    Invoke-Checked -Program docker -Arguments @('compose', 'run', '--rm', 'api', 'php', 'artisan', 'optimize:clear')
    Invoke-Checked -Program docker -Arguments @('compose', 'run', '--rm', 'api', 'php', 'artisan', 'migrate', '--no-interaction')
    Invoke-Checked -Program docker -Arguments @('compose', 'up', '-d', '--wait', 'api', 'worker', 'reverb')
    Invoke-Checked -Program docker -Arguments @('compose', 'ps')
    $health = Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/health'
    if ($health.status -ne 'ok') { throw 'API health check failed.' }
    if (-not $SkipMobileInstall) {
        Push-Location mobile
        try { Invoke-Checked -Program npm -Arguments @('ci') } finally { Pop-Location }
    }
    Write-Host 'Backend ready. Start the emulator, then: cd mobile; npx expo start --go --localhost'
    Write-Host 'For remote notifications use a configured development build and a supported physical Android device.'
} finally { Pop-Location }

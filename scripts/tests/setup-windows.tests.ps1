# Cross-platform orchestration test: all external commands are mocked.
$ErrorActionPreference = 'Stop'
$setup = Join-Path $PSScriptRoot '../setup-windows.ps1'
$tokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($setup, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'PowerShell syntax validation failed.' }
$global:RChatMockCalls = [System.Collections.Generic.List[string]]::new()
$global:RChatMockFailComposer = $false
function global:git { $global:LASTEXITCODE = 0 }
function global:node {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    $global:LASTEXITCODE = 0
    if ($Arguments[0] -eq '--version') { 'v24.19.0' }
}
function global:npm { $global:LASTEXITCODE = 0 }
function global:docker {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    $global:RChatMockCalls.Add(($Arguments -join ' '))
    $global:LASTEXITCODE = 0
    if ($Arguments[0] -eq 'info') { 'linux' }
    if ($global:RChatMockFailComposer -and $Arguments -contains 'composer') { $global:LASTEXITCODE = 7 }
}
function global:Invoke-RestMethod { param([string]$Uri) return @{ status = 'ok' } }
$originalLocation = (Get-Location).Path
& $setup
foreach ($expected in @('compose up -d --wait mysql redis', 'compose run --rm api php bin/prepare-local.php', 'compose run --rm api php artisan migrate --no-interaction', 'compose up -d --wait api worker reverb')) {
    if (-not $global:RChatMockCalls.Contains($expected)) { throw "Missing expected command or arguments: $expected" }
}
if ((Get-Location).Path -ne $originalLocation) { throw 'Setup failed to restore the working directory.' }
$global:RChatMockCalls.Clear()
$global:RChatMockFailComposer = $true
$failed = $false
try { & $setup -SkipMobileInstall } catch { $failed = $_.Exception.Message -like '*exit code 7*' }
if (-not $failed) { throw 'Setup did not propagate the external command failure.' }
if ($global:RChatMockCalls.Contains('compose run --rm api php artisan migrate --no-interaction')) { throw 'Setup continued after Composer failed.' }
if ((Get-Location).Path -ne $originalLocation) { throw 'Failure path did not restore the working directory.' }
Write-Host 'PASS: PowerShell syntax, command arguments, failure handling, and working-directory restoration (mocked commands).'

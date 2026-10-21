# Installs the latest version of TokenBinder in VS Code (Windows).
#   irm https://raw.githubusercontent.com/SoreviR/token-binder/main/install.ps1 | iex
# Downloads the .vsix of the latest GitHub Release and installs it with `code --install-extension`.
$ErrorActionPreference = 'Stop'
$repo = 'SoreviR/token-binder'

function Find-Code {
  foreach ($name in 'code', 'code-insiders') {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
  }
  foreach ($p in "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd", "$env:ProgramFiles\Microsoft VS Code\bin\code.cmd") {
    if (Test-Path $p) { return $p }
  }
  throw "Could not find the 'code' command. Open VS Code and run 'Shell Command: Install code command in PATH' (Ctrl+Shift+P)."
}

$code = Find-Code
Write-Host "Looking for the latest version of $repo ..."
$release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'tokenbinder-installer' }
$asset = $release.assets | Where-Object { $_.name -like '*.vsix' } | Select-Object -First 1
if (-not $asset) { throw "Release $($release.tag_name) has no .vsix file." }

$file = Join-Path $env:TEMP $asset.name
Write-Host "Downloading $($asset.name) ($($release.tag_name)) ..."
Invoke-WebRequest $asset.browser_download_url -OutFile $file

# `code` writes Node warnings to stderr; with 'Stop', PowerShell 5.1 would treat them as a fatal error.
$ErrorActionPreference = 'Continue'
& $code --install-extension $file --force
$exit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($exit -ne 0) { throw "Installation failed (code $exit)." }
Remove-Item $file -ErrorAction SilentlyContinue

# TokenBinder used to be called PokeToken. If the old one is still installed, everything is migrated when VS Code opens and removing it is offered.
$ErrorActionPreference = 'Continue'
$old = & $code --list-extensions 2>$null | Where-Object { $_ -eq 'sorevir.poke-token' }
$ErrorActionPreference = 'Stop'
if ($old) { Write-Host "Note: you have the old version (PokeToken). When VS Code opens, TokenBinder will recover your progress and settings and offer to uninstall it." }
Write-Host "`nDone. Close and reopen VS Code, and set 'tokenBinder.quota.monthlyLimit' to your quota."

# Instala la última versión de TokenBinder en VS Code (Windows).
#   irm https://raw.githubusercontent.com/SoreviR/token-binder/main/install.ps1 | iex
# Descarga el .vsix del último Release de GitHub y lo instala con `code --install-extension`.
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
  throw "No encontré el comando 'code'. Abre VS Code y ejecuta 'Shell Command: Install code command in PATH' (Ctrl+Shift+P)."
}

$code = Find-Code
Write-Host "Buscando la última versión de $repo ..."
$release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'tokenbinder-installer' }
$asset = $release.assets | Where-Object { $_.name -like '*.vsix' } | Select-Object -First 1
if (-not $asset) { throw "El release $($release.tag_name) no tiene archivo .vsix." }

$file = Join-Path $env:TEMP $asset.name
Write-Host "Descargando $($asset.name) ($($release.tag_name)) ..."
Invoke-WebRequest $asset.browser_download_url -OutFile $file

# `code` escribe avisos de Node en stderr; con 'Stop' PowerShell 5.1 los trataría como error fatal.
$ErrorActionPreference = 'Continue'
& $code --install-extension $file --force
$exit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($exit -ne 0) { throw "La instalación falló (código $exit)." }
Remove-Item $file -ErrorAction SilentlyContinue

# TokenBinder antes se llamaba PokeToken. Si sigue instalada la antigua, al abrir VS Code se migra todo y se ofrece quitarla.
$ErrorActionPreference = 'Continue'
$old = & $code --list-extensions 2>$null | Where-Object { $_ -eq 'sorevir.poke-token' }
$ErrorActionPreference = 'Stop'
if ($old) { Write-Host "Nota: tienes la versión antigua (PokeToken). Al abrir VS Code, TokenBinder recuperará tu progreso y tus ajustes y te ofrecerá desinstalarla." }
Write-Host "`nListo. Cierra y vuelve a abrir VS Code, y configura 'tokenBinder.quota.monthlyLimit' con tu cupo."

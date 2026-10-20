# Instala la última versión de PokeToken en VS Code (Windows).
#   irm https://raw.githubusercontent.com/SoreviR/poke-token-vscode/main/install.ps1 | iex
# Descarga el .vsix del último Release de GitHub y lo instala con `code --install-extension`.
$ErrorActionPreference = 'Stop'
$repo = 'SoreviR/poke-token-vscode'

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
$release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'poketoken-installer' }
$asset = $release.assets | Where-Object { $_.name -like '*.vsix' } | Select-Object -First 1
if (-not $asset) { throw "El release $($release.tag_name) no tiene archivo .vsix." }

$file = Join-Path $env:TEMP $asset.name
Write-Host "Descargando $($asset.name) ($($release.tag_name)) ..."
Invoke-WebRequest $asset.browser_download_url -OutFile $file

& $code --install-extension $file --force
if ($LASTEXITCODE -ne 0) { throw "La instalación falló (código $LASTEXITCODE)." }
Remove-Item $file -ErrorAction SilentlyContinue
Write-Host "`nListo. Cierra y vuelve a abrir VS Code, y configura 'pokeToken.quota.monthlyLimit' con tu cupo."

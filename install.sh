#!/usr/bin/env bash
# Installs the latest version of TokenBinder in VS Code (macOS and Linux).
#   curl -fsSL https://raw.githubusercontent.com/SoreviR/token-binder/main/install.sh | bash
# Downloads the .vsix of the latest GitHub Release and installs it with `code --install-extension`.
set -euo pipefail
repo='SoreviR/token-binder'

find_code() {
  local c
  for c in code code-insiders; do
    if command -v "$c" >/dev/null 2>&1; then command -v "$c"; return 0; fi
  done
  for c in \
    "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
    "/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code-insiders" \
    "$HOME/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
    "/usr/share/code/bin/code"; do
    if [ -x "$c" ]; then printf '%s\n' "$c"; return 0; fi
  done
  return 1
}

code_bin="$(find_code)" || {
  echo "Could not find the 'code' command. Open VS Code and run 'Shell Command: Install 'code' command in PATH' (Cmd/Ctrl+Shift+P)." >&2
  exit 1
}

echo "Looking for the latest version of $repo ..."
release="$(curl -fsSL -H 'User-Agent: tokenbinder-installer' "https://api.github.com/repos/$repo/releases/latest")"
url="$(printf '%s' "$release" | grep -o '"browser_download_url": *"[^"]*\.vsix"' | head -n1 | sed 's/.*"\(https[^"]*\)"/\1/')"
[ -n "$url" ] || { echo "The latest release has no .vsix file." >&2; exit 1; }

file="$(mktemp -d)/$(basename "$url")"
echo "Downloading $(basename "$url") ..."
curl -fsSL "$url" -o "$file"

"$code_bin" --install-extension "$file" --force
rm -f "$file"

echo
echo "Done. Close and reopen VS Code, and set 'tokenBinder.quota.monthlyLimit' to your quota."

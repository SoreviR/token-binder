# Changelog

Each release on GitHub shows the section of its version. Add a `## X.Y.Z - date` section before tagging `vX.Y.Z`: the release workflow fails without it.

## 1.5.0 - 2026-10-21

- **Updates:** TokenBinder now checks GitHub once a day for a newer release and offers to install it (*Update now*, *Release notes*, *Skip this version*). It never installs anything without asking, verifies the downloaded file against the size and SHA-256 published by GitHub, and can be turned off with `tokenBinder.updates.check`. **Check for updates** is also available from the command palette.
- **Safer upgrades:** when the extension version changes, your progress is copied to a backup file first (the last 3 are kept; restore one with **Import progress**). Exported files now carry a format version, and a file exported by a newer TokenBinder is refused with a clear message instead of being half-read.
- If you are on 1.4.0 or older you need to run the installer once more to get this version; from then on updates arrive by themselves.

## 1.4.0 - 2026-10-21

- English and Spanish interface with the new `tokenBinder.language` setting (`auto` follows VS Code). The README is in English, with a Spanish copy.

## 1.3.0 - 2026-10-21

- Card levels (1-50) earned with the tokens used while a card is training; evolutions inherit the level, and cards with no evolution stay in their slot as Masters and keep leveling.
- Combat stats (HP, ATK, DEF, SPD) built from the real card data, shown in the album and the side panel.
- Approximate market value (Cardmarket and TCGplayer) with a collectibility label and the value of the whole collection.

## 1.2.0 - 2026-10-21

- macOS and Linux support (VS Code data folders per platform, SQLite fallback that no longer depends on `node` being on the PATH) and a `install.sh` installer.

## 1.1.0 - 2026-10-21

- Packs now contain 2 cards instead of 5.

## 1.0.0 - 2026-10-20

- The project is now called TokenBinder (it was PokeToken). Progress, settings and downloaded images are migrated automatically.

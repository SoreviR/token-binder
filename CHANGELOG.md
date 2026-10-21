# Changelog

Each release on GitHub shows the section of its version. Add a `## X.Y.Z - date` section before tagging `vX.Y.Z`: the release workflow fails without it.

## Unreleased

- **Mishaps for going over the quota** (on by default; turn them off with `tokenBinder.mishaps.enabled`). Past 100% of the monthly quota, one mishap per quota period: **Team Rocket** steals a card (60%; win it back in the Battle tab), you **trip** and drop 10% of your album while another 10% gets scuffed one step of wear, or loses its sleeve instead (30%; graded cards are safe), or the **rain** soaks half of it (10%; sleeves and slabs keep cards dry). A soaked card is worthless and cannot train, battle, be graded or be sold until a **Charmandryer** (40 coins, new in the shop) dries it; it comes back Heavily Played.

## 1.9.0 - 2026-10-21

- **Protection is now visible:** a sleeve is drawn over the card, a toploader as a rigid frame, and chips under the card name (with hover explanations) show what protects it and its condition. Album thumbnails get small 🛡️ / 📦 icons. Sleeves and toploaders never changed the stats; the item descriptions now say so.
- **Wear:** the card you take to battle can lose condition after a fight (10% with no protection, 2% with a sleeve, 4% with a toploader, 0% with both). A worn card looks worn, is worth 6% less per step and has worse grading odds; the battle screen shows the risk and tells you when a card got worn. A graded card in its slab never wears.

## 1.8.0 - 2026-10-21

- **Battles (1 vs 1):** take one card to battle and face the eight Kanto gym leaders. Fights are automatic (about 7 rounds), use the real attacks of the cards, and are explained afterwards ("why you won / lost"). Beating a leader gives a badge and coins and unlocks the next one; your record and recent fights are saved. A new **Battle** tab in the album.
- **A new strength model** keeps the many different cards comparable: training level matters most, then market demand, rarity, stage, grade and a small token-usage bonus (up to +8%); what is printed on a card only decides whether it leans tanky or hard-hitting, never how strong it is. The stats shown in the album come from the same model, so they have changed. Balance is fixed by tests that simulate thousands of fights with 320 real cards, and `npm run balance` prints the report.

## 1.7.0 - 2026-10-21

- **Protection and grading:** sleeves and toploaders (shop or mystery boxes) improve the odds when a card is sent to the "TBGS" grading service. It comes back after 500K tokens with a 1-10 grade, shown in a slab; re-submitting can only improve it. The grade multiplies the card's market value (10 → ×3), which also counts in the value of your collection.

## 1.6.0 - 2026-10-21

- **Mystery boxes** (120 coins) with 16 items: evolution stones and King's Rock, Rare Candy (+1 level), Lucky Egg (double XP for 1M tokens) and four rare transformation items. An *Items* panel shows what you own.
- **Choose the evolution:** lines that branch (Eevee has 8 species; also Gloom, Poliwhirl, Slowpoke, Kirlia, Snorunt, Cosmoem, Wurmple and Pikachu) now wait for you at the evolution point. Pick a species with the item it needs, take a free branch, or let it evolve naturally (random).
- **Transformations:** a finished card of level 20+ can become its Mega, VMAX, VSTAR or Terastal ex version when one exists; it keeps its level.

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

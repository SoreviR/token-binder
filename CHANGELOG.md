# Changelog

Each release on GitHub shows the section of its version. Add a `## X.Y.Z - date` section before tagging `vX.Y.Z`: the release workflow fails without it.

## Unreleased

- **League server, duel limit no longer bypassable:** the daily limits (10 a day, 2 per rival) were checked by counting the duels and then saving the new one, so firing many challenges at the same instant slipped past the count. They are now reserved with an atomic per-day counter (`duel_quota`), so a burst gets exactly the allowed number through.
- **League server, Elo cannot be reset by leaving:** a member's standing is kept in `member_stats` when they leave, so rejoining a league restores their Elo and record instead of starting fresh at 1000 (which let a losing player wipe their losses). Deleting your data still removes everything.

## 1.13.0 - 2026-10-22

- **Online leagues (opt-in, off by default):** a new **League** tab in the album. Create a private league, share its invite code and challenge your friends with the card you take to battle. Duels are asynchronous: the server plays the fight at once with the same rules as the Battle tab, moves the Elo of both players and your friend can watch the replay later. Limits: 10 challenges a day, 2 a day against the same player. Duels pay no coins; the card that fights earns battle XP as usual.
- **Ranking page:** `<server>/l/<invite code>` shows the Elo table and the latest duels to whoever has the code.
- **Privacy:** turning it on asks first (and names the server), then signs you in with the GitHub account VS Code already has. The server stores only your GitHub id and login, your battle card (level, grade, held item), roughly how much of your quota you used and your duel results. **Delete my online data** (League tab or command palette) removes everything. The server address can only be set by you, never by a workspace, and only `https` is accepted.
- **Fair play between friends:** the server looks the cards up in TCGdex itself, so both players fight with the same data and prices. A new player can field cards up to level 10 and the cap rises 4 levels a day (anything above is clamped).
- **Your own server:** the `server/` folder holds the league server (Vercel + Neon Postgres) and its README; the setting `tokenBinder.online.server` points the extension to it. The default one is hosted by the author.

## 1.12.0 - 2026-10-21

- **Items tab in the album:** the mystery boxes and every item you own are now shown as cards (icon, amount and what it does), grouped by use. The side panel keeps the box button and a link to the tab.
- **Album filters and sorting:** filter by condition (graded, mint, worn, soaked, sleeve or toploader) and by held item, and sort by level or by condition.
- **Condition and held item visible on the thumbnails:** a worn card shows its condition (NM, LP, MP, HP) and a card holding an item shows its icon, without opening it.
- **New slab design:** graded cards sit in a thick clear case with a label (TBGS brand, name, set and number, certificate, four subgrades and the grade in a black box; a gold-on-black label for a 10).

## 1.11.0 - 2026-10-21

- **Mishaps for going over the quota** (opt-in: turn them on with `tokenBinder.mishaps.enabled`; contributed by Hector in #1). Past 100% of your own monthly quota, one mishap per quota period: **Team Rocket** steals a spare card (60%; win it back in the Battle tab), you **trip** and drop spare copies while another 10% of the cards get scuffed or lose their sleeve (30%; graded cards are safe), or the **rain** soaks up to 6 cards (10%; sleeves and slabs keep cards dry). Cards you invested in are never lost: only virgin cards and spare copies can be taken. A soaked card is worthless and cannot train, battle, be graded, sold or transformed until a **Charmandryer** (40 coins, new in the shop) dries it; it comes back Heavily Played. The first period after turning them on is free.

## 1.10.0 - 2026-10-21

- **Combat economy:** rematch victories now pay 3 coins (up to 5 a day) instead of 20, so fighting complements the coins you earn from tokens instead of dwarfing them. First-victory rewards are unchanged.
- **Fighting trains the card:** the card that fights earns 10,000 XP for a win and 4,000 for a defeat, for the first 5 fights of each day. The result screen shows the XP and any level gained, and the Battle tab reminds you when your fighter is not in a training slot.
- **Held battle items** (found in mystery boxes, one per card, not used up): Sturdy Plate, Choice Band, Quick Claw and Lucky Charm. They change how a card fights, never how strong it is; balance tests keep each one at about 50% against the same card without it. Equip them from the card in the album.
- Item descriptions now say what they are worth in battle (Rare Candy about +1.8% strength, Lucky Egg about +4.5%, and that transformations change the card's stage and demand).

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

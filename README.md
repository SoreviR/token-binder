# TokenBinder

**English** · [Español](README.es.md)

A VS Code extension that measures the tokens you spend in **GitHub Copilot Chat** while you work and turns them into **Pokémon TCG booster packs**: you open packs, collect cards of different rarities (with a 3D holographic effect) and put them to train so they evolve with your tokens. The status bar shows how much you have spent and what **percentage of your monthly quota** that represents.

Unofficial personal project, not affiliated with GitHub, Microsoft, Nintendo or The Pokémon Company.

```
🔥 1.24M · 42%        ← status bar (yellow from 80%, red at 100%)
```

## What it does

- **Live counter** in the status bar: tokens used in the period and % of the quota. It updates a few seconds after every chat response.
- **Pack notice**: next to the counter `🎁 N` appears when you have unopened packs or Poké Balls; click it to open the panel.
- **Tooltip with a breakdown** for today, the month and per model.
- **Side panel** (TokenBinder icon in the activity bar): packs, card in training, album, quota, per-day chart and usage per model.
- **Alerts** when you cross 50%, 80% and 100% of the quota.
- **Works with any model** enabled in Copilot (counted per model) and with any chat mode you use.
- **English and Spanish**: the interface follows VS Code's language by default, or pick one with the `tokenBinder.language` setting.

## Coming from PokeToken

TokenBinder is the new name of **PokeToken** (the same extension, now focused on cards). When you install TokenBinder and open VS Code for the first time, your progress (album, coins, cards in training), your `pokeToken.*` settings (which become `tokenBinder.*`) and the images already downloaded are **migrated automatically**, and you are offered to uninstall PokeToken so you do not have two identical extensions. If you do not want to keep the old cards, use `F1` → **TokenBinder: Reset progress**.

## Installation

Requirements: **Windows, macOS or Linux**, VS Code 1.90 or newer with the `code` command on the PATH, and Copilot Chat. (macOS and Linux support arrived in 1.2.0; up to 1.1 only the Windows data folder was read.)

### Option 1: one command (recommended)

On **Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/SoreviR/token-binder/main/install.ps1 | iex
```

On **macOS / Linux** (Terminal):

```bash
curl -fsSL https://raw.githubusercontent.com/SoreviR/token-binder/main/install.sh | bash
```

It downloads the `.vsix` from the latest [Release](https://github.com/SoreviR/token-binder/releases/latest) and installs it. You can read the scripts before running them: [`install.ps1`](install.ps1) and [`install.sh`](install.sh). On a Mac, if it says it cannot find `code`, open VS Code and run `Cmd+Shift+P` → *Shell Command: Install 'code' command in PATH*; the script also tries the `/Applications` path on its own.

### Option 2: by hand

1. Download `token-binder-X.Y.Z.vsix` from [Releases](https://github.com/SoreviR/token-binder/releases/latest).
2. In VS Code: `Ctrl+Shift+P` → **Extensions: Install from VSIX…** → pick the file. Or from a terminal:
   ```powershell
   code --install-extension token-binder-X.Y.Z.vsix
   ```

Then **restart VS Code**.

## Updating

VS Code does not update extensions installed from a `.vsix` on its own, so TokenBinder does it itself:

- Once a day (a few seconds after VS Code starts) it asks GitHub whether there is a newer [Release](https://github.com/SoreviR/token-binder/releases). If there is, a notice offers **Update now**, **Release notes** and **Skip this version**.
- *Update now* downloads the `.vsix`, checks it against the size and SHA-256 that GitHub publishes for it, installs it and offers to reload VS Code. **It never installs anything without you clicking.**
- You can also check by hand: `F1` → **TokenBinder: Check for updates**.
- To stop the daily check, turn off `tokenBinder.updates.check`. Without it, update by running the installer again (Option 1 or 2 above).
- Your progress is kept across updates. Before the first start of a new version, the extension saves a copy of your progress in its storage folder (`backups/` inside the extension's global storage; the last 3 are kept) and you can restore one with **Import progress**.
- If you are on **1.4.0 or older** you do not have the updater yet: run the installer once more to get it. From then on updates arrive by themselves.
- Installed from the Marketplace instead (if it is ever published there)? Then VS Code updates it and the built-in check stays quiet.

## Configuration

This extension **does not query GitHub or your organization**: it computes the percentage as *your local usage ÷ the limit you configure*. Ask your administrator what your quota is.

**Quick way:** press `F1`, type **TokenBinder: Set monthly quota**, choose the unit and enter the number (accepts `5M`, `750k`, `5000000`). You can also hover the status bar counter and click *Set quota*.

**Manual way:** `F1` → **TokenBinder: Open settings** (or `Ctrl+,` and search for `tokenBinder`). Available settings:

| Setting | Default | Description |
|---|---|---|
| `tokenBinder.language` | `auto` | Interface language: `auto` (follows VS Code: Spanish if it is Spanish, English otherwise), `en` or `es`. Changes live, no restart needed. |
| `tokenBinder.updates.check` | `true` | Check GitHub once a day for a newer release and offer to install it (never installs without asking). |
| `tokenBinder.quota.monthlyLimit` | `5000000` | Your monthly quota, in the chosen unit. **Change it**: the default is only a placeholder. |
| `tokenBinder.quota.unit` | `tokens` | `tokens` or `credits` (Copilot AI credits). |
| `tokenBinder.quota.resetDay` | `1` | Day of the month (UTC) on which the quota resets. |
| `tokenBinder.alerts.thresholds` | `[50, 80, 100]` | Percentages that trigger a warning. |
| `tokenBinder.packs.everyTokens` | `750000` | Every how many tokens used you earn a pack. |
| `tokenBinder.growth.multiplier` | `1` | Scales the tokens each card needs to evolve (0.1–2). |
| `tokenBinder.storageRoots` | `[]` | VS Code `User` folders to read, if you use a non-standard installation. |

Command titles and the setting descriptions in VS Code's Settings editor follow VS Code's display language; everything else (panel, album, notices, dialogs) follows `tokenBinder.language`.

Commands (`F1`): **TokenBinder: Open album**, **TokenBinder: Export progress**, **TokenBinder: Import progress**, **TokenBinder: Reset progress**, **TokenBinder: Set monthly quota**, **TokenBinder: Open settings**, **TokenBinder: Open panel** and **TokenBinder: Recalculate usage** and **TokenBinder: Check for updates**.

## How to play

1. **You earn packs with your tokens.** You start with a welcome pack and get another every 750K tokens used (`packs.everyTokens`). If you reach **100% of the quota** in a period, you earn an extra gift pack.
2. **Open the pack** (*Open pack* button): 2 real Pokémon TCG cards come out, **collector cards only**. There are no commons or plain rarities: the more modern the era, the higher the minimum rarity required.

   | Era | Series | What can come out |
   |---|---|---|
   | **Vintage** | Base, Gym, Neo, Legendary Collection, e-Card | Holographic cards only (Base Set, Jungle, Fossil, Neo, Aquapolis, Skyridge…) |
   | **Classic** | EX, Diamond & Pearl, Platinum, HeartGold SoulSilver, Call of Legends | Holographic only, including LV.X, Prime and LEGEND, and Ultra Rare |
   | **Black & White / XY** | BW, XY | Ultra Rare (EX and full art) and Secret Rare |
   | **Modern** | Sun & Moon, Sword & Shield | V, VMAX, VSTAR, Ultra, Secret, Radiant, Amazing, Shiny V… |
   | **Current** | Scarlet & Violet and later | Illustration rare, Special illustration rare, Hyper rare, Ultra and Secret |

   Each card of a regular pack comes from an era with these approximate probabilities: Vintage 34%, Classic 28%, BW/XY 16%, Modern 14%, Current 8%. The **last card** of the pack is the "star" and favors the modern eras (Modern 26%, Current 20%). The **premium pack** has 2 cards of that kind, with the last one even more modern, and the **Poké Ball** is a single card with the normal distribution.

   **Shadowless:** Base Set cards can come out as their **Shadowless** variant (24%) or **1st Edition Shadowless** (6%). They are different copies in the album, with a tag and a golden glow, and they sell for more.
3. **Put a card to train** (*Train*, on the pack screen or from the album). While you use tokens, its bar advances and the panel estimates how many days are left based on your pace over the last 7 days. After ~1.5M tokens it **evolves** into the next card of its line (for example Charmander → Charmeleon → Charizard), preferring cards that pass the filter above and a similar rarity; the following stages last ~4.5M, ~6M and ~8M tokens. When it has no more evolutions it **completes its line**, gives you **a pack** (once per card) and stays in the slot as a **Master**, still gaining levels. `growth.multiplier` scales these durations. Since many holographic cards from the old eras are already a final form, it is normal for some cards to graduate without evolving. With *Retire* you free the slot without losing anything.
4. **You collect** everything in the album. The side panel shows a summary and your 3 latest cards; the **Open album** button (or `F1` → *TokenBinder: Open album*) opens it in a large editor tab, with search by name, set or rarity, filters by rarity and era, sorting (rarity, recent, name, duplicates) and a large card viewer from which you can train the card or **sell duplicate copies**. Everything can be used with the keyboard (Tab, Enter, Space, Esc).

Cards show a 3D tilt that follows the mouse, and cards of Holo rarity or higher add a holographic shine (Illustration and Secret ones have their own effects).

## Level, stats and market value

- **Level (1-50):** each card earns as XP the tokens you use while it is in a training slot: one level per 400K tokens (about 20M for level 50). When it evolves, the new card **inherits the level**; Masters (like Zapdos, which does not evolve) keep growing. Retiring a card does not take its level away.
- **Stats (HP, ATK, DEF, SPD):** they come from the real card data (HP, damage of its attacks, retreat cost), normalized per era so that a vintage card and a VMAX are comparable, and they improve with level, stage and rarity. For now they are only displayed; they will be used in battles. Cards you already had are completed automatically when you open the album (an internet connection is needed).
- **Market value:** the album viewer shows an approximate price (Cardmarket trend in € and TCGplayer price in $), a collectibility label (*Market common* → *Grail*) and the approximate value of your whole collection. It is refreshed when you look at a card if it is more than 7 days old. It is the price of the regular card (it does not distinguish Shadowless) and it is informational only: it **does not change** what coins give you.

## Mystery boxes, items and evolutions

A **mystery box** (120 coins in the shop) gives one random item. Open it from the *Items* panel. Items you own are listed there.

| Item | What it does |
|---|---|
| Fire / Water / Thunder / Leaf / Ice / Sun / Moon / Shiny / Dawn Stone, King's Rock | Pick a branch of a branching evolution (see below) |
| Rare Candy | Raises a card by one level |
| Lucky Egg | A card in training earns **double XP** (levels) for the next 1M tokens; they stack |
| Mega Stone, Dynamax Band, Star Core, Tera Orb (rare) | Transform a finished card (see below) |

**Branching evolutions.** Some lines can evolve in several ways: Eevee (8 species), Gloom, Poliwhirl, Slowpoke, Kirlia, Snorunt, Cosmoem, Wurmple and Pikachu (Raichu or Alolan Raichu). When the training bar is full, the card **waits** and the panel asks you to choose. A species that is tied to an item (for example Umbreon needs a Moon Stone, Flareon a Fire Stone, Gallade a Dawn Stone) is only available if you have it; the item is spent. Species with no item are free to pick, and **Let it evolve naturally** picks a random branch for free. Luck upgrades make the rare items likelier.

**Transformations.** A **finished (Master) card of level 20 or higher** can be transformed with the matching item: Mega Stone → Mega (*M X EX*, *Mega X ex*), Dynamax Band → VMAX, Star Core → VSTAR, Tera Orb → Terastal ex. Open the card in the album and use the button; the new card keeps the level and the old one stays in your album. The item is only spent if such a card exists (the lookup is done first). Cards that are already a Mega/VMAX/VSTAR cannot be transformed again.

## Protection and grading

Like real collectors, you can protect your cards and have them **graded**. Open a card in the album to see its protection and the grading service.

- **Sleeve** (15 coins) and **toploader** (50 coins): bought in the shop or found in mystery boxes. Each card can have one of each; they improve its odds when graded.
- **Grading ("TBGS", a fictional service):** pay a fee that depends on the card's rarity (30 coins for a Common up to 1,200 for a Secret). The card is away until you have used **500K more tokens**, then it comes back with a grade from **1 to 10** (Gem Mint). A card in a training slot must be retired first, and a card that is away cannot train.
- **The odds:** the grade follows a bell curve (most cards get a 5-7). A Gem Mint 10 is about 0.5% without protection and about 8% with a sleeve **and** a toploader.
- **Re-submitting** a card costs one more base fee each time and can only **improve** its grade, never lower it.
- **What a grade does:** the card is shown in a slab with its grade, and its market value is multiplied (10 → ×3, 9 → ×1.8, 8 → ×1.3, 7 → ×1.1, 6 → ×1, then lower for poor grades), which also counts in the value of your collection.

## Coins and shop

Besides the free packs, you earn **1 coin per 10K tokens** used. There is a **+20% bonus** while your quota usage is below the pace of the month (for example, being at 40% of the quota halfway through the month). No coins are given for tokens used before installing version 0.3.

**Selling duplicates:** each duplicate copy gives coins according to its tier (3 · 6 · 12 · 30 · 70 · 160 · 400, from Common to Secret), ×2 if Shadowless and ×5 if 1st Edition. You always keep one copy. The *Sell duplicates* button in the album sells them all at once (it asks for confirmation).

| Item | Price | What it gives |
|---|---|---|
| Pack | 80 | 2 cards |
| Premium pack | 250 | 2 cards with no commons and better odds of Holo or higher |
| Poké Ball | 15 | 1 card |
| Sleeve | 15 | Protection for one card (better grading odds) |
| Toploader | 50 | Rigid protection for one card (a bigger boost to grading odds) |
| Mystery box | 120 | 1 random item (stones, candy, Lucky Egg, rare transformation items) |
| Training slot | 400 · 900 · 1,600 · 2,600 · 4,000 | One more card growing at a time (up to 6 slots) |
| Luck upgrade | 300 · 600 · 1,200 · 2,400 · 4,800 | +20% per level to the weight of the Modern and Current eras in packs, and to the probability of Shadowless variants (5 levels) |

Prices are fixed in this version; if they seem expensive or cheap, let me know and they will be adjusted.

## Backup and changing computers

Your progress (album, coins, cards in training, purchases) lives inside VS Code on this computer. To save it or take it to another: `F1` → **TokenBinder: Export progress** creates a `.json` file, and on the other computer `F1` → **TokenBinder: Import progress**. Importing **replaces** the current progress (it asks for confirmation).

**Start from scratch:** `F1` → **TokenBinder: Reset progress**. It deletes the album, coins, cards in training and upgrades, and gives you a welcome pack; your tokens and quota settings are not touched. It offers to save a copy first with *Export and reset*. Tokens you already used on the new computer give no retroactive coins or packs.

## Privacy

Everything is local. The extension **only reads** VS Code files on your computer and **sends nothing** to any server. It never reads the content of your questions or answers: only the token counters. The only network requests are **downloads** of card data and images from `api.tcgdex.net` and `assets.tcgdex.net` (none of your data is sent; everything downloaded stays on disk and is not requested again) and the **update check**: at most one request a day to `api.github.com` for the latest release of this repository, which carries no data of yours beyond what any web request carries (turn it off with `tokenBinder.updates.check`). If your corporate network blocks those domains you will not be able to open packs, but the token counter and the quota keep working.

## How it works

VS Code stores each chat turn with its tokens in local files; TokenBinder reads and adds them up:

| VS Code version | Where the usage is | Format |
|---|---|---|
| Recent (tested on 1.142) | `<data>/Code/agentSessionData/<session>/session.db`, table `turn_usage` | SQLite |
| Earlier | `<data>/Code/User/workspaceStorage/<hash>/chatSessions/*.jsonl` | JSON lines |

`<data>` is `%APPDATA%` on Windows, `~/Library/Application Support` on macOS and `~/.config` (or `$XDG_CONFIG_HOME`) on Linux. It also checks `Code - Insiders` and `VSCodium`, and always the folder of the VS Code installation that is running the extension (so portable installs work too). Reading SQLite requires the `node:sqlite` module: TokenBinder uses VS Code's and, if it is not available, runs a process with VS Code itself as Node and, as a last resort, the `node` (22.5 or newer) on your PATH.

An agent turn that chains several model calls is counted in full (sum of all rounds). Tokens served from cache count toward the total, just like the usage the provider bills.

## Known limitations

- **The quota is manual.** There is no way to read the real consumption of the organization from the computer; if the company measures differently (for example, weighting by model), the % may differ.
- **It only sees this computer.** If you work on two machines, each one counts its own.
- **The date of each turn is approximate.** The databases do not store the time per turn: TokenBinder records when it first sees each turn. History from before installing the extension is dated with the last modification of its session.
- **Credits are an estimate** derived from an internal VS Code field whose semantics are not documented. If you use `quota.unit: credits`, compare it with what GitHub shows.
- **VS Code's internal format may change** between versions, since it is not a public API.

## Troubleshooting

**The counter stays at 0**
1. Open `View > Output` and pick **TokenBinder** in the dropdown: the exact error appears there.
2. If it says SQLite is not available, install [Node.js](https://nodejs.org) 22.5 or newer and restart VS Code.
3. Check that files exist in `agentSessionData/` or in `User/workspaceStorage/*/chatSessions/` inside VS Code's data folder (Windows: `%APPDATA%\Code\`; macOS: `~/Library/Application Support/Code/`; Linux: `~/.config/Code/`). If your VS Code keeps the chat somewhere else (portable install, another data folder), set it in `tokenBinder.storageRoots`.
4. Run **TokenBinder: Recalculate usage**.

**Packs cannot be opened** ("offline" appears): check that your network allows `api.tcgdex.net` and `assets.tcgdex.net`. The pack is not spent if it fails.

**The icon does not appear in the activity bar**: restart VS Code completely (reloading the window is not enough).

**`code` is not recognized**: in VS Code, `Ctrl+Shift+P` (`Cmd+Shift+P` on a Mac) → *Shell Command: Install 'code' command in PATH*.

**macOS: the installation fails or the counter stays at 0**: if the script does not work, install by hand (Option 2: `Cmd+Shift+P` → *Extensions: Install from VSIX…*) and restart VS Code with `Cmd+Q` (closing the window is not enough). If the counter is still at 0, look at `View > Output > TokenBinder`; with 1.2.0 you no longer need Node on the PATH.

If the counter still does not move, open an *issue* with the VS Code version and the **keys** (no content) of a `turn_usage` row; the format is the most likely thing to have changed.

## Development

```powershell
git clone https://github.com/SoreviR/token-binder.git
cd token-binder
npm install
npm test            # tests for the reader, the quota, the game engine and the languages
npm run build       # compiles to dist/
npm run package     # produces token-binder-X.Y.Z.vsix
```

Press **F5** in VS Code to open a development window with the extension loaded.


Layout: `src/update/` (update check), `src/usage/` (session reading: `journal`, `sqlite`, `extract`, `store`), `src/quota.ts` (quota), `src/game/` (pack/training engine and TCGdex client), `src/i18n/` and `media/i18n.js` (English and Spanish texts), `src/webview/` and `media/` (side panel and album tab).

Adding a language: add its keys to `src/i18n/` (the compiler complains about any key that is missing), to `media/i18n.js` and to `package.nls.<lang>.json`; `npm test` checks that all dictionaries match.

### Publishing a version

1. Bump the version in `package.json` and add a `## X.Y.Z - date` section to `CHANGELOG.md`, then commit.
2. `git tag vX.Y.Z && git push --tags`.

GitHub Actions runs the tests, packages the `.vsix` and attaches it to the Release with the changelog section as its notes (it fails if the section is missing); the installers and the in-extension updater always use the latest release. Keep the file name `token-binder-X.Y.Z.vsix`: both depend on it.

## Credits and license

Code under the [MIT](LICENSE) license. Pokémon, the Pokémon TCG and the names and images of the cards are the property of Nintendo, Creatures, Game Freak and The Pokémon Company; this is a hobby project with no commercial purpose, and it **does not include any card image in the repository**: they are downloaded at runtime from [TCGdex](https://tcgdex.dev), a free community database.

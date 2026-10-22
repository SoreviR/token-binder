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
| `tokenBinder.sound.enabled` | `false` | Short sound effects (opening packs, fights, goals), generated by the browser: no audio files. Off by default. |
| `tokenBinder.mishaps.enabled` | `false` | Mishaps for going over 100% of your own monthly quota (see [Going over the quota](#going-over-the-quota-mishaps)). Off by default; cards you invested in are never lost. |
| `tokenBinder.online.enabled` | `false` | Turn on the online leagues (see [Online leagues](#online-leagues-opt-in)). |
| `tokenBinder.online.server` | `https://token-binder-league.vercel.app` | Address of the league server (`https`). Only you can set it, never a workspace. |
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
- **Stats (HP, ATK, DEF, SPD):** they come from the real card data (HP, damage of its attacks, retreat cost), normalized per era so that a vintage card and a VMAX are comparable, and they improve with level, stage and rarity. They are the ones used in battles. Cards you already had are completed automatically when you open the album (an internet connection is needed).
- **Market value:** the album viewer shows an approximate price (Cardmarket trend in € and TCGplayer price in $), a collectibility label (*Market common* → *Grail*) and the approximate value of your whole collection. It is refreshed when you look at a card if it is more than 7 days old. It is the price of the regular card (it does not distinguish Shadowless) and it is informational only: it **does not change** what coins give you.

## Battles

Take **one card** to battle: open it in the album and press **Take to battle**, then open the **Battle** tab. You face the eight Kanto gym leaders one after another (Brock, Misty, Lt. Surge, Erika, Koga, Sabrina, Blaine, Giovanni), each with one real card of their own. A fight is automatic and lasts about 7 rounds; the screen shows the odds before you start, plays it back with the real name of each attack, and explains **why you won or lost** afterwards.

**What makes a card strong.** Thousands of cards have very different printed HP and damage, so what is printed on the card does **not** decide a fight. Strength comes from small, visible factors, and the Battle tab shows the breakdown for your card:

| Factor | Effect |
|---|---|
| **Training level** (the biggest one) | +1.8% per level (level 50 = ×1.88) |
| **Market demand** (how much the card is really worth, *Market common* → *Grail*) | +2% per class, up to +10% |
| **Rarity** (Holo, Ultra, Secret…) | +0.3% per category, up to +1.8% |
| **Evolution stage** | +2% Stage 1, +4% Stage 2 and ex/V/VMAX/Mega |
| **Grade** (graded cards) | +0.8% per point above 5, up to +4% |
| **Token-usage bonus** | up to +8%: +2% for every 25 points of monthly quota you have used less than a typical player (75%) |

What the card prints only changes *how* it fights: a card with more HP than damage leans tanky, the opposite leans hard-hitting, with the same total power. A type weakness is worth +15% damage (resistance −8%). The fight is rolled with a seed, so it is fair and reproducible.

**The ladder.** Beat a leader to unlock the next; the first victory gives a **badge** and coins (150 → 1,000), later victories give 3 coins, up to 5 paid rematches a day (a month of normal use earns around 500 coins from tokens, so fighting complements the economy instead of replacing it). The leaders' levels go 3, 9, 15 … 45, so you roughly need a card of their level. Your record, streak and last fights are saved.

**Fighting also trains.** The card that fights earns **10,000 XP for a win and 4,000 for a defeat** (the first 5 fights of each day, about an eighth of a level at most). It does not replace training with tokens: a card still needs a training slot to level up steadily.

### Weekly boss and daily cup

- **Weekly boss:** the Battle tab shows one boss a week (the same for everybody, a new one every Monday) at level 40-50. You get **3 attempts a week**; the **first victory of the week** pays 🪙 400 and a mystery box. It is meant for a well trained card, and the tab shows your odds first.
- **Daily cup:** three fights in a row against rivals a little stronger than your card, **one cup a day**. Entry costs 🪙 30; winning 2 rounds pays 🪙 45 and winning all 3 pays 🪙 120 and a mystery box. It is a coin sink as much as a reward: on average it costs a bit more than it pays. If the rivals' cards cannot be downloaded (offline) nothing is charged.
- Both count in your record and history like any fight, and the card that fights earns battle XP as usual (within the daily limit).

### Card frames

Once you have bought everything else, **card frames** (Gold, Neon, Flame, Frost, Rainbow; 🪙 200-800) are a cosmetic way to spend coins. They are in the **Items** tab and only change how your cards look in the album.

## Mystery boxes, items and evolutions

A **mystery box** (120 coins in the shop) gives one random item. Open it from the side panel or from the **Items** tab of the album, where every item you own is shown as a card with what it does.

| Item | What it does |
|---|---|
| Fire / Water / Thunder / Leaf / Ice / Sun / Moon / Shiny / Dawn Stone, King's Rock | Pick a branch of a branching evolution (see below) |
| Rare Candy | Raises a card by one level |
| Lucky Egg | A card in training earns **double XP** (levels) for the next 1M tokens; they stack |
| Mega Stone, Dynamax Band, Star Core, Tera Orb (rare) | Transform a finished card (see below) |
| Sturdy Plate, Choice Band, Quick Claw, Lucky Charm | **Held in battle**, one per card (equip them from the card in the album; they are not used up) |

**Held items** change *how* a card fights without making it stronger: the Sturdy Plate (+10% HP, −10% ATK) makes it tankier, the Choice Band (+10% ATK, −10% HP) a glass cannon, the Quick Claw acts first more often (+30% speed, −1% ATK), and the Lucky Charm gives many more critical hits (+20%) but more misses (+9%): a swingier fight that helps the weaker side and hurts the favorite. Tests keep each one at about 50% against the same card without it.

**Branching evolutions.** Some lines can evolve in several ways: Eevee (8 species), Gloom, Poliwhirl, Slowpoke, Kirlia, Snorunt, Cosmoem, Wurmple and Pikachu (Raichu or Alolan Raichu). When the training bar is full, the card **waits** and the panel asks you to choose. A species that is tied to an item (for example Umbreon needs a Moon Stone, Flareon a Fire Stone, Gallade a Dawn Stone) is only available if you have it; the item is spent. Species with no item are free to pick, and **Let it evolve naturally** picks a random branch for free. Luck upgrades make the rare items likelier.

**Transformations.** A **finished (Master) card of level 20 or higher** can be transformed with the matching item: Mega Stone → Mega (*M X EX*, *Mega X ex*), Dynamax Band → VMAX, Star Core → VSTAR, Tera Orb → Terastal ex. Open the card in the album and use the button; the new card keeps the level and the old one stays in your album. The item is only spent if such a card exists (the lookup is done first). Cards that are already a Mega/VMAX/VSTAR cannot be transformed again.

## Protection and grading

Like real collectors, you can protect your cards and have them **graded**. Open a card in the album to see its protection and the grading service.

- **Sleeve** (15 coins) and **toploader** (50 coins): bought in the shop or found in mystery boxes. Each card can have one of each; they improve its odds when graded.
- **You can see what a card wears.** A sleeve is drawn over the card (a glossy film and a sealed top edge), a toploader as a rigid transparent frame with the card-removal notch, and a graded card sits in a slab with its grade. Chips under the card name them (hover for what each one does) and show its **condition**; the album thumbnails show small 🛡️ / 📦 icons. **Sleeves and toploaders do not change the stats**: they protect the card.
- **Wear.** The card you take to battle may lose condition after a fight: **10%** with no protection, **2%** with a sleeve, **4%** with a toploader and **0%** with both. Conditions go Mint → Near Mint → Lightly → Moderately → Heavily Played and never recover. Every step lowers its market value by 6% and its grading odds a little, and the card shows it (whitened edges, creases). A graded card is sealed in its slab and never wears, so grade valuable cards before using them in battle.
- **Grading ("TBGS", a fictional service):** pay a fee that depends on the card's rarity (30 coins for a Common up to 1,200 for a Secret). The card is away until you have used **500K more tokens**, then it comes back with a grade from **1 to 10** (Gem Mint). A card in a training slot must be retired first, and a card that is away cannot train.
- **The odds:** the grade follows a bell curve (most cards get a 5-7). A Gem Mint 10 is about 0.5% without protection and about 8% with a sleeve **and** a toploader.
- **Re-submitting** a card costs one more base fee each time and can only **improve** its grade, never lower it.
- **What a grade does:** the card is shown in a slab with its grade, and its market value is multiplied (10 → ×3, 9 → ×1.8, 8 → ×1.3, 7 → ×1.1, 6 → ×1, then lower for poor grades), which also counts in the value of your collection.

## Online leagues (opt-in)

Challenge your friends with the card you take to battle and climb a shared ranking. It is **off by default** and needs a league server: the default one is hosted by the author, and you can host your own on Vercel (see [`server/`](server/README.md), it is small) and set its address.

- **Leagues** are private: someone creates one and shares its **invite code** (like `K7MQ-4XPD`). Up to 30 players per league. The **League** tab of the album lists the ranking, your fighter and the duels.
- **Duels are asynchronous.** You challenge the card a friend registered; the server plays the fight at once with the same rules as the Battle tab, moves the Elo of both (K = 32) and your friend gets a notification and can watch the replay. Limits: **10 challenges a day** and **2 a day against the same player**. Duels pay **no coins** (they would inflate the economy); the card you fight with earns battle XP like in any other fight.
- **Both sides use the same data.** The server looks the cards up in TCGdex itself, so a card has the same stats and price for both players. You register your level, grade and held item; to keep that honest between friends, **a new player can field cards up to level 10 and the cap rises 4 levels a day** (anything above is clamped, not refused). It is a speed bump, not proof: the server cannot see your tokens.
- **A shared ranking page** at `<server>/l/<invite code>` shows the Elo table and the latest duels to whoever has the code.
- **Privacy.** Turning it on asks first and then signs you in with the GitHub account VS Code already has. The server stores only your **GitHub id and login**, your **battle card (level, grade, held item)**, roughly **how much of your quota you used** (it feeds the small token-usage bonus) and your **duel results**. Your usage, chats, code and the rest of your collection never leave your computer, and the GitHub token is checked once and never stored. **Delete my online data** (League tab or the command palette) removes everything about you from the server. The setting that holds the server address can only be set by you, never by a workspace, and the extension only sends your sign-in to an `https` address.

## Going over the quota: mishaps

Going over the quota can have consequences. They are **off by default** (turn them on with `tokenBinder.mishaps.enabled`) and only count if **you** set your own monthly limit (the default limit is just a placeholder). Once you go **over 100%** of the quota, **one** mishap happens in that quota period (never more than one per period). The **first period** after you turn them on is free, and a mishap only happens when your usage actually grows, so changing the limit never triggers one. **Cards you invested in are never lost:** mishaps only take *virgin* cards (no level, no protection, no held item, never worn or graded, not training, not your battle card) and the **spare copies** of cards you did invest in; the last copy of those, and everything it carries, is always safe.

- 🚀 **Team Rocket** (60%) steals one random spare card. It appears in the **Battle** tab while they have it: beat them (Arbok, level 15) and you get it back, merged with what you have (nothing is lost). No coins, and a loss only means you try again; the fight trains your card like any other.
- 🏃 **You trip while running** (30%) and drop **10%** of your spare copies (at least one); they are lost. **Another 10%** of your cards get scuffed on the ground and wear one step, unless they have a **sleeve**: then the sleeve takes the hit and is torn instead. Graded cards are safe in their slab.
- 🌧️ **It rains** (10%) on **half** of your album, at most **6 cards**. Cards in a **sleeve** or a **slab** stay dry; the rest end up **soaked**: worth nothing, and they cannot train, battle, be graded, be sold or be transformed. A **Charmandryer** (40 coins in the shop, a hair dryer with the flame of Charmander's tail) dries one soaked card, which comes back usable but Heavily Played.

A card in a training slot goes with you and one at the grading service is not at home, so neither of them can be stolen, dropped or soaked. A notification tells you what happened and opens the album.

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

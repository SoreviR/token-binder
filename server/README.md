# TokenBinder league server

A small server for the online leagues of the extension: private leagues with an invite code, asynchronous duels, an Elo ranking and a ranking web page. It runs on **Vercel** (one serverless function) with **Neon Postgres**.

The server contains no game rules of its own: it imports the extension's engine (`../src/game`) so a duel is played with exactly the same rules as the Battle tab. If those rules change (`BATTLE_VERSION`), extensions with other rules are told to update before they can play online.

## Seasons

A league plays by calendar month (UTC), named like `2026-10`. The first request of a new month (anyone's: the board, the ranking page or a duel) closes the previous season: the top three (players who fought and are not flagged BUSTED) are archived in `league_seasons`, and everybody's Elo is pulled halfway back to 1000 with a clean win-loss record, also for members who left (`member_stats`). One guarded `UPDATE` on `leagues.season` decides who does it, so concurrent requests cannot archive twice. A league that sat idle for months archives only the last season it played, and a league from before seasons just adopts the current one. The board and the ranking page show the current season, when it ends, last season's podium and a 🏆 next to each player's seasons won. Deleting your data removes your trophies.

## Showcase

Each player can show off one card: the one they pin in the album, or otherwise their most valuable one (market value x grade x condition, computed by the extension). The extension sends it with `PUT /api/v1/showcase` (`{ key, grade }`, only when it changes). The server cannot see anyone's album, so it is **a claim**: it checks that the key is a card TCGdex knows and that the grade is 1-10, and works out the estimated value itself from the cached TCGdex price. It appears in the League tab next to the player's row and in a gallery on the public ranking page; a player flagged BUSTED shows none. It is deleted with the rest of your data.

## What it stores

Only what the League tab says: your GitHub id and login, the card you take to battle (level, grade, held item) and the two cards of your team for team leagues (same details), roughly how much of your quota you used, a summary of your save (how many coins, cards, items and levels you have — counts only, used to spot an edited save; never what the cards are), the duels, the podium places you won and the card you show off. `DELETE /api/v1/me` removes all of it. The GitHub token is checked once against `api.github.com` and never stored.

## Layout

| Path | What |
|---|---|
| `api/v1.ts` | the only function; `vercel.json` rewrites `/api/v1/*` to it and it hands the request to the router |
| `lib/router.ts` | routes, session and battle-version check |
| `lib/service.ts` | what each route does (leagues, fighters, duels, inbox, deletion) |
| `lib/rules.ts` | pure rules: level cap, Elo, daily limits, invite codes |
| `lib/auth.ts` | signed sessions and the GitHub check |
| `lib/cards.ts` | card cache from TCGdex (both duelists use the same data and prices) |
| `lib/schema.ts` | tables, created on first use |
| `public/league.html`, `league.css`, `league.js` | the ranking page (`/l/<invite code>`): podium, sortable ranking with card art, showcase gallery with a lightbox, season bar and last season's podium, duels by day with their Elo change (click a player to filter). English or Spanish by the browser language, light and dark, refreshed every minute. It builds the DOM as text nodes (never as HTML) and `vercel.json` serves it with a strict Content-Security-Policy (scripts and styles only from the site itself, images only from `assets.tcgdex.net`); `test/server.page.test.ts` guards both |

## Deploy your own

1. Create a Vercel project from this repository with **Root Directory** `server` and make sure **"Include source files outside of the Root Directory"** is on (the function imports `../src/game`).
2. Add **Neon** from the Vercel Marketplace; it sets `DATABASE_URL`.
3. Add the environment variable `SESSION_SECRET` (a long random string: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
4. Deploy, then check `https://<your-project>.vercel.app/api/v1/health`.
5. In VS Code, put that address in the setting `tokenBinder.online.server` and open the **League** tab.

## Develop

The tests need no server: `npm test` runs the whole flow against an in-memory Postgres (PGlite) with TCGdex and GitHub faked (`test/server.*.test.ts`, `test/online.controller.test.ts`).

## Limits worth knowing

- The server cannot see anyone's tokens or collection, so it cannot *prove* a save is honest. What it can see is wall-clock time. The extension reports its whole-save figures (coins, cards, items, levels, lifetime tokens) with the fighter, and `isImplausible` (`lib/rules.ts`) flags a report that **grew faster than real time allows** since the last accepted one: an edited save with millions of coins, every card maxed or thousands of cards. The first report has no baseline, so it is judged against its own lifetime tokens (`isImplausibleFirst`): a long honest history passes, a save that is far bigger than those tokens could buy does not. A fighter with more XP than the whole save is flagged too, and a client that sends no report cannot field a fighter. A flagged (BUSTED) player is sorted to the bottom of every ranking and can neither challenge nor be challenged. Two ways out: a **majority of the other members** vote them back in (**in that league only**, so a second account cannot clean a cheater everywhere), or they **start over** (`POST /me/reborn`, which clears the baseline: a save that was not really reset is flagged again on the next report). Only growth is checked, so selling, mishaps or a reset never flag anyone. It catches a careless cheater, not one who edits very slowly or who edits before the first report; the level is still capped by tenure as a second line.
- Leagues are invite-only, but anyone with a GitHub account can join one they have the code for; the ranking assumes the people in a league are not inventing extra accounts to farm Elo.
- The daily duel limits are enforced with an atomic per-day counter (`league_duel_quota`, one per league: each league is its own competition), so firing many challenges at once can no longer slip past them, and leaving a league no longer resets your Elo (it is kept in `member_stats` and restored if you rejoin).
- There is no rate limiting beyond the daily duel limits; Vercel's platform protections apply.

# TokenBinder league server

A small server for the online leagues of the extension: private leagues with an invite code, asynchronous duels, an Elo ranking and a ranking web page. It runs on **Vercel** (one serverless function) with **Neon Postgres**.

The server contains no game rules of its own: it imports the extension's engine (`../src/game`) so a duel is played with exactly the same rules as the Battle tab. If those rules change (`BATTLE_VERSION`), extensions with other rules are told to update before they can play online.

## What it stores

Only what the League tab says: your GitHub id and login, the card you take to battle (level, grade, held item), roughly how much of your quota you used, and the duels. `DELETE /api/v1/me` removes all of it. The GitHub token is checked once against `api.github.com` and never stored.

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
| `public/league.html` | the ranking page (`/l/<invite code>`) |

## Deploy your own

1. Create a Vercel project from this repository with **Root Directory** `server` and make sure **"Include source files outside of the Root Directory"** is on (the function imports `../src/game`).
2. Add **Neon** from the Vercel Marketplace; it sets `DATABASE_URL`.
3. Add the environment variable `SESSION_SECRET` (a long random string: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
4. Deploy, then check `https://<your-project>.vercel.app/api/v1/health`.
5. In VS Code, put that address in the setting `tokenBinder.online.server` and open the **League** tab.

## Develop

The tests need no server: `npm test` runs the whole flow against an in-memory Postgres (PGlite) with TCGdex and GitHub faked (`test/server.*.test.ts`, `test/online.controller.test.ts`).

## Limits worth knowing

- The server cannot see anyone's tokens, so levels are only checked for plausibility: a new player's level is capped and the cap rises each day (`lib/rules.ts`). It is a speed bump for friends, not protection against a determined cheater.
- There is no rate limiting beyond the daily duel limits; Vercel's platform protections apply.

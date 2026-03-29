# ClearTheBench — Agent Context

> **This file is the authoritative project reference for AI agents.**
> Read it fully before touching any code. All conventions here are enforced.

## Quick Reference

```bash
# Inject Supabase credentials (generates supabase-config.js from env vars)
npm run build

# Check open PRs
gh pr list

# Check Vercel deployments
vercel ls

# Deploy preview
vercel deploy

# Deploy production — always ask owner first
vercel deploy --prod -y
```

Environment variables needed: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
Set via `.envrc` locally (copy from `.envrc.template`) or in Vercel dashboard.

---

## What this project is

ClearTheBench is a vanilla JS youth soccer coaching sideline tool. Coaches use it on their phones during games to track player rotations and playing time. It is a **static site** deployed on Vercel from the `erdabo-labs/clearthebench` GitHub repo, auto-deployed on push to `main`.

---

## Stack — strictly enforced, no exceptions

| Constraint | Rule |
|---|---|
| Framework | **None.** Vanilla JS only. |
| Bundler | **None.** Files served as-is. |
| CSS | All styles in `css/styles.css`. No `<style>` tags in JS. No inline style blocks. |
| JS modules | Multiple static files, each with a clear domain. **Never consolidate files.** |
| Script loading | At bottom of `<body>`, **no `defer`**, order matters. |
| Supabase client | CDN (`@supabase/supabase-js@2`). Client instance is `const _db = window.supabase.createClient(...)` declared in `db.js`. |
| DB access | **All Supabase calls live in `db.js`.** Never call `_db` directly from other files. |
| New dependencies | Ask before adding anything. |

---

## File structure

```
index.html              <- app shell, <div id="app"><div id="screen-container"></div></div>
css/styles.css          <- all styles
js/
  db.js                 <- ALL Supabase calls; db_* function namespace
  auth.js               <- magic link auth
  router.js             <- router_register() + router_navigate()
  app.js                <- home, signin, create-team, team detail
  game.js               <- create-game, live game, game-summary
scripts/
  inject-config.js      <- build script that injects Supabase credentials
supabase-config.js      <- gitignored; injected at build time
vercel.json             <- Vercel deployment config
```

### Script load order in `index.html`

```html
<script src="/js/db.js"></script>
<script src="/js/auth.js"></script>
<script src="/js/router.js"></script>
<script src="/js/app.js"></script>
<script src="/js/game.js"></script>
```

---

## Router

`router.js` is a minimal custom router. No history API, no URLs — purely in-memory screen swaps.

```js
router_register('screen-name', async (container, params) => { ... });
router_navigate('screen-name', { ...params });
```

All screens render into `#screen-container`. Navigation is always explicit — there are no back-button hooks or browser history entries.

### Registered screens

| Screen | File | Purpose |
|---|---|---|
| `home` | app.js | Coach home (signed-in or signed-out) |
| `signin` | app.js | Magic link login |
| `create-team` | app.js | New team form |
| `team` | app.js | Team detail: roster + game controls |
| `create-game` | game.js | Pre-game setup: attendance, field size, rotation interval |
| `game` | game.js | Live game: field/bench zones, timer, subs, SWAP ALL |
| `game-summary` | game.js | Post-game playing time results |

---

## Authentication

Coach only, via Supabase magic link email. Session stored in localStorage as `ctb_coach` (JSON).

`auth_init()` is called once in `router_init()` at boot. It handles magic-link callback (hash fragment), existing Supabase session, and localStorage session restore.

---

## Database

All tables use the `ctb_` prefix in Supabase.

### Key tables

```
ctb_coaches       — id (uuid PK, mirrors auth.users.id), email, created_at
ctb_teams         — id, coach_id (FK), name, sport, short_code, created_at
ctb_seasons       — id, team_id (FK), name, active, created_at
ctb_players       — id, team_id (FK), name, jersey_number, active, created_at
ctb_games         — id, season_id (FK), opponent, date, mode, field_size, strategy_snapshot (jsonb), created_at
ctb_game_roster   — id, game_id (FK), player_id (FK)
ctb_game_events   — id, game_id (FK), player_id (FK, nullable), event_type, timestamp (int), meta (jsonb), created_at
```

### DB function inventory (`js/db.js`)

```js
db_getOrCreateCoach(email)
db_getTeams(coachId)
db_createTeam({ coachId, name, sport })
db_deleteTeam(teamId)

db_createSeason(teamId, name)
db_getActiveSeason(teamId)

db_getPlayers(teamId)              // active only
db_createPlayer({ teamId, name, jerseyNumber })
db_updatePlayer(playerId, updates)
db_deactivatePlayer(playerId)      // sets active=false

db_createGame({ seasonId, opponent, mode, fieldSize, strategySnapshot, playerIds })
db_getGame(gameId)
db_getActiveGame(seasonId)         // game with events but no game_end
db_getGameSummary(gameId)          // per-player field time from events
db_deleteGame(gameId)

db_insertEvent({ gameId, playerId, eventType, timestamp, meta })
db_getGameEvents(gameId)
db_deleteRecentEvents(gameId, count)
```

---

## Event-sourced timer — critical architecture

`game_events` is the **source of truth** for all playing time. The timer is never stored directly — it is reconstructed from events on every page load.

| event_type | player_id | meaning |
|---|---|---|
| `sub_on` | required | player entered field |
| `sub_off` | required | player left field |
| `game_start` | null | timer started |
| `game_pause` | null | timer paused |
| `game_end` | null | game finalized |

**A game is "active" (not yet complete) if it has events but no `game_end` event.** `db_getActiveGame()` implements this check.

### Timer reconstruction on page load

1. Fetch all events from DB via `db_getGameEvents()`
2. Replay events to compute: timer position, who is on field/bench, cumulative times per player
3. If game was running (last event is `game_start` not followed by `game_pause`), resume timer from last known timestamp
4. This solves the critical bug of timer resetting on page refresh

---

## SWAP ALL — core feature

Rotation alert fires at a configurable interval (set during pre-game setup, stored in `strategy_snapshot`).

When the alert fires:
- Phone vibrates, alert tone plays (Web Audio API)
- "TIME TO ROTATE" banner appears with SWAP ALL button

When coach taps SWAP ALL:
1. Field players sorted by total playing time descending (most played first)
2. Bench players sorted by total bench time descending (longest waiting first)
3. Swap count = min(bench count, field count)
4. Top N from each list are paired and swapped (`sub_off` + `sub_on` events)
5. Banner dismissed, toast shown: "Rotated N players"

Individual swaps also supported: tap bench player, then tap field player to swap them. Undo toast available for 6 seconds.

---

## Live game state (`js/game.js`)

The live game screen uses a module-level `_gs` object:

```js
_gs = {
  game, team, coach, season, roster,
  fieldSize, players,          // per-player state map keyed by player_id
  timerRunning, timerSeconds, timerInterval,
  pendingBenchPlayer,          // for individual swap selection
  lastSwap,                    // for undo
  container,
  alertInterval,               // rotation interval in seconds
  swapAllVisible,              // whether SWAP ALL banner is showing
}
```

Per-player state in `_gs.players[id]`:
```js
{ onField, fieldEnteredAt, currentStint, totalOnTime, benchSince, totalBenchTime }
```

---

## Design system

Dark/light theme via `prefers-color-scheme`. Mobile-first (coaches use phones on sidelines).

### CSS variables
```css
:root {
  --bg, --bg-elevated, --card, --card2, --border
  --lime, --lime-dim, --orange, --red, --yellow, --blue
  --text, --text-muted
  --radius, --radius-sm
}
```

Light theme overrides backgrounds and text colors via `@media (prefers-color-scheme: light)`.

### Fonts
- `Bebas Neue` — headings, labels
- `DM Sans` — body text, buttons
- `JetBrains Mono` — timers, stats, codes

### UI patterns
- `.btn-primary` — main CTA (lime background), 44px min tap target
- `.btn-ghost` — secondary action
- `.player-chip` — field player card
- `.bench-player` — bench row with stats
- `.swap-all-banner` — rotation alert banner (orange, pulsing)
- `.app-header` — top bar with logo + back arrow
- `.input-field` — text inputs
- `.ctb-toast` — toast notifications

---

## Language rules — enforced in all UI copy

- Never use **"fair"** or **"fairness"**
- Never imply the app makes decisions — it **tracks and shows**
- The app has no opinion. The coach has the opinion.
- Examples: "Playing time" not "Fair time". "Shows who's been out longest" not "Decides who should sub in".

---

## Key patterns and conventions

- **HTML escaping**: use `_esc(str)` (defined in app.js) for all user data in template literals
- **Error handling**: all `db_*` functions log errors via `console.error('db_funcName', error)` and return `null` or `[]` on failure
- **No frameworks**: no React, Vue, Svelte, Alpine, etc. — ever
- **No bundler output**: edit source files directly; Vercel serves them as-is
- **DB calls are always `async/await`**: never `.then()` chains in call sites
- **One active game per season**: enforced by `db_getActiveGame()` returning the first unfinished game
- **Soft delete for players**: `db_deactivatePlayer()` sets `active=false`; hard deletes are only for games and teams
- **Supabase config**: `SUPABASE_URL` and `SUPABASE_ANON_KEY` are globals injected by `scripts/inject-config.js` at build time from environment variables; `supabase-config.js` is gitignored

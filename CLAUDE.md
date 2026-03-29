# ClearTheBench — Agent Context

> **This file is the authoritative project reference for AI agents.**
> Read it fully before touching any code. All conventions here are enforced.

---

## What this project is

ClearTheBench is a vanilla JS youth soccer coaching sideline tool. Coaches use it on their phones during games to track player rotations and playing time. It is a **static site** deployed on Vercel from the `erdabo-labs/clearthebench` GitHub repo, auto-deployed on push to `main`.

Environment variables needed: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
Set via `.envrc` locally (copy from `.envrc.template`) or in Vercel dashboard.

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

All screens render into `#screen-container`. Navigation is always explicit — no back-button hooks or browser history entries.

---

## Authentication

Coach only, via Supabase magic link email. Session stored in localStorage as `ctb_coach` (JSON).

`auth_init()` is called once in `router_init()` at boot. It handles magic-link callback (hash fragment), existing Supabase session, and localStorage session restore.

---

## Database

All tables use the `ctb_` prefix. All Supabase calls live in `db.js` with `db_*` function names. Read `db.js` for the full function inventory.

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

Timer reconstruction: fetch all events → replay to compute timer position, field/bench state, cumulative times → if game was running, resume from last known timestamp.

---

## SWAP ALL — core feature

Rotation alert fires at a configurable interval (set during pre-game setup, stored in `strategy_snapshot`).

When the alert fires: vibrate, alert tone (Web Audio API), "TIME TO ROTATE" banner with SWAP ALL button.

When coach taps SWAP ALL:
1. Field players sorted by total playing time descending (most played first)
2. Bench players sorted by total bench time descending (longest waiting first)
3. Swap count = min(bench count, field count)
4. Top N from each list are paired and swapped (`sub_off` + `sub_on` events)

Individual swaps also supported: tap bench player, then tap field player. Undo toast available for 6 seconds.

---

## Language rules — enforced in all UI copy

- Never use **"fair"** or **"fairness"**
- Never imply the app makes decisions — it **tracks and shows**
- The app has no opinion. The coach has the opinion.

---

## Key patterns and conventions

- **HTML escaping**: use `_esc(str)` (defined in app.js) for all user data in template literals
- **Error handling**: all `db_*` functions log errors via `console.error('db_funcName', error)` and return `null` or `[]` on failure
- **No frameworks**: no React, Vue, Svelte, Alpine, etc. — ever
- **No bundler output**: edit source files directly; Vercel serves them as-is
- **DB calls are always `async/await`**: never `.then()` chains in call sites
- **One active game per season**: enforced by `db_getActiveGame()`
- **Soft delete for players**: `db_deactivatePlayer()` sets `active=false`; hard deletes are only for games and teams
- **Supabase config**: globals injected by `scripts/inject-config.js` at build time; `supabase-config.js` is gitignored

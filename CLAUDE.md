# ClearTheBench — Agent Context

> **This file is the authoritative project reference for AI agents.**
> Read it fully before touching any code. All conventions here are enforced.

---

## What this project is

ClearTheBench is a vanilla JS youth-sports coaching sideline tool. Coaches use it on their phones during games to track playing time and run rotations. It currently supports two sports:

- **Soccer** — interval-based rotation alerts and SWAP ALL preview
- **Flag Football** — play-count-based tracking with offense/defense buttons and a manual rotation queue

It is a **static site** deployed on Vercel from the `erdabo-labs/clearthebench` GitHub repo, auto-deployed on push to `main`.

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
  db.js                 <- ALL Supabase calls; db_* function namespace; realtime helpers
  auth.js               <- magic link + 6-digit OTP code
  router.js             <- router_register() + router_navigate(); honors ?watch=GAMEID at boot
  app.js                <- home, signin, create-team (with sport selector), team detail
  game.js               <- create-game, live game (soccer + football), spectator (watch), game-summary
scripts/
  inject-config.js      <- build script that injects Supabase credentials
supabase-config.js      <- placeholder; overwritten at build time
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

`router.js` is a minimal custom router. No history API for normal navigation — purely in-memory screen swaps.

```js
router_register('screen-name', async (container, params) => { ... });
router_navigate('screen-name', { ...params });
```

All screens render into `#screen-container`. Navigation is always explicit — no back-button hooks or browser history entries.

**One exception**: `router_init()` reads `?watch=<gameId>` from `window.location.search` at boot. If present, it skips auth and goes straight to the spectator view. This is what makes the share-link URL work (`/?watch=<gameId>`).

---

## Authentication

Coach only. Two ways to sign in, both backed by the same Supabase magic-link email:

1. **Magic link** (default in a regular browser) — click the link, lands signed-in
2. **6-digit code** (for home-screen PWA users so the flow stays inside the app) — enter the code that's also in the email; verified via `_db.auth.verifyOtp({ email, token, type: 'email' })`

Session stored in localStorage as `ctb_coach` (JSON).

`auth_init()` is called once in `router_init()` at boot. It handles magic-link callback (hash fragment), existing Supabase session, and localStorage session restore.

The Supabase `magic_link` email template includes `{{ .Token }}` so both flows ship in one email.

---

## Database

All tables use the `ctb_` prefix. All Supabase calls live in `db.js` with `db_*` function names. Read `db.js` for the full function inventory.

### Key tables

```
ctb_coaches       — id (uuid PK, mirrors auth.users.id), email, created_at
ctb_teams         — id, coach_id (FK), name, sport ('soccer' | 'football'), short_code, created_at
ctb_seasons       — id, team_id (FK), name, active, created_at
ctb_players       — id, team_id (FK), name, jersey_number, active, created_at
ctb_games         — id, season_id (FK), opponent, date, mode, field_size, strategy_snapshot (jsonb), created_at
ctb_game_roster   — id, game_id (FK), player_id (FK)
ctb_game_events   — id, game_id (FK), player_id (FK, nullable), event_type, timestamp (int), meta (jsonb), created_at
```

`ctb_games.mode` values:
- `timer_swap` — soccer (default)
- `play_count` — flag football

The `sport` column on a team determines which mode `db_createGame` uses.

---

## Event-sourced state — critical architecture

`ctb_game_events` is the **source of truth** for all playing-time and play-count state. The timer / play count is never stored directly — it is reconstructed from events on every page load.

| event_type | player_id | timestamp meaning | when |
|---|---|---|---|
| `sub_on` | required | seconds (soccer) or play count (football) at moment | player entered field |
| `sub_off` | required | same | player left field |
| `game_start` | null | seconds (soccer only) | timer started |
| `game_pause` | null | seconds (soccer only) | timer paused |
| `game_end` | null | seconds or play count | game finalized |
| `play_logged` | null | play count after this play | football: a play happened (`meta.side: 'offense' \| 'defense'`) |

**A game is "active" (not yet complete) if it has events but no `game_end` event.** `db_getActiveGame()` implements this check.

**Reconstruction**: fetch all events → replay to compute current state → if soccer was running, resume timer from wall-clock anchor. Football has no timer; play count is just the highest `timestamp` seen on `play_logged` events.

---

## Soccer flow (`mode: 'timer_swap'`)

Existing flow. Rotation alert fires at a configurable interval (set during pre-game setup, stored in `strategy_snapshot.config.intervalMinutes`).

When the alert fires: vibrate, alert tone (Web Audio API), preview overlay slides up showing the proposed swap (`SWAP ALL`).

When coach taps SWAP ALL:
1. Field players sorted by total playing time descending (most played first)
2. Bench players sorted by total bench time descending (longest waiting first)
3. Swap count = `min(bench count, field count)`
4. Top N from each list are paired and swapped (`sub_off` + `sub_on` events)

Individual swaps also supported: tap bench player, then tap field player. Undo toast available for 6 seconds.

---

## Flag football flow (`mode: 'play_count'`)

No timer. Two big buttons in the header: **OFFENSE +1** (lime) and **DEFENSE +1** (blue). Each tap inserts a `play_logged` event with `meta.side` and increments the play counter; current on-field players accrue plays via `currentStint = playCount - fieldEnteredAt` (same math as soccer, just with plays as the unit).

### Field & bench grid
2-column grid. Each cell shows player name (large) plus stats `5P · 2S` (5 plays played, 2 plays sat). Hints:
- Orange "NEXT OUT" on the field player with the most plays (rolling — skips queued)
- Lime "NEXT IN" on the bench player who has sat the most plays (rolling — skips queued)

### Rotation queue
- Tap a bench player → adds them to **GOING IN** queue (lime)
- Tap a field player → adds them to **GOING OUT** queue (orange)
- A `NEXT ROTATION` panel renders with two columns; players already in either queue render dimmed/dashed-bordered in their original cell, in place
- Tap **ROTATE** to execute `min(in.length, out.length)` paired swaps and clear the queue
- Tap **CLEAR** to wipe the queue without swapping
- The queue is *not* tied to play taps — OFFENSE/DEFENSE only logs plays now

### Spectator (read-only watch view)
URL: `https://<host>/?watch=<gameId>` — no sign-in needed. Renders the same grid in read-only mode.

Two realtime channels keep the spectator in sync:
- `ctb_game_<gameId>` (postgres_changes on `ctb_game_events`) — picks up plays and subs
- `ctb_queue_<gameId>` (broadcast) — picks up the live rotation queue while it's being assembled

The head coach broadcasts the queue on every queue change; a late-joining spectator will see an empty queue until the next change.

The live game header has a **SHARE** button that uses Web Share API (falls back to clipboard).

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
- **Supabase config**: globals injected by `scripts/inject-config.js` at build time
- **Sport branching**: in `game.js`, `_isFootball()` checks `_gs.team?.sport === 'football'`. Football has its own `_renderFootballGameScreen` and helpers; soccer's `_renderGameScreen` is unchanged
- **Watch mode**: `_gs.watchMode = true` disables click bindings in the football grid renderers

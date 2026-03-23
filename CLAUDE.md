# ClearTheBench — Agent Context

> **This file is the authoritative project reference for AI agents.**
> Read it fully before touching any code. All conventions here are enforced.

---

## What this project is

ClearTheBench is a vanilla JS youth sports coaching sideline tool. Coaches use it on their phones during games to track player rotations and playing time. It is a **static site** deployed on Vercel from the `erdabo-labs/clearthebench` GitHub repo, auto-deployed on push to `main`.

---

## Stack — strictly enforced, no exceptions

| Constraint | Rule |
|---|---|
| Framework | **None.** Vanilla JS only. |
| Bundler | **None.** Files served as-is. |
| CSS | All styles in `css/styles.css`. No `<style>` tags in JS. No inline style blocks. |
| JS modules | Multiple static files, each with a clear domain. **Never consolidate files.** |
| Script loading | At bottom of `<body>`, **no `defer`**, order matters. |
| Supabase client | CDN (`@supabase/supabase-js@2`). Client instance is `const _db = window.supabase.createClient(…)` declared in `db.js`. |
| DB access | **All Supabase calls live in `db.js`.** Never call `_db` directly from other files. |
| New dependencies | Ask before adding anything. |

---

## File structure

```
index.html              ← app shell, single <div id="screen-container">
css/styles.css          ← all styles
js/
  db.js                 ← ALL Supabase calls; db_* function namespace
  auth.js               ← magic link auth, coach/editor sessions
  router.js             ← router_register() + router_navigate()
  teams.js              ← home, signin, create-team, team detail
  game.js               ← create-game, live game, game-summary, spectator (watch)
  stats.js              ← season stats, game-history
  strategy.js           ← sub strategy config screen
scripts/
  inject-config.js      ← build script that injects Supabase credentials
supabase-config.js      ← gitignored; injected at build time
vercel.json             ← Vercel deployment config
```

### Script load order in `index.html`

```html
<script src="/js/db.js"></script>
<script src="/js/auth.js"></script>
<script src="/js/router.js"></script>
<script src="/js/teams.js"></script>
<script src="/js/game.js"></script>
<script src="/js/stats.js"></script>
<script src="/js/strategy.js"></script>
```

---

## Router

`router.js` is a minimal custom router. No history API, no URLs — purely in-memory screen swaps.

```js
router_register('screen-name', async (container, params) => { … });
router_navigate('screen-name', { …params });
```

All screens render into `#screen-container`. Navigation is always explicit — there are no back-button hooks or browser history entries.

### Registered screens

| Screen | File | Purpose |
|---|---|---|
| `home` | teams.js | Coach home (signed-in or signed-out) |
| `signin` | teams.js | Magic link + editor code login |
| `create-team` | teams.js | New team form |
| `team` | teams.js | Team detail: roster, seasons, game controls |
| `create-game` | game.js | Pre-game setup: opponent, field size, attendance |
| `game` | game.js | Live game: field/bench zones, timer, subs |
| `game-summary` | game.js | Post-game playing time results |
| `watch` | game.js | Spectator view (read-only, real-time) |
| `stats` | stats.js | Season statistics per player |
| `game-history` | stats.js | List of all games in a season |
| `strategy` | strategy.js | Sub strategy config |

---

## Authentication

| Role | Mechanism | Storage key |
|---|---|---|
| Coach | Supabase magic link email | `ctb_coach` (localStorage, JSON) |
| Assistant coach | 6-char `editor_code` from team | `ctb_editor` (localStorage, JSON) |
| Spectator | Share link `/?game=GAME_ID` | None — read-only |

`auth_init()` is called once in `router_init()` at boot. It handles magic-link callback (hash fragment), existing Supabase session, and localStorage session.

Editor mode: screens receive `editorMode: true` param. Editors can see and run games but cannot modify team/season settings or delete anything.

---

## Supabase schema

```
coaches
  id            uuid  PK (mirrors auth.users.id)
  email         text
  created_at    timestamptz

teams
  id            uuid  PK
  coach_id      uuid  FK → coaches.id
  name          text
  sport         text  ('soccer' | 'football' | 'generic')
  short_code    text  UNIQUE, 3-char, alphanumeric (share links)
  editor_code   text  UNIQUE, 6-char, alphanumeric (assistant coach login)
  created_at    timestamptz

seasons
  id            uuid  PK
  team_id       uuid  FK → teams.id
  name          text
  active        boolean
  created_at    timestamptz

players
  id            uuid  PK
  team_id       uuid  FK → teams.id
  name          text
  jersey_number text  (nullable)
  active        boolean  default true
  tags          jsonb    (nullable, reserved for future use)
  created_at    timestamptz

team_strategy
  id            uuid  PK
  team_id       uuid  FK → teams.id  UNIQUE
  mode          text  ('strict_queue' | 'timer_swap' | 'pair_group' | 'manual_nudge')
  config        jsonb
  updated_at    timestamptz
  created_at    timestamptz

games
  id            uuid  PK
  season_id     uuid  FK → seasons.id
  opponent      text  (nullable)
  date          timestamptz
  mode          text  ('soccer' | 'football' | 'generic')
  field_size    int
  strategy_snapshot  jsonb  (copy of team_strategy.config at game creation)
  created_at    timestamptz

game_roster
  id            uuid  PK
  game_id       uuid  FK → games.id
  player_id     uuid  FK → players.id

game_events
  id            uuid  PK
  game_id       uuid  FK → games.id
  player_id     uuid  FK → players.id  NULLABLE
  event_type    text  (see below)
  timestamp     int   (seconds elapsed for soccer; series num for football)
  series_num    int   (nullable)
  meta          jsonb (nullable)
  created_at    timestamptz

position_log
  id            uuid  PK
  game_id       uuid  FK → games.id
  player_id     uuid  FK → players.id
  position      text
  minutes       int
  created_at    timestamptz
```

### `game_events` is source of truth

All playing time is derived from event pairs. `player_id` is nullable — game-level events have no associated player.

| event_type | player_id | meaning |
|---|---|---|
| `sub_on` | required | player entered field |
| `sub_off` | required | player left field |
| `game_start` | null | timer started |
| `game_pause` | null | timer paused |
| `game_end` | null | game finalized |
| `series_advance` | null | football series incremented |

**A game is "active" (not yet complete) if it has events but no `game_end` event.** `db_getActiveGame()` implements this check.

---

## DB function inventory (`js/db.js`)

```js
// Coaches
db_getOrCreateCoach(email)

// Teams
db_getTeams(coachId)
db_createTeam({ coachId, name, sport })
db_getTeamByEditorCode(code)
db_deleteTeam(teamId)              // cascades seasons→games→events/roster/position_log→players→strategy

// Seasons
db_createSeason(teamId, name)
db_getActiveSeason(teamId)
db_updateSeason(seasonId, updates)
db_setSeasonInactive(seasonId)
db_getSeasons(teamId)

// Players
db_getPlayers(teamId)              // active only
db_createPlayer({ teamId, name, jerseyNumber })
db_updatePlayer(playerId, updates)
db_deactivatePlayer(playerId)      // sets active=false, not a hard delete

// Strategy
db_getStrategy(teamId)
db_upsertStrategy(teamId, mode, config)

// Games
db_createGame({ seasonId, opponent, mode, fieldSize, strategySnapshot, playerIds })
db_getGame(gameId)                 // includes nested season→team
db_getRecentGames(seasonId, limit=3)
db_getActiveGame(seasonId)         // game with events but no game_end
db_getGameSummary(gameId)          // computes per-player field time from events
db_getSeasonGames(seasonId)
db_getSeasonGamesWithStatus(seasonId)  // adds status: 'active'|'final'|'setup'
db_getSeasonGamesAll(seasonId)
db_deleteGame(gameId)              // cascades events/position_log/roster

// Game events
db_insertEvent({ gameId, playerId, eventType, timestamp, seriesNum, meta })
db_getGameEvents(gameId)

// Position log
db_upsertPositionLog({ gameId, playerId, position, minutes })
db_getPositionLog(gameId)

// Realtime
db_subscribeToGame(gameId, onEvent)   // postgres_changes on game_events
db_unsubscribe(channel)
```

---

## Live game state (`js/game.js`)

The live game screen uses a module-level `_gs` object (no framework state):

```js
_gs = {
  game, players,           // game record + per-player state map keyed by player_id
  timerSeconds,            // elapsed seconds (soccer)
  timerRunning,            // bool
  timerInterval,           // setInterval handle
  seriesNum,               // football series counter
  nudgeAlertedSet,         // Set of player IDs already nudged this series
  goalieLockedId,          // player_id if goalie lock is active
}
```

Per-player state in `_gs.players[id]`:
```js
{ onField, fieldEnteredAt, currentStint, totalOnTime, benchSince, totalBenchTime }
```

---

## Design system

Dark field-green aesthetic. Mobile-first (coaches use phones on sidelines).

### CSS variables
```css
--field      /* dark background */
--grass      /* slightly lighter */
--card       /* card background */
--card2      /* alternate card */
--border     /* border color */
--lime       /* primary accent / CTA */
--lime-dim   /* muted lime */
--orange     /* warning */
--red        /* error / danger */
--blue       /* info */
--yellow     /* alert */
--white      /* primary text */
--muted      /* secondary text */
```

### Fonts
- `Bebas Neue` — headings, labels
- `DM Sans` — body text, buttons
- `JetBrains Mono` — stats, codes, timers

### UI patterns
- `.btn-primary` — main CTA (lime background)
- `.btn-ghost` — secondary action
- `.team-card` — list row card
- `.section-title` — section header
- `.divider` — horizontal rule
- `.input-field` — text inputs
- `.app-header` — top bar with logo + back arrow (`←`)

---

## Language rules — enforced in all UI copy

- Never use **"fair"** or **"fairness"**
- Never imply the app makes decisions — it **tracks and shows**
- The app has no opinion. The coach has the opinion.
- Examples: "Playing time" not "Fair time". "Shows who's been out longest" not "Decides who should sub in".

---

## Key patterns and conventions

- **HTML escaping**: use `_esc(str)` (defined in teams.js) for all user data in template literals
- **Error handling**: all `db_*` functions log errors via `console.error('db_funcName', error)` and return `null` or `[]` on failure
- **No frameworks**: no React, Vue, Svelte, Alpine, etc. — ever
- **No bundler output**: edit source files directly; Vercel serves them as-is
- **DB calls are always `async/await`**: never `.then()` chains in call sites
- **One active game per season**: enforced by `db_getActiveGame()` returning the first unfinished game
- **Soft delete for players**: `db_deactivatePlayer()` sets `active=false`; hard deletes are only for games and teams
- **Supabase config**: `SUPABASE_URL` and `SUPABASE_ANON_KEY` are globals injected by `scripts/inject-config.js` at build time from environment variables; `supabase-config.js` is gitignored

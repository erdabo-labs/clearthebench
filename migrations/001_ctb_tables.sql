-- =============================================================
-- CTB Tables Migration — ClearTheBench consolidated into settlingup Supabase project
-- All tables prefixed with ctb_
-- =============================================================

-- ── ctb_coaches ───────────────────────────────────────────────
-- Mirrors auth.users.id — no gen_random_uuid() default on PK
CREATE TABLE IF NOT EXISTS ctb_coaches (
  id            UUID        PRIMARY KEY,
  email         TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── ctb_teams ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctb_teams (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      UUID        NOT NULL REFERENCES ctb_coaches(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  sport         TEXT        NOT NULL,
  short_code    TEXT        NOT NULL UNIQUE,
  editor_code   TEXT        NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── ctb_seasons ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctb_seasons (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID        NOT NULL REFERENCES ctb_teams(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── ctb_players ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctb_players (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID        NOT NULL REFERENCES ctb_teams(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  jersey_number TEXT,
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  tags          JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── ctb_team_strategy ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctb_team_strategy (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID        NOT NULL UNIQUE REFERENCES ctb_teams(id) ON DELETE CASCADE,
  mode          TEXT        NOT NULL,
  config        JSONB       NOT NULL,
  updated_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── ctb_games ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctb_games (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id           UUID        NOT NULL REFERENCES ctb_seasons(id) ON DELETE CASCADE,
  opponent            TEXT,
  date                TIMESTAMPTZ DEFAULT NOW(),
  mode                TEXT        NOT NULL,
  field_size          INTEGER     NOT NULL,
  strategy_snapshot   JSONB,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── ctb_game_roster ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctb_game_roster (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       UUID        NOT NULL REFERENCES ctb_games(id) ON DELETE CASCADE,
  player_id     UUID        NOT NULL REFERENCES ctb_players(id) ON DELETE CASCADE
);

-- ── ctb_game_events ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctb_game_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       UUID        NOT NULL REFERENCES ctb_games(id) ON DELETE CASCADE,
  player_id     UUID        REFERENCES ctb_players(id) ON DELETE SET NULL,
  event_type    TEXT        NOT NULL,
  timestamp     INTEGER,
  series_num    INTEGER,
  meta          JSONB       DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── ctb_position_log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ctb_position_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       UUID        NOT NULL REFERENCES ctb_games(id) ON DELETE CASCADE,
  player_id     UUID        NOT NULL REFERENCES ctb_players(id) ON DELETE CASCADE,
  position      TEXT        NOT NULL,
  minutes       INTEGER     NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- Row Level Security
-- =============================================================

ALTER TABLE ctb_coaches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctb_teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctb_seasons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctb_players       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctb_team_strategy ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctb_games         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctb_game_roster   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctb_game_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ctb_position_log  ENABLE ROW LEVEL SECURITY;

-- Permissive policies — app-level auth handles access control
-- Allow all for authenticated users
CREATE POLICY "ctb_coaches_auth_all"       ON ctb_coaches       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ctb_teams_auth_all"         ON ctb_teams         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ctb_seasons_auth_all"       ON ctb_seasons       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ctb_players_auth_all"       ON ctb_players       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ctb_team_strategy_auth_all" ON ctb_team_strategy FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ctb_games_auth_all"         ON ctb_games         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ctb_game_roster_auth_all"   ON ctb_game_roster   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ctb_game_events_auth_all"   ON ctb_game_events   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ctb_position_log_auth_all"  ON ctb_position_log  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anon read/write — needed for editor mode (localStorage sessions, not Supabase auth)
-- and spectator (watch) mode
CREATE POLICY "ctb_coaches_anon_all"       ON ctb_coaches       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "ctb_teams_anon_all"         ON ctb_teams         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "ctb_seasons_anon_all"       ON ctb_seasons       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "ctb_players_anon_all"       ON ctb_players       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "ctb_team_strategy_anon_all" ON ctb_team_strategy FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "ctb_games_anon_all"         ON ctb_games         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "ctb_game_roster_anon_all"   ON ctb_game_roster   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "ctb_game_events_anon_all"   ON ctb_game_events   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "ctb_position_log_anon_all"  ON ctb_position_log  FOR ALL TO anon USING (true) WITH CHECK (true);

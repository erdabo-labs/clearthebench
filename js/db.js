// =============================================================
// db.js — all Supabase calls centralized
// =============================================================

// The Supabase CDN exposes a global called `supabase` — we name
// our client instance `_db` to avoid redeclaration conflicts.
const _db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── COACHES ──────────────────────────────────────────────────

async function db_getOrCreateCoach(email) {
  const { data: { user } } = await _db.auth.getUser();
  if (!user) return null;

  const { data, error } = await _db
    .from('coaches')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) { console.error('db_getOrCreateCoach', error); return null; }

  if (data) return data;

  // First sign-in — insert coach record
  const { data: created, error: insertErr } = await _db
    .from('coaches')
    .insert({ id: user.id, email: user.email })
    .select()
    .single();

  if (insertErr) { console.error('db_getOrCreateCoach insert', insertErr); return null; }
  return created;
}

// ── TEAMS ─────────────────────────────────────────────────────

async function db_getTeams(coachId) {
  const { data, error } = await _db
    .from('teams')
    .select('*, seasons(id, name, active)')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false });

  if (error) { console.error('db_getTeams', error); return []; }
  return data;
}

async function db_createTeam({ coachId, name, sport }) {
  const shortCode  = _generateCode(3).toUpperCase();
  const editorCode = _generateCode(6).toUpperCase();

  const { data, error } = await _db
    .from('teams')
    .insert({ coach_id: coachId, name, sport, short_code: shortCode, editor_code: editorCode })
    .select()
    .single();

  if (error) { console.error('db_createTeam', error); return null; }

  // Auto-create a default season
  await db_createSeason(data.id, 'Season 1');

  return data;
}

async function db_getTeamByEditorCode(code) {
  const { data, error } = await _db
    .from('teams')
    .select('*')
    .eq('editor_code', code.toUpperCase())
    .maybeSingle();

  if (error) { console.error('db_getTeamByEditorCode', error); return null; }
  return data;
}

// ── SEASONS ───────────────────────────────────────────────────

async function db_createSeason(teamId, name) {
  const { data, error } = await _db
    .from('seasons')
    .insert({ team_id: teamId, name, active: true })
    .select()
    .single();

  if (error) { console.error('db_createSeason', error); return null; }
  return data;
}

async function db_getActiveSeason(teamId) {
  const { data, error } = await _db
    .from('seasons')
    .select('*')
    .eq('team_id', teamId)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) { console.error('db_getActiveSeason', error); return null; }
  return data;
}

// ── PLAYERS ───────────────────────────────────────────────────

async function db_getPlayers(teamId) {
  const { data, error } = await _db
    .from('players')
    .select('*')
    .eq('team_id', teamId)
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) { console.error('db_getPlayers', error); return []; }
  return data;
}

async function db_createPlayer({ teamId, name, jerseyNumber }) {
  const { data, error } = await _db
    .from('players')
    .insert({ team_id: teamId, name, jersey_number: jerseyNumber || null })
    .select()
    .single();

  if (error) { console.error('db_createPlayer', error); return null; }
  return data;
}

async function db_updatePlayer(playerId, updates) {
  const { data, error } = await _db
    .from('players')
    .update(updates)
    .eq('id', playerId)
    .select()
    .single();

  if (error) { console.error('db_updatePlayer', error); return null; }
  return data;
}

async function db_deactivatePlayer(playerId) {
  return db_updatePlayer(playerId, { active: false });
}

// ── TEAM STRATEGY ─────────────────────────────────────────────

async function db_getStrategy(teamId) {
  const { data, error } = await _db
    .from('team_strategy')
    .select('*')
    .eq('team_id', teamId)
    .maybeSingle();

  if (error) { console.error('db_getStrategy', error); return null; }
  return data;
}

async function db_upsertStrategy(teamId, mode, config) {
  const { data: existing } = await _db
    .from('team_strategy')
    .select('id')
    .eq('team_id', teamId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await _db
      .from('team_strategy')
      .update({ mode, config, updated_at: new Date().toISOString() })
      .eq('team_id', teamId)
      .select()
      .single();
    if (error) { console.error('db_upsertStrategy update', error); return null; }
    return data;
  }

  const { data, error } = await _db
    .from('team_strategy')
    .insert({ team_id: teamId, mode, config })
    .select()
    .single();
  if (error) { console.error('db_upsertStrategy insert', error); return null; }
  return data;
}

// ── GAMES ─────────────────────────────────────────────────────

async function db_createGame({ seasonId, opponent, mode, fieldSize, strategySnapshot, playerIds }) {
  const { data: game, error } = await _db
    .from('games')
    .insert({
      season_id: seasonId,
      opponent: opponent || null,
      mode,
      field_size: fieldSize,
      strategy_snapshot: strategySnapshot,
    })
    .select()
    .single();

  if (error) { console.error('db_createGame', error); return null; }

  // Insert game roster
  if (playerIds && playerIds.length) {
    const rows = playerIds.map(pid => ({ game_id: game.id, player_id: pid }));
    const { error: rosterErr } = await _db.from('game_roster').insert(rows);
    if (rosterErr) console.error('db_createGame roster', rosterErr);
  }

  return game;
}

async function db_getGame(gameId) {
  const { data, error } = await _db
    .from('games')
    .select('*, seasons(id, name, team_id, teams(id, name, short_code, sport, coach_id))')
    .eq('id', gameId)
    .single();

  if (error) { console.error('db_getGame', error); return null; }
  return data;
}

async function db_getRecentGames(seasonId, limit = 3) {
  const { data, error } = await _db
    .from('games')
    .select('*')
    .eq('season_id', seasonId)
    .order('date', { ascending: false })
    .limit(limit);

  if (error) { console.error('db_getRecentGames', error); return []; }
  return data;
}

async function db_getGameRoster(gameId) {
  const { data, error } = await _db
    .from('game_roster')
    .select('*, players(*)')
    .eq('game_id', gameId);

  if (error) { console.error('db_getGameRoster', error); return []; }
  return data.map(r => r.players);
}

// ── GAME EVENTS ───────────────────────────────────────────────

async function db_insertEvent({ gameId, playerId, eventType, timestamp, seriesNum, meta }) {
  const row = {
    game_id: gameId,
    event_type: eventType,
    timestamp,
    series_num: seriesNum || null,
    meta: meta || {},
  };
  if (playerId != null) row.player_id = playerId;

  const { data, error } = await _db
    .from('game_events')
    .insert(row)
    .select()
    .single();

  if (error) { console.error('db_insertEvent', error); return null; }
  return data;
}

async function db_getGameEvents(gameId) {
  const { data, error } = await _db
    .from('game_events')
    .select('*')
    .eq('game_id', gameId)
    .order('timestamp', { ascending: true });

  if (error) { console.error('db_getGameEvents', error); return []; }
  return data;
}

// ── POSITION LOG ──────────────────────────────────────────────

async function db_upsertPositionLog({ gameId, playerId, position, minutes }) {
  const { data: existing } = await _db
    .from('position_log')
    .select('id')
    .eq('game_id', gameId)
    .eq('player_id', playerId)
    .eq('position', position)
    .maybeSingle();

  if (existing) {
    const { error } = await _db
      .from('position_log')
      .update({ minutes })
      .eq('id', existing.id);
    if (error) console.error('db_upsertPositionLog update', error);
    return;
  }

  const { error } = await _db
    .from('position_log')
    .insert({ game_id: gameId, player_id: playerId, position, minutes });
  if (error) console.error('db_upsertPositionLog insert', error);
}

async function db_getPositionLog(gameId) {
  const { data, error } = await _db
    .from('position_log')
    .select('*')
    .eq('game_id', gameId);

  if (error) { console.error('db_getPositionLog', error); return []; }
  return data;
}

// ── SEASON STATS ──────────────────────────────────────────────

async function db_getSeasonGames(seasonId) {
  const { data, error } = await _db
    .from('games')
    .select(`
      id, date, opponent, mode,
      game_roster(player_id),
      game_events(player_id, event_type, timestamp)
    `)
    .eq('season_id', seasonId)
    .order('date', { ascending: true });

  if (error) { console.error('db_getSeasonGames', error); return []; }
  return data;
}

// ── REALTIME ──────────────────────────────────────────────────

function db_subscribeToGame(gameId, onEvent) {
  return _db
    .channel(`game:${gameId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'game_events',
      filter: `game_id=eq.${gameId}`,
    }, onEvent)
    .subscribe();
}

function db_unsubscribe(channel) {
  _db.removeChannel(channel);
}

// ── ACTIVE GAME ───────────────────────────────────────────────

async function db_getActiveGame(seasonId) {
  // Returns the most-recent game in the season that has events but no game_end event.
  const { data, error } = await _db
    .from('games')
    .select('id, opponent, date, field_size, mode, strategy_snapshot, season_id, game_events(event_type)')
    .eq('season_id', seasonId)
    .order('date', { ascending: false });

  if (error) { console.error('db_getActiveGame', error); return null; }

  for (const game of (data || [])) {
    const evts = game.game_events || [];
    if (evts.length > 0 && !evts.some(e => e.event_type === 'game_end')) {
      const { game_events, ...gameRow } = game;
      return gameRow;
    }
  }
  return null;
}

async function db_getGameSummary(gameId) {
  const [roster, events] = await Promise.all([
    db_getGameRoster(gameId),
    db_getGameEvents(gameId),
  ]);

  const playerMap = {};
  for (const player of roster) {
    playerMap[player.id] = { player, fieldEnteredAt: null, totalOnTime: 0 };
  }

  let gameStartTs = null;
  let gameEndTs = null;

  for (const evt of events) {
    const ts = evt.timestamp || 0;
    if (evt.event_type === 'game_start' && gameStartTs === null) gameStartTs = ts;
    if (evt.event_type === 'game_end') gameEndTs = ts;
    const pm = evt.player_id ? playerMap[evt.player_id] : null;
    if (!pm) continue;
    if (evt.event_type === 'sub_on') {
      pm.fieldEnteredAt = ts;
    } else if (evt.event_type === 'sub_off' && pm.fieldEnteredAt !== null) {
      pm.totalOnTime += Math.max(0, ts - pm.fieldEnteredAt);
      pm.fieldEnteredAt = null;
    }
  }

  const closeTs = gameEndTs != null ? gameEndTs
    : (events.length ? (events[events.length - 1].timestamp || 0) : 0);

  for (const pm of Object.values(playerMap)) {
    if (pm.fieldEnteredAt !== null) {
      pm.totalOnTime += Math.max(0, closeTs - pm.fieldEnteredAt);
      pm.fieldEnteredAt = null;
    }
  }

  const players = Object.values(playerMap)
    .map(pm => ({ player: pm.player, totalOnTime: pm.totalOnTime }))
    .sort((a, b) => b.totalOnTime - a.totalOnTime);

  const gameDuration = gameEndTs != null && gameStartTs != null
    ? Math.max(0, gameEndTs - gameStartTs)
    : Math.max(0, closeTs - (gameStartTs || 0));

  return { players, gameDuration };
}

// ── SEASON MANAGEMENT ─────────────────────────────────────────

async function db_updateSeason(seasonId, updates) {
  const { data, error } = await _db
    .from('seasons')
    .update(updates)
    .eq('id', seasonId)
    .select()
    .single();
  if (error) { console.error('db_updateSeason', error); return null; }
  return data;
}

async function db_setSeasonInactive(seasonId) {
  return db_updateSeason(seasonId, { active: false });
}

async function db_deleteSeason(seasonId) {
  const { data: games } = await _db.from('games').select('id').eq('season_id', seasonId);
  const gameIds = (games || []).map(g => g.id);

  if (gameIds.length > 0) {
    await _db.from('game_events').delete().in('game_id', gameIds);
    await _db.from('position_log').delete().in('game_id', gameIds);
    await _db.from('game_roster').delete().in('game_id', gameIds);
    await _db.from('games').delete().in('id', gameIds);
  }

  const { error } = await _db.from('seasons').delete().eq('id', seasonId);
  if (error) { console.error('db_deleteSeason', error); return false; }
  return true;
}

async function db_getSeasons(teamId) {
  const { data, error } = await _db
    .from('seasons')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });
  if (error) { console.error('db_getSeasons', error); return []; }
  return data;
}

// ── ALL SEASON GAMES (for history) ────────────────────────────

async function db_getSeasonGamesWithStatus(seasonId) {
  const { data, error } = await _db
    .from('games')
    .select(`
      id, date, opponent, mode, created_at,
      game_events(event_type, timestamp)
    `)
    .eq('season_id', seasonId)
    .order('created_at', { ascending: false });

  if (error) { console.error('db_getSeasonGamesWithStatus', error); return []; }

  return (data || []).map(game => {
    const events  = game.game_events || [];
    const hasStart = events.some(e => e.event_type === 'game_start');
    const hasEnd   = events.some(e => e.event_type === 'game_end');
    const startEvt = events.find(e => e.event_type === 'game_start');
    const endEvt   = events.find(e => e.event_type === 'game_end');

    let durationMins = null;
    if (startEvt && endEvt) {
      durationMins = Math.floor(((endEvt.timestamp || 0) - (startEvt.timestamp || 0)) / 60);
    }

    const subCount = events.filter(e => e.event_type === 'sub_on').length;
    const status   = !hasStart ? 'not_started' : !hasEnd ? 'active' : 'final';

    return { ...game, status, durationMins, subCount };
  });
}

async function db_getSeasonGamesAll(seasonId) {
  const { data, error } = await _db
    .from('games')
    .select('id, date, opponent, mode, game_events(event_type, timestamp)')
    .eq('season_id', seasonId)
    .order('date', { ascending: false });
  if (error) { console.error('db_getSeasonGamesAll', error); return []; }
  return data;
}

async function db_deleteGame(gameId) {
  await _db.from('game_events').delete().eq('game_id', gameId);
  await _db.from('position_log').delete().eq('game_id', gameId);
  await _db.from('game_roster').delete().eq('game_id', gameId);
  const { error } = await _db.from('games').delete().eq('id', gameId);
  if (error) { console.error('db_deleteGame', error); return false; }
  return true;
}

async function db_deleteTeam(teamId) {
  const { data: seasons } = await _db.from('seasons').select('id').eq('team_id', teamId);
  const seasonIds = (seasons || []).map(s => s.id);

  if (seasonIds.length > 0) {
    const { data: games } = await _db.from('games').select('id').in('season_id', seasonIds);
    const gameIds = (games || []).map(g => g.id);

    if (gameIds.length > 0) {
      await _db.from('game_events').delete().in('game_id', gameIds);
      await _db.from('position_log').delete().in('game_id', gameIds);
      await _db.from('game_roster').delete().in('game_id', gameIds);
      await _db.from('games').delete().in('id', gameIds);
    }
    await _db.from('seasons').delete().in('id', seasonIds);
  }

  await _db.from('players').delete().eq('team_id', teamId);
  await _db.from('team_strategy').delete().eq('team_id', teamId);

  const { error } = await _db.from('teams').delete().eq('id', teamId);
  if (error) { console.error('db_deleteTeam', error); return false; }
  return true;
}

// ── HELPERS ───────────────────────────────────────────────────

function _generateCode(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable chars
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

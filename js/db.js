// =============================================================
// db.js — all Supabase calls centralized
// =============================================================

const _db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── COACHES ────────────────────────────────────────────

async function db_getOrCreateCoach(email) {
  const { data: { user } } = await _db.auth.getUser();
  if (!user) return null;

  const { data, error } = await _db
    .from('ctb_coaches')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) { console.error('db_getOrCreateCoach', error); return null; }

  if (data) return data;

  const { data: created, error: insertErr } = await _db
    .from('ctb_coaches')
    .insert({ id: user.id, email: user.email })
    .select()
    .single();

  if (insertErr) { console.error('db_getOrCreateCoach insert', insertErr); return null; }
  return created;
}

// ── TEAMS ───────────────────────────────────────────────────

async function db_getTeams(coachId) {
  const { data, error } = await _db
    .from('ctb_teams')
    .select('*, ctb_seasons(id, name, active)')
    .eq('coach_id', coachId)
    .order('created_at', { ascending: false });

  if (error) { console.error('db_getTeams', error); return []; }
  return data;
}

async function db_createTeam({ coachId, name, sport }) {
  const shortCode  = _generateCode(3).toUpperCase();
  const editorCode = _generateCode(6).toUpperCase();

  const { data, error } = await _db
    .from('ctb_teams')
    .insert({ coach_id: coachId, name, sport, short_code: shortCode, editor_code: editorCode })
    .select()
    .single();

  if (error) { console.error('db_createTeam', error); return null; }

  await db_createSeason(data.id, 'Season 1');
  return data;
}

// ── SEASONS ───────────────────────────────────────────────────

async function db_createSeason(teamId, name) {
  const { data, error } = await _db
    .from('ctb_seasons')
    .insert({ team_id: teamId, name, active: true })
    .select()
    .single();

  if (error) { console.error('db_createSeason', error); return null; }
  return data;
}

async function db_getActiveSeason(teamId) {
  const { data, error } = await _db
    .from('ctb_seasons')
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
    .from('ctb_players')
    .select('*')
    .eq('team_id', teamId)
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) { console.error('db_getPlayers', error); return []; }
  return data;
}

async function db_createPlayer({ teamId, name, jerseyNumber }) {
  const { data, error } = await _db
    .from('ctb_players')
    .insert({ team_id: teamId, name, jersey_number: jerseyNumber || null })
    .select()
    .single();

  if (error) { console.error('db_createPlayer', error); return null; }
  return data;
}

async function db_updatePlayer(playerId, updates) {
  const { data, error } = await _db
    .from('ctb_players')
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

// ── GAMES ───────────────────────────────────────────────────

async function db_createGame({ seasonId, opponent, mode, fieldSize, strategySnapshot, playerIds }) {
  const { data: game, error } = await _db
    .from('ctb_games')
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

  if (playerIds && playerIds.length) {
    const rows = playerIds.map(pid => ({ game_id: game.id, player_id: pid }));
    const { error: rosterErr } = await _db.from('ctb_game_roster').insert(rows);
    if (rosterErr) console.error('db_createGame roster', rosterErr);
  }

  return game;
}

async function db_getGame(gameId) {
  const { data, error } = await _db
    .from('ctb_games')
    .select('*, ctb_seasons(id, name, team_id, ctb_teams(id, name, short_code, sport, coach_id))')
    .eq('id', gameId)
    .single();

  if (error) { console.error('db_getGame', error); return null; }
  return data;
}

async function db_getGameRoster(gameId) {
  const { data, error } = await _db
    .from('ctb_game_roster')
    .select('*, ctb_players(*)')
    .eq('game_id', gameId);

  if (error) { console.error('db_getGameRoster', error); return []; }
  return data.map(r => r.ctb_players);
}

async function db_addPlayerToGameRoster(gameId, playerId) {
  const { data, error } = await _db
    .from('ctb_game_roster')
    .insert({ game_id: gameId, player_id: playerId })
    .select()
    .single();

  if (error) { console.error('db_addPlayerToGameRoster', error); return null; }
  return data;
}

// ── GAME EVENTS ───────────────────────────────────────────────────

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
    .from('ctb_game_events')
    .insert(row)
    .select()
    .single();

  if (error) { console.error('db_insertEvent', error); return null; }
  return data;
}

async function db_getGameEvents(gameId) {
  const { data, error } = await _db
    .from('ctb_game_events')
    .select('*')
    .eq('game_id', gameId)
    .order('timestamp', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) { console.error('db_getGameEvents', error); return []; }
  return data;
}

async function db_deleteRecentEvents(gameId, count) {
  const { data, error } = await _db
    .from('ctb_game_events')
    .select('id')
    .eq('game_id', gameId)
    .order('created_at', { ascending: false })
    .limit(count);

  if (error) { console.error('db_deleteRecentEvents', error); return false; }
  if (!data || data.length === 0) return true;

  const ids = data.map(e => e.id);
  const { error: delErr } = await _db
    .from('ctb_game_events')
    .delete()
    .in('id', ids);

  if (delErr) { console.error('db_deleteRecentEvents delete', delErr); return false; }
  return true;
}

// ── REALTIME (spectator) ──────────────────────────────────────────────────

function db_subscribeToGame(gameId, onEvent) {
  return _db
    .channel('ctb_game_' + gameId)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'ctb_game_events',
      filter: 'game_id=eq.' + gameId,
    }, (payload) => onEvent(payload.new))
    .subscribe();
}

function db_unsubscribe(channel) {
  if (channel) _db.removeChannel(channel);
}

// ── ACTIVE GAME ─────────────────────────────────────────────────────────

async function db_getActiveGame(seasonId) {
  const { data, error } = await _db
    .from('ctb_games')
    .select('id, opponent, date, field_size, mode, strategy_snapshot, season_id, ctb_game_events(event_type)')
    .eq('season_id', seasonId)
    .order('date', { ascending: false });

  if (error) { console.error('db_getActiveGame', error); return null; }

  for (const game of (data || [])) {
    const evts = game.ctb_game_events || [];
    if (evts.length > 0 && !evts.some(e => e.event_type === 'game_end')) {
      const { ctb_game_events, ...gameRow } = game;
      return gameRow;
    }
  }
  return null;
}

// ── GAME SUMMARY ────────────────────────────────────────────────────────

async function db_getGameSummary(gameId) {
  const [roster, events] = await Promise.all([
    db_getGameRoster(gameId),
    db_getGameEvents(gameId),
  ]);

  const playerMap = {};
  for (const player of roster) {
    playerMap[player.id] = { player, fieldEnteredAt: null, totalOnTime: 0, carries: 0, pulls: 0, tds: 0, offPlays: 0, defPlays: 0 };
  }

  // Track field state for crediting plays to on-field players
  const fieldOnField = {};
  for (const player of roster) fieldOnField[player.id] = false;

  let gameStartTs = null;
  let gameEndTs = null;
  let offPlays = 0;
  let defPlays = 0;
  const score = { us: 0, opp: 0 };

  for (const evt of events) {
    const ts = evt.timestamp || 0;
    if (evt.event_type === 'game_start' && gameStartTs === null) gameStartTs = ts;
    if (evt.event_type === 'game_end') gameEndTs = ts;
    if (evt.event_type === 'score') {
      const team = evt.meta?.team;
      const d = evt.meta?.delta ?? 1;
      if (team === 'us') score.us = Math.max(0, score.us + d);
      else if (team === 'opp') score.opp = Math.max(0, score.opp + d);
    }
    // play_logged has no player_id — credit all currently on-field players
    if (evt.event_type === 'play_logged') {
      const side = evt.meta?.side;
      if (side === 'offense') offPlays++;
      else if (side === 'defense') defPlays++;
      for (const [pid, isOn] of Object.entries(fieldOnField)) {
        if (isOn && playerMap[pid]) {
          playerMap[pid].totalOnTime++;
          if (side === 'offense') playerMap[pid].offPlays++;
          else if (side === 'defense') playerMap[pid].defPlays++;
        }
      }
      continue;
    }
    const pm = evt.player_id ? playerMap[evt.player_id] : null;
    if (!pm) continue;
    if (evt.event_type === 'sub_on') {
      pm.fieldEnteredAt = ts;
      fieldOnField[evt.player_id] = true;
    } else if (evt.event_type === 'sub_off' && pm.fieldEnteredAt !== null) {
      pm.totalOnTime += Math.max(0, ts - pm.fieldEnteredAt);
      pm.fieldEnteredAt = null;
      fieldOnField[evt.player_id] = false;
    } else if (evt.event_type === 'carry') {
      pm.carries = Math.max(0, pm.carries + (evt.meta?.delta ?? 1));
    } else if (evt.event_type === 'flag_pull') {
      pm.pulls = Math.max(0, pm.pulls + (evt.meta?.delta ?? 1));
    } else if (evt.event_type === 'score' && evt.meta?.team === 'us') {
      pm.tds = Math.max(0, pm.tds + (evt.meta?.delta ?? 1));
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
    .map(pm => ({ player: pm.player, totalOnTime: pm.totalOnTime, carries: pm.carries, pulls: pm.pulls, tds: pm.tds, offPlays: pm.offPlays, defPlays: pm.defPlays }))
    .sort((a, b) => b.totalOnTime - a.totalOnTime);

  const gameDuration = gameEndTs != null && gameStartTs != null
    ? Math.max(0, gameEndTs - gameStartTs)
    : Math.max(0, closeTs - (gameStartTs || 0));

  return { players, gameDuration, score, offPlays, defPlays };
}

async function db_getPastGames(seasonId) {
  const { data: games, error } = await _db
    .from('ctb_games')
    .select('*')
    .eq('season_id', seasonId)
    .order('created_at', { ascending: false });

  if (error || !games || !games.length) return [];

  const gameIds = games.map(g => g.id);
  const { data: endEvents } = await _db
    .from('ctb_game_events')
    .select('game_id, timestamp')
    .in('game_id', gameIds)
    .eq('event_type', 'game_end');

  const endMap = {};
  for (const e of (endEvents || [])) endMap[e.game_id] = e.timestamp;

  return games
    .filter(g => g.id in endMap)
    .map(g => ({ ...g, gameDuration: endMap[g.id] || 0 }));
}

// ── DELETE ─────────────────────────────────────────────────────────────

async function db_deleteGame(gameId) {
  await _db.from('ctb_game_events').delete().eq('game_id', gameId);
  await _db.from('ctb_game_roster').delete().eq('game_id', gameId);
  const { error } = await _db.from('ctb_games').delete().eq('id', gameId);
  if (error) { console.error('db_deleteGame', error); return false; }
  return true;
}

async function db_deleteTeam(teamId) {
  const { data: seasons } = await _db.from('ctb_seasons').select('id').eq('team_id', teamId);
  const seasonIds = (seasons || []).map(s => s.id);

  if (seasonIds.length > 0) {
    const { data: games } = await _db.from('ctb_games').select('id').in('season_id', seasonIds);
    const gameIds = (games || []).map(g => g.id);

    if (gameIds.length > 0) {
      await _db.from('ctb_game_events').delete().in('game_id', gameIds);
      await _db.from('ctb_position_log').delete().in('game_id', gameIds);
      await _db.from('ctb_game_roster').delete().in('game_id', gameIds);
      await _db.from('ctb_games').delete().in('id', gameIds);
    }
    await _db.from('ctb_seasons').delete().in('id', seasonIds);
  }

  await _db.from('ctb_players').delete().eq('team_id', teamId);
  await _db.from('ctb_team_strategy').delete().eq('team_id', teamId);

  const { error } = await _db.from('ctb_teams').delete().eq('id', teamId);
  if (error) { console.error('db_deleteTeam', error); return false; }
  return true;
}

// ── WATCH CODE ────────────────────────────────────────────────────────────

async function db_getGameByWatchCode(watchCode) {
  const { data, error } = await _db
    .from('ctb_games')
    .select('id')
    .eq('watch_code', watchCode.toUpperCase().trim())
    .maybeSingle();
  if (error) { console.error('db_getGameByWatchCode', error); return null; }
  return data?.id || null;
}

// ── SPECTATOR PUSH ────────────────────────────────────────────────────────────

async function db_saveSpectatorPushSub(gameId, endpoint, p256dh, auth) {
  const { error } = await _db.from('ctb_spectator_push_subscriptions')
    .upsert({ game_id: gameId, endpoint, p256dh, auth }, { onConflict: 'game_id,endpoint' });
  if (error) { console.error('db_saveSpectatorPushSub', error); return false; }
  return true;
}

async function db_deleteSpectatorPushSub(gameId, endpoint) {
  await _db.from('ctb_spectator_push_subscriptions')
    .delete().eq('game_id', gameId).eq('endpoint', endpoint);
}

async function db_notifySpectatorsExecution(gameId) {
  try {
    await fetch(SUPABASE_URL + '/functions/v1/notify-spectators', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ gameId }),
    });
  } catch (e) { console.error('db_notifySpectatorsExecution', e); }
}

// ── WEB PUSH ─────────────────────────────────────────────────────────────

async function db_savePushSubscription(coachId, endpoint, p256dh, auth) {
  const { error } = await _db.from('ctb_push_subscriptions')
    .upsert({ coach_id: coachId, endpoint, p256dh, auth }, { onConflict: 'endpoint' });
  if (error) { console.error('db_savePushSubscription', error); return false; }
  return true;
}

async function db_deletePushSubscription(coachId, endpoint) {
  await _db.from('ctb_push_subscriptions')
    .delete().eq('coach_id', coachId).eq('endpoint', endpoint);
}

async function db_upsertPendingAlert(gameId, coachId, intervalSeconds) {
  const fireAt = new Date(Date.now() + intervalSeconds * 1000).toISOString();
  const { error } = await _db.from('ctb_pending_alerts')
    .upsert({ game_id: gameId, coach_id: coachId, fire_at: fireAt,
              interval_seconds: intervalSeconds, active: true },
            { onConflict: 'game_id' });
  if (error) console.error('db_upsertPendingAlert', error);
}

async function db_clearPendingAlert(gameId) {
  await _db.from('ctb_pending_alerts')
    .update({ active: false }).eq('game_id', gameId);
}

// ── HELPERS ─────────────────────────────────────────────────────────────

function _generateCode(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// =============================================================
// game.js — create-game, live game, game-summary screens
// =============================================================

let _gs = null;

// ── HELPERS ────────────────────────────────────────────

function _fmt(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

function _fmtCardBucket(seconds) {
  const mins = Math.max(0, Math.floor(seconds / 60));
  return `${mins}m`;
}

function _showToast(message, duration = 3000) {
  const existing = document.querySelector('.ctb-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'ctb-toast show';
  toast.textContent = message;
  document.getElementById('app').appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

function _showUndoToast(message, onUndo) {
  const existing = document.querySelector('.ctb-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'ctb-toast show';
  toast.innerHTML = _esc(message) + ' <button class="toast-undo">UNDO</button>';
  document.getElementById('app').appendChild(toast);
  toast.querySelector('.toast-undo').addEventListener('click', () => {
    toast.remove();
    onUndo();
  });
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 6000);
}

// Persistent AudioContext — must be created/resumed during a user gesture (iOS requirement)
let _audioCtx = null;

function _ensureAudioContext() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // iOS suspends the context; resume it on every user gesture
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
}

function _playTone(freq, startTime, duration) {
  if (!_audioCtx) return;
  const osc = _audioCtx.createOscillator();
  const gain = _audioCtx.createGain();
  osc.connect(gain);
  gain.connect(_audioCtx.destination);
  osc.frequency.value = freq;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.4, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

function _playAlertTone() {
  _ensureAudioContext();
  if (!_audioCtx) return;
  const now = _audioCtx.currentTime;
  const beep = (freq, t) => _playTone(freq, now + t, 0.18);
  // 2 rounds of 3 ascending beeps
  beep(440, 0.00); beep(554, 0.22); beep(660, 0.44);
  beep(440, 0.80); beep(554, 1.02); beep(660, 1.24);
}

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let _wakeLock = null;
async function _requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      _wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (e) { /* ignore */ }
}

function _releaseWakeLock() {
  if (_wakeLock) { _wakeLock.release().catch(() => {}); _wakeLock = null; }
}

// ── CRASH RECOVERY ───────────────────────────────────────────

const RECOVERY_KEY = 'ctb_game_recovery';

function _saveCrashRecovery() {
  if (!_gs?.game?.id) return;
  try {
    const snap = {
      gameId: _gs.game.id,
      ts: Date.now(),
      timerSeconds: _gs.timerSeconds,
      timerRunning: _gs.timerRunning,
      players: Object.fromEntries(
        Object.entries(_gs.players).map(([id, ps]) => [id, {
          onField: ps.onField,
          fieldEnteredAt: ps.fieldEnteredAt,
          currentStint: ps.currentStint,
          totalOnTime: ps.totalOnTime,
          totalBenchTime: ps.totalBenchTime,
          benchSince: ps.benchSince,
        }])
      ),
    };
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(snap));
  } catch (e) { /* ignore */ }
}

function _clearCrashRecovery() {
  try { localStorage.removeItem(RECOVERY_KEY); } catch (e) { /* ignore */ }
}

function _loadCrashRecovery() {
  try {
    const raw = localStorage.getItem(RECOVERY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// ── CREATE GAME SCREEN ──────────────────────────────────────────

registerScreen('create-game', async (container, { teamId }) => {
  if (!teamId) { navigate('home'); return; }

  const [team, season] = await Promise.all([
    db_getTeam(teamId),
    db_getLatestSeason(teamId),
  ]);
  if (!team) { navigate('home'); return; }

  const isFootball = team.sport === 'football';

  container.innerHTML = `
    <div class="screen-header">
      <button class="btn-back" id="btn-back">‹</button>
      <h2 class="screen-title">${_esc(team.name)}</h2>
    </div>
    <div class="screen-body">
      <div class="card">
        <label class="form-label">Opponent <span class="form-hint">(optional)</span></label>
        <input type="text" id="inp-opp" class="form-input" placeholder="Team name"
               value="" autocomplete="off" spellcheck="false">
      </div>

      <div class="card">
        <label class="form-label">Field size <span class="form-hint">(players on field)</span></label>
        <div class="stepper" id="stepper-field">
          <button class="stepper-btn" id="btn-field-minus">−</button>
          <span class="stepper-val" id="val-field">7</span>
          <button class="stepper-btn" id="btn-field-plus">+</button>
        </div>
      </div>

      ${isFootball ? '' : `
      <div class="card">
        <label class="form-label">Rotation every <span class="form-hint">(minutes)</span></label>
        <div class="stepper" id="stepper-interval">
          <button class="stepper-btn" id="btn-interval-minus">−</button>
          <span class="stepper-val" id="val-interval">5</span>
          <button class="stepper-btn" id="btn-interval-plus">+</button>
        </div>
      </div>
      `}

      <button class="btn-primary" id="btn-start">START GAME</button>
    </div>
  `;

  const fieldSpan    = container.querySelector('#val-field');
  const intervalSpan = container.querySelector('#val-interval');
  let fieldSize = 7;
  let intervalMin = 5;

  container.querySelector('#btn-back')?.addEventListener('click', () => navigate('team', { teamId }));

  container.querySelector('#btn-field-minus')?.addEventListener('click', () => {
    fieldSize = Math.max(1, fieldSize - 1);
    fieldSpan.textContent = fieldSize;
  });
  container.querySelector('#btn-field-plus')?.addEventListener('click', () => {
    fieldSize = Math.min(20, fieldSize + 1);
    fieldSpan.textContent = fieldSize;
  });
  container.querySelector('#btn-interval-minus')?.addEventListener('click', () => {
    intervalMin = Math.max(1, intervalMin - 1);
    if (intervalSpan) intervalSpan.textContent = intervalMin;
  });
  container.querySelector('#btn-interval-plus')?.addEventListener('click', () => {
    intervalMin = Math.min(30, intervalMin + 1);
    if (intervalSpan) intervalSpan.textContent = intervalMin;
  });

  container.querySelector('#btn-start').addEventListener('click', async () => {
    const opp = container.querySelector('#inp-opp').value.trim();
    const btn = container.querySelector('#btn-start');
    btn.disabled = true;
    btn.textContent = 'Starting…';

    _ensureAudioContext();

    try {
      const game = await db_createGame({
        teamId,
        seasonId: season?.id ?? null,
        fieldSize,
        opponent: opp || null,
        alertInterval: isFootball ? 0 : intervalMin * 60,
      });

      const roster = await db_getRoster(teamId);

      if (roster.length === 0) {
        _showToast('Add players to your roster before starting a game.');
        btn.disabled = false;
        btn.textContent = 'START GAME';
        return;
      }

      navigate('lineup-picker', { gameId: game.id, teamId });
    } catch (e) {
      _showToast('Failed to start game. Please try again.');
      btn.disabled = false;
      btn.textContent = 'START GAME';
    }
  });
});

// ── LINEUP PICKER ────────────────────────────────────────────────

registerScreen('lineup-picker', async (container, { gameId, teamId }) => {
  if (!gameId || !teamId) { navigate('home'); return; }

  const [game, roster] = await Promise.all([
    db_getGame(gameId),
    db_getRoster(teamId),
  ]);
  if (!game || !roster.length) { navigate('home'); return; }

  const fieldSize = game.field_size;
  let onField = new Set(roster.slice(0, fieldSize).map(p => p.id));

  function render() {
    const onCount = onField.size;
    container.innerHTML = `
      <div class="screen-header">
        <button class="btn-back" id="btn-back">‹</button>
        <h2 class="screen-title">Starting Lineup</h2>
      </div>
      <div class="screen-body">
        <p class="form-hint" style="text-align:center;margin-bottom:12px">
          Tap players to toggle field / bench &nbsp;•&nbsp; ${onCount} / ${fieldSize} on field
        </p>
        <div class="lineup-grid" id="lineup-grid">
          ${roster.map(p => `
            <div class="lineup-card ${onField.has(p.id) ? 'on-field' : 'on-bench'}" data-id="${p.id}">
              ${p.jersey_number != null ? `<span class="lineup-jersey">#${_esc(String(p.jersey_number))}</span>` : ''}
              <span class="lineup-name">${_esc(p.name)}</span>
              <span class="lineup-badge">${onField.has(p.id) ? 'FIELD' : 'BENCH'}</span>
            </div>
          `).join('')}
        </div>
        <button class="btn-primary" id="btn-go" ${onCount === 0 ? 'disabled' : ''}>START →</button>
      </div>
    `;
    container.querySelector('#btn-back')?.addEventListener('click', () => navigate('home'));
    container.querySelectorAll('.lineup-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        if (onField.has(id)) {
          onField.delete(id);
        } else {
          if (onField.size >= fieldSize) {
            _showToast(`Field is full (${fieldSize} players)`);
            return;
          }
          onField.add(id);
        }
        render();
      });
    });
    container.querySelector('#btn-go')?.addEventListener('click', async () => {
      const btn = container.querySelector('#btn-go');
      btn.disabled = true;
      btn.textContent = 'Starting…';
      try {
        const ts = 0;
        // Insert sub_on events for field players
        for (const playerId of onField) {
          await db_insertEvent({ gameId, playerId, eventType: 'sub_on', timestamp: ts });
        }
        navigate('live-game', { gameId, teamId });
      } catch (e) {
        _showToast('Failed to start. Try again.');
        btn.disabled = false;
        btn.textContent = 'START →';
      }
    });
  }
  render();
});

// ── LIVE GAME SCREEN ──────────────────────────────────────────────

registerScreen('live-game', async (container, { gameId, teamId }) => {
  if (!gameId) { navigate('home'); return; }

  const [game, roster, events] = await Promise.all([
    db_getGame(gameId),
    db_getRoster(teamId),
    db_getGameEvents(gameId),
  ]);

  if (!game) { navigate('home'); return; }

  const team = await db_getTeam(game.team_id);

  _gs = {
    game,
    team,
    container,
    players: {},
    timerSeconds: 0,
    timerRunning: false,
    timerInterval: null,
    wallAnchor: null,
    timerAnchor: 0,
    alertInterval: game.alert_interval || 0,
    alertFired: false,
    lastAlertAt: 0,
    visibilityHandler: null,
    realtimeChannel: null,
    queueChannel: null,
    queueIn: [],
    queueOut: [],
    autoCount: game.field_size,
    watchMode: false,
    possession: 'offense',
    score: { us: 0, opp: 0 },
    carries: {},                  // playerId -> count
    pulls: {},                    // playerId -> count
    tds: {},                      // playerId -> count
    lastRotationIns: [],
    lastRotationOuts: [],
    lastRotationTs: 0,
    lastRotationTimer: null,
  };

  // Initialize all players as bench with zeroed stats
  for (const p of roster) {
    _gs.players[p.id] = {
      id: p.id,
      name: p.name,
      jerseyNumber: p.jersey_number,
      onField: false,
      fieldEnteredAt: null,
      currentStint: 0,
      totalOnTime: 0,
      totalBenchTime: 0,
      benchSince: 0,
    };
  }

  // Replay events to restore state
  for (const evt of events) {
    _applyEvent(evt);
  }

  // Render game screen — football uses a separate, timer-less UI
  if (_isFootball()) {
    _renderFootballGameScreen();
  } else {
    _renderSoccerGameScreen();
  }

  // Restore crash-recovery snapshot if any
  const snap = _loadCrashRecovery();
  if (snap?.gameId === gameId && snap.timerRunning) {
    // Carry forward play time accumulated while app was gone
    const elapsed = Math.floor((Date.now() - snap.ts) / 1000);
    _gs.timerSeconds = snap.timerSeconds + elapsed;
    for (const [id, s] of Object.entries(snap.players || {})) {
      const ps = _gs.players[id];
      if (!ps) continue;
      ps.totalOnTime    = s.totalOnTime;
      ps.totalBenchTime = s.totalBenchTime;
      if (ps.onField && ps.fieldEnteredAt !== null) {
        ps.currentStint = _gs.timerSeconds - ps.fieldEnteredAt;
      }
    }
  }
  _clearCrashRecovery();

  // Subscribe to realtime events for collaborative coaching
  _gs.realtimeChannel = db_subscribeToGame(gameId, (evt) => {
    _applyEvent(evt);
    if (!_isFootball()) {
      _renderSoccerFieldZone();
      _renderSoccerBenchZone();
    }
  });

  // Subscribe to rotation queue broadcasts
  try {
    _gs.queueChannel = _db.channel('ctb_queue_' + gameId)
      .on('broadcast', { event: 'queue' }, ({ payload }) => {
        if (!_gs || _gs.watchMode) return;
        _gs.queueIn  = Array.isArray(payload?.in)  ? payload.in  : [];
        _gs.queueOut = Array.isArray(payload?.out) ? payload.out : [];
        if (Array.isArray(payload?.lastIn) && payload.lastIn.length > 0) {
          _gs.lastRotationIns = payload.lastIn;
          _gs.lastRotationOuts = Array.isArray(payload.lastOut) ? payload.lastOut : [];
          _gs.lastRotationTs  = payload.lastTs || Date.now();
        }
        _renderRotationQueue();
      })
      .subscribe();
  } catch (e) { /* ignore */ }

  window.addEventListener('beforeunload', () => {
    if (_gs?.realtimeChannel) db_unsubscribe(_gs.realtimeChannel);
    if (_gs?.queueChannel) db_unsubscribe(_gs.queueChannel);
  });
});

function _isFootball() {
  return _gs?.team?.sport === 'football';
}

// ── EVENT APPLICATION ──────────────────────────────────────────────

function _applyEvent(evt) {
  const ts = evt.timestamp || 0;
  if (ts > _gs.timerSeconds) _gs.timerSeconds = ts;

  if (evt.event_type === 'sub_on' && evt.player_id && _gs.players[evt.player_id]) {
    const ps = _gs.players[evt.player_id];
    if (!ps.onField) ps.totalBenchTime += Math.max(0, ts - ps.benchSince);
    ps.onField = true;
    ps.fieldEnteredAt = ts;
    ps.currentStint = Math.max(0, _gs.timerSeconds - ts);
  } else if (evt.event_type === 'sub_off' && evt.player_id && _gs.players[evt.player_id]) {
    const ps = _gs.players[evt.player_id];
    if (ps.onField && ps.fieldEnteredAt !== null) {
      ps.totalOnTime += Math.max(0, ts - ps.fieldEnteredAt);
    }
    ps.onField = false;
    ps.fieldEnteredAt = null;
    ps.benchSince = ts;
  } else if (evt.event_type === 'timer_start') {
    _gs.timerRunning = true;
    _gs.wallAnchor = Date.now();
    _gs.timerAnchor = ts;
  } else if (evt.event_type === 'timer_stop') {
    _gs.timerRunning = false;
    _gs.wallAnchor = null;
    _gs.timerAnchor = ts;
  } else if (evt.event_type === 'play_logged') {
    const side = evt.meta?.side;
    if (side === 'offense') _gs.offPlays++;
    else if (side === 'defense') _gs.defPlays++;
  } else if (evt.event_type === 'carry' && evt.player_id) {
    const d = evt.meta?.delta ?? 1;
    _gs.carries[evt.player_id] = Math.max(0, (_gs.carries[evt.player_id] || 0) + d);
  } else if (evt.event_type === 'flag_pull' && evt.player_id) {
    const d = evt.meta?.delta ?? 1;
    _gs.pulls[evt.player_id] = Math.max(0, (_gs.pulls[evt.player_id] || 0) + d);
  } else if (evt.event_type === 'score') {
    const team = evt.meta?.team;
    const d = evt.meta?.delta ?? 1;
    if (team === 'us') _gs.score.us = Math.max(0, _gs.score.us + d);
    else if (team === 'opp') _gs.score.opp = Math.max(0, _gs.score.opp + d);
  } else if (evt.event_type === 'game_end') {
    _gs.timerRunning = false;
  }
}

// ── AUTO-COUNT STEPPER ──────────────────────────────────────────────

function _changeAutoCount(delta) {
  if (!_gs) return;
  const max = Object.values(_gs.players).filter(p => !p.onField).length;
  _gs.autoCount = Math.max(1, Math.min(max, (_gs.autoCount || max) + delta));
  if (_isFootball()) _renderFootballBenchZone();
  else _renderSoccerBenchZone();
}

// ── SOCCER GAME SCREEN ─────────────────────────────────────────────

function _renderSoccerGameScreen() {
  if (!_gs?.container) return;
  const c = _gs.container;
  const team = _gs.team;

  c.innerHTML = `
    <div class="sticky-top">
      <div class="game-header" id="game-header">
        <div class="game-header-left">
          <div class="game-team-name">${_esc(team?.name ?? '')}</div>
        </div>
        <div class="game-header-center" id="timer-panel">
          <div class="timer-clock paused" id="timer-clock">00:00</div>
        </div>
        <div class="game-header-right">
          <button class="btn-game-action" id="btn-end-game">END</button>
        </div>
      </div>
      <div class="rotation-queue" id="rotation-queue"></div>
    </div>
    <div class="game-body">
      <div id="scoreboard-area"></div>
      <section class="zone field-zone" id="field-zone"></section>
      <section class="zone bench-zone" id="bench-zone"></section>
      <div id="team-stats-area"></div>
    </div>
  `;

  _renderSoccerScoreboard();
  _renderSoccerFieldZone();
  _renderSoccerBenchZone();
  _renderRotationQueue();

  c.querySelector('#btn-end-game').addEventListener('click', async () => {
    if (!confirm('End game?')) return;
    _releaseWakeLock();
    if (_gs.timerInterval) { clearInterval(_gs.timerInterval); _gs.timerInterval = null; }
    if (_gs.visibilityHandler) {
      document.removeEventListener('visibilitychange', _gs.visibilityHandler);
      _gs.visibilityHandler = null;
    }
    await _endGame();
    _clearCrashRecovery();
    navigate('game-summary', { gameId: _gs.game.id });
  });

  c.querySelector('#timer-panel').addEventListener('click', async () => {
    if (!_gs) return;
    _ensureAudioContext();
    if (_gs.timerRunning) {
      // Stop timer
      _gs.timerRunning = false;
      _gs.timerAnchor = _gs.timerSeconds;
      _gs.wallAnchor = null;
      clearInterval(_gs.timerInterval);
      _gs.timerInterval = null;
      _releaseWakeLock();
      await db_insertEvent({
        gameId: _gs.game.id,
        playerId: null,
        eventType: 'timer_stop',
        timestamp: _gs.timerSeconds,
      });
      _updateSoccerTimerClock();
    } else {
      // Start/resume timer
      _gs.timerRunning = true;
      _gs.timerAnchor = _gs.timerSeconds;
      _gs.wallAnchor = Date.now();
      await db_insertEvent({
        gameId: _gs.game.id,
        playerId: null,
        eventType: 'timer_start',
        timestamp: _gs.timerSeconds,
      });
      _requestWakeLock();
      _startSoccerTimerLoop();
    }
  });
}

function _startSoccerTimerLoop() {
  if (_gs.timerInterval) clearInterval(_gs.timerInterval);
  _gs.timerInterval = setInterval(() => {
    // Derive timer from wall clock — immune to background throttling
    _gs.timerSeconds = _gs.timerAnchor + Math.floor((Date.now() - _gs.wallAnchor) / 1000);

    // Update current stints for field players
    for (const ps of Object.values(_gs.players)) {
      if (ps.onField && ps.fieldEnteredAt !== null) {
        ps.currentStint = _gs.timerSeconds - ps.fieldEnteredAt;
      }
    }

    _updateClockDisplay();
    _updatePlayerTimes();
    _checkRotationAlert();
    _expireLastRotationIfNeeded();
  }, 1000);

  // Catch up immediately when returning from background
  if (!_gs.visibilityHandler) {
    _gs.visibilityHandler = () => {
      if (document.visibilityState === 'visible' && _gs.timerRunning && _gs.wallAnchor) {
        _gs.timerSeconds = _gs.timerAnchor + Math.floor((Date.now() - _gs.wallAnchor) / 1000);
        for (const ps of Object.values(_gs.players)) {
          if (ps.onField && ps.fieldEnteredAt !== null) {
            ps.currentStint = _gs.timerSeconds - ps.fieldEnteredAt;
          }
        }
        _updateClockDisplay();
        _updatePlayerTimes();
        _checkRotationAlert();

        // Re-acquire wake lock (iOS/Android release it on background)
        _requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', _gs.visibilityHandler);
  }

  _updateSoccerTimerClock();
}

function _updateClockDisplay() {
  const clock = _gs.container?.querySelector('.timer-clock');
  if (clock) {
    clock.textContent = _fmt(_gs.timerSeconds);
    clock.classList.toggle('paused', !_gs.timerRunning);
  }
}

function _updatePlayerTimes() {
  if (_isFootball()) return; // football has no per-second clock

  // Surgical update of stat pills on field/bench/team-stats so we don't
  // rebuild the whole DOM every tick (avoids tap-target destruction).
  const container = _gs.container;
  if (!container) return;

  for (const ps of Object.values(_gs.players)) {
    const pillField = container.querySelector(`.player-card[data-id="${ps.id}"] .player-time-field`);
    if (pillField) pillField.textContent = _fmtCardBucket(ps.currentStint);

    const pillBench = container.querySelector(`.player-card[data-id="${ps.id}"] .player-time-bench`);
    if (pillBench) pillBench.textContent = _fmtCardBucket(ps.totalBenchTime + (ps.onField ? 0 : Math.max(0, _gs.timerSeconds - ps.benchSince)));

    const pillTotal = container.querySelector(`.player-card[data-id="${ps.id}"] .player-time-total`);
    if (pillTotal) {
      const total = ps.totalOnTime + (ps.onField ? ps.currentStint : 0);
      pillTotal.textContent = _fmtCardBucket(total);
    }

    const statBar = container.querySelector(`#team-stats-area .stat-row[data-id="${ps.id}"] .stat-bar-fill`);
    if (statBar) {
      const total = ps.totalOnTime + (ps.onField ? ps.currentStint : 0);
      const max = Math.max(1, _gs.timerSeconds);
      statBar.style.width = Math.min(100, (total / max) * 100) + '%';
    }
    const statTime = container.querySelector(`#team-stats-area .stat-row[data-id="${ps.id}"] .stat-time`);
    if (statTime) {
      const total = ps.totalOnTime + (ps.onField ? ps.currentStint : 0);
      statTime.textContent = _fmtCardBucket(total);
    }
  }

  _updateSoccerTimerClock();
}

function _scheduleLastRotationExpiry() {
  if (_gs.lastRotationTimer) clearTimeout(_gs.lastRotationTimer);
  _gs.lastRotationTimer = setTimeout(() => {
    if (!_gs) return;
    _gs.lastRotationIns = [];
    _gs.lastRotationOuts = [];
    _gs.lastRotationTs = 0;
    _gs.lastRotationTimer = null;
    _broadcastQueue();
    _renderRotationQueue();
  }, 30000);
}

function _expireLastRotationIfNeeded() {
  if (!_gs?.lastRotationTs || _isFootball()) return;
  if ((Date.now() - _gs.lastRotationTs) > 30000) {
    _gs.lastRotationIns = [];
    _gs.lastRotationOuts = [];
    _gs.lastRotationTs = 0;
    if (_gs.lastRotationTimer) { clearTimeout(_gs.lastRotationTimer); _gs.lastRotationTimer = null; }
    _renderRotationQueue();
  }
}

function _updateSoccerTimerClock() {
  const clock = _gs.container?.querySelector('#timer-panel .timer-clock');
  if (!clock) return;
  const interval = _gs.alertInterval || 0;
  const cycleStart = _gs.lastAlertAt || 0;
  const elapsed = Math.max(0, _gs.timerSeconds - cycleStart);
  const remaining = interval > 0 ? interval - elapsed : 0;
  const overdue = remaining <= 0;
  clock.textContent = overdue ? '+' + _fmt(Math.abs(remaining)) : _fmt(remaining);
  clock.classList.toggle('paused', !_gs.timerRunning);
  clock.classList.toggle('overdue', overdue);
}

function _checkRotationAlert() {
  if (_isFootball()) return;
  if (!_gs.timerRunning) return;
  if ((_gs.alertInterval || 0) <= 0) return;

  const benchCount = Object.values(_gs.players).filter(p => !p.onField).length;
  if (benchCount === 0) return;

  const elapsed = _gs.timerSeconds - (_gs.lastAlertAt || 0);
  if (elapsed >= _gs.alertInterval && !_gs.alertFired) {
    _gs.alertFired = true;
    _playAlertTone();
    try { navigator.vibrate([200, 100, 200, 100, 200]); } catch (e) { /* ignore */ }
    // Flash screen
    const flash = document.createElement('div');
    flash.className = 'screen-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 600);
  }
}

// ── QUEUE MANAGEMENT ───────────────────────────────────────────────

function _toggleBenchPlayer(playerId) {
  if (!_gs || !playerId) return;
  const idx = _gs.queueIn.indexOf(playerId);
  if (idx >= 0) _gs.queueIn.splice(idx, 1);
  else _gs.queueIn.push(playerId);
  if (_isFootball()) {
    _renderFootballBenchZone();
  } else {
    _renderSoccerBenchZone();
  }
  _renderRotationQueue();
  _broadcastQueue();
}

function _toggleFieldPlayer(fieldPlayerId) {
  if (!_gs || !fieldPlayerId) return;
  const idx = _gs.queueOut.indexOf(fieldPlayerId);
  if (idx >= 0) _gs.queueOut.splice(idx, 1);
  else _gs.queueOut.push(fieldPlayerId);
  if (_isFootball()) {
    _renderFootballFieldZone();
  } else {
    _renderSoccerFieldZone();
  }
  _renderRotationQueue();
  _broadcastQueue();
}

function _broadcastQueue() {
  if (!_gs?.queueChannel) return;
  try {
    _gs.queueChannel.send({
      type: 'broadcast',
      event: 'queue',
      payload: {
        in: _gs.queueIn.slice(),
        out: _gs.queueOut.slice(),
        lastIn: _gs.lastRotationIns.slice(),
        lastOut: _gs.lastRotationOuts.slice(),
        lastTs: _gs.lastRotationTs,
      },
    });
  } catch (e) { /* ignore */ }
}

function _renderRotationQueue() {
  const zone = _gs.container?.querySelector('#rotation-queue');
  if (!zone) return;

  const inIds = _gs.queueIn || [];
  const outIds = _gs.queueOut || [];

  if (inIds.length === 0 && outIds.length === 0) {
    const lastIns = _gs.lastRotationIns || [];
    const lastOuts = _gs.lastRotationOuts || [];
    const lastTs = _gs.lastRotationTs || 0;
    const isSoccer = !_isFootball();
    const soccerExpired = isSoccer && lastTs > 0 && (Date.now() - lastTs) > 30000;

    if (lastIns.length > 0 && !soccerExpired) {
      const itemHTML = (id, side) => {
        const ps = _gs.players[id];
        if (!ps) return '';
        return '<div class="queue-item ' + side + '">' + _esc(ps.name) + '</div>';
      };
      const dismissBtn = !_gs.watchMode ? '<button class="queue-dismiss-last" id="btn-dismiss-last" title="Dismiss">✕</button>' : '';
      zone.innerHTML = `
        <div class="queue-header queue-header-last">
          <span class="queue-title">LAST ROTATION</span>
          ${dismissBtn}
        </div>
        <div class="queue-cols">
          <div class="queue-col queue-col-in">
            <div class="queue-col-label">WENT IN</div>
            <div class="queue-col-list">${lastIns.map(id => itemHTML(id, 'in')).join('')}</div>
          </div>
          <div class="queue-col queue-col-out">
            <div class="queue-col-label">WENT OUT</div>
            <div class="queue-col-list">${lastOuts.map(id => itemHTML(id, 'out')).join('')}</div>
          </div>
        </div>
      `;
      zone.classList.add('visible');
      if (!_gs.watchMode) {
        zone.querySelector('#btn-dismiss-last')?.addEventListener('click', () => {
          _gs.lastRotationIns = [];
          _gs.lastRotationOuts = [];
          _gs.lastRotationTs = 0;
          if (_gs.lastRotationTimer) { clearTimeout(_gs.lastRotationTimer); _gs.lastRotationTimer = null; }
          _broadcastQueue();
          _renderRotationQueue();
        });
      }
    } else {
      zone.innerHTML = '';
      zone.classList.remove('visible');
    }
    return;
  }

  const itemHTML = (id, side) => {
    const ps = _gs.players[id];
    if (!ps) return '';
    return '<div class="queue-item ' + side + '">' + _esc(ps.name) + '</div>';
  };

  const inHTML = inIds.map(id => itemHTML(id, 'in')).join('') || '<div class="queue-empty">— tap bench —</div>';
  const outHTML = outIds.map(id => itemHTML(id, 'out')).join('') || '<div class="queue-empty">— tap field —</div>';

  const total = inIds.length + outIds.length;
  const actionBar = _gs.watchMode ? '' : `
    <div class="queue-actions">
      <button class="queue-clear" id="btn-clear-queue" title="Clear queue">CLEAR</button>
      <button class="queue-rotate" id="btn-rotate-queue" ${total === 0 ? 'disabled' : ''}>
        ROTATE${outIds.length > 0 || inIds.length > 0 ? ' &nbsp;·&nbsp; ' + outIds.length + ' off / ' + inIds.length + ' on' : ''}
      </button>
    </div>
  `;

  zone.innerHTML = `
    <div class="queue-header">
      <span class="queue-title">NEXT ROTATION</span>
    </div>
    <div class="queue-cols">
      <div class="queue-col queue-col-in">
        <div class="queue-col-label">GOING IN</div>
        <div class="queue-col-list">${inHTML}</div>
      </div>
      <div class="queue-col queue-col-out">
        <div class="queue-col-label">GOING OUT</div>
        <div class="queue-col-list">${outHTML}</div>
      </div>
    </div>
    ${actionBar}
  `;
  zone.classList.add('visible');

  if (!_gs.watchMode) {
    zone.querySelector('#btn-clear-queue')?.addEventListener('click', () => {
      _gs.queueIn = [];
      _gs.queueOut = [];
      if (_isFootball()) {
        _renderFootballFieldZone();
        _renderFootballBenchZone();
      } else {
        _renderSoccerFieldZone();
        _renderSoccerBenchZone();
      }
      _renderRotationQueue();
      _broadcastQueue();
    });
    zone.querySelector('#btn-rotate-queue')?.addEventListener('click', _executeQueueRotation);
  }
}

function _renderFootballFieldZone() {
  const zone = _gs.container.querySelector('#field-zone');
  if (!zone) return;
  const fieldPlayers = _getFieldPlayers();
  const count = fieldPlayers.length;

  // "Next out" advances past any players already queued out.
  const queueOutSet = new Set(_gs.queueOut || []);
  let nextOutId = null;
  const sortedByPlayed = [...fieldPlayers].sort((a, b) => _getPlayedTime(b) - _getPlayedTime(a));
  for (const ps of sortedByPlayed) {
    if (queueOutSet.has(ps.id)) continue;
    if (_getPlayedTime(ps) > 0) { nextOutId = ps.id; break; }
  }

  const editable = !_gs.watchMode;
  const queueInSet  = new Set(_gs.queueIn  || []);

  const cells = fieldPlayers.map(ps => {
    const plays   = _getPlayedTime(ps);
    const carries = _gs.carries[ps.id] || 0;
    const pulls   = _gs.pulls[ps.id]   || 0;
    const tds     = _gs.tds[ps.id]     || 0;
    const statStr = `${plays}P`
      + (carries > 0 ? ` · ${carries}R` : '')
      + (pulls   > 0 ? ` · ${pulls}D`  : '')
      + (tds     > 0 ? ` · ${tds}TD`   : '');
    const isNextOut = ps.id === nextOutId;
    const isQueuedOut = queueOutSet.has(ps.id);
    const isQueuedIn  = queueInSet.has(ps.id);
    const hint = isQueuedOut ? '↓ out' : (isNextOut ? 'next out' : '');
    return `
      <div class="ff-cell ${isNextOut ? 'next-hint' : ''} ${isQueuedOut ? 'queued-out' : ''} ${isQueuedIn ? 'queued-in' : ''}" data-id="${ps.id}"${editable ? '' : ' data-noedit'}>
        <div class="ff-name">${_esc(ps.name)}</div>
        <div class="ff-stat">${statStr}</div>
        ${hint ? `<div class="ff-hint">${hint}</div>` : ''}
      </div>`;
  }).join('');

  zone.innerHTML = `
    <div class="zone-header">
      <span class="zone-label">FIELD</span>
      <span class="zone-count">${count} players</span>
    </div>
    <div class="ff-grid">${cells}</div>
  `;

  if (editable) {
    zone.querySelectorAll('.ff-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        _toggleFieldPlayer(cell.dataset.id);
      });
    });
  }
}

function _renderFootballBenchZone() {
  const zone = _gs.container.querySelector('#bench-zone');
  if (!zone) return;
  const benchPlayers = _getBenchPlayers();
  const count = benchPlayers.length;

  // "Next in" advances past any players already queued in.
  const queueInSet = new Set(_gs.queueIn || []);
  let nextInId = null;
  const sortedByPlayed = [...benchPlayers].sort((a, b) => _getPlayedTime(a) - _getPlayedTime(b));
  for (const ps of sortedByPlayed) {
    if (queueInSet.has(ps.id)) continue;
    nextInId = ps.id;
    break;
  }

  const editable = !_gs.watchMode;
  const queueOutSet = new Set(_gs.queueOut || []);

  const cells = benchPlayers.map(ps => {
    const plays   = _getPlayedTime(ps);
    const carries = _gs.carries[ps.id] || 0;
    const pulls   = _gs.pulls[ps.id]   || 0;
    const tds     = _gs.tds[ps.id]     || 0;
    const statStr = `${plays}P`
      + (carries > 0 ? ` · ${carries}R` : '')
      + (pulls   > 0 ? ` · ${pulls}D`  : '')
      + (tds     > 0 ? ` · ${tds}TD`   : '');
    const isNextIn = ps.id === nextInId;
    const isQueuedIn  = queueInSet.has(ps.id);
    const isQueuedOut = queueOutSet.has(ps.id);
    const hint = isQueuedIn ? '↑ in' : (isNextIn ? 'next in' : '');
    return `
      <div class="ff-cell ${isNextIn ? 'next-hint' : ''} ${isQueuedIn ? 'queued-in' : ''} ${isQueuedOut ? 'queued-out' : ''}" data-id="${ps.id}"${editable ? '' : ' data-noedit'}>
        <div class="ff-name">${_esc(ps.name)}</div>
        <div class="ff-stat">${statStr}</div>
        ${hint ? `<div class="ff-hint">${hint}</div>` : ''}
      </div>`;
  }).join('');

  const autoCount = Math.min(_gs.autoCount || 1, count);

  zone.innerHTML = `
    <div class="zone-header">
      <span class="zone-label">BENCH</span>
      <span class="zone-count">${count} players</span>
    </div>
    <div class="ff-grid">${cells}</div>
  `;

  if (editable) {
    zone.querySelectorAll('.ff-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        _toggleBenchPlayer(cell.dataset.id);
      });
    });
  }
}

function _renderFootballPossession() {
  const panel = _gs.container?.querySelector('#possession-panel');
  if (!panel) return;
  const poss = _gs.possession || 'offense';
  panel.querySelectorAll('.poss-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.side === poss);
  });
}

function _renderFootballScoreboard() {
  const area = _gs.container?.querySelector('#scoreboard-area');
  if (!area) return;
  const sc = _gs.score || { us: 0, opp: 0 };
  const opp = _gs.game.opponent ? _esc(_gs.game.opponent) : 'OPP';
  area.innerHTML = `
    <div class="football-scoreboard">
      <div class="score-block">
        <div class="score-label">US</div>
        <div class="score-val" id="score-us">${sc.us}</div>
        <div class="score-btns">
          <button class="score-btn score-plus" data-team="us" data-delta="1">+</button>
          <button class="score-btn score-minus" data-team="us" data-delta="-1">−</button>
        </div>
      </div>
      <div class="score-sep">–</div>
      <div class="score-block">
        <div class="score-label">${opp}</div>
        <div class="score-val" id="score-opp">${sc.opp}</div>
        <div class="score-btns">
          <button class="score-btn score-plus" data-team="opp" data-delta="1">+</button>
          <button class="score-btn score-minus" data-team="opp" data-delta="-1">−</button>
        </div>
      </div>
    </div>
  `;
  area.querySelectorAll('.score-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const team = btn.dataset.team;
      const delta = parseInt(btn.dataset.delta, 10);
      _adjustScore(team, delta);
    });
  });
}

function _renderFootballTeamStats() {
  const area = _gs.container?.querySelector('#team-stats-area');
  if (!area) return;
  const all = Object.values(_gs.players).sort((a, b) => {
    const pa = _getPlayedTime(a), pb = _getPlayedTime(b);
    return pb - pa || a.name.localeCompare(b.name);
  });

  if (all.length === 0) { area.innerHTML = ''; return; }

  const maxPlays = Math.max(1, ...all.map(p => _getPlayedTime(p)));

  area.innerHTML = `
    <div class="team-stats-section">
      <div class="team-stats-header">TEAM STATS</div>
      ${all.map(ps => {
        const plays   = _getPlayedTime(ps);
        const carries = _gs.carries[ps.id] || 0;
        const pulls   = _gs.pulls[ps.id]   || 0;
        const tds     = _gs.tds[ps.id]     || 0;
        const pct     = Math.round((plays / maxPlays) * 100);
        return `
          <div class="stat-row" data-id="${ps.id}">
            <div class="stat-name">${_esc(ps.name)}</div>
            <div class="stat-bar"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
            <div class="stat-time">${plays}P${carries > 0 ? ' ' + carries + 'R' : ''}${pulls > 0 ? ' ' + pulls + 'D' : ''}${tds > 0 ? ' ' + tds + 'TD' : ''}</div>
            ${!_gs.watchMode ? `
            <div class="stat-adj">
              <button class="stat-adj-btn" data-pid="${ps.id}" data-stat="carry" data-delta="1">+R</button>
              <button class="stat-adj-btn" data-pid="${ps.id}" data-stat="carry" data-delta="-1">−R</button>
              <button class="stat-adj-btn" data-pid="${ps.id}" data-stat="flag_pull" data-delta="1">+D</button>
              <button class="stat-adj-btn" data-pid="${ps.id}" data-stat="flag_pull" data-delta="-1">−D</button>
              <button class="stat-adj-btn" data-pid="${ps.id}" data-stat="td" data-delta="1">+TD</button>
              <button class="stat-adj-btn" data-pid="${ps.id}" data-stat="td" data-delta="-1">−TD</button>
            </div>
            ` : ''}
          </div>`;
      }).join('')}
    </div>
  `;

  if (!_gs.watchMode) {
    area.querySelectorAll('.stat-adj-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _adjustPlayerStat(btn.dataset.pid, btn.dataset.stat, parseInt(btn.dataset.delta, 10));
      });
    });
  }
}

function _renderFootballGameScreen() {
  const c = _gs.container;
  const team = _gs.team;
  const isFootball = _isFootball();
  const opponent = _gs.game.opponent ? ' vs ' + _esc(_gs.game.opponent) : '';

  c.innerHTML = `
    <div class="sticky-top">
      <div class="game-header" id="game-header">
        <div class="game-header-left">
          <div class="game-team-name">${_esc(team?.name ?? '')}</div>
        </div>
        <div class="game-header-center">
          <div class="game-sport-badge">FLAG FOOTBALL</div>
        </div>
        <div class="game-header-right">
          <button class="btn-game-action" id="btn-end-game">END</button>
        </div>
      </div>
      <div class="rotation-queue" id="rotation-queue"></div>
    </div>
    <div class="game-body">
      <div id="scoreboard-area"></div>
      <div id="possession-panel">
        <button class="poss-btn active" data-side="offense">OFFENSE</button>
        <button class="poss-btn" data-side="defense">DEFENSE</button>
      </div>
      <section class="zone field-zone" id="field-zone"></section>
      <section class="zone bench-zone" id="bench-zone"></section>
      <div id="team-stats-area"></div>
    </div>
  `;

  _renderFootballScoreboard();
  _renderFootballFieldZone();
  _renderFootballBenchZone();
  _renderFootballTeamStats();
  _renderFootballPossession();
  _renderRotationQueue();

  c.querySelector('#btn-end-game').addEventListener('click', async () => {
    if (!confirm('End game?')) return;
    await _endGame();
    _clearCrashRecovery();
    navigate('game-summary', { gameId: _gs.game.id });
  });

  c.querySelector('#possession-panel').addEventListener('click', async (e) => {
    const btn = e.target.closest('.poss-btn');
    if (!btn || _gs.watchMode) return;
    const side = btn.dataset.side;
    _gs.possession = side;
    _logPlay(side);
  });
}

async function _logPlay(side) {
  if (!_gs?.game?.id) return;

  if (!_gs.offPlays) _gs.offPlays = 0;
  if (!_gs.defPlays) _gs.defPlays = 0;

  if (side === 'offense') _gs.offPlays++;
  else _gs.defPlays++;

  // Sync timer-less play count into player stints
  for (const ps of Object.values(_gs.players)) {
    if (ps.onField && ps.fieldEnteredAt !== null) {
      ps.currentStint = _gs.timerSeconds - ps.fieldEnteredAt;
    }
  }

  await db_insertEvent({
    gameId: _gs.game.id,
    playerId: null,
    eventType: 'play_logged',
    timestamp: _gs.timerSeconds,
    meta: { side },
  });

  _gs.lastRotationIns = [];
  _gs.lastRotationOuts = [];
  _gs.lastRotationTs = 0;

  try { navigator.vibrate(20); } catch (e) { /* ignore */ }

  _renderFootballPossession();
  _renderFootballFieldZone();
  _renderFootballBenchZone();
  _renderFootballTeamStats();
  _saveCrashRecovery();
}

async function _adjustPlayerStat(playerId, stat, delta) {
  if (!_gs?.game?.id || !playerId || (delta !== 1 && delta !== -1)) return;
  // 'goal' is the soccer alias for 'td' — same event/score model as football TDs.
  const isScoring = (stat === 'td' || stat === 'goal');
  const eventType = isScoring ? 'score' : stat; // 'carry' | 'flag_pull' | 'score'
  const meta = isScoring ? { team: 'us', delta } : { delta };

  if (stat === 'carry') {
    const cur = _gs.carries[playerId] || 0;
    if (delta < 0 && cur <= 0) return;
    _gs.carries[playerId] = Math.max(0, cur + delta);
  } else if (stat === 'flag_pull') {
    const cur = _gs.pulls[playerId] || 0;
    if (delta < 0 && cur <= 0) return;
    _gs.pulls[playerId] = Math.max(0, cur + delta);
  } else if (stat === 'td' || stat === 'goal') {
    const cur = _gs.tds[playerId] || 0;
    if (delta < 0 && cur <= 0) return;
    _gs.tds[playerId] = Math.max(0, cur + delta);
    _gs.score.us = Math.max(0, _gs.score.us + delta);
    _renderFootballScoreboard();
    _renderSoccerScoreboard();
  }

  await db_insertEvent({ gameId: _gs.game.id, playerId, eventType, timestamp: _gs.timerSeconds, meta });

  if (_isFootball()) _renderFootballTeamStats();
}

async function _adjustScore(team, delta) {
  if (!_gs?.game?.id) return;
  const cur = _gs.score[team] || 0;
  if (delta < 0 && cur <= 0) return;
  _gs.score[team] = Math.max(0, cur + delta);
  await db_insertEvent({
    gameId: _gs.game.id,
    playerId: null,
    eventType: 'score',
    timestamp: _gs.timerSeconds,
    meta: { team, delta },
  });
  if (_isFootball()) _renderFootballScoreboard();
  else _renderSoccerScoreboard();
}

// ── SOCCER FIELD / BENCH ZONES ────────────────────────────────────────

function _getFieldPlayers() {
  return Object.values(_gs.players).filter(p => p.onField)
    .sort((a, b) => a.name.localeCompare(b.name));
}
function _getBenchPlayers() {
  return Object.values(_gs.players).filter(p => !p.onField)
    .sort((a, b) => a.name.localeCompare(b.name));
}
function _getPlayedTime(ps) {
  return ps.totalOnTime + (ps.onField ? (ps.currentStint || 0) : 0);
}

function _renderSoccerFieldZone() {
  const zone = _gs.container?.querySelector('#field-zone');
  if (!zone) return;
  const fieldPlayers = _getFieldPlayers();
  const queueOutSet = new Set(_gs.queueOut || []);

  const cards = fieldPlayers.map(ps => {
    const benchTime = _fmtCardBucket(ps.totalBenchTime);
    const fieldTime = _fmtCardBucket(ps.currentStint);
    const isQueued = queueOutSet.has(ps.id);
    return `
      <div class="player-card ${isQueued ? 'queued-out' : ''}" data-id="${ps.id}">
        <span class="player-name">${_esc(ps.name)}</span>
        <div class="player-pills">
          <span class="player-pill pill-field"><span class="player-time-field">${fieldTime}</span></span>
          <span class="player-pill pill-bench"><span class="player-time-bench">${benchTime}</span></span>
        </div>
      </div>`;
  }).join('');

  zone.innerHTML = `
    <div class="zone-header">
      <span class="zone-label">ON FIELD</span>
      <span class="zone-count">${fieldPlayers.length} players</span>
    </div>
    ${cards}
  `;

  if (!_gs.watchMode) {
    zone.querySelectorAll('.player-card').forEach(card => {
      card.addEventListener('click', () => _toggleFieldPlayer(card.dataset.id));
    });
  }
}

function _renderSoccerBenchZone() {
  const zone = _gs.container?.querySelector('#bench-zone');
  if (!zone) return;
  const benchPlayers = _getBenchPlayers();
  const queueInSet = new Set(_gs.queueIn || []);

  const cards = benchPlayers.map(ps => {
    const benchTime = _fmtCardBucket(ps.totalBenchTime + Math.max(0, _gs.timerSeconds - ps.benchSince));
    const onTime = _fmtCardBucket(ps.totalOnTime);
    const isQueued = queueInSet.has(ps.id);
    return `
      <div class="player-card ${isQueued ? 'queued-in' : ''}" data-id="${ps.id}">
        <span class="player-name">${_esc(ps.name)}</span>
        <div class="player-pills">
          <span class="player-pill pill-bench"><span class="player-time-bench">${benchTime}</span></span>
          <span class="player-pill pill-field"><span class="player-time-total">${onTime}</span></span>
        </div>
      </div>`;
  }).join('');

  zone.innerHTML = `
    <div class="zone-header">
      <span class="zone-label">BENCH</span>
      <span class="zone-count">${benchPlayers.length} players</span>
    </div>
    ${cards}
  `;

  if (!_gs.watchMode) {
    zone.querySelectorAll('.player-card').forEach(card => {
      card.addEventListener('click', () => _toggleBenchPlayer(card.dataset.id));
    });
  }
}

// ── SOCCER SCOREBOARD ───────────────────────────────────────────────

function _renderSoccerScoreboard() {
  const area = _gs.container?.querySelector('#scoreboard-area');
  if (!area) return;
  const sc = _gs.score || { us: 0, opp: 0 };
  const hasScore = sc.us > 0 || sc.opp > 0;
  const isFootball = _isFootball();
  if (!hasScore && !isFootball) { area.innerHTML = ''; return; }

  const opp = _gs.game.opponent ? _esc(_gs.game.opponent) : 'OPP';
  const scoreBanner = (hasScore || isFootball) ? `
    <div class="football-scoreboard">
      <div class="score-block">
        <div class="score-label">US</div>
        <div class="score-val" id="score-us">${sc.us}</div>
        <div class="score-btns">
          <button class="score-btn score-plus" data-team="us" data-delta="1">+</button>
          <button class="score-btn score-minus" data-team="us" data-delta="-1">−</button>
        </div>
      </div>
      <div class="score-sep">–</div>
      <div class="score-block">
        <div class="score-label">${opp}</div>
        <div class="score-val" id="score-opp">${sc.opp}</div>
        <div class="score-btns">
          <button class="score-btn score-plus" data-team="opp" data-delta="1">+</button>
          <button class="score-btn score-minus" data-team="opp" data-delta="-1">−</button>
        </div>
      </div>
    </div>
  ` : '';

  area.innerHTML = scoreBanner;
  area.querySelectorAll('.score-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const team = btn.dataset.team;
      const delta = parseInt(btn.dataset.delta, 10);
      _adjustScore(team, delta);
    });
  });
}

// ── GAME END ─────────────────────────────────────────────────────────

async function _endGame() {
  if (!_gs?.game?.id) return;
  _gs.timerRunning = false;
  if (_gs.timerInterval) { clearInterval(_gs.timerInterval); _gs.timerInterval = null; }
  if (_gs.visibilityHandler) {
    document.removeEventListener('visibilitychange', _gs.visibilityHandler);
    _gs.visibilityHandler = null;
  }
  if (_gs.lastRotationTimer) { clearTimeout(_gs.lastRotationTimer); _gs.lastRotationTimer = null; }
  // Finalize all field player times
  for (const ps of Object.values(_gs.players)) {
    if (ps.onField && ps.fieldEnteredAt !== null) {
      ps.totalOnTime += Math.max(0, _gs.timerSeconds - ps.fieldEnteredAt);
    }
  }
  await db_insertEvent({
    gameId: _gs.game.id,
    playerId: null,
    eventType: 'game_end',
    timestamp: _gs.timerSeconds,
  });
}

// ── EXECUTE ROTATION ───────────────────────────────────────────────

async function _executeQueueRotation() {
  if (!_gs) return;
  if (_gs.queueIn.length === 0 && _gs.queueOut.length === 0) return;

  // Sync from wall clock before snapshot so sub/pause events get accurate time
  if (!_isFootball() && _gs.timerRunning && _gs.wallAnchor) {
    _gs.timerSeconds = _gs.timerAnchor + Math.floor((Date.now() - _gs.wallAnchor) / 1000);
  }

  const ts = _gs.timerSeconds;

  // Cap to min(out, in) so field count can't exceed fieldSize
  const swapCount = Math.min(_gs.queueOut.length, _gs.queueIn.length);
  const outs = _gs.queueOut.slice(0, swapCount);
  const ins = _gs.queueIn.slice(0, swapCount);

  for (const outId of outs) {
    const ps = _gs.players[outId];
    if (!ps || !ps.onField) continue;
    await db_insertEvent({ gameId: _gs.game.id, playerId: outId, eventType: 'sub_off', timestamp: ts });
    ps.totalOnTime += Math.max(0, ts - (ps.fieldEnteredAt || 0));
    ps.onField = false;
    ps.fieldEnteredAt = null;
    ps.currentStint = 0;
    ps.benchSince = ts;
  }

  for (const inId of ins) {
    const ps = _gs.players[inId];
    if (!ps || ps.onField) continue;
    await db_insertEvent({ gameId: _gs.game.id, playerId: inId, eventType: 'sub_on', timestamp: ts });
    ps.totalBenchTime += Math.max(0, ts - ps.benchSince);
    ps.onField = true;
    ps.fieldEnteredAt = ts;
    ps.currentStint = 0;
  }

  _gs.lastRotationIns = ins.slice();
  _gs.lastRotationOuts = outs.slice();
  _gs.lastRotationTs = Date.now();
  _scheduleLastRotationExpiry();
  _gs.queueIn = [];
  _gs.queueOut = [];
  _broadcastQueue();

  try { navigator.vibrate([30, 40, 30]); } catch (e) { /* ignore */ }

  if (_isFootball()) {
    _renderFootballFieldZone();
    _renderFootballBenchZone();
    _renderFootballTeamStats();
  } else {
    // Pause the clock — coach presses START when play resumes
    if (_gs.timerRunning) {
      await db_insertEvent({
        gameId: _gs.game.id,
        playerId: null,
        eventType: 'timer_stop',
        timestamp: ts,
      });
      _gs.timerRunning = false;
      _gs.timerAnchor = ts;
      _gs.wallAnchor = null;
      clearInterval(_gs.timerInterval);
      _gs.timerInterval = null;
      _releaseWakeLock();
    }

    _gs.lastAlertAt = ts;
    _gs.alertFired = false;

    _renderSoccerFieldZone();
    _renderSoccerBenchZone();
  }

  _renderRotationQueue();
  _saveCrashRecovery();
}

// ── SPECTATOR VIEW ──────────────────────────────────────────────────

registerScreen('spectator', async (container, { gameId }) => {
  if (!gameId) { navigate('home'); return; }

  const [game, roster, events] = await Promise.all([
    db_getGame(gameId),
    db_getRosterByGame(gameId),
    db_getGameEvents(gameId),
  ]);

  if (!game) { navigate('home'); return; }

  const team = await db_getTeam(game.team_id);

  _gs = {
    game,
    team,
    container,
    players: {},
    timerSeconds: 0,
    timerRunning: false,
    timerInterval: null,
    wallAnchor: null,
    timerAnchor: 0,
    alertInterval: 0,
    alertFired: false,
    lastAlertAt: 0,
    visibilityHandler: null,
    realtimeChannel: null,
    queueChannel: null,
    queueIn: [],
    queueOut: [],
    autoCount: game.field_size,
    watchMode: true,
    possession: 'offense',
    score: { us: 0, opp: 0 },
    carries: {},
    pulls: {},
    tds: {},
    offPlays: 0,
    defPlays: 0,
    lastRotationIns: [],
    lastRotationOuts: [],
    lastRotationTs: 0,
    lastRotationTimer: null,
  };

  for (const p of roster) {
    _gs.players[p.id] = {
      id: p.id,
      name: p.name,
      jerseyNumber: p.jersey_number,
      onField: false,
      fieldEnteredAt: null,
      currentStint: 0,
      totalOnTime: 0,
      totalBenchTime: 0,
      benchSince: 0,
    };
  }

  _replayEventsForWatch(events);

  _renderWatchScreen();

  // Subscribe to game events for real-time updates
  _gs.realtimeChannel = db_subscribeToGame(gameId, (evt) => {
    _applyEventForWatch(evt);
    _renderWatchScreen();
  });

  // Listen for live rotation-queue broadcasts from the head coach
  try {
    _gs.queueChannel = _db.channel('ctb_queue_' + gameId)
      .on('broadcast', { event: 'queue' }, ({ payload }) => {
        if (!_gs || !_gs.watchMode) return;
        _gs.queueIn = Array.isArray(payload?.in) ? payload.in : [];
        _gs.queueOut = Array.isArray(payload?.out) ? payload.out : [];
        if (Array.isArray(payload?.lastIn) && payload.lastIn.length > 0) {
          _gs.lastRotationIns = payload.lastIn;
          _gs.lastRotationOuts = Array.isArray(payload.lastOut) ? payload.lastOut : [];
          _gs.lastRotationTs = payload.lastTs || Date.now();
        }
        _renderRotationQueue();
        if (_isFootball()) {
          _renderFootballFieldZone();
          _renderFootballBenchZone();
        } else {
          _renderSoccerFieldZone();
          _renderSoccerBenchZone();
        }
      })
      .subscribe();
  } catch (e) { /* ignore — broadcast just won't update */ }

  window.addEventListener('beforeunload', () => {
    if (_gs?.realtimeChannel) db_unsubscribe(_gs.realtimeChannel);
    if (_gs?.queueChannel) db_unsubscribe(_gs.queueChannel);
  });
});

function _replayEventsForWatch(events) {
  for (const evt of events) {
    _applyEventForWatch(evt);
  }
}

function _applyEventForWatch(evt) {
  const ts = evt.timestamp || 0;
  if (ts > _gs.timerSeconds) _gs.timerSeconds = ts;

  if (evt.event_type === 'sub_on' && evt.player_id && _gs.players[evt.player_id]) {
    const ps = _gs.players[evt.player_id];
    if (!ps.onField) ps.totalBenchTime += Math.max(0, ts - ps.benchSince);
    ps.onField = true;
    ps.fieldEnteredAt = ts;
    ps.currentStint = Math.max(0, _gs.timerSeconds - ts);
  } else if (evt.event_type === 'sub_off' && evt.player_id && _gs.players[evt.player_id]) {
    const ps = _gs.players[evt.player_id];
    if (ps.onField && ps.fieldEnteredAt !== null) {
      ps.totalOnTime += Math.max(0, ts - ps.fieldEnteredAt);
    }
    ps.onField = false;
    ps.fieldEnteredAt = null;
    ps.benchSince = ts;
  } else if (evt.event_type === 'play_logged') {
    const side = evt.meta?.side;
    if (side === 'offense') _gs.offPlays++;
    else if (side === 'defense') _gs.defPlays++;
    _gs.lastRotationIns = [];
    _gs.lastRotationOuts = [];
    _gs.lastRotationTs = 0;
    // Update on-field players' currentStint to reflect the new play count
    for (const ps of Object.values(_gs.players)) {
      if (ps.onField && ps.fieldEnteredAt !== null) {
        ps.currentStint = _gs.timerSeconds - ps.fieldEnteredAt;
      }
    }
  } else if (evt.event_type === 'carry' && evt.player_id) {
    const d = evt.meta?.delta ?? 1;
    _gs.carries[evt.player_id] = Math.max(0, (_gs.carries[evt.player_id] || 0) + d);
  } else if (evt.event_type === 'flag_pull' && evt.player_id) {
    const d = evt.meta?.delta ?? 1;
    _gs.pulls[evt.player_id] = Math.max(0, (_gs.pulls[evt.player_id] || 0) + d);
  } else if (evt.event_type === 'score') {
    const team = evt.meta?.team;
    const d = evt.meta?.delta ?? 1;
    if (team === 'us') _gs.score.us = Math.max(0, _gs.score.us + d);
    else if (team === 'opp') _gs.score.opp = Math.max(0, _gs.score.opp + d);
  } else if (evt.event_type === 'timer_start') {
    _gs.timerRunning = true;
  } else if (evt.event_type === 'timer_stop' || evt.event_type === 'game_end') {
    _gs.timerRunning = false;
  }
}

function _renderWatchScreen() {
  const c = _gs.container;
  const isFootball = _isFootball();
  const sc = _gs.score || { us: 0, opp: 0 };
  const hasScore = sc.us > 0 || sc.opp > 0;
  const opp = _gs.game.opponent ? _esc(_gs.game.opponent) : 'OPP';

  const fieldPlayers = _getFieldPlayers();
  const benchPlayers = _getBenchPlayers();

  const scoreBanner = (hasScore || isFootball) ? `
    <div class="football-scoreboard">
      <div class="score-block">
        <div class="score-label">US</div>
        <div class="score-val">${sc.us}</div>
      </div>
      <div class="score-sep">–</div>
      <div class="score-block">
        <div class="score-label">${opp}</div>
        <div class="score-val">${sc.opp}</div>
      </div>
    </div>
  ` : '';

  const fieldHTML = fieldPlayers.map(ps => {
    const plays = _getPlayedTime(ps);
    return `<div class="watch-player on-field">${_esc(ps.name)}<span>${isFootball ? plays + 'P' : _fmtCardBucket(plays)}</span></div>`;
  }).join('');

  const benchHTML = benchPlayers.map(ps => {
    const plays = _getPlayedTime(ps);
    return `<div class="watch-player on-bench">${_esc(ps.name)}<span>${isFootball ? plays + 'P' : _fmtCardBucket(plays)}</span></div>`;
  }).join('');

  const lastIns  = _gs.lastRotationIns  || [];
  const lastOuts = _gs.lastRotationOuts || [];
  const nextIns  = _gs.queueIn  || [];
  const nextOuts = _gs.queueOut || [];

  const rotSection = (lastIns.length > 0 || nextIns.length > 0) ? `
    <div class="spectator-banner">
      ${nextIns.length > 0 ? `
        <div class="spec-rot-block">
          <div class="spec-rot-label">NEXT IN</div>
          ${nextIns.map(id => `<div class="spec-rot-player">${_esc(_gs.players[id]?.name ?? id)}</div>`).join('')}
        </div>
        <div class="spec-rot-block">
          <div class="spec-rot-label">NEXT OUT</div>
          ${nextOuts.map(id => `<div class="spec-rot-player">${_esc(_gs.players[id]?.name ?? id)}</div>`).join('')}
        </div>
      ` : ''}
      ${lastIns.length > 0 ? `
        <div class="spec-rot-block last">
          <div class="spec-rot-label">LAST IN</div>
          ${lastIns.map(id => `<div class="spec-rot-player">${_esc(_gs.players[id]?.name ?? id)}</div>`).join('')}
        </div>
        <div class="spec-rot-block last">
          <div class="spec-rot-label">LAST OUT</div>
          ${lastOuts.map(id => `<div class="spec-rot-player">${_esc(_gs.players[id]?.name ?? id)}</div>`).join('')}
        </div>
      ` : ''}
    </div>
  ` : '';

  c.innerHTML = `
    <div class="spectator-view">
      <div class="spec-header">
        <div class="spec-team">${_esc(_gs.team?.name ?? '')}</div>
        <div class="spec-badge">WATCHING</div>
      </div>
      ${scoreBanner}
      ${rotSection}
      <div class="spec-zone">
        <div class="spec-zone-label">ON FIELD</div>
        ${fieldHTML || '<div class="spec-empty">No players on field</div>'}
      </div>
      <div class="spec-zone">
        <div class="spec-zone-label">BENCH</div>
        ${benchHTML || '<div class="spec-empty">No players on bench</div>'}
      </div>
    </div>
  `;
}

// ── WATCH BELL (push subscription toggle on spectator) ────────────────────────

function _refreshWatchBell() {
  const btn = _gs?.container?.querySelector('#btn-watch-bell');
  if (!btn) return;
  const gameId = _gs?.game?.id;
  if (!gameId) return;
  const subscribed = push_isSpectatorSubscribed(gameId);
  btn.textContent = subscribed ? '🔔' : '🔕';
  btn.title = subscribed ? 'Stop rotation alerts' : 'Get rotation alerts';
}

function _setupWatchBell(gameId) {
  const btn = _gs?.container?.querySelector('#btn-watch-bell');
  if (!btn) return;
  _refreshWatchBell();
  btn.onclick = async () => {
    if (push_isSpectatorSubscribed(gameId)) {
      await push_unsubscribeSpectator(gameId);
    } else {
      const ok = await push_subscribeSpectator(gameId);
      if (!ok) { _showToast('Notifications blocked or unavailable'); return; }
    }
    _refreshWatchBell();
  };
}

// ── GAME SUMMARY ───────────────────────────────────────────────────

registerScreen('game-summary', async (container, { gameId }) => {
  if (!gameId) { navigate('home'); return; }

  const [game, events] = await Promise.all([
    db_getGame(gameId),
    db_getGameEvents(gameId),
  ]);

  if (!game) { navigate('home'); return; }

  const roster = await db_getRosterByGame(gameId);
  const team = await db_getTeam(game.team_id);

  // Compute per-player time from events
  const playerTimes = {};
  const playerOnField = {};
  const playerFieldEntry = {};
  let gameEndTs = 0;

  for (const p of roster) {
    playerTimes[p.id]    = 0;
    playerOnField[p.id]  = false;
    playerFieldEntry[p.id] = null;
  }

  for (const evt of events) {
    const ts = evt.timestamp || 0;
    if (evt.event_type === 'game_end') { gameEndTs = ts; continue; }
    if (!evt.player_id) continue;
    if (evt.event_type === 'sub_on') {
      playerOnField[evt.player_id]  = true;
      playerFieldEntry[evt.player_id] = ts;
    } else if (evt.event_type === 'sub_off') {
      if (playerOnField[evt.player_id] && playerFieldEntry[evt.player_id] !== null) {
        playerTimes[evt.player_id] += Math.max(0, ts - playerFieldEntry[evt.player_id]);
      }
      playerOnField[evt.player_id]  = false;
      playerFieldEntry[evt.player_id] = null;
    }
  }

  // Finalize any still-on-field players
  for (const p of roster) {
    if (playerOnField[p.id] && playerFieldEntry[p.id] !== null) {
      playerTimes[p.id] += Math.max(0, gameEndTs - playerFieldEntry[p.id]);
    }
  }

  const totalTime = gameEndTs;
  const avg = totalTime > 0
    ? roster.reduce((sum, p) => sum + playerTimes[p.id], 0) / roster.length
    : 0;

  const sorted = [...roster].sort((a, b) => playerTimes[b.id] - playerTimes[a.id]);
  const maxTime = Math.max(1, ...sorted.map(p => playerTimes[p.id]));

  function starRating(playTime) {
    if (totalTime === 0) return 0;
    const ratio = playTime / avg;
    if (ratio >= 0.95) return 3;
    if (ratio >= 0.75) return 2;
    return 1;
  }

  const isFootball = team?.sport === 'football';

  container.innerHTML = `
    <div class="screen-header">
      <button class="btn-back" id="btn-back">‹</button>
      <h2 class="screen-title">Game Summary</h2>
    </div>
    <div class="screen-body">
      <div class="summary-meta">
        <div class="summary-team">${_esc(team?.name ?? '')}</div>
        ${game.opponent ? `<div class="summary-opp">vs ${_esc(game.opponent)}</div>` : ''}
        ${!isFootball && totalTime > 0 ? `<div class="summary-duration">${_fmt(totalTime)}</div>` : ''}
      </div>

      <div class="summary-chart">
        ${sorted.map(p => {
          const pct = (playerTimes[p.id] / maxTime) * 100;
          const stars = '★'.repeat(starRating(playerTimes[p.id])) + '☆'.repeat(3 - starRating(playerTimes[p.id]));
          return `
            <div class="summary-row">
              <div class="summary-name">${_esc(p.name)}</div>
              <div class="summary-bar-wrap">
                <div class="summary-bar-fill" style="width:${pct.toFixed(1)}%"></div>
                ${totalTime > 0 ? `<div class="summary-target" style="left:${Math.min(100,(avg/maxTime)*100).toFixed(1)}%"></div>` : ''}
              </div>
              <div class="summary-time">${isFootball ? (playerTimes[p.id] + 'P') : _fmt(playerTimes[p.id])}</div>
              <div class="summary-stars">${stars}</div>
            </div>`;
        }).join('')}
      </div>

      <button class="btn-secondary" id="btn-share">Share Summary</button>
      <button class="btn-back-home" id="btn-home">Done</button>
    </div>
  `;

  container.querySelector('#btn-back')?.addEventListener('click', () => navigate('home'));
  container.querySelector('#btn-home')?.addEventListener('click', () => navigate('home'));
  container.querySelector('#btn-share')?.addEventListener('click', async () => {
    const lines = sorted.map(p => `${p.name}: ${_fmt(playerTimes[p.id])}`);
    const text = `${team?.name ?? 'Game'} Summary\n${lines.join('\n')}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); _showToast('Copied to clipboard'); }
    } catch (e) { /* ignore */ }
  });
});

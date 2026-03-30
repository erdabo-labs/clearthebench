// =============================================================
// game.js — create-game, live game, game-summary screens
// =============================================================

let _gs = null;

// ── HELPERS ──────────────────────────────────────────────────

function _fmt(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
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
  return _audioCtx;
}

function _playAlertTone() {
  try {
    const ctx = _ensureAudioContext();
    const doPlay = () => {
      // Three ascending beeps, played twice
      const notes = [660, 880, 1100];
      const beepLen = 0.15;
      const gap = 0.1;
      for (let r = 0; r < 2; r++) {
        const offset = r * (notes.length * (beepLen + gap) + 0.15);
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freq;
          gain.gain.value = 0.7;
          const start = ctx.currentTime + offset + i * (beepLen + gap);
          osc.start(start);
          osc.stop(start + beepLen);
        });
      }
    };
    // If context is suspended, wait for resume before scheduling
    if (ctx.state === 'suspended') {
      ctx.resume().then(doPlay).catch(() => {});
    } else {
      doPlay();
    }
  } catch (e) { /* ignore */ }
}

async function _requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      _gs.wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (e) { /* ignore */ }
}

function _releaseWakeLock() {
  _gs.wakeLock?.release().catch(() => {});
  _gs.wakeLock = null;
}

function _saveCrashRecovery() {
  if (!_gs) return;
  try {
    localStorage.setItem('ctb_active_game_' + _gs.game.id, JSON.stringify({
      gameId: _gs.game.id,
      savedAt: Date.now(),
    }));
  } catch (e) { /* ignore */ }
}

function _removeCrashRecovery() {
  if (!_gs) return;
  try {
    localStorage.removeItem('ctb_active_game_' + _gs.game.id);
  } catch (e) { /* ignore */ }
}

// ── CREATE GAME SCREEN ───────────────────────────────────────

router_register('create-game', async (container, { coach, team, season }) => {
  const players = await db_getPlayers(team.id);

  let fieldSize = 4;
  let intervalMin = 3;

  function renderStepperValue(id, val) {
    const el = container.querySelector('#' + id);
    if (el) el.textContent = val;
  }

  const playerRows = players.map(p => {
    const jersey = p.jersey_number ? '#' + _esc(p.jersey_number) : '';
    return `
      <div class="attendance-row checked" data-player-id="${p.id}">
        <div class="attendance-check">&#10003;</div>
        <div class="player-info">
          <div class="player-name-text">${_esc(p.name)}</div>
          ${jersey ? '<div class="player-jersey">' + jersey + '</div>' : ''}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-back">&#8592;</div>
        </div>

        <div id="create-step-1">
          <div class="section-title">NEW GAME</div>

          <div class="pregame-section">
            <div class="pregame-label">OPPONENT (OPTIONAL)</div>
            <input class="input-field" id="opponent-input" type="text"
              placeholder="e.g. Blue Sharks" autocomplete="off" maxlength="40" />
          </div>

          <div class="pregame-section">
            <div class="pregame-label">PLAYERS ON FIELD</div>
            <div class="stepper">
              <button class="stepper-btn" id="field-minus">&minus;</button>
              <div class="stepper-value" id="field-value">${fieldSize}</div>
              <button class="stepper-btn" id="field-plus">+</button>
            </div>
          </div>

          <div class="pregame-section">
            <div class="pregame-label">ROTATION INTERVAL (MINUTES)</div>
            <div class="stepper">
              <button class="stepper-btn" id="interval-minus">&minus;</button>
              <div class="stepper-value" id="interval-value">${intervalMin}</div>
              <button class="stepper-btn" id="interval-plus">+</button>
            </div>
          </div>

          <div class="pregame-section">
            <div class="pregame-label">ATTENDANCE</div>
            <div class="attendance-list" id="attendance-list">${playerRows}</div>
          </div>

          <button class="btn-primary" id="btn-next-step">NEXT</button>
          <div id="create-game-msg" class="form-msg"></div>
        </div>

        <div id="create-step-2" style="display:none">
          <div class="section-title">STARTING LINEUP</div>
          <div class="lineup-info">Tap to move between field and bench</div>
          <div class="lineup-count" id="lineup-count"></div>
          <div class="lineup-list" id="lineup-list"></div>
          <button class="btn-primary" id="btn-start-game" disabled>START GAME</button>
          <div id="lineup-msg" class="form-msg"></div>
          <button class="btn-ghost" id="btn-back-step" style="margin-top:12px">&#8592; BACK</button>
        </div>
      </div>
    </div>
  `;

  // Back
  container.querySelector('#btn-back').addEventListener('click', () => {
    router_navigate('team', { coach, team });
  });

  // Field size stepper
  container.querySelector('#field-minus').addEventListener('click', () => {
    if (fieldSize > 3) { fieldSize--; renderStepperValue('field-value', fieldSize); }
  });
  container.querySelector('#field-plus').addEventListener('click', () => {
    if (fieldSize < 7) { fieldSize++; renderStepperValue('field-value', fieldSize); }
  });

  // Interval stepper
  container.querySelector('#interval-minus').addEventListener('click', () => {
    if (intervalMin > 1) { intervalMin--; renderStepperValue('interval-value', intervalMin); }
  });
  container.querySelector('#interval-plus').addEventListener('click', () => {
    if (intervalMin < 10) { intervalMin++; renderStepperValue('interval-value', intervalMin); }
  });

  // Attendance toggles
  container.querySelectorAll('.attendance-row').forEach(row => {
    row.addEventListener('click', () => {
      row.classList.toggle('checked');
    });
  });

  // Lineup state for step 2
  let lineupState = {};

  function renderLineup() {
    const list = container.querySelector('#lineup-list');
    const countEl = container.querySelector('#lineup-count');
    const startBtn = container.querySelector('#btn-start-game');
    const ids = Object.keys(lineupState);
    const fieldCount = ids.filter(id => lineupState[id] === 'field').length;

    countEl.textContent = fieldCount + ' / ' + fieldSize + ' on field';
    countEl.className = 'lineup-count' + (fieldCount === fieldSize ? '' : ' over');
    startBtn.disabled = fieldCount !== fieldSize;

    let html = '';
    // Show field players first, then bench
    const sorted = ids.slice().sort((a, b) => {
      if (lineupState[a] === lineupState[b]) return 0;
      return lineupState[a] === 'field' ? -1 : 1;
    });
    for (const id of sorted) {
      const p = players.find(pl => pl.id === id);
      if (!p) continue;
      const isField = lineupState[id] === 'field';
      const jersey = p.jersey_number ? '#' + _esc(p.jersey_number) : '';
      html += `
        <div class="lineup-row ${isField ? 'field' : 'bench'}" data-player-id="${id}">
          <div class="player-info">
            <div class="player-name-text">${_esc(p.name)}</div>
            ${jersey ? '<div class="player-jersey">' + jersey + '</div>' : ''}
          </div>
          <div class="lineup-badge">${isField ? 'FIELD' : 'BENCH'}</div>
        </div>
      `;
    }
    list.innerHTML = html;

    list.querySelectorAll('.lineup-row').forEach(row => {
      row.addEventListener('click', () => {
        const pid = row.dataset.playerId;
        if (lineupState[pid] === 'field') {
          lineupState[pid] = 'bench';
        } else if (ids.filter(id => lineupState[id] === 'field').length < fieldSize) {
          lineupState[pid] = 'field';
        }
        renderLineup();
      });
    });
  }

  // Next button -> show lineup picker
  const msgEl = container.querySelector('#create-game-msg');
  container.querySelector('#btn-next-step').addEventListener('click', () => {
    const checked = container.querySelectorAll('.attendance-row.checked');
    const playerIds = Array.from(checked).map(r => r.dataset.playerId);

    if (playerIds.length < fieldSize + 1) {
      msgEl.textContent = 'Need at least ' + (fieldSize + 1) + ' players (field + 1 on bench).';
      msgEl.className = 'form-msg error';
      return;
    }

    lineupState = {};
    playerIds.forEach((id, i) => {
      lineupState[id] = i < fieldSize ? 'field' : 'bench';
    });

    container.querySelector('#create-step-1').style.display = 'none';
    container.querySelector('#create-step-2').style.display = '';
    renderLineup();
  });

  // Back button in step 2
  container.querySelector('#btn-back-step').addEventListener('click', () => {
    container.querySelector('#create-step-2').style.display = 'none';
    container.querySelector('#create-step-1').style.display = '';
  });

  // Start game from step 2
  container.querySelector('#btn-start-game').addEventListener('click', async () => {
    const allPlayerIds = Object.keys(lineupState);
    const fieldCount = allPlayerIds.filter(id => lineupState[id] === 'field').length;
    if (fieldCount !== fieldSize) return;

    const opponent = container.querySelector('#opponent-input').value.trim();
    const btn = container.querySelector('#btn-start-game');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    const game = await db_createGame({
      seasonId: season.id,
      opponent,
      mode: 'timer_swap',
      fieldSize,
      strategySnapshot: { mode: 'timer_swap', config: { intervalMinutes: intervalMin } },
      playerIds: allPlayerIds,
    });

    if (!game) {
      btn.disabled = false;
      btn.textContent = 'START GAME';
      const lmsg = container.querySelector('#lineup-msg');
      if (lmsg) { lmsg.textContent = 'Something went wrong. Try again.'; lmsg.className = 'form-msg error'; }
      return;
    }

    const fieldPlayerIds = allPlayerIds.filter(id => lineupState[id] === 'field');
    for (const pid of fieldPlayerIds) {
      await db_insertEvent({
        gameId: game.id,
        playerId: pid,
        eventType: 'sub_on',
        timestamp: 0,
      });
    }

    router_navigate('game', { gameId: game.id, coach, team, season });
  });
});

// ── LIVE GAME SCREEN ─────────────────────────────────────────

router_register('game', async (container, params) => {
  // Clean up previous game state
  if (_gs) {
    clearInterval(_gs.timerInterval);
    if (_gs.visibilityHandler) {
      document.removeEventListener('visibilitychange', _gs.visibilityHandler);
    }
    _releaseWakeLock();
    _gs = null;
  }

  // Loading state
  container.innerHTML = `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
        </div>
        <div class="loading-msg">Loading game...</div>
      </div>
    </div>
  `;

  // Load game data
  const game = await db_getGame(params.gameId);
  if (!game) {
    container.innerHTML = '<div class="screen"><div class="screen-body"><div class="loading-msg">Game not found.</div></div></div>';
    return;
  }

  const team = params.team || game.ctb_seasons?.ctb_teams;
  const season = params.season || game.ctb_seasons;
  const coach = params.coach || null;

  const roster = await db_getGameRoster(game.id);
  const events = await db_getGameEvents(game.id);

  const fieldSize = game.field_size || 4;
  const intervalMinutes = game.strategy_snapshot?.config?.intervalMinutes || 3;
  const alertInterval = intervalMinutes * 60;

  // Initialize state
  _gs = {
    game, team, coach, season, roster,
    fieldSize,
    players: {},
    timerRunning: false,
    timerSeconds: 0,
    timerInterval: null,
    pendingBenchPlayer: null,
    lastSwap: null,
    container,
    alertInterval,
    proposedSwaps: null,
    wakeLock: null,
    lastAlertAt: 0,
    earlyAlertFired: false,
    fullAlertFired: false,
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
      benchSince: 0,
      totalBenchTime: 0,
    };
  }

  // Replay events to reconstruct state
  let lastGameStartCreatedAt = null;
  let timerIsRunning = false;
  let timerValue = 0;

  for (const evt of events) {
    const ts = evt.timestamp || 0;
    timerValue = ts;

    if (evt.event_type === 'game_start') {
      timerIsRunning = true;
      lastGameStartCreatedAt = evt.created_at;
    } else if (evt.event_type === 'game_pause') {
      timerIsRunning = false;
    } else if (evt.event_type === 'game_end') {
      timerIsRunning = false;
    } else if (evt.event_type === 'sub_on' && evt.player_id && _gs.players[evt.player_id]) {
      const ps = _gs.players[evt.player_id];
      if (!ps.onField) {
        // accumulate bench time before going on field
        ps.totalBenchTime += Math.max(0, ts - ps.benchSince);
      }
      ps.onField = true;
      ps.fieldEnteredAt = ts;
    } else if (evt.event_type === 'sub_off' && evt.player_id && _gs.players[evt.player_id]) {
      const ps = _gs.players[evt.player_id];
      if (ps.onField && ps.fieldEnteredAt !== null) {
        ps.totalOnTime += Math.max(0, ts - ps.fieldEnteredAt);
      }
      ps.onField = false;
      ps.fieldEnteredAt = null;
      ps.benchSince = ts;
    }
  }

  // If timer was running, add elapsed wall time since last game_start
  if (timerIsRunning && lastGameStartCreatedAt) {
    const wallElapsed = Math.floor((Date.now() - new Date(lastGameStartCreatedAt).getTime()) / 1000);
    const lastTs = timerValue;
    // The event timestamp was the timer value at game_start. Wall clock elapsed since then gives current timer.
    // Find the game_start event timestamp
    let startEventTs = 0;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].event_type === 'game_start') {
        startEventTs = events[i].timestamp || 0;
        break;
      }
    }
    timerValue = startEventTs + wallElapsed;
  }

  _gs.timerSeconds = timerValue;
  _gs.timerRunning = timerIsRunning;

  // Update current stints and bench times based on current timer
  for (const ps of Object.values(_gs.players)) {
    if (ps.onField && ps.fieldEnteredAt !== null) {
      ps.currentStint = _gs.timerSeconds - ps.fieldEnteredAt;
    } else {
      ps.totalBenchTime = _gs.players[ps.id].totalBenchTime; // already accumulated
      // Add current bench wait
    }
  }

  // Calculate lastAlertAt from timer seconds
  if (_gs.timerSeconds > 0 && alertInterval > 0) {
    _gs.lastAlertAt = Math.floor(_gs.timerSeconds / alertInterval) * alertInterval;
  }

  // Render game screen
  _renderGameScreen();

  // If timer was running, resume the interval
  if (_gs.timerRunning) {
    _startTimerInterval();
    _requestWakeLock();
  }

  _saveCrashRecovery();
});

function _renderGameScreen() {
  const c = _gs.container;

  c.innerHTML = `
    <div class="screen">
      <div class="screen-body">
        <div class="game-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-end-game">END</div>
        </div>
        <div class="game-timer-bar">
          <div class="timer-dot${_gs.timerRunning ? '' : ' stopped'}" id="timer-dot"></div>
          <div class="game-clock${_gs.timerRunning ? '' : ' paused'}" id="game-clock">${_fmt(_gs.timerSeconds)}</div>
          <div class="game-controls">
            <button class="btn-ghost" id="btn-start-pause">${_gs.timerRunning ? 'PAUSE' : 'START'}</button>
          </div>
        </div>
        <div class="rotation-countdown" id="rotation-countdown"></div>
        <button class="btn-rotate" id="btn-rotate">ROTATE</button>
        <div class="field-zone" id="field-zone"></div>
        <div class="bench-zone" id="bench-zone"></div>
        <div class="team-stats" id="team-stats"></div>
      </div>
      <div class="swap-preview-overlay" id="swap-preview" style="display:none">
        <div class="swap-preview-sheet">
          <div class="preview-title">PROPOSED ROTATION</div>
          <div class="preview-countdown" id="preview-countdown"></div>
          <div class="preview-pairs" id="preview-pairs"></div>
          <button class="btn-primary" id="btn-confirm-rotate">ROTATE NOW</button>
          <button class="btn-ghost" id="btn-cancel-rotate" style="margin-top:8px">Cancel</button>
        </div>
      </div>
    </div>
  `;

  _renderFieldZone();
  _renderBenchZone();
  _renderTeamStats();
  _bindGameControls();
  _updateCountdown();
}

function _getFieldPlayers() {
  return Object.values(_gs.players)
    .filter(p => p.onField)
    .sort((a, b) => _getPlayedTime(b) - _getPlayedTime(a));
}

function _getBenchPlayers() {
  return Object.values(_gs.players)
    .filter(p => !p.onField)
    .sort((a, b) => _getBenchWait(b) - _getBenchWait(a));
}

// Get cumulative bench time including current bench stint
function _getBenchWait(ps) {
  if (ps.onField) return ps.totalBenchTime;
  return ps.totalBenchTime + (_gs.timerSeconds - ps.benchSince);
}

// Get cumulative played time including current field stint
function _getPlayedTime(ps) {
  if (!ps.onField) return ps.totalOnTime;
  return ps.totalOnTime + ps.currentStint;
}

function _renderFieldZone() {
  const zone = _gs.container.querySelector('#field-zone');
  if (!zone) return;

  const fieldPlayers = _getFieldPlayers();
  const count = fieldPlayers.length;

  let html = '<div class="zone-title">ON FIELD (' + count + '/' + _gs.fieldSize + ')</div>';
  for (const ps of fieldPlayers) {
    html += `
      <div class="player-chip" data-player-id="${ps.id}">
        <span>${_esc(ps.name)}</span>
        <span class="chip-time">${_fmt(ps.currentStint)}</span>
      </div>
    `;
  }
  zone.innerHTML = html;

  // Bind field player clicks (for individual swap)
  zone.querySelectorAll('.player-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      _handleFieldPlayerTap(chip.dataset.playerId);
    });
  });
}

function _renderBenchZone() {
  const zone = _gs.container.querySelector('#bench-zone');
  if (!zone) return;

  const benchPlayers = Object.values(_gs.players)
    .filter(p => !p.onField)
    .sort((a, b) => _getBenchWait(b) - _getBenchWait(a));
  const count = benchPlayers.length;

  let html = '<div class="zone-title">BENCH (' + count + ')</div>';
  for (const ps of benchPlayers) {
    const currentWait = _gs.timerSeconds - ps.benchSince;
    const isSelected = _gs.pendingBenchPlayer === ps.id;
    html += `
      <div class="bench-player${isSelected ? ' selected' : ''}" data-player-id="${ps.id}">
        <span class="bench-name">${_esc(ps.name)}</span>
        <span class="bench-wait">${_fmt(currentWait)}</span>
      </div>
    `;
  }
  zone.innerHTML = html;

  // Bind bench player clicks
  zone.querySelectorAll('.bench-player').forEach(row => {
    row.addEventListener('click', () => {
      _handleBenchPlayerTap(row.dataset.playerId);
    });
  });
}

function _renderTeamStats() {
  const zone = _gs.container.querySelector('#team-stats');
  if (!zone) return;

  const allPlayers = Object.values(_gs.players)
    .sort((a, b) => _getPlayedTime(b) - _getPlayedTime(a));

  let html = '<div class="zone-title">PLAYER STATS</div>';
  html += '<div class="stats-header"><span class="stats-name-header">Player</span><span class="stats-col-header">Played</span><span class="stats-col-header">Benched</span></div>';
  for (const ps of allPlayers) {
    const played = _getPlayedTime(ps);
    const benched = _getBenchWait(ps);
    html += `
      <div class="stats-row" data-player-id="${ps.id}">
        <span class="stats-name">${_esc(ps.name)}</span>
        <span class="stats-played">${_fmt(played)}</span>
        <span class="stats-benched">${_fmt(benched)}</span>
      </div>
    `;
  }
  zone.innerHTML = html;
}

function _bindGameControls() {
  const c = _gs.container;

  // Start/Pause
  c.querySelector('#btn-start-pause')?.addEventListener('click', _handleStartPause);

  // End game
  c.querySelector('#btn-end-game')?.addEventListener('click', _handleEndGame);

  // Rotate button
  c.querySelector('#btn-rotate')?.addEventListener('click', () => _showSwapPreview(false));

  // Confirm rotation
  c.querySelector('#btn-confirm-rotate')?.addEventListener('click', _handleConfirmRotation);

  // Cancel rotation
  c.querySelector('#btn-cancel-rotate')?.addEventListener('click', _hideSwapPreview);
}

async function _handleStartPause() {
  if (_gs.timerRunning) {
    // Pause — sync from wall clock one last time
    if (_gs.wallAnchor) {
      _gs.timerSeconds = _gs.timerAnchor + Math.floor((Date.now() - _gs.wallAnchor) / 1000);
    }
    await db_insertEvent({
      gameId: _gs.game.id,
      playerId: null,
      eventType: 'game_pause',
      timestamp: _gs.timerSeconds,
    });
    _gs.timerRunning = false;
    clearInterval(_gs.timerInterval);
    _gs.timerInterval = null;
    _gs.wallAnchor = null;
    _gs.timerAnchor = null;
    _releaseWakeLock();
    _updateClockDisplay();
    _saveCrashRecovery();
  } else {
    // Unlock audio on user gesture (iOS requires this)
    _ensureAudioContext();
    // Start
    await db_insertEvent({
      gameId: _gs.game.id,
      playerId: null,
      eventType: 'game_start',
      timestamp: _gs.timerSeconds,
    });
    _gs.timerRunning = true;
    _startTimerInterval();
    _requestWakeLock();
    _updateClockDisplay();
    _saveCrashRecovery();
  }

  // Update button text
  const btn = _gs.container.querySelector('#btn-start-pause');
  if (btn) btn.textContent = _gs.timerRunning ? 'PAUSE' : 'START';
}

function _startTimerInterval() {
  if (_gs.timerInterval) clearInterval(_gs.timerInterval);

  // Wall-clock anchoring: remember when we started and what the timer read
  _gs.wallAnchor = Date.now();
  _gs.timerAnchor = _gs.timerSeconds;

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
}

function _updateClockDisplay() {
  const clock = _gs.container.querySelector('#game-clock');
  const dot = _gs.container.querySelector('#timer-dot');
  if (clock) {
    clock.textContent = _fmt(_gs.timerSeconds);
    if (_gs.timerRunning) {
      clock.classList.remove('paused');
    } else {
      clock.classList.add('paused');
    }
  }
  if (dot) {
    if (_gs.timerRunning) {
      dot.classList.remove('stopped');
    } else {
      dot.classList.add('stopped');
    }
  }
}

function _updatePlayerTimes() {
  // Update field player stint times
  const fieldZone = _gs.container.querySelector('#field-zone');
  if (fieldZone) {
    fieldZone.querySelectorAll('.player-chip').forEach(chip => {
      const ps = _gs.players[chip.dataset.playerId];
      if (ps) {
        const timeEl = chip.querySelector('.chip-time');
        if (timeEl) timeEl.textContent = _fmt(ps.currentStint);
      }
    });
  }

  // Update bench player wait times (current stint only)
  const benchZone = _gs.container.querySelector('#bench-zone');
  if (benchZone) {
    benchZone.querySelectorAll('.bench-player').forEach(row => {
      const ps = _gs.players[row.dataset.playerId];
      if (ps) {
        const waitEl = row.querySelector('.bench-wait');
        if (waitEl) waitEl.textContent = _fmt(_gs.timerSeconds - ps.benchSince);
      }
    });
  }

  // Update team stats
  const statsZone = _gs.container.querySelector('#team-stats');
  if (statsZone) {
    statsZone.querySelectorAll('.stats-row').forEach(row => {
      const ps = _gs.players[row.dataset.playerId];
      if (ps) {
        const playedEl = row.querySelector('.stats-played');
        if (playedEl) playedEl.textContent = _fmt(_getPlayedTime(ps));
        const benchedEl = row.querySelector('.stats-benched');
        if (benchedEl) benchedEl.textContent = _fmt(_getBenchWait(ps));
      }
    });
  }

  // Update rotation countdown
  _updateCountdown();

  // Update swap preview if it's open (live timing)
  _updatePreviewTimes();
}

function _updateCountdown() {
  const el = _gs.container.querySelector('#rotation-countdown');
  if (!el) return;

  if (!_gs.timerRunning || _gs.alertInterval <= 0) {
    el.textContent = '';
    return;
  }

  const benchCount = Object.values(_gs.players).filter(p => !p.onField).length;
  if (benchCount === 0) {
    el.textContent = '';
    return;
  }

  const elapsed = _gs.timerSeconds - _gs.lastAlertAt;
  const remaining = _gs.alertInterval - elapsed;
  if (remaining > 0) {
    el.textContent = 'Next rotation in ' + _fmt(remaining);
    el.classList.remove('overdue');
  } else {
    el.textContent = 'OVERDUE +' + _fmt(Math.abs(remaining));
    el.classList.add('overdue');
  }
}

function _updatePreviewTimes() {
  const overlay = _gs.container.querySelector('#swap-preview');
  if (!overlay || overlay.style.display === 'none') return;
  if (!_gs.proposedSwaps) return;

  // Update countdown inside the preview
  const cdEl = _gs.container.querySelector('#preview-countdown');
  if (cdEl && _gs.alertInterval > 0) {
    const elapsed = _gs.timerSeconds - _gs.lastAlertAt;
    const remaining = _gs.alertInterval - elapsed;
    if (remaining > 0) {
      cdEl.textContent = 'Rotation in ' + _fmt(remaining);
      cdEl.className = 'preview-countdown';
    } else {
      cdEl.textContent = 'OVERDUE +' + _fmt(Math.abs(remaining));
      cdEl.className = 'preview-countdown overdue';
    }
  }

  // Update all player times in preview
  const pairsEl = _gs.container.querySelector('#preview-pairs');
  if (!pairsEl) return;

  pairsEl.querySelectorAll('.preview-player-row').forEach(el => {
    const pid = el.dataset.playerId || el.dataset.stayingId;
    const ps = pid ? _gs.players[pid] : null;
    if (!ps) return;
    const timeEl = el.querySelector('.preview-time');
    if (timeEl) timeEl.textContent = _fmt(_getPlayedTime(ps)) + ' played';
  });
}

function _checkRotationAlert() {
  if (!_gs.timerRunning) return;
  if (_gs.alertInterval <= 0) return;

  const benchCount = Object.values(_gs.players).filter(p => !p.onField).length;
  if (benchCount === 0) return;

  const nextAlertAt = _gs.lastAlertAt + _gs.alertInterval;
  const earlyWarning = 15; // seconds before interval to show preview

  // Early warning: show preview 15s before rotation time (if not already showing)
  if (!_gs.earlyAlertFired && _gs.timerSeconds >= nextAlertAt - earlyWarning && _gs.timerSeconds < nextAlertAt) {
    _gs.earlyAlertFired = true;
    _showSwapPreview(true);
  }

  // Full alert: at or past the interval — fire once, don't auto-advance lastAlertAt.
  // lastAlertAt only resets when the coach actually performs a rotation.
  // This keeps the OVERDUE counter ticking until the sub happens.
  if (!_gs.fullAlertFired && _gs.timerSeconds >= nextAlertAt) {
    _gs.fullAlertFired = true;
    const overlay = _gs.container.querySelector('#swap-preview');
    if (overlay && overlay.style.display === 'none') {
      _showSwapPreview(true);
    } else {
      // Preview already open from early warning — just re-alert
      _playAlertTone();
      try { navigator.vibrate([200, 100, 200, 100, 200]); } catch (e) { /* ignore */ }
    }
  }
}

function _handleBenchPlayerTap(playerId) {
  if (_gs.pendingBenchPlayer === playerId) {
    // Deselect
    _gs.pendingBenchPlayer = null;
  } else {
    _gs.pendingBenchPlayer = playerId;
  }
  _renderBenchZone();
}

async function _handleFieldPlayerTap(fieldPlayerId) {
  if (!_gs.pendingBenchPlayer) return;

  const benchId = _gs.pendingBenchPlayer;
  const benchPs = _gs.players[benchId];
  const fieldPs = _gs.players[fieldPlayerId];
  if (!benchPs || !fieldPs) return;

  const ts = _gs.timerSeconds;

  // Insert events
  await db_insertEvent({ gameId: _gs.game.id, playerId: fieldPlayerId, eventType: 'sub_off', timestamp: ts });
  await db_insertEvent({ gameId: _gs.game.id, playerId: benchId, eventType: 'sub_on', timestamp: ts });

  // Update field player -> bench
  fieldPs.totalOnTime += Math.max(0, ts - (fieldPs.fieldEnteredAt || 0));
  fieldPs.onField = false;
  fieldPs.fieldEnteredAt = null;
  fieldPs.currentStint = 0;
  fieldPs.benchSince = ts;

  // Update bench player -> field
  benchPs.totalBenchTime += Math.max(0, ts - benchPs.benchSince);
  benchPs.onField = true;
  benchPs.fieldEnteredAt = ts;
  benchPs.currentStint = 0;

  // Store for undo
  _gs.lastSwap = {
    type: 'individual',
    count: 2,
    pairs: [{ benchId, fieldId: fieldPlayerId }],
  };
  _gs.pendingBenchPlayer = null;

  // Reset countdown so next rotation gets full interval
  _gs.lastAlertAt = ts;
  _gs.earlyAlertFired = false;
  _gs.fullAlertFired = false;

  _renderFieldZone();
  _renderBenchZone();
  _renderTeamStats();
  _saveCrashRecovery();

  _showUndoToast('Swapped ' + benchPs.name + ' \u2192 ' + fieldPs.name, _handleUndo);
}

function _calculateProposedSwaps() {
  // Equity-based ordering:
  // Field sorted most-played first → they come out first
  // Bench sorted least-played first → they go in first (need the most time)
  const field = Object.values(_gs.players)
    .filter(p => p.onField)
    .sort((a, b) => _getPlayedTime(b) - _getPlayedTime(a));

  const bench = Object.values(_gs.players)
    .filter(p => !p.onField)
    .sort((a, b) => _getPlayedTime(a) - _getPlayedTime(b));

  // Always swap min(bench, field) — everyone on bench should get a turn.
  // The equity is in the ORDER, not in whether to swap.
  const swapCount = Math.min(bench.length, field.length);
  const pairs = [];
  for (let i = 0; i < swapCount; i++) {
    pairs.push({ out: field[i], in: bench[i] });
  }

  // Unmatched extras on whichever side has more
  const stayingField = field.slice(swapCount);
  const stayingBench = bench.slice(swapCount);

  return { pairs, stayingField, stayingBench };
}

function _showSwapPreview(isAlert) {
  // Use existing edited swaps if available (from staying player trades), otherwise calculate fresh
  const result = (!isAlert && _gs.proposedSwaps) ? _gs.proposedSwaps : _calculateProposedSwaps();
  if (result.pairs.length === 0) {
    _showToast('No bench players to rotate');
    return;
  }

  _gs.proposedSwaps = result;

  const pairsEl = _gs.container.querySelector('#preview-pairs');
  let html = '';

  // ── COMING OUT section ──
  html += '<div class="preview-section-title out-title">COMING OUT</div>';
  for (let i = 0; i < result.pairs.length; i++) {
    const p = result.pairs[i];
    html += `
      <div class="preview-player-row out" data-swap-idx="${i}" data-side="out" data-player-id="${p.out.id}">
        <span class="preview-name">${_esc(p.out.name)}</span>
        <span class="preview-time">${_fmt(_getPlayedTime(p.out))} played</span>
      </div>
    `;
  }

  // Staying on field (if field has more than bench)
  if (result.stayingField.length > 0) {
    html += '<div class="preview-staying-title">STAYING ON FIELD</div>';
    for (const ps of result.stayingField) {
      html += `
        <div class="preview-player-row staying" data-staying-id="${ps.id}" data-staying-side="field">
          <span class="preview-name">${_esc(ps.name)}</span>
          <span class="preview-time">${_fmt(_getPlayedTime(ps))} played</span>
        </div>
      `;
    }
  }

  // ── COMING IN section ──
  html += '<div class="preview-section-title in-title">COMING IN</div>';
  for (let i = 0; i < result.pairs.length; i++) {
    const p = result.pairs[i];
    html += `
      <div class="preview-player-row in" data-swap-idx="${i}" data-side="in" data-player-id="${p.in.id}">
        <span class="preview-name">${_esc(p.in.name)}</span>
        <span class="preview-time">${_fmt(_getPlayedTime(p.in))} played</span>
      </div>
    `;
  }

  // Staying on bench (if bench has more than field)
  if (result.stayingBench.length > 0) {
    html += '<div class="preview-staying-title">STAYING ON BENCH</div>';
    for (const ps of result.stayingBench) {
      html += `
        <div class="preview-player-row staying" data-staying-id="${ps.id}" data-staying-side="bench">
          <span class="preview-name">${_esc(ps.name)}</span>
          <span class="preview-time">${_fmt(_getPlayedTime(ps))} played</span>
        </div>
      `;
    }
  }

  pairsEl.innerHTML = html;

  // ── Staying ↔ swapping trade interaction ──
  // Tap a staying player to select, then tap a swapping player on the same
  // side (out=field, in=bench) to trade who participates in the rotation.
  _gs.pendingStaying = null;

  pairsEl.querySelectorAll('.preview-player-row.staying').forEach(el => {
    el.addEventListener('click', () => {
      pairsEl.querySelectorAll('.preview-player-row').forEach(s => s.classList.remove('selected'));
      if (_gs.pendingStaying === el.dataset.stayingId) {
        _gs.pendingStaying = null;
      } else {
        _gs.pendingStaying = el.dataset.stayingId;
        el.classList.add('selected');
      }
    });
  });

  pairsEl.querySelectorAll('.preview-player-row.out, .preview-player-row.in').forEach(el => {
    el.addEventListener('click', () => {
      if (!_gs.pendingStaying) return;
      const stayingPs = _gs.players[_gs.pendingStaying];
      if (!stayingPs) return;
      const idx = parseInt(el.dataset.swapIdx);
      const pair = _gs.proposedSwaps.pairs[idx];
      if (!pair) return;

      const stayingSide = stayingPs.onField ? 'field' : 'bench';
      const clickedSide = el.dataset.side; // "out" or "in"

      // Only allow trade within the same side: field-staying ↔ out, bench-staying ↔ in
      if ((stayingSide === 'field' && clickedSide === 'out') ||
          (stayingSide === 'bench' && clickedSide === 'in')) {
        if (stayingSide === 'field') {
          const oldOut = pair.out;
          _gs.proposedSwaps.stayingField = _gs.proposedSwaps.stayingField.filter(p => p.id !== stayingPs.id);
          _gs.proposedSwaps.stayingField.push(oldOut);
          pair.out = stayingPs;
        } else {
          const oldIn = pair.in;
          _gs.proposedSwaps.stayingBench = _gs.proposedSwaps.stayingBench.filter(p => p.id !== stayingPs.id);
          _gs.proposedSwaps.stayingBench.push(oldIn);
          pair.in = stayingPs;
        }
        _gs.pendingStaying = null;
        _showSwapPreview(false);
      }
    });
  });

  const overlay = _gs.container.querySelector('#swap-preview');
  if (overlay) overlay.style.display = '';

  if (isAlert) {
    try { navigator.vibrate([200, 100, 200, 100, 200]); } catch (e) { /* ignore */ }
    _playAlertTone();
    // Flash the screen border for visibility
    const screen = _gs.container.querySelector('.screen');
    if (screen) {
      screen.classList.add('alert-flash');
      setTimeout(() => screen.classList.remove('alert-flash'), 2000);
    }
  }
}

function _hideSwapPreview() {
  _gs.proposedSwaps = null;
  _gs.pendingStaying = null;
  // Don't reset alert flags on cancel — they'll re-trigger if still overdue
  const overlay = _gs.container.querySelector('#swap-preview');
  if (overlay) overlay.style.display = 'none';
}

async function _handleConfirmRotation() {
  // Use the (possibly user-edited) proposed swaps, or recalculate if missing
  const result = _gs.proposedSwaps || _calculateProposedSwaps();
  const pairs = result.pairs || result;
  if (pairs.length === 0) return;

  _hideSwapPreview();

  const ts = _gs.timerSeconds;
  const swapPairs = [];

  for (const pair of pairs) {
    await db_insertEvent({ gameId: _gs.game.id, playerId: pair.out.id, eventType: 'sub_off', timestamp: ts });
    await db_insertEvent({ gameId: _gs.game.id, playerId: pair.in.id, eventType: 'sub_on', timestamp: ts });

    pair.out.totalOnTime += Math.max(0, ts - (pair.out.fieldEnteredAt || 0));
    pair.out.onField = false;
    pair.out.fieldEnteredAt = null;
    pair.out.currentStint = 0;
    pair.out.benchSince = ts;

    pair.in.totalBenchTime += Math.max(0, ts - pair.in.benchSince);
    pair.in.onField = true;
    pair.in.fieldEnteredAt = ts;
    pair.in.currentStint = 0;

    swapPairs.push({ benchId: pair.in.id, fieldId: pair.out.id });
  }

  _gs.lastSwap = { type: 'swap_all', count: pairs.length * 2, pairs: swapPairs };

  // Reset countdown so next rotation gets full interval from now
  _gs.lastAlertAt = ts;
  _gs.earlyAlertFired = false;
  _gs.fullAlertFired = false;

  _renderFieldZone();
  _renderBenchZone();
  _renderTeamStats();
  _saveCrashRecovery();

  _showUndoToast('Rotated ' + pairs.length + ' players', _handleUndo);
}

async function _handleUndo() {
  if (!_gs.lastSwap) return;

  const count = _gs.lastSwap.count;
  const ok = await db_deleteRecentEvents(_gs.game.id, count);
  if (!ok) {
    _showToast('Undo failed');
    return;
  }

  _gs.lastSwap = null;

  // Re-initialize from events (simplest correct approach)
  const gameId = _gs.game.id;
  const coach = _gs.coach;
  const team = _gs.team;
  const season = _gs.season;
  clearInterval(_gs.timerInterval);
  _releaseWakeLock();

  router_navigate('game', { gameId, coach, team, season });
  _showToast('Swap undone');
}

async function _handleEndGame() {
  if (!confirm('End this game?')) return;

  if (_gs.timerRunning) {
    await db_insertEvent({
      gameId: _gs.game.id,
      playerId: null,
      eventType: 'game_pause',
      timestamp: _gs.timerSeconds,
    });
    _gs.timerRunning = false;
    clearInterval(_gs.timerInterval);
    _gs.timerInterval = null;
  }

  await db_insertEvent({
    gameId: _gs.game.id,
    playerId: null,
    eventType: 'game_end',
    timestamp: _gs.timerSeconds,
  });

  _releaseWakeLock();
  _removeCrashRecovery();

  router_navigate('game-summary', {
    gameId: _gs.game.id,
    coach: _gs.coach,
    team: _gs.team,
    season: _gs.season,
  });
}

// ── GAME SUMMARY SCREEN ──────────────────────────────────────

router_register('game-summary', async (container, { gameId, coach, team, season }) => {
  container.innerHTML = `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
        </div>
        <div class="loading-msg">Loading summary...</div>
      </div>
    </div>
  `;

  const game = await db_getGame(gameId);
  const summary = await db_getGameSummary(gameId);
  if (!summary) {
    container.innerHTML = '<div class="screen"><div class="screen-body"><div class="loading-msg">Could not load summary.</div></div></div>';
    return;
  }

  const opponent = game?.opponent || '';
  const maxTime = summary.players.length > 0
    ? Math.max(...summary.players.map(p => p.totalOnTime), 1)
    : 1;

  // Equity stars based on standard deviation
  const times = summary.players.map(p => p.totalOnTime);
  let stars = 5;
  if (times.length > 1) {
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const variance = times.reduce((a, t) => a + (t - mean) ** 2, 0) / times.length;
    const stdDev = Math.sqrt(variance);
    // Map std dev: 0 = 5 stars, 120s+ = 1 star
    if (stdDev === 0) {
      stars = 5;
    } else {
      stars = Math.max(1, Math.min(5, Math.round(5 - (stdDev / 30))));
    }
  }

  const starsHtml = Array.from({ length: 5 }, (_, i) =>
    i < stars
      ? '<span class="star-filled">&#9733;</span>'
      : '<span class="star-empty">&#9733;</span>'
  ).join('');

  const playerRows = summary.players.map(p => {
    const pct = Math.round((p.totalOnTime / maxTime) * 100);
    return `
      <div class="summary-row">
        <div class="summary-player-name">${_esc(p.player.name)}</div>
        <div class="summary-bar">
          <div class="summary-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="summary-player-time">${_fmt(p.totalOnTime)}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
        </div>

        <div class="summary-header">
          <div class="summary-title">GAME SUMMARY</div>
          ${opponent ? '<div class="summary-sub">vs ' + _esc(opponent) + '</div>' : ''}
          <div class="summary-sub">Total: ${_fmt(summary.gameDuration)}</div>
        </div>

        <div class="equity-stars">${starsHtml}</div>

        <div class="summary-list">${playerRows}</div>

        <button class="share-btn" id="btn-share">Share Summary</button>
        <div class="home-actions">
          <button class="btn-primary" id="btn-done">Done</button>
        </div>
      </div>
    </div>
  `;

  // Share
  container.querySelector('#btn-share')?.addEventListener('click', async () => {
    const lines = ['ClearTheBench Game Summary'];
    if (opponent) lines.push('vs ' + opponent);
    lines.push('Duration: ' + _fmt(summary.gameDuration));
    lines.push('');
    for (const p of summary.players) {
      lines.push(p.player.name + ': ' + _fmt(p.totalOnTime));
    }
    const text = lines.join('\n');

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Game Summary', text });
      } catch (e) { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(text);
        _showToast('Copied to clipboard');
      } catch (e) {
        _showToast('Could not copy');
      }
    }
  });

  // Done
  container.querySelector('#btn-done')?.addEventListener('click', () => {
    router_navigate('home', { coach });
  });
});

// game.js — create game, live game, spectator view

// ── CREATE GAME ───────────────────────────────────────────────

router_register('create-game', async (container, params) => {
  const { coach, team, season } = params;
  const sport = team.sport || 'generic';
  const defaultFieldSize = sport === 'football' ? 7 : 5;

  container.innerHTML = _createGameHTML(team, sport, defaultFieldSize);
  _bindCreateGame(container, params, sport, defaultFieldSize);
});

function _createGameHTML(team, sport, defaultFieldSize) {
  const sportEmoji = sport === 'soccer' ? '⚽' : sport === 'football' ? '🏈' : '🏅';
  const sportLabel = sport === 'soccer' ? 'Rec Soccer' : sport === 'football' ? 'Flag Football' : 'Generic';

  return `
    <div class="screen">
      <div class="screen-body">

        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-back">←</div>
        </div>

        <div class="create-body">
          <div class="section-title" style="padding:0; margin-bottom:16px;">NEW GAME</div>

          <!-- Sport (read-only) -->
          <div class="input-label" style="margin-bottom:8px;">Sport (inherited from team)</div>
          <div style="margin-bottom:16px;">
            <div class="sport-pill active" style="display:inline-flex; align-items:center;
              gap:6px; padding:8px 14px; cursor:default; pointer-events:none;">
              <span class="sport-emoji" style="font-size:18px; margin-bottom:0;">${sportEmoji}</span>
              <span class="sport-name">${_esc(sportLabel)}</span>
            </div>
          </div>

          <!-- Opponent -->
          <div class="input-group" style="margin-bottom:16px;">
            <label class="input-label" for="opponent-input">Opponent (optional)</label>
            <input class="input-field" id="opponent-input" type="text"
              placeholder="e.g. Blue Hawks" autocomplete="off" />
          </div>

          <!-- Field size stepper -->
          <div class="input-label" style="margin-bottom:8px;">Players on Field</div>
          <div class="players-row" style="margin-bottom:20px;">
            <div class="players-label">Players on Field</div>
            <div class="stepper">
              <button class="stepper-btn" id="btn-field-minus">−</button>
              <div class="stepper-val" id="field-size-val">${defaultFieldSize}</div>
              <button class="stepper-btn" id="btn-field-plus">+</button>
            </div>
          </div>

          <div class="divider"></div>

          <!-- Attendance -->
          <div class="section-title" style="padding:0; margin-bottom:10px;">ATTENDANCE</div>
          <div id="attendance-list">
            <div style="padding: 24px 0; text-align: center; color: var(--muted);
              font-family: 'JetBrains Mono', monospace; font-size: 12px;">Loading roster...</div>
          </div>

          <div style="margin-top:20px;">
            <button class="btn-primary" id="btn-start-game"
              disabled style="opacity:0.4;">START GAME</button>
            <div id="create-game-msg"
              style="color:var(--red); font-size:13px; min-height:20px; margin-top:8px;"></div>
          </div>

          <div style="height:40px;"></div>
        </div>

      </div>
    </div>
  `;
}

function _bindCreateGame(container, params, sport, defaultFieldSize) {
  const { coach, team, season } = params;

  // Back
  container.querySelector('#btn-back')?.addEventListener('click', () => {
    router_navigate('team', { coach, team, season });
  });

  // Field size stepper
  let fieldSize = defaultFieldSize;
  const fieldSizeVal = container.querySelector('#field-size-val');

  container.querySelector('#btn-field-minus')?.addEventListener('click', () => {
    if (fieldSize > 1) {
      fieldSize--;
      fieldSizeVal.textContent = fieldSize;
    }
  });

  container.querySelector('#btn-field-plus')?.addEventListener('click', () => {
    if (fieldSize < 15) {
      fieldSize++;
      fieldSizeVal.textContent = fieldSize;
    }
  });

  // Load players and render attendance toggles
  const attendanceList = container.querySelector('#attendance-list');
  const startBtn       = container.querySelector('#btn-start-game');
  const msgEl          = container.querySelector('#create-game-msg');

  db_getPlayers(team.id).then(players => {
    if (!players.length) {
      attendanceList.innerHTML = `
        <div style="padding: 12px 0; color: var(--muted); font-size: 13px;">
          No players on roster yet.
        </div>
      `;
    } else {
      attendanceList.innerHTML = players
        .map(p => _rosterToggleRowHTML(p))
        .join('');

      // Bind toggle clicks
      attendanceList.querySelectorAll('.roster-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
          toggle.classList.toggle('off');
        });
      });
    }

    // Enable submit now that roster is loaded
    startBtn.disabled      = false;
    startBtn.style.opacity = '';
  });

  // Submit
  startBtn?.addEventListener('click', async () => {
    msgEl.textContent = '';

    // Collect attending player IDs
    const onToggles = attendanceList.querySelectorAll('.roster-toggle:not(.off)');
    const playerIds = Array.from(onToggles).map(t => t.dataset.playerId);

    if (playerIds.length < 2) {
      msgEl.textContent = 'At least 2 players must be attending.';
      return;
    }

    startBtn.disabled      = true;
    startBtn.textContent   = 'Starting...';
    startBtn.style.opacity = '0.6';

    const opponent = container.querySelector('#opponent-input')?.value.trim() || '';

    const strategy = await db_getStrategy(team.id);

    const game = await db_createGame({
      seasonId:         season.id,
      opponent:         opponent || null,
      mode:             team.sport,
      fieldSize,
      strategySnapshot: strategy || {},
      playerIds,
    });

    startBtn.disabled      = false;
    startBtn.textContent   = 'START GAME';
    startBtn.style.opacity = '';

    if (!game) {
      msgEl.textContent = 'Something went wrong. Please try again.';
      return;
    }

    router_navigate('game', { gameId: game.id, coach, team, season });
  });
}

function _rosterToggleRowHTML(player) {
  const initials = player.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return `
    <div class="roster-row" data-player-id="${player.id}">
      <div class="roster-avatar">${initials}</div>
      <div class="roster-name">${_esc(player.name)}</div>
      <div class="roster-toggle" data-player-id="${player.id}"></div>
    </div>
  `;
}

// ── LIVE GAME ─────────────────────────────────────────────────

const ALERT_MINUTES = 25;

let _gs = null;

router_register('game', async (container, params) => {
  const { gameId, coach, team, season } = params;

  // Guard: if no gameId, go back to team detail
  if (!gameId) {
    router_navigate('team', { coach, team, season });
    return;
  }

  _gs = null;

  container.innerHTML = `
    <div class="screen">
      <div class="screen-body" style="display:flex;align-items:center;justify-content:center;padding:40px 20px;">
        <div style="color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:13px;">
          Loading game...
        </div>
      </div>
    </div>
  `;

  const [game, roster, events] = await Promise.all([
    db_getGame(gameId),
    db_getGameRoster(gameId),
    db_getGameEvents(gameId),
  ]);

  if (!game) {
    container.innerHTML = `
      <div class="screen">
        <div class="screen-body" style="display:flex;align-items:center;justify-content:center;padding:40px 20px;">
          <div style="color:var(--red);font-size:13px;">Game not found.</div>
        </div>
      </div>
    `;
    return;
  }

  await _initGameState(game, roster, events, { coach, team, season });
  _renderFullScreen(container);
});

async function _initGameState(game, roster, events, { coach, team, season }) {
  const mode = game.mode || team.sport || 'generic';

  const players = {};
  for (const player of roster) {
    players[player.id] = {
      player,
      onField: false,
      fieldEnteredAt: null,
      currentStint: 0,
      totalOnTime: 0,
      benchSince: null,
      totalBenchTime: 0,
    };
  }

  // Read strategy snapshot for enforcement
  const snap = game.strategy_snapshot || {};
  const snapConfig = snap.config || {};
  const goalieLocked = (snap.mode === 'manual_nudge' && snapConfig.goalieLocked)
    ? snapConfig.goalieLocked : null;

  _gs = {
    game,
    team,
    coach,
    season,
    roster,
    fieldSize: game.field_size,
    mode,
    players,
    timerRunning: false,
    timerSeconds: 0,
    timerInterval: null,
    seriesNum: 0,
    goalieLocked,
    pendingBenchPlayer: null,
    nudgeAlertedSet: new Set(),
    realtimeChannel: null,
    container: null,
  };

  if (events.length === 0) {
    // Auto-place first fieldSize players on field
    const sorted = [...roster].sort((a, b) => a.name.localeCompare(b.name));
    const fieldPlayers = sorted.slice(0, _gs.fieldSize);
    const benchPlayers = sorted.slice(_gs.fieldSize);

    for (const player of fieldPlayers) {
      const ps = _gs.players[player.id];
      ps.onField = true;
      ps.fieldEnteredAt = 0;
      ps.currentStint = 0;
      db_insertEvent({
        gameId: game.id,
        playerId: player.id,
        eventType: 'sub_on',
        timestamp: 0,
        seriesNum: 0,
      });
    }

    for (const player of benchPlayers) {
      const ps = _gs.players[player.id];
      ps.onField = false;
      ps.benchSince = 0;
    }
  } else {
    // Reconstruct state from events
    let lastGameStartTs = null;

    for (const evt of events) {
      if (evt.event_type === 'sub_on') {
        const ps = _gs.players[evt.player_id];
        if (!ps) continue;
        const ts = mode === 'football' ? (evt.series_num || 0) : (evt.timestamp || 0);
        ps.onField = true;
        ps.fieldEnteredAt = ts;
        ps.currentStint = 0;

      } else if (evt.event_type === 'sub_off') {
        const ps = _gs.players[evt.player_id];
        if (!ps) continue;
        const ts = mode === 'football' ? (evt.series_num || 0) : (evt.timestamp || 0);
        ps.totalOnTime += Math.max(0, ts - (ps.fieldEnteredAt || 0));
        ps.onField = false;
        ps.fieldEnteredAt = null;
        ps.benchSince = ts;
        ps.currentStint = 0;

      } else if (evt.event_type === 'game_start') {
        lastGameStartTs = evt.timestamp || 0;

      } else if (evt.event_type === 'game_pause') {
        _gs.timerSeconds = evt.timestamp || 0;
        lastGameStartTs = null;

      } else if (evt.event_type === 'series_advance') {
        _gs.seriesNum++;
      }
    }

    // If game was running when we left, use last known timestamp
    if (lastGameStartTs !== null) {
      const lastEvt = events[events.length - 1];
      _gs.timerSeconds = lastEvt.timestamp || 0;
    }

    // Update currentStint for players currently on field
    for (const id of Object.keys(_gs.players)) {
      const ps = _gs.players[id];
      if (ps.onField) {
        if (mode === 'football') {
          ps.currentStint = _gs.seriesNum - (ps.fieldEnteredAt || 0);
        } else {
          ps.currentStint = Math.max(0, _gs.timerSeconds - (ps.fieldEnteredAt || 0));
        }
      }
    }

    // Settle bench times for players currently on bench
    for (const id of Object.keys(_gs.players)) {
      const ps = _gs.players[id];
      if (!ps.onField && ps.benchSince !== null) {
        const ref = mode === 'football' ? _gs.seriesNum : _gs.timerSeconds;
        ps.totalBenchTime += Math.max(0, ref - ps.benchSince);
        ps.benchSince = ref;
      }
    }
  }
}

function _renderFullScreen(container) {
  _gs.container = container;
  const game = _gs.game;
  const title = game.opponent
    ? `vs ${_esc(game.opponent)}`
    : _esc(_gs.team.short_code || _gs.team.name);

  container.innerHTML = `
    <div class="screen">
      <div class="game-header">
        <div class="game-meta">
          <div class="game-title">${title}</div>
          ${_gs.mode !== 'football' ? `
            <div class="game-clock" id="game-clock">
              <div class="clock-dot"></div>
              <span id="clock-text">${_formatTime(_gs.timerSeconds)}</span>
            </div>
          ` : ''}
        </div>
        ${_gs.mode === 'football' ? _seriesBarHTML() : _timerControlHTML()}
      </div>
      <div class="screen-body" id="game-body">
        <div class="field-zone" id="field-zone"></div>
        <div class="bench-zone" id="bench-zone"></div>
      </div>
      <div style="padding: 4px 16px 2px;">
        <button class="btn-ghost" id="btn-end-game"
          style="color:var(--red);width:100%;font-size:13px;padding:8px 16px;">
          End Game
        </button>
      </div>
      <div class="bottom-nav">
        <div class="nav-item active" id="nav-game">
          <div class="nav-icon">🏟</div>
          <div class="nav-label">GAME</div>
        </div>
        <div class="nav-item" id="nav-stats">
          <div class="nav-icon">📊</div>
          <div class="nav-label">STATS</div>
        </div>
        <div class="nav-item" id="nav-roster">
          <div class="nav-icon">👥</div>
          <div class="nav-label">ROSTER</div>
        </div>
        <div class="nav-item" id="nav-share">
          <div class="nav-icon">🔗</div>
          <div class="nav-label">SHARE</div>
        </div>
      </div>
    </div>
  `;

  _renderGame(container);
  _bindGameEvents(container);
}

function _timerControlHTML() {
  return `
    <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
      <button id="btn-timer-toggle" style="
        background:var(--card2);border:1px solid var(--border);border-radius:6px;
        padding:4px 10px;color:var(--white);font-size:14px;cursor:pointer;
      ">${_gs.timerRunning ? '⏸' : '▶'}</button>
      <span id="timer-status" style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--muted);">
        ${_gs.timerRunning ? 'RUNNING' : 'PAUSED'}
      </span>
    </div>
  `;
}

function _seriesBarHTML() {
  const displayNum = _gs.seriesNum % 10;
  let dotsHTML = '';
  for (let i = 0; i < 10; i++) {
    dotsHTML += `<div class="series-dot${i < displayNum ? '' : ' empty'}"></div>`;
  }
  return `
    <div class="series-bar">
      <div class="series-label">SERIES</div>
      <div class="series-dots" id="series-dots">${dotsHTML}</div>
      <button class="series-btn" id="btn-next-series">NEXT SERIES</button>
    </div>
  `;
}

function _renderGame(container) {
  const c = container || _gs.container;
  _renderFieldZone(c);
  _renderBenchZone(c);
}

function _renderFieldZone(container) {
  const c = container || _gs.container;
  const zone = c.querySelector('#field-zone');
  if (!zone) return;

  const onFieldPlayers = Object.values(_gs.players).filter(ps => ps.onField);
  const times = onFieldPlayers.map(ps => ps.totalOnTime + ps.currentStint);
  const median = _median(times);

  const chips = onFieldPlayers.map(ps => {
    const p = ps.player;
    const displayNum = p.jersey_number != null
      ? String(p.jersey_number)
      : p.name.slice(0, 2).toUpperCase();
    const firstName = p.name.split(' ')[0];
    const total = ps.totalOnTime + ps.currentStint;
    const isOverTime = median > 0 && total > median * 1.5;
    const isGoalie = _gs.goalieLocked === p.id;
    const timeDisplay = _gs.mode === 'football'
      ? `S${ps.currentStint}`
      : `${Math.floor(ps.currentStint / 60)}m`;
    let namePrefix = isGoalie ? '🥅 ' : isOverTime ? '⚠ ' : '';
    let borderStyle = isGoalie ? 'border-color:var(--blue);' : isOverTime ? 'border-color:var(--orange);' : '';

    return `
      <div class="player-chip${isOverTime && !isGoalie ? ' over-time' : ''}"
        data-player-id="${p.id}"
        ${borderStyle ? `style="${borderStyle}"` : ''}
      >
        <div class="player-num">${_esc(displayNum)}</div>
        <div class="player-name-small">${namePrefix}${_esc(firstName)}</div>
        <div class="player-mins">${_esc(timeDisplay)}</div>
      </div>
    `;
  }).join('');

  zone.innerHTML = `
    <div class="zone-label">
      ON FIELD
      <span class="zone-count">${onFieldPlayers.length}</span>
    </div>
    <div class="field-grid" id="field-grid">
      ${chips || '<div style="color:var(--muted);font-size:12px;padding:8px 0;">No players on field</div>'}
    </div>
  `;

  zone.querySelectorAll('.player-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const playerId = chip.dataset.playerId;
      if (_gs.pendingBenchPlayer && playerId) {
        _executeSwap(_gs.pendingBenchPlayer, playerId);
      }
    });
  });
}

function _renderBenchZone(container) {
  const c = container || _gs.container;
  const zone = c.querySelector('#bench-zone');
  if (!zone) return;

  const benchPlayers = Object.values(_gs.players).filter(ps => !ps.onField);
  const isFootball = _gs.mode === 'football';

  const withBenchTime = benchPlayers.map(ps => {
    const benchSince = ps.benchSince !== null ? ps.benchSince : 0;
    const ref = isFootball ? _gs.seriesNum : _gs.timerSeconds;
    const currentBenchTime = Math.max(0, ref - benchSince);
    return { ps, currentBenchTime };
  });

  const _bsnap = _gs.game.strategy_snapshot || {};
  const _isStrictQueue = _bsnap.mode === 'strict_queue';
  const _queueOrder = _isStrictQueue ? (_bsnap.config?.playerOrder || []) : [];

  if (_isStrictQueue) {
    withBenchTime.sort((a, b) => {
      const ai = _queueOrder.indexOf(a.ps.player.id);
      const bi = _queueOrder.indexOf(b.ps.player.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  } else {
    withBenchTime.sort((a, b) =>
      (b.ps.totalBenchTime + b.currentBenchTime) - (a.ps.totalBenchTime + a.currentBenchTime)
    );
  }

  const totalGameTime = isFootball ? _gs.seriesNum : _gs.timerSeconds;

  const rows = withBenchTime.map(({ ps, currentBenchTime }, idx) => {
    const p = ps.player;
    const initials = p.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const isNextUp = idx === 0;

    let statsText, ptPct;
    if (isFootball) {
      statsText = `S${currentBenchTime} bench · S${ps.totalOnTime} total`;
      ptPct = totalGameTime > 0 ? Math.round((ps.totalOnTime / totalGameTime) * 100) : 0;
    } else {
      const sittingMin = Math.floor(currentBenchTime / 60);
      const totalMin = Math.floor(ps.totalOnTime / 60);
      statsText = `sitting ${sittingMin}m · ${totalMin}m total`;
      ptPct = totalGameTime > 0 ? Math.round((ps.totalOnTime / totalGameTime) * 100) : 0;
    }

    ptPct = Math.min(100, Math.max(0, ptPct));
    const fillClass = ptPct > 60 ? '' : ptPct >= 40 ? ' warn' : ' alert';

    return `
      <div class="bench-player${isNextUp ? ' next-up' : ''}" data-player-id="${p.id}">
        <div class="bench-rank">${idx + 1}</div>
        <div class="bench-avatar">${_esc(initials)}</div>
        <div class="bench-info">
          <div class="bench-name">${_esc(p.name)}</div>
          <div class="bench-stats">${_esc(statsText)}</div>
        </div>
        <div class="pt-bar">
          <div class="pt-bar-fill${fillClass}" style="width:${ptPct}%;"></div>
        </div>
      </div>
    `;
  }).join('');

  zone.innerHTML = `
    <div class="bench-label">
      THE BENCH
      <span class="queue-hint">tap to sub in</span>
    </div>
    <div class="bench-list">
      ${rows || '<div style="color:var(--muted);font-size:12px;padding:8px 0;">No players on bench</div>'}
    </div>
  `;

  zone.querySelectorAll('.bench-player').forEach(row => {
    row.addEventListener('click', () => {
      const playerId = row.dataset.playerId;
      if (playerId) _openSwapModal(playerId);
    });
  });
}

function _renderClock(container) {
  const c = container || _gs.container;
  const clockText = c.querySelector('#clock-text');
  if (clockText) clockText.textContent = _formatTime(_gs.timerSeconds);
}

function _bindGameEvents(container) {
  const timerBtn = container.querySelector('#btn-timer-toggle');
  if (timerBtn) {
    timerBtn.addEventListener('click', () => _toggleTimer(container));
  }

  const seriesBtn = container.querySelector('#btn-next-series');
  if (seriesBtn) {
    seriesBtn.addEventListener('click', () => _advanceSeries(container));
  }

  container.querySelector('#btn-end-game')?.addEventListener('click', () => {
    _confirmDialog('End this game? This can\'t be undone.', _endGame);
  });

  container.querySelector('#nav-stats')?.addEventListener('click', () => {
    _leaveGame('stats', { coach: _gs.coach, team: _gs.team, season: _gs.season });
  });
  container.querySelector('#nav-roster')?.addEventListener('click', () => {
    _openRosterSheet();
  });
  container.querySelector('#nav-share')?.addEventListener('click', () => {
    _shareGame();
  });
}

function _toggleTimer(container) {
  if (_gs.timerRunning) {
    clearInterval(_gs.timerInterval);
    _gs.timerInterval = null;
    _gs.timerRunning = false;
    db_insertEvent({
      gameId: _gs.game.id,
      playerId: null,
      eventType: 'game_pause',
      timestamp: _gs.timerSeconds,
      seriesNum: _gs.seriesNum,
    });
  } else {
    _gs.timerRunning = true;
    db_insertEvent({
      gameId: _gs.game.id,
      playerId: null,
      eventType: 'game_start',
      timestamp: _gs.timerSeconds,
      seriesNum: _gs.seriesNum,
    });
    _gs.timerInterval = setInterval(() => {
      _gs.timerSeconds++;

      for (const id of Object.keys(_gs.players)) {
        const ps = _gs.players[id];
        if (ps.onField) ps.currentStint++;
      }

      _renderClock(_gs.container);

      // Re-render player zones every 15 s — avoids per-second flicker
      // while keeping displays fresh enough for coaching
      if (_gs.timerSeconds % 15 === 0) {
        _renderFieldZone(_gs.container);
        _renderBenchZone(_gs.container);
      }

      // 25-minute halftime alert
      if (_gs.timerSeconds === ALERT_MINUTES * 60) {
        _fireAlert();
        _showToast(`${ALERT_MINUTES} min — check subs!`);
      }

      // Timer swap strategy alert
      const _snap = _gs.game.strategy_snapshot || {};
      if (_snap.mode === 'timer_swap' && _snap.config?.intervalMinutes) {
        const intSecs = _snap.config.intervalMinutes * 60;
        if (_gs.timerSeconds > 0 && _gs.timerSeconds % intSecs === 0) {
          _fireAlert();
          _showToast(`Time to swap! (every ${_snap.config.intervalMinutes}m)`);
        }
      }

      // Manual nudge strategy: alert when bench player sitting too long
      if (_snap.mode === 'manual_nudge' && _snap.config?.alertMinutes > 0) {
        const alertSecs = _snap.config.alertMinutes * 60;
        for (const id of Object.keys(_gs.players)) {
          const ps = _gs.players[id];
          if (!ps.onField && ps.benchSince !== null && !_gs.nudgeAlertedSet.has(id)) {
            const sittingSecs = _gs.timerSeconds - ps.benchSince;
            if (sittingSecs >= alertSecs) {
              _gs.nudgeAlertedSet.add(id);
              const firstName = ps.player.name.split(' ')[0];
              _showToast(`${firstName} has been sitting ${_snap.config.alertMinutes}m`);
              _fireAlert();
            }
          }
        }
      }
    }, 1000);
  }

  const btn = container.querySelector('#btn-timer-toggle');
  if (btn) btn.textContent = _gs.timerRunning ? '⏸' : '▶';
  const statusEl = container.querySelector('#timer-status');
  if (statusEl) statusEl.textContent = _gs.timerRunning ? 'RUNNING' : 'PAUSED';
}

function _advanceSeries(container) {
  _gs.seriesNum++;

  db_insertEvent({
    gameId: _gs.game.id,
    playerId: null,
    eventType: 'series_advance',
    timestamp: _gs.timerSeconds,
    seriesNum: _gs.seriesNum,
  });

  for (const id of Object.keys(_gs.players)) {
    const ps = _gs.players[id];
    if (ps.onField) {
      ps.currentStint = _gs.seriesNum - (ps.fieldEnteredAt || 0);
    }
  }

  const dotsContainer = container.querySelector('#series-dots');
  if (dotsContainer) {
    const displayNum = _gs.seriesNum % 10;
    let dotsHTML = '';
    for (let i = 0; i < 10; i++) {
      dotsHTML += `<div class="series-dot${i < displayNum ? '' : ' empty'}"></div>`;
    }
    dotsContainer.innerHTML = dotsHTML;
  }

  _renderBenchZone(container);
}

function _openSwapModal(benchPlayerId) {
  _gs.pendingBenchPlayer = benchPlayerId;
  const benchPs = _gs.players[benchPlayerId];
  if (!benchPs) return;

  const onFieldSorted = Object.values(_gs.players)
    .filter(ps => ps.onField && ps.player.id !== _gs.goalieLocked)
    .sort((a, b) => (b.totalOnTime + b.currentStint) - (a.totalOnTime + a.currentStint));

  const playerRows = onFieldSorted.map((ps, idx) => {
    const p = ps.player;
    const initials = p.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const timeDisplay = _gs.mode === 'football'
      ? `S${ps.currentStint}`
      : `${Math.floor(ps.currentStint / 60)}m ${ps.currentStint % 60}s`;
    const isLongest = idx === 0;

    return `
      <div class="swap-player" data-player-id="${p.id}"
        ${isLongest ? 'style="border-color:var(--orange);"' : ''}>
        <div class="bench-avatar">${_esc(initials)}</div>
        <div class="swap-player-name">${_esc(p.name)}</div>
        <div class="swap-player-time">${_esc(timeDisplay)}</div>
      </div>
    `;
  }).join('');

  const longestId = onFieldSorted.length > 0 ? onFieldSorted[0].player.id : null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'swap-modal-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">Sub In ${_esc(benchPs.player.name)}</div>
      <div class="modal-sub">Select a field player to replace — sorted by time on</div>
      <div class="swap-player-list">
        ${playerRows}
      </div>
      ${longestId ? `
        <button class="btn-orange" id="btn-sub-now">SUB NOW</button>
      ` : ''}
      <div class="swap-cancel" id="swap-cancel">Cancel</div>
    </div>
  `;

  document.getElementById('app').appendChild(overlay);

  overlay.querySelectorAll('.swap-player').forEach(row => {
    row.addEventListener('click', () => {
      const fieldPlayerId = row.dataset.playerId;
      _closeSwapModal();
      _executeSwap(benchPlayerId, fieldPlayerId);
    });
  });

  overlay.querySelector('#btn-sub-now')?.addEventListener('click', () => {
    if (longestId) {
      _closeSwapModal();
      _executeSwap(benchPlayerId, longestId);
    }
  });

  overlay.querySelector('#swap-cancel')?.addEventListener('click', () => {
    _gs.pendingBenchPlayer = null;
    _closeSwapModal();
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      _gs.pendingBenchPlayer = null;
      _closeSwapModal();
    }
  });
}

function _closeSwapModal() {
  const overlay = document.getElementById('swap-modal-overlay');
  if (overlay) overlay.remove();
}

function _executeSwap(benchPlayerId, fieldPlayerId) {
  const benchPs = _gs.players[benchPlayerId];
  const fieldPs = _gs.players[fieldPlayerId];
  if (!benchPs || !fieldPs) return;

  const now = _gs.mode === 'football' ? _gs.seriesNum : _gs.timerSeconds;

  // Take field player off
  fieldPs.totalOnTime += fieldPs.currentStint;
  fieldPs.onField = false;
  fieldPs.benchSince = now;
  fieldPs.currentStint = 0;
  db_insertEvent({
    gameId: _gs.game.id,
    playerId: fieldPlayerId,
    eventType: 'sub_off',
    timestamp: _gs.timerSeconds,
    seriesNum: _gs.seriesNum,
  });

  // Put bench player on field
  benchPs.totalBenchTime += benchPs.benchSince !== null
    ? Math.max(0, now - benchPs.benchSince)
    : 0;
  benchPs.onField = true;
  if (_gs.nudgeAlertedSet) _gs.nudgeAlertedSet.delete(benchPlayerId);
  benchPs.fieldEnteredAt = now;
  benchPs.currentStint = 0;
  benchPs.benchSince = null;
  db_insertEvent({
    gameId: _gs.game.id,
    playerId: benchPlayerId,
    eventType: 'sub_on',
    timestamp: _gs.timerSeconds,
    seriesNum: _gs.seriesNum,
  });

  _gs.pendingBenchPlayer = null;
  _renderGame(_gs.container);
}

function _shareGame() {
  if (!_gs?.game?.id) return;
  const url = `${window.location.origin}/watch?game=${_gs.game.id}`;

  if (navigator.share) {
    navigator.share({
      title: 'Watch live — ClearTheBench',
      text: `Follow along with ${_gs.team.name}`,
      url,
    }).catch(() => {}); // user cancelled share sheet — silent
  } else {
    navigator.clipboard.writeText(url).then(() => {
      _showToast('Link copied!');
    }).catch(() => {
      _showToast(url); // fallback: show the URL itself
    });
  }
}

function _showToast(message) {
  const existing = document.getElementById('ctb-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'ctb-toast';
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: 'calc(72px + var(--safe-bottom, 0px))',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--card2)',
    border: '1px solid var(--border)',
    color: 'var(--white)',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    padding: '8px 16px',
    borderRadius: 'var(--radius-sm)',
    zIndex: '200',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  });

  document.getElementById('app').appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function _leaveGame(screen, params) {
  if (_gs?.timerInterval) clearInterval(_gs.timerInterval);
  if (_gs?.realtimeChannel) db_unsubscribe(_gs.realtimeChannel);
  _gs = null;
  router_navigate(screen, params);
}

function _fireAlert() {
  if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume().then(() => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.3);
    });
  } catch (e) {}
  const appEl = document.getElementById('app');
  if (appEl) {
    appEl.classList.add('timer-flash');
    setTimeout(() => appEl.classList.remove('timer-flash'), 600);
  }
}

async function _endGame() {
  if (_gs.timerRunning) {
    clearInterval(_gs.timerInterval);
    _gs.timerInterval = null;
    _gs.timerRunning = false;
  }
  await db_insertEvent({
    gameId: _gs.game.id,
    playerId: null,
    eventType: 'game_end',
    timestamp: _gs.timerSeconds,
    seriesNum: _gs.seriesNum,
  });
  const { coach, team, season } = _gs;
  const gameId = _gs.game.id;
  _leaveGame('game-summary', { gameId, coach, team, season });
}

function _confirmDialog(message, onConfirm) {
  const existing = document.getElementById('ctb-confirm-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'ctb-confirm-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title" style="font-size:16px;margin-bottom:16px;">${_esc(message)}</div>
      <button class="btn-ghost" id="confirm-yes"
        style="color:var(--red);width:100%;margin-bottom:8px;">Yes, end it</button>
      <div class="swap-cancel" id="confirm-no">Cancel</div>
    </div>
  `;
  document.getElementById('app').appendChild(overlay);

  overlay.querySelector('#confirm-yes')?.addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });
  overlay.querySelector('#confirm-no')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

function _openRosterSheet() {
  const existing = document.getElementById('roster-sheet-overlay');
  if (existing) existing.remove();

  const fieldPlayers = Object.values(_gs.players).filter(ps => ps.onField);
  const benchPlayers = Object.values(_gs.players).filter(ps => !ps.onField);
  const ref = _gs.mode === 'football' ? _gs.seriesNum : _gs.timerSeconds;

  const makeRow = (ps, onField) => {
    const p = ps.player;
    const initials = p.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const isGoalie = _gs.goalieLocked === p.id;
    let timeLabel, timeColor;
    if (onField) {
      const mins = _gs.mode === 'football'
        ? `S${ps.currentStint}`
        : `${Math.floor(ps.currentStint / 60)}m`;
      timeLabel = `ON · ${mins}`;
      timeColor = 'var(--lime)';
    } else {
      const benchSecs = ps.benchSince !== null ? Math.max(0, ref - ps.benchSince) : 0;
      const mins = _gs.mode === 'football'
        ? `S${benchSecs}`
        : `${Math.floor(benchSecs / 60)}m`;
      timeLabel = `BENCH · ${mins}`;
      timeColor = 'var(--muted)';
    }
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;
        border-bottom:1px solid var(--border);">
        <div class="bench-avatar">${_esc(initials)}</div>
        <div style="flex:1;font-size:14px;color:var(--white);">
          ${_esc(p.name)}${isGoalie ? ' 🥅' : ''}
        </div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:${timeColor};">
          ${timeLabel}
        </div>
      </div>
    `;
  };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'roster-sheet-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">Roster</div>
      <div style="font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace;
        margin-bottom:6px;">ON FIELD (${fieldPlayers.length})</div>
      <div style="margin-bottom:12px;">
        ${fieldPlayers.map(ps => makeRow(ps, true)).join('') ||
          '<div style="color:var(--muted);font-size:13px;padding:6px 0;">—</div>'}
      </div>
      <div style="font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace;
        margin-bottom:6px;">BENCH (${benchPlayers.length})</div>
      <div>
        ${benchPlayers.map(ps => makeRow(ps, false)).join('') ||
          '<div style="color:var(--muted);font-size:13px;padding:6px 0;">—</div>'}
      </div>
      <div class="swap-cancel" id="roster-sheet-close" style="margin-top:16px;">Close</div>
    </div>
  `;

  document.getElementById('app').appendChild(overlay);
  overlay.querySelector('#roster-sheet-close')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ── GAME SUMMARY SCREEN ───────────────────────────────────────

router_register('game-summary', async (container, { gameId, coach, team, season }) => {
  container.innerHTML = `
    <div class="screen">
      <div class="app-header">
        <div class="app-logo">Clear<span>The</span>Bench</div>
      </div>
      <div class="screen-body" style="display:flex;align-items:center;justify-content:center;">
        <div style="color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:12px;">
          Loading summary...
        </div>
      </div>
    </div>
  `;

  const summary = await db_getGameSummary(gameId);
  const totalMin = Math.floor(summary.gameDuration / 60);

  const rows = summary.players.map(ps => {
    const mins = Math.floor(ps.totalOnTime / 60);
    const secs = ps.totalOnTime % 60;
    const initials = ps.player.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const pct = summary.gameDuration > 0
      ? Math.min(100, Math.round((ps.totalOnTime / summary.gameDuration) * 100))
      : 0;
    const barClass = pct >= 60 ? '' : pct >= 40 ? 'mid' : 'alert';
    return `
      <div class="stat-player-row" style="padding: 0 20px;">
        <div class="bench-avatar" style="flex-shrink:0;">${_esc(initials)}</div>
        <div class="stat-name">${_esc(ps.player.name)}</div>
        <div class="stat-bar-wrap">
          <div class="stat-bar-fill ${barClass}" style="width:${pct}%;"></div>
        </div>
        <div class="stat-pct" style="${pct < 40 ? 'color:var(--red)' : pct < 60 ? 'color:var(--yellow)' : 'color:var(--lime)'}">
          ${mins}m${secs > 0 ? ` ${secs}s` : ''}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="screen">
      <div class="app-header">
        <div class="app-logo">Clear<span>The</span>Bench</div>
      </div>
      <div class="screen-body">
        <div style="padding: 0 20px 16px;">
          <div class="section-title" style="padding:0;margin-bottom:4px;">GAME OVER</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);">
            ${totalMin > 0 ? `${totalMin} min · ` : ''}${summary.players.length} players
          </div>
        </div>
        <div class="divider"></div>
        <div class="section-title">PLAYING TIME</div>
        <div class="stats-body" style="padding-bottom:8px;">
          ${rows || '<div style="padding:20px;color:var(--muted);font-size:13px;">No data</div>'}
        </div>
        <div style="padding: 0 20px 48px;">
          <button class="btn-primary" id="btn-done">Done</button>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-done')?.addEventListener('click', () => {
    router_navigate('team', { coach, team, season });
  });
});

function _initials(name) {
  return String(name).split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
}

function _formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function _median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── SPECTATOR VIEW ────────────────────────────────────────────

router_register('watch', async (container, { gameId }) => {
  _gs = null;

  container.innerHTML = `
    <div class="screen">
      <div class="screen-body" style="display:flex;align-items:center;justify-content:center;padding:40px 20px;">
        <div style="color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:13px;">
          Loading game...
        </div>
      </div>
    </div>
  `;

  // Requires anon read policy on games, game_roster, game_events
  const [game, roster, events] = await Promise.all([
    db_getGame(gameId),
    db_getGameRoster(gameId),
    db_getGameEvents(gameId),
  ]);

  if (!game) {
    container.innerHTML = `
      <div class="screen">
        <div class="screen-body" style="display:flex;align-items:center;justify-content:center;
          padding:40px 20px;flex-direction:column;gap:12px;text-align:center;">
          <div style="font-size:48px;">🏟️</div>
          <div style="color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:13px;">
            Game not found.<br>
            This link may be invalid or the game may have been removed.
          </div>
        </div>
      </div>
    `;
    return;
  }

  const team   = game.seasons?.teams   || {};
  const season = game.seasons           || {};

  await _initGameState(game, roster, events, { coach: null, team, season });
  _gs.events = events.slice(); // store for elapsed-time derivation

  if (_gs.mode !== 'football') {
    _gs.timerSeconds = _deriveElapsedSeconds();
    for (const id of Object.keys(_gs.players)) {
      const ps = _gs.players[id];
      if (ps.onField) {
        ps.currentStint = Math.max(0, _gs.timerSeconds - (ps.fieldEnteredAt || 0));
      }
    }
  }

  _renderSpectatorScreen(container);

  _gs.realtimeChannel = db_subscribeToGame(gameId, (payload) => {
    const event = payload.new;
    if (_gs.events) _gs.events.push(event);
    _applyEvent(event);
    if (_gs.mode !== 'football') {
      _gs.timerSeconds = _deriveElapsedSeconds();
      for (const id of Object.keys(_gs.players)) {
        const ps = _gs.players[id];
        if (ps.onField) {
          ps.currentStint = Math.max(0, _gs.timerSeconds - (ps.fieldEnteredAt || 0));
        }
      }
      _renderClock(container);
    }
    _renderSpectatorGame(container);
    if (_gs.mode === 'football') _renderSpectatorSeriesDots(container);
  });

  window.addEventListener('beforeunload', () => {
    if (_gs?.realtimeChannel) db_unsubscribe(_gs.realtimeChannel);
  });
});

function _renderSpectatorScreen(container) {
  _gs.container = container;
  const game  = _gs.game;
  const title = game.opponent
    ? `vs ${_esc(game.opponent)}`
    : _esc(_gs.team?.short_code || _gs.team?.name || '');

  container.innerHTML = `
    <div class="screen">
      <div class="spectator-banner">
        <span class="clock-dot" style="display:inline-block;margin-right:6px;
          vertical-align:middle;"></span>
        Spectator view · Live
      </div>
      <div class="game-header">
        <div class="game-meta">
          <div class="game-title">${title}</div>
          ${_gs.mode !== 'football' ? `
            <div class="game-clock" id="game-clock">
              <div class="clock-dot"></div>
              <span id="clock-text">${_formatTime(_gs.timerSeconds)}</span>
            </div>
          ` : ''}
        </div>
        ${_gs.mode === 'football' ? _spectatorSeriesBarHTML() : ''}
      </div>
      <div class="screen-body" id="game-body">
        <div class="field-zone" id="field-zone"></div>
        <div class="bench-zone" id="bench-zone"></div>
      </div>
    </div>
  `;

  _renderSpectatorGame(container);
}

function _spectatorSeriesBarHTML() {
  const displayNum = _gs.seriesNum % 10;
  let dotsHTML = '';
  for (let i = 0; i < 10; i++) {
    dotsHTML += `<div class="series-dot${i < displayNum ? '' : ' empty'}"></div>`;
  }
  return `
    <div class="series-bar">
      <div class="series-label">SERIES</div>
      <div class="series-dots" id="series-dots">${dotsHTML}</div>
      <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);
        padding:0 4px;">${_gs.seriesNum}</div>
    </div>
  `;
}

function _renderSpectatorSeriesDots(container) {
  const c = container || _gs.container;
  const dotsContainer = c.querySelector('#series-dots');
  if (!dotsContainer) return;
  const displayNum = _gs.seriesNum % 10;
  let dotsHTML = '';
  for (let i = 0; i < 10; i++) {
    dotsHTML += `<div class="series-dot${i < displayNum ? '' : ' empty'}"></div>`;
  }
  dotsContainer.innerHTML = dotsHTML;
}

function _renderSpectatorGame(container) {
  const c = container || _gs.container;
  _renderSpectatorFieldZone(c);
  _renderSpectatorBenchZone(c);
}

function _renderSpectatorFieldZone(container) {
  const c = container || _gs.container;
  const zone = c.querySelector('#field-zone');
  if (!zone) return;

  const onFieldPlayers = Object.values(_gs.players).filter(ps => ps.onField);
  const times  = onFieldPlayers.map(ps => ps.totalOnTime + ps.currentStint);
  const median = _median(times);

  const chips = onFieldPlayers.map(ps => {
    const p = ps.player;
    const displayNum = p.jersey_number != null
      ? String(p.jersey_number)
      : p.name.slice(0, 2).toUpperCase();
    const firstName   = p.name.split(' ')[0];
    const total       = ps.totalOnTime + ps.currentStint;
    const isOverTime  = median > 0 && total > median * 1.5;
    const timeDisplay = _gs.mode === 'football'
      ? `S${ps.currentStint}`
      : `${Math.floor(ps.currentStint / 60)}m`;

    return `
      <div class="player-chip${isOverTime ? ' over-time' : ''}"
        data-player-id="${p.id}"
        ${isOverTime ? 'style="border-color:var(--orange);"' : ''}
      >
        <div class="player-num">${_esc(displayNum)}</div>
        <div class="player-name-small">${isOverTime ? '⚠ ' : ''}${_esc(firstName)}</div>
        <div class="player-mins">${_esc(timeDisplay)}</div>
      </div>
    `;
  }).join('');

  zone.innerHTML = `
    <div class="zone-label">
      ON FIELD
      <span class="zone-count">${onFieldPlayers.length}</span>
    </div>
    <div class="field-grid" id="field-grid">
      ${chips || '<div style="color:var(--muted);font-size:12px;padding:8px 0;">No players on field</div>'}
    </div>
  `;
  // No click handlers — read-only spectator view
}

function _renderSpectatorBenchZone(container) {
  const c = container || _gs.container;
  const zone = c.querySelector('#bench-zone');
  if (!zone) return;

  const benchPlayers = Object.values(_gs.players).filter(ps => !ps.onField);
  const isFootball   = _gs.mode === 'football';

  const withBenchTime = benchPlayers.map(ps => {
    const benchSince      = ps.benchSince !== null ? ps.benchSince : 0;
    const ref             = isFootball ? _gs.seriesNum : _gs.timerSeconds;
    const currentBenchTime = Math.max(0, ref - benchSince);
    return { ps, currentBenchTime };
  });

  withBenchTime.sort((a, b) =>
    (b.ps.totalBenchTime + b.currentBenchTime) - (a.ps.totalBenchTime + a.currentBenchTime)
  );

  const totalGameTime = isFootball ? _gs.seriesNum : _gs.timerSeconds;

  const rows = withBenchTime.map(({ ps, currentBenchTime }, idx) => {
    const p        = ps.player;
    const initials = p.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const isNextUp = idx === 0;

    let statsText, ptPct;
    if (isFootball) {
      statsText = `S${currentBenchTime} bench · S${ps.totalOnTime} total`;
      ptPct = totalGameTime > 0 ? Math.round((ps.totalOnTime / totalGameTime) * 100) : 0;
    } else {
      const sittingMin = Math.floor(currentBenchTime / 60);
      const totalMin   = Math.floor(ps.totalOnTime / 60);
      statsText = `sitting ${sittingMin}m · ${totalMin}m total`;
      ptPct = totalGameTime > 0 ? Math.round((ps.totalOnTime / totalGameTime) * 100) : 0;
    }

    ptPct = Math.min(100, Math.max(0, ptPct));
    const fillClass = ptPct > 60 ? '' : ptPct >= 40 ? ' warn' : ' alert';

    return `
      <div class="bench-player${isNextUp ? ' next-up' : ''}" data-player-id="${p.id}">
        <div class="bench-rank">${idx + 1}</div>
        <div class="bench-avatar">${_esc(initials)}</div>
        <div class="bench-info">
          <div class="bench-name">${_esc(p.name)}</div>
          <div class="bench-stats">${_esc(statsText)}</div>
        </div>
        <div class="pt-bar">
          <div class="pt-bar-fill${fillClass}" style="width:${ptPct}%;"></div>
        </div>
      </div>
    `;
  }).join('');

  zone.innerHTML = `
    <div class="bench-label">
      THE BENCH
    </div>
    <div class="bench-list">
      ${rows || '<div style="color:var(--muted);font-size:12px;padding:8px 0;">No players on bench</div>'}
    </div>
  `;
  // No click handlers — read-only spectator view
}

function _applyEvent(event) {
  if (!_gs) return;
  const ps = event.player_id ? _gs.players[event.player_id] : null;

  switch (event.event_type) {
    case 'sub_on':
      if (ps) {
        const ts = _gs.mode === 'football' ? (event.series_num || 0) : (event.timestamp || 0);
        ps.onField        = true;
        ps.fieldEnteredAt = ts;
        ps.currentStint   = 0;
      }
      break;

    case 'sub_off':
      if (ps) {
        const ts = _gs.mode === 'football' ? (event.series_num || 0) : (event.timestamp || 0);
        ps.totalOnTime   += Math.max(0, ts - (ps.fieldEnteredAt || 0));
        ps.onField        = false;
        ps.fieldEnteredAt = null;
        ps.benchSince     = ts;
        ps.currentStint   = 0;
      }
      break;

    case 'series_advance':
      _gs.seriesNum++;
      for (const id of Object.keys(_gs.players)) {
        const p = _gs.players[id];
        if (p.onField) {
          p.currentStint = _gs.seriesNum - (p.fieldEnteredAt || 0);
        }
      }
      break;

    case 'game_start':
      // Elapsed time is re-derived from the events log; nothing extra to do here
      break;

    case 'game_pause':
      _gs.timerSeconds = event.timestamp || 0;
      break;
  }
}

function _deriveElapsedSeconds() {
  if (!_gs?.events?.length) return 0;

  let elapsed          = 0;
  let lastStartIdx     = -1;
  let lastPauseIdx     = -1;

  for (let i = 0; i < _gs.events.length; i++) {
    const evt = _gs.events[i];
    if (evt.event_type === 'game_start') {
      lastStartIdx = i;
      elapsed      = evt.timestamp || 0;
    } else if (evt.event_type === 'game_pause') {
      lastPauseIdx = i;
      elapsed      = evt.timestamp || 0;
    }
  }

  // If game is running (last start comes after last pause), derive from subsequent events
  if (lastStartIdx > lastPauseIdx) {
    for (let i = lastStartIdx + 1; i < _gs.events.length; i++) {
      const ts = _gs.events[i].timestamp || 0;
      if (ts > elapsed) elapsed = ts;
    }
  }

  return elapsed;
}

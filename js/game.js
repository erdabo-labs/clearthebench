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
      strategySnapshot: strategy || null,
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

// ── LIVE GAME (TODO) ──────────────────────────────────────────
// router_register('game', ...) — Step 6

// ── SPECTATOR (TODO) ─────────────────────────────────────────
// router_register('watch', ...) — Step 7

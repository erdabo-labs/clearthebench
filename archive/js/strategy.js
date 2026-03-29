// =============================================================
// strategy.js — sub strategy config screen
// =============================================================

router_register('strategy', async (container, { coach, team, season } = {}) => {
  // Editor mode guard
  if (!coach) {
    router_navigate('team', { team, editorMode: true });
    return;
  }

  // Show loading
  container.innerHTML = _strategyLoadingHTML(team);

  // Fetch data in parallel
  const [strategy, players] = await Promise.all([
    db_getStrategy(team.id),
    db_getPlayers(team.id),
  ]);

  container.innerHTML = _strategyHTML(team, strategy, players);
  _bindStrategy(container, coach, team, season, players, strategy);
});

// ── TEMPLATES ─────────────────────────────────────────────────

function _strategyLoadingHTML(team) {
  return `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-back">←</div>
        </div>
        <div style="padding: 40px 20px; text-align: center; color: var(--muted);
          font-family: 'JetBrains Mono', monospace; font-size: 12px;">Loading strategy...</div>
      </div>
    </div>
  `;
}

function _strategyHTML(team, strategy, players) {
  const sport      = team.sport || 'generic';
  const emoji      = sport === 'soccer' ? '⚽' : sport === 'football' ? '🏈' : '🏅';
  const badgeClass = sport === 'soccer' ? 'badge-soccer' : sport === 'football' ? 'badge-football' : 'badge-generic';
  const badgeLabel = sport === 'soccer' ? 'SOCCER' : sport === 'football' ? 'FOOTBALL' : 'GENERIC';

  const initialMode   = strategy?.mode || 'manual_nudge';
  const initialConfig = strategy?.config || null;

  const modes = [
    { key: 'strict_queue', icon: '🔄', label: 'Strict Queue'   },
    { key: 'timer_swap',   icon: '⏱',  label: 'Timer Swap'    },
    { key: 'pair_group',   icon: '👥', label: 'Pair / Group'  },
    { key: 'manual_nudge', icon: '👁',  label: 'Manual + Nudge' },
  ];

  const modeChips = modes.map(m => `
    <div class="mode-chip${m.key === initialMode ? ' active' : ''}" data-mode="${m.key}">
      <span class="mode-icon">${m.icon}</span>
      <span>${m.label}</span>
    </div>
  `).join('');

  const panelHTML = _modePanelHTML(initialMode, players, initialConfig, sport);

  return `
    <div class="screen">
      <div class="screen-body">

        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-back">←</div>
        </div>

        <div class="create-body">
          <div class="section-title" style="padding:0; margin-bottom:16px;">SUB STRATEGY</div>

          <div style="margin-bottom: 20px;">
            <span class="team-badge ${badgeClass}">${emoji} ${badgeLabel}</span>
          </div>

          <div class="mode-row" id="mode-row">
            ${modeChips}
          </div>

          <div id="strategy-config-panel">
            ${panelHTML}
          </div>

          <button class="btn-primary" id="btn-save-strategy" style="margin-top: 24px;">SAVE STRATEGY</button>
          <div id="strategy-msg" style="margin-top: 12px; font-size: 13px;
            text-align: center; min-height: 20px;"></div>

          <div style="height: 40px;"></div>
        </div>

      </div>
    </div>
  `;
}

// ── CONFIG PANELS ─────────────────────────────────────────────

function _modePanelHTML(mode, players, config, sport) {
  switch (mode) {
    case 'strict_queue': return _strictQueuePanelHTML(players, config, sport);
    case 'timer_swap':   return _timerSwapPanelHTML(config);
    case 'pair_group':   return _pairGroupPanelHTML(players, config);
    case 'manual_nudge': return _manualNudgePanelHTML(players, config, sport);
    default:             return _manualNudgePanelHTML(players, config, sport);
  }
}

function _strictQueuePanelHTML(players, config, sport) {
  const fieldSize = _strategyFieldSize(sport);
  const rotateN   = config?.rotateN ?? 1;

  // Sort players according to saved order (append any not in saved list at end)
  const savedOrder = config?.playerOrder ?? [];
  const orderedPlayers = [...players].sort((a, b) => {
    const ai = savedOrder.indexOf(a.id);
    const bi = savedOrder.indexOf(b.id);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const playerRows = orderedPlayers.map(p => `
    <div class="player-detail-row sq-player-row" data-player-id="${p.id}"
      style="cursor: grab; touch-action: none; user-select: none;">
      <div class="roster-avatar">${_strategyInitials(p.name)}</div>
      <div class="pdr-info">
        <div class="pdr-name">${_esc(p.name)}</div>
      </div>
      <div class="sq-drag-handle"
        style="font-size: 20px; color: var(--muted); padding: 0 8px;
          cursor: grab; touch-action: none; flex-shrink: 0;">⠿</div>
    </div>
  `).join('');

  return `
    <div style="margin-top: 20px;">
      <div class="input-group">
        <label class="input-label">Players rotated per sub</label>
        ${_stepperHTML('sq-rotate-val', rotateN, 1, fieldSize)}
      </div>
      <div class="input-label" style="margin-bottom: 8px; margin-top: 16px;">Player Order</div>
      <div id="sq-player-list" style="user-select: none;">
        ${playerRows || '<div style="color:var(--muted);font-size:13px;padding:8px 0;">No players on roster.</div>'}
      </div>
    </div>
  `;
}

function _timerSwapPanelHTML(config) {
  const intervalMinutes = config?.intervalMinutes ?? 5;
  const swapCount       = config?.swapCount ?? 1;

  return `
    <div style="margin-top: 20px;">
      <div class="input-group">
        <label class="input-label">Alert every X minutes</label>
        ${_stepperHTML('ts-interval-val', intervalMinutes, 2, 20)}
      </div>
      <div class="input-group" style="margin-top: 16px;">
        <label class="input-label">Players to swap per alert</label>
        ${_stepperHTML('ts-swap-val', swapCount, 1, 5)}
      </div>
    </div>
  `;
}

function _pairGroupPanelHTML(players, config) {
  const group1Name = config?.groups?.[0]?.name ?? 'Line A';
  const group2Name = config?.groups?.[1]?.name ?? 'Line B';
  const group1Ids  = new Set(config?.groups?.[0]?.playerIds ?? []);
  const group2Ids  = new Set(config?.groups?.[1]?.playerIds ?? []);

  const playerRows = players.map(p => {
    const inG1 = group1Ids.has(p.id);
    const inG2 = group2Ids.has(p.id);
    const assignment = inG1 ? '0' : inG2 ? '1' : 'none';

    const activeStyle = 'background:var(--orange);color:#000;border-color:var(--orange);';

    return `
      <div class="player-detail-row" data-player-id="${p.id}">
        <div class="roster-avatar">${_strategyInitials(p.name)}</div>
        <div class="pdr-info">
          <div class="pdr-name">${_esc(p.name)}</div>
        </div>
        <div style="display:flex;gap:4px;">
          <button class="stepper-btn pg-btn${assignment === '0' ? ' active' : ''}"
            data-group="0" data-player-id="${p.id}"
            style="${assignment === '0' ? activeStyle : ''}">A</button>
          <button class="stepper-btn pg-btn${assignment === '1' ? ' active' : ''}"
            data-group="1" data-player-id="${p.id}"
            style="${assignment === '1' ? activeStyle : ''}">B</button>
          <button class="stepper-btn pg-btn${assignment === 'none' ? ' active' : ''}"
            data-group="none" data-player-id="${p.id}"
            style="${assignment === 'none' ? activeStyle : ''}">—</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="margin-top: 20px;">
      <div class="input-group">
        <label class="input-label">Group 1 Name</label>
        <input class="input-field" id="pg-group1-name" type="text" maxlength="12"
          value="${_esc(group1Name)}" autocomplete="off" />
      </div>
      <div class="input-group" style="margin-top: 12px;">
        <label class="input-label">Group 2 Name</label>
        <input class="input-field" id="pg-group2-name" type="text" maxlength="12"
          value="${_esc(group2Name)}" autocomplete="off" />
      </div>
      <div class="input-label" style="margin-top: 16px; margin-bottom: 8px;">Player Assignment</div>
      <div id="pg-player-list">
        ${playerRows || '<div style="color:var(--muted);font-size:13px;padding:8px 0;">No players on roster.</div>'}
      </div>
    </div>
  `;
}

function _manualNudgePanelHTML(players, config, sport) {
  const alertMinutes  = config?.alertMinutes ?? 10;
  const goalieLocked  = config?.goalieLocked ?? null;
  const isSoccer      = sport === 'soccer';

  const alertLabel = alertMinutes === 0
    ? 'Alerts disabled'
    : `Alert when a player sits longer than ${alertMinutes} minutes`;

  const goalieOptions = [
    '<option value="">None</option>',
    ...players.map(p =>
      `<option value="${p.id}"${goalieLocked === p.id ? ' selected' : ''}>${_esc(p.name)}</option>`
    ),
  ].join('');

  const goalieBlock = isSoccer ? `
    <div class="input-group" style="margin-top: 16px;">
      <label class="input-label">Lock goalie position</label>
      <select class="input-field" id="mn-goalie-select">
        ${goalieOptions}
      </select>
    </div>
  ` : '';

  return `
    <div style="margin-top: 20px;">
      <div class="input-group">
        <label class="input-label" id="mn-alert-label">${alertLabel}</label>
        ${_stepperHTML('mn-alert-val', alertMinutes, 0, 30)}
      </div>
      ${goalieBlock}
    </div>
  `;
}

// ── BINDING ───────────────────────────────────────────────────

function _bindStrategy(container, coach, team, season, players, strategy) {
  const sport = team.sport || 'generic';
  let selectedMode = strategy?.mode || 'manual_nudge';

  // Back button
  container.querySelector('#btn-back')?.addEventListener('click', () => {
    router_navigate('team', { coach, team, season });
  });

  // Mode chip switching
  container.querySelectorAll('.mode-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (chip.dataset.mode === selectedMode) return;
      selectedMode = chip.dataset.mode;

      container.querySelectorAll('.mode-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const panel = container.querySelector('#strategy-config-panel');
      panel.innerHTML = _modePanelHTML(selectedMode, players, null, sport);
      _bindModePanel(container, selectedMode, players, sport);
    });
  });

  // Bind the initially rendered panel
  _bindModePanel(container, selectedMode, players, sport);

  // Save button
  const saveBtn = container.querySelector('#btn-save-strategy');
  const msgEl   = container.querySelector('#strategy-msg');

  saveBtn?.addEventListener('click', async () => {
    const config = _collectStrategyConfig(container, selectedMode);

    // Validation
    if (selectedMode === 'strict_queue') {
      const order = config.playerOrder || [];
      if (order.length < 2) {
        msgEl.style.color = 'var(--red)';
        msgEl.textContent = 'Add at least 2 players to the roster first.';
        return;
      }
    }
    if (selectedMode === 'pair_group') {
      const g1 = container.querySelector('#pg-group1-name')?.value.trim();
      const g2 = container.querySelector('#pg-group2-name')?.value.trim();
      if (!g1 || !g2) {
        msgEl.style.color = 'var(--red)';
        msgEl.textContent = 'Both group names must be non-empty.';
        return;
      }
      const totalAssigned =
        (config.groups?.[0]?.playerIds?.length || 0) +
        (config.groups?.[1]?.playerIds?.length || 0);
      if (totalAssigned < 2) {
        msgEl.style.color = 'var(--red)';
        msgEl.textContent = 'Assign at least 2 players across both groups.';
        return;
      }
    }

    saveBtn.textContent = 'Saving…';
    saveBtn.disabled    = true;
    msgEl.textContent   = '';

    const result = await db_upsertStrategy(team.id, selectedMode, config);

    saveBtn.textContent = 'SAVE STRATEGY';
    saveBtn.disabled    = false;

    if (result) {
      msgEl.style.color = 'var(--lime)';
      msgEl.textContent = 'Strategy saved.';
      setTimeout(() => {
        if (msgEl.textContent === 'Strategy saved.') msgEl.textContent = '';
      }, 3000);
    } else {
      msgEl.style.color = 'var(--red)';
      msgEl.textContent = 'Something went wrong. Try again.';
    }
  });
}

function _bindModePanel(container, mode, players, sport) {
  // Bind all steppers in the panel
  container.querySelectorAll('.stepper-btn[data-stepper]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.stepper;
      const dir      = parseInt(btn.dataset.dir, 10);
      const min      = parseInt(btn.dataset.min, 10);
      const max      = parseInt(btn.dataset.max, 10);
      const valEl    = container.querySelector(`#${targetId}`);
      if (!valEl) return;
      let val = parseInt(valEl.textContent, 10) + dir;
      val = Math.max(min, Math.min(max, val));
      valEl.textContent = val;

      // Update dynamic alert label for manual_nudge
      if (targetId === 'mn-alert-val') {
        const labelEl = container.querySelector('#mn-alert-label');
        if (labelEl) {
          labelEl.textContent = val === 0
            ? 'Alerts disabled'
            : `Alert when a player sits longer than ${val} minutes`;
        }
      }
    });
  });

  // Pair/group player assignment toggles
  if (mode === 'pair_group') {
    container.querySelectorAll('#pg-player-list .pg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const playerId = btn.dataset.playerId;
        const row = container.querySelector(`#pg-player-list [data-player-id="${playerId}"]`);
        if (!row) return;
        row.querySelectorAll('.pg-btn').forEach(b => {
          b.classList.remove('active');
          b.style.background   = '';
          b.style.color        = '';
          b.style.borderColor  = '';
        });
        btn.classList.add('active');
        btn.style.background  = 'var(--orange)';
        btn.style.color       = '#000';
        btn.style.borderColor = 'var(--orange)';
      });
    });
  }

  // Drag-to-sort for strict_queue
  if (mode === 'strict_queue') {
    _bindDragSort(container);
  }
}

// ── CONFIG COLLECTION ─────────────────────────────────────────

function _collectStrategyConfig(container, mode) {
  switch (mode) {
    case 'strict_queue': {
      const rotateN = parseInt(
        container.querySelector('#sq-rotate-val')?.textContent || '1', 10
      );
      const playerOrder = [...container.querySelectorAll('#sq-player-list [data-player-id]')]
        .map(el => el.dataset.playerId);
      return { rotateN, playerOrder };
    }
    case 'timer_swap': {
      const intervalMinutes = parseInt(
        container.querySelector('#ts-interval-val')?.textContent || '5', 10
      );
      const swapCount = parseInt(
        container.querySelector('#ts-swap-val')?.textContent || '1', 10
      );
      return { intervalMinutes, swapCount };
    }
    case 'pair_group': {
      const group1Name = container.querySelector('#pg-group1-name')?.value.trim() || 'Line A';
      const group2Name = container.querySelector('#pg-group2-name')?.value.trim() || 'Line B';
      const group1Ids  = [];
      const group2Ids  = [];
      const unassigned = [];
      container.querySelectorAll('#pg-player-list [data-player-id]').forEach(row => {
        const playerId  = row.dataset.playerId;
        const activeBtn = row.querySelector('.pg-btn.active');
        const group     = activeBtn?.dataset.group;
        if (group === '0')    group1Ids.push(playerId);
        else if (group === '1') group2Ids.push(playerId);
        else                  unassigned.push(playerId);
      });
      return {
        groups: [
          { name: group1Name, playerIds: group1Ids },
          { name: group2Name, playerIds: group2Ids },
        ],
        unassigned,
      };
    }
    case 'manual_nudge': {
      const alertMinutes = parseInt(
        container.querySelector('#mn-alert-val')?.textContent || '10', 10
      );
      const goalieVal    = container.querySelector('#mn-goalie-select')?.value || '';
      return { alertMinutes, goalieLocked: goalieVal || null };
    }
    default:
      return {};
  }
}

// ── DRAG-TO-SORT ──────────────────────────────────────────────

function _bindDragSort(container) {
  const list = container.querySelector('#sq-player-list');
  if (!list) return;

  let dragEl      = null;
  let placeholder = null;
  let offsetY     = 0;

  function clientY(e) {
    return e.touches ? e.touches[0].clientY : e.clientY;
  }

  function onStart(e) {
    const row = e.target.closest('.sq-player-row');
    if (!row) return;
    e.preventDefault();

    dragEl  = row;
    const rect = row.getBoundingClientRect();
    offsetY = clientY(e) - rect.top;

    // Create placeholder
    placeholder = document.createElement('div');
    placeholder.style.cssText =
      `height:${rect.height}px;background:var(--card2);border-radius:var(--radius-sm);` +
      `margin:4px 0;border:1px dashed var(--muted);box-sizing:border-box;`;
    row.parentNode.insertBefore(placeholder, row.nextSibling);

    // Float the row
    row.style.cssText +=
      `;position:fixed;z-index:1000;width:${rect.width}px;` +
      `top:${rect.top}px;left:${rect.left}px;opacity:0.92;` +
      `box-shadow:0 4px 16px rgba(0,0,0,0.35);pointer-events:none;`;

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend',  onEnd);
  }

  function onMove(e) {
    if (!dragEl) return;
    e.preventDefault();

    const y = clientY(e);
    dragEl.style.top = `${y - offsetY}px`;

    const rows = [...list.querySelectorAll('.sq-player-row')];
    let target = null;
    for (const row of rows) {
      if (row === dragEl) continue;
      const r = row.getBoundingClientRect();
      if (y < r.top + r.height / 2) { target = row; break; }
    }
    if (target) list.insertBefore(placeholder, target);
    else        list.appendChild(placeholder);
  }

  function onEnd() {
    if (!dragEl) return;

    // Reset float styles
    dragEl.style.position    = '';
    dragEl.style.zIndex      = '';
    dragEl.style.width       = '';
    dragEl.style.top         = '';
    dragEl.style.left        = '';
    dragEl.style.opacity     = '';
    dragEl.style.boxShadow   = '';
    dragEl.style.pointerEvents = '';

    list.insertBefore(dragEl, placeholder);
    placeholder.remove();

    dragEl      = null;
    placeholder = null;

    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend',  onEnd);
  }

  list.querySelectorAll('.sq-drag-handle').forEach(handle => {
    handle.addEventListener('mousedown',  onStart);
    handle.addEventListener('touchstart', onStart, { passive: false });
  });
}

// ── HELPERS ───────────────────────────────────────────────────

function _stepperHTML(id, val, min, max) {
  return `
    <div class="stepper">
      <button class="stepper-btn" data-stepper="${id}" data-dir="-1"
        data-min="${min}" data-max="${max}">−</button>
      <span class="stepper-val" id="${id}">${val}</span>
      <button class="stepper-btn" data-stepper="${id}" data-dir="1"
        data-min="${min}" data-max="${max}">+</button>
    </div>
  `;
}

function _strategyFieldSize(sport) {
  return sport === 'football' ? 7 : 5;
}

function _strategyInitials(name) {
  return String(name).split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
}

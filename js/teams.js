// =============================================================
// teams.js — home screen, create team, team detail
// =============================================================

// ── HOME SCREEN ───────────────────────────────────────────────

router_register('home', async (container, { coach } = {}) => {
  if (!coach) {
    container.innerHTML = _homeSignedOut();
    _bindHomeSignedOut(container);
    return;
  }

  container.innerHTML = _homeLoading();
  const teams = await db_getTeams(coach.id);
  container.innerHTML = _homeSignedIn(coach, teams);
  _bindHomeSignedIn(container, coach, teams);
});

// ── SIGN IN SCREEN ────────────────────────────────────────────

router_register('signin', (container) => {
  container.innerHTML = _signinHTML();
  _bindSignin(container);
});

// ── CREATE TEAM SCREEN ────────────────────────────────────────

router_register('create-team', (container, { coach }) => {
  container.innerHTML = _createTeamHTML();
  _bindCreateTeam(container, coach);
});

// ── TEAM DETAIL SCREEN ────────────────────────────────────────

router_register('team', async (container, { coach, team, editorMode }) => {
  container.innerHTML = _teamLoading(team);

  const [players, season] = await Promise.all([
    db_getPlayers(team.id),
    db_getActiveSeason(team.id),
  ]);

  const recentGames = season ? await db_getRecentGames(season.id, 5) : [];

  container.innerHTML = _teamDetailHTML(team, players, season, recentGames, editorMode);
  _bindTeamDetail(container, coach, team, players, season, editorMode);
});

// ── HOME TEMPLATES ────────────────────────────────────────────

function _homeSignedOut() {
  return `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
        </div>
        <div class="home-hero">
          <div class="hero-icon">🏟️</div>
          <div class="hero-title">Run Your <span>Rotation.</span></div>
          <div class="hero-sub">Youth sports sideline tool for coaches who care about playing time.</div>
        </div>
        <div class="home-actions">
          <button class="btn-primary" id="btn-signin">Sign In as Coach</button>
          <button class="btn-ghost" id="btn-editor">Join as Assistant Coach</button>
          <button class="btn-ghost" id="btn-spectator">Watch as Spectator</button>
        </div>
        <div style="padding: 0 20px 32px;">
          <div class="privacy-note">
            <span class="icon">🔒</span>
            <span>We only store your email. No passwords, no profile, no data sold.</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function _homeLoading() {
  return `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
        </div>
        <div style="padding: 40px 20px; text-align: center; color: var(--muted);
          font-family: 'JetBrains Mono', monospace; font-size: 12px;">Loading...</div>
      </div>
    </div>
  `;
}

function _homeSignedIn(coach, teams) {
  const initials = coach.email.slice(0, 2).toUpperCase();
  const teamCards = teams.length
    ? teams.map(t => _teamCardHTML(t)).join('')
    : `<div style="padding: 16px 0; color: var(--muted); font-size: 13px;">
         No teams yet — create your first one.
       </div>`;

  return `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-menu" title="${_esc(coach.email)}">${initials}</div>
        </div>
        <div class="auth-banner">
          <div class="dot"></div>
          <div>Signed in as <strong>${_esc(coach.email)}</strong></div>
        </div>
        <div class="section-title">Your Teams</div>
        <div class="recent-list" id="teams-list">${teamCards}</div>
        <div class="home-actions">
          <button class="btn-primary" id="btn-new-team">+ New Team</button>
        </div>
      </div>
    </div>
  `;
}

function _teamCardHTML(team) {
  const sport = team.sport || 'generic';
  const emoji = sport === 'soccer' ? '⚽' : sport === 'football' ? '🏈' : '🏅';
  const badgeClass = sport === 'soccer' ? 'badge-soccer' : sport === 'football' ? 'badge-football' : 'badge-generic';
  const badgeLabel = sport === 'soccer' ? 'SOCCER' : sport === 'football' ? 'FOOTBALL' : 'GENERIC';
  const activeSeason = team.seasons?.find(s => s.active);
  const seasonLabel = activeSeason ? activeSeason.name : 'No active season';

  return `
    <div class="team-card" data-team-id="${team.id}">
      <div class="team-icon">${emoji}</div>
      <div class="team-info">
        <div class="team-name">${_esc(team.name)}</div>
        <div class="team-meta">${_esc(seasonLabel)} · ${_esc(team.short_code)}</div>
      </div>
      <div class="team-badge ${badgeClass}">${badgeLabel}</div>
    </div>
  `;
}

// ── TEAM DETAIL TEMPLATES ─────────────────────────────────────

function _teamLoading(team) {
  return `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-back">←</div>
        </div>
        <div style="padding: 40px 20px; text-align: center; color: var(--muted);
          font-family: 'JetBrains Mono', monospace; font-size: 12px;">Loading ${_esc(team.name)}...</div>
      </div>
    </div>
  `;
}

function _teamDetailHTML(team, players, season, recentGames, editorMode) {
  const sport  = team.sport || 'generic';
  const emoji  = sport === 'soccer' ? '⚽' : sport === 'football' ? '🏈' : '🏅';
  const badgeClass = sport === 'soccer' ? 'badge-soccer' : sport === 'football' ? 'badge-football' : 'badge-generic';
  const badgeLabel = sport === 'soccer' ? 'SOCCER' : sport === 'football' ? 'FOOTBALL' : 'GENERIC';

  const seasonBlock = season
    ? `<div class="team-detail-season">
         <div class="tds-label">Active Season</div>
         <div class="tds-name">${_esc(season.name)}</div>
         <div class="tds-games">${recentGames.length} game${recentGames.length !== 1 ? 's' : ''} recorded</div>
       </div>`
    : `<div class="team-detail-season">
         <div class="tds-label">No active season</div>
       </div>`;

  const coachMeta = !editorMode ? `
    <div class="team-codes-row">
      <div class="team-code-block" id="copy-editor-code" data-code="${_esc(team.editor_code)}" title="Tap to copy">
        <div class="code-label">EDITOR CODE</div>
        <div class="code-val">${_esc(team.editor_code)}</div>
        <div class="code-hint">Share with assistant coach</div>
      </div>
      <div class="team-code-block">
        <div class="code-label">TEAM CODE</div>
        <div class="code-val">${_esc(team.short_code)}</div>
        <div class="code-hint">Used in share links</div>
      </div>
    </div>
  ` : '';

  const playerRows = players.length
    ? players.map(p => _playerRowHTML(p)).join('')
    : `<div style="padding: 12px 0; color: var(--muted); font-size: 13px;">
         No players yet — add your first one below.
       </div>`;

  const addPlayerForm = !editorMode ? `
    <div class="add-player-form" id="add-player-form">
      <div class="add-player-fields">
        <input class="input-field" id="new-player-name" type="text"
          placeholder="Player name" autocomplete="off"
          style="flex: 1;" />
        <input class="input-field" id="new-player-jersey" type="text"
          placeholder="#" autocomplete="off"
          style="width: 56px; text-align: center;
            font-family: 'JetBrains Mono', monospace;" maxlength="3" />
        <button class="btn-add-player" id="btn-add-player">+</button>
      </div>
      <div id="add-player-msg" style="font-size: 12px; color: var(--red);
        margin-top: 6px; min-height: 18px;"></div>
    </div>
  ` : '';

  const startGameBtn = `
    <div style="padding: 20px 20px 8px;">
      <button class="btn-primary" id="btn-start-game"
        ${!season ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>
        Create Game
      </button>
      ${!season ? '<div style="text-align:center;font-size:11px;color:var(--muted);margin-top:6px;">No active season — create one first.</div>' : ''}
    </div>
  `;

  return `
    <div class="screen">
      <div class="screen-body">

        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-back">←</div>
        </div>

        <!-- Team hero -->
        <div class="team-detail-hero">
          <div class="tdh-icon">${emoji}</div>
          <div class="tdh-info">
            <div class="tdh-name">${_esc(team.name)}</div>
            <div class="tdh-badge-row">
              <span class="team-badge ${badgeClass}">${badgeLabel}</span>
              ${editorMode ? '<span class="editor-mode-badge">EDITOR MODE</span>' : ''}
            </div>
          </div>
        </div>

        ${seasonBlock}
        ${coachMeta}

        <!-- Start game -->
        ${startGameBtn}

        <!-- Roster -->
        <div class="divider" style="margin-top: 8px;"></div>
        <div class="section-title">
          Roster
          <span style="font-family:'JetBrains Mono',monospace; font-size:11px;
            color:var(--muted); font-weight:400; letter-spacing:0; margin-left:6px;">
            ${players.length} player${players.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div class="roster-list" id="roster-list" style="padding: 0 20px;">
          ${playerRows}
        </div>

        ${addPlayerForm}

        <div style="height: 40px;"></div>
      </div>
    </div>
  `;
}

function _playerRowHTML(player) {
  const initials = player.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const jersey   = player.jersey_number ? `#${player.jersey_number}` : '—';

  return `
    <div class="player-detail-row" data-player-id="${player.id}">
      <div class="roster-avatar">${initials}</div>
      <div class="pdr-info">
        <div class="pdr-name">${_esc(player.name)}</div>
        <div class="pdr-jersey font-mono">${jersey}</div>
      </div>
      <button class="pdr-remove" data-player-id="${player.id}" title="Remove player">✕</button>
    </div>
  `;
}

// ── SIGN IN TEMPLATE ──────────────────────────────────────────

function _signinHTML() {
  return `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-back">←</div>
        </div>
        <div class="signin-body">
          <div class="signin-intro">
            <div class="icon">📧</div>
            <h2>Coach Sign In</h2>
            <p>Enter your email and we'll send you a sign-in link. No password needed.</p>
          </div>
          <div class="input-group">
            <label class="input-label" for="email-input">Email Address</label>
            <input class="input-field" id="email-input" type="email"
              placeholder="you@example.com" autocomplete="email" />
          </div>
          <div class="privacy-note">
            <span class="icon">🔒</span>
            <span>We only store your email address — nothing else personal, ever.</span>
          </div>
          <button class="btn-primary" id="btn-send-link">Send Sign-In Link</button>
          <div id="signin-msg" style="margin-top:16px; font-size:13px;
            text-align:center; color:var(--muted);"></div>

          <div style="margin-top: 24px;">
            <div class="divider"></div>
            <div class="section-title" style="padding: 0; margin-bottom: 10px;">Assistant Coach?</div>
            <div class="input-group">
              <label class="input-label" for="editor-code-input">Editor Code</label>
              <input class="input-field" id="editor-code-input" type="text"
                placeholder="ABC123" maxlength="6"
                style="font-family:'JetBrains Mono',monospace;
                  letter-spacing:3px; text-transform:uppercase;" />
            </div>
            <button class="btn-ghost" id="btn-editor-join">Join as Assistant Coach</button>
            <div id="editor-msg" style="margin-top:10px; font-size:13px;
              text-align:center; color:var(--muted);"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ── CREATE TEAM TEMPLATE ──────────────────────────────────────

function _createTeamHTML() {
  return `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-back">←</div>
        </div>
        <div class="create-body">
          <div class="section-title" style="padding:0; margin-bottom:16px;">New Team</div>
          <div class="input-group">
            <label class="input-label" for="team-name-input">Team Name</label>
            <input class="input-field" id="team-name-input" type="text"
              placeholder="e.g. Lightning U10" autocomplete="off" />
          </div>
          <div class="input-label" style="margin-bottom:8px;">Sport</div>
          <div class="sport-grid" id="sport-grid">
            <div class="sport-pill active" data-sport="soccer">
              <span class="sport-emoji">⚽</span>
              <span class="sport-name">Rec Soccer</span>
            </div>
            <div class="sport-pill" data-sport="football">
              <span class="sport-emoji">🏈</span>
              <span class="sport-name">Flag Football</span>
            </div>
            <div class="sport-pill" data-sport="generic">
              <span class="sport-emoji">🏅</span>
              <span class="sport-name">Generic</span>
            </div>
          </div>
          <div id="create-team-msg"
            style="margin-bottom:12px; font-size:13px; color:var(--red); min-height:20px;"></div>
          <button class="btn-primary" id="btn-create-team">Create Team</button>
        </div>
      </div>
    </div>
  `;
}

// ── BINDINGS ──────────────────────────────────────────────────

function _bindHomeSignedOut(container) {
  container.querySelector('#btn-signin')?.addEventListener('click', () => {
    router_navigate('signin');
  });
  container.querySelector('#btn-editor')?.addEventListener('click', () => {
    router_navigate('signin');
    setTimeout(() => document.getElementById('editor-code-input')?.focus(), 50);
  });
  container.querySelector('#btn-spectator')?.addEventListener('click', () => {
    alert('Enter a share link from your coach to watch as a spectator.');
  });
}

function _bindHomeSignedIn(container, coach, teams) {
  container.querySelector('#btn-new-team')?.addEventListener('click', () => {
    router_navigate('create-team', { coach });
  });
  container.querySelector('#btn-menu')?.addEventListener('click', () => {
    if (confirm('Sign out?')) auth_signOut();
  });
  container.querySelectorAll('.team-card').forEach(card => {
    card.addEventListener('click', () => {
      const team = teams.find(t => t.id === card.dataset.teamId);
      if (team) router_navigate('team', { coach, team });
    });
  });
}

function _bindTeamDetail(container, coach, team, players, season, editorMode) {
  // Back
  container.querySelector('#btn-back')?.addEventListener('click', () => {
    router_navigate('home', { coach });
  });

  // Start game
  container.querySelector('#btn-start-game')?.addEventListener('click', () => {
    if (!season) return;
    router_navigate('create-game', { coach, team, season });
  });

  // Copy editor code
  container.querySelector('#copy-editor-code')?.addEventListener('click', (e) => {
    const code = e.currentTarget.dataset.code;
    navigator.clipboard.writeText(code).then(() => {
      const hint = e.currentTarget.querySelector('.code-hint');
      if (hint) {
        hint.textContent = 'Copied!';
        hint.style.color = 'var(--lime)';
        setTimeout(() => {
          hint.textContent = 'Share with assistant coach';
          hint.style.color = '';
        }, 2000);
      }
    });
  });

  // Remove player
  container.querySelectorAll('.pdr-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const playerId = btn.dataset.playerId;
      const player   = players.find(p => p.id === playerId);
      if (!player) return;
      if (!confirm(`Remove ${player.name} from the roster?`)) return;

      btn.disabled = true;
      await db_deactivatePlayer(playerId);

      // Remove row from DOM without full re-render
      const row = container.querySelector(`.player-detail-row[data-player-id="${playerId}"]`);
      if (row) row.remove();

      // Update count label
      const remaining = container.querySelectorAll('.player-detail-row').length;
      const countEl = container.querySelector('.section-title span');
      if (countEl) countEl.textContent = `${remaining} player${remaining !== 1 ? 's' : ''}`;
    });
  });

  // Add player
  if (!editorMode) {
    const nameInput   = container.querySelector('#new-player-name');
    const jerseyInput = container.querySelector('#new-player-jersey');
    const addBtn      = container.querySelector('#btn-add-player');
    const msgEl       = container.querySelector('#add-player-msg');
    const rosterList  = container.querySelector('#roster-list');

    // Allow submitting with Enter key
    [nameInput, jerseyInput].forEach(input => {
      input?.addEventListener('keydown', e => {
        if (e.key === 'Enter') addBtn?.click();
      });
    });

    addBtn?.addEventListener('click', async () => {
      const name   = nameInput?.value.trim();
      const jersey = jerseyInput?.value.trim();

      if (!name) {
        msgEl.textContent = 'Player name is required.';
        nameInput?.focus();
        return;
      }

      addBtn.textContent  = '...';
      addBtn.disabled     = true;
      msgEl.textContent   = '';

      const player = await db_createPlayer({ teamId: team.id, name, jerseyNumber: jersey });

      addBtn.textContent = '+';
      addBtn.disabled    = false;

      if (!player) {
        msgEl.textContent = 'Something went wrong. Try again.';
        return;
      }

      // Append new row to DOM
      const noPlayersMsg = rosterList?.querySelector('div[style]');
      if (noPlayersMsg) noPlayersMsg.remove();

      const div = document.createElement('div');
      div.innerHTML = _playerRowHTML(player);
      const newRow = div.firstElementChild;
      rosterList?.appendChild(newRow);

      // Bind remove on the new row
      newRow?.querySelector('.pdr-remove')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Remove ${player.name} from the roster?`)) return;
        await db_deactivatePlayer(player.id);
        newRow.remove();
        const remaining = container.querySelectorAll('.player-detail-row').length;
        const countEl = container.querySelector('.section-title span');
        if (countEl) countEl.textContent = `${remaining} player${remaining !== 1 ? 's' : ''}`;
      });

      // Update count
      const remaining = container.querySelectorAll('.player-detail-row').length;
      const countEl = container.querySelector('.section-title span');
      if (countEl) countEl.textContent = `${remaining} player${remaining !== 1 ? 's' : ''}`;

      // Clear inputs
      if (nameInput)   nameInput.value   = '';
      if (jerseyInput) jerseyInput.value = '';
      nameInput?.focus();
    });
  }
}

function _bindSignin(container) {
  container.querySelector('#btn-back')?.addEventListener('click', () => {
    router_navigate('home', { coach: auth_getSession() });
  });

  const msgEl      = container.querySelector('#signin-msg');
  const emailBtn   = container.querySelector('#btn-send-link');
  const emailInput = container.querySelector('#email-input');

  emailInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') emailBtn?.click();
  });

  emailBtn?.addEventListener('click', async () => {
    const email = emailInput?.value.trim();
    if (!email || !email.includes('@')) {
      msgEl.textContent = 'Please enter a valid email address.';
      msgEl.style.color = 'var(--red)';
      return;
    }
    emailBtn.textContent = 'Sending...';
    emailBtn.disabled    = true;

    const result = await auth_sendMagicLink(email);

    emailBtn.textContent = 'Send Sign-In Link';
    emailBtn.disabled    = false;

    msgEl.style.color = result.ok ? 'var(--lime)' : 'var(--red)';
    msgEl.textContent = result.ok
      ? '✓ Check your email for a sign-in link.'
      : result.message;
  });

  // Editor code
  const editorMsg   = container.querySelector('#editor-msg');
  const editorInput = container.querySelector('#editor-code-input');
  const editorBtn   = container.querySelector('#btn-editor-join');

  editorInput?.addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });
  editorInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') editorBtn?.click();
  });

  editorBtn?.addEventListener('click', async () => {
    const code = editorInput?.value.trim();
    if (code.length !== 6) {
      editorMsg.style.color = 'var(--red)';
      editorMsg.textContent = 'Editor code must be 6 characters.';
      return;
    }
    editorBtn.textContent = 'Checking...';
    editorBtn.disabled    = true;

    const result = await auth_signInWithEditorCode(code);

    editorBtn.textContent = 'Join as Assistant Coach';
    editorBtn.disabled    = false;

    if (result.ok) {
      router_navigate('team', { team: result.team, editorMode: true });
    } else {
      editorMsg.style.color = 'var(--red)';
      editorMsg.textContent = result.message;
    }
  });
}

function _bindCreateTeam(container, coach) {
  let selectedSport = 'soccer';

  container.querySelectorAll('.sport-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      container.querySelectorAll('.sport-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedSport = pill.dataset.sport;
    });
  });

  container.querySelector('#btn-back')?.addEventListener('click', () => {
    router_navigate('home', { coach });
  });

  const msgEl    = container.querySelector('#create-team-msg');
  const createBtn = container.querySelector('#btn-create-team');

  container.querySelector('#team-name-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') createBtn?.click();
  });

  createBtn?.addEventListener('click', async () => {
    const name = container.querySelector('#team-name-input')?.value.trim();
    if (!name) { msgEl.textContent = 'Team name is required.'; return; }

    createBtn.textContent = 'Creating...';
    createBtn.disabled    = true;
    msgEl.textContent     = '';

    const team = await db_createTeam({ coachId: coach.id, name, sport: selectedSport });

    createBtn.textContent = 'Create Team';
    createBtn.disabled    = false;

    if (!team) { msgEl.textContent = 'Something went wrong. Try again.'; return; }

    router_navigate('home', { coach });
  });
}

// ── UTILS ─────────────────────────────────────────────────────

function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

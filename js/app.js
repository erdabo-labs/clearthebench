// =============================================================
// app.js — home, signin, create-team, team detail screens
// =============================================================

// ── HTML ESCAPING ─────────────────────────────────────────────

function _esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

// ── ACTIVE GAME RECOVERY ──────────────────────────────────────

function _getActiveGameKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('ctb_active_game_')) keys.push(key);
  }
  return keys;
}

function _cleanupStaleGameKeys() {
  const DAY_MS = 24 * 60 * 60 * 1000;
  for (const key of _getActiveGameKeys()) {
    try {
      const data = JSON.parse(localStorage.getItem(key));
      if (data?.savedAt && (Date.now() - data.savedAt) > DAY_MS) {
        localStorage.removeItem(key);
      }
    } catch (e) { localStorage.removeItem(key); }
  }
}

// ── HOME SCREEN ───────────────────────────────────────────────

router_register('home', async (container, { coach } = {}) => {
  _cleanupStaleGameKeys();

  // Check for recoverable active game
  const recoveryKeys = _getActiveGameKeys();
  if (recoveryKeys.length > 0) {
    try {
      const snapshot = JSON.parse(localStorage.getItem(recoveryKeys[0]));
      if (snapshot?.gameId) {
        container.innerHTML = `
          <div class="screen">
            <div class="screen-body">
              <div class="app-header">
                <div class="app-logo">Clear<span>The</span>Bench</div>
              </div>
              <div class="recovery-card">
                <div class="recovery-icon">&#9917;</div>
                <div class="recovery-title">ACTIVE GAME FOUND</div>
                <div class="recovery-sub">You have a game in progress. Resume?</div>
                <button class="btn-primary" id="btn-resume-game">RESUME GAME</button>
                <button class="btn-ghost" id="btn-discard-game">Discard &amp; Go Home</button>
              </div>
            </div>
          </div>
        `;
        container.querySelector('#btn-resume-game')?.addEventListener('click', () => {
          router_navigate('game', { gameId: snapshot.gameId, coach });
        });
        container.querySelector('#btn-discard-game')?.addEventListener('click', () => {
          recoveryKeys.forEach(k => localStorage.removeItem(k));
          router_navigate('home', { coach });
        });
        return;
      }
    } catch (e) {
      recoveryKeys.forEach(k => localStorage.removeItem(k));
    }
  }

  if (!coach) {
    container.innerHTML = `
      <div class="screen">
        <div class="screen-body">
          <div class="app-header">
            <div class="app-logo">Clear<span>The</span>Bench</div>
          </div>
          <div class="home-hero">
            <div class="hero-pitch"></div>
            <div class="hero-title">Run Your <span>Rotation.</span></div>
            <div class="hero-sub">Track playing time so every kid gets their minutes.</div>
          </div>
          <div class="home-actions">
            <button class="btn-primary" id="btn-signin">Sign In</button>
          </div>
          <div class="privacy-note">
            <span>&#128274;</span>
            <span>We only store your email. No passwords, no data sold.</span>
          </div>
        </div>
      </div>
    `;
    container.querySelector('#btn-signin')?.addEventListener('click', () => {
      router_navigate('signin', {});
    });
    return;
  }

  // Signed in — load teams
  container.innerHTML = `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
        </div>
        <div class="loading-msg">Loading...</div>
      </div>
    </div>
  `;

  const teams = await db_getTeams(coach.id);

  // Check for active games across teams
  const activeGameChecks = await Promise.all(
    teams.map(async t => {
      const activeSeason = t.ctb_seasons?.find(s => s.active);
      if (!activeSeason) return null;
      const activeGame = await db_getActiveGame(activeSeason.id);
      return activeGame ? { team: t, season: activeSeason, game: activeGame } : null;
    })
  );
  const activeGames = activeGameChecks.filter(Boolean);

  const initials = coach.email.slice(0, 2).toUpperCase();
  const sportIcon = (sport) => sport === 'football' ? '&#127944;' : '&#9917;';

  const teamCards = teams.length
    ? teams.map(t => {
        const activeSeason = t.ctb_seasons?.find(s => s.active);
        const seasonLabel = activeSeason ? activeSeason.name : 'No active season';
        return `
          <div class="team-card" data-team-id="${t.id}">
            <div class="team-icon">${sportIcon(t.sport)}</div>
            <div class="team-info">
              <div class="team-name">${_esc(t.name)}</div>
              <div class="team-meta">${_esc(seasonLabel)}</div>
            </div>
            <div class="team-arrow">&#8250;</div>
          </div>
        `;
      }).join('')
    : '<div class="empty-state">No teams yet. Create your first one.</div>';

  const activeGameBanner = activeGames.length > 0 ? `
    <div class="section-title">Active Game</div>
    ${activeGames.map(ag => {
      const opponent = ag.game.opponent ? ` vs ${_esc(ag.game.opponent)}` : '';
      return `
        <div class="team-card active-game-card" data-game-id="${ag.game.id}"
          data-team-id="${ag.team.id}" data-season-id="${ag.season.id}">
          <div class="team-icon active-dot-wrap">${sportIcon(ag.team.sport)}</div>
          <div class="team-info">
            <div class="team-name">${_esc(ag.team.name)}${opponent}</div>
            <div class="team-meta active-meta">Active game &mdash; tap to resume</div>
          </div>
          <div class="team-arrow active-arrow">&#9654;</div>
        </div>
      `;
    }).join('')}
  ` : '';

  container.innerHTML = `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-menu" title="${_esc(coach.email)}">${initials}</div>
        </div>
        <div class="auth-banner">
          <div class="auth-dot"></div>
          <div>Signed in as <strong>${_esc(coach.email)}</strong></div>
        </div>
        ${activeGameBanner}
        <div class="section-title">Your Teams</div>
        <div class="teams-list" id="teams-list">${teamCards}</div>
        <div class="home-actions">
          <button class="btn-primary" id="btn-new-team">+ New Team</button>
        </div>
      </div>
    </div>
  `;

  // Bind team cards
  container.querySelectorAll('.team-card:not(.active-game-card)').forEach(card => {
    card.addEventListener('click', () => {
      const team = teams.find(t => t.id === card.dataset.teamId);
      if (team) router_navigate('team', { coach, team });
    });
  });

  // Bind active game cards
  container.querySelectorAll('.active-game-card').forEach(card => {
    card.addEventListener('click', () => {
      const team = teams.find(t => t.id === card.dataset.teamId);
      const season = team?.ctb_seasons?.find(s => s.id === card.dataset.seasonId);
      router_navigate('game', { gameId: card.dataset.gameId, coach, team, season });
    });
  });

  container.querySelector('#btn-new-team')?.addEventListener('click', () => {
    router_navigate('create-team', { coach });
  });

  // Menu (sign out)
  container.querySelector('#btn-menu')?.addEventListener('click', () => {
    _showMenu(container, coach);
  });
});

function _showMenu(container, coach) {
  const existing = document.getElementById('ctb-menu-overlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'ctb-menu-overlay';
  overlay.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">${_esc(coach.email)}</div>
      <button class="btn-ghost" id="btn-sign-out" style="color:var(--red);width:100%;margin-top:12px;">
        Sign Out
      </button>
      <div class="modal-cancel" id="menu-close">Close</div>
    </div>
  `;
  document.getElementById('app').appendChild(overlay);

  overlay.querySelector('#btn-sign-out')?.addEventListener('click', () => {
    overlay.remove();
    auth_signOut();
  });
  overlay.querySelector('#menu-close')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ── SIGN IN SCREEN ────────────────────────────────────────────

router_register('signin', (container) => {
  container.innerHTML = `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-back">&#8592;</div>
        </div>
        <div class="signin-body">
          <div class="section-title">SIGN IN</div>
          <div class="signin-sub">We'll email you an 8-digit sign-in code. (A magic link is included too — handy on a regular browser; the code is the way to go from a home-screen app.)</div>
          <div class="input-group">
            <label class="input-label" for="email-input">Email</label>
            <input class="input-field" id="email-input" type="email"
              placeholder="coach@example.com" autocomplete="email" />
          </div>
          <button class="btn-primary" id="btn-send-link">Send Sign-In Code</button>
          <div id="otp-section" style="display:none;margin-top:24px">
            <div class="input-group">
              <label class="input-label" for="otp-input">8-digit Code</label>
              <input class="input-field" id="otp-input" type="text" inputmode="numeric"
                pattern="[0-9]*" maxlength="8" autocomplete="one-time-code"
                placeholder="12345678" />
            </div>
            <button class="btn-primary" id="btn-verify-otp">Sign In with Code</button>
            <button class="btn-ghost" id="btn-resend" style="margin-top:8px">Resend Code</button>
          </div>
          <div id="signin-msg" class="form-msg"></div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-back')?.addEventListener('click', () => {
    router_navigate('home', {});
  });

  const emailInput = container.querySelector('#email-input');
  const sendBtn = container.querySelector('#btn-send-link');
  const otpSection = container.querySelector('#otp-section');
  const otpInput = container.querySelector('#otp-input');
  const verifyBtn = container.querySelector('#btn-verify-otp');
  const resendBtn = container.querySelector('#btn-resend');
  const msgEl = container.querySelector('#signin-msg');

  let sentEmail = null;

  async function sendCode() {
    const email = emailInput.value.trim();
    if (!email || !email.includes('@')) {
      msgEl.textContent = 'Please enter a valid email.';
      msgEl.className = 'form-msg error';
      return;
    }
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    if (resendBtn) { resendBtn.disabled = true; resendBtn.textContent = 'Sending...'; }
    const result = await auth_sendMagicLink(email);
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send Sign-In Code';
    if (resendBtn) { resendBtn.disabled = false; resendBtn.textContent = 'Resend Code'; }

    if (result.ok) {
      sentEmail = email;
      otpSection.style.display = '';
      sendBtn.style.display = 'none';
      msgEl.textContent = 'Check your email — the code is in there.';
      msgEl.className = 'form-msg success';
      otpInput.focus();
    } else {
      msgEl.textContent = result.message || 'Something went wrong.';
      msgEl.className = 'form-msg error';
    }
  }

  sendBtn?.addEventListener('click', sendCode);
  resendBtn?.addEventListener('click', sendCode);

  emailInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendBtn?.click();
  });

  otpInput?.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 8);
  });

  otpInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') verifyBtn?.click();
  });

  verifyBtn?.addEventListener('click', async () => {
    const code = otpInput.value.trim();
    if (code.length !== 8) {
      msgEl.textContent = 'Enter the 8-digit code from your email.';
      msgEl.className = 'form-msg error';
      return;
    }
    if (!sentEmail) {
      msgEl.textContent = 'Send the code first.';
      msgEl.className = 'form-msg error';
      return;
    }
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Signing in...';
    const result = await auth_verifyEmailOtp(sentEmail, code);
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Sign In with Code';

    if (result.ok && result.coach) {
      router_navigate('home', { coach: result.coach });
    } else {
      msgEl.textContent = result.message || 'Code did not match. Try resending.';
      msgEl.className = 'form-msg error';
    }
  });
});

// ── CREATE TEAM SCREEN ────────────────────────────────────────

router_register('create-team', (container, { coach }) => {
  container.innerHTML = `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-back">&#8592;</div>
        </div>
        <div class="create-body">
          <div class="section-title">NEW TEAM</div>
          <div class="input-group">
            <label class="input-label" for="team-name-input">Team Name</label>
            <input class="input-field" id="team-name-input" type="text"
              placeholder="e.g. Red Dragons" autocomplete="off" maxlength="40" />
          </div>
          <div class="input-group">
            <label class="input-label">Sport</label>
            <div class="sport-pills" id="sport-pills">
              <div class="sport-pill active" data-sport="soccer">
                <span class="sport-emoji">&#9917;</span>
                <span class="sport-name">Soccer</span>
              </div>
              <div class="sport-pill" data-sport="football">
                <span class="sport-emoji">&#127944;</span>
                <span class="sport-name">Flag Football</span>
              </div>
            </div>
          </div>
          <button class="btn-primary" id="btn-create-team">Create Team</button>
          <div id="create-team-msg" class="form-msg"></div>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#btn-back')?.addEventListener('click', () => {
    router_navigate('home', { coach });
  });

  let selectedSport = 'soccer';
  container.querySelectorAll('.sport-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      container.querySelectorAll('.sport-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedSport = pill.dataset.sport;
    });
  });

  const nameInput = container.querySelector('#team-name-input');
  const createBtn = container.querySelector('#btn-create-team');
  const msgEl = container.querySelector('#create-team-msg');

  createBtn?.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) {
      msgEl.textContent = 'Please enter a team name.';
      msgEl.className = 'form-msg error';
      return;
    }

    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';
    const team = await db_createTeam({ coachId: coach.id, name, sport: selectedSport });
    createBtn.disabled = false;
    createBtn.textContent = 'Create Team';

    if (!team) {
      msgEl.textContent = 'Something went wrong. Try again.';
      msgEl.className = 'form-msg error';
      return;
    }

    router_navigate('team', { coach, team });
  });

  nameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createBtn?.click();
  });
});

// ── TEAM DETAIL SCREEN ────────────────────────────────────────

router_register('team', async (container, { coach, team } = {}) => {
  container.innerHTML = `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-back">&#8592;</div>
        </div>
        <div class="loading-msg">Loading ${_esc(team.name)}...</div>
      </div>
    </div>
  `;

  const [players, season] = await Promise.all([
    db_getPlayers(team.id),
    db_getActiveSeason(team.id),
  ]);

  const activeGame = season ? await db_getActiveGame(season.id) : null;

  const playerRows = players.length
    ? players.map(p => {
        const jersey = p.jersey_number ? `#${_esc(p.jersey_number)}` : '';
        return `
          <div class="player-row" data-player-id="${p.id}">
            <div class="player-avatar">${_esc(p.name.slice(0, 2).toUpperCase())}</div>
            <div class="player-info">
              <div class="player-name-text">${_esc(p.name)}</div>
              ${jersey ? `<div class="player-jersey">${jersey}</div>` : ''}
            </div>
            <button class="btn-remove-player" data-player-id="${p.id}" title="Remove player">&#10005;</button>
          </div>
        `;
      }).join('')
    : '<div class="empty-state">No players yet. Add your roster below.</div>';

  const gameButtonLabel = activeGame ? 'Resume Game' : 'Start New Game';
  const gameButtonDisabled = !season ? 'disabled' : '';

  container.innerHTML = `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-back">&#8592;</div>
        </div>

        <div class="team-hero">
          <div class="team-hero-icon">${team.sport === 'football' ? '&#127944;' : '&#9917;'}</div>
          <div class="team-hero-name">${_esc(team.name)}</div>
        </div>

        <div class="section-title">ROSTER <span class="section-count">${players.length}</span></div>
        <div class="roster-list" id="roster-list">${playerRows}</div>

        <div class="add-player-form">
          <div class="add-player-fields">
            <input class="input-field" id="new-player-name" type="text"
              placeholder="Player name" autocomplete="off" />
            <input class="input-field player-jersey-input" id="new-player-jersey" type="text"
              placeholder="#" autocomplete="off" maxlength="3" />
            <button class="btn-add-player" id="btn-add-player">+</button>
          </div>
          <div id="add-player-msg" class="form-msg"></div>
        </div>

        <div class="team-actions">
          <button class="btn-primary" id="btn-start-game" ${gameButtonDisabled}>
            ${gameButtonLabel}
          </button>
          ${!season ? '<div class="hint-text">No active season.</div>' : ''}
        </div>

        <div class="danger-zone">
          <button class="btn-ghost btn-danger" id="btn-delete-team">Delete Team</button>
        </div>
      </div>
    </div>
  `;

  // Back
  container.querySelector('#btn-back')?.addEventListener('click', () => {
    router_navigate('home', { coach });
  });

  // Add player
  const nameInput = container.querySelector('#new-player-name');
  const jerseyInput = container.querySelector('#new-player-jersey');
  const addBtn = container.querySelector('#btn-add-player');
  const addMsg = container.querySelector('#add-player-msg');

  addBtn?.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) {
      addMsg.textContent = 'Enter a player name.';
      addMsg.className = 'form-msg error';
      return;
    }
    addBtn.disabled = true;
    const jersey = jerseyInput.value.trim();
    const player = await db_createPlayer({ teamId: team.id, name, jerseyNumber: jersey });
    addBtn.disabled = false;
    if (!player) {
      addMsg.textContent = 'Failed to add player.';
      addMsg.className = 'form-msg error';
      return;
    }
    // Re-render team screen
    router_navigate('team', { coach, team });
  });

  nameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn?.click();
  });
  jerseyInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn?.click();
  });

  // Remove player
  container.querySelectorAll('.btn-remove-player').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const playerId = btn.dataset.playerId;
      const player = players.find(p => p.id === playerId);
      if (player && confirm(`Remove ${player.name} from roster?`)) {
        await db_deactivatePlayer(playerId);
        router_navigate('team', { coach, team });
      }
    });
  });

  // Start / Resume game
  container.querySelector('#btn-start-game')?.addEventListener('click', () => {
    if (activeGame) {
      router_navigate('game', { gameId: activeGame.id, coach, team, season });
    } else {
      router_navigate('create-game', { coach, team, season });
    }
  });

  // Delete team
  container.querySelector('#btn-delete-team')?.addEventListener('click', async () => {
    if (confirm(`Delete ${team.name}? This removes all players, games, and data. Cannot be undone.`)) {
      await db_deleteTeam(team.id);
      router_navigate('home', { coach });
    }
  });
});

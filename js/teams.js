// =============================================================
// teams.js — home screen + create team
// =============================================================

// ── HOME SCREEN ───────────────────────────────────────────────

router_register('home', async (container, { coach } = {}) => {
  // Signed-out state
  if (!coach) {
    container.innerHTML = _homeSignedOut();
    _bindHomeSignedOut(container);
    return;
  }

  // Signed-in — load teams
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

// ── TEMPLATES ─────────────────────────────────────────────────

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

        <div style="padding: 0 20px; margin-bottom: 32px;">
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
        <div style="padding: 40px 20px; text-align: center; color: var(--muted); font-family: 'JetBrains Mono', monospace; font-size: 12px;">
          Loading...
        </div>
      </div>
    </div>
  `;
}

function _homeSignedIn(coach, teams) {
  const email = coach.email;
  const initials = email.slice(0, 2).toUpperCase();

  const teamCards = teams.length
    ? teams.map(t => _teamCardHTML(t)).join('')
    : `<div style="padding: 16px 0; color: var(--muted); font-size: 13px;">No teams yet — create your first one.</div>`;

  return `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-menu" title="${email}">${initials}</div>
        </div>

        <div class="auth-banner">
          <div class="dot"></div>
          <div>Signed in as <strong>${email}</strong></div>
        </div>

        <div class="section-title">Your Teams</div>
        <div class="recent-list" id="teams-list">
          ${teamCards}
        </div>

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
        <div class="team-meta">${seasonLabel} · ${team.short_code}</div>
      </div>
      <div class="team-badge ${badgeClass}">${badgeLabel}</div>
    </div>
  `;
}

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
            <input class="input-field" id="email-input" type="email" placeholder="you@example.com" autocomplete="email" />
          </div>

          <div class="privacy-note">
            <span class="icon">🔒</span>
            <span>We only store your email address — nothing else personal, ever.</span>
          </div>

          <button class="btn-primary" id="btn-send-link">Send Sign-In Link</button>

          <div id="signin-msg" style="margin-top: 16px; font-size: 13px; text-align: center; color: var(--muted);"></div>

          <div style="margin-top: 24px;">
            <div class="divider"></div>
            <div style="padding: 0; margin-bottom: 10px;">
              <div class="section-title" style="padding: 0;">Assistant Coach?</div>
            </div>
            <div class="input-group">
              <label class="input-label" for="editor-code-input">Editor Code</label>
              <input class="input-field" id="editor-code-input" type="text" placeholder="ABC123" maxlength="6"
                style="font-family: 'JetBrains Mono', monospace; letter-spacing: 3px; text-transform: uppercase;" />
            </div>
            <button class="btn-ghost" id="btn-editor-join">Join as Assistant Coach</button>
            <div id="editor-msg" style="margin-top: 10px; font-size: 13px; text-align: center; color: var(--muted);"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function _createTeamHTML() {
  return `
    <div class="screen">
      <div class="screen-body">
        <div class="app-header">
          <div class="app-logo">Clear<span>The</span>Bench</div>
          <div class="header-action" id="btn-back">←</div>
        </div>

        <div class="create-body">
          <div class="section-title" style="padding: 0; margin-bottom: 16px;">New Team</div>

          <div class="input-group">
            <label class="input-label" for="team-name-input">Team Name</label>
            <input class="input-field" id="team-name-input" type="text" placeholder="e.g. Lightning U10" autocomplete="off" />
          </div>

          <div class="input-label" style="margin-bottom: 8px;">Sport</div>
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

          <div id="create-team-msg" style="margin-bottom: 12px; font-size: 13px; color: var(--red); min-height: 20px;"></div>

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
    // Focus editor code field after render
    setTimeout(() => {
      document.getElementById('editor-code-input')?.focus();
    }, 50);
  });

  container.querySelector('#btn-spectator')?.addEventListener('click', () => {
    // Spectator flow — placeholder for now
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
      const teamId = card.dataset.teamId;
      const team = teams.find(t => t.id === teamId);
      if (team) router_navigate('team', { coach, team });
    });
  });
}

function _bindSignin(container) {
  container.querySelector('#btn-back')?.addEventListener('click', () => {
    router_navigate('home', { coach: auth_getSession() });
  });

  const msgEl     = container.querySelector('#signin-msg');
  const emailBtn  = container.querySelector('#btn-send-link');
  const emailInput = container.querySelector('#email-input');

  emailBtn?.addEventListener('click', async () => {
    const email = emailInput?.value.trim();
    if (!email || !email.includes('@')) {
      msgEl.textContent = 'Please enter a valid email address.';
      msgEl.style.color = 'var(--red)';
      return;
    }

    emailBtn.textContent = 'Sending...';
    emailBtn.disabled = true;

    const result = await auth_sendMagicLink(email);

    emailBtn.textContent = 'Send Sign-In Link';
    emailBtn.disabled = false;

    if (result.ok) {
      msgEl.style.color = 'var(--lime)';
      msgEl.textContent = '✓ Check your email for a sign-in link.';
    } else {
      msgEl.style.color = 'var(--red)';
      msgEl.textContent = result.message;
    }
  });

  // Editor code
  const editorMsg   = container.querySelector('#editor-msg');
  const editorInput = container.querySelector('#editor-code-input');
  const editorBtn   = container.querySelector('#btn-editor-join');

  editorInput?.addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  editorBtn?.addEventListener('click', async () => {
    const code = editorInput?.value.trim();
    if (code.length !== 6) {
      editorMsg.style.color = 'var(--red)';
      editorMsg.textContent = 'Editor code must be 6 characters.';
      return;
    }

    editorBtn.textContent = 'Checking...';
    editorBtn.disabled = true;

    const result = await auth_signInWithEditorCode(code);

    editorBtn.textContent = 'Join as Assistant Coach';
    editorBtn.disabled = false;

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

  const msgEl = container.querySelector('#create-team-msg');
  const createBtn = container.querySelector('#btn-create-team');

  createBtn?.addEventListener('click', async () => {
    const name = container.querySelector('#team-name-input')?.value.trim();
    if (!name) {
      msgEl.textContent = 'Team name is required.';
      return;
    }

    createBtn.textContent = 'Creating...';
    createBtn.disabled = true;
    msgEl.textContent = '';

    const team = await db_createTeam({ coachId: coach.id, name, sport: selectedSport });

    createBtn.textContent = 'Create Team';
    createBtn.disabled = false;

    if (!team) {
      msgEl.textContent = 'Something went wrong. Try again.';
      return;
    }

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

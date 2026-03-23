// stats.js — season stats screen

router_register('stats', async (container, { coach, team, season } = {}) => {
  container.innerHTML = `
    <div class="screen">
      <div class="screen-body" style="display:flex;align-items:center;justify-content:center;">
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);">Loading stats…</div>
      </div>
    </div>
  `;

  const [games, players, activeGame] = await Promise.all([
    db_getSeasonGames(season.id),
    db_getPlayers(team.id),
    db_getActiveGame(season.id),
  ]);

  const stats = _computeStats(games, players);
  container.innerHTML = _statsHTML(coach, team, season, stats, activeGame);
  _bindStats(container, coach, team, season, activeGame);
});

// ── STAT COMPUTATION ──────────────────────────────────────────

function _computeStats(games, players) {
  const playedGames = games.filter(g => g.game_events && g.game_events.length > 0);
  const gamesPlayed = playedGames.length;

  // Total sub_on events across all games in the season
  let totalSubs = 0;
  for (const game of games) {
    for (const evt of (game.game_events || [])) {
      if (evt.event_type === 'sub_on') totalSubs++;
    }
  }

  // Initialize per-player accumulators
  const acc = {};
  for (const p of players) {
    acc[p.id] = { player: p, gamesAttended: 0, totalOnTime: 0, totalGameTime: 0, totalSubs: 0 };
  }

  for (const game of games) {
    const events = (game.game_events || []).slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const roster = new Set((game.game_roster || []).map(r => r.player_id));

    if (!events.length) continue;

    // Determine game start and end timestamps
    let gameStartTs = null;
    let gameEndTs = null;
    let lastPauseTs = null;

    for (const evt of events) {
      const ts = evt.timestamp || 0;
      if (evt.event_type === 'game_start' && gameStartTs === null) gameStartTs = ts;
      gameEndTs = ts;
      if (evt.event_type === 'game_pause') lastPauseTs = ts;
    }

    const gameTime = (gameStartTs !== null && gameEndTs !== null)
      ? Math.max(0, gameEndTs - gameStartTs)
      : 0;

    // Track stints per rostered player
    const stints = {};
    for (const pid of roster) {
      stints[pid] = { fieldEnteredAt: null, onTime: 0, subs: 0 };
    }

    for (const evt of events) {
      const pid = evt.player_id;
      if (!pid || !stints[pid]) continue;
      const ts = evt.timestamp || 0;

      if (evt.event_type === 'sub_on') {
        stints[pid].fieldEnteredAt = ts;
        stints[pid].subs++;
      } else if (evt.event_type === 'sub_off' && stints[pid].fieldEnteredAt !== null) {
        stints[pid].onTime += Math.max(0, ts - stints[pid].fieldEnteredAt);
        stints[pid].fieldEnteredAt = null;
      }
    }

    // Close any stints still open at game end
    const closeTs = lastPauseTs !== null ? lastPauseTs : gameEndTs;
    for (const pid of roster) {
      if (stints[pid] && stints[pid].fieldEnteredAt !== null && closeTs !== null) {
        stints[pid].onTime += Math.max(0, closeTs - stints[pid].fieldEnteredAt);
        stints[pid].fieldEnteredAt = null;
      }
    }

    // Accumulate into player totals
    for (const pid of roster) {
      if (!acc[pid]) continue;
      acc[pid].gamesAttended++;
      acc[pid].totalSubs += stints[pid] ? stints[pid].subs : 0;
      acc[pid].totalOnTime += stints[pid] ? stints[pid].onTime : 0;
      if (gameTime > 0) acc[pid].totalGameTime += gameTime;
    }
  }

  // Build sorted player stats array (only players who attended >= 1 game)
  const playerStats = [];
  for (const pa of Object.values(acc)) {
    if (pa.gamesAttended === 0) continue;
    const pct = pa.totalGameTime > 0
      ? Math.min(100, Math.max(0, (pa.totalOnTime / pa.totalGameTime) * 100))
      : 0;
    playerStats.push({
      player: pa.player,
      gamesAttended: pa.gamesAttended,
      totalSubs: pa.totalSubs,
      pct,
    });
  }

  playerStats.sort((a, b) => b.pct - a.pct);

  let spread = 0;
  if (playerStats.length >= 2) {
    spread = playerStats[0].pct - playerStats[playerStats.length - 1].pct;
  }

  return { gamesPlayed, totalSubs, spread, playerStats };
}

// ── HTML TEMPLATES ────────────────────────────────────────────

function _statsHTML(coach, team, season, stats, activeGame) {
  const { gamesPlayed, totalSubs, spread, playerStats } = stats;
  const hasGames = gamesPlayed > 0;
  const hasActiveGame = !!activeGame;

  const spreadColor = spread > 30 ? 'var(--yellow)' : 'var(--lime)';
  const spreadLabel = `${Math.round(spread)}pp`;

  const alertPlayers = playerStats.filter(ps =>
    ps.gamesAttended >= Math.ceil(gamesPlayed * 0.6) && ps.pct < 35
  );

  return `
    <div class="screen">

      <div class="app-header">
        <div class="app-logo">Clear<span>The</span>Bench</div>
        <div class="header-action" id="btn-back">←</div>
      </div>

      <div class="screen-body">
        <div class="stats-body">

          <div class="stats-header-row">
            <div class="stats-title">Season Stats</div>
            <div class="stats-season">${_esc(season.name)}</div>
          </div>

          ${!hasGames ? `
            <div style="text-align:center;padding:48px 16px;color:var(--muted);">
              <div style="font-size:32px;margin-bottom:12px;">📊</div>
              <div style="font-size:14px;margin-bottom:6px;">No games recorded yet.</div>
              <div style="font-family:'JetBrains Mono',monospace;font-size:12px;">
                Stats will appear here after your first game.
              </div>
            </div>
          ` : `
            <div class="summary-cards">
              <div class="summary-card">
                <div class="summary-num" style="color:var(--lime);">${gamesPlayed}</div>
                <div class="summary-label">GAMES</div>
              </div>
              <div class="summary-card">
                <div class="summary-num" style="color:${spreadColor};">${spreadLabel}</div>
                <div class="summary-label">SPREAD</div>
              </div>
              <div class="summary-card">
                <div class="summary-num" style="color:var(--lime);">${totalSubs}</div>
                <div class="summary-label">SUBS</div>
              </div>
            </div>

            <div class="divider"></div>

            <div class="section-title">PLAYING TIME</div>

            ${playerStats.map((ps, i) => {
              const pct = ps.pct;
              const pctRounded = Math.round(pct);
              const barClass  = pct >= 60 ? '' : pct >= 40 ? 'mid' : 'alert';
              const pctClass  = pct >= 60 ? '' : pct >= 40 ? 'mid' : 'low';
              return `
                <div class="stat-player-row">
                  <div class="stat-rank">${i + 1}</div>
                  <div class="stat-name">${_esc(ps.player.name)}</div>
                  <div class="stat-bar-wrap">
                    <div class="stat-bar-fill ${barClass}" style="width:${pctRounded}%;"></div>
                  </div>
                  <div class="stat-pct ${pctClass}">${pctRounded}%</div>
                  <div class="stat-games">${ps.gamesAttended}g</div>
                </div>
              `;
            }).join('')}

            ${alertPlayers.length > 0 ? `
              <div class="insight-alert">
                ${alertPlayers.length} player${alertPlayers.length !== 1 ? 's' : ''} attended most games but logged under 35% playing time this season.
              </div>
            ` : ''}
          `}

        </div>
      </div>

      <div class="bottom-nav">
        <div class="nav-item" id="nav-game"${hasActiveGame ? '' : ' style="opacity:0.4;"'}>
          <div class="nav-icon">🏟</div>
          <div class="nav-label">GAME</div>
        </div>
        <div class="nav-item active" id="nav-stats">
          <div class="nav-icon">📊</div>
          <div class="nav-label">STATS</div>
        </div>
        <div class="nav-item" id="nav-roster">
          <div class="nav-icon">👥</div>
          <div class="nav-label">ROSTER</div>
        </div>
        <div class="nav-item" id="nav-share" style="opacity:0.4;">
          <div class="nav-icon">🔗</div>
          <div class="nav-label">SHARE</div>
        </div>
      </div>

    </div>
  `;
}

// ── EVENT BINDING ─────────────────────────────────────────────

function _bindStats(container, coach, team, season, activeGame) {
  // Back passes fromStats so team detail back-button returns here
  container.querySelector('#btn-back')?.addEventListener('click', () => {
    router_navigate('team', { coach, team, season, fromScreen: 'stats' });
  });

  if (activeGame) {
    container.querySelector('#nav-game')?.addEventListener('click', () => {
      router_navigate('game', { gameId: activeGame.id, coach, team, season });
    });
  }

  container.querySelector('#nav-roster')?.addEventListener('click', () => {
    router_navigate('team', { coach, team, season, fromScreen: 'stats' });
  });
}

// ── GAME HISTORY SCREEN ───────────────────────────────────────

router_register('game-history', async (container, { coach, team, season }) => {
  container.innerHTML = `
    <div class="screen">
      <div class="app-header">
        <div class="app-logo">Clear<span>The</span>Bench</div>
        <div class="header-action" id="btn-back">←</div>
      </div>
      <div class="screen-body" style="display:flex;align-items:center;justify-content:center;">
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);">
          Loading games…
        </div>
      </div>
    </div>
  `;

  const games = await db_getSeasonGamesWithStatus(season.id);

  const rows = games.map(game => {
    const isActive  = game.status === 'active';
    const isFinal   = game.status === 'final';
    const dateLabel = new Date(game.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const oppLabel  = game.opponent ? `vs ${_esc(game.opponent)}` : '—';
    const durStr    = game.durationMins != null ? ` · ${game.durationMins}m` : '';
    const meta      = `${dateLabel} · ${game.subCount} subs${durStr}`;

    const statusEmoji = isActive ? '●' : isFinal ? '✓' : '○';
    const badgeClass  = isActive ? 'badge-soccer' : 'badge-generic';
    const badgeLabel  = isActive ? 'LIVE' : isFinal ? 'FINAL' : 'SETUP';

    return `
      <div class="team-card game-history-row" data-game-id="${game.id}" data-status="${game.status}"
        style="cursor:pointer;">
        <div class="team-icon">${statusEmoji}</div>
        <div class="team-info">
          <div class="team-name">${oppLabel}</div>
          <div class="team-meta">${meta}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <div class="team-badge ${badgeClass}">${badgeLabel}</div>
          <button class="game-history-delete" data-game-id="${game.id}"
            style="background:none;border:none;color:var(--red);font-size:16px;
              line-height:1;padding:4px 6px;cursor:pointer;opacity:0.6;flex-shrink:0;">
            ✕
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="screen">
      <div class="app-header">
        <div class="app-logo">Clear<span>The</span>Bench</div>
        <div class="header-action" id="btn-back">←</div>
      </div>
      <div class="screen-body">
        <div class="stats-header-row" style="padding: 0 20px 12px;">
          <div class="stats-title">Game History</div>
          <div class="stats-season">${_esc(season.name)}</div>
        </div>
        <div class="divider"></div>
        <div style="padding: 0 20px;">
          ${rows || `
            <div style="text-align:center;padding:48px 0;color:var(--muted);">
              <div style="font-size:32px;margin-bottom:12px;">📋</div>
              <div style="font-size:14px;">No games this season yet.</div>
            </div>
          `}
        </div>
        <div style="height:32px;"></div>
      </div>
    </div>
  `;

  container.querySelector('#btn-back')?.addEventListener('click', () => {
    router_navigate('team', { coach, team, season });
  });

  container.querySelectorAll('.game-history-row').forEach(row => {
    row.addEventListener('click', () => {
      const gameId = row.dataset.gameId;
      const status = row.dataset.status;
      if (status === 'active') {
        router_navigate('game', { gameId, coach, team, season });
      } else if (status === 'final') {
        router_navigate('game-summary', { gameId, coach, team, season });
      } else {
        router_navigate('create-game', { coach, team, season });
      }
    });
  });

  container.querySelectorAll('.game-history-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const gameId = btn.dataset.gameId;
      if (!confirm('Delete this game and all its data? This cannot be undone.')) return;
      btn.textContent = '…';
      btn.disabled = true;
      const ok = await db_deleteGame(gameId);
      if (ok) {
        btn.closest('.game-history-row')?.remove();
      } else {
        btn.textContent = '✕';
        btn.disabled = false;
        alert('Failed to delete game. Try again.');
      }
    });
  });
});

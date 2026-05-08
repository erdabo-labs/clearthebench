// =============================================================
// router.js — screen navigation
// =============================================================

const _screens = {};

function router_register(name, renderFn) {
  _screens[name] = renderFn;
}

function router_navigate(name, params = {}) {
  if (!name) { console.warn('router_navigate: no screen name'); return; }
  const container = document.getElementById('screen-container');
  if (!container) return;

  const render = _screens[name];
  if (!render) {
    console.warn(`router: no screen "${name}"`);
    return;
  }

  container.innerHTML = '';
  render(container, params);
}

// ── INIT ──────────────────────────────────────────────────────

async function router_init() {
  // Spectator deep link — skip auth, jump straight to read-only watch view
  const params = new URLSearchParams(window.location.search);
  const watchGameId = params.get('watch');
  if (watchGameId) {
    router_navigate('watch', { gameId: watchGameId });
    return;
  }

  const coach = await auth_init();
  push_init();
  router_navigate('home', { coach });
}

document.addEventListener('DOMContentLoaded', router_init);

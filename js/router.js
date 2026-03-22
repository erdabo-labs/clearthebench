// =============================================================
// router.js — screen navigation
// =============================================================

// Screen registry — populated by each module on load
const _screens = {};

function router_register(name, renderFn) {
  _screens[name] = renderFn;
}

function router_navigate(name, params = {}) {
  const container = document.getElementById('screen-container');
  if (!container) return;

  const render = _screens[name];
  if (!render) {
    console.warn(`router: no screen registered for "${name}"`);
    return;
  }

  container.innerHTML = '';
  render(container, params);
}

// ── INIT ──────────────────────────────────────────────────────

async function router_init() {
  const params = new URLSearchParams(window.location.search);
  const gameId = params.get('game');

  if (gameId) {
    router_navigate('watch', { gameId });
    return;
  }

  const coach = await auth_init();

  // Always start at home — home screen handles signed-in vs signed-out state
  router_navigate('home', { coach });
}

// Boot when DOM is ready
document.addEventListener('DOMContentLoaded', router_init);

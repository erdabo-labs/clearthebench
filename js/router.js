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
    history.replaceState(null, '', window.location.pathname);
    return;
  }

  const teamCode = params.get('team');
  if (teamCode) {
    // Route to signin screen with editor code pre-filled
    const coach = await auth_init();
    router_navigate('signin', {});
    // Pre-fill editor code input after render
    setTimeout(() => {
      const input = document.getElementById('editor-code-input');
      if (input) {
        input.value = teamCode.toUpperCase();
        input.focus();
      }
    }, 50);
    history.replaceState(null, '', window.location.pathname);
    return;
  }

  const coach = await auth_init();

  // Always start at home — home screen handles signed-in vs signed-out state
  router_navigate('home', { coach });
  history.replaceState(null, '', window.location.pathname);
}

// Boot when DOM is ready
document.addEventListener('DOMContentLoaded', router_init);

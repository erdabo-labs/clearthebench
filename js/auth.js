// =============================================================
// auth.js — magic link auth, coach session
// =============================================================

const AUTH_KEY = 'ctb_coach';

// ── SESSION ───────────────────────────────────────────────────

function auth_getSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); }
  catch { return null; }
}

function auth_saveSession(coach) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(coach));
}

function auth_clearSession() {
  localStorage.removeItem(AUTH_KEY);
}

function auth_isCoach() {
  return !!auth_getSession();
}

// ── MAGIC LINK ────────────────────────────────────────────────

async function auth_sendMagicLink(email) {
  const { error } = await _db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) { console.error('auth_sendMagicLink', error); return { ok: false, message: error.message }; }
  return { ok: true };
}

async function auth_handleMagicLinkCallback() {
  const { data: { session }, error } = await _db.auth.getSession();
  if (error || !session) return null;

  const coach = await db_getOrCreateCoach(session.user.email);
  if (coach) auth_saveSession(coach);
  return coach;
}

async function auth_signOut() {
  await _db.auth.signOut();
  auth_clearSession();
  router_navigate('home', {});
}

// ── INIT ──────────────────────────────────────────────────────

async function auth_init() {
  const hash = window.location.hash;
  if (hash && hash.includes('error=')) {
    history.replaceState(null, '', window.location.pathname);
  }
  if (hash && hash.includes('access_token')) {
    const coach = await auth_handleMagicLinkCallback();
    history.replaceState(null, '', window.location.pathname);
    return coach;
  }
  const { data: { session } } = await _db.auth.getSession();
  if (session) {
    const saved = auth_getSession();
    if (saved) return saved;
    const coach = await db_getOrCreateCoach(session.user.email);
    if (coach) auth_saveSession(coach);
    return coach;
  }
  return null;
}

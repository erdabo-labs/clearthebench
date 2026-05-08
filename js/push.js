// =============================================================
// push.js — Web Push subscription management
// =============================================================

let _swReg = null;
let _pushSub = null;

async function push_init() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  _swReg = await navigator.serviceWorker.ready;
  _pushSub = await _swReg.pushManager.getSubscription();
}

async function push_isSubscribed() {
  return !!_pushSub;
}

async function push_subscribe(coachId) {
  if (!_swReg) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;
  const key = _b64ToUint8(CTB_VAPID_PUBLIC_KEY || '');
  _pushSub = await _swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = _pushSub.toJSON();
  return db_savePushSubscription(coachId, json.endpoint, json.keys.p256dh, json.keys.auth);
}

async function push_unsubscribe(coachId) {
  if (!_pushSub) return;
  const endpoint = _pushSub.endpoint;
  await _pushSub.unsubscribe();
  _pushSub = null;
  return db_deletePushSubscription(coachId, endpoint);
}

// ── SPECTATOR (unauthenticated, keyed by gameId) ──────────────

function push_isSpectatorSubscribed(gameId) {
  try { return !!localStorage.getItem('ctb_spec_sub_' + gameId); } catch (e) { return false; }
}

async function push_subscribeSpectator(gameId) {
  if (!_swReg) await push_init();
  if (!_swReg) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;
  const key = _b64ToUint8(CTB_VAPID_PUBLIC_KEY || '');
  let sub = await _swReg.pushManager.getSubscription();
  if (!sub) sub = await _swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = sub.toJSON();
  const ok = await db_saveSpectatorPushSub(gameId, json.endpoint, json.keys.p256dh, json.keys.auth);
  if (ok) {
    try { localStorage.setItem('ctb_spec_sub_' + gameId, json.endpoint); } catch (e) {}
  }
  return ok;
}

async function push_unsubscribeSpectator(gameId) {
  const endpoint = localStorage.getItem('ctb_spec_sub_' + gameId);
  if (endpoint) {
    await db_deleteSpectatorPushSub(gameId, endpoint);
    try { localStorage.removeItem('ctb_spec_sub_' + gameId); } catch (e) {}
  }
}

function _b64ToUint8(b64) {
  const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

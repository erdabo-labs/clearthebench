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
  const key = _b64ToUint8(window.CTB_VAPID_PUBLIC_KEY || '');
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

function _b64ToUint8(b64) {
  const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Konten mit Ende-zu-Ende-Verschlüsselung (Supabase als Speicher).
// Aus dem Passwort werden auf dem Gerät zwei Werte abgeleitet: ein Anmeldewert für Supabase
// und ein Schlüssel für die Verschlüsselung. Der Server sieht weder Passwort noch Klartext.
import * as store from './store.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const enabled = !!(SUPABASE_URL && SUPABASE_KEY);
const SESSION_KEY = 'klassenkompass.account', DB = 'klassenkompass-account', OS = 'keys';
const ITER = 250000;

let session = null, encKey = null, state = 'off', lastError = '', dirty = false, applying = false, busy = false;
let timer = null, onConflict = null, onChange = () => {}, imgKey = null;
const syncedHooks = new Set();
let beforeDelete = null;
const meta = (() => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || {}; } catch { return {}; } })();
const saveMeta = () => { try { localStorage.setItem(SESSION_KEY, JSON.stringify(meta)); } catch {} };
session = meta.session || null; dirty = !!meta.dirty;

// ---------- Schlüssel im Gerät (nicht auslesbar) ----------
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(OS);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      let tx, req;
      try { tx = open.result.transaction(OS, mode); req = fn(tx.objectStore(OS)); } catch (e) { open.result.close(); return reject(e); }
      tx.oncomplete = () => { resolve(req?.result); open.result.close(); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

// ---------- Kryptografie ----------
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64big = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

async function deriveKeys(email, password) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('klassenkompass/v1/' + email.trim().toLowerCase()), iterations: ITER }, base, 512));
  const authPw = [...bits.slice(0, 32)].map(b => b.toString(16).padStart(2, '0')).join('');
  const key = await crypto.subtle.importKey('raw', bits.slice(32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { authPw, key };
}
async function encrypt(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encKey, enc.encode(JSON.stringify(obj)));
  return { ciphertext: b64big(ct), iv: b64(iv) };
}
async function decrypt(row) {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(row.iv) }, encKey, unb64(row.ciphertext));
    return JSON.parse(dec.decode(pt));
  } catch { throw Object.assign(new Error('Die Daten im Konto lassen sich mit diesem Passwort nicht entschlüsseln.'), { decrypt: true }); }
}

// ---------- Supabase-Aufrufe ----------
async function call(path, { method = 'GET', body, auth = true, retry = true } = {}) {
  if (auth) await ensureFresh();
  const res = await fetch(SUPABASE_URL + path, { method, headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json',
    ...(auth && session ? { Authorization: 'Bearer ' + session.access_token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && auth && retry) { await refresh(); return call(path, { method, body, auth, retry: false }); }
  const text = await res.text(), data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = data?.msg || data?.message || data?.error_description || data?.error || res.statusText;
    const err = new Error(msg); err.status = res.status; err.code = data?.code || data?.error_code; throw err;
  }
  return data;
}
function setSession(s) {
  session = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), user: { id: s.user.id, email: s.user.email } };
  meta.session = session; saveMeta();
}
async function refresh() {
  if (!session?.refresh_token) throw Object.assign(new Error('Bitte erneut anmelden.'), { status: 401 });
  const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { if (res.status === 400 || res.status === 401) { set('login', 'Die Anmeldung ist abgelaufen. Bitte erneut anmelden.'); } throw Object.assign(new Error('Bitte erneut anmelden.'), { status: 401 }); }
  setSession(data);
}
async function ensureFresh() { if (session && session.expires_at - 60 < Date.now() / 1000) await refresh(); }

const friendly = e => {
  const m = String(e?.message || e);
  if (/Invalid login credentials/i.test(m)) return 'E-Mail oder Passwort stimmt nicht.';
  if (/already registered|already been registered|User already/i.test(m)) return 'Für diese E-Mail gibt es schon ein Konto. Bitte anmelden.';
  if (/Email not confirmed/i.test(m)) return 'Die E-Mail-Adresse ist noch nicht bestätigt (Bestätigung ist in Supabase eingeschaltet).';
  if (/rate limit|too many/i.test(m)) return 'Zu viele Versuche. Bitte kurz warten.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Keine Verbindung zum Server. Bist du online?';
  if (/invalid.*email|email.*invalid|unable to validate email/i.test(m)) return 'Bitte eine gültige E-Mail-Adresse eingeben.';
  return m;
};

// ---------- Status ----------
export function status() { return { state, email: session?.user?.email || '', lastSync: meta.lastSyncAt || null, error: lastError, dirty }; }
function set(s, err = '') { state = s; lastError = err; onChange(status()); }
export const loggedIn = () => !!(session && encKey);

export async function init({ conflict, changed }) {
  onConflict = conflict; onChange = changed || onChange;
  if (!enabled) return;
  store.subscribe(() => {
    if (applying || !loggedIn()) return;
    dirty = true; meta.dirty = true; saveMeta();
    clearTimeout(timer); timer = setTimeout(syncNow, 1500);
    onChange(status());
  });
  addEventListener('focus', () => syncNow());
  addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => syncNow());
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 20000);
  if (!session) return;
  encKey = await idb('readonly', s => s.get('key')).catch(() => null);
  if (!encKey) { set('login', 'Bitte erneut anmelden.'); return; }
  set('ok'); syncNow();
}

// ---------- Erweiterungen (Quiz-Bilder im Konto, siehe cloudimages.js) ----------
export const userId = () => session?.user?.id || null;
export function onSynced(fn) { syncedHooks.add(fn); }
export function setBeforeDelete(fn) { beforeDelete = fn; }

// Supabase-Dateispeicher: Rohzugriff mit Anmeldung (Antwort wird nicht als JSON gelesen)
export async function storage(path, { method = 'GET', body, headers = {}, retry = true } = {}) {
  if (!loggedIn()) throw Object.assign(new Error('Nicht angemeldet.'), { status: 401 });
  await ensureFresh();
  const res = await fetch(SUPABASE_URL + '/storage/v1/' + path, { method, body, headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + session.access_token, ...headers } });
  if (res.status === 401 && retry) { await refresh(); return storage(path, { method, body, headers, retry: false }); }
  if (!res.ok) {
    const d = await res.json().catch(() => null);
    throw Object.assign(new Error(d?.message || d?.error || res.statusText || 'Speicherfehler'), { status: res.status, code: String(d?.statusCode || d?.error || '') });
  }
  return res;
}

// Schlüssel für die Quiz-Bilder: zufällig, einmal je Konto. Er liegt mit dem Passwort-Schlüssel verschlüsselt
// in der Tabelle image_keys. So müssen die Bilder beim Passwortwechsel nicht neu verschlüsselt werden.
const importImgKey = raw => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
async function readImgKey() {
  const rows = await call(`/rest/v1/image_keys?select=ciphertext,iv&user_id=eq.${session.user.id}`);
  return rows?.[0] ? importImgKey(unb64((await decrypt(rows[0])).k)) : null;
}
async function wrappedImgKey(key) { return encrypt({ k: b64(await crypto.subtle.exportKey('raw', key)) }); }
export async function imageKey() {
  if (imgKey) return imgKey;
  if (!loggedIn()) throw Object.assign(new Error('Nicht angemeldet.'), { status: 401 });
  imgKey = await idb('readonly', s => s.get('imgkey')).catch(() => null);
  if (!imgKey) {
    let key = await readImgKey();
    if (!key) {
      key = await importImgKey(crypto.getRandomValues(new Uint8Array(32)));
      try { await call('/rest/v1/image_keys', { method: 'POST', body: { user_id: session.user.id, ...(await wrappedImgKey(key)) } }); }
      catch (e) { if (e.status === 409 || e.code === '23505') key = await readImgKey(); else throw e; } // anderes Gerät war schneller
    }
    imgKey = key;
    await idb('readwrite', s => s.put(key, 'imgkey')).catch(() => {});
  }
  return imgKey;
}
// Nach einem Passwortwechsel den Bilder-Schlüssel mit dem neuen Passwort-Schlüssel ablegen
async function rewrapImgKey() {
  if (!imgKey) return;
  await call(`/rest/v1/image_keys?user_id=eq.${session.user.id}`, { method: 'PATCH', body: { ...(await wrappedImgKey(imgKey)), updated_at: new Date().toISOString() } });
  delete meta.rewrap; saveMeta();
}

// ---------- Live-Quiz: kurzlebige, ebenfalls verschlüsselte Daten zwischen zwei Geräten desselben Kontos ----------
// part = 'control' (Gerät, das das Quiz zeigt) oder 'scans' (Gerät, das scannt). Jede Seite schreibt nur ihren Teil.
export async function liveGet(part) {
  if (!loggedIn() || !navigator.onLine) return null;
  const rows = await call(`/rest/v1/live_quiz?select=${part},${part}_iv,updated_at&user_id=eq.${session.user.id}`);
  const row = rows?.[0];
  if (!row || !row[part]) return null;
  return decrypt({ ciphertext: row[part], iv: row[part + '_iv'] });
}
export async function livePut(part, obj) {
  if (!loggedIn()) return;
  const payload = obj ? await encrypt(obj) : { ciphertext: null, iv: null };
  await call('/rest/v1/rpc/set_live_quiz', { method: 'POST', body: { p_part: part, p_ciphertext: payload.ciphertext, p_iv: payload.iv } });
}
export async function liveClear() { if (loggedIn()) await call('/rest/v1/rpc/clear_live_quiz', { method: 'POST', body: {} }); }

// ---------- Abgleich ----------
async function pull() {
  const rows = await call(`/rest/v1/vaults?select=ciphertext,iv,version,updated_at&user_id=eq.${session.user.id}`);
  return rows?.[0] || null;
}
async function push() {
  const payload = await encrypt(store.get());
  const v = await call('/rest/v1/rpc/save_vault', { method: 'POST', body: { p_ciphertext: payload.ciphertext, p_iv: payload.iv, p_expected: meta.version || 0 } });
  meta.version = v; meta.lastSyncAt = new Date().toISOString(); meta.dirty = false; dirty = false; saveMeta();
}
function apply(data, version) {
  applying = true;
  try { store.replaceState({ ...data, welcomed: true }); } finally { applying = false; }
  meta.version = version; meta.lastSyncAt = new Date().toISOString(); meta.dirty = false; dirty = false; saveMeta();
}

export async function syncNow() {
  if (!enabled || !loggedIn() || busy || state === 'conflict' || state === 'login') return;
  if (!navigator.onLine) { set('offline'); return; }
  busy = true;
  try {
    const row = await pull();
    if (!row) await push();
    else if (row.version !== meta.version) {
      const data = await decrypt(row);
      if (dirty) { busy = false; return resolveConflict(data, row.version); }
      apply(data, row.version);
    } else if (dirty) {
      try { await push(); }
      catch (e) { if (/version_conflict/.test(e.message)) { busy = false; dirty = true; return syncNow(); } throw e; }
    }
    if (meta.rewrap) { await imageKey().catch(() => {}); await rewrapImgKey().catch(() => {}); }
    set('ok');
    if (!dirty) syncedHooks.forEach(fn => { try { fn(); } catch {} });
  } catch (e) {
    if (e.status === 401) set('login', 'Bitte erneut anmelden.');
    else if (e.decrypt) set('login', 'Das Passwort wurde auf einem anderen Gerät geändert. Bitte mit dem neuen Passwort anmelden.');
    else set(navigator.onLine ? 'error' : 'offline', friendly(e));
  }
  busy = false;
}
async function resolveConflict(data, version) {
  set('conflict');
  const choice = await onConflict?.(data);
  if (choice === 'remote') { apply(data, version); set('ok'); return; }
  if (choice === 'local') { meta.version = version; saveMeta(); state = 'ok'; dirty = true; busy = false; return syncNow(); }
  set('conflict');
}
export async function retryConflict() { if (state === 'conflict') { state = 'ok'; await syncNow(); } }

// ---------- Anmelden / Registrieren ----------
// decide(remoteData) → 'remote' | 'local' – nur wenn Konto schon Daten hat und das Gerät eigene Daten hat
export async function login(email, password, { register = false, decide } = {}) {
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.');
  if (password.length < 8) throw new Error('Das Passwort muss mindestens 8 Zeichen lang sein.');
  const { authPw, key } = await deriveKeys(email, password);
  let data;
  try {
    data = register
      ? await call('/auth/v1/signup', { method: 'POST', auth: false, body: { email, password: authPw } })
      : await call('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password: authPw } });
  } catch (e) { throw new Error(friendly(e)); }
  if (!data?.access_token) throw new Error(register ? 'Konto angelegt, aber noch nicht aktiv: In Supabase ist „Confirm email“ eingeschaltet.' : 'Anmeldung fehlgeschlagen.');
  setSession(data); encKey = key; imgKey = null;
  await idb('readwrite', s => { s.delete('imgkey'); return s.put(key, 'key'); });
  meta.version = 0; meta.dirty = false; dirty = false; saveMeta();
  let row;
  try { row = await pull(); } catch (e) { throw new Error(friendly(e)); }
  if (row) {
    const remote = await decrypt(row);
    const s = store.get(), localHasOwn = s.technik.classes.some(c => !c.demo) || s.sport.groups.some(g => !g.demo) || s.quiz.classes.some(c => !c.demo) || s.quiz.sets.some(t => !t.demo);
    const choice = localHasOwn ? await decide(remote) : 'remote';
    if (choice === 'local') { meta.version = row.version; dirty = true; meta.dirty = true; saveMeta(); }
    else apply(remote, row.version);
  } else dirty = true;
  set('ok');
  await syncNow();
}

export async function logout({ wipe }) {
  clearTimeout(timer);
  if (dirty && loggedIn()) { try { await syncNow(); } catch {} }
  try { await call('/auth/v1/logout', { method: 'POST' }); } catch {}
  session = null; encKey = null; imgKey = null;
  await idb('readwrite', s => { s.delete('key'); return s.delete('imgkey'); }).catch(() => {});
  for (const k of Object.keys(meta)) delete meta[k]; saveMeta(); dirty = false;
  if (wipe) { applying = true; try { store.replaceState(store.freshState()); } finally { applying = false; } }
  set('off');
}

export async function deleteAccount() {
  if (beforeDelete) await beforeDelete(); // zuerst die Quiz-Bilder im Dateispeicher löschen
  await call('/rest/v1/rpc/delete_my_account', { method: 'POST', body: {} });
  await logout({ wipe: false });
}

// Passwort ändern: neuer Schlüssel, Daten werden neu verschlüsselt
export async function changePassword(oldPw, newPw) {
  if (newPw.length < 8) throw new Error('Das neue Passwort muss mindestens 8 Zeichen lang sein.');
  const email = session.user.email;
  const oldK = await deriveKeys(email, oldPw);
  try { await call('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password: oldK.authPw } }).then(setSession); }
  catch { throw new Error('Das bisherige Passwort stimmt nicht.'); }
  const newK = await deriveKeys(email, newPw);
  await syncNow();
  await imageKey().catch(() => null); // Bilder-Schlüssel noch mit dem alten Passwort holen
  await call('/auth/v1/user', { method: 'PUT', body: { password: newK.authPw } });
  encKey = newK.key; await idb('readwrite', s => s.put(newK.key, 'key'));
  dirty = true; await push();
  if (imgKey) { meta.rewrap = true; saveMeta(); await rewrapImgKey().catch(() => {}); }
  const fresh = await call('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password: newK.authPw } });
  setSession(fresh); set('ok');
}

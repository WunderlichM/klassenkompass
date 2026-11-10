// Quiz-Bilder im Konto: verschlüsselt im Supabase-Dateispeicher (Bucket „quiz-images“, je Konto ein Ordner).
// - Hochladen: jedes Bild, das in Fragen oder Ergebnissen vorkommt und im Konto noch fehlt.
// - Holen: fehlt ein Bild auf einem Gerät, wird es aus dem Konto geladen und dort gespeichert (danach offline nutzbar).
// - Aufräumen: Bilder im Konto, die nirgends mehr vorkommen, werden automatisch gelöscht
//   (höchstens einmal am Tag, nur direkt nach einem vollständigen Abgleich und erst 2 Tage nach dem Hochladen,
//   damit Bilder eines anderen Geräts, deren Frage noch nicht abgeglichen ist, nicht verloren gehen).
// Die Bilder werden auf dem Gerät mit einem eigenen Schlüssel verschlüsselt (AES-256-GCM, siehe account.imageKey).
import * as account from './account.js';
import * as images from './images.js';
import * as store from './store.js';

const BUCKET = 'quiz-images', META_KEY = 'klassenkompass.cloudimg';
const GRACE = 2 * 24 * 3600e3, CLEAN_EVERY = 24 * 3600e3, LIST_EVERY = 10 * 60e3;

let meta = (() => { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch { return {}; } })();
const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {} };
let known = new Set(), knownUid = null;   // Bilder, die sicher im Konto liegen
let busy = false, again = false, timer = null;

const path = id => `${account.userId()}/${id}`;
const ready = () => account.enabled && account.loggedIn() && navigator.onLine;

// ---------- Verschlüsselung: gespeichert wird IV (12 Byte) + Geheimtext ----------
async function seal(blob) {
  const key = await account.imageKey(), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await blob.arrayBuffer());
  return new Blob([iv, ct], { type: 'application/octet-stream' });
}
async function unseal(buf) {
  const key = await account.imageKey(), u = new Uint8Array(buf);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.subarray(0, 12) }, key, u.subarray(12)));
  const type = pt[0] === 0x89 && pt[1] === 0x50 ? 'image/png' : pt[0] === 0xff && pt[1] === 0xd8 ? 'image/jpeg'
    : pt[0] === 0x47 && pt[1] === 0x49 ? 'image/gif' : 'image/webp';
  return new Blob([pt], { type });
}

// ---------- Dateispeicher ----------
async function listRemote() {
  const out = new Map();
  for (let offset = 0; ; offset += 1000) {
    const res = await account.storage(`object/list/${BUCKET}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: account.userId(), limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }) });
    const arr = await res.json();
    for (const o of arr || []) {
      const id = String(o?.name || '').split('/').pop();
      if (o?.id && images.ID_RE.test(id)) out.set(id, Date.parse(o.created_at) || 0);
    }
    if (!arr || arr.length < 1000) break;
  }
  return out;
}
async function upload(id, blob) {
  await account.storage(`object/${BUCKET}/${path(id)}`, { method: 'POST', body: await seal(blob),
    headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' } });
  known.add(id);
}
async function removeAll(ids) {
  for (let i = 0; i < ids.length; i += 100)
    await account.storage(`object/${BUCKET}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: ids.slice(i, i + 100).map(path) }) });
  ids.forEach(id => known.delete(id));
}
async function download(id) {
  if (!ready()) return null;
  try { return await unseal(await (await account.storage(`object/authenticated/${BUCKET}/${path(id)}`)).arrayBuffer()); }
  catch { return null; }
}

// ---------- Abgleich ----------
async function reconcile({ list = false } = {}) {
  if (!ready() || account.status().state !== 'ok') return;
  if (busy) { again = true; return; }
  busy = true;
  try {
    const uid = account.userId();
    if (meta.uid !== uid) { meta = { uid }; saveMeta(); }
    if (knownUid !== uid) { known = new Set(); knownUid = uid; list = true; }
    let remote = null;
    if (list || Date.now() - (meta.lastList || 0) > LIST_EVERY) {
      remote = await listRemote(); known = new Set(remote.keys()); meta.lastList = Date.now(); saveMeta();
    }
    // Hochladen, was verwendet wird und im Konto fehlt
    const used = new Set(images.usedIds(store.get()));
    for (const id of used) {
      if (known.has(id)) continue;
      const rec = await images.getRecord(id).catch(() => null);
      if (rec) await upload(id, rec.blob);
    }
    // Auf diesem Gerät fehlende Bilder, die jetzt im Konto liegen: neu zeichnen lassen
    const miss = images.missingIds().filter(id => known.has(id));
    if (miss.length) { images.retry(miss); dispatchEvent(new Event('kk-images')); }
    // Automatisch aufräumen (nur mit frisch abgeglichenem Stand, siehe oben)
    if (remote && !account.status().dirty && account.status().state === 'ok' && Date.now() - (meta.lastClean || 0) > CLEAN_EVERY) {
      const now = Date.now(), unused = [...remote].filter(([id, at]) => !used.has(id) && at && now - at > GRACE).map(([id]) => id);
      if (unused.length) await removeAll(unused);
      meta.lastClean = now; saveMeta();
    }
  } catch (e) { console.warn('Quiz-Bilder im Konto:', e); }
  busy = false;
  if (again) { again = false; setTimeout(() => reconcile(), 500); }
}
const soon = (ms = 3000) => { clearTimeout(timer); timer = setTimeout(() => reconcile(), ms); };

export function init() {
  if (!account.enabled) return;
  images.setRemote(download);
  account.onSynced(() => soon(500));
  // Neue Bilder in Fragen: kurz nach dem Speichern hochladen
  store.subscribe(() => { if (account.loggedIn() && images.usedIds(store.get()).some(id => !known.has(id))) soon(); });
  addEventListener('online', () => soon(1000));
  // Konto löschen: zuerst alle Bilder im Dateispeicher entfernen
  account.setBeforeDelete(async () => {
    const remote = await listRemote().catch(e => { throw new Error('Die Quiz-Bilder im Konto konnten nicht gelöscht werden: ' + e.message); });
    if (remote.size) await removeAll([...remote.keys()]);
    meta = {}; saveMeta();
  });
}

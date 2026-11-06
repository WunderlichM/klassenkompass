// Abgleich über eine Sync-Datei (z. B. im Google-Drive-Ordner).
// Nutzt die File System Access API (Chrome/Edge am PC). Kein Server.
import * as store from './store.js';

export const supported = typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';
const META_KEY = 'klassenkompass.sync';
const DB = 'klassenkompass-sync', STORE = 'handles';

let handle = null, state = 'off', lastError = '', dirty = false, applying = false, busy = false, writeTimer = null, onConflict = null, onChange = () => {};
const meta = (() => { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch { return {}; } })();
if (!meta.deviceId) meta.deviceId = (crypto.randomUUID?.() || String(Math.random())).slice(0, 8);
const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {} };
dirty = !!meta.dirty;

// ---------- IndexedDB für den Dateizugriff ----------
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      let tx, req;
      try { tx = open.result.transaction(STORE, mode); req = fn(tx.objectStore(STORE)); } catch (e) { open.result.close(); return reject(e); }
      tx.oncomplete = () => { resolve(req?.result); open.result.close(); };
      tx.onerror = () => reject(tx.error);
    };
  });
}
const loadHandle = () => idb('readonly', s => s.get('file')).catch(() => null);
const storeHandle = h => idb('readwrite', s => s.put(h, 'file')).catch(() => {});
const clearHandle = () => idb('readwrite', s => s.delete('file')).catch(() => {});

// ---------- Status ----------
export function status() {
  return { state, fileName: handle?.name || meta.fileName || '', lastSync: meta.lastSyncAt || null, error: lastError, dirty };
}
function set(s, err = '') { state = s; lastError = err; onChange(status()); }
export function init({ conflict, changed }) {
  onConflict = conflict; onChange = changed || onChange;
  if (!supported) return;
  store.subscribe(() => {
    if (applying || !handle) return;
    dirty = true; meta.dirty = true; saveMeta();
    clearTimeout(writeTimer); writeTimer = setTimeout(() => syncNow(), 1500);
    if (state === 'ok') onChange(status());
  });
  loadHandle().then(async h => {
    if (!h) return;
    handle = h;
    const p = await handle.queryPermission({ mode: 'readwrite' }).catch(() => 'denied');
    if (p === 'granted') syncNow(); else set('permission');
  });
  addEventListener('focus', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); else if (dirty) syncNow(); });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 20000);
}

// ---------- Lesen / Schreiben ----------
async function readFile() {
  const f = await handle.getFile(), text = await f.text();
  if (!text.trim()) return null;
  const raw = JSON.parse(text);
  if (raw?.app !== 'KlassenKompass' || !raw.data) throw new Error('Die Datei ist keine KlassenKompass-Sync-Datei.');
  return raw;
}
async function writeFile() {
  const savedAt = new Date().toISOString();
  const body = JSON.stringify({ app: 'KlassenKompass', kind: 'sync', schema: store.SCHEMA, savedAt, device: meta.deviceId, data: store.get() });
  const w = await handle.createWritable();
  await w.write(body); await w.close();
  meta.fileVersion = savedAt; meta.lastSyncAt = savedAt; meta.dirty = false; dirty = false; saveMeta();
}
function apply(raw) {
  applying = true;
  try { store.replaceState({ ...raw.data, welcomed: true }); } finally { applying = false; }
  meta.fileVersion = raw.savedAt; meta.lastSyncAt = new Date().toISOString(); meta.dirty = false; dirty = false; saveMeta();
}

// Gleicht ab: neuere Datei übernehmen, eigene Änderungen schreiben, bei beidem nachfragen
export async function syncNow() {
  if (!handle || busy || state === 'permission' || state === 'conflict') return;
  busy = true;
  try {
    const raw = await readFile();
    const fileChanged = raw && raw.savedAt !== meta.fileVersion;
    if (!raw) await writeFile();
    else if (fileChanged && dirty) { set('conflict'); busy = false; return resolveConflict(raw); }
    else if (fileChanged) apply(raw);
    else if (dirty) await writeFile();
    set('ok');
  } catch (e) {
    if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') set('permission');
    else if (e?.name === 'NotFoundError') set('error', 'Die Sync-Datei wurde nicht gefunden (verschoben oder gelöscht?). Bitte neu verbinden.');
    else set('error', e?.message || String(e));
  }
  busy = false;
}
async function resolveConflict(raw) {
  const choice = await onConflict?.(raw);
  if (choice === 'file') apply(raw);
  else if (choice === 'local') await writeFile().catch(e => set('error', e.message));
  else { set('conflict'); return; }
  set('ok');
}

// Nach Klick auf „Freigeben“ (braucht eine Nutzeraktion)
export async function grant() {
  if (!handle) return false;
  const p = await handle.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
  if (p !== 'granted') { set('permission'); return false; }
  state = 'ok'; await syncNow(); return true;
}
export async function retryConflict() { if (state === 'conflict') { state = 'ok'; dirty = true; await syncNow(); } }

const pickerOpts = { types: [{ description: 'KlassenKompass-Sync-Datei', accept: { 'application/json': ['.json'] } }], id: 'klassenkompass-sync' };

// Neue Sync-Datei anlegen: schreibt die Daten dieses Geräts hinein
export async function createFile() {
  const h = await window.showSaveFilePicker({ ...pickerOpts, suggestedName: 'KlassenKompass-Daten.json' });
  handle = h; await storeHandle(h); meta.fileName = h.name; saveMeta();
  await writeFile(); set('ok');
}
// Vorhandene Sync-Datei wählen; decide(raw) entscheidet: 'file' | 'local' | null
export async function openFile(decide) {
  const [h] = await window.showOpenFilePicker({ ...pickerOpts, multiple: false });
  let raw = null;
  const prev = handle; handle = h;
  try { raw = await readFile(); } catch (e) { handle = prev; throw e; }
  const choice = raw ? await decide(raw) : 'local';
  if (!choice) { handle = prev; return false; }
  await storeHandle(h); meta.fileName = h.name; saveMeta();
  if (choice === 'file') apply(raw); else await writeFile();
  set('ok'); return true;
}
export async function disconnect() {
  handle = null; clearTimeout(writeTimer); await clearHandle();
  delete meta.fileVersion; delete meta.lastSyncAt; delete meta.fileName; meta.dirty = false; dirty = false; saveMeta();
  set('off');
}

// Bilder für das Kartenquiz: bleiben auf diesem Gerät (IndexedDB), nicht im Konto.
// Fragen speichern nur die Bildkennung („img_…“). Gleiche Bilder bekommen dieselbe Kennung (Inhalts-Prüfsumme),
// deshalb lassen sie sich über Export/Import und die Sync-Datei gefahrlos zusammenführen.
const DB = 'klassenkompass.images', STORE = 'img';
const MAX_SIDE = 1280, QUALITY = 0.82;
export const ID_RE = /^img_[0-9a-f]{20}$/;

let dbp = null;
function db() {
  dbp ||= new Promise((res, rej) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'id' });
    open.onsuccess = () => res(open.result);
    open.onerror = () => rej(open.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), r = fn(t.objectStore(STORE));
    t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}

const urls = new Map();     // id → Objekt-URL (für <img>)
const missing = new Set();  // auf diesem Gerät nicht vorhanden

export async function getRecord(id) { return ID_RE.test(id) ? tx('readonly', s => s.get(id)) : undefined; }
export async function url(id) {
  if (urls.has(id)) return urls.get(id);
  const rec = await getRecord(id).catch(() => null);
  if (!rec) { missing.add(id); return null; }
  missing.delete(id);
  const u = URL.createObjectURL(rec.blob); urls.set(id, u); return u;
}

// Bild aus Datei, Kamera oder Zwischenablage verkleinern und speichern → Kennung
export async function add(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Das ist keine Bilddatei.');
  if (file.size > 40 * 1024 * 1024) throw new Error('Das Bild ist zu groß (über 40 MB).');
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error('Das Bild lässt sich nicht öffnen (Format nicht unterstützt?).'); }
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  let blob = await new Promise(r => cv.toBlob(r, 'image/webp', QUALITY));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', QUALITY));
  return put(blob, w, h);
}
async function put(blob, w, h) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  const id = 'img_' + [...hash.slice(0, 10)].map(b => b.toString(16).padStart(2, '0')).join('');
  await tx('readwrite', s => s.put({ id, blob, w, h, at: Date.now() }));
  missing.delete(id);
  return id;
}

// Alle Bildkennungen, die der Quiz-Bereich verwendet
export function idsIn(quiz) {
  const ids = new Set(), take = q => { if (q?.img) ids.add(q.img); (q?.optImgs || []).forEach(x => x && ids.add(x)); };
  (quiz?.sets || []).forEach(t => t.questions.forEach(take));
  (quiz?.sessions || []).forEach(s => s.questions.forEach(take));
  return [...ids].filter(x => ID_RE.test(x));
}

// Für Sicherung und Sync-Datei: { id: dataURL }
export async function pack(ids) {
  const out = {};
  for (const id of ids) {
    const rec = await getRecord(id).catch(() => null); if (!rec) continue;
    out[id] = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(rec.blob); });
    if (!out[id]) delete out[id];
  }
  return out;
}
// Fehlende Bilder aus einer Sicherung übernehmen; vorhandene bleiben unverändert
export async function unpack(map) {
  let n = 0;
  if (!map || typeof map !== 'object') return n;
  for (const [id, data] of Object.entries(map)) {
    if (!ID_RE.test(id) || typeof data !== 'string' || !data.startsWith('data:image/')) continue;
    if (await getRecord(id).catch(() => null)) continue;
    try { const blob = await (await fetch(data)).blob(); await tx('readwrite', s => s.put({ id, blob, w: 0, h: 0, at: Date.now() })); missing.delete(id); urls.delete(id); n++; } catch {}
  }
  return n;
}

// Nach dem Zeichnen: alle <img data-img="…"> im Bereich mit dem gespeicherten Bild füllen
export function hydrate(root) {
  root?.querySelectorAll('img[data-img]').forEach(async el => {
    const id = el.dataset.img;
    if (urls.has(id)) { el.src = urls.get(id); return; }
    const u = await url(id);
    if (u) el.src = u;
    else { el.classList.add('img-missing'); el.alt = 'Bild fehlt auf diesem Gerät'; el.replaceWith(Object.assign(document.createElement('span'), { className: el.className + ' img-missing', textContent: 'Bild fehlt auf diesem Gerät' })); }
  });
}
export const imgTag = (id, cls = '') => id && ID_RE.test(id) ? `<img data-img="${id}" class="${cls}" alt="">` : '';

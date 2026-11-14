// Raumplaner (seit 2.7.0, neu gegliedert in 2.8.0). Maße in Metern (x nach rechts, y von der Tafel nach hinten).
// Ein Raum gehört keiner Lerngruppe; er wird oben im Bereich Gruppen gewählt (js/gruppen.js), jede Lerngruppe kann einen
// Standardraum haben. Ein Raum besteht aus
//   - dem Grundriss (room.items): Tafel, Pult, Tür, Fenster, Schränke – gilt für alle Organisationsformen,
//   - je Organisationsform einer Anordnung der Plätze (room.layouts[Form]: Tische, Werkbänke, Stühle, Stehplätze).
// Fehlt die Anordnung einer Organisationsform, stellt arrange() sie passend zur Lerngruppe selbst in den Raum
// („automatisch“); sobald im Raumplaner etwas verschoben wird, ist sie „angepasst“ und gilt für alle Lerngruppen.
// Plätze werden in einer festen Reihenfolge gezählt (seatItems): bei automatischen Anordnungen in der Reihenfolge der
// Organisationsform (Feld o), sonst in Lesereihenfolge (Reihen von vorn nach hinten, darin von links).
import * as store from './store.js';
import { uid } from './engine.js';
import { esc, icon, dialog, confirmDialog, toast } from './ui.js';

export const PRESETS = [
  { id: 'table2', kind: 'table', name: 'Zweiertisch', w: 1.3, h: 0.65, seats: 2 },
  { id: 'table1', kind: 'table', name: 'Einzeltisch', w: 0.7, h: 0.6, seats: 1 },
  { id: 'table4', kind: 'table', name: 'Gruppentisch', w: 1.4, h: 1.3, seats: 4 },
  { id: 'bench', kind: 'bench', name: 'Werkbank', w: 2.0, h: 0.9, seats: 4 },
  { id: 'chair', kind: 'chair', name: 'Stuhl', w: 0.55, h: 0.55, seats: 1 },
  { id: 'spot', kind: 'spot', name: 'Stehplatz', w: 0.55, h: 0.55, seats: 1 },
  { id: 'board', kind: 'board', name: 'Tafel', w: 3.6, h: 0.2 },
  { id: 'desk', kind: 'desk', name: 'Pult', w: 1.4, h: 0.7 },
  { id: 'door', kind: 'door', name: 'Tür', w: 1.0, h: 0.15 },
  { id: 'window', kind: 'window', name: 'Fenster', w: 1.6, h: 0.15 },
  { id: 'cabinet', kind: 'cabinet', name: 'Schrank', w: 1.2, h: 0.5 },
];
const NAMES = { table: 'Tisch', bench: 'Werkbank', chair: 'Stuhl', spot: 'Stehplatz', board: 'Tafel', desk: 'Pult', door: 'Tür', window: 'Fenster', cabinet: 'Schrank' };
export const SEATED = ['table', 'bench', 'chair', 'spot'];
// Organisationsformen, die ein Raum kennt (Reihenfolge wie in der Sitzordnung)
export const FORMS = { omnibus: 'Omnibus', gruppen: 'Gruppentische', sitzkreis: 'Sitzkreis', stehkreis: 'Stehkreis', uform: 'U-Form', arena: 'Arena / Kino' };
const MAX_ITEMS = 300;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const snap = v => Math.round(v * 20) / 20;                     // 5 cm
const r2 = v => Math.round(v * 100) / 100;

export const list = () => store.get().technik.rooms || [];
export const byId = id => list().find(r => r.id === id) || null;
export const seatsOf = it => (it.kind === 'chair' || it.kind === 'spot' ? 1 : SEATED.includes(it.kind) ? clamp(Math.round(Number(it.seats) || 0), 0, 12) : 0);
export const nameOf = it => it.label || (it.kind === 'table' ? `${PRESETS.find(p => p.kind === 'table' && p.seats === seatsOf(it))?.name || 'Tisch'}` : NAMES[it.kind]);
// Angepasste Anordnung einer Organisationsform (oder null = automatisch)
export const custom = (r, L) => (r && Array.isArray(r.layouts?.[L]) ? r.layouts[L] : null);
export const customCount = r => Object.keys(FORMS).filter(L => custom(r, L)).length;
// Raum mit Grundriss und den Plätzen einer Anordnung
export const compose = (r, seated) => ({ ...r, items: [...r.items, ...seated] });

// Tische und Stühle in fester Reihenfolge: Feld o (automatische Anordnung), sonst Lesereihenfolge
export function seatItems(room) {
  const seated = room.items.filter(x => seatsOf(x) > 0);
  if (seated.length && seated.every(x => Number.isFinite(x.o))) return seated.slice().sort((a, b) => a.o - b.o);
  const yc = it => it.y + it.h / 2, rows = [];
  for (const it of seated.sort((a, b) => yc(a) - yc(b))) {
    const row = rows[rows.length - 1];
    if (row && yc(it) - row.y0 < 0.45) row.items.push(it); else rows.push({ y0: yc(it), items: [it] });
  }
  return rows.flatMap(r => r.items.sort((a, b) => a.x - b.x));
}
export const slotKeys = room => seatItems(room).flatMap(it => Array.from({ length: seatsOf(it) }, (_, i) => it.id + ':' + i));
export const seatCount = room => (room ? slotKeys(room).length : 0);
// Gemischte Gruppen auf den Raum verteilen: jede Gruppe bekommt eigene Tische (in der Reihenfolge der Plätze). Reicht das
// nicht, werden die Plätze ohne Rücksicht auf Tischgrenzen gefüllt. over = Kinder ohne Platz.
export function mixSlots(room, groups) {
  const items = seatItems(room), map = new Map(); let ti = 0, over = 0;
  for (const [gi, g] of groups.entries()) {
    const ks = [];
    while (ks.length < g.length && ti < items.length) { const it = items[ti++]; for (let i = 0; i < seatsOf(it); i++) ks.push(it.id + ':' + i); }
    g.forEach((id, k) => { if (k < ks.length) map.set(ks[k], { id, g: gi }); else over++; });
  }
  if (over) {
    map.clear(); over = 0; const keys = slotKeys(room); let k = 0;
    groups.forEach((g, gi) => g.forEach(id => { if (k < keys.length) map.set(keys[k++], { id, g: gi }); else over++; }));
  }
  return { map, over };
}

// ---------- Automatische Anordnung ----------
// Freie Fläche für Plätze: hinter Tafel und Pult, mit Abstand zu den Wänden
export function area(r) {
  let front = 0;
  for (const it of r.items) if ((it.kind === 'board' || it.kind === 'desk') && it.y + it.h / 2 < r.h / 2) front = Math.max(front, it.y + it.h);
  const top = Math.min(Math.max(0.9, front + 0.55), r.h * 0.45), x0 = Math.min(0.45, r.w * 0.06), y1 = r.h - Math.min(0.35, r.h * 0.05);
  return { x: x0, y: top, w: Math.max(1, r.w - 2 * x0), h: Math.max(1, y1 - top) };
}
// Teile (in eigenen Koordinaten, Größe needW × needH) in die freie Fläche setzen; zu große Anordnungen werden verkleinert
function place(r, parts, needW, needH, valign = 0.3) {
  const a = area(r), s = Math.min(1, a.w / Math.max(needW, 0.1), a.h / Math.max(needH, 0.1));
  const ox = a.x + (a.w - needW * s) / 2, oy = a.y + (a.h - needH * s) * valign;
  return parts.map((p, i) => ({ id: 'a' + i, kind: p.kind, x: r2(clamp(ox + p.x * s, 0, r.w - 0.1)), y: r2(clamp(oy + p.y * s, 0, r.h - 0.1)),
    w: r2(Math.max(0.1, p.w * s)), h: r2(Math.max(0.1, p.h * s)), ...(p.seats ? { seats: p.seats } : {}), o: i, ...(p.grp !== undefined ? { grp: p.grp } : {}) }));
}
// spec: tables (Omnibus, U-Form), cols (Tische nebeneinander), islands (Plätze je Tischgruppe), icols, n (Plätze in Kreis
// und Arena). Rückgabe: die Plätze der Organisationsform als Teile des Raums (ohne Grundriss).
export function arrange(r, L, spec = {}) {
  const TW = 1.3, TH = 0.65, T = (x, y, w = TW, h = TH, seats = 2, grp) => ({ kind: 'table', x, y, w, h, seats, grp });
  if (L === 'omnibus') {
    const n = Math.max(1, spec.tables || 1), cols = clamp(spec.cols || 3, 1, 8), rows = Math.ceil(n / cols), gx = 0.8, gy = 0.8;
    const parts = Array.from({ length: n }, (_, i) => T((i % cols) * (TW + gx), Math.floor(i / cols) * (TH + gy)));
    return place(r, parts, cols * TW + (cols - 1) * gx, rows * TH + (rows - 1) * gy + 0.45);
  }
  if (L === 'gruppen') {
    // Tischgruppe aus zusammengeschobenen Tischen; mehr als 12 Plätze werden auf mehrere Tische nebeneinander verteilt
    const isl = (spec.islands?.length ? spec.islands : [4]).map((n, k) => {
      const chunks = []; let rest = Math.max(1, n); while (rest > 0) { const c = Math.min(12, rest); chunks.push(c); rest -= c; }
      const tabs = chunks.map(c => ({ seats: c, w: Math.max(TW, Math.ceil(c / 2) * 0.65), h: c > 2 ? 1.3 : TH }));
      return { k, tabs, w: tabs.reduce((s, t) => s + t.w, 0), h: Math.max(...tabs.map(t => t.h)) };
    });
    const cols = clamp(spec.icols || 2, 1, 6), gx = 1.1, gy = 1.1, cw = Math.max(...isl.map(i => i.w)), parts = [];
    const rowsH = []; isl.forEach((i, j) => { const row = Math.floor(j / cols); rowsH[row] = Math.max(rowsH[row] || 0, i.h); });
    isl.forEach((i, j) => {
      const row = Math.floor(j / cols), col = j % cols, y = rowsH.slice(0, row).reduce((s, v) => s + v + gy, 0) + (rowsH[row] - i.h) / 2;
      let x = col * (cw + gx) + (cw - i.w) / 2;
      for (const t of i.tabs) { parts.push(T(x, y, t.w, t.h, t.seats, i.k)); x += t.w; }
    });
    return place(r, parts, Math.min(cols, isl.length) * cw + (Math.min(cols, isl.length) - 1) * gx, rowsH.reduce((s, v) => s + v, 0) + (rowsH.length - 1) * gy + 0.4);
  }
  if (L === 'uform') {
    const n = Math.max(1, spec.tables || 1), side = Math.ceil(n / 3), left = Math.min(side, n), right = Math.min(side, n - left), bottom = n - left - right;
    const pitch = TW + 0.1, sideLen = Math.max(left, right) * pitch - 0.1, bw = Math.max(bottom * pitch - 0.1, 0);
    const needW = Math.max(bw + 2 * (TH + 0.9), 2 * TH + 2.4), by = sideLen + 0.25, parts = [];
    for (let i = 0; i < left; i++) parts.push(T(0, i * pitch, TH, TW));
    const bx = (needW - bw) / 2; for (let i = 0; i < bottom; i++) parts.push(T(bx + i * pitch, by));
    for (let i = right - 1; i >= 0; i--) parts.push(T(needW - TH, i * pitch, TH, TW));
    return place(r, parts, needW, (bottom ? by + TH : sideLen) + 0.45);
  }
  if (L === 'sitzkreis' || L === 'stehkreis') {
    // Ellipse in der Form der freien Fläche, so groß wie nötig (etwa 80 cm je Platz)
    const n = Math.max(1, spec.n || 1), a = area(r), need = n * 0.8, perim = (x, y) => Math.PI * (3 * (x + y) - Math.sqrt((3 * x + y) * (x + 3 * y)));
    const kx = Math.max(0.5, a.w / 2 - 0.4), ky = Math.max(0.5, a.h / 2 - 0.4), f = clamp(need / perim(kx, ky), Math.min(1, 0.9 / Math.min(kx, ky)), 1);
    const rx = kx * f, ry = ky * f, cs = clamp(perim(rx, ry) / n * 0.72, 0.3, 0.55), kind = L === 'sitzkreis' ? 'chair' : 'spot';
    const parts = Array.from({ length: n }, (_, i) => { const t = -Math.PI / 2 + (2 * Math.PI * i) / n; return { kind, x: rx + rx * Math.cos(t), y: ry + ry * Math.sin(t), w: cs, h: cs }; });
    return place(r, parts, 2 * rx + cs, 2 * ry + cs, 0.5);
  }
  // Arena / Kino: Stuhlreihen, leicht zur Tafel gebogen; die letzte Reihe steht mittig
  const n = Math.max(1, spec.n || 1), per = clamp(spec.per || Math.max(6, Math.ceil(Math.sqrt(n * 2.2))), 1, 30), rows = Math.ceil(n / per), px = 0.62, cs = 0.5, py = 0.95, bend = per > 3 ? 0.45 : 0;
  const needW = per * px - (px - cs), parts = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / per), inRow = Math.min(per, n - row * per), c = i % per, x = (per - inRow) * px / 2 + c * px;
    const rel = needW > cs ? ((x + cs / 2) / needW) * 2 - 1 : 0;
    parts.push({ kind: 'chair', x, y: row * py + bend * (1 - rel * rel), w: cs, h: cs });
  }
  return place(r, parts, needW, (rows - 1) * py + cs + bend + 0.3);
}

// ---------- Darstellung ----------
// opts: flip (Blick von der Tafel: Raum um 180° gedreht), edit, seat(key, item, i) → HTML eines Platzes,
// itemClass(item) → [Klasse, Stil] für Tische (z. B. Gruppenfarbe), tag(item) → kleine Marke in der Ecke,
// dim(item) → im Editor blass und nicht wählbar
export function roomHtml(room, opts = {}) {
  const { flip = false, edit = false } = opts, W = room.w, H = room.h, sel = edit ? editor.sel : null;
  const items = room.items.map(it => {
    const x = flip ? W - it.x - it.w : it.x, y = flip ? H - it.y - it.h : it.y, n = seatsOf(it), hor = it.w >= it.h;
    const rows = n >= 4 && Math.min(it.w, it.h) >= 0.9 ? 2 : 1, cols = Math.ceil(n / rows), [cls, style] = opts.itemClass?.(it) || ['', ''], dim = !!opts.dim?.(it), pick = edit && !dim;
    let inner, sw = 0;
    if (n) {
      const idx = Array.from({ length: n }, (_, i) => i); if (flip) idx.reverse();
      sw = hor ? it.w / cols : it.w / rows;
      inner = `<div class="rp-seats" style="grid-template-columns:repeat(${hor ? cols : rows},minmax(0,1fr));grid-template-rows:repeat(${hor ? rows : cols},minmax(0,1fr));grid-auto-flow:${hor ? 'row' : 'column'}">${idx.map(i => (opts.seat ? opts.seat(it.id + ':' + i, it, i) : '<div class="seat free"></div>')).join('')}</div>`;
    } else inner = `<span class="rp-label">${it.kind === 'door' ? icon('forward', 12) : ''}${esc(it.label || NAMES[it.kind])}</span>`;
    const tag = opts.tag?.(it) || '';
    return `<div class="rp-it k-${it.kind} ${it.h > it.w * 1.6 && !n ? 'vert' : ''} ${cls} ${dim ? 'dim' : ''} ${sel === it.id && pick ? 'sel' : ''}" ${pick ? `data-item="${esc(it.id)}" title="${esc(nameOf(it))}"` : ''} style="left:${(x / W) * 100}%;top:${(y / H) * 100}%;width:${(it.w / W) * 100}%;height:${(it.h / H) * 100}%;${sw ? `--sw:${sw.toFixed(2)};` : ''}${style}">${inner}${tag ? `<i class="rp-tag">${tag}</i>` : ''}${sel === it.id && pick ? '<i class="rp-rs" data-rs title="Größe ändern"></i>' : ''}</div>`;
  });
  return `<div class="rp ${edit ? 'edit' : ''}" style="aspect-ratio:${W} / ${H};--W:${W};--H:${H}">${items.join('')}${room.items.length ? '' : '<p class="rp-empty">Leerer Raum – rechts Tafel, Tür, Fenster und mehr hinzufügen.</p>'}</div>`;
}

// ---------- Vorlagen: Grundriss und Tischreihen ----------
const KINDS_GEN = { table2: 'Zweiertische', table1: 'Einzeltische', table4: 'Gruppentische (4 Plätze)', bench: 'Werkbänke (4 Plätze)' };
const DOORS = { vl: 'vorne links', vr: 'vorne rechts', hl: 'hinten links', hr: 'hinten rechts' };
export function generateBase({ w, h, door }) {
  const items = [], it = (k, x, y, iw, ih) => items.push({ id: uid(), kind: k, x: r2(x), y: r2(y), w: iw, h: ih }), left = door[1] === 'l';
  it('board', (w - Math.min(3.6, w - 1)) / 2, 0.05, r2(Math.min(3.6, w - 1)), 0.2);
  it('desk', left ? w - 2.0 : 0.6, 0.7, 1.4, 0.7);
  it('door', left ? 0.02 : w - 0.17, door[0] === 'v' ? 0.5 : h - 1.6, 0.15, 1.0);
  for (let i = 0; i < Math.min(3, Math.floor((h - 1.5) / 2.2)); i++) it('window', left ? w - 0.17 : 0.02, 1.2 + i * 2.2, 0.15, 1.6);
  return items;
}
// Tischreihen in der freien Fläche des Raums (Reihenfolge = Lesereihenfolge)
export function generateRows(room, { kind, rows, per }) {
  const p = PRESETS.find(x => x.id === kind) || PRESETS[0], a = area(room), items = [];
  const gapX = per > 1 ? (a.w - per * p.w) / (per - 1) : 0, gapY = rows > 1 ? (a.h - 0.3 - rows * p.h) / (rows - 1) : 0;
  if (per * p.w > a.w || (per > 1 && gapX < 0.25)) throw new Error(`${per} ${KINDS_GEN[kind]} passen nicht nebeneinander. Raum breiter machen oder weniger je Reihe wählen.`);
  if (rows * p.h > a.h || (rows > 1 && gapY < 0.4)) throw new Error(`${rows} Reihen passen nicht hintereinander. Raum tiefer machen oder weniger Reihen wählen.`);
  const x0 = per > 1 ? a.x : (room.w - p.w) / 2;
  for (let r = 0; r < rows; r++) for (let c = 0; c < per; c++) items.push({ id: uid(), kind: p.kind, x: r2(x0 + c * (p.w + Math.min(gapX, 1.6))), y: r2(a.y + r * (p.h + Math.min(gapY, 1.4))), w: p.w, h: p.h, seats: p.seats });
  // bei kleinen Abständen mittig ausrichten
  const usedW = per * p.w + (per - 1) * Math.min(gapX, 1.6), dx = per > 1 ? (a.w - usedW) / 2 : 0;
  if (dx > 0.01) items.forEach(i => { i.x = r2(i.x + dx); });
  return items;
}
const rowsFields = (per, rows, auto) => `<div class="three"><label class="field">Tische<select name="kind" class="select">${auto ? '<option value="auto" selected>Automatisch (je nach Lerngruppe)</option>' : ''}${Object.entries(KINDS_GEN).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    <label class="field">Reihen<input name="rows" class="input" type="number" min="1" max="12" value="${rows}"></label>
    <label class="field">Je Reihe<input name="per" class="input" type="number" min="1" max="10" value="${per}"></label></div>`;
const readRows = fd => ({ kind: String(fd.get('kind')), rows: clamp(Number(fd.get('rows')) || 1, 1, 12), per: clamp(Number(fd.get('per')) || 1, 1, 10) });
// Neuer Raum. onDone(room) nach dem Speichern.
export function roomDialog({ tables = 14, cols = 3, onDone } = {}) {
  // Vorschlag für die Raumgröße: je Reihe etwa 1,3 m (Tisch und Stuhl), zwischen den Tischen 0,9 m Gang
  const per = clamp(cols, 1, 8), rows = clamp(Math.ceil(tables / per), 1, 10);
  const dw = Math.max(7, Math.ceil(1.2 + per * 1.3 + (per - 1) * 0.9)), dh = Math.max(6, Math.ceil(2.4 + rows * 1.15));
  dialog({ title: 'Neuer Raum', submit: 'Raum anlegen', body: `
    <label class="field">Name des Raums<input name="name" class="input" maxlength="40" placeholder="z. B. Technikraum 1" value="Raum ${list().length + 1}"></label>
    <div class="two"><label class="field">Breite (m) <small class="muted">– Tafelwand</small><input name="w" class="input" type="number" step="0.1" min="3" max="30" value="${dw}"></label>
    <label class="field">Tiefe (m) <small class="muted">– Tafel bis Rückwand</small><input name="h" class="input" type="number" step="0.1" min="3" max="30" value="${dh}"></label></div>
    <label class="field">Tür<select name="door" class="select">${Object.entries(DOORS).map(([k, v]) => `<option value="${k}" ${k === 'vr' ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    ${rowsFields(per, rows, true)}
    <p class="muted small-text">Der Raum entsteht mit Tafel, Pult, Tür und Fenstern. Bei „Automatisch“ stellt die App jede Organisationsform passend zur Lerngruppe in den Raum. Feste Tische oder Werkbänke legst du hier als Anordnung für Omnibus an; alles lässt sich danach im Raumplaner verschieben.</p>`,
    onSubmit: fd => {
      if (list().length >= 30) throw new Error('Höchstens 30 Räume.');
      const w = clamp(Number(fd.get('w')) || 8, 3, 30), h = clamp(Number(fd.get('h')) || 7, 3, 30), spec = readRows(fd);
      const r = { id: uid(), name: String(fd.get('name') || '').trim().slice(0, 40) || `Raum ${list().length + 1}`, w, h, items: generateBase({ w, h, door: String(fd.get('door') || 'vr') }), layouts: {} };
      if (spec.kind !== 'auto') r.layouts.omnibus = generateRows(r, spec);
      store.update(s => { (s.technik.rooms ||= []).push(r); });
      onDone?.(r);
    } });
}

// ======================================================================
// Editor: part = 'base' (Grundriss) oder eine Organisationsform; auto(room, Form) liefert die automatische Anordnung
// für die gewählte Lerngruppe, form ist die Organisationsform, die beim Grundriss blass mitgezeigt wird.
// ======================================================================
export const editor = { id: null, sel: null, part: 'base', form: 'omnibus', auto: null };
let redraw = () => {};
const room = () => byId(editor.id);
const autoItems = (r, L) => editor.auto?.(r, L) || arrange(r, L, {});
// Teile des gerade bearbeiteten Teils (Grundriss oder Anordnung, automatisch oder angepasst)
const partItems = r => (editor.part === 'base' ? r.items : custom(r, editor.part) || autoItems(r, editor.part));
const patchRoom = fn => store.update(s => { const r = s.technik.rooms.find(x => x.id === editor.id); if (r) fn(r); });
// Änderung an einer automatischen Anordnung: zuerst als angepasste Anordnung übernehmen
const patchItems = fn => patchRoom(r => {
  if (editor.part === 'base') return fn(r.items, r);
  r.layouts ||= {};
  if (!Array.isArray(r.layouts[editor.part])) r.layouts[editor.part] = autoItems(r, editor.part).map(({ grp, ...it }) => structuredClone(it));
  fn(r.layouts[editor.part], r);
});
const patchItem = (id, fn) => patchItems((items, r) => { const it = items.find(x => x.id === id); if (it) fn(it, r); });
export function open(id, { part = 'base', form = 'omnibus', auto = null } = {}) { Object.assign(editor, { id, sel: null, part, form, auto }); }
export function close() { Object.assign(editor, { id: null, sel: null, auto: null }); }

export function editorHtml() {
  const r = room(); if (!r) return '';
  const base = editor.part === 'base', L = base ? editor.form : editor.part, cus = custom(r, L), seated = cus || autoItems(r, L), shown = compose(r, seated);
  const seats = seatCount(compose(r, seated));
  const status = base ? `<p class="rp-status">${icon('grid', 14)} <span><b>Grundriss</b> – Tafel, Pult, Tür, Fenster und Schränke gelten für alle Organisationsformen. Blass: die Plätze der Form „${esc(FORMS[L])}“.</span></p>`
    : cus ? `<p class="rp-status custom">${icon('edit', 14)} <span><b>Angepasst</b> – diese Anordnung gilt für alle Lerngruppen in diesem Raum (${seats} Plätze).</span><button class="btn ghost sm" data-act="rp-reset">Zurück auf automatisch</button></p>`
      : `<p class="rp-status">${icon('repeat', 14)} <span><b>Automatisch</b> – passt sich der gewählten Lerngruppe an. Sobald du etwas verschiebst, wird die Anordnung fest übernommen.</span></p>`;
  return `<div class="card room-card">
      <div class="card-head">
        <div><p class="eyebrow">Raumplaner</p><h2>${esc(r.name)} <span class="badge">${r.w} × ${r.h} m</span></h2></div>
        <div class="tools"><button class="btn primary" data-act="rp-done">${icon('check', 16)} Fertig</button></div>
      </div>
      <div class="seg rp-parts" role="tablist" aria-label="Teil des Raums">
        <button class="${base ? 'on' : ''}" data-act="rp-part" data-v="base">Grundriss</button>
        ${Object.entries(FORMS).map(([k, v]) => `<button class="${editor.part === k ? 'on' : ''}" data-act="rp-part" data-v="${k}">${esc(v)}${custom(r, k) ? ' <i class="rp-dot" title="angepasst"></i>' : ''}</button>`).join('')}
      </div>
      ${status}
      <div class="room-wrap rp-wrap"><div class="room v2 raum">${roomHtml(shown, { edit: true, dim: it => (base ? SEATED.includes(it.kind) : !SEATED.includes(it.kind)) })}</div></div>
      <p class="hint">${icon('check', 14)} Teile ziehen zum Verschieben, die Ecke unten rechts für die Größe. Pfeiltasten verschieben das gewählte Teil um 10 cm (mit Alt um 1 cm), Entf löscht es.</p>
    </div>`;
}
export function editorSide() {
  const r = room(); if (!r) return '';
  const base = editor.part === 'base', it = partItems(r).find(x => x.id === editor.sel), n = it ? seatsOf(it) : 0;
  const num = (k, label, v, step = 0.05, min = 0.1, max = 30) => `<label class="field">${label}<input class="input" type="number" data-rp="${k}" step="${step}" min="${min}" max="${max}" value="${v}"></label>`;
  const palette = PRESETS.filter(p => SEATED.includes(p.kind) !== base);
  return `<div class="card">
      <h3>${icon('grid', 16)} Raum</h3>
      <label class="field">Name<input class="input" data-rp="name" maxlength="40" value="${esc(r.name)}"></label>
      <div class="two">${num('rw', 'Breite (m)', r.w, 0.1, 3)}${num('rh', 'Tiefe (m)', r.h, 0.1, 3)}</div>
      <p class="muted small-text">Breite = Wand mit der Tafel, Tiefe = von der Tafel bis zur Rückwand.</p>
      ${base ? '' : `<button class="btn ghost full" data-act="rp-gen">${icon('grid', 15)} Tische in Reihen anordnen …</button>`}
    </div>
    <div class="card">
      <h3>${icon('plus', 16)} ${base ? 'Zum Grundriss hinzufügen' : `Plätze für ${esc(FORMS[editor.part])}`}</h3>
      <div class="rp-palette">${palette.map(p => `<button class="btn ghost sm" data-act="rp-add" data-p="${p.id}"><i class="rp-swatch k-${p.kind}"></i>${p.name}</button>`).join('')}</div>
    </div>
    ${it ? `<div class="card">
      <div class="card-head small"><h3>${esc(nameOf(it))}</h3><button class="icon-btn sm" data-act="rp-desel" aria-label="Auswahl aufheben">${icon('x', 15)}</button></div>
      ${['table', 'bench'].includes(it.kind) ? `<div class="num-row"><label>Plätze<span class="stepper"><button data-act="rp-seats" data-d="-1" ${n > 1 ? '' : 'disabled'}>−</button><output>${n}</output><button data-act="rp-seats" data-d="1" ${n < 12 ? '' : 'disabled'}>+</button></span></label></div>` : ''}
      <div class="two">${num('w', 'Breite (m)', it.w)}${num('h', 'Tiefe (m)', it.h)}</div>
      ${n ? '' : `<label class="field">Beschriftung<input class="input" data-rp="label" maxlength="24" value="${esc(it.label || '')}" placeholder="${esc(NAMES[it.kind])}"></label>`}
      <div class="tools"><button class="btn ghost sm" data-act="rp-rot">${icon('repeat', 15)} Drehen</button><button class="btn ghost sm" data-act="rp-copy">${icon('plus', 15)} Kopieren</button><button class="btn ghost sm danger-text" data-act="rp-del">${icon('trash', 15)} Löschen</button></div>
    </div>` : `<div class="card"><p class="muted small-text">Ein Teil im Raum antippen, um ${base ? 'Größe oder Beschriftung' : 'Plätze oder Größe'} zu ändern, es zu drehen, zu kopieren oder zu löschen.</p></div>`}
    <div class="card"><button class="btn ghost full danger-text" data-act="rp-delroom">${icon('trash', 15)} Raum löschen</button></div>`;
}
// Neues Teil an eine freie Stelle setzen (versetzt, damit es nicht genau auf einem anderen liegt)
function freeSpot(r, items, w, h) {
  const hit = (x, y) => items.some(o => x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y);
  for (let y = 0.3; y + h <= r.h; y += 0.25) for (let x = 0.3; x + w <= r.w; x += 0.25) if (!hit(x, y)) return { x: r2(x), y: r2(y) };
  return { x: r2((r.w - w) / 2), y: r2((r.h - h) / 2) };
}
// neue Plätze kommen in der Reihenfolge ans Ende
const nextO = items => (items.length && items.every(i => Number.isFinite(i.o)) ? { o: Math.max(...items.map(i => i.o)) + 1 } : {});

// Klicks im Editor; Rückgabe true = erledigt
export function click(act, b, onRoomDeleted) {
  if (!act.startsWith('rp-')) return false;
  const r = room(); if (!r) return true;
  const sel = editor.sel;
  switch (act) {
    case 'rp-done': close(); redraw(); break;
    case 'rp-part': editor.part = b.dataset.v in FORMS ? b.dataset.v : 'base'; if (editor.part !== 'base') editor.form = editor.part; editor.sel = null; redraw(); break;
    case 'rp-desel': editor.sel = null; redraw(); break;
    case 'rp-reset': (async () => {
      if (!(await confirmDialog('Zurück auf automatisch', `Die angepasste Anordnung für „${FORMS[editor.part]}“ verwerfen? Die App stellt die Plätze dann wieder selbst passend zur Lerngruppe in den Raum.`, 'Verwerfen'))) return;
      const L = editor.part, old = structuredClone(custom(r, L)); editor.sel = null;
      patchRoom(x => { delete x.layouts?.[L]; });
      toast('Wieder automatisch.', { action: 'Rückgängig', onAction: () => patchRoom(x => { (x.layouts ||= {})[L] = old; }) });
    })(); break;
    case 'rp-add': {
      const p = PRESETS.find(x => x.id === b.dataset.p); if (!p) break;
      const items = partItems(r); if (items.length >= MAX_ITEMS) { toast(`Höchstens ${MAX_ITEMS} Teile.`); break; }
      const w = Math.min(p.w, r.w), h = Math.min(p.h, r.h), it = { id: uid(), kind: p.kind, w, h, ...freeSpot(r, [...r.items, ...items], w, h), ...(p.kind === 'table' || p.kind === 'bench' ? { seats: p.seats } : {}), ...(SEATED.includes(p.kind) ? nextO(items) : {}) };
      editor.sel = it.id; patchItems(x => { x.push(it); });
      break;
    }
    case 'rp-seats': patchItem(sel, it => { it.seats = clamp(seatsOf(it) + Number(b.dataset.d), 1, 12); }); break;
    case 'rp-rot': patchItem(sel, (it, x) => { const cx = it.x + it.w / 2, cy = it.y + it.h / 2; [it.w, it.h] = [it.h, it.w]; it.x = r2(clamp(cx - it.w / 2, 0, x.w - it.w)); it.y = r2(clamp(cy - it.h / 2, 0, x.h - it.h)); }); break;
    case 'rp-copy': {
      const items = partItems(r), it = items.find(x => x.id === sel); if (!it) break;
      if (items.length >= MAX_ITEMS) { toast(`Höchstens ${MAX_ITEMS} Teile.`); break; }
      const { grp, ...src } = it, c = { ...structuredClone(src), id: uid(), x: r2(clamp(it.x + 0.3, 0, r.w - it.w)), y: r2(clamp(it.y + 0.3, 0, r.h - it.h)), ...(SEATED.includes(it.kind) ? nextO(items) : {}) };
      if (!SEATED.includes(it.kind)) delete c.o;
      editor.sel = c.id; patchItems(x => { x.push(c); });
      break;
    }
    case 'rp-del': editor.sel = null; patchItems(x => { const i = x.findIndex(y => y.id === sel); if (i >= 0) x.splice(i, 1); }); break;
    case 'rp-gen': {
      const L = editor.part; if (L === 'base') break;
      dialog({ title: `Tische in Reihen · ${FORMS[L]}`, submit: 'Anordnen', body: `${rowsFields(3, 4, false)}<p class="muted small-text">Ersetzt alle Plätze der Organisationsform „${esc(FORMS[L])}“ in diesem Raum. Der Grundriss bleibt.</p>`,
        onSubmit: fd => { const items = generateRows(r, readRows(fd)); editor.sel = null; patchRoom(x => { (x.layouts ||= {})[L] = items; }); } });
      break;
    }
    case 'rp-delroom': (async () => {
      if (!(await confirmDialog('Raum löschen', `Den Raum „${r.name}“ löschen? Lerngruppen, die ihn als Standardraum haben, zeigen danach die Organisationsformen ohne Raum; ihre Sitzordnung bleibt erhalten.`))) return;
      onRoomDeleted?.(r); close(); store.update(s => { s.technik.rooms = s.technik.rooms.filter(x => x.id !== r.id); }); toast('Raum gelöscht.');
    })(); break;
  }
  return true;
}
// Eingaben in der Seitenleiste des Editors; Rückgabe true = erledigt
export function change(e) {
  const k = e.target.dataset?.rp; if (!k || !room()) return false;
  const v = e.target.value, num = clamp(Number(v) || 0, 0.1, 30);
  const fit = (it, r) => { it.w = Math.min(it.w, r.w); it.h = Math.min(it.h, r.h); it.x = r2(clamp(it.x, 0, r.w - it.w)); it.y = r2(clamp(it.y, 0, r.h - it.h)); };
  if (k === 'name') patchRoom(r => { r.name = v.trim().slice(0, 40) || r.name; });
  else if (k === 'rw' || k === 'rh') patchRoom(r => { const key = k === 'rw' ? 'w' : 'h'; r[key] = r2(clamp(num, 3, 30)); for (const it of [...r.items, ...Object.values(r.layouts || {}).flat()]) fit(it, r); });
  else if (k === 'label') patchItem(editor.sel, it => { const t = v.trim().slice(0, 24); if (t) it.label = t; else delete it.label; });
  else if (k === 'w' || k === 'h') patchItem(editor.sel, (it, r) => { it[k] = r2(clamp(num, 0.1, k === 'w' ? r.w - it.x : r.h - it.y)); });
  return true;
}

// Ziehen, Größe ändern und Tastatur im Editor
export function attach(el, onRedraw) {
  redraw = onRedraw;
  const down = e => {
    const rp = e.target.closest('.rp.edit'); if (!rp || e.button > 0) return;
    const itEl = e.target.closest('[data-item]'), r = room();
    if (!itEl || !r) { if (editor.sel) { editor.sel = null; redraw(); } return; }
    const id = itEl.dataset.item, it = partItems(r).find(x => x.id === id); if (!it) return;
    e.preventDefault();
    const scale = rp.getBoundingClientRect().width / r.w, rsz = !!e.target.closest('[data-rs]'), start = { x: e.clientX, y: e.clientY }, cur = { ...it }, was = editor.sel;
    editor.sel = id; rp.querySelectorAll('.rp-it.sel').forEach(n => n.classList.remove('sel')); itEl.classList.add('sel');
    let moved = false;
    const mv = ev => {
      const dx = (ev.clientX - start.x) / scale, dy = (ev.clientY - start.y) / scale;
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      moved = true;
      if (rsz) { cur.w = clamp(snap(it.w + dx), 0.1, r.w - it.x); cur.h = clamp(snap(it.h + dy), 0.1, r.h - it.y); }
      else { cur.x = clamp(snap(it.x + dx), 0, r2(r.w - it.w)); cur.y = clamp(snap(it.y + dy), 0, r2(r.h - it.h)); }
      Object.assign(itEl.style, { left: (cur.x / r.w) * 100 + '%', top: (cur.y / r.h) * 100 + '%', width: (cur.w / r.w) * 100 + '%', height: (cur.h / r.h) * 100 + '%' });
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (moved) patchItem(id, x => { x.x = r2(cur.x); x.y = r2(cur.y); x.w = r2(cur.w); x.h = r2(cur.h); });
      else if (was !== id) redraw();
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  };
  const key = e => {
    if (!editor.id || !editor.sel || e.target.closest?.('input,textarea,select,dialog')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); const id = editor.sel; editor.sel = null; patchItems(x => { const i = x.findIndex(y => y.id === id); if (i >= 0) x.splice(i, 1); }); return; }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return;
    e.preventDefault();
    const step = e.altKey ? 0.01 : 0.1;
    patchItem(editor.sel, (it, r) => { it.x = r2(clamp(it.x + d[0] * step, 0, r.w - it.w)); it.y = r2(clamp(it.y + d[1] * step, 0, r.h - it.h)); });
  };
  el.addEventListener('pointerdown', down);
  document.addEventListener('keydown', key);
  return () => { el.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
}

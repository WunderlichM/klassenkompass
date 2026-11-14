// Raumplaner (seit 2.7.0): Räume mit Tafel, Pult, Tür, Fenster, Schränken, Tischen, Werkbänken und Stühlen.
// Maße in Metern (x nach rechts, y von vorn nach hinten). Ein Raum gehört keiner Lerngruppe – mehrere Lerngruppen
// können denselben Raum nutzen (Organisationsform „Eigener Raum“ in der Sitzordnung, js/gruppen.js).
// Plätze heißen „<Kennung des Tisches>:<Nummer>“; so bleiben Zuordnungen erhalten, wenn Tische verschoben werden.
import * as store from './store.js';
import { uid } from './engine.js';
import { esc, icon, dialog, confirmDialog, toast } from './ui.js';

export const PRESETS = [
  { id: 'table2', kind: 'table', name: 'Zweiertisch', w: 1.3, h: 0.65, seats: 2 },
  { id: 'table1', kind: 'table', name: 'Einzeltisch', w: 0.7, h: 0.6, seats: 1 },
  { id: 'table4', kind: 'table', name: 'Gruppentisch', w: 1.4, h: 1.3, seats: 4 },
  { id: 'bench', kind: 'bench', name: 'Werkbank', w: 2.0, h: 0.9, seats: 4 },
  { id: 'chair', kind: 'chair', name: 'Stuhl', w: 0.55, h: 0.55, seats: 1 },
  { id: 'board', kind: 'board', name: 'Tafel', w: 3.6, h: 0.2 },
  { id: 'desk', kind: 'desk', name: 'Pult', w: 1.4, h: 0.7 },
  { id: 'door', kind: 'door', name: 'Tür', w: 1.0, h: 0.15 },
  { id: 'window', kind: 'window', name: 'Fenster', w: 1.6, h: 0.15 },
  { id: 'cabinet', kind: 'cabinet', name: 'Schrank', w: 1.2, h: 0.5 },
];
const NAMES = { table: 'Tisch', bench: 'Werkbank', chair: 'Stuhl', board: 'Tafel', desk: 'Pult', door: 'Tür', window: 'Fenster', cabinet: 'Schrank' };
const SEATED = ['table', 'bench', 'chair'];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const snap = v => Math.round(v * 20) / 20;                     // 5 cm
const r2 = v => Math.round(v * 100) / 100;

export const list = () => store.get().technik.rooms || [];
export const byId = id => list().find(r => r.id === id) || null;
export const seatsOf = it => (it.kind === 'chair' ? 1 : SEATED.includes(it.kind) ? clamp(Math.round(Number(it.seats) || 0), 0, 12) : 0);
export const nameOf = it => it.label || (it.kind === 'table' ? `${PRESETS.find(p => p.kind === 'table' && p.seats === seatsOf(it))?.name || 'Tisch'}` : NAMES[it.kind]);

// Tische und Stühle in Lesereihenfolge: von vorn nach hinten in Reihen (Mitten näher als 45 cm = eine Reihe), darin von links
export function seatItems(room) {
  const yc = it => it.y + it.h / 2, rows = [];
  for (const it of room.items.filter(x => seatsOf(x) > 0).sort((a, b) => yc(a) - yc(b))) {
    const row = rows[rows.length - 1];
    if (row && yc(it) - row.y0 < 0.45) row.items.push(it); else rows.push({ y0: yc(it), items: [it] });
  }
  return rows.flatMap(r => r.items.sort((a, b) => a.x - b.x));
}
export const slotKeys = room => seatItems(room).flatMap(it => Array.from({ length: seatsOf(it) }, (_, i) => it.id + ':' + i));
export const seatCount = room => (room ? slotKeys(room).length : 0);
// Zuordnung → Liste in Lesereihenfolge (für andere Organisationsformen) und zurück
export const slotsToFlat = (room, slots) => (room ? slotKeys(room).map(k => slots?.[k] || null) : []);
export function flatToSlots(room, seats) {
  const keys = room ? slotKeys(room) : [], out = {};
  (seats || []).forEach((id, i) => { if (id && i < keys.length) out[keys[i]] = id; });
  return out;
}
// Gemischte Gruppen auf den Raum verteilen: jede Gruppe bekommt eigene Tische (in Lesereihenfolge). Reicht das nicht,
// werden die Plätze ohne Rücksicht auf Tischgrenzen gefüllt. over = Kinder ohne Platz.
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

// ---------- Darstellung ----------
// opts: flip (Blick von der Tafel: Raum um 180° gedreht), edit, seat(key, item, i) → HTML eines Platzes,
// itemClass(item) → [Klasse, Stil] für Tische (z. B. Gruppenfarbe)
export function roomHtml(room, opts = {}) {
  const { flip = false, edit = false } = opts, W = room.w, H = room.h, sel = edit ? editor.sel : null;
  const items = room.items.map(it => {
    const x = flip ? W - it.x - it.w : it.x, y = flip ? H - it.y - it.h : it.y, n = seatsOf(it), hor = it.w >= it.h;
    const rows = n >= 4 && Math.min(it.w, it.h) >= 0.9 ? 2 : 1, cols = Math.ceil(n / rows), [cls, style] = opts.itemClass?.(it) || ['', ''];
    let inner;
    if (n) {
      const idx = Array.from({ length: n }, (_, i) => i); if (flip) idx.reverse();
      const sw = hor ? it.w / cols : it.w / rows;
      inner = `<div class="rp-seats" style="grid-template-columns:repeat(${hor ? cols : rows},minmax(0,1fr));grid-template-rows:repeat(${hor ? rows : cols},minmax(0,1fr));grid-auto-flow:${hor ? 'row' : 'column'};--sw:${sw.toFixed(2)}">${idx.map(i => (opts.seat ? opts.seat(it.id + ':' + i, it, i) : '<div class="seat free"></div>')).join('')}</div>`;
    } else inner = `<span class="rp-label">${it.kind === 'door' ? icon('forward', 12) : ''}${esc(it.label || NAMES[it.kind])}</span>`;
    return `<div class="rp-it k-${it.kind} ${it.h > it.w * 1.6 && !n ? 'vert' : ''} ${cls} ${sel === it.id ? 'sel' : ''}" ${edit ? `data-item="${esc(it.id)}" title="${esc(nameOf(it))}"` : ''} style="left:${(x / W) * 100}%;top:${(y / H) * 100}%;width:${(it.w / W) * 100}%;height:${(it.h / H) * 100}%;${style}">${inner}${sel === it.id ? '<i class="rp-rs" data-rs title="Größe ändern"></i>' : ''}</div>`;
  });
  return `<div class="rp ${edit ? 'edit' : ''}" style="aspect-ratio:${W} / ${H};--W:${W};--H:${H}">${items.join('')}${room.items.length ? '' : '<p class="rp-empty">Leerer Raum – rechts Tafel, Tische und mehr hinzufügen.</p>'}</div>`;
}

// ---------- Vorlage: Raum mit Tischreihen ----------
const KINDS_GEN = { table2: 'Zweiertische', table1: 'Einzeltische', table4: 'Gruppentische (4 Plätze)', bench: 'Werkbänke (4 Plätze)' };
const DOORS = { vl: 'vorne links', vr: 'vorne rechts', hl: 'hinten links', hr: 'hinten rechts' };
export function generate({ w, h, kind, rows, per, door }) {
  const p = PRESETS.find(x => x.id === kind) || PRESETS[0], items = [], it = (k, x, y, iw, ih, extra = {}) => items.push({ id: uid(), kind: k, x: r2(x), y: r2(y), w: iw, h: ih, ...extra });
  const left = door[1] === 'l';
  it('board', (w - Math.min(3.6, w - 1)) / 2, 0.05, r2(Math.min(3.6, w - 1)), 0.2);
  it('desk', left ? w - 2.0 : 0.6, 0.7, 1.4, 0.7);
  it('door', left ? 0.02 : w - 0.17, door[0] === 'v' ? 0.5 : h - 1.6, 0.15, 1.0);
  for (let i = 0; i < Math.min(3, Math.floor((h - 1.5) / 2.2)); i++) it('window', left ? w - 0.17 : 0.02, 1.2 + i * 2.2, 0.15, 1.6);
  const top = 1.9, areaW = w - 1.2, areaH = h - top - 0.6, gapX = per > 1 ? (areaW - per * p.w) / (per - 1) : 0, gapY = rows > 1 ? (areaH - rows * p.h) / (rows - 1) : 0;
  if (per * p.w > areaW || (per > 1 && gapX < 0.25)) throw new Error(`${per} ${KINDS_GEN[kind]} passen nicht nebeneinander. Raum breiter machen oder weniger je Reihe wählen.`);
  if (rows * p.h > areaH || (rows > 1 && gapY < 0.4)) throw new Error(`${rows} Reihen passen nicht hintereinander. Raum tiefer machen oder weniger Reihen wählen.`);
  const x0 = per > 1 ? 0.6 : (w - p.w) / 2;
  for (let r = 0; r < rows; r++) for (let c = 0; c < per; c++) it(p.kind, x0 + c * (p.w + gapX), top + r * (p.h + gapY), p.w, p.h, { seats: p.seats });
  return items;
}
// Neuer Raum (oder bei room: Tische neu anordnen). onDone(room) nach dem Speichern.
export function roomDialog({ room = null, tables = 14, cols = 3, onDone } = {}) {
  // Vorschlag für die Raumgröße: je Reihe etwa 1,3 m (Tisch und Stuhl), zwischen den Tischen 0,9 m Gang
  const per = clamp(cols, 1, 8), rows = clamp(Math.ceil(tables / per), 1, 10);
  const dw = Math.max(7, Math.ceil(1.2 + per * 1.3 + (per - 1) * 0.9)), dh = Math.max(6, Math.ceil(2.4 + rows * 1.15));
  dialog({ title: room ? 'Tische neu anordnen' : 'Neuer Raum', submit: room ? 'Anordnen' : 'Raum anlegen', body: `
    ${room ? '' : `<label class="field">Name des Raums<input name="name" class="input" maxlength="40" placeholder="z. B. Technikraum 1" value="Raum ${list().length + 1}"></label>`}
    <div class="two"><label class="field">Breite (m) <small class="muted">– Tafelwand</small><input name="w" class="input" type="number" step="0.1" min="3" max="30" value="${room ? room.w : dw}" ${room ? 'readonly' : ''}></label>
    <label class="field">Tiefe (m) <small class="muted">– Tafel bis Rückwand</small><input name="h" class="input" type="number" step="0.1" min="3" max="30" value="${room ? room.h : dh}" ${room ? 'readonly' : ''}></label></div>
    <div class="three"><label class="field">Tische<select name="kind" class="select">${Object.entries(KINDS_GEN).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    <label class="field">Reihen<input name="rows" class="input" type="number" min="1" max="12" value="${rows}"></label>
    <label class="field">Je Reihe<input name="per" class="input" type="number" min="1" max="10" value="${per}"></label></div>
    ${room ? '<p class="muted small-text">Ersetzt alle Tische, Werkbänke und Stühle; Tafel, Pult, Tür, Fenster und Schränke bleiben. Die Sitzordnung in diesem Raum beginnt danach neu.</p>'
      : `<label class="field">Tür<select name="door" class="select">${Object.entries(DOORS).map(([k, v]) => `<option value="${k}" ${k === 'vr' ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <p class="muted small-text">Der Raum entsteht mit Tafel, Pult, Tür, Fenstern und Tischreihen. Danach verschiebst du alles wie im echten Raum.</p>`}`,
    onSubmit: fd => {
      const w = clamp(Number(fd.get('w')) || 8, 3, 30), h = clamp(Number(fd.get('h')) || 7, 3, 30);
      const items = generate({ w, h, kind: String(fd.get('kind')), rows: clamp(Number(fd.get('rows')) || 1, 1, 12), per: clamp(Number(fd.get('per')) || 1, 1, 10), door: String(fd.get('door') || 'vr') });
      if (room) {
        store.update(s => { const r = s.technik.rooms.find(x => x.id === room.id); if (r) r.items = [...r.items.filter(i => !SEATED.includes(i.kind)), ...items.filter(i => SEATED.includes(i.kind))]; });
        onDone?.(byId(room.id));
      } else {
        const r = { id: uid(), name: String(fd.get('name') || '').trim().slice(0, 40) || `Raum ${list().length + 1}`, w, h, items };
        store.update(s => { (s.technik.rooms ||= []).push(r); });
        onDone?.(r);
      }
    } });
}

// ======================================================================
// Editor
// ======================================================================
export const editor = { id: null, sel: null };
let redraw = () => {};
const room = () => byId(editor.id);
const patchRoom = fn => store.update(s => { const r = s.technik.rooms.find(x => x.id === editor.id); if (r) fn(r); });
const patchItem = (id, fn) => patchRoom(r => { const it = r.items.find(x => x.id === id); if (it) fn(it, r); });
export function open(id) { editor.id = id; editor.sel = null; }
export function close() { editor.id = null; editor.sel = null; }

export function editorHtml() {
  const r = room(); if (!r) return '';
  return `<div class="card room-card">
      <div class="card-head">
        <div><p class="eyebrow">Raumplaner</p><h2>${esc(r.name)} <span class="badge">${r.w} × ${r.h} m · ${seatCount(r)} Plätze</span></h2></div>
        <div class="tools"><button class="btn primary" data-act="rp-done">${icon('check', 16)} Fertig</button></div>
      </div>
      <div class="room-wrap rp-wrap"><div class="room v2 raum">${roomHtml(r, { edit: true })}</div></div>
      <p class="hint">${icon('check', 14)} Teile ziehen zum Verschieben, die Ecke unten rechts für die Größe. Pfeiltasten verschieben das gewählte Teil um 10 cm (mit Alt um 1 cm), Entf löscht es. Raster: 1 m.</p>
    </div>`;
}
export function editorSide() {
  const r = room(); if (!r) return '';
  const it = r.items.find(x => x.id === editor.sel), n = it ? seatsOf(it) : 0;
  const num = (k, label, v, step = 0.05, min = 0.1, max = 30) => `<label class="field">${label}<input class="input" type="number" data-rp="${k}" step="${step}" min="${min}" max="${max}" value="${v}"></label>`;
  return `<div class="card">
      <h3>${icon('grid', 16)} Raum</h3>
      <label class="field">Name<input class="input" data-rp="name" maxlength="40" value="${esc(r.name)}"></label>
      <div class="two">${num('rw', 'Breite (m)', r.w, 0.1, 3)}${num('rh', 'Tiefe (m)', r.h, 0.1, 3)}</div>
      <p class="muted small-text">Breite = Wand mit der Tafel, Tiefe = von der Tafel bis zur Rückwand.</p>
      <button class="btn ghost full" data-act="rp-gen">${icon('grid', 15)} Tische in Reihen neu anordnen …</button>
    </div>
    <div class="card">
      <h3>${icon('plus', 16)} Hinzufügen</h3>
      <div class="rp-palette">${PRESETS.map(p => `<button class="btn ghost sm" data-act="rp-add" data-p="${p.id}"><i class="rp-swatch k-${p.kind}"></i>${p.name}</button>`).join('')}</div>
    </div>
    ${it ? `<div class="card">
      <div class="card-head small"><h3>${esc(nameOf(it))}</h3><button class="icon-btn sm" data-act="rp-desel" aria-label="Auswahl aufheben">${icon('x', 15)}</button></div>
      ${SEATED.includes(it.kind) && it.kind !== 'chair' ? `<div class="num-row"><label>Plätze<span class="stepper"><button data-act="rp-seats" data-d="-1" ${n > 1 ? '' : 'disabled'}>−</button><output>${n}</output><button data-act="rp-seats" data-d="1" ${n < 12 ? '' : 'disabled'}>+</button></span></label></div>` : ''}
      <div class="two">${num('w', 'Breite (m)', it.w)}${num('h', 'Tiefe (m)', it.h)}</div>
      ${n ? '' : `<label class="field">Beschriftung<input class="input" data-rp="label" maxlength="24" value="${esc(it.label || '')}" placeholder="${esc(NAMES[it.kind])}"></label>`}
      <div class="tools"><button class="btn ghost sm" data-act="rp-rot">${icon('repeat', 15)} Drehen</button><button class="btn ghost sm" data-act="rp-copy">${icon('plus', 15)} Kopieren</button><button class="btn ghost sm danger-text" data-act="rp-del">${icon('trash', 15)} Löschen</button></div>
    </div>` : '<div class="card"><p class="muted small-text">Ein Teil im Raum antippen, um Plätze, Größe oder Beschriftung zu ändern, es zu drehen, zu kopieren oder zu löschen.</p></div>'}
    <div class="card"><button class="btn ghost full danger-text" data-act="rp-delroom">${icon('trash', 15)} Raum löschen</button></div>`;
}
// Neues Teil an eine freie Stelle setzen (versetzt, damit es nicht genau auf einem anderen liegt)
function freeSpot(r, w, h) {
  const hit = (x, y) => r.items.some(o => x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y);
  for (let y = 0.3; y + h <= r.h; y += 0.25) for (let x = 0.3; x + w <= r.w; x += 0.25) if (!hit(x, y)) return { x: r2(x), y: r2(y) };
  return { x: r2((r.w - w) / 2), y: r2((r.h - h) / 2) };
}

// Klicks im Editor; Rückgabe true = erledigt
export function click(act, b, onRoomDeleted) {
  if (!act.startsWith('rp-')) return false;
  const r = room(); if (!r) return true;
  const sel = editor.sel;
  switch (act) {
    case 'rp-done': close(); redraw(); break;
    case 'rp-desel': editor.sel = null; redraw(); break;
    case 'rp-add': {
      const p = PRESETS.find(x => x.id === b.dataset.p); if (!p) break;
      if (r.items.length >= 300) { toast('Höchstens 300 Teile je Raum.'); break; }
      const w = Math.min(p.w, r.w), h = Math.min(p.h, r.h), it = { id: uid(), kind: p.kind, w, h, ...freeSpot(r, w, h), ...(p.seats ? { seats: p.seats } : {}) };
      editor.sel = it.id; patchRoom(x => { x.items.push(it); });
      break;
    }
    case 'rp-seats': patchItem(sel, it => { it.seats = clamp(seatsOf(it) + Number(b.dataset.d), 1, 12); }); break;
    case 'rp-rot': patchItem(sel, (it, x) => { const cx = it.x + it.w / 2, cy = it.y + it.h / 2; [it.w, it.h] = [it.h, it.w]; it.x = r2(clamp(cx - it.w / 2, 0, x.w - it.w)); it.y = r2(clamp(cy - it.h / 2, 0, x.h - it.h)); }); break;
    case 'rp-copy': {
      const it = r.items.find(x => x.id === sel); if (!it) break;
      const c = { ...structuredClone(it), id: uid(), x: r2(clamp(it.x + 0.3, 0, r.w - it.w)), y: r2(clamp(it.y + 0.3, 0, r.h - it.h)) };
      editor.sel = c.id; patchRoom(x => { x.items.push(c); });
      break;
    }
    case 'rp-del': editor.sel = null; patchRoom(x => { x.items = x.items.filter(i => i.id !== sel); }); break;
    case 'rp-gen': roomDialog({ room: r, tables: seatItems(r).length || 14, cols: 3, onDone: () => { editor.sel = null; redraw(); } }); break;
    case 'rp-delroom': (async () => {
      if (!(await confirmDialog('Raum löschen', `Den Raum „${r.name}“ löschen? Lerngruppen, die ihn nutzen, wechseln zur Organisationsform Omnibus; ihre Sitzordnung bleibt in der bisherigen Reihenfolge erhalten.`))) return;
      onRoomDeleted?.(r); close(); store.update(s => { s.technik.rooms = s.technik.rooms.filter(x => x.id !== r.id); }); toast('Raum gelöscht.');
    })(); break;
  }
  return true;
}
// Eingaben in der Seitenleiste des Editors; Rückgabe true = erledigt
export function change(e) {
  const k = e.target.dataset?.rp; if (!k || !room()) return false;
  const v = e.target.value, num = clamp(Number(v) || 0, 0.1, 30);
  if (k === 'name') patchRoom(r => { r.name = v.trim().slice(0, 40) || r.name; });
  else if (k === 'rw' || k === 'rh') patchRoom(r => { const key = k === 'rw' ? 'w' : 'h'; r[key] = r2(clamp(num, 3, 30)); for (const it of r.items) { it.w = Math.min(it.w, r.w); it.h = Math.min(it.h, r.h); it.x = r2(clamp(it.x, 0, r.w - it.w)); it.y = r2(clamp(it.y, 0, r.h - it.h)); } });
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
    const id = itEl.dataset.item, it = r.items.find(x => x.id === id); if (!it) return;
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
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); const id = editor.sel; editor.sel = null; patchRoom(x => { x.items = x.items.filter(i => i.id !== id); }); return; }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return;
    e.preventDefault();
    const step = e.altKey ? 0.01 : 0.1;
    patchItem(editor.sel, (it, r) => { it.x = r2(clamp(it.x + d[0] * step, 0, r.w - it.w)); it.y = r2(clamp(it.y + d[1] * step, 0, r.h - it.h)); });
  };
  el.addEventListener('pointerdown', down);
  document.addEventListener('keydown', key);
  return () => { el.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
}

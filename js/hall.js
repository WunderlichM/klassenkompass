// Hallenplaner (Sport): schräg von oben gesehene Halle, Elemente aus der Leiste hineinziehen, verschieben,
// drehen und in der Größe ändern. Planungssymbole (Bereiche, Hütchen, Kinder, Pfeile …) und Geräte (hallgear.js)
// zeichnet die App selbst. Zusätzlich kann jede Lehrkraft eigene Bilder hinzufügen: Sie liegen nur auf ihren
// Geräten (IndexedDB) und verschlüsselt im eigenen Konto – nie im öffentlichen Quellcode.
import * as store from './store.js';
import * as images from './images.js';
import { uid } from './engine.js';
import * as gear from './hallgear.js';
import { esc, icon, dialog, confirmDialog, toast } from './ui.js';

import { BW, BH, K, FLOOR, HALL, MARKS, fp, floorPoints, marksSvg, badmintonCourts } from './hallfloor.js';
export { BW, BH };
const COLORS = [['#2e7d4f', 'Grün'], ['#d9a521', 'Gelb'], ['#c94040', 'Rot'], ['#3d6fb5', 'Blau'], ['#7b57b0', 'Lila'], ['#e07b2a', 'Orange'], ['#6b7280', 'Grau'], ['#25272e', 'Schwarz']];

// Elementarten: Standardgröße, Farbe, Text; keep = Seitenverhältnis beim Vergrößern beibehalten
const KINDS = {
  zone: { label: 'Bereich', w: 420, h: 560, color: '#3d6fb5', text: 'Gruppe', rotate: false },
  cone: { label: 'Hütchen', w: 70, h: 70, color: '#2e7d4f', text: 'H1', keep: true },
  kid: { label: 'Kind', w: 56, h: 96, color: '#3d6fb5', text: '1', keep: true },
  ball: { label: 'Ball', w: 40, h: 40, color: '#6c6cf0', keep: true },
  arrow: { label: 'Laufweg', w: 220, h: 44, color: '#2f5e8e' },
  path: { label: 'Weg (Freigabe)', w: 320, h: 34, color: '#b0602a' },
  cross: { label: 'Sperrfläche', w: 64, h: 64, color: '#25272e', keep: true },
  tag: { label: 'Schild S/LK', w: 90, h: 64, text: 'S' },
  text: { label: 'Text', w: 260, h: 54, text: 'Text', color: '#25272e' },
  gear: { label: 'Gerät', keep: true },
  img: { label: 'Bild', keep: true },
};
const PLAN_TOOLS = ['zone', 'cone', 'kid', 'ball', 'arrow', 'path', 'cross', 'tag', 'text'];
const hasText = k => ['zone', 'cone', 'kid', 'tag', 'text'].includes(k);
const hasColor = i => (i.kind === 'gear' ? !!gear.GEAR[i.gear]?.color : ['zone', 'cone', 'kid', 'ball', 'arrow', 'path', 'text'].includes(i.kind));
// Seitenverhältnis beim Ziehen am Griff beibehalten (Geräte quer wie Bank oder Netz dürfen länger werden)
const keepOf = i => (i.kind === 'gear' ? !gear.isStretch(i.gear, i.view) : !!KINDS[i.kind].keep);

// Eigene Bilder mit Namen nach dem Muster „V02-035 - Bank lang - quer.png“ → Gruppe, Name, Ansicht
const CATS = { V02: 'Matten, Kästen, Bänke', V03: 'Sprossenwand, Barren, Reck', V04: 'Körbe, Seile, Sprunggeräte', V05: 'Balken, Netze, Tore, Technik', V06: 'Kleingeräte, Hütchen, Bälle', V07: 'Tischtennis, Banden, Türen', V08: 'Kinder in Bewegung', V09: 'Kinder (auch sitzend)', W04: 'WIMASU-Ergänzungen' };
export function parseImageName(file) {
  const base = String(file).replace(/\.[a-z0-9]+$/i, '').trim();
  const m = base.match(/^([A-Z]\d{2})-(\d{3})\s*-\s*(.+?)(?:\s+-\s+([^-]+))?$/);
  if (!m) return { code: '', name: base.slice(0, 80) || 'Bild', view: '', cat: 'Eigene Bilder', key: 'eigen|' + base };
  const [, pre, num, name, view = ''] = m;
  return { code: `${pre}-${num}`, name: name.trim(), view: view.trim(), cat: CATS[pre] || 'Weitere Bilder', key: pre + '|' + name.trim() };
}

// ---------- Zustand ----------
let host = null, selected = null, drag = null;
const libOpen = new Set(['g:' + gear.GROUPS[0]]); // geöffnete Gruppen der Leiste
const history = new Map(); // Plan-ID → { undo: [], redo: [] }
const sp = () => store.get().sport;
const plan = () => sp().halls.find(h => h.id === sp().activeHall) || sp().halls[0] || null;
const itemOf = (p, id) => p?.items.find(i => i.id === id);
const libEntry = id => sp().hallLib.find(e => e.id === id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function hist(id) { if (!history.has(id)) history.set(id, { undo: [], redo: [] }); return history.get(id); }
// Änderung am aktuellen Plan mit Rückgängig-Schritt
function commit(fn) {
  const p = plan(); if (!p) return;
  const h = hist(p.id); h.undo.push(JSON.stringify(p)); if (h.undo.length > 60) h.undo.shift(); h.redo = [];
  store.update(s => { const x = s.sport.halls.find(y => y.id === p.id); if (x) { fn(x); x.demo = false; } });
}
function undo(redo = false) {
  const p = plan(); if (!p) return;
  const h = hist(p.id), from = redo ? h.redo : h.undo, to = redo ? h.undo : h.redo;
  if (!from.length) return;
  to.push(JSON.stringify(p));
  const prev = JSON.parse(from.pop());
  store.update(s => { const i = s.sport.halls.findIndex(y => y.id === p.id); if (i >= 0) s.sport.halls[i] = prev; });
  if (selected && !itemOf(prev, selected)) selected = null;
}

// ---------- Zeichnen (auch für den Bildschirm, dort nur ansehen) ----------
const num = v => Math.round(v * 10) / 10;
function floorSvg(p) {
  if (p.floor === 'leer') return '';
  let lines = '';
  if (p.floor === 'linien') {
    const a = fp(HALL.len / 2, 0), b = fp(HALL.len / 2, HALL.dep), c = Array.from({ length: 40 }, (_, i) => { const t = i / 40 * 2 * Math.PI; return fp(HALL.len / 2 + 2.2 * Math.cos(t), HALL.dep / 2 + 2.2 * Math.sin(t)).map(num).join(','); }).join(' ');
    lines = `<line x1="${num(a[0])}" y1="${num(a[1])}" x2="${num(b[0])}" y2="${num(b[1])}" class="hf-line"/><polygon points="${c}" class="hf-line"/>`;
  }
  return `<polygon points="${floorPoints()}" class="hf-floor"/>${lines}${marksSvg(p.lines)}`;
}
function para(w, h, k = K) { const d = h * k; return `${num(d)},0 ${num(w)},0 ${num(w - d)},${num(h)} 0,${num(h)}`; }
function textLines(t, x, y, size, cls = '') {
  const lines = String(t || '').split('\n');
  return `<text x="${num(x)}" y="${num(y)}" font-size="${num(size)}" class="${cls}" text-anchor="middle">${lines.map((l, i) => `<tspan x="${num(x)}" dy="${i ? '1.15em' : 0}">${esc(l)}</tspan>`).join('')}</text>`;
}
function shape(i) {
  const { w, h } = i, c = i.color || KINDS[i.kind]?.color || '#333';
  switch (i.kind) {
    case 'zone': {
      const fs = clamp(Math.min(w, h) * 0.11, 18, 48);
      return `<polygon points="${para(w, h)}" fill="${c}" fill-opacity=".14" stroke="${c}" stroke-opacity=".55" stroke-width="4"/>${i.text ? textLines(i.text, w / 2 + h * K * 0.35, fs * 1.4, fs, 'h-label') : ''}`;
    }
    case 'cone': {
      const r = Math.min(w, h) / 2, fs = r * (String(i.text || '').length > 2 ? 0.62 : 0.78);
      return `<circle cx="${w / 2}" cy="${h / 2}" r="${num(r - 3)}" fill="${c}" stroke="#1f2a3c" stroke-width="4"/>${i.text ? `<text x="${w / 2}" y="${h / 2}" dy=".35em" font-size="${num(fs)}" text-anchor="middle" class="h-on-color">${esc(i.text)}</text>` : ''}`;
    }
    case 'kid': {
      const s = w / 56, hy = 14 * s;
      return `<g fill="${c}" stroke="#1f2a3c" stroke-width="${num(2.5 * s)}" stroke-linejoin="round"><circle cx="${w / 2}" cy="${num(hy)}" r="${num(11 * s)}"/><path d="M${num(w / 2 - 14 * s)} ${num(66 * s)}v${num(-26 * s)}a${num(14 * s)} ${num(12 * s)} 0 0 1 ${num(28 * s)} 0v${num(26 * s)}z"/></g>${i.text ? `<text x="${w / 2}" y="${num(h - 4 * s)}" font-size="${num(22 * s)}" text-anchor="middle" class="h-label">${esc(i.text)}</text>` : ''}`;
    }
    case 'ball': {
      const r = Math.min(w, h) / 2;
      return `<circle cx="${w / 2}" cy="${h / 2}" r="${num(r - 2)}" fill="${c}" stroke="#2c2f6e" stroke-width="3"/><circle cx="${num(w / 2 - r * .3)}" cy="${num(h / 2 - r * .3)}" r="${num(r * .22)}" fill="#fff" opacity=".6"/>`;
    }
    case 'arrow': {
      const t = h * 0.42, head = Math.min(h * 1.1, w * 0.45);
      return `<polygon points="0,${num(h / 2 - t / 2)} ${num(w - head)},${num(h / 2 - t / 2)} ${num(w - head)},0 ${w},${num(h / 2)} ${num(w - head)},${h} ${num(w - head)},${num(h / 2 + t / 2)} 0,${num(h / 2 + t / 2)}" fill="${c}"/>`;
    }
    case 'path': {
      const head = Math.min(h * 1.1, w * 0.4), t = Math.max(4, h * 0.22);
      return `<line x1="0" y1="${h / 2}" x2="${num(w - head * .8)}" y2="${h / 2}" stroke="${c}" stroke-width="${num(t)}" stroke-dasharray="${num(t * 3)} ${num(t * 2.2)}"/><polygon points="${num(w - head)},0 ${w},${h / 2} ${num(w - head)},${h}" fill="${c}"/>`;
    }
    case 'cross':
      return `<path d="M6 6L${w - 6} ${h - 6}M${w - 6} 6L6 ${h - 6}" stroke="${c}" stroke-width="${num(Math.min(w, h) * .14)}" stroke-linecap="round"/>`;
    case 'tag':
      return `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" fill="#fff" stroke="#1f2a3c" stroke-width="5"/><text x="${w / 2}" y="${h / 2}" dy=".35em" font-size="${num(h * .52)}" text-anchor="middle" class="h-label">${esc(i.text || '')}</text>`;
    case 'text':
      return `<text x="${w / 2}" y="${h / 2}" dy=".35em" font-size="${num(h * .72)}" text-anchor="middle" class="h-label" fill="${c}">${esc(i.text || '')}</text>`;
    case 'gear':
      return gear.gearSvg(i);
    case 'img':
      return `<rect class="h-ph" width="${w}" height="${h}" rx="6"/><text class="h-ph-t" x="${w / 2}" y="${h / 2}" dy=".35em" text-anchor="middle" font-size="${num(clamp(Math.min(w, h) * .16, 12, 28))}">Bild fehlt</text><image data-img="${esc(i.img)}" width="${w}" height="${h}" preserveAspectRatio="none"/>`;
  }
  return '';
}
const itemSvg = i => `<g class="hi" data-hid="${esc(i.id)}" transform="translate(${num(i.x)} ${num(i.y)})${i.rot ? ` rotate(${i.rot} ${num(i.w / 2)} ${num(i.h / 2)})` : ''}">${shape(i)}</g>`;
const defs = '<defs><pattern id="h-net" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M0 0L16 16M16 0L0 16" stroke="#9aa3b2" stroke-width="1.5"/></pattern></defs>';
// Ausschnitt um Hallenfläche und Elemente (für das Bildschirm-Objekt, damit wenig Rand bleibt)
function contentBox(p) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
  if (p.floor !== 'leer') add(FLOOR.left, FLOOR.top, FLOOR.left + FLOOR.width + FLOOR.height * K, FLOOR.bottom);
  p.items.forEach(i => { const r = i.rot ? Math.hypot(i.w, i.h) / 2 : 0, cx = i.x + i.w / 2, cy = i.y + i.h / 2; r ? add(cx - r, cy - r, cx + r, cy + r) : add(i.x, i.y, i.x + i.w, i.y + i.h); });
  if (!Number.isFinite(x0)) return `0 0 ${BW} ${BH}`;
  const pad = 24; return `${num(x0 - pad)} ${num(y0 - pad)} ${num(x1 - x0 + 2 * pad)} ${num(y1 - y0 + 2 * pad)}`;
}
export function boardSvg(p, { edit = false, cls = '', crop = false } = {}) {
  if (!p) return '';
  return `<svg class="hall-svg ${cls}" viewBox="${crop ? contentBox(p) : `0 0 ${BW} ${BH}`}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Hallenplan ${esc(p.title)}">${defs}
    <rect x="-2000" y="-2000" width="${BW + 4000}" height="${BH + 4000}" class="hf-bg"/>${floorSvg(p)}${p.items.map(itemSvg).join('')}${edit ? '<g class="h-sel" data-sel></g>' : ''}</svg>`;
}
// Bilder in einer Zeichnung nachladen
export function hydrateSvg(el) {
  el?.querySelectorAll('image[data-img]').forEach(async im => {
    const u = await images.url(im.dataset.img).catch(() => null);
    if (u) { im.setAttribute('href', u); im.closest('.hi')?.classList.add('ok'); }
  });
}
export const planById = id => sp().halls.find(h => h.id === id) || null;
export const planList = () => sp().halls.map(h => ({ id: h.id, title: h.title }));

// ---------- Editor ----------
export function attach(el) {
  host = el;
  const p = plan();
  if (selected && !itemOf(p, selected)) selected = null;
  el.innerHTML = p ? editorHtml(p) : `<div class="card empty"><p>Noch kein Hallenplan.</p><button class="btn primary" data-h="new">${icon('plus')} Neuer Hallenplan</button></div>`;
  el.onclick = onClick; el.onchange = onChange; el.oninput = onInput; el.onkeydown = onKey;
  el.onpointerdown = onPointerDown;
  if (p) { hydrateSvg(el.querySelector('.hall-board')); images.hydrate(el.querySelector('.hall-palette')); drawSel(); }
}

function editorHtml(p) {
  const h = hist(p.id), presenting = document.body.classList.contains('presenting');
  return `<div class="hall ${presenting ? 'presenting' : ''}">
    <div class="hall-bar no-print">
      <select class="select sm" data-hc="plan" aria-label="Hallenplan wählen">${sp().halls.map(x => `<option value="${esc(x.id)}" ${x.id === p.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select>
      <button class="btn ghost sm" data-h="new">${icon('plus', 15)} Neu</button>
      <button class="btn ghost sm" data-h="rename">${icon('edit', 15)} Umbenennen</button>
      <button class="btn ghost sm" data-h="copy">Kopie</button>
      <button class="btn ghost sm" data-h="del-plan" title="Hallenplan löschen">${icon('trash', 15)}</button>
      <span class="hall-sep"></span>
      <label class="small-text">Halle <select class="select sm" data-hc="floor">${[['halle', 'Hallenfläche'], ['linien', 'mit Mittellinie'], ['leer', 'ohne Fläche']].map(([v, l]) => `<option value="${v}" ${p.floor === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <button class="icon-btn sm" data-h="undo" title="Rückgängig (Strg+Z)" aria-label="Rückgängig" ${h.undo.length ? '' : 'disabled'}>${icon('back', 16)}</button>
      <button class="icon-btn sm" data-h="redo" title="Wiederholen (Strg+Y)" aria-label="Wiederholen" ${h.redo.length ? '' : 'disabled'}>${icon('forward', 16)}</button>
    </div>
    <div class="hall-bar hall-marks no-print"><span class="small-text muted">Spielfeldlinien</span>
      ${MARKS.map(m => `<button class="h-mark ${p.lines?.includes(m.id) ? 'on' : ''}" style="--c:${m.color}" data-h="mark" data-mark="${m.id}" aria-pressed="${p.lines?.includes(m.id) ? 'true' : 'false'}" ${p.floor === 'leer' ? 'disabled' : ''}><i></i>${esc(m.label)}</button>`).join('')}
    </div>
    <div class="hall-selbar no-print" data-selbar>${selBarHtml(p)}</div>
    <div class="hall-work">
      <aside class="hall-palette no-print">${paletteHtml()}</aside>
      <div class="hall-board" tabindex="0">
        <p class="print-only print-title">${esc(p.title)}</p>
        ${boardSvg(p, { edit: true })}
        <p class="hall-note">Schematisch · Abstände und nutzbaren Raum vor Ort prüfen</p>
      </div>
    </div>
  </div>`;
}

function tile(kind, extra = '') {
  const k = KINDS[kind], i = { id: 't', kind, x: 0, y: 0, w: k.w, h: k.h, rot: 0, color: k.color, text: kind === 'zone' ? '' : k.text };
  return `<button class="h-tile" data-add="${kind}" ${extra} title="${esc(k.label)} – ziehen oder antippen"><svg viewBox="-6 -6 ${k.w + 12} ${k.h + 12}" class="h-tile-svg">${defs}${shape(i)}</svg><span>${esc(k.label)}</span></button>`;
}
function gearTile(g) {
  const v = g.views[0], { w, h } = gear.gearSize(g.id, v), i = { kind: 'gear', gear: g.id, view: v, w, h };
  return `<button class="h-tile" data-add="gear" data-gear="${esc(g.id)}" title="${esc(g.name)}${g.views.length > 1 ? ` (${g.views.length} Ansichten)` : ''} – ziehen oder antippen"><svg viewBox="-4 -4 ${w + 8} ${h + 8}" class="h-tile-svg">${defs}${shape(i)}</svg><span>${esc(g.short)}</span></button>`;
}
function paletteHtml() {
  const lib = sp().hallLib, byKey = new Map();
  for (const e of [...lib].sort((a, b) => (a.code || '~').localeCompare(b.code || '~') || a.name.localeCompare(b.name))) if (!byKey.has(e.key)) byKey.set(e.key, e);
  const cats = new Map();
  for (const e of byKey.values()) { if (!cats.has(e.cat)) cats.set(e.cat, []); cats.get(e.cat).push(e); }
  const imgTile = e => { const n = lib.filter(x => x.key === e.key).length; return `<button class="h-tile img" data-addimg="${esc(e.id)}" title="${esc(e.name)}${n > 1 ? ` (${n} Ansichten)` : ''} – ziehen oder antippen">${images.imgTag(e.id, 'h-thumb')}<span>${esc(e.name)}</span></button>`; };
  const gearCats = gear.GROUPS.map(c => [c, gear.gearList().filter(g => g.group === c)]);
  return `<details open><summary>Planung</summary><div class="h-tiles">${PLAN_TOOLS.map(k => tile(k)).join('')}</div></details>
    <p class="h-head">Geräte</p>
    ${gearCats.map(([c, list]) => `<details data-cat="${esc('g:' + c)}" ${libOpen.has('g:' + c) ? 'open' : ''}><summary>${esc(c)} <span class="muted">${list.length}</span></summary><div class="h-tiles gear">${list.map(gearTile).join('')}</div></details>`).join('')}
    ${cats.size ? '<p class="h-head">Eigene Bilder</p>' : ''}
    ${[...cats.entries()].map(([c, list]) => `<details data-cat="${esc(c)}" ${libOpen.has(c) ? 'open' : ''}><summary>${esc(c)} <span class="muted">${list.length}</span></summary><div class="h-tiles imgs">${list.map(imgTile).join('')}</div></details>`).join('')}
    <div class="h-lib">
      <button class="btn ghost sm" data-h="import">${icon('upload', 15)} Eigene Bilder hinzufügen</button>
      ${lib.length ? `<button class="link small-text" data-h="lib">${lib.length} Bilder verwalten</button>` : ''}
      <p class="muted small-text">Optional, die Geräte oben sind immer da. Eigene Bilder (PNG) bleiben auf deinen Geräten und, mit Konto, verschlüsselt in deinem Konto; sie werden nicht veröffentlicht.</p>
      <input type="file" data-hc="files" accept="image/png,image/webp,image/*" multiple hidden>
    </div>`;
}

function selBarHtml(p) {
  const i = itemOf(p, selected);
  if (!i) return `<span class="muted small-text">Elemente aus der Leiste in die Halle ziehen oder antippen. Ein Element antippen, um es zu bearbeiten.</span>`;
  const variants = i.kind === 'img' ? sp().hallLib.filter(e => e.key === libEntry(i.img)?.key) : [];
  const cur = libEntry(i.img), g = i.kind === 'gear' ? gear.GEAR[i.gear] : null;
  const views = g ? g.views : variants, vi = g ? Math.max(0, g.views.indexOf(i.view)) : variants.indexOf(cur);
  const label = i.kind === 'img' ? (cur ? cur.name + (cur.view ? ' · ' + cur.view : '') : 'Bild')
    : i.kind === 'gear' ? (g ? g.name + (g.views.length > 1 ? ' · ' + gear.viewLabel(g.views[vi]) : '') : 'Gerät') : KINDS[i.kind].label;
  return `<b class="small-text">${esc(label)}</b>
    ${hasText(i.kind) ? (i.kind === 'zone' ? `<textarea class="input sm h-text" data-hc="text" rows="1" maxlength="60" aria-label="Beschriftung">${esc(i.text || '')}</textarea>` : `<input class="input sm h-text" data-hc="text" maxlength="${i.kind === 'text' ? 60 : 8}" value="${esc(i.text || '')}" aria-label="Beschriftung">`) : ''}
    ${hasColor(i) ? `<span class="h-colors">${COLORS.map(([c, n]) => `<button class="h-color ${i.color === c ? 'on' : ''}" style="--c:${c}" data-h="color" data-color="${c}" title="${n}" aria-label="${n}"></button>`).join('')}</span>` : ''}
    ${views.length > 1 ? `<button class="btn ghost sm" data-h="view">${icon('repeat', 15)} Ansicht wechseln <span class="muted">${vi + 1}/${views.length}</span></button>` : ''}
    ${KINDS[i.kind].rotate === false ? '' : `<button class="icon-btn sm" data-h="rot" data-d="-15" title="Nach links drehen" aria-label="Nach links drehen">${icon('reset', 16)}</button><button class="icon-btn sm h-flip" data-h="rot" data-d="15" title="Nach rechts drehen" aria-label="Nach rechts drehen">${icon('reset', 16)}</button>`}
    <button class="icon-btn sm" data-h="size" data-d="0.85" title="Kleiner" aria-label="Kleiner">−</button><button class="icon-btn sm" data-h="size" data-d="1.18" title="Größer" aria-label="Größer">+</button>
    <button class="btn ghost sm" data-h="dup">Kopie</button>
    <button class="btn ghost sm" data-h="front" title="Nach vorn">Vorn</button><button class="btn ghost sm" data-h="back" title="Nach hinten">Hinten</button>
    <button class="icon-btn sm danger" data-h="del" title="Entfernen (Entf)" aria-label="Entfernen">${icon('trash', 16)}</button>`;
}

// Auswahlrahmen mit Griffen (Größe unten rechts, Drehen oben)
function drawSel() {
  const g = host?.querySelector('[data-sel]'); if (!g) return;
  const i = itemOf(plan(), selected);
  host.querySelectorAll('.hi.sel').forEach(x => x.classList.remove('sel'));
  if (!i) { g.innerHTML = ''; return; }
  host.querySelector(`.hi[data-hid="${CSS.escape(i.id)}"]`)?.classList.add('sel');
  const rot = KINDS[i.kind].rotate !== false;
  g.setAttribute('transform', `translate(${num(i.x)} ${num(i.y)})${i.rot ? ` rotate(${i.rot} ${num(i.w / 2)} ${num(i.h / 2)})` : ''}`);
  g.innerHTML = `<rect x="-8" y="-8" width="${i.w + 16}" height="${i.h + 16}" class="h-frame"/>
    <circle cx="${i.w + 8}" cy="${i.h + 8}" r="26" class="h-grip" data-grip="size"/>
    ${rot ? `<line x1="${i.w / 2}" y1="-8" x2="${i.w / 2}" y2="-40" class="h-frame-l"/><circle cx="${i.w / 2}" cy="-62" r="24" class="h-grip rot" data-grip="rot"/>` : ''}`;
}
function select(id) {
  selected = id; drawSel();
  const bar = host?.querySelector('[data-selbar]'); if (bar) bar.innerHTML = selBarHtml(plan());
}

// Bildschirmkoordinaten → Zeichenfläche
function toBoard(svg, cx, cy) {
  const m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 };
  const pt = new DOMPoint(cx, cy).matrixTransform(m.inverse()); return { x: pt.x, y: pt.y };
}

function newItem(kind, at, imgEntry, gearId) {
  const k = KINDS[kind];
  let w = k.w, h = k.h;
  const g = kind === 'gear' ? gear.GEAR[gearId] : null;
  if (kind === 'gear') { if (!g) return; const s = gear.gearSize(g.id, g.views[0]), f = gear.scaleOf(g.id); w = Math.max(12, Math.round(s.w * f)); h = Math.max(12, Math.round(s.h * f)); }
  if (kind === 'img') {
    // Bilder mit Kennung V… (Hallenplanbrett) haben einen gemeinsamen Maßstab (≈ 0,3), W… sind kleiner gezeichnet; sonst höchstens 240
    const k0 = /^V/.test(imgEntry.code) ? 0.3 : /^W/.test(imgEntry.code) ? 1 : 240 / Math.max(imgEntry.w, imgEntry.h);
    const s = Math.min(k0, 420 / Math.max(imgEntry.w, imgEntry.h)); w = Math.max(24, Math.round(imgEntry.w * s)); h = Math.max(24, Math.round(imgEntry.h * s));
  }
  const p = plan(), count = p.items.length;
  const pos = at || { x: 760 + (count % 6) * 24, y: 470 + (count % 6) * 18 };
  const i = { id: uid(), kind, x: Math.round(pos.x - w / 2), y: Math.round(pos.y - h / 2), w, h, rot: 0 };
  if (k.color) i.color = k.color;
  if (kind === 'img') i.img = imgEntry.id;
  if (g) { i.gear = g.id; i.view = g.views[0]; if (g.color) i.color = g.color; }
  if (kind === 'cone') i.text = 'H' + (p.items.filter(x => x.kind === 'cone').length + 1);
  else if (kind === 'kid') i.text = String(p.items.filter(x => x.kind === 'kid').length + 1);
  else if (kind === 'zone') i.text = 'Gruppe ' + (p.items.filter(x => x.kind === 'zone').length + 1);
  else if (k.text) i.text = k.text;
  if (kind === 'zone') { const used = new Set(p.items.filter(x => x.kind === 'zone').map(x => x.color)); i.color = COLORS.find(([c]) => !used.has(c))?.[0] || k.color; }
  selected = i.id;
  commit(x => { if (kind === 'zone') x.items.unshift(i); else x.items.push(i); });
}

// ---------- Bedienung ----------
async function onClick(e) {
  const t = e.target.closest('[data-add],[data-addimg]');
  if (t && e.detail === 0) return newItem(t.dataset.add || 'img', null, t.dataset.addimg ? libEntry(t.dataset.addimg) : null, t.dataset.gear); // Tastatur
  const b = e.target.closest('[data-h]'); if (!b) return;
  const act = b.dataset.h, p = plan();
  const i = itemOf(p, selected);
  switch (act) {
    case 'new': return newPlanDialog();
    case 'rename': return dialog({ title: 'Hallenplan umbenennen', body: `<label class="field">Name<input name="t" class="input" maxlength="80" value="${esc(p.title)}" required></label>`,
      onSubmit: fd => { const t = String(fd.get('t')).trim(); if (!t) throw new Error('Bitte einen Namen eingeben.'); commit(x => { x.title = t; }); } });
    case 'copy': {
      const c = structuredClone(p); c.id = uid(); c.title = (p.title + ' (Kopie)').slice(0, 80); c.demo = false; c.items.forEach(x => { x.id = uid(); });
      selected = null; store.update(s => { s.sport.halls.push(c); s.sport.activeHall = c.id; }); return toast('Kopie angelegt.');
    }
    case 'del-plan': {
      if (!(await confirmDialog('Hallenplan löschen', `„${p.title}“ löschen? Das lässt sich nicht rückgängig machen.`))) return;
      selected = null; history.delete(p.id);
      return store.update(s => { s.sport.halls = s.sport.halls.filter(x => x.id !== p.id); s.sport.activeHall = s.sport.halls[0]?.id ?? null; s.screen.widgets.forEach(w => { if (w.type === 'hall' && w.planId === p.id) w.planId = null; }); });
    }
    case 'mark': return commit(x => { const m = b.dataset.mark, cur = x.lines || []; x.lines = cur.includes(m) ? cur.filter(y => y !== m) : MARKS.map(y => y.id).filter(y => y === m || cur.includes(y)); });
    case 'undo': return undo();
    case 'redo': return undo(true);
    case 'import': return host.querySelector('[data-hc=files]').click();
    case 'lib': return libDialog();
  }
  if (!i) return;
  switch (act) {
    case 'color': return commit(x => { itemOf(x, i.id).color = b.dataset.color; });
    case 'rot': return commit(x => { const t = itemOf(x, i.id); t.rot = ((t.rot + Number(b.dataset.d)) % 360 + 360) % 360; if (t.rot > 180) t.rot -= 360; });
    case 'size': return commit(x => { const t = itemOf(x, i.id), f = Number(b.dataset.d), cx = t.x + t.w / 2, cy = t.y + t.h / 2; t.w = clamp(Math.round(t.w * f), 16, 1600); t.h = clamp(Math.round(t.h * f), 16, 1400); t.x = Math.round(cx - t.w / 2); t.y = Math.round(cy - t.h / 2); });
    case 'dup': { const c = { ...structuredClone(i), id: uid(), x: i.x + 30, y: i.y + 30 }; selected = c.id; return commit(x => { x.items.splice(x.items.findIndex(y => y.id === i.id) + 1, 0, c); }); }
    case 'front': return commit(x => { const k = x.items.findIndex(y => y.id === i.id); x.items.push(...x.items.splice(k, 1)); });
    case 'back': return commit(x => { const k = x.items.findIndex(y => y.id === i.id); x.items.unshift(...x.items.splice(k, 1)); });
    case 'del': selected = null; return commit(x => { x.items = x.items.filter(y => y.id !== i.id); });
    case 'view': {
      if (i.kind === 'gear') {
        const g = gear.GEAR[i.gear]; if (!g || g.views.length < 2) return;
        const nv = g.views[(Math.max(0, g.views.indexOf(i.view)) + 1) % g.views.length];
        return commit(x => { const t = itemOf(x, i.id), { L, s: f } = gear.fit(t), b2 = gear.gearSize(g.id, nv, L), cx = t.x + t.w / 2, cy = t.y + t.h / 2;
          t.view = nv; t.w = Math.round(b2.w * f); t.h = Math.round(b2.h * f); t.x = Math.round(cx - t.w / 2); t.y = Math.round(cy - t.h / 2); });
      }
      const cur = libEntry(i.img), vs = sp().hallLib.filter(e => e.key === cur?.key); if (vs.length < 2) return;
      const nx = vs[(vs.indexOf(cur) + 1) % vs.length];
      return commit(x => { const t = itemOf(x, i.id), area = t.w * t.h, r = nx.w / nx.h, cx = t.x + t.w / 2, cy = t.y + t.h / 2;
        t.img = nx.id; t.w = Math.round(Math.sqrt(area * r)); t.h = Math.round(t.w / r); t.x = Math.round(cx - t.w / 2); t.y = Math.round(cy - t.h / 2); });
    }
  }
}
function onChange(e) {
  const t = e.target, hc = t.dataset.hc; if (!hc) return;
  if (hc === 'plan') { selected = null; store.update(s => { s.sport.activeHall = t.value; }); }
  else if (hc === 'floor') commit(x => { x.floor = t.value; });
  else if (hc === 'text') { const v = t.value.trim().slice(0, 60); commit(x => { const i = itemOf(x, selected); if (i) { i.text = v; if (i.kind === 'text') i.w = Math.max(60, Math.round(v.length * i.h * .45 + 30)); } }); }
  else if (hc === 'files') { const files = [...t.files]; t.value = ''; importImages(files); }
}
// Beschriftung sofort in der Zeichnung zeigen, gespeichert wird beim Verlassen des Feldes
function onInput(e) {
  if (e.target.dataset.hc !== 'text') return;
  const p = plan(), i = itemOf(p, selected); if (!i) return;
  const g = host.querySelector(`.hi[data-hid="${CSS.escape(i.id)}"]`);
  if (g) g.innerHTML = shape({ ...i, text: e.target.value });
}
function onKey(e) {
  if (e.target.closest('input,textarea,select')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return undo(e.shiftKey); }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); return undo(true); }
  const i = itemOf(plan(), selected); if (!i) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); selected = null; return commit(x => { x.items = x.items.filter(y => y.id !== i.id); }); }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); host.querySelector('[data-h=dup]')?.click(); return; }
  if (e.key === 'Escape') return select(null);
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (d) { e.preventDefault(); const st = e.shiftKey ? 1 : 10; commit(x => { const t = itemOf(x, i.id); t.x += d[0] * st; t.y += d[1] * st; }); }
}

// Ziehen: aus der Leiste in die Halle, Elemente verschieben, Größe ändern, drehen
function onPointerDown(e) {
  if (e.button > 0) return;
  const tileEl = e.target.closest('[data-add],[data-addimg]');
  if (tileEl) return startTileDrag(e, tileEl);
  const svg = e.target.closest('.hall-board svg'); if (!svg) return;
  const grip = e.target.closest('[data-grip]'), g = e.target.closest('.hi');
  if (!grip && !g) { if (selected) select(null); return; }
  const p = plan(), i = itemOf(p, grip ? selected : g.dataset.hid); if (!i) return;
  e.preventDefault();
  if (selected !== i.id) select(i.id);
  host.querySelector('.hall-board')?.focus({ preventScroll: true });
  const el = host.querySelector(`.hi[data-hid="${CSS.escape(i.id)}"]`), sel = host.querySelector('[data-sel]');
  const start = toBoard(svg, e.clientX, e.clientY), o = { ...i }, mode = grip?.dataset.grip || 'move', keep = keepOf(i);
  let cur = { ...i }, moved = false;
  const apply = () => { const tr = `translate(${num(cur.x)} ${num(cur.y)})${cur.rot ? ` rotate(${cur.rot} ${num(cur.w / 2)} ${num(cur.h / 2)})` : ''}`; el.setAttribute('transform', tr); sel.setAttribute('transform', tr); };
  const move = ev => {
    const pt = toBoard(svg, ev.clientX, ev.clientY), dx = pt.x - start.x, dy = pt.y - start.y;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;
    if (mode === 'move') { cur.x = Math.round(o.x + dx); cur.y = Math.round(o.y + dy); apply(); }
    else if (mode === 'size') {
      // im gedrehten Element entlang seiner eigenen Achsen vergrößern
      const a = -o.rot * Math.PI / 180, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      let w = Math.max(16, o.w + lx), h = Math.max(16, o.h + ly);
      if (keep) { const f = Math.max(w / o.w, h / o.h); w = Math.max(16, o.w * f); h = Math.max(16, o.h * f); }
      cur.w = Math.round(w); cur.h = Math.round(h);
      el.innerHTML = shape(cur); hydrateSvg(el); apply();
      sel.querySelector('.h-frame')?.setAttribute('width', cur.w + 16); sel.querySelector('.h-frame')?.setAttribute('height', cur.h + 16);
      const gr = sel.querySelector('[data-grip=size]'); gr?.setAttribute('cx', cur.w + 8); gr?.setAttribute('cy', cur.h + 8);
    } else if (mode === 'rot') {
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      let deg = Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI + 90;
      deg = Math.round(deg / 5) * 5; if (deg > 180) deg -= 360;
      cur.rot = deg; apply();
    }
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    if (moved && ['x', 'y', 'w', 'h', 'rot'].some(k => cur[k] !== o[k])) commit(x => { const t = itemOf(x, i.id); Object.assign(t, { x: cur.x, y: cur.y, w: cur.w, h: cur.h, rot: cur.rot }); });
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

function startTileDrag(e, tileEl) {
  e.preventDefault();
  const kind = tileEl.dataset.add || 'img', entry = tileEl.dataset.addimg ? libEntry(tileEl.dataset.addimg) : null, gid = tileEl.dataset.gear;
  const sx = e.clientX, sy = e.clientY;
  let ghost = null;
  const move = ev => {
    if (!ghost && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return;
    if (!ghost) { ghost = tileEl.cloneNode(true); ghost.classList.add('h-ghost'); ghost.removeAttribute('data-add'); ghost.removeAttribute('data-addimg'); document.body.append(ghost); }
    ghost.style.transform = `translate(${ev.clientX - 40}px, ${ev.clientY - 40}px)`;
    const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.hall-board svg');
    ghost.classList.toggle('over', !!over);
  };
  const up = ev => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    const wasDrag = !!ghost; ghost?.remove();
    if (ev.type === 'pointercancel') return;
    if (!wasDrag) return newItem(kind, null, entry, gid);  // nur angetippt: in die Mitte setzen
    const svg = host?.querySelector('.hall-board svg'), over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.hall-board svg');
    if (svg && over === svg) newItem(kind, toBoard(svg, ev.clientX, ev.clientY), entry, gid);
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

// ---------- Pläne und Bilder ----------
// Vorlagen: Maße in Metern auf dem Hallenboden (x von links, y von vorn nach hinten)
const zoneAt = (x0, x1, y0, y1, color, text) => { const a = fp(x0, y0), b = fp(x0, y1), h = a[1] - b[1]; return { id: uid(), kind: 'zone', x: Math.round(a[0]), y: Math.round(b[1]), w: Math.round((x1 - x0) / HALL.len * FLOOR.width + h * K), h: Math.round(h), rot: 0, color, text }; };
// Gerät maßstäblich so setzen, dass der Punkt (ax, ay) seines Rahmens (Anteile 0…1) auf dem Bodenpunkt liegt; L = Länge in m bei dehnbaren Geräten
function gearAt(id, view, x, y, { ax = 0.5, ay = 0.9, L } = {}) {
  const s = gear.gearSize(id, view, L), f = gear.scaleOf(id), p = fp(x, y), h = Math.round(s.h * f), w = Math.round(s.w * f);
  return { id: uid(), kind: 'gear', gear: id, view, x: Math.round(p[0] - w * ax), y: Math.round(p[1] - h * ay), w, h, rot: 0 };
}
const ZC = ['#2e7d4f', '#d9a521', '#c94040', '#3d6fb5'];
const zonesAcross = n => Array.from({ length: n }, (_, k) => { const w = (HALL.len - 1 - (n - 1) * 0.6) / n, x0 = 0.5 + k * (w + 0.6); return zoneAt(x0, x0 + w, 0.8, 14.2, ZC[k % 4], (n === 4 ? 'Feld ' : 'Gruppe ') + (k + 1)); });
// Tore auf den Torlinien des Handballfeldes, Körbe über den Grundlinien
const goals = () => [gearAt('tor', 'gespiegelt', 1, HALL.dep / 2, { ax: 0.82, ay: 0.76 }), gearAt('tor', 'seitlich', 26, HALL.dep / 2, { ax: 0.18, ay: 0.76 })];
const baskets = () => [gearAt('basketballkorb', 'gespiegelt', 1.7, HALL.dep / 2, { ax: 0.25, ay: 1.12 }), gearAt('basketballkorb', 'seitlich', 25.3, HALL.dep / 2, { ax: 0.75, ay: 1.12 })];
const TEMPLATES = [
  { id: 'leer', label: 'Leere Halle', make: () => ({}) },
  { id: 'z2', label: 'Zwei Bereiche', make: () => ({ items: zonesAcross(2) }) },
  { id: 'z3', label: 'Drei Bereiche', make: () => ({ items: zonesAcross(3) }) },
  { id: 'klein4', label: 'Vier Kleinfelder (mit Kleintoren)', make: () => { const z = zonesAcross(4), w = (HALL.len - 1 - 3 * 0.6) / 4;
    return { items: [...z, ...z.flatMap((_, k) => { const cx = 0.5 + k * (w + 0.6) + w / 2; return [gearAt('kleintor', 'frontal', cx, 14.2, { ay: 0.8 }), gearAt('kleintor', 'hinten', cx, 0.8, { ay: 0.97 })]; })] }; } },
  { id: 'badminton', label: 'Badminton (vier Felder mit Netz)', make: () => ({ lines: ['badminton'], items: badmintonCourts().map(([x0]) => gearAt('netz', 'quer', x0 + 3.05, HALL.dep / 2, { ay: 0.97, L: 6.3 })) }) },
  { id: 'volleyball', label: 'Volleyball (Feld mit Netz)', make: () => ({ lines: ['volleyball'], items: [gearAt('netz', 'laengs', HALL.len / 2, HALL.dep / 2, { L: 9.6, ax: 0.5, ay: 0.65 })] }) },
  { id: 'basketball', label: 'Basketball (Feld mit Körben)', make: () => ({ lines: ['basketball'], items: baskets() }) },
  { id: 'handball', label: 'Handball (Feld mit Toren)', make: () => ({ lines: ['handball'], items: goals() }) },
  { id: 'fussball', label: 'Hallenfußball (Feld mit Toren)', make: () => ({ lines: ['fussball'], items: goals() }) },
];
function newPlanDialog() {
  dialog({ title: 'Neuer Hallenplan', submit: 'Anlegen', body: `
    <label class="field">Name<input name="t" class="input" maxlength="80" placeholder="z. B. Passen in Gassen – Klasse 6" required></label>
    <label class="field">Voreinstellung<select name="tpl" class="select">${TEMPLATES.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}</select></label>
    <p class="muted small-text">Halle 27 m × 15 m, Geräte maßstäblich (Kleingeräte etwas größer). Spielfeldlinien lassen sich später ein- und ausschalten. Abstände, Türen und nutzbaren Raum vor Ort prüfen.</p>`,
    onSubmit: fd => {
      const t = String(fd.get('t')).trim(); if (!t) throw new Error('Bitte einen Namen eingeben.');
      const tpl = (TEMPLATES.find(x => x.id === fd.get('tpl')) || TEMPLATES[0]).make();
      const p = { id: uid(), title: t, floor: 'halle', v: 3, lines: tpl.lines || [], items: tpl.items || [] };
      selected = null; store.update(s => { s.sport.halls.push(p); s.sport.activeHall = p.id; });
    } });
}

async function importImages(files) {
  const list = files.filter(f => /^image\//.test(f.type)); if (!list.length) return toast('Keine Bilddateien ausgewählt.', { kind: 'warn' });
  const known = new Set(sp().hallLib.map(e => e.id)), added = [];
  let fail = 0;
  toast(`${list.length} Bild(er) werden übernommen …`);
  for (const f of list) {
    try {
      const { id, w, h } = await images.addKeep(f);
      if (known.has(id)) continue;
      known.add(id); added.push({ id, w, h, ...parseImageName(f.name) });
    } catch { fail++; }
  }
  if (added.length) { store.update(s => { s.sport.hallLib.push(...added); }); added.forEach(e => libOpen.add(e.cat)); attach(host); }
  toast(`${added.length} Bild(er) hinzugefügt${fail ? `, ${fail} nicht lesbar` : ''}${list.length - added.length - fail > 0 ? ', übrige waren schon vorhanden' : ''}.`);
}

function libDialog() {
  const lib = sp().hallLib, cats = [...new Set(lib.map(e => e.cat))];
  const usedIds = new Set(sp().halls.flatMap(p => p.items.map(i => i.img).filter(Boolean)));
  dialog({ title: 'Eigene Bilder verwalten', submit: null, cancel: 'Schließen', wide: true, body: `
    <p class="muted small-text">Entfernt nur Bilder aus der Leiste. Bilder, die in einem Hallenplan stehen, bleiben dort erhalten.</p>
    ${cats.map(c => `<div class="h-libcat"><b>${esc(c)}</b> <span class="muted">${lib.filter(e => e.cat === c).length}</span> <button type="button" class="link small-text" data-delcat="${esc(c)}">Gruppe entfernen</button></div>`).join('')}
    <p><button type="button" class="btn ghost sm danger" data-delall>Alle Bilder aus der Leiste entfernen</button></p>
    <p class="muted small-text">${usedIds.size} Bild(er) werden in Hallenplänen verwendet.</p>`,
    onOpen: (el, close) => {
      const drop = async (pred, what) => { if (!(await confirmDialog('Bilder entfernen', `${what} aus der Leiste entfernen?`, 'Entfernen'))) return; close(); store.update(s => { s.sport.hallLib = s.sport.hallLib.filter(e => !pred(e)); }); };
      el.querySelectorAll('[data-delcat]').forEach(b => b.onclick = () => drop(e => e.cat === b.dataset.delcat, `Alle Bilder der Gruppe „${b.dataset.delcat}“`));
      el.querySelector('[data-delall]').onclick = () => drop(() => true, 'Alle Bilder');
    } });
}

// Details-Zustand der Bildgruppen merken (bleibt beim Neuzeichnen offen)
document.addEventListener('toggle', e => { const d = e.target; if (d?.dataset?.cat === undefined || !d.closest?.('.hall-palette')) return; d.open ? libOpen.add(d.dataset.cat) : libOpen.delete(d.dataset.cat); }, true);

// Hallenplaner (Bereich Hallenpläne): schräg von oben gesehene Halle, Elemente aus der Leiste hineinziehen,
// verschieben, drehen und in der Größe ändern. Planungssymbole (Bereiche, Hütchen, Kinder, Lehrkraft …) und Geräte
// (hallgear.js) zeichnet die App selbst. Zusätzlich kann jede Lehrkraft eigene Bilder hinzufügen: Sie liegen nur auf
// ihren Geräten (IndexedDB) und verschlüsselt im eigenen Konto – nie im öffentlichen Quellcode.
// Seit 2.0.0: Mehrfachauswahl (Umschalt-Klick, Rahmen ziehen, Strg+A), Raster, „Kinder einsetzen“, Themen und Phasen,
// Standardwerte nach den Gestaltungsregeln (Kinder und Lehrkraft klein, Bereiche und Hütchen ohne Beschriftung).
import * as store from './store.js';
import * as images from './images.js';
import { uid } from './engine.js';
import * as gear from './hallgear.js';
import { esc, icon, dialog, confirmDialog, toast, downloadFile } from './ui.js';

import { BW, BH, HALL, FLOOR, K, MARKS, badmintonCourts } from './hallfloor.js';
import { KINDS, clamp, num, shape, defs, boardSvg, zoneAt, gearAt, itemAt, parsePlans, exportPlans, ZONE_FORMS, bandOf } from './hallplan.js';
export { boardSvg };
export { BW, BH };
const COLORS = [['#2e7d4f', 'Grün'], ['#d9a521', 'Gelb'], ['#c94040', 'Rot'], ['#3d6fb5', 'Blau'], ['#7b57b0', 'Lila'], ['#e07b2a', 'Orange'], ['#6b7280', 'Grau'], ['#25272e', 'Schwarz']];

// Leiste: oft gebraucht oben, Wege, Schild und Text unter „Mehr“ (laut Gestaltungsregeln meist nicht nötig)
const PLAN_TOOLS = ['zone', 'cone', 'kid', 'teacher', 'ball', 'cross'];
const MORE_TOOLS = ['arrow', 'path', 'tag', 'text'];
const FIGURE = 0.6; // Kinder und Lehrkraft entstehen klein (Nutzerentscheidung 13./14.11.2026)
const hasText = k => ['zone', 'cone', 'tag', 'text'].includes(k);
const hasColor = i => (i.kind === 'gear' ? !!gear.GEAR[i.gear]?.color : ['zone', 'cone', 'kid', 'teacher', 'ball', 'arrow', 'path', 'text'].includes(i.kind));
// Seitenverhältnis beim Ziehen am Griff beibehalten (Geräte quer wie Bank oder Netz dürfen länger werden)
const keepOf = i => (i.kind === 'gear' ? !gear.isStretch(i.gear, i.view) : !!KINDS[i.kind].keep);

// Eigene Bilder mit Namen nach dem Muster „V02-035 - Bank lang - quer.png“ → Gruppe, Name, Ansicht
const CATS = { V02: 'Matten, Kästen, Bänke', V03: 'Sprossenwand, Barren, Reck', V04: 'Körbe, Seile, Sprunggeräte', V05: 'Balken, Netze, Tore, Technik', V06: 'Kleingeräte, Hütchen, Bälle', V07: 'Tischtennis, Banden, Türen', V08: 'Kinder in Bewegung', V09: 'Kinder (auch sitzend)', W04: 'WIMASU-Ergänzungen' };
export function parseImageName(file) {
  const base = String(file).replace(/\.[a-z0-9]+$/i, '').trim();
  const m = base.match(/^([A-Z]\d{2})-(\d{3})\s*-\s*(.+?)(?:\s+-\s+([^-]+))?$/);
  if (!m) return { code: '', name: base.slice(0, 80) || 'Bild', view: '', cat: 'Eigene Bilder', key: 'eigen|' + base };
  const [, pre, nr, name, view = ''] = m;
  return { code: `${pre}-${nr}`, name: name.trim(), view: view.trim(), cat: CATS[pre] || 'Weitere Bilder', key: pre + '|' + name.trim() };
}

// ---------- Zustand ----------
let host = null, sel = [], kidCount = 5;
const pref = (k, d) => { try { return localStorage.getItem('klassenkompass.' + k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem('klassenkompass.' + k, v); } catch {} };
let snap = pref('hallSnap', '0') === '1', palHidden = pref('hallPalette', '1') === '0';
const libOpen = new Set(['g:' + gear.GROUPS[0]]); // geöffnete Gruppen der Leiste
const history = new Map(); // Plan-ID → { undo: [], redo: [] }
const sp = () => store.get().sport;
const plan = () => sp().halls.find(h => h.id === sp().activeHall) || sp().halls[0] || null;
const itemOf = (p, id) => p?.items.find(i => i.id === id);
const libEntry = id => sp().hallLib.find(e => e.id === id);
const primary = () => sel.at(-1) ?? null;
const selItems = p => sel.map(id => itemOf(p, id)).filter(Boolean);

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
  sel = sel.filter(id => itemOf(prev, id));
  store.update(s => { const i = s.sport.halls.findIndex(y => y.id === p.id); if (i >= 0) s.sport.halls[i] = prev; });
}

// Bilder in einer Zeichnung nachladen
export function hydrateSvg(el) {
  el?.querySelectorAll('image[data-img]').forEach(async im => {
    const u = await images.url(im.dataset.img).catch(() => null);
    if (u) { im.setAttribute('href', u); im.closest('.hi')?.classList.add('ok'); }
  });
}
export const planById = id => sp().halls.find(h => h.id === id) || null;
// Liste für Auswahlfelder (Bildschirm): Thema und Phase im Namen
export const planLabel = p => `${p.topic ? p.topic + ' · ' : ''}${p.title}${p.lesson ? ` (Phase ${p.phase})` : ''}`;
export const planList = () => sortPlans(sp().halls).map(h => ({ id: h.id, title: planLabel(h) }));
export function sortPlans(list) {
  const t = p => (p.topic || '￿').toLocaleLowerCase('de');
  return [...list].sort((a, b) => t(a).localeCompare(t(b), 'de') || (a.lesson || a.title).localeCompare(b.lesson || b.title, 'de') || (a.phase || 0) - (b.phase || 0) || a.title.localeCompare(b.title, 'de'));
}
// Pläne derselben Stunde, nach Phase
export const lessonPlans = p => (p?.lesson ? sp().halls.filter(x => x.lesson === p.lesson && (x.topic || '') === (p.topic || '')).sort((a, b) => a.phase - b.phase) : []);
export function openPlan(id) { sel = []; store.update(s => { s.sport.activeHall = id; }); }

// ---------- Editor ----------
export function attach(el) {
  host = el;
  const p = plan();
  sel = sel.filter(id => itemOf(p, id));
  el.innerHTML = p ? editorHtml(p) : `<div class="card empty"><p>Noch kein Hallenplan.</p><button class="btn primary" data-h="new">${icon('plus')} Neuer Hallenplan</button> <button class="btn ghost" data-h="import-plan">${icon('upload')} Importieren</button></div>`;
  el.onclick = onClick; el.onchange = onChange; el.oninput = onInput; el.onkeydown = onKey;
  el.onpointerdown = onPointerDown;
  if (p) { hydrateSvg(el.querySelector('.hall-board')); hydrateSvg(el.querySelector('.hall-print')); images.hydrate(el.querySelector('.hall-palette')); drawSel(); }
}

function editorHtml(p) {
  const h = hist(p.id), presenting = document.body.classList.contains('presenting');
  const phases = lessonPlans(p), k = phases.findIndex(x => x.id === p.id);
  return `<div class="hall ${presenting ? 'presenting' : ''} ${palHidden ? 'no-pal' : ''}">
    <div class="hall-bar no-print">
      <b class="hall-title" title="${esc(planLabel(p))}">${esc(p.title)}</b>
      ${p.topic ? `<span class="badge">${esc(p.topic)}</span>` : ''}
      ${phases.length ? `<span class="hall-phase" role="group" aria-label="Phasen der Stunde"><button class="icon-btn sm" data-h="phase" data-d="-1" title="Vorige Phase" aria-label="Vorige Phase" ${k > 0 ? '' : 'disabled'}>${icon('back', 15)}</button><span class="small-text">Phase ${p.phase} · ${k + 1}/${phases.length}</span><button class="icon-btn sm" data-h="phase" data-d="1" title="Nächste Phase" aria-label="Nächste Phase" ${k < phases.length - 1 ? '' : 'disabled'}>${icon('forward', 15)}</button></span>` : ''}
      <button class="btn ghost sm" data-h="props" title="Name, Thema, Stunde und Phase ändern">${icon('edit', 15)} Eigenschaften</button>
      <button class="btn ghost sm" data-h="next-phase" title="Kopie als nächste Phase derselben Stunde anlegen">${icon('plus', 15)} Nächste Phase</button>
      <button class="btn ghost sm" data-h="copy">Kopie</button>
      <button class="icon-btn sm" data-h="export-plan" title="Exportieren – diesen Hallenplan als Datei speichern" aria-label="Exportieren">${icon('download', 15)}</button>
      <button class="icon-btn sm" data-h="del-plan" title="Hallenplan löschen" aria-label="Hallenplan löschen">${icon('trash', 15)}</button>
      <span class="hall-sep"></span>
      <label class="small-text" title="Hallenboden">Halle <select class="select sm" data-hc="floor" aria-label="Hallenboden">${[['halle', 'Hallenfläche'], ['linien', 'mit Mittellinie'], ['leer', 'ohne Fläche']].map(([v, l]) => `<option value="${v}" ${p.floor === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <button class="btn ghost sm ${snap ? 'on' : ''}" data-h="snap" aria-pressed="${snap}" title="Beim Verschieben auf ein Raster von 0,5 m ausrichten">${icon('grid', 15)} Raster</button>
      <button class="icon-btn sm" data-h="undo" title="Rückgängig (Strg+Z)" aria-label="Rückgängig" ${h.undo.length ? '' : 'disabled'}>${icon('back', 16)}</button>
      <button class="icon-btn sm" data-h="redo" title="Wiederholen (Strg+Y)" aria-label="Wiederholen" ${h.redo.length ? '' : 'disabled'}>${icon('forward', 16)}</button>
    </div>
    <div class="hall-bar hall-marks no-print"><button class="btn ghost sm" data-h="palette" aria-pressed="${!palHidden}" title="Leiste mit Elementen ein- oder ausblenden">${icon('list', 15)} ${palHidden ? 'Leiste zeigen' : 'Leiste ausblenden'}</button>
      <span class="small-text muted">Spielfeldlinien</span>
      ${MARKS.map(m => `<button class="h-mark ${p.lines?.includes(m.id) ? 'on' : ''}" style="--c:${m.color}" data-h="mark" data-mark="${m.id}" aria-pressed="${p.lines?.includes(m.id) ? 'true' : 'false'}" ${p.floor === 'leer' ? 'disabled' : ''}><i></i>${esc(m.label)}</button>`).join('')}
    </div>
    <div class="hall-selbar no-print" data-selbar>${selBarHtml(p)}</div>
    <div class="hall-work">
      ${palHidden ? '' : `<aside class="hall-palette no-print">${paletteHtml()}</aside>`}
      <div class="hall-board" tabindex="0">
        ${boardSvg(p, { edit: true })}
        <p class="hall-note">Schematisch · Abstände und nutzbaren Raum vor Ort prüfen</p>
      </div>
    </div>
    <div class="print-only hall-print"><h1>${esc(p.title)}</h1>${boardSvg(p, { crop: true })}<p>Schematisch · Abstände und nutzbaren Raum vor Ort prüfen</p></div>
  </div>`;
}

function tile(kind) {
  const k = KINDS[kind], i = { id: 't', kind, x: 0, y: 0, w: k.w, h: k.h, rot: 0, color: k.color, text: kind === 'zone' || kind === 'cone' ? '' : k.text };
  return `<button class="h-tile" data-add="${kind}" title="${esc(k.label)} – ziehen oder antippen"><svg viewBox="-6 -6 ${k.w + 12} ${k.h + 12}" class="h-tile-svg">${defs}${shape(i)}</svg><span>${esc(k.label)}</span></button>`;
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
  return `<details open><summary>Planung</summary><div class="h-tiles">${PLAN_TOOLS.map(tile).join('')}</div></details>
    <details data-cat="more" ${libOpen.has('more') ? 'open' : ''}><summary>Mehr <span class="muted">Wege, Schild, Text</span></summary><div class="h-tiles">${MORE_TOOLS.map(tile).join('')}</div></details>
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

const colorRow = cur => `<span class="h-colors">${COLORS.map(([c, n]) => `<button class="h-color ${cur === c ? 'on' : ''}" style="--c:${c}" data-h="color" data-color="${c}" title="${n}" aria-label="${n}"></button>`).join('')}</span>`;
const sizeBtns = '<button class="icon-btn sm" data-h="size" data-d="0.85" title="Kleiner" aria-label="Kleiner">−</button><button class="icon-btn sm" data-h="size" data-d="1.18" title="Größer" aria-label="Größer">+</button>';
const orderBtns = '<button class="btn ghost sm" data-h="dup" title="Kopie (Strg+D)">Kopie</button><button class="btn ghost sm" data-h="front" title="Nach vorn">Vorn</button><button class="btn ghost sm" data-h="back" title="Nach hinten">Hinten</button>';
const delBtn = `<button class="icon-btn sm danger" data-h="del" title="Entfernen (Entf)" aria-label="Entfernen">${icon('trash', 16)}</button>`;
function selBarHtml(p) {
  const items = selItems(p);
  if (!items.length) return '<span class="muted small-text">Elemente aus der Leiste in die Halle ziehen oder antippen. Antippen zum Bearbeiten · Umschalt-Klick oder Rahmen ziehen wählt mehrere · Strg+A wählt alle.</span>';
  if (items.length > 1) {
    const colored = items.filter(hasColor), same = colored.length && colored.every(x => x.color === colored[0].color) ? colored[0].color : '';
    return `<b class="small-text">${items.length} Elemente gewählt</b>${colored.length ? colorRow(same) : ''}${sizeBtns}${orderBtns}${delBtn}
      <button class="btn ghost sm" data-h="none">Auswahl aufheben</button>`;
  }
  const i = items[0];
  const variants = i.kind === 'img' ? sp().hallLib.filter(e => e.key === libEntry(i.img)?.key) : [];
  const cur = libEntry(i.img), g = i.kind === 'gear' ? gear.GEAR[i.gear] : null;
  const views = g ? g.views : variants, vi = g ? Math.max(0, g.views.indexOf(i.view)) : variants.indexOf(cur);
  const label = i.kind === 'img' ? (cur ? cur.name + (cur.view ? ' · ' + cur.view : '') : 'Bild')
    : i.kind === 'gear' ? (g ? g.name + (g.views.length > 1 ? ' · ' + gear.viewLabel(g.views[vi]) : '') : 'Gerät') : KINDS[i.kind].label;
  return `<b class="small-text">${esc(label)}</b>
    ${hasText(i.kind) ? (i.kind === 'zone' ? `<textarea class="input sm h-text" data-hc="text" rows="1" maxlength="60" aria-label="Beschriftung" placeholder="ohne Beschriftung">${esc(i.text || '')}</textarea>` : `<input class="input sm h-text" data-hc="text" maxlength="${i.kind === 'text' ? 60 : 8}" value="${esc(i.text || '')}" aria-label="Beschriftung" placeholder="ohne">`) : ''}
    ${i.kind === 'zone' ? formHtml(i) : ''}
    ${hasColor(i) ? colorRow(i.color) : ''}
    ${views.length > 1 ? `<button class="btn ghost sm" data-h="view">${icon('repeat', 15)} Ansicht wechseln <span class="muted">${vi + 1}/${views.length}</span></button>` : ''}
    ${KINDS[i.kind].rotate === false ? '' : `<button class="icon-btn sm" data-h="rot" data-d="-15" title="Nach links drehen" aria-label="Nach links drehen">${icon('reset', 16)}</button><button class="icon-btn sm h-flip" data-h="rot" data-d="15" title="Nach rechts drehen" aria-label="Nach rechts drehen">${icon('reset', 16)}</button>`}
    ${sizeBtns}${orderBtns}${delBtn}
    ${i.kind === 'zone' ? `<span class="h-kids"><label class="small-text">Kinder <input type="number" class="input sm h-num" data-hc="kidn" min="1" max="40" value="${kidCount}" aria-label="Anzahl Kinder"></label><button class="btn ghost sm" data-h="kids" title="So viele Kinder in der Farbe des Bereichs gleichmäßig darin aufstellen">Einsetzen</button></span>` : ''}`;
}

// Form eines Bereichs (Rechteck, U, L, Rahmen) und Randbreite links/rechts bzw. vorn/hinten
function formHtml(i) {
  const f = i.form || 'rect', pct = v => Math.round(bandOf(v) * 100);
  return `<label class="small-text h-form">Form <select class="select sm" data-hc="form" aria-label="Form des Bereichs">${ZONE_FORMS.map(([v, l]) => `<option value="${v}" ${f === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${f !== 'rect' ? `<label class="small-text h-form">Rand ↔ <input type="range" class="h-range" data-hc="tx" min="4" max="48" step="1" value="${pct(i.tx)}" aria-label="Randbreite links/rechts in Prozent"></label>
    <label class="small-text h-form">Rand ↕ <input type="range" class="h-range" data-hc="ty" min="4" max="48" step="1" value="${pct(i.ty)}" aria-label="Randbreite vorn/hinten in Prozent"></label>` : ''}`;
}

// Auswahlrahmen (bei einem Element mit Griffen: Größe unten rechts, Drehen oben)
const trOf = i => `translate(${num(i.x)} ${num(i.y)})${i.rot ? ` rotate(${i.rot} ${num(i.w / 2)} ${num(i.h / 2)})` : ''}`;
function drawSel() {
  const g = host?.querySelector('[data-sel]'); if (!g) return;
  const p = plan(), items = selItems(p);
  host.querySelectorAll('.hi.sel').forEach(x => x.classList.remove('sel'));
  items.forEach(i => host.querySelector(`.hall-board .hi[data-hid="${CSS.escape(i.id)}"]`)?.classList.add('sel'));
  g.innerHTML = items.map(i => {
    const one = items.length === 1, rot = one && KINDS[i.kind].rotate !== false;
    return `<g data-frame="${esc(i.id)}" transform="${trOf(i)}"><rect x="-8" y="-8" width="${i.w + 16}" height="${i.h + 16}" class="h-frame"/>
      ${one ? `<circle cx="${i.w + 8}" cy="${i.h + 8}" r="26" class="h-grip" data-grip="size"/>` : ''}
      ${rot ? `<line x1="${i.w / 2}" y1="-8" x2="${i.w / 2}" y2="-40" class="h-frame-l"/><circle cx="${i.w / 2}" cy="-62" r="24" class="h-grip rot" data-grip="rot"/>` : ''}</g>`;
  }).join('');
}
function select(ids) {
  sel = ids; drawSel();
  const bar = host?.querySelector('[data-selbar]'); if (bar) bar.innerHTML = selBarHtml(plan());
}

// Bildschirmkoordinaten → Zeichenfläche
function toBoard(svg, cx, cy) {
  const m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 };
  const pt = new DOMPoint(cx, cy).matrixTransform(m.inverse()); return { x: pt.x, y: pt.y };
}
// Raster 0,5 m (waagerecht entlang der Hallenlänge, senkrecht entlang der Tiefe)
const GX = FLOOR.width / HALL.len / 2, GY = FLOOR.height / HALL.dep / 2;
const snapX = v => Math.round((v - FLOOR.left) / GX) * GX + FLOOR.left, snapY = v => Math.round((v - FLOOR.top) / GY) * GY + FLOOR.top;

function newItem(kind, at, imgEntry, gearId) {
  const k = KINDS[kind];
  let w = k.w, h = k.h;
  const g = kind === 'gear' ? gear.GEAR[gearId] : null;
  if (kind === 'gear') { if (!g) return; const s = gear.gearSize(g.id, g.views[0]), f = gear.scaleOf(g.id); w = Math.max(12, Math.round(s.w * f)); h = Math.max(12, Math.round(s.h * f)); }
  if (kind === 'kid' || kind === 'teacher') { w = Math.round(w * FIGURE); h = Math.round(h * FIGURE); }
  if (kind === 'img') {
    // Bilder mit Kennung V… (Hallenplanbrett) haben einen gemeinsamen Maßstab (≈ 0,3), W… sind kleiner gezeichnet; sonst höchstens 240
    const k0 = /^V/.test(imgEntry.code) ? 0.3 : /^W/.test(imgEntry.code) ? 1 : 240 / Math.max(imgEntry.w, imgEntry.h);
    const s = Math.min(k0, 420 / Math.max(imgEntry.w, imgEntry.h)); w = Math.max(24, Math.round(imgEntry.w * s)); h = Math.max(24, Math.round(imgEntry.h * s));
  }
  const p = plan(), count = p.items.length;
  const pos = at || { x: 760 + (count % 6) * 24, y: 470 + (count % 6) * 18 };
  const i = { id: uid(), kind, x: Math.round(pos.x - w / 2), y: Math.round(pos.y - h / 2), w, h, rot: 0 };
  if (snap) { i.x = Math.round(snapX(i.x)); i.y = Math.round(snapY(i.y)); }
  if (k.color) i.color = k.color;
  if (kind === 'img') i.img = imgEntry.id;
  if (g) { i.gear = g.id; i.view = g.views[0]; if (g.color) i.color = g.color; }
  // Bereiche und Hütchen ohne Beschriftung (Gestaltungsregel: möglichst ohne Text); Schild und Text mit Vorgabe
  if (k.text && !['zone', 'cone'].includes(kind)) i.text = k.text;
  if (kind === 'zone') { const used = new Set(p.items.filter(x => x.kind === 'zone').map(x => x.color)); i.color = COLORS.find(([c]) => !used.has(c))?.[0] || k.color; }
  sel = [i.id];
  commit(x => { if (kind === 'zone') x.items.unshift(i); else x.items.push(i); });
}

// n Kinder in der Farbe eines Bereichs gleichmäßig darin aufstellen (Reihen entlang der Tiefe, Spalten entlang der Länge)
function kidsInZone(z, n) {
  const d = z.h * K, w = z.w - d, rows = Math.max(1, Math.round(Math.sqrt(n * z.h / Math.max(1, w) * 1.6))), cols = Math.ceil(n / rows);
  const kw = Math.round(KINDS.kid.w * FIGURE), kh = Math.round(KINDS.kid.h * FIGURE), out = [];
  for (let k = 0; k < n; k++) {
    const r = Math.floor(k / cols), inRow = Math.min(cols, n - r * cols), c = k % cols;
    const v = 0.2 + 0.7 * (rows === 1 ? 0.5 : r / (rows - 1)), u = (c + 0.5) / inRow;       // v: 0 hinten … 1 vorn
    const fx = z.x + d * (1 - v) + u * w, fy = z.y + v * z.h;                               // Fußpunkt im Bereich
    out.push({ id: uid(), kind: 'kid', x: Math.round(fx - kw / 2), y: Math.round(fy - kh * 0.7), w: kw, h: kh, rot: 0, color: z.color || KINDS.kid.color });
  }
  return out;
}

// ---------- Bedienung ----------
async function onClick(e) {
  const t = e.target.closest('[data-add],[data-addimg]');
  if (t && e.detail === 0) return newItem(t.dataset.add || 'img', null, t.dataset.addimg ? libEntry(t.dataset.addimg) : null, t.dataset.gear); // Tastatur
  const b = e.target.closest('[data-h]'); if (!b) return;
  const act = b.dataset.h, p = plan();
  switch (act) {
    case 'new': return newPlanDialog();
    case 'import-plan': return importPlansDialog();
    case 'export-plan': return downloadFile(`Hallenplan - ${fileName(p.title)}.json`, exportPlans([p]));
    case 'props': return propsDialog(p);
    case 'copy': return copyPlan(p, false);
    case 'next-phase': return copyPlan(p, true);
    case 'phase': { const list = lessonPlans(p), k = list.findIndex(x => x.id === p.id), n = list[k + Number(b.dataset.d)]; if (n) openPlan(n.id); return; }
    case 'del-plan': {
      if (!(await confirmDialog('Hallenplan löschen', `„${p.title}“ löschen? Das lässt sich nicht rückgängig machen.`))) return;
      sel = []; history.delete(p.id);
      return store.update(s => { s.sport.halls = s.sport.halls.filter(x => x.id !== p.id); s.sport.activeHall = sortPlans(s.sport.halls)[0]?.id ?? null; s.screen.widgets.forEach(w => { if (w.type === 'hall' && w.planId === p.id) w.planId = null; }); });
    }
    case 'mark': return commit(x => { const m = b.dataset.mark, cur = x.lines || []; x.lines = cur.includes(m) ? cur.filter(y => y !== m) : MARKS.map(y => y.id).filter(y => y === m || cur.includes(y)); });
    case 'undo': return undo();
    case 'redo': return undo(true);
    case 'snap': snap = !snap; setPref('hallSnap', snap ? '1' : '0'); return attach(host);
    case 'palette': palHidden = !palHidden; setPref('hallPalette', palHidden ? '0' : '1'); return attach(host);
    case 'import': return host.querySelector('[data-hc=files]').click();
    case 'lib': return libDialog();
    case 'none': return select([]);
  }
  const items = selItems(p); if (!items.length) return;
  const ids = new Set(items.map(x => x.id)), i = items.at(-1);
  switch (act) {
    case 'color': return commit(x => { x.items.forEach(y => { if (ids.has(y.id) && hasColor(y)) y.color = b.dataset.color; }); });
    case 'size': return commit(x => { x.items.filter(y => ids.has(y.id)).forEach(t2 => { const f = Number(b.dataset.d), cx = t2.x + t2.w / 2, cy = t2.y + t2.h / 2; t2.w = clamp(Math.round(t2.w * f), 16, 1600); t2.h = clamp(Math.round(t2.h * f), 16, 1400); t2.x = Math.round(cx - t2.w / 2); t2.y = Math.round(cy - t2.h / 2); }); });
    case 'dup': {
      const copies = items.map(y => ({ ...structuredClone(y), id: uid(), x: y.x + 30, y: y.y + 30 }));
      sel = copies.map(c => c.id);
      return commit(x => { const last = Math.max(...items.map(y => x.items.findIndex(z => z.id === y.id))); x.items.splice(last + 1, 0, ...copies); });
    }
    case 'front': return commit(x => { const moved = x.items.filter(y => ids.has(y.id)); x.items = [...x.items.filter(y => !ids.has(y.id)), ...moved]; });
    case 'back': return commit(x => { const moved = x.items.filter(y => ids.has(y.id)); x.items = [...moved, ...x.items.filter(y => !ids.has(y.id))]; });
    case 'del': sel = []; return commit(x => { x.items = x.items.filter(y => !ids.has(y.id)); });
  }
  if (items.length > 1) return;
  switch (act) {
    case 'rot': return commit(x => { const t2 = itemOf(x, i.id); t2.rot = ((t2.rot + Number(b.dataset.d)) % 360 + 360) % 360; if (t2.rot > 180) t2.rot -= 360; });
    case 'kids': {
      const n = clamp(Math.round(kidCount) || 1, 1, 40), kids = kidsInZone(i, n);
      sel = kids.map(x => x.id);
      commit(x => { x.items.push(...kids); });
      return toast(`${n} Kinder eingesetzt – alle sind gewählt und lassen sich zusammen verschieben.`);
    }
    case 'view': {
      if (i.kind === 'gear') {
        const g = gear.GEAR[i.gear]; if (!g || g.views.length < 2) return;
        const nv = g.views[(Math.max(0, g.views.indexOf(i.view)) + 1) % g.views.length];
        return commit(x => { const t2 = itemOf(x, i.id), { L, s: f } = gear.fit(t2), b2 = gear.gearSize(g.id, nv, L), cx = t2.x + t2.w / 2, cy = t2.y + t2.h / 2;
          t2.view = nv; t2.w = Math.round(b2.w * f); t2.h = Math.round(b2.h * f); t2.x = Math.round(cx - t2.w / 2); t2.y = Math.round(cy - t2.h / 2); });
      }
      const cur = libEntry(i.img), vs = sp().hallLib.filter(en => en.key === cur?.key); if (vs.length < 2) return;
      const nx = vs[(vs.indexOf(cur) + 1) % vs.length];
      return commit(x => { const t2 = itemOf(x, i.id), area = t2.w * t2.h, r = nx.w / nx.h, cx = t2.x + t2.w / 2, cy = t2.y + t2.h / 2;
        t2.img = nx.id; t2.w = Math.round(Math.sqrt(area * r)); t2.h = Math.round(t2.w / r); t2.x = Math.round(cx - t2.w / 2); t2.y = Math.round(cy - t2.h / 2); });
    }
  }
}
function onChange(e) {
  const t = e.target, hc = t.dataset.hc; if (!hc) return;
  const id = primary();
  if (hc === 'floor') commit(x => { x.floor = t.value; });
  else if (hc === 'kidn') kidCount = clamp(Math.round(Number(t.value)) || 1, 1, 40);
  else if (hc === 'text') { const v = t.value.trim().slice(0, 60); commit(x => { const i = itemOf(x, id); if (i) { i.text = v; if (i.kind === 'text') i.w = Math.max(60, Math.round(v.length * i.h * .45 + 30)); } }); }
  else if (hc === 'files') { const files = [...t.files]; t.value = ''; importImages(files); }
  else if (hc === 'form') commit(x => { const i = itemOf(x, id); if (!i) return; if (t.value === 'rect') { delete i.form; delete i.tx; delete i.ty; } else { i.form = t.value; i.tx = bandOf(i.tx); i.ty = bandOf(i.ty); } });
  else if (hc === 'tx' || hc === 'ty') { const v = bandOf(Number(t.value) / 100); commit(x => { const i = itemOf(x, id); if (i) i[hc] = v; }); }
}
// Beschriftung sofort in der Zeichnung zeigen, gespeichert wird beim Verlassen des Feldes
function onInput(e) {
  const hc = e.target.dataset.hc, i = itemOf(plan(), primary());
  if (hc === 'kidn') { kidCount = clamp(Math.round(Number(e.target.value)) || 1, 1, 40); return; }
  const g = i && host.querySelector(`.hall-board .hi[data-hid="${CSS.escape(i.id)}"]`); if (!g) return;
  if (hc === 'tx' || hc === 'ty') g.innerHTML = shape({ ...i, [hc]: bandOf(Number(e.target.value) / 100) });
  else if (hc === 'text') g.innerHTML = shape({ ...i, text: e.target.value });
}
function onKey(e) {
  if (e.target.closest('input,textarea,select')) return;
  const mod = e.ctrlKey || e.metaKey, p = plan();
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return undo(e.shiftKey); }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); return undo(true); }
  if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); return select(p.items.map(x => x.id)); }
  const items = selItems(p); if (!items.length) return;
  const ids = new Set(items.map(x => x.id));
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); sel = []; return commit(x => { x.items = x.items.filter(y => !ids.has(y.id)); }); }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); host.querySelector('[data-h=dup]')?.click(); return; }
  if (e.key === 'Escape') return select([]);
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (d) { e.preventDefault(); const st = e.shiftKey ? 1 : 10; commit(x => { x.items.forEach(t => { if (ids.has(t.id)) { t.x += d[0] * st; t.y += d[1] * st; } }); }); }
}

// Ziehen: aus der Leiste in die Halle, Elemente verschieben (auch mehrere), Größe ändern, drehen, Rahmen aufziehen
function onPointerDown(e) {
  if (e.button > 0) return;
  const tileEl = e.target.closest('[data-add],[data-addimg]');
  if (tileEl) return startTileDrag(e, tileEl);
  const svg = e.target.closest('.hall-board svg'); if (!svg) return;
  const grip = e.target.closest('[data-grip]'), g = e.target.closest('.hi');
  if (!grip && !g) return startBand(e, svg);
  const p = plan(), id = grip ? primary() : g.dataset.hid, i = itemOf(p, id); if (!i) return;
  e.preventDefault();
  if (!grip && e.shiftKey) return select(sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);   // Umschalt-Klick: hinzufügen oder entfernen
  if (!sel.includes(id)) select([id]);
  host.querySelector('.hall-board')?.focus({ preventScroll: true });
  const start = toBoard(svg, e.clientX, e.clientY), mode = grip?.dataset.grip || 'move';
  if (mode === 'move') return startMove(svg, start, p, i);
  const el = host.querySelector(`.hall-board .hi[data-hid="${CSS.escape(i.id)}"]`), fr = host.querySelector(`[data-frame="${CSS.escape(i.id)}"]`);
  const o = { ...i }, keep = keepOf(i);
  let cur = { ...i }, moved = false;
  const apply = () => { const tr = trOf(cur); el.setAttribute('transform', tr); fr?.setAttribute('transform', tr); };
  const move = ev => {
    const pt = toBoard(svg, ev.clientX, ev.clientY), dx = pt.x - start.x, dy = pt.y - start.y;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;
    if (mode === 'size') {
      // im gedrehten Element entlang seiner eigenen Achsen vergrößern
      const a = -o.rot * Math.PI / 180, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      let w = Math.max(16, o.w + lx), h = Math.max(16, o.h + ly);
      if (keep) { const f = Math.max(w / o.w, h / o.h); w = Math.max(16, o.w * f); h = Math.max(16, o.h * f); }
      cur.w = Math.round(w); cur.h = Math.round(h);
      el.innerHTML = shape(cur); hydrateSvg(el); apply();
      fr?.querySelector('.h-frame')?.setAttribute('width', cur.w + 16); fr?.querySelector('.h-frame')?.setAttribute('height', cur.h + 16);
      const gr = fr?.querySelector('[data-grip=size]'); gr?.setAttribute('cx', cur.w + 8); gr?.setAttribute('cy', cur.h + 8);
    } else {
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      let deg = Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI + 90;
      deg = Math.round(deg / 5) * 5; if (deg > 180) deg -= 360;
      cur.rot = deg; apply();
    }
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    if (moved && ['w', 'h', 'rot'].some(k => cur[k] !== o[k])) commit(x => { const t = itemOf(x, i.id); Object.assign(t, { w: cur.w, h: cur.h, rot: cur.rot }); });
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
// Alle gewählten Elemente gemeinsam verschieben; mit Raster richtet sich das angefasste Element aus, die übrigen folgen
function startMove(svg, start, p, lead) {
  const items = selItems(p), orig = new Map(items.map(i => [i.id, { x: i.x, y: i.y }]));
  const els = items.map(i => [i, host.querySelector(`.hall-board .hi[data-hid="${CSS.escape(i.id)}"]`), host.querySelector(`[data-frame="${CSS.escape(i.id)}"]`)]);
  let dx = 0, dy = 0, moved = false;
  const move = ev => {
    const pt = toBoard(svg, ev.clientX, ev.clientY);
    dx = pt.x - start.x; dy = pt.y - start.y;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;
    if (snap) { dx = snapX(lead.x + dx) - lead.x; dy = snapY(lead.y + dy) - lead.y; }
    dx = Math.round(dx); dy = Math.round(dy);
    for (const [i, el, fr] of els) { const tr = trOf({ ...i, x: i.x + dx, y: i.y + dy }); el?.setAttribute('transform', tr); fr?.setAttribute('transform', tr); }
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    if (moved && (dx || dy)) commit(x => { x.items.forEach(t => { const o = orig.get(t.id); if (o) { t.x = o.x + dx; t.y = o.y + dy; } }); });
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
// Rahmen auf freier Fläche aufziehen: wählt alle Elemente, deren Mitte darin liegt (mit Umschalt dazu)
function startBand(e, svg) {
  const layer = host.querySelector('[data-sel]'), a = toBoard(svg, e.clientX, e.clientY), add = e.shiftKey, before = [...sel];
  let band = null, b = a;
  const move = ev => {
    b = toBoard(svg, ev.clientX, ev.clientY);
    if (!band && Math.hypot(b.x - a.x, b.y - a.y) < 8) return;
    if (!band) { band = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); band.setAttribute('class', 'h-band'); layer.append(band); }
    band.setAttribute('x', Math.min(a.x, b.x)); band.setAttribute('y', Math.min(a.y, b.y)); band.setAttribute('width', Math.abs(b.x - a.x)); band.setAttribute('height', Math.abs(b.y - a.y));
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    if (!band) return select(add ? before : []);
    band.remove();
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const hit = plan().items.filter(i => { const cx = i.x + i.w / 2, cy = i.y + i.h / 2; return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1; }).map(i => i.id);
    select(add ? [...new Set([...before, ...hit])] : hit);
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
const ZC = ['#2e7d4f', '#d9a521', '#c94040', '#3d6fb5'];
// Bereiche ohne Beschriftung (Gestaltungsregel 13.11.2026), Teams nur über die Farbe
const zonesAcross = n => Array.from({ length: n }, (_, k) => { const w = (HALL.len - 1 - (n - 1) * 0.6) / n, x0 = 0.5 + k * (w + 0.6); return zoneAt(x0, x0 + w, 0.8, 14.2, ZC[k % 4], ''); });
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
// Lehrkraft vorn an der Mittellinie (Nutzerentscheidung 14.11.2026: in jedem Plan, ohne Text, Größe 0,6)
const teacherItem = () => itemAt('teacher', HALL.len / 2, 0.6, { size: FIGURE });
export const topics = () => [...new Set(sp().halls.map(h => h.topic).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
const lessons = () => [...new Set(sp().halls.map(h => h.lesson).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
const datalist = (id, list) => `<datalist id="${id}">${list.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
const checkLimit = (n = 1) => { if (sp().halls.filter(h => !h.demo).length + n > store.HALL_MAX) throw new Error(`Es sind höchstens ${store.HALL_MAX} Hallenpläne möglich. Bitte zuerst alte Pläne löschen.`); };

export function newPlanDialog(topic = '') {
  dialog({ title: 'Neuer Hallenplan', submit: 'Anlegen', body: `
    <label class="field">Name<input name="t" class="input" maxlength="80" placeholder="z. B. Passen in Gassen" required></label>
    <label class="field">Thema <small class="muted">– ordnet die Sammlung, z. B. Völkerball, Turnen</small><input name="topic" class="input" maxlength="60" list="h-topics" value="${esc(topic)}">${datalist('h-topics', topics())}</label>
    <label class="field">Voreinstellung<select name="tpl" class="select">${TEMPLATES.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}</select></label>
    <p class="muted small-text">Halle 27 m × 15 m, Geräte maßstäblich (Kleingeräte etwas größer). Die Lehrkraft steht schon vorn an der Mittellinie. Spielfeldlinien lassen sich später ein- und ausschalten. Abstände, Türen und nutzbaren Raum vor Ort prüfen.</p>`,
    onSubmit: fd => {
      const t = String(fd.get('t')).trim(); if (!t) throw new Error('Bitte einen Namen eingeben.');
      checkLimit();
      const tpl = (TEMPLATES.find(x => x.id === fd.get('tpl')) || TEMPLATES[0]).make();
      const p = { id: uid(), title: t, topic: String(fd.get('topic') || '').trim().slice(0, 60), lesson: '', phase: 0, floor: 'halle', v: 3, lines: tpl.lines || [], items: [...(tpl.items || []), teacherItem()] };
      sel = []; store.update(s => { s.sport.halls.push(p); s.sport.activeHall = p.id; });
    } });
}

// Name, Thema, Stunde und Phase eines Plans
function propsDialog(p) {
  dialog({ title: 'Eigenschaften', submit: 'Speichern', body: `
    <label class="field">Name<input name="t" class="input" maxlength="80" value="${esc(p.title)}" required></label>
    <label class="field">Thema<input name="topic" class="input" maxlength="60" list="h-topics" value="${esc(p.topic || '')}">${datalist('h-topics', topics())}</label>
    <div class="two"><label class="field">Stunde <small class="muted">(optional)</small><input name="lesson" class="input" maxlength="80" list="h-lessons" value="${esc(p.lesson || '')}" placeholder="z. B. 2026.11.18 Völkerball">${datalist('h-lessons', lessons())}</label>
    <label class="field">Phase<input name="phase" type="number" class="input" min="1" max="20" value="${p.phase || 1}"></label></div>
    <p class="muted small-text">Pläne mit derselben Stunde stehen in der Sammlung zusammen und lassen sich oben mit den Pfeilen nacheinander zeigen (z. B. Erwärmung, Übung, Spiel).</p>`,
    onSubmit: fd => {
      const t = String(fd.get('t')).trim(); if (!t) throw new Error('Bitte einen Namen eingeben.');
      const lesson = String(fd.get('lesson') || '').trim().slice(0, 80);
      commit(x => { x.title = t.slice(0, 80); x.topic = String(fd.get('topic') || '').trim().slice(0, 60); x.lesson = lesson; x.phase = lesson ? clamp(Math.round(Number(fd.get('phase'))) || 1, 1, 20) : 0; });
    } });
}
// Kopie anlegen; als nächste Phase gehören Original und Kopie zur selben Stunde
function copyPlan(p, phase) {
  checkLimit();
  const c = structuredClone(p); c.id = uid(); c.demo = false; c.items.forEach(x => { x.id = uid(); });
  if (phase) {
    const lesson = p.lesson || p.title, n = Math.max(1, ...sp().halls.filter(x => x.lesson === lesson).map(x => x.phase || 1)) + 1;
    c.lesson = lesson; c.phase = n; c.title = `${p.title.replace(/\s*–\s*Phase \d+$/, '')} – Phase ${n}`.slice(0, 80);
    sel = [];
    store.update(s => { const o = s.sport.halls.find(x => x.id === p.id); if (o && !o.lesson) { o.lesson = lesson; o.phase = 1; } s.sport.halls.push(c); s.sport.activeHall = c.id; });
    return toast(`Phase ${n} angelegt – eine Kopie, die du jetzt verändern kannst.`);
  }
  c.title = (p.title + ' (Kopie)').slice(0, 80); c.lesson = ''; c.phase = 0;
  sel = []; store.update(s => { s.sport.halls.push(c); s.sport.activeHall = c.id; }); toast('Kopie angelegt.');
}

// Dateiname aus dem Plantitel (ohne Zeichen, die Windows nicht erlaubt)
const fileName = t => String(t).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70) || 'Hallenplan';
// Hallenpläne aus Datei oder eingefügtem Text übernehmen (Format: hallplan.js). Nichts wird überschrieben, außer es ist angekreuzt.
export function importPlansDialog() {
  dialog({ title: 'Hallenpläne importieren', submit: 'Importieren', body: `
    <label class="field">Datei <small class="muted">(.json, z. B. aus „Exportieren“)</small><input type="file" class="input" accept=".json,.txt,application/json,text/plain" data-m="file"></label>
    <label class="field">… oder Inhalt einfügen<textarea name="json" class="input" rows="7" spellcheck="false" placeholder='{ "plans": [ { "title": "…", "items": [ … ] } ] }'></textarea></label>
    <label class="field">Thema <small class="muted">– für Pläne ohne Thema in der Datei</small><input name="topic" class="input" maxlength="60" list="h-topics">${datalist('h-topics', topics())}</label>
    <label class="check"><input type="checkbox" name="replace"> Vorhandene Pläne mit gleichem Namen ersetzen</label>
    <p class="muted small-text">Ohne Haken kommen die Pläne zu den vorhandenen dazu. Eigene Bilder sind in der Datei nicht enthalten.</p>`,
    onOpen: el => { el.querySelector('[data-m=file]').onchange = async e => { const f = e.target.files?.[0]; if (f) el.querySelector('[name=json]').value = await f.text(); }; },
    onSubmit: fd => {
      const text = String(fd.get('json') || '').trim(); if (!text) throw new Error('Bitte eine Datei wählen oder den Inhalt einfügen.');
      const plans = parsePlans(text), replace = fd.get('replace') === 'on', topic = String(fd.get('topic') || '').trim().slice(0, 60);
      plans.forEach(p => { if (!p.topic) p.topic = topic; });
      if (!replace) checkLimit(plans.length);
      let replaced = 0;
      sel = [];
      store.update(s => {
        const titles = new Set(s.sport.halls.map(x => x.title));
        for (const p of plans) {
          const k = replace ? s.sport.halls.findIndex(x => x.title === p.title) : -1;
          if (k >= 0) { const old = s.sport.halls[k]; p.id = old.id; if (!p.topic) p.topic = old.topic; if (!p.lesson && old.lesson) { p.lesson = old.lesson; p.phase = old.phase; } history.delete(p.id); s.sport.halls[k] = p; replaced++; continue; }
          const base = p.title; let n = 2; while (titles.has(p.title)) p.title = `${base.slice(0, 74)} (${n++})`;
          titles.add(p.title); s.sport.halls.push(p);
        }
        s.sport.activeHall = plans[0].id;
      });
      toast(`${plans.length === 1 ? '1 Hallenplan' : plans.length + ' Hallenpläne'} importiert${replaced ? `, davon ${replaced} ersetzt` : ''}.`);
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

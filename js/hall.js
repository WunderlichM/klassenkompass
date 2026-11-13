// Hallenplaner (Sport): schräg von oben gesehene Halle, Elemente aus der Leiste hineinziehen, verschieben,
// drehen und in der Größe ändern. Planungssymbole (Bereiche, Hütchen, Kinder, Pfeile …) und Geräte (hallgear.js)
// zeichnet die App selbst. Zusätzlich kann jede Lehrkraft eigene Bilder hinzufügen: Sie liegen nur auf ihren
// Geräten (IndexedDB) und verschlüsselt im eigenen Konto – nie im öffentlichen Quellcode.
import * as store from './store.js';
import * as images from './images.js';
import { uid } from './engine.js';
import * as gear from './hallgear.js';
import { esc, icon, dialog, confirmDialog, toast, downloadFile } from './ui.js';

import { BW, BH, HALL, MARKS, badmintonCourts } from './hallfloor.js';
import { KINDS, clamp, num, shape, defs, boardSvg, zoneAt, gearAt, parsePlans, exportPlans, ZONE_FORMS, bandOf } from './hallplan.js';
export { boardSvg };
export { BW, BH };
const COLORS = [['#2e7d4f', 'Grün'], ['#d9a521', 'Gelb'], ['#c94040', 'Rot'], ['#3d6fb5', 'Blau'], ['#7b57b0', 'Lila'], ['#e07b2a', 'Orange'], ['#6b7280', 'Grau'], ['#25272e', 'Schwarz']];

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
  el.innerHTML = p ? editorHtml(p) : `<div class="card empty"><p>Noch kein Hallenplan.</p><button class="btn primary" data-h="new">${icon('plus')} Neuer Hallenplan</button> <button class="btn ghost" data-h="import-plan">${icon('upload')} Importieren</button></div>`;
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
      <button class="btn ghost sm" data-h="import-plan" title="Hallenpläne aus einer Datei oder eingefügtem Text übernehmen">${icon('upload', 15)} Importieren</button>
      <button class="btn ghost sm" data-h="export-plan" title="Diesen Hallenplan als Datei speichern">${icon('download', 15)} Exportieren</button>
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
    ${i.kind === 'zone' ? formHtml(i) : ''}
    ${hasColor(i) ? `<span class="h-colors">${COLORS.map(([c, n]) => `<button class="h-color ${i.color === c ? 'on' : ''}" style="--c:${c}" data-h="color" data-color="${c}" title="${n}" aria-label="${n}"></button>`).join('')}</span>` : ''}
    ${views.length > 1 ? `<button class="btn ghost sm" data-h="view">${icon('repeat', 15)} Ansicht wechseln <span class="muted">${vi + 1}/${views.length}</span></button>` : ''}
    ${KINDS[i.kind].rotate === false ? '' : `<button class="icon-btn sm" data-h="rot" data-d="-15" title="Nach links drehen" aria-label="Nach links drehen">${icon('reset', 16)}</button><button class="icon-btn sm h-flip" data-h="rot" data-d="15" title="Nach rechts drehen" aria-label="Nach rechts drehen">${icon('reset', 16)}</button>`}
    <button class="icon-btn sm" data-h="size" data-d="0.85" title="Kleiner" aria-label="Kleiner">−</button><button class="icon-btn sm" data-h="size" data-d="1.18" title="Größer" aria-label="Größer">+</button>
    <button class="btn ghost sm" data-h="dup">Kopie</button>
    <button class="btn ghost sm" data-h="front" title="Nach vorn">Vorn</button><button class="btn ghost sm" data-h="back" title="Nach hinten">Hinten</button>
    <button class="icon-btn sm danger" data-h="del" title="Entfernen (Entf)" aria-label="Entfernen">${icon('trash', 16)}</button>`;
}

// Form eines Bereichs (Rechteck, U, L, Rahmen) und Randbreite links/rechts bzw. vorn/hinten
function formHtml(i) {
  const f = i.form || 'rect', pct = v => Math.round(bandOf(v) * 100);
  const tx = /^(u-l|u-r|u-v|u-h|l-|ring)/.test(f), ty = tx;
  return `<label class="small-text h-form">Form <select class="select sm" data-hc="form" aria-label="Form des Bereichs">${ZONE_FORMS.map(([v, l]) => `<option value="${v}" ${f === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${f !== 'rect' ? `${tx ? `<label class="small-text h-form">Rand ↔ <input type="range" class="h-range" data-hc="tx" min="4" max="48" step="1" value="${pct(i.tx)}" aria-label="Randbreite links/rechts in Prozent"></label>` : ''}
    ${ty ? `<label class="small-text h-form">Rand ↕ <input type="range" class="h-range" data-hc="ty" min="4" max="48" step="1" value="${pct(i.ty)}" aria-label="Randbreite vorn/hinten in Prozent"></label>` : ''}` : ''}`;
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
    case 'import-plan': return importPlansDialog();
    case 'export-plan': return downloadFile(`Hallenplan - ${fileName(p.title)}.json`, exportPlans([p]));
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
  else if (hc === 'form') commit(x => { const i = itemOf(x, selected); if (!i) return; if (t.value === 'rect') { delete i.form; delete i.tx; delete i.ty; } else { i.form = t.value; i.tx = bandOf(i.tx); i.ty = bandOf(i.ty); } });
  else if (hc === 'tx' || hc === 'ty') { const v = bandOf(Number(t.value) / 100); commit(x => { const i = itemOf(x, selected); if (i) i[hc] = v; }); }
}
// Beschriftung sofort in der Zeichnung zeigen, gespeichert wird beim Verlassen des Feldes
function onInput(e) {
  const hc = e.target.dataset.hc;
  if (hc === 'tx' || hc === 'ty') {
    const i = itemOf(plan(), selected), g = i && host.querySelector(`.hi[data-hid="${CSS.escape(i.id)}"]`);
    if (g) g.innerHTML = shape({ ...i, [hc]: bandOf(Number(e.target.value) / 100) });
    return;
  }
  if (hc !== 'text') return;
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

// Dateiname aus dem Plantitel (ohne Zeichen, die Windows nicht erlaubt)
const fileName = t => String(t).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70) || 'Hallenplan';
// Hallenpläne aus Datei oder eingefügtem Text übernehmen (Format: hallplan.js). Nichts wird überschrieben, außer es ist angekreuzt.
function importPlansDialog() {
  dialog({ title: 'Hallenpläne importieren', submit: 'Importieren', body: `
    <label class="field">Datei <small class="muted">(.json, z. B. aus „Exportieren“)</small><input type="file" class="input" accept=".json,.txt,application/json,text/plain" data-m="file"></label>
    <label class="field">… oder Inhalt einfügen<textarea name="json" class="input" rows="7" spellcheck="false" placeholder='{ "plans": [ { "title": "…", "items": [ … ] } ] }'></textarea></label>
    <label class="check"><input type="checkbox" name="replace"> Vorhandene Pläne mit gleichem Namen ersetzen</label>
    <p class="muted small-text">Ohne Haken kommen die Pläne zu den vorhandenen dazu. Eigene Bilder sind in der Datei nicht enthalten.</p>`,
    onOpen: el => { el.querySelector('[data-m=file]').onchange = async e => { const f = e.target.files?.[0]; if (f) el.querySelector('[name=json]').value = await f.text(); }; },
    onSubmit: fd => {
      const text = String(fd.get('json') || '').trim(); if (!text) throw new Error('Bitte eine Datei wählen oder den Inhalt einfügen.');
      const plans = parsePlans(text), replace = fd.get('replace') === 'on';
      if (sp().halls.filter(h => !h.demo).length + plans.length > 60 && !replace) throw new Error('Es sind höchstens 60 Hallenpläne möglich. Bitte zuerst alte Pläne löschen.');
      let replaced = 0;
      selected = null;
      store.update(s => {
        const titles = new Set(s.sport.halls.map(x => x.title));
        for (const p of plans) {
          const k = replace ? s.sport.halls.findIndex(x => x.title === p.title) : -1;
          if (k >= 0) { p.id = s.sport.halls[k].id; history.delete(p.id); s.sport.halls[k] = p; replaced++; continue; }
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

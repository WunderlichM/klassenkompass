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
import { esc, icon, dialog, confirmDialog, toast, downloadFile, hooks } from './ui.js';
import * as groups from './groups.js';

import { BW, BH, K, MARKS, geo, STD, GYM_LEN, GYM_DEP } from './hallfloor.js';
import { KINDS, clamp, num, shape, defs, boardSvg as drawBoard, zoneAt, gearAt, fixedGear, itemAt, parsePlans, exportPlans, refitItems, GYM_TEMPLATES, gymTemplateItems, ZONE_FORMS, bandOf, normRules, printsRules, rulesHtml, RULES_MAX } from './hallplan.js';
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
let showRules = pref('hallRulesShow', '0') === '1';   // Spielregeln unter der Halle zeigen (seit 2.16.0, je Gerät)
let side = pref('hallSide', 'tools') === 'settings' ? 'settings' : 'tools';   // Seitenleiste: Elemente oder Einstellungen (seit 2.15.0)
// Geräte, die beim Einrichten einer Halle gebraucht werden (seit 2.15.0 als eigene Gruppe oben in der Leiste)
const SETUP_GEAR = ['tuer', 'doppeltuer', 'geraeteraumtor', 'trennwand', 'tor', 'basketballkorb', 'seilanlage', 'sprossenwand', 'sprossenwand2', 'sprossenwand_reihe', 'matte_stehend', 'weichboden_stehend', 'tafel', 'lautsprecher'];
const libOpen = new Set(['g:' + gear.GROUPS[0]]); // geöffnete Gruppen der Leiste
const history = new Map(); // Plan-ID → { undo: [], redo: [] }
const sp = () => store.get().sport;
// ---------- Hallen (seit 2.10.0) ----------
// Eigene Sporthallen in sport.gyms: Name, Länge × Breite in m und feste Geräte (Tore, Körbe, Türen …), die in jedem Plan
// dieser Halle unter den Elementen liegen. Ein Plan ohne Halle zeigt die Standardhalle 27 m × 15 m.
export const gyms = () => sp().gyms || [];
export const gymById = id => (id && gyms().find(g => g.id === id)) || null;
export const gymOf = p => gymById(p?.gym);
const m = v => String(Math.round(v * 10) / 10).replace('.', ',');
export const gymSize = g => `${m(g ? g.len : STD.len)} × ${m(g ? g.dep : STD.dep)} m`;
export const gymLabel = g => (g ? `${g.name} (${gymSize(g)})` : `Standardhalle (${gymSize(null)})`);
// Zeichnung eines Plans mit seiner Halle (Fläche, Linien und feste Geräte)
export const boardSvg = (p, o = {}) => drawBoard(p, { gym: gymOf(p), ...o });
// Feste Geräte einer Halle bearbeiten: Der Editor arbeitet dann auf der Halle statt auf einem Plan
let baseEdit = null;
const gymPlan = g => ({ id: 'gym:' + g.id, title: g.name, items: g.items, floor: 'halle', lines: [], gym: g.id, base: true });
const plan = () => {
  const g = baseEdit && gymById(baseEdit); if (g) return gymPlan(g);
  baseEdit = null;
  return sp().halls.find(h => h.id === sp().activeHall) || sp().halls[0] || null;
};
const G = (p = plan()) => geo(gymOf(p));   // Geometrie der Halle des bearbeiteten Plans
export const currentPlan = () => plan();
export const editingGym = () => (baseEdit && gymById(baseEdit)) || null;
export function editGym(id) { if (!gymById(id)) return; baseEdit = id; sel = []; store.update(() => {}); }
export function stopGymEdit() { baseEdit = null; sel = []; store.update(() => {}); }
const itemOf = (p, id) => p?.items.find(i => i.id === id);
const libEntry = id => sp().hallLib.find(e => e.id === id);
const primary = () => sel.at(-1) ?? null;
const selItems = p => sel.map(id => itemOf(p, id)).filter(Boolean);

function hist(id) { if (!history.has(id)) history.set(id, { undo: [], redo: [] }); return history.get(id); }
// Änderung am aktuellen Plan mit Rückgängig-Schritt
function commit(fn) {
  const p = plan(); if (!p) return;
  const h = hist(p.id); h.undo.push(JSON.stringify(p)); if (h.undo.length > 60) h.undo.shift(); h.redo = [];
  if (p.base) return store.update(s => { const g = s.sport.gyms.find(y => y.id === p.gym); if (g) { const x = gymPlan(g); fn(x); g.items = x.items; } });
  store.update(s => { const x = s.sport.halls.find(y => y.id === p.id); if (x) { fn(x); x.demo = false; } });
}
function undo(redo = false) {
  const p = plan(); if (!p) return;
  const h = hist(p.id), from = redo ? h.redo : h.undo, to = redo ? h.undo : h.redo;
  if (!from.length) return;
  to.push(JSON.stringify(p));
  const prev = JSON.parse(from.pop());
  sel = sel.filter(id => itemOf(prev, id));
  if (p.base) return store.update(s => { const g = s.sport.gyms.find(y => y.id === p.gym); if (g) g.items = prev.items; });
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
  // Themen in der Reihenfolge der Themenliste (seit 2.1.0), Pläne ohne Thema zuletzt
  const order = new Map(topics().map((x, i) => [x, i])), t = p => (p.topic ? order.get(p.topic) ?? 9998 : 9999);
  return [...list].sort((a, b) => t(a) - t(b) || (a.topic || '').localeCompare(b.topic || '', 'de') || (a.lesson || a.title).localeCompare(b.lesson || b.title, 'de') || (a.phase || 0) - (b.phase || 0) || a.title.localeCompare(b.title, 'de'));
}
// Pläne derselben Stunde, nach Phase
// Pläne derselben Stunde (seit 2.3.0 über alle Themen hinweg) in der Reihenfolge der Phasen
export const lessonPlans = p => (p?.lesson ? sp().halls.filter(x => x.lesson === p.lesson).sort((a, b) => a.phase - b.phase) : []);
export const nextPhase = lesson => Math.max(0, ...sp().halls.filter(x => x.lesson === lesson).map(x => x.phase || 0)) + 1;
export function openPlan(id) { sel = []; baseEdit = null; store.update(s => { s.sport.activeHall = id; }); }

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

// ---------- Kopfzeile, Seitenleiste und Menüs (seit 2.15.0) ----------
// Kopfzeile: Titel, Thema, Phasen, Rückgängig/Wiederholen, „Elemente“ und „Einstellungen“ (schalten die Seitenleiste um),
// Menü „⋯“ mit den seltenen Aktionen. Alles, was den Plan beschreibt (Name, Thema, Stunde, Halle, Boden, Linien, Geräte),
// steht gebündelt in der Seitenleiste unter „Einstellungen“.
const moreIcon = '<svg class="ic" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg>';
const menuItem = (act, ic, label, hint = '', cls = '') => `<button type="button" class="h-menu-item ${cls}" data-h="${act}">${ic ? icon(ic, 16) : ''}<span><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span></button>`;
const menu = (label, body, cls = '') => `<details class="h-menu ${cls}"><summary class="icon-btn sm" title="${label}" aria-label="${label}">${moreIcon}</summary><div class="h-menu-list">${body}</div></details>`;
// Eigene Pfeile für Rückgängig/Wiederholen – nicht zu verwechseln mit den Phasenpfeilen
const undoIcon = flip => `<svg class="ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${flip ? ' style="transform:scaleX(-1)"' : ''}><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>`;
const undoBtns = h => `<span class="h-grp" role="group" aria-label="Rückgängig und Wiederholen"><button class="icon-btn sm" data-h="undo" title="Rückgängig (Strg+Z)" aria-label="Rückgängig" ${h.undo.length ? '' : 'disabled'}>${undoIcon(false)}</button>
      <button class="icon-btn sm" data-h="redo" title="Wiederholen (Strg+Y)" aria-label="Wiederholen" ${h.redo.length ? '' : 'disabled'}>${undoIcon(true)}</button></span>`;
const sideBtns = (base = false) => [['tools', 'plus', 'Elemente', 'Planungssymbole und Geräte zum Hineinziehen'], ...(base ? [] : [['settings', 'sliders', 'Einstellungen', 'Name, Thema, Stunde, Halle, Boden, Spielfeldlinien']])]
  .map(([t, ic, l, tip]) => { const on = !palHidden && (base || side === t); return `<button class="btn ghost sm ${on ? 'on' : ''}" data-h="side" data-tab="${t}" aria-pressed="${on}" title="${tip}${on ? ' – nochmal klicken blendet die Leiste aus' : ''}">${icon(ic, 15)} ${l}</button>`; }).join('');

// Kopfzeile beim Bearbeiten der festen Geräte einer Halle: deutlich als eigener Modus gekennzeichnet
function gymBarHtml(p) {
  const h = hist(p.id), g = gymById(p.gym), n = sp().halls.filter(x => x.gym === p.gym).length;
  return `<div class="hall-bar hall-gymbar no-print">
      <span class="hall-gymbar-text">${icon('hall', 18)}<span><b>Einrichtung der Halle „${esc(g.name)}“</b> <span class="muted">${gymSize(g)}</span>
        <small>Du bearbeitest die Halle, nicht den Plan. Was hier steht, erscheint in ${n === 1 ? 'dem Plan' : n ? `allen ${n} Plänen` : 'jedem Plan'} dieser Halle und ist dort nicht verschiebbar.</small></span></span>
      <span class="hall-sep"></span>
      ${sideBtns(true)}
      <button class="btn ghost sm" data-h="gym-props" title="Name, Maße und Lerngruppen dieser Halle">${icon('sliders', 15)} Name und Maße</button>
      ${undoBtns(h)}
      <button class="btn primary sm" data-h="gym-done" title="Zurück zum Hallenplan">${icon('check', 15)} Fertig</button>
    </div>`;
}
function headBarHtml(p) {
  const h = hist(p.id), phases = lessonPlans(p), k = phases.findIndex(x => x.id === p.id);
  return `<div class="hall-bar hall-head no-print">
      <button class="hall-title-btn" data-h="props" title="Name, Thema, Stunde und Phase ändern"><b class="hall-title">${esc(p.title)}</b>${icon('edit', 14)}</button>
      ${p.topic ? `<span class="badge">${esc(p.topic)}</span>` : ''}
      ${phases.length ? `<span class="hall-phase" role="group" aria-label="Phasen der Stunde"><button class="icon-btn sm" data-h="phase" data-d="-1" title="Vorige Phase" aria-label="Vorige Phase" ${k > 0 ? '' : 'disabled'}>${icon('back', 15)}</button><span class="small-text" title="${esc(p.lesson)}">Phase ${p.phase} · ${k + 1}/${phases.length}</span><button class="icon-btn sm" data-h="phase" data-d="1" title="Nächste Phase" aria-label="Nächste Phase" ${k < phases.length - 1 ? '' : 'disabled'}>${icon('forward', 15)}</button><button class="icon-btn sm" data-h="next-phase" title="Neue Phase anlegen (Kopie dieses Plans)" aria-label="Neue Phase anlegen">${icon('plus', 15)}</button></span>` : ''}
      <span class="hall-sep"></span>
      ${undoBtns(h)}
      <span class="hall-gap"></span>
      ${sideBtns()}
      ${menu('Weitere Aktionen', `
        ${menuItem('next-phase', 'layers', 'Nächste Phase anlegen', 'Kopie als nächste Phase derselben Stunde')}
        ${menuItem('copy', 'plus', 'Kopie anlegen', 'Eigenständiger Plan mit gleichem Inhalt')}
        ${menuItem('rules', 'list', p.rules ? `Spielregeln (${p.rules.items.length})` : 'Spielregeln anlegen', 'Werden auf Seite 2 der Schüleransicht gedruckt')}
        ${menuItem('export-plan', 'download', 'Exportieren', 'Diesen Plan als Datei speichern')}
        <hr>
        ${menuItem('del-plan', 'trash', 'Hallenplan löschen', 'Lässt sich nicht rückgängig machen', 'danger')}`)}
    </div>`;
}
// Seitenleiste: Kopf mit Titel und Schließen, darunter Elemente oder Einstellungen
function sideHtml(p) {
  const tab = p.base ? 'tools' : side;
  return `<aside class="hall-palette hall-side no-print">
    <div class="h-side-head"><b>${tab === 'settings' ? 'Einstellungen' : p.base ? 'Einrichtung ergänzen' : 'Elemente'}</b>
      <button class="icon-btn sm" data-h="side-close" title="Leiste ausblenden – die Halle wird größer" aria-label="Leiste ausblenden">${icon('x', 15)}</button></div>
    ${tab === 'settings' ? settingsHtml(p) : paletteHtml(p.base)}
  </aside>`;
}
// Einstellungen eines Plans in vier Abschnitten; Änderungen gelten sofort und lassen sich rückgängig machen
function settingsHtml(p) {
  const cur = gymOf(p)?.id || '', lg = groups.active(), def = lg ? gymById(groups.sportView(lg).gym)?.id || '' : null;
  const tp = [...new Set([...topics(), ...(p.topic ? [p.topic] : [])])];
  const fixedOf = m => m.gear && fixedGear(p, gymOf(p), m.id);
  const check = m => { const fixed = fixedOf(m), on = fixed || p.lines?.includes(m.id), off = fixed || (!m.gear && p.floor === 'leer');
    return `<label class="h-check" style="--c:${m.color}"><input type="checkbox" data-hc="mark" value="${m.id}" ${on ? 'checked' : ''} ${off ? 'disabled' : ''}><i></i><span>${esc(m.label)}${fixed ? ' <small class="muted">fest in der Halle</small>' : ''}</span></label>`; };
  return `<div class="h-set">
    <section><h3>Plan</h3>
      <label class="field">Name<input class="input sm" data-hc="title" maxlength="80" value="${esc(p.title)}"></label>
      <label class="field">Thema <small class="muted">ordnet die Sammlung</small><select class="select sm" data-hc="topic"><option value="">Ohne Thema</option>${tp.map(t => `<option value="${esc(t)}" ${t === p.topic ? 'selected' : ''}>${esc(t)}</option>`).join('')}<option value="${NEW_TOPIC}">+ Neues Thema …</option></select></label>
      <label class="field">Stunde <small class="muted">optional, z. B. Datum und Klasse</small><input class="input sm" data-hc="lesson" maxlength="80" list="h-lessons" value="${esc(p.lesson || '')}" placeholder="z. B. 2026.11.18 · Klasse 6">${datalist('h-lessons', lessons())}</label>
      ${p.lesson ? `<label class="field h-inline">Phase <input class="input sm h-num" type="number" data-hc="phase" min="1" max="20" value="${p.phase || 1}"><small class="muted">Pläne derselben Stunde zeigst du oben mit den Pfeilen nacheinander.</small></label>` : ''}
      <button class="btn ghost sm full ${p.rules ? 'on' : ''}" data-h="rules">${icon('list', 15)} ${p.rules ? `Spielregeln bearbeiten (${p.rules.items.length})` : 'Spielregeln anlegen'}</button>
      ${rulesCheck(!p.rules)}
    </section>
    <section><h3>Halle</h3>
      <select class="select sm" data-hc="gym" aria-label="Halle dieses Plans">${gymOptions(cur)}<option value="__new">+ Neue Halle …</option></select>
      <p class="muted small-text">Beim Wechsel passen sich Bereiche und Elemente der neuen Fläche an (rückgängig machbar).</p>
      ${cur ? `<button class="btn ghost sm full" data-h="gym-edit">${icon('edit', 15)} Halle bearbeiten <small class="muted">Maße, Einrichtung</small></button>`
        : `<button class="btn ghost sm full" data-h="gym-std" title="Die Standardhalle als eigene Halle anlegen – benennen, Maße ändern, Türen, Tore, Körbe einrichten">${icon('edit', 15)} Als eigene Halle anlegen</button>`}
      ${lg && cur ? `<label class="check"><input type="checkbox" data-hc="gymdef" ${def === cur ? 'checked' : ''}><span>Standardhalle für „${esc(lg.name)}“ <small class="muted">neue Pläne entstehen hier</small></span></label>` : ''}
      <label class="field h-inline">Boden <select class="select sm" data-hc="floor" aria-label="Hallenboden">${[['halle', 'Hallenfläche'], ['linien', 'mit Mittellinie'], ['leer', 'ohne Fläche']].map(([v, l]) => `<option value="${v}" ${p.floor === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </section>
    <section><h3>Spielfeldlinien</h3>
      ${p.floor === 'leer' ? '<p class="muted small-text">Bei „ohne Fläche“ gibt es keine Linien.</p>' : ''}
      <div class="h-checks">${MARKS.filter(m => !m.gear).map(check).join('')}</div>
      <h3>Geräte einblenden <small class="muted">an den üblichen Stellen</small></h3>
      <div class="h-checks">${MARKS.filter(m => m.gear).map(check).join('')}</div>
      <p class="muted small-text">Eingeblendete Geräte sind fest. Zum Verschieben das Gerät stattdessen aus „Elemente“ setzen.</p>
    </section>
    <section><h3>Bearbeiten</h3>
      <label class="check"><input type="checkbox" data-hc="snap" ${snap ? 'checked' : ''}><span>Raster <small class="muted">beim Verschieben auf 0,5 m ausrichten</small></span></label>
    </section>
  </div>`;
}
// Schalter „Regeln unter der Halle zeigen“ – gilt auf diesem Gerät für alle Pläne mit Spielregeln
const rulesCheck = (off = false) => `<label class="check"><input type="checkbox" data-hc="showrules" ${showRules ? 'checked' : ''} ${off ? 'disabled' : ''}><span>Regeln unter der Halle zeigen <small class="muted">${off ? 'erst Spielregeln anlegen' : 'auch in der großen Ansicht; gilt auf diesem Gerät für alle Pläne mit Regeln'}</small></span></label>`;
// Spielregeln unter der Zeichnung (Bildschirmansicht, nicht im Druck – dort stehen sie auf Seite 2)
const screenRules = p => (showRules && p.rules?.items?.length ? `<section class="h-rules-scr ${p.rules.items.length > 4 ? 'cols' : ''}"><b>${esc(p.rules.title || 'Spielregeln')}</b><ol>${p.rules.items.map(x => `<li>${esc(x)}</li>`).join('')}</ol></section>` : '');
function editorHtml(p) {
  const presenting = document.body.classList.contains('presenting');
  return `<div class="hall ${p.base ? 'gym-edit' : ''} ${presenting ? 'presenting' : ''} ${palHidden ? 'no-pal' : ''}">
    ${p.base ? gymBarHtml(p) : headBarHtml(p)}
    <div class="hall-selbar no-print" data-selbar>${selBarHtml(p)}</div>
    <div class="hall-work">
      ${palHidden ? '' : sideHtml(p)}
      <div class="hall-board" tabindex="0">
        ${boardSvg(p, { edit: true })}
        ${p.base ? '' : screenRules(p)}
        <p class="hall-note">${p.base ? `Halle ${gymSize(gymById(p.gym))} · ` : ''}Schematisch · Abstände und nutzbaren Raum vor Ort prüfen</p>
      </div>
    </div>
    ${p.base ? '' : `<div class="print-only hall-print"><h1>${esc(p.title)}</h1>${boardSvg(p, { crop: true })}<p>Schematisch · Abstände und nutzbaren Raum vor Ort prüfen</p></div>
    ${printsRules(p) ? `<div class="print-only hall-print-rules">${rulesHtml(p)}</div>` : ''}`}
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
function paletteHtml(base = false) {
  const lib = sp().hallLib, byKey = new Map();
  for (const e of [...lib].sort((a, b) => (a.code || '~').localeCompare(b.code || '~') || a.name.localeCompare(b.name))) if (!byKey.has(e.key)) byKey.set(e.key, e);
  const cats = new Map();
  for (const e of byKey.values()) { if (!cats.has(e.cat)) cats.set(e.cat, []); cats.get(e.cat).push(e); }
  const imgTile = e => { const n = lib.filter(x => x.key === e.key).length; return `<button class="h-tile img" data-addimg="${esc(e.id)}" title="${esc(e.name)}${n > 1 ? ` (${n} Ansichten)` : ''} – ziehen oder antippen">${images.imgTag(e.id, 'h-thumb')}<span>${esc(e.name)}</span></button>`; };
  const gearCats = gear.GROUPS.map(c => [c, gear.gearList().filter(g => g.group === c)]);
  const setup = SETUP_GEAR.map(id => gear.GEAR[id]).filter(Boolean);
  // Beim Einrichten einer Halle: oben die passenden Geräte, Planungssymbole zugeklappt
  return `${base ? `<details open><summary>Für die Einrichtung <span class="muted">${setup.length}</span></summary><div class="h-tiles gear">${setup.map(gearTile).join('')}</div></details><p class="h-head">Alle Geräte</p>` : ''}
    ${base ? '' : `<details ${libOpen.has('plan-closed') ? '' : 'open'} data-cat="plan"><summary>Planung</summary><div class="h-tiles">${PLAN_TOOLS.map(tile).join('')}</div></details>
    <details data-cat="more" ${libOpen.has('more') ? 'open' : ''}><summary>Mehr <span class="muted">Wege, Schild, Text</span></summary><div class="h-tiles">${MORE_TOOLS.map(tile).join('')}</div></details>
    <p class="h-head">Geräte</p>`}
    ${gearCats.map(([c, list]) => `<details data-cat="${esc('g:' + c)}" ${libOpen.has('g:' + c) && !base ? 'open' : ''}><summary>${esc(c)} <span class="muted">${list.length}</span></summary><div class="h-tiles gear">${list.map(gearTile).join('')}</div></details>`).join('')}
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
const sizeBtns = '<span class="h-grp" role="group" aria-label="Größe"><button class="icon-btn sm" data-h="size" data-d="0.85" title="Kleiner" aria-label="Kleiner">−</button><button class="icon-btn sm" data-h="size" data-d="1.18" title="Größer" aria-label="Größer">+</button></span>';
const orderMenu = () => menu('Weitere Aktionen für die Auswahl', `${menuItem('dup', 'layers', 'Kopie', 'Strg+D')}${menuItem('front', 'up', 'Nach vorn', 'Liegt über anderen Elementen')}${menuItem('back', 'down', 'Nach hinten', 'Liegt unter anderen Elementen')}`, 'right');
const delBtn = `<button class="icon-btn sm danger" data-h="del" title="Entfernen (Entf)" aria-label="Entfernen">${icon('trash', 16)}</button>`;
// Auswahlleiste: links was gewählt ist und seine Eigenschaften, rechts Größe, Drehen, Entfernen und „⋯“
function selBarHtml(p) {
  const items = selItems(p);
  if (!items.length) return `<span class="muted small-text">${p.base ? 'Geräte aus der Leiste an die Wände ziehen oder antippen.' : 'Elemente aus der Leiste in die Halle ziehen oder antippen.'} Antippen = bearbeiten · Rahmen ziehen oder Umschalt-Klick = mehrere wählen.</span>`;
  if (items.length > 1) {
    const colored = items.filter(hasColor), same = colored.length && colored.every(x => x.color === colored[0].color) ? colored[0].color : '';
    return `<b class="small-text">${items.length} Elemente gewählt</b>${colored.length ? colorRow(same) : ''}<span class="hall-sep"></span>${sizeBtns}${delBtn}${orderMenu()}
      <button class="btn ghost sm" data-h="none">Auswahl aufheben</button>`;
  }
  const i = items[0];
  const variants = i.kind === 'img' ? sp().hallLib.filter(e => e.key === libEntry(i.img)?.key) : [];
  const cur = libEntry(i.img), g = i.kind === 'gear' ? gear.GEAR[i.gear] : null;
  const views = g ? g.views : variants, vi = g ? Math.max(0, g.views.indexOf(i.view)) : variants.indexOf(cur);
  const label = i.kind === 'img' ? (cur ? cur.name + (cur.view ? ' · ' + cur.view : '') : 'Bild')
    : i.kind === 'gear' ? (g ? g.name + (g.views.length > 1 ? ' · ' + gear.viewLabel(g.views[vi]) : '') : 'Gerät') : KINDS[i.kind].label;
  return `<b class="small-text">${esc(label)}</b>
    ${hasText(i.kind) ? (i.kind === 'zone' ? `<textarea class="input sm h-text" data-hc="text" rows="1" maxlength="60" aria-label="Beschriftung" placeholder="Beschriftung (optional)">${esc(i.text || '')}</textarea>` : `<input class="input sm h-text" data-hc="text" maxlength="${i.kind === 'text' ? 60 : 8}" value="${esc(i.text || '')}" aria-label="Beschriftung" placeholder="Beschriftung">`) : ''}
    ${i.kind === 'zone' ? formHtml(i) : ''}
    ${hasColor(i) ? colorRow(i.color) : ''}
    ${views.length > 1 ? `<button class="btn ghost sm" data-h="view">${icon('repeat', 15)} Ansicht <span class="muted">${vi + 1}/${views.length}</span></button>` : ''}
    ${i.kind === 'zone' ? `<span class="h-kids"><label class="small-text">Kinder <input type="number" class="input sm h-num" data-hc="kidn" min="1" max="40" value="${kidCount}" aria-label="Anzahl Kinder"></label><button class="btn ghost sm" data-h="kids" title="So viele Kinder in der Farbe des Bereichs gleichmäßig darin aufstellen">Einsetzen</button></span>` : ''}
    <span class="hall-sep"></span>
    ${KINDS[i.kind].rotate === false ? '' : `<span class="h-grp" role="group" aria-label="Drehen"><button class="icon-btn sm" data-h="rot" data-d="-15" title="Nach links drehen" aria-label="Nach links drehen">${icon('reset', 16)}</button><button class="icon-btn sm h-flip" data-h="rot" data-d="15" title="Nach rechts drehen" aria-label="Nach rechts drehen">${icon('reset', 16)}</button></span>`}
    ${sizeBtns}${delBtn}${orderMenu()}`;
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
const snapX = v => { const g = G(), d = g.width / g.len / 2; return Math.round((v - g.left) / d) * d + g.left; };
const snapY = v => { const g = G(), d = g.height / g.dep / 2; return Math.round((v - g.top) / d) * d + g.top; };

function newItem(kind, at, imgEntry, gearId) {
  const k = KINDS[kind];
  let w = k.w, h = k.h;
  const g = kind === 'gear' ? gear.GEAR[gearId] : null;
  if (kind === 'gear') { if (!g) return; const s = gear.gearSize(g.id, g.views[0]), f = gear.scaleOf(g.id, G()); w = Math.max(12, Math.round(s.w * f)); h = Math.max(12, Math.round(s.h * f)); }
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
  b.closest('.h-menu')?.removeAttribute('open');
  const act = b.dataset.h, p = plan();
  switch (act) {
    case 'new': return newPlanDialog();
    case 'side': return showSide(b.dataset.tab, true);
    case 'side-close': palHidden = true; setPref('hallPalette', '0'); return attach(host);
    case 'gym-edit': { const gy = gymOf(p); if (gy) gymDialog(gy); return; }
    case 'gym-std': return gymDialog(null, { fromStd: true });
    case 'import-plan': return importPlansDialog();
    case 'export-plan': return downloadFile(`Hallenplan - ${fileName(p.title)}.json`, exportPlans([p], gymOf));
    case 'gym-done': return stopGymEdit();
    case 'gym-props': return gymDialog(gymById(p.gym));
    case 'props': return showSide('settings', false, '[data-hc=title]');
    case 'rules': return rulesEditDialog(p);
    case 'copy': return copyPlan(p, false);
    case 'next-phase': return copyPlan(p, true);
    case 'phase': { const list = lessonPlans(p), k = list.findIndex(x => x.id === p.id), n = list[k + Number(b.dataset.d)]; if (n) openPlan(n.id); return; }
    case 'del-plan': {
      if (!(await confirmDialog('Hallenplan löschen', `„${p.title}“ löschen? Das lässt sich nicht rückgängig machen.`))) return;
      sel = []; history.delete(p.id); baseEdit = null;
      return store.update(s => { s.sport.halls = s.sport.halls.filter(x => x.id !== p.id); s.sport.activeHall = sortPlans(s.sport.halls)[0]?.id ?? null; s.screen.widgets.forEach(w => { if (w.type === 'hall' && w.planId === p.id) w.planId = null; }); });
    }
    case 'undo': return undo();
    case 'redo': return undo(true);
    case 'snap': snap = !snap; setPref('hallSnap', snap ? '1' : '0'); return attach(host);
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
// Seitenleiste zeigen (tab: 'tools' | 'settings'); toggle: derselbe Knopf noch einmal blendet sie aus
function showSide(tab, toggle = false, focus = '') {
  tab = tab === 'settings' && !plan()?.base ? 'settings' : 'tools';
  if (toggle && !palHidden && (side === tab || plan()?.base)) palHidden = true;
  else { palHidden = false; side = tab; setPref('hallSide', side); }
  setPref('hallPalette', palHidden ? '0' : '1');
  attach(host);
  if (focus) { const f = host.querySelector(focus); f?.focus(); f?.select?.(); }
}
// Felder der Einstellungen; true = erledigt
function onSettingChange(t, hc) {
  const p = plan(); if (!p || p.base) return false;
  if (hc === 'title') { const v = t.value.trim().slice(0, 80); if (!v) { t.value = p.title; toast('Der Plan braucht einen Namen.', { kind: 'warn' }); } else if (v !== p.title) commit(x => { x.title = v; }); return true; }
  if (hc === 'topic') {
    if (t.value !== NEW_TOPIC) { commit(x => { x.topic = t.value; }); return true; }
    t.value = p.topic || '';
    dialog({ title: 'Neues Thema', submit: 'Anlegen', body: '<label class="field">Name des Themas<input name="t" class="input" maxlength="60" placeholder="z. B. Badminton" required></label>',
      onSubmit: fd => { const v = topicName(fd.get('t')); if (!v) throw new Error('Bitte einen Namen eingeben.'); store.update(s => addTopic(s, v), { silent: true }); commit(x => { x.topic = v; }); } });
    return true;
  }
  if (hc === 'lesson') {
    const v = t.value.trim().slice(0, 80); if (v === (p.lesson || '')) return true;
    commit(x => { x.lesson = v; x.phase = v ? nextPhase(v) : 0; });
    if (v) toast(`„${p.title}“ ist Phase ${plan().phase} von „${v}“.`);
    return true;
  }
  if (hc === 'phase') { const v = clamp(Math.round(Number(t.value)) || 1, 1, 20); commit(x => { x.phase = v; }); return true; }
  if (hc === 'mark') { const m = t.value; commit(x => { const cur = x.lines || []; x.lines = t.checked ? MARKS.map(y => y.id).filter(y => y === m || cur.includes(y)) : cur.filter(y => y !== m); }); return true; }
  if (hc === 'snap') { snap = t.checked; setPref('hallSnap', snap ? '1' : '0'); return true; }
  if (hc === 'showrules') { showRules = t.checked; setPref('hallRulesShow', showRules ? '1' : '0'); attach(host); return true; }
  if (hc === 'gym') { if (t.value === '__new') { t.value = gymOf(p)?.id || ''; gymDialog(); } else setPlanGym(t.value); return true; }
  if (hc === 'gymdef') {
    const lg = groups.active(), cur = gymOf(p)?.id || ''; if (!lg) return true;
    setGroupGym(lg.id, t.checked ? cur : '');
    toast(t.checked ? `„${gymOf(p).name}“ ist jetzt die Standardhalle von „${lg.name}“ – neue Pläne entstehen dort.` : `„${lg.name}“ plant wieder in der Standardhalle (27 × 15 m).`);
    return true;
  }
  return false;
}
function onChange(e) {
  const t = e.target, hc = t.dataset.hc; if (!hc) return;
  const id = primary();
  if (onSettingChange(t, hc)) return;
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
const zonesAcross = (n, g) => Array.from({ length: n }, (_, k) => { const w = (g.len - 1 - (n - 1) * 0.6) / n, x0 = 0.5 + k * (w + 0.6); return zoneAt(x0, x0 + w, 0.8, g.dep - 0.8, ZC[k % 4], '', g); });
const TEMPLATES = [
  { id: 'leer', name: '', label: 'Leere Halle', make: () => ({}) },
  { id: 'z2', name: 'Zwei Bereiche', label: 'Zwei Bereiche', make: g => ({ items: zonesAcross(2, g) }) },
  { id: 'z3', name: 'Drei Bereiche', label: 'Drei Bereiche', make: g => ({ items: zonesAcross(3, g) }) },
  { id: 'klein4', name: 'Vier Kleinfelder', label: 'Vier Kleinfelder (mit Kleintoren)', make: g => { const z = zonesAcross(4, g), w = (g.len - 1 - 3 * 0.6) / 4;
    return { items: [...z, ...z.flatMap((_, k) => { const cx = 0.5 + k * (w + 0.6) + w / 2; return [gearAt('kleintor', 'frontal', cx, g.dep - 0.8, { ay: 0.8, g }), gearAt('kleintor', 'hinten', cx, 0.8, { ay: 0.97, g })]; })] }; } },
  // seit 2.14.0 über die Schalter Körbe, Tore und Netz (eingeblendet, nicht verschiebbar; zum Verschieben das Gerät aus der Leiste setzen)
  { id: 'badminton', name: 'Badminton', label: 'Badminton (Felder mit Netz)', make: () => ({ lines: ['badminton', 'netz'] }) },
  { id: 'volleyball', name: 'Volleyball', label: 'Volleyball (Feld mit Netz)', make: () => ({ lines: ['volleyball', 'netz'] }) },
  { id: 'basketball', name: 'Basketball', label: 'Basketball (Feld mit Körben)', make: () => ({ lines: ['basketball', 'koerbe'] }) },
  { id: 'handball', name: 'Handball', label: 'Handball (Feld mit Toren)', make: () => ({ lines: ['handball', 'tore'] }) },
  { id: 'fussball', name: 'Hallenfußball', label: 'Hallenfußball (Feld mit Toren)', make: () => ({ lines: ['fussball', 'tore'] }) },
];
// Lehrkraft vorn an der Mittellinie (Nutzerentscheidung 14.11.2026: in jedem Plan, ohne Text, Größe 0,6)
const teacherItem = g => itemAt('teacher', g.len / 2, 0.6, { size: FIGURE, g });
// ---------- Themen (seit 2.1.0): eigene Liste in sport.hallTopics, Auswahl statt freier Eingabe ----------
export const topics = () => sp().hallTopics || [];
const NEW_TOPIC = '__neu__';
const sameTopic = (a, b) => a.toLocaleLowerCase('de') === b.toLocaleLowerCase('de');
// Vorhandene Schreibweise übernehmen („fußball“ → „Fußball“)
export const topicName = t => { const v = String(t || '').trim().slice(0, 60); return v ? topics().find(x => sameTopic(x, v)) || v : ''; };
// Thema in die Liste aufnehmen (nur innerhalb von store.update)
export function addTopic(s, t) { if (t && !s.sport.hallTopics.some(x => sameTopic(x, t)) && s.sport.hallTopics.length < store.TOPIC_MAX) s.sport.hallTopics.push(t); }
const topicField = (cur = '', hint = '') => `<label class="field">Thema${hint ? ` <small class="muted">${hint}</small>` : ''}<select name="topic" class="select" data-topic-sel>
    <option value="">Ohne Thema</option>${[...new Set([...topics(), ...(cur ? [cur] : [])])].map(t => `<option value="${esc(t)}" ${t === cur ? 'selected' : ''}>${esc(t)}</option>`).join('')}
    <option value="${NEW_TOPIC}">+ Neues Thema …</option></select></label>
  <label class="field" data-topic-new hidden>Neues Thema<input name="newTopic" class="input" maxlength="60" placeholder="z. B. Badminton"></label>`;
const topicOpen = el => {
  const sel = el.querySelector('[data-topic-sel]'), box = el.querySelector('[data-topic-new]'); if (!sel) return;
  sel.onchange = () => { box.hidden = sel.value !== NEW_TOPIC; if (!box.hidden) box.querySelector('input').focus(); };
};
const readTopic = fd => {
  const v = String(fd.get('topic') || '');
  if (v !== NEW_TOPIC) return topicName(v);
  const n = topicName(fd.get('newTopic')); if (!n) throw new Error('Bitte einen Namen für das neue Thema eingeben.');
  return n;
};
const lessons = () => [...new Set(sp().halls.map(h => h.lesson).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
const datalist = (id, list) => `<datalist id="${id}">${list.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
const checkLimit = (n = 1) => { if (sp().halls.filter(h => !h.demo).length + n > store.HALL_MAX) throw new Error(`Es sind höchstens ${store.HALL_MAX} Hallenpläne möglich. Bitte zuerst alte Pläne löschen.`); };

// Halle für einen neuen Plan: die Standardhalle der gewählten Lerngruppe, sonst die Halle des geöffneten Plans
export function defaultGym() {
  const lg = groups.active(), own = lg && groups.sportView(lg).gym;
  return gymById(own)?.id || gymOf(plan())?.id || '';
}
const gymOptions = cur => `<option value="" ${cur ? '' : 'selected'}>${esc(gymLabel(null))}</option>${gyms().map(g => `<option value="${esc(g.id)}" ${g.id === cur ? 'selected' : ''}>${esc(gymLabel(g))}</option>`).join('')}`;
// Plan nach einer Voreinstellung in einer Halle (ohne Geräte, die dort fest stehen) – für „Anlegen“ und die Vorschau
function planFromTemplate(tplId, gy) {
  const g = geo(gy), tpl = (TEMPLATES.find(x => x.id === tplId) || TEMPLATES[0]).make(g);
  const fixed = new Set((gy?.items || []).filter(i => i.kind === 'gear').map(i => i.gear));
  return { floor: 'halle', v: 3, lines: tpl.lines || [], items: [...(tpl.items || []).filter(i => i.kind !== 'gear' || !fixed.has(i.gear)), teacherItem(g)], ...(gy ? { gym: gy.id } : {}) };
}
// Neuer Hallenplan (seit 2.15.0): Voreinstellungen als Bildkacheln mit Vorschau in der gewählten Halle; Name wird vorgeschlagen
export function newPlanDialog(topic = '', lesson = '') {
  const cur = defaultGym(), lg = groups.active();
  let tplId = 'leer';
  const tiles = gy => TEMPLATES.map(t => `<button type="button" class="h-tpl ${t.id === tplId ? 'on' : ''}" data-tpl="${t.id}" aria-pressed="${t.id === tplId}" title="${esc(t.label)}">
      <span class="h-tpl-img">${boardSvg({ id: 'vorschau', title: t.label, ...planFromTemplate(t.id, gy) })}</span><span class="h-tpl-l">${esc(t.name || t.label)}</span></button>`).join('');
  const isDef = id => lg && (gymById(groups.sportView(lg).gym)?.id || '') === id;
  dialog({ title: 'Neuer Hallenplan', submit: 'Anlegen', wide: true, body: `
    ${lesson ? `<p class="small-text">Stunde: <b>${esc(lesson)}</b> – wird dort als nächste Phase angelegt.</p>` : ''}
    <fieldset class="field h-dsec"><legend>Womit beginnen?</legend><div class="h-tpls" data-tpls>${tiles(gymById(cur))}</div></fieldset>
    <div class="two"><label class="field">Name<input name="t" class="input" maxlength="80" placeholder="z. B. Passen in Gassen" required></label>
    ${topicField(topic, '– ordnet die Sammlung')}</div>
    <label class="field">Halle <small class="muted">${lg ? `– vorausgewählt: Standardhalle von „${esc(lg.name)}“` : ''}</small><select name="gym" class="select">${[['', gymLabel(null)], ...gyms().map(g => [g.id, gymLabel(g)])].map(([id, l]) => `<option value="${esc(id)}" ${id === cur ? 'selected' : ''}>${esc(l)}${isDef(id) ? ' ★' : ''}</option>`).join('')}</select></label>
    <p class="muted small-text">Fläche und Linien passen sich der Halle an, ihre feste Einrichtung ist schon da. Die Lehrkraft steht vorn an der Mittellinie. Alles lässt sich danach ändern.</p>`,
    onOpen: d => {
      topicOpen(d);
      const name = d.querySelector('[name=t]'), box = d.querySelector('[data-tpls]'), gsel = d.querySelector('[name=gym]');
      let auto = '';   // zuletzt vorgeschlagener Name – wird ersetzt, solange er nicht geändert wurde
      const suggest = () => { const t = TEMPLATES.find(x => x.id === tplId), v = t.name || ''; if (!name.value.trim() || name.value === auto) { name.value = v; auto = v; } };
      box.onclick = e => { const b = e.target.closest('[data-tpl]'); if (!b) return; tplId = b.dataset.tpl;
        box.querySelectorAll('[data-tpl]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); suggest(); };
      gsel.onchange = () => { box.innerHTML = tiles(gymById(gsel.value)); hydrateSvg(box); };
      hydrateSvg(box);
    },
    onSubmit: fd => {
      const t = String(fd.get('t')).trim(); if (!t) throw new Error('Bitte einen Namen eingeben.');
      checkLimit();
      const gy = gymById(String(fd.get('gym') || ''));
      const p = { id: uid(), title: t.slice(0, 80), topic: readTopic(fd), lesson, phase: lesson ? nextPhase(lesson) : 0, ...planFromTemplate(tplId, gy) };
      sel = []; baseEdit = null; store.update(s => { addTopic(s, p.topic); s.sport.halls.push(p); s.sport.activeHall = p.id; });
    } });
}

// Geöffneten Plan in eine andere Halle legen ('' = Standardhalle); die Elemente passen sich der neuen Fläche an
export function setPlanGym(id) {
  const p = plan(); if (!p || p.base || (p.gym || '') === (id || '')) return;
  const to = gymById(id), a = G(p), b = geo(to);
  sel = [];
  commit(x => { x.items = refitItems(x.items, a, b); if (to) x.gym = to.id; else delete x.gym; });
  toast(`„${p.title}“ liegt jetzt in ${to ? `„${to.name}“` : 'der Standardhalle'} (${gymSize(to)}).`);
}
// Standardhalle einer Lerngruppe ('' = keine eigene Halle)
export function setGroupGym(lgId, id) { store.update(s => { const k = groups.sportPart(s, lgId); if (!k) return; if (id) k.gym = id; else delete k.gym; }); }

// Halle anlegen oder ändern: Name, Maße, Lerngruppen (Standardhalle); bei einer neuen Halle optional den geöffneten Plan hineinlegen
// Seit 2.11.0: Eine neue Halle entsteht aus einer Vorlage (leer, Einfeld-, Zweifeld-, Dreifeldhalle) mit fertiger Einrichtung
// an den Wänden; Name und Maße sind frei, die Einrichtung ist danach wie jedes feste Gerät bearbeitbar.
const freeName = base => { let n = base, k = 2; while (gyms().some(g => g.name.toLocaleLowerCase('de') === n.toLocaleLowerCase('de'))) n = `${base} ${k++}`; return n.slice(0, 40); };
export function gymDialog(gym = null, o = {}) {
  const lgs = groups.list(), active = groups.active(), p = plan() && !plan().base ? plan() : null;
  const isOf = lg => (gym ? groups.sportView(lg).gym === gym.id : lg.id === active?.id && !gymById(groups.sportView(lg).gym));
  const n = gym ? sp().halls.filter(x => x.gym === gym.id).length : 0;
  const tpl0 = gym ? null : GYM_TEMPLATES.find(t => t.id === (o.template || 'einfeld'));
  dialog({ title: gym ? `Halle „${gym.name}“` : o.fromStd ? 'Standardhalle als eigene Halle anlegen' : 'Neue Halle', submit: gym ? 'Speichern' : 'Anlegen', wide: true, body: `
    ${o.fromStd ? '<p class="small-text muted">Die Standardhalle (27 × 15 m) bleibt als Schema erhalten. Als eigene Halle kannst du sie benennen, die Maße ändern und Türen, Tore und Körbe dort einzeichnen, wo sie wirklich sind.</p>' : ''}
    ${gym ? '' : `<fieldset class="field h-dsec gym-tpl"><legend>1 · Vorlage <small class="muted">fertig eingerichtet, danach frei bearbeitbar</small></legend>
      <div class="seg" role="group" aria-label="Vorlage">${GYM_TEMPLATES.map(t => `<button type="button" data-tpl="${t.id}" class="${t === tpl0 ? 'on' : ''}" aria-pressed="${t === tpl0}">${esc(t.label)} <small>${t.fields ? `${t.len} × ${t.dep} m` : 'eigene Maße'}</small></button>`).join('')}</div>
      <input type="hidden" name="tpl" value="${tpl0.id}">
      <label class="check" data-equip ${tpl0.fields ? '' : 'hidden'}><input type="checkbox" name="equip" checked> <span>Einrichtung übernehmen <small class="muted">Türen, Geräteraumtore, Tore, Körbe, Sprossenwände, Seilanlage, Matten; bei mehreren Hallenteilen Trennvorhänge</small></span></label></fieldset>`}
    <fieldset class="field h-dsec"><legend>${gym ? '' : '2 · '}Name und Maße</legend>
    <label class="field">Name<input name="name" class="input" maxlength="40" value="${esc(gym?.name || (tpl0.fields ? freeName(tpl0.label) : ''))}" placeholder="z. B. Dreifeldhalle Schulzentrum" required></label>
    <div class="two"><label class="field">Länge in m <small class="muted">(von links nach rechts)</small><input name="len" type="number" class="input" min="${GYM_LEN[0]}" max="${GYM_LEN[1]}" step="0.5" value="${gym?.len ?? tpl0.len}" required></label>
    <label class="field">Breite in m <small class="muted">(von vorn nach hinten)</small><input name="dep" type="number" class="input" min="${GYM_DEP[0]}" max="${GYM_DEP[1]}" step="0.5" value="${gym?.dep ?? tpl0.dep}" required></label></div>
    ${gym && n ? `<p class="small-text muted">${n} ${n === 1 ? 'Plan liegt' : 'Pläne liegen'} in dieser Halle. Bei neuen Maßen passen sich Bereiche und Elemente an, Geräte bleiben maßstäblich.</p>` : ''}</fieldset>
    ${lgs.length ? `<fieldset class="field h-dsec gym-groups"><legend>${gym ? '' : '3 · '}Standardhalle für <small class="muted">neue Pläne dieser Lerngruppen entstehen hier</small></legend>
      ${lgs.map(lg => `<label class="check"><input type="checkbox" name="lg" value="${esc(lg.id)}" ${isOf(lg) ? 'checked' : ''}> <span>${esc(lg.name)} <small class="muted">${esc(lg.subject)}${!isOf(lg) && gymById(groups.sportView(lg).gym) ? ' · jetzt: ' + esc(gymById(groups.sportView(lg).gym).name) : ''}</small></span></label>`).join('')}</fieldset>` : ''}
    ${!gym && p ? `<label class="check"><input type="checkbox" name="move" ${o.fromStd || !p.gym ? 'checked' : ''}> <span>Den geöffneten Plan „${esc(p.title)}“ in diese Halle legen</span></label>` : ''}
    ${gym ? `<fieldset class="field h-dsec"><legend>Einrichtung</legend>
        <p class="small-text muted">Türen, Tore, Körbe, Sprossenwände, Seile und Matten an den Wänden – sie stehen in jedem Plan dieser Halle.</p>
        <button type="button" class="btn ghost" data-gym-base>${icon('edit', 15)} Einrichtung bearbeiten</button></fieldset>
      <fieldset class="field h-dsec"><legend>Weitere Aktionen</legend><p class="gym-actions"><button type="button" class="btn ghost sm" data-gym-copy title="Kopie mit gleichen Maßen und gleicher Einrichtung anlegen, z. B. für eine ähnliche Halle">${icon('layers', 15)} Halle kopieren</button> <button type="button" class="btn ghost sm danger" data-gym-del>${icon('trash', 15)} Halle löschen</button></p></fieldset>`
      : `<p class="muted small-text">Nach „Anlegen“ siehst du die Einrichtung und passt sie an: verschieben, löschen oder aus der Leiste ergänzen. Maße und Lage der Türen vor Ort prüfen.</p>`}`,
    onOpen: (el, close) => {
      // Vorlage wählen: Maße setzen, Namen vorschlagen (solange er noch aus einer Vorlage stammt)
      const nameIn = el.querySelector('[name=name]'), auto = () => !nameIn.value.trim() || GYM_TEMPLATES.some(t => nameIn.value.trim().replace(/ \d+$/, '') === t.label);
      el.querySelectorAll('[data-tpl]').forEach(b => b.onclick = () => {
        const t = GYM_TEMPLATES.find(x => x.id === b.dataset.tpl); if (!t) return;
        el.querySelectorAll('[data-tpl]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
        el.querySelector('[name=tpl]').value = t.id; el.querySelector('[name=len]').value = t.len; el.querySelector('[name=dep]').value = t.dep;
        el.querySelector('[data-equip]').hidden = !t.fields;
        if (auto()) nameIn.value = t.fields ? freeName(t.label) : '';
      });
      el.querySelector('[data-gym-copy]')?.addEventListener('click', () => { close(); copyGym(gym); });
      el.querySelector('[data-gym-base]')?.addEventListener('click', () => { close(); editGym(gym.id); });
      el.querySelector('[data-gym-del]')?.addEventListener('click', () => { close(); deleteGym(gym); });
    },
    onSubmit: fd => {
      const name = String(fd.get('name') || '').trim().slice(0, 40); if (!name) throw new Error('Bitte einen Namen eingeben.');
      const len = Number(fd.get('len')), dep = Number(fd.get('dep'));
      if (!(len >= GYM_LEN[0] && len <= GYM_LEN[1])) throw new Error(`Die Länge muss zwischen ${GYM_LEN[0]} und ${GYM_LEN[1]} m liegen.`);
      if (!(dep >= GYM_DEP[0] && dep <= GYM_DEP[1])) throw new Error(`Die Breite muss zwischen ${GYM_DEP[0]} und ${GYM_DEP[1]} m liegen.`);
      if (gyms().some(x => x.id !== gym?.id && x.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))) throw new Error(`Eine Halle „${name}“ gibt es schon.`);
      if (!gym && gyms().length >= store.GYM_MAX) throw new Error(`Es sind höchstens ${store.GYM_MAX} Hallen möglich.`);
      const g2 = geo({ len, dep }), chosen = new Set(fd.getAll('lg').map(String)), id = gym?.id || uid();
      store.update(s => {
        if (!gym) s.sport.gyms.push({ id, name, len: g2.len, dep: g2.dep, items: fd.get('equip') === 'on' ? gymTemplateItems(String(fd.get('tpl')), g2.len, g2.dep) : [] });
        else {
          const x = s.sport.gyms.find(y => y.id === id), a = geo(x);
          x.name = name;
          if (a.key !== g2.key) {   // neue Maße: feste Geräte und alle Pläne dieser Halle anpassen
            x.items = refitItems(x.items, a, g2); x.len = g2.len; x.dep = g2.dep;
            s.sport.halls.forEach(h => { if (h.gym === id) { h.items = refitItems(h.items, a, g2); history.delete(h.id); } });
            history.delete('gym:' + id);
          }
        }
        for (const lg of lgs) {
          const has = groups.sportView(lg).gym === id;
          if (chosen.has(lg.id) && !has) groups.sportPart(s, lg.id).gym = id;
          else if (!chosen.has(lg.id) && has) delete groups.sportPart(s, lg.id).gym;
        }
      });
      if (gym) return toast(`Halle „${name}“ gespeichert.`);
      if (fd.get('move') === 'on') setPlanGym(id);
      editGym(id);
      toast(fd.get('equip') === 'on' ? `Halle „${name}“ angelegt – Einrichtung anpassen (verschieben, löschen, ergänzen). „Fertig“ führt zurück zum Plan.` : `Halle „${name}“ angelegt – jetzt Tore, Körbe und Türen einzeichnen. „Fertig“ führt zurück zum Plan.`);
    } });
}
// Halle kopieren (seit 2.11.0): gleiche Maße und Einrichtung unter neuem Namen, danach gleich die Einrichtung bearbeiten
function copyGym(gym) {
  if (gyms().length >= store.GYM_MAX) return toast(`Es sind höchstens ${store.GYM_MAX} Hallen möglich.`, { kind: 'warn' });
  const id = uid(), name = freeName(`${gym.name.slice(0, 33)} (Kopie)`);
  store.update(s => { s.sport.gyms.push({ id, name, len: gym.len, dep: gym.dep, items: gym.items.map(i => ({ ...structuredClone(i), id: uid() })) }); });
  editGym(id);
  toast(`„${name}“ angelegt – Name und Maße über „Name, Maße, Lerngruppen“ ändern.`);
}
// Halle löschen: Ihre Pläne kommen in die Standardhalle und behalten die festen Geräte als eigene Elemente
async function deleteGym(gym) {
  const n = sp().halls.filter(x => x.gym === gym.id).length;
  if (!(await confirmDialog('Halle löschen', `„${gym.name}“ löschen?${n ? ` ${n === 1 ? 'Der Plan in dieser Halle kommt' : `Die ${n} Pläne in dieser Halle kommen`} in die Standardhalle; die festen Geräte werden dabei in ${n === 1 ? 'den Plan' : 'die Pläne'} übernommen.` : ''}`, 'Löschen'))) return;
  if (baseEdit === gym.id) baseEdit = null;
  sel = [];
  store.update(s => {
    const a = geo(gym);
    s.sport.halls.forEach(h => { if (h.gym !== gym.id) return; h.items = refitItems([...gym.items.map(i => ({ ...structuredClone(i), id: uid() })), ...h.items], a, STD); delete h.gym; history.delete(h.id); });
    s.sport.groups.forEach(x => { if (x.gym === gym.id) delete x.gym; });
    s.sport.gyms = s.sport.gyms.filter(x => x.id !== gym.id);
  });
  history.delete('gym:' + gym.id);
  toast(`Halle „${gym.name}“ gelöscht.`);
}

// Spielregeln dieses Plans (seit 2.2.0): eine Regel je Zeile, gedruckt auf Seite 2 der Schüleransicht
function rulesEditDialog(p) {
  const r = p.rules;
  dialog({ title: 'Spielregeln', submit: 'Speichern', body: `
    <label class="field">Überschrift<input name="title" class="input" maxlength="60" value="${esc(r?.title || p.topic || '')}" placeholder="z. B. Völkerball"></label>
    <label class="field">Regeln <small class="muted">(eine je Zeile, höchstens ${RULES_MAX}, kurz halten)</small><textarea name="items" class="input" rows="8" maxlength="${RULES_MAX * 210}" placeholder="Treffer: direkt, ohne Boden.\nKopf zählt nicht.\nGetroffen? Über den Randweg nach außen.">${esc((r?.items || []).join('\n'))}</textarea></label>
    <label class="check"><input type="checkbox" name="print" ${r?.print === false ? '' : 'checked'}> Beim Drucken der Schüleransicht auf Seite 2 mitdrucken</label>
    <label class="check"><input type="checkbox" name="show" ${showRules ? 'checked' : ''}> <span>In der App unter der Halle zeigen <small class="muted">auch in der großen Ansicht; gilt auf diesem Gerät für alle Pläne mit Regeln</small></span></label>
    <p class="muted small-text">Seite 1 bleibt der Hallenplan in voller Größe; die Regeln stehen auf Seite 2 – beidseitig gedruckt also auf der Rückseite. Leeres Feld = keine Regeln.</p>`,
    onSubmit: fd => {
      const rules = normRules({ title: fd.get('title'), items: String(fd.get('items') || '').split(/\r?\n/).map(x => x.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '')), print: fd.get('print') === 'on' });
      showRules = fd.get('show') === 'on'; setPref('hallRulesShow', showRules ? '1' : '0');
      commit(x => { if (rules) x.rules = rules; else delete x.rules; });
      toast(rules ? `${rules.items.length} ${rules.items.length === 1 ? 'Regel' : 'Regeln'} gespeichert${rules.print ? ' – sie stehen beim Drucken auf Seite 2' : ''}.` : 'Keine Spielregeln mehr bei diesem Plan.');
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
// Hallenpläne importieren: gemeinsamer Dialog (js/importer.js); applyPlans übernimmt die geprüften Pläne (Format: hallplan.js).
// Nichts wird überschrieben, außer replace ist gesetzt. topic gilt für Pläne ohne Thema in der Datei.
export const importPlansDialog = () => hooks.importDialog?.();
export function applyPlans(plans, { replace = false, topic = '' } = {}) {
  plans.forEach(p => { p.topic = topicName(p.topic || topic); });
  // Hallen aus der Datei (seit 2.10.0): gleiche Halle (Name und Maße) wird wiederverwendet, sonst neu angelegt
  const newGyms = [];
  plans.forEach(p => {
    const d = p.gymDef; delete p.gymDef; if (!d) return;
    const same = x => x.name.toLocaleLowerCase('de') === d.name.toLocaleLowerCase('de') && x.len === d.len && x.dep === d.dep;
    let g = gyms().find(same) || newGyms.find(same);
    if (!g && gyms().length + newGyms.length < store.GYM_MAX) { g = { id: uid(), name: d.name, len: d.len, dep: d.dep, items: d.items }; newGyms.push(g); }
    if (g) p.gym = g.id; else p.items = refitItems(p.items, geo(d), STD);
  });
  if (newGyms.length) store.update(s => { s.sport.gyms.push(...newGyms); }, { silent: true });
  const names = new Set(sp().halls.map(x => x.title));
  checkLimit(replace ? plans.filter(p => !names.has(p.title)).length : plans.length);
  let replaced = 0;
  sel = [];
  store.update(s => {
    const titles = new Set(s.sport.halls.map(x => x.title));
    plans.forEach(p => addTopic(s, p.topic));   // Themen aus der Datei kommen in die Themenliste
    for (const p of plans) {
      const k = replace ? s.sport.halls.findIndex(x => x.title === p.title) : -1;
      if (k >= 0) { const old = s.sport.halls[k]; p.id = old.id; if (!p.topic) p.topic = old.topic; if (!p.lesson && old.lesson) { p.lesson = old.lesson; p.phase = old.phase; } history.delete(p.id); s.sport.halls[k] = p; replaced++; continue; }
      const base = p.title; let n = 2; while (titles.has(p.title)) p.title = `${base.slice(0, 74)} (${n++})`;
      titles.add(p.title); s.sport.halls.push(p);
    }
    s.sport.activeHall = plans[0].id;
  });
  return replaced;
}
export const topicList = () => topics();

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
  const usedIds = new Set([...sp().halls, ...gyms()].flatMap(p => p.items.map(i => i.img).filter(Boolean)));
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

// Details-Zustand der Bildgruppen merken (bleibt beim Neuzeichnen offen); „Planung“ ist offen, solange nicht zugeklappt
document.addEventListener('toggle', e => { const d = e.target; if (d?.dataset?.cat === undefined || !d.closest?.('.hall-palette')) return;
  if (d.dataset.cat === 'plan') return d.open ? libOpen.delete('plan-closed') : libOpen.add('plan-closed');
  d.open ? libOpen.add(d.dataset.cat) : libOpen.delete(d.dataset.cat); }, true);
// Menüs „⋯“ schließen, wenn daneben geklickt oder Esc gedrückt wird; nur eines zugleich offen
document.addEventListener('click', e => { document.querySelectorAll('details.h-menu[open]').forEach(d => { if (!d.contains(e.target)) d.removeAttribute('open'); }); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('details.h-menu[open]').forEach(d => d.removeAttribute('open')); });

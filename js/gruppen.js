// Bereich Gruppen (seit 2.0.0): eine Lerngruppe in zwei Ansichten – Sitzordnung (Raum, Tische, Organisationsformen)
// und Teams (Sport). Beide nutzen dieselben Kinder und dieselbe Anwesenheit (js/groups.js).
import * as store from './store.js';
import * as groups from './groups.js';
import { mixGroups, minimumTables, uid, swapMembers, TABLE_LAYOUTS } from './engine.js';
import { enableDrag } from './drag.js';
import { esc, icon, toast, palStyle, toggleFullscreen, rulesDialog, confirmDialog } from './ui.js';
import { tournamentDialog } from './turniere.js';
import * as rooms from './room.js';

const LAYOUTS = [
  { id: 'omnibus', name: 'Omnibus', hint: 'Zweiertische in Reihen' },
  { id: 'gruppen', name: 'Gruppentische', hint: 'Gemeinsam an Tischinseln' },
  { id: 'sitzkreis', name: 'Sitzkreis', hint: 'Stühle im Kreis' },
  { id: 'stehkreis', name: 'Stehkreis', hint: 'Stehplätze im Kreis' },
  { id: 'uform', name: 'U-Form', hint: 'Blick zur offenen Mitte' },
  { id: 'arena', name: 'Arena / Kino', hint: 'Sitzreihen ohne Tische' },
  { id: 'raum', name: 'Eigener Raum', hint: 'Mit dem Raumplaner: Tür, Fenster, Tafel, Pult, Tische und Werkbänke wie im echten Raum' },
];
const LAYOUT_PICS = {
  omnibus: '<rect x="4" y="5" width="7" height="3" rx="1"/><rect x="13" y="5" width="7" height="3" rx="1"/><rect x="4" y="11" width="7" height="3" rx="1"/><rect x="13" y="11" width="7" height="3" rx="1"/><rect x="4" y="17" width="7" height="3" rx="1"/><rect x="13" y="17" width="7" height="3" rx="1"/>',
  gruppen: '<rect x="3" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="4" width="8" height="7" rx="1.5"/><rect x="3" y="14" width="8" height="7" rx="1.5"/><rect x="13" y="14" width="8" height="7" rx="1.5"/>',
  sitzkreis: '<circle cx="12" cy="4" r="1.6"/><circle cx="18.5" cy="7.5" r="1.6"/><circle cx="18.5" cy="16.5" r="1.6"/><circle cx="12" cy="20" r="1.6"/><circle cx="5.5" cy="16.5" r="1.6"/><circle cx="5.5" cy="7.5" r="1.6"/>',
  stehkreis: '<circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/><circle cx="12" cy="4" r="1.3"/><circle cx="20" cy="12" r="1.3"/><circle cx="12" cy="20" r="1.3"/><circle cx="4" cy="12" r="1.3"/>',
  uform: '<path d="M4 4v16h16V4"/><path d="M8 4v12h8V4"/>',
  arena: '<path d="M3 9q9-6 18 0M3 14q9-6 18 0M3 19q9-6 18 0"/>',
  raum: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M7 5.5h10"/><rect x="6" y="10" width="5" height="3"/><rect x="13" y="10" width="5" height="3"/><rect x="6" y="15.5" width="5" height="3"/><path d="M21 15v4M18.5 19a2.5 2.5 0 0 1 2.5-2.5"/>',
};

// Ansicht je Lerngruppe merken: Sport-Gruppen öffnen mit „Teams“, alle anderen mit „Sitzordnung“
const viewOf = groups.viewOf;
let listMode = 'plan', search = '', root = null, problem = '';
const viewFor = g => viewOf.get(g.id) || (g.subject === 'Sport' ? 'teams' : 'sitz');
// Sitzordnung (seit 2.6.0) in zwei Fassungen: „std“ = Standardsitzplan (wer normalerweise wo sitzt, fest gespeichert),
// „mix“ = gemischte Gruppen wie bisher. Gibt es einen Standardsitzplan, öffnet die Sitzordnung damit.
const modeOf = new Map();
const modeFor = g => modeOf.get(g.id) || (groups.seatView(g).standard ? 'std' : 'mix');
// Blick von der Tafel (Lehrkraft) statt von hinten – gilt je Gerät
const FLIP_KEY = 'klassenkompass.seatFlip';
let flip = (() => { try { return localStorage.getItem(FLIP_KEY) === '1'; } catch { return false; } })();
// Aufruf von außen (alte Adresse #/sport): Teams zeigen
export function showTeams() { const g = groups.active(); if (g) viewOf.set(g.id, 'teams'); }

export function mount(el) {
  root = el;
  const render = () => draw();
  const off = store.subscribe(render);
  el.onclick = onClick;
  el.onchange = onChange;
  el.oninput = e => { if (e.target.id === 'lg-search') { search = e.target.value; drawPeople(); } };
  const onResize = () => fitRoom();
  addEventListener('resize', onResize);
  // Kind auf ein anderes ziehen: Die beiden tauschen ihre Plätze (Teams, Sitzplan, Gruppenliste)
  const offDrag = enableDrag(el, { item: '[data-pid]', target: '[data-pid],[data-seat],[data-tray]', onDrop: (a, b) => drop(a, b) });
  const offRoom = rooms.attach(el, () => draw());
  render();
  return () => { off(); offDrag(); offRoom(); removeEventListener('resize', onResize); el.onclick = el.onchange = el.oninput = null; root = null; };
}

// Einteilung der gezeigten Ansicht aktuell halten (js/groups.js): mischen, wenn noch keine da ist oder die Anzahl
// nicht passt; bei Abwesenheit, neuen und entfernten Kindern nur ausgleichen. Die Änderung zeichnet die Seite neu.
function keepCurrent(g) {
  const teams = viewFor(g) === 'teams';
  if (!teams && modeFor(g) === 'std') { problem = ''; return false; }   // der Standardsitzplan wird nie von selbst gemischt
  const r = teams ? groups.ensureTeams(g) : groups.ensureSeat(g);
  problem = r.error || '';
  if (r.changed === 'balance' && r.moved) toast(`${teams ? 'Teams' : 'Gruppen'} ausgeglichen: ${r.moved === 1 ? 'ein Kind hat' : r.moved + ' Kinder haben'} gewechselt.`);
  return !!r.changed;
}

function draw() {
  if (!root) return;
  if (groups.active() && keepCurrent(groups.active())) return;   // die Änderung hat bereits neu gezeichnet
  const g = groups.active(), v = g ? viewFor(g) : 'sitz', presenting = document.body.classList.contains('presenting');
  root.innerHTML = `
  <section class="page gruppen ${v === 'teams' ? 'sport' : 'technik'}">
    <div class="page-head">
      <div>
        <p class="eyebrow">Gruppen${g ? ' · ' + esc(g.subject) : ''}</p>
        <h1>Gruppen<span class="dot">.</span></h1>
        <p class="sub">${v === 'teams' ? 'Teams mischen – gerecht und schnell.' : 'Ein neuer Platz. Eine neue Perspektive.'}</p>
      </div>
      ${groups.pickerHtml(g)}
    </div>
    ${g ? `
    <div class="tabs-row no-print">
      <div class="tabs" role="tablist" aria-label="Ansicht">
        ${[['sitz', 'technik', 'Sitzordnung'], ['teams', 'users', 'Teams']].map(([id, ic, l]) => `<button role="tab" aria-selected="${v === id}" class="${v === id ? 'on' : ''}" data-act="view" data-v="${id}">${icon(ic, 16)} ${l}</button>`).join('')}
      </div>
      <div class="tools"><button class="btn ghost sm" data-act="print">${icon('print', 16)} Drucken / PDF</button><button class="btn ghost sm" data-act="present">${icon(presenting ? 'shrink' : 'expand', 16)} ${presenting ? 'Ansicht verkleinern' : 'Ansicht vergrößern'}</button></div>
    </div>
    ${v === 'teams' ? teamsHtml(g) : seatHtml(g)}` : groups.emptyHtml()}
  </section>`;
  drawPeople();
  fitRoom();
}

// ---------- Sitzordnung ----------
const nameOf = (c, id) => c.students.find(s => s.id === id)?.name ?? '?';
const autoCols = n => (n <= 6 ? 2 : n <= 15 ? 3 : 4);
const colsOf = (v, tables) => (v >= 2 && v <= 5 ? v : autoCols(tables));

// Standardsitzplan lesen: Plätze als flache Liste (Tisch t = Plätze 2t und 2t + 1), bereinigt um entfernte Kinder
// und Doppelte, aufgefüllt auf die Zahl der Tische. missing = Kinder der Lerngruppe ohne festen Platz.
function stdOf(c) {
  const d = c.standard; if (!d) return null;
  const ids = new Set(c.students.map(p => p.id)), seen = new Set();
  let seats = (Array.isArray(d.seats) ? d.seats : []).map(id => (ids.has(id) && !seen.has(id) && seen.add(id) ? id : null));
  const last = seats.findLastIndex(Boolean), layout = LAYOUTS.some(l => l.id === d.layout) ? d.layout : 'omnibus';
  const tables = Math.min(40, Math.max(1, Math.round(Number(d.tables)) || 1, Math.ceil((last + 1) / 2)));
  seats = seats.slice(0, tables * 2); while (seats.length < tables * 2) seats.push(null);
  // Eigener Raum: Plätze als „Tisch:Nummer“ → Kind; nur Plätze, die es im Raum gibt
  const r = layout === 'raum' ? rooms.byId(d.room) : null, slots = {};
  if (r) { const keys = new Set(rooms.slotKeys(r)), got = new Set(); for (const [k, id] of Object.entries(d.slots || {})) if (keys.has(k) && ids.has(id) && !got.has(id)) { got.add(id); slots[k] = id; } }
  const placed = layout === 'raum' ? new Set(Object.values(slots)) : seen;
  return { layout, room: d.room || null, slots, tables, groups: Math.min(20, Math.max(1, Math.round(Number(d.groups)) || 4)), cols: Number(d.cols) || 0, icols: Number(d.icols) || 0, seats, missing: c.students.filter(p => !placed.has(p.id)) };
}
// Plätze lesen und setzen – im eigenen Raum über „Tisch:Nummer“, sonst über die Platznummer
const isRaum = d => d.layout === 'raum';
const getS = (d, k) => (isRaum(d) ? d.slots[k] || null : d.seats[Number(k)] ?? null);
const setS = (d, k, v) => { if (isRaum(d)) { if (v) d.slots[k] = v; else delete d.slots[k]; } else d.seats[Number(k)] = v; };
const keyOf = (d, pid) => (isRaum(d) ? Object.keys(d.slots).find(k => d.slots[k] === pid) : (i => (i >= 0 ? String(i) : undefined))(d.seats.indexOf(pid)));
// Wechsel zwischen eigenem Raum und den anderen Organisationsformen: die Reihenfolge der Plätze bleibt
function toFlat(d, r) {
  const flat = rooms.slotsToFlat(r, d.slots);
  while (flat.length && !flat[flat.length - 1]) flat.pop();
  if (flat.length % 2) flat.push(null);
  d.tables = Math.min(40, Math.max(1, d.tables, flat.length / 2)); d.seats = flat; while (d.seats.length < d.tables * 2) d.seats.push(null);
}
const icolsOf = (v, n) => (v >= 1 && v <= 6 ? Math.min(v, Math.max(1, n)) : n <= 4 ? 2 : 3);
// Standardsitzplan ändern (immer über die bereinigte Fassung)
function updStd(g, fn) {
  store.update(s => { const p = groups.seatPart(s, g.id), d = stdOf(p); if (!d) return; fn(d); const { missing, ...keep } = d; p.standard = { ...keep, savedAt: new Date().toISOString() }; });
}
// Kinder ohne Platz auf die ersten freien Plätze setzen; reichen sie nicht, kommen Tische dazu
function seatMissing(d, people) {
  if (isRaum(d)) {
    const r = rooms.byId(d.room), keys = r ? rooms.slotKeys(r) : []; let n = 0;
    for (const p of people) { const k = keys.find(x => !d.slots[x]); if (k) d.slots[k] = p.id; else n++; }
    if (n) toast(`${n === 1 ? '1 Kind hat' : n + ' Kinder haben'} keinen Platz – im Raumplaner Tische ergänzen.`, { kind: 'warn' });
    return;
  }
  for (const p of people) { let k = d.seats.indexOf(null); if (k < 0) { k = d.seats.length; d.seats.push(null, null); d.tables++; } d.seats[k] = p.id; }
}

// Raum aus dem Standardsitzplan bzw. aus den gemischten Gruppen: Tische mit je zwei Plätzen { id, g, k }.
// g = Gruppe (Farbe), −1 = ohne Farbe; k = Platznummer im Standardsitzplan (nur dort; freie Plätze sind dann Ziele).
function tablesOf(c, d) {
  if (d) return Array.from({ length: d.tables }, (_, t) => ({ g: -1, no: t + 1, seats: [{ id: d.seats[2 * t], g: -1, k: 2 * t }, { id: d.seats[2 * t + 1], g: -1, k: 2 * t + 1 }] }));
  const tables = [];
  c.plan.groups.forEach((g, gi) => { for (let i = 0; i < g.length; i += 2) tables.push({ g: gi, seats: [{ id: g[i], g: gi }, { id: g[i + 1] ?? null, g: gi }] }); });
  while (tables.length < c.settings.tables) tables.push({ g: -1, empty: true, seats: [{ id: null, g: -1 }, { id: null, g: -1 }] });
  return tables.map((t, i) => ({ ...t, no: i + 1 }));
}
// Tischinseln: im Standardsitzplan gleich viele Tische je Insel, sonst je Gruppe eine Insel
function islandsOf(c, d) {
  if (!d) return c.plan.groups.map((g, gi) => { const ts = []; for (let i = 0; i < g.length; i += 2) ts.push({ g: gi, seats: [{ id: g[i], g: gi }, { id: g[i + 1] ?? null, g: gi }] }); return { g: gi, title: `Gruppe ${gi + 1}`, n: g.length, tables: ts }; });
  const all = tablesOf(c, d), n = Math.min(d.groups, all.length), per = Math.ceil(all.length / n);
  return Array.from({ length: Math.ceil(all.length / per) }, (_, i) => { const ts = all.slice(i * per, (i + 1) * per).map(t => ({ ...t, g: i, seats: t.seats.map(x => ({ ...x, g: i })) })); return { g: i, title: `Tischgruppe ${i + 1}`, n: ts.flatMap(t => t.seats).filter(x => x.id).length, tables: ts }; });
}
const turn = t => ({ ...t, seats: t.seats.slice().reverse() });   // Tisch von der anderen Seite gesehen

function seatBox(c, x, off) {
  const k = x.k !== undefined ? ` data-seat="${esc(x.k)}"` : '';
  if (!x.id) return `<div class="seat free"${k}><span>${x.k !== undefined ? 'frei' : ''}</span></div>`;
  const name = nameOf(c, x.id), away = off?.has(x.id);
  return `<div class="seat ${away ? 'away' : ''} ${name.length > 11 ? 'xlong' : name.length > 8 ? 'long' : ''}" data-pid="${esc(x.id)}"${k} style="${x.g >= 0 ? palStyle(x.g) : ''}" title="${esc(name)}${away ? ' – fehlt heute' : ''}"><span>${esc(name)}</span>${away ? '<small>fehlt</small>' : ''}</div>`;
}
// Zweiertisch: Tischnummer klein in der Ecke, bei gemischten Gruppen die Gruppenfarbe auf dem ganzen Tisch
const deskHtml = (c, t, off, no = true) => `<div class="table ${t.empty ? 'empty' : t.g >= 0 ? 'grouped' : 'plain'}" style="${t.g >= 0 ? palStyle(t.g) : ''}">${no && t.no ? `<i class="tno">${t.g >= 0 ? `<b class="gtag">G${t.g + 1}</b>` : ''}${t.no}</i>` : ''}<div class="pair">${t.seats.map(x => seatBox(c, x, off)).join('')}</div></div>`;
const legend = c => c.plan.groups.length > 1
  ? `<div class="legend">${c.plan.groups.map((g, gi) => `<span class="legend-item" style="${palStyle(gi)}"><span class="gdot"></span>Gruppe ${gi + 1}<em>${g.length}</em></span>`).join('')}</div>` : '';

// c = Sitzordnung der Lerngruppe, d = Standardsitzplan (oder null für die gemischten Gruppen), off = heute abwesend
function room(c, d, off) {
  const L = d ? d.layout : c.settings.layout, std = !!d;
  if (L === 'raum') {
    const r = rooms.byId(d ? d.room : c.settings.room);
    if (!r) return `<div class="room-empty"><p><b>Noch kein Raum gewählt.</b><br>Rechts einen Raum wählen oder einen neuen anlegen – mit Tür, Fenstern, Tafel, Pult und Tischen.</p><div class="tools"><button class="btn primary" data-act="room-new">${icon('plus', 16)} Neuer Raum</button></div></div>`;
    if (d) return `<div class="room v2 raum std ${flip ? 'flip' : ''}">${rooms.roomHtml(r, { flip, seat: k => seatBox(c, { id: d.slots[k] || null, g: -1, k }, off), itemClass: () => ['plain', ''] })}</div>`;
    // gemischte Gruppen: jede Gruppe an eigenen Tischen, Tisch in der Farbe seiner Gruppe
    const { map, over } = rooms.mixSlots(r, c.plan.groups), tg = new Map();
    for (const [k, v] of map) { const it = k.split(':')[0]; if (!tg.has(it)) tg.set(it, v.g); }
    return `<div class="room v2 raum mix ${flip ? 'flip' : ''}">${legend(c)}${over ? `<p class="notice">Im Raum fehlen ${over} ${over === 1 ? 'Platz' : 'Plätze'} – im Raumplaner Tische ergänzen.</p>` : ''}${rooms.roomHtml(r, { flip,
      seat: k => { const v = map.get(k); return seatBox(c, { id: v?.id ?? null, g: v ? v.g : -1 }, off); },
      itemClass: it => (tg.has(it.id) ? ['grouped', palStyle(tg.get(it.id))] : ['plain', '']) })}</div>`;
  }
  const front = `<div class="front"><span class="board">Tafel</span><div class="desk">Pult</div></div>`, back = `<div class="back">${flip ? 'Hinten (Blick von der Tafel)' : 'Hinten'}</div>`;
  const wrap = (cls, body, style = '') => `<div class="room v2 ${cls} ${std ? 'std' : 'mix'} ${flip ? 'flip' : ''}" style="${style}">${flip ? back + body + front : front + body + back}</div>`;
  if (L === 'omnibus') {
    let tables = tablesOf(c, d); const cols = colsOf(d ? d.cols : c.settings.cols, tables.length);
    if (flip) tables = tables.slice().reverse().map(turn);
    return wrap('omnibus', `${std ? '' : legend(c)}<div class="rows">${tables.map(t => deskHtml(c, t, off)).join('')}</div>`, `--cols:${cols}`);
  }
  if (L === 'gruppen') {
    // Gruppentisch aus zusammengeschobenen Zweiertischen; ein übrig bleibender Tisch steht quer an der Stirnseite
    let isl = islandsOf(c, d);
    if (flip) isl = isl.slice().reverse().map(i => ({ ...i, tables: i.tables.slice().reverse().map(turn) }));
    return wrap('gruppen', `<div class="islands" style="--cols:${icolsOf(d ? d.icols : c.settings.icols, isl.length)}">${isl.map(i => {
      const ts = i.tables.slice(), end = ts.length > 1 && ts.length % 2 ? (flip ? ts.shift() : ts.pop()) : null, half = Math.ceil(ts.length / 2);
      const desk = t => deskHtml(c, t, off, false);
      return `<div class="island" style="${palStyle(i.g)}"><small><b class="gtag">${std ? i.g + 1 : 'G' + (i.g + 1)}</b>${i.title} · ${i.n}</small><div class="cluster${end ? ' has-end' : ''}"><div class="side top">${ts.slice(0, half).map(desk).join('')}</div>${ts.length > half ? `<div class="side bottom">${ts.slice(half).map(desk).join('')}</div>` : ''}${end ? `<div class="end">${desk(end)}</div>` : ''}</div></div>`;
    }).join('')}</div>`);
  }
  if (L === 'uform') {
    const tables = tablesOf(c, d), n = tables.length, side = Math.ceil(n / 3);
    let left = tables.slice(0, side), bottom = tables.slice(side, n - side), right = tables.slice(n - side).reverse();
    if (flip) [left, bottom, right] = [right.slice().reverse().map(turn), bottom.slice().reverse().map(turn), left.slice().reverse().map(turn)];
    const t = x => deskHtml(c, x, off, false);
    return wrap('uform', `${std ? '' : legend(c)}<div class="u"><div class="u-left">${left.map(t).join('')}</div><div class="u-mid">Offene Mitte</div><div class="u-right">${right.map(t).join('')}</div><div class="u-bottom">${bottom.map(t).join('')}</div></div>`);
  }
  const flat = d ? d.seats.map((id, k) => ({ id, g: -1, k })) : c.plan.groups.flatMap((g, gi) => g.map(id => ({ id, g: gi })));
  if (L === 'sitzkreis' || L === 'stehkreis') {
    const ids = flat.filter(x => x.id), n = ids.length || 1, r = 42;
    return `<div class="room v2 circle ${L} ${std ? 'std' : 'mix'}"><div class="ring">${ids.map((x, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (flip ? Math.PI : 0);
      return seatBox(c, x, off).replace('class="seat ', 'class="seat round ').replace('style="', `style="left:${50 + r * Math.cos(a)}%;top:${50 + r * Math.sin(a)}%;`);
    }).join('')}<div class="ring-center">${L === 'sitzkreis' ? 'Sitzkreis' : 'Stehkreis'}${flip ? '<br>Tafel unten' : ''}</div></div></div>`;
  }
  // Arena / Kino: Reihen ohne Tische
  let list = d ? flat.slice(0, Math.max(flat.findLastIndex(x => x.id) + 1, 1)) : flat;
  const per = Math.max(6, Math.ceil(Math.sqrt(list.length * 2.2))); let rows = [];
  for (let i = 0; i < list.length; i += per) rows.push(list.slice(i, i + per));
  if (flip) rows = rows.reverse().map(r => r.slice().reverse());
  return wrap('arena', rows.map(row => `<div class="arena-row" style="--n:${per}">${row.map(x => seatBox(c, x, off)).join('')}</div>`).join(''));
}
const groupList = c => `<div class="group-list">${c.plan.groups.map((g, gi) => `<div class="group-card" style="${palStyle(gi)}"><h4><span class="gdot"></span>Gruppe ${gi + 1} <span class="badge">${g.length}</span></h4><ol>${g.map(id => `<li data-pid="${esc(id)}">${esc(nameOf(c, id))}</li>`).join('')}</ol></div>`).join('')}</div>`;

const stepper = (label, k, val, { min = true, max = true, text = val, disabled = false } = {}) => `<label ${disabled ? 'class="disabled"' : ''}>${label}<span class="stepper"><button data-act="step" data-k="${k}" data-d="-1" data-base="${val}" ${!disabled && min ? '' : 'disabled'}>−</button><output>${text}</output><button data-act="step" data-k="${k}" data-d="1" data-base="${val}" ${!disabled && max ? '' : 'disabled'}>+</button></span></label>`;
const layoutCard = cur => `<div class="card">
        <h3>${icon('sliders', 16)} Organisationsform</h3>
        <div class="layout-grid">${LAYOUTS.map(l => `<button class="layout-opt ${l.id === cur ? 'on' : ''}" data-act="layout" data-id="${l.id}" title="${esc(l.hint)}"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.4">${LAYOUT_PICS[l.id]}</svg><span>${esc(l.name)}</span></button>`).join('')}</div>
      </div>`;

// Raum wählen, bearbeiten oder neu anlegen (Organisationsform „Eigener Raum“)
function roomCard(id) {
  const r = rooms.byId(id), all = rooms.list();
  return `<div class="card">
        <h3>${icon('grid', 16)} Raum</h3>
        ${all.length ? `<select id="room-pick" class="select" aria-label="Raum wählen">${r ? '' : '<option value="">Bitte wählen …</option>'}${all.map(x => `<option value="${esc(x.id)}" ${x.id === id ? 'selected' : ''}>${esc(x.name)} (${rooms.seatCount(x)} Plätze)</option>`).join('')}</select>` : ''}
        <div class="tools room-tools">${r ? `<button class="btn ghost sm" data-act="room-edit">${icon('edit', 15)} Raum bearbeiten</button>` : ''}<button class="btn ghost sm" data-act="room-new">${icon('plus', 15)} Neuer Raum</button></div>
        <p class="muted small-text">Im Raumplaner legst du Tür, Fenster, Tafel, Pult, Schränke, Tische, Werkbänke und Stühle fest. Einen Raum können mehrere Lerngruppen nutzen.</p>
      </div>`;
}
function seatHtml(g) {
  if (rooms.editor.id && rooms.byId(rooms.editor.id)) return `<div class="work-grid">${rooms.editorHtml()}<aside class="side no-print">${rooms.editorSide()}</aside></div>`;
  const c = groups.seatView(g), off = groups.absent(g.id), present = groups.presentCount(g), mode = modeFor(g), d = mode === 'std' ? stdOf(c) : null;
  const L = d ? d.layout : c.settings.layout, layout = LAYOUTS.find(l => l.id === L) || LAYOUTS[0];
  const usesTables = TABLE_LAYOUTS.includes(L), minT = minimumTables(present, c.settings.groups);
  const head = `<div class="seg mode-seg no-print" role="group" aria-label="Fassung der Sitzordnung">
            <button class="${mode === 'std' ? 'on' : ''}" data-act="seat-mode" data-v="std" title="Wer normalerweise wo sitzt">Standardsitzplan</button>
            <button class="${mode === 'mix' ? 'on' : ''}" data-act="seat-mode" data-v="mix" title="Gruppen nach Anwesenheit mischen">Gemischt</button></div>`;
  const flipBtn = `<button class="btn ghost sm" data-act="flip" aria-pressed="${flip}" title="Den Raum von der Tafel aus zeigen (für dich) oder von hinten (für die Klasse)">${icon('repeat', 15)} ${flip ? 'Blick von der Tafel' : 'Blick von hinten'}</button>`;
  const title = `<p class="print-only print-title">${esc(g.name)} · ${mode === 'std' ? 'Standardsitzplan' : esc(layout.name)}${flip ? ' · Blick von der Tafel' : ''} · ${new Date().toLocaleDateString('de-DE')}</p>`;

  // ----- Standardsitzplan -----
  if (mode === 'std') {
    const used = d ? Math.ceil((d.seats.findLastIndex(Boolean) + 1) / 2) : 0, seated = d ? (isRaum(d) ? Object.keys(d.slots).length : d.seats.filter(Boolean).length) : 0;
    const nIsl = d && L === 'gruppen' ? islandsOf(c, d).length : 0, ic = icolsOf(d?.icols, nIsl), rName = L === 'raum' ? rooms.byId(d?.room)?.name : '';
    return `<div class="work-grid">
    <div class="card room-card print-area">
      <div class="card-head">
        <div><p class="eyebrow">Dein Raum · ${esc(rName || layout.name)}</p><h2>Standardsitzplan ${d ? `<span class="badge">${seated} Plätze belegt</span>` : ''}</h2></div>
        <div class="tools no-print">${d ? flipBtn : ''}${head}</div>
      </div>
      ${title}
      ${d ? `${d.missing.length ? `<div class="tray no-print" data-tray><b>${d.missing.length === 1 ? '1 Kind hat' : d.missing.length + ' Kinder haben'} noch keinen festen Platz:</b>${d.missing.map(p => `<span class="chip" data-pid="${esc(p.id)}">${esc(p.name)}</span>`).join('')}<button class="btn ghost sm" data-act="std-seat-missing">Auf freie Plätze setzen</button></div>` : ''}
      <div class="room-wrap">${room(c, d, off)}</div>
      <p class="hint no-print">${icon('check', 14)} Kind auf ein anderes ziehen: Die beiden tauschen. Auf einen freien Platz ziehen: Das Kind zieht um. Wer heute fehlt, ist grau – der Platz bleibt.</p>`
      : `<div class="room-wrap"><div class="room-empty"><p><b>Noch kein Standardsitzplan.</b><br>Hier steht, wer normalerweise wo sitzt – fest gespeichert, unabhängig vom Mischen.</p>
          <div class="tools">${c.plan ? `<button class="btn primary" data-act="std-from-mix">${icon('check', 16)} Jetzige Verteilung übernehmen</button>` : ''}<button class="btn ${c.plan ? 'ghost' : 'primary'}" data-act="std-alpha">Alphabetisch füllen</button></div>
          <p class="muted small-text">Danach ordnest du die Kinder durch Ziehen an ihre Plätze.</p></div></div>`}
    </div>
    <aside class="side no-print">
      ${d && L === 'raum' ? roomCard(d.room) : ''}
      ${d && L !== 'raum' ? `<div class="card">
        <h3>${icon('grid', 16)} Raum</h3>
        <div class="num-row">
          ${stepper('Anzahl Tische', 'tables', d.tables, { min: d.tables > Math.max(1, used), max: d.tables < 40, disabled: !usesTables })}
          ${L === 'omnibus' ? stepper('Tische nebeneinander', 'cols', colsOf(d.cols, d.tables), { min: colsOf(d.cols, d.tables) > 2, max: colsOf(d.cols, d.tables) < 5 }) : ''}
          ${L === 'gruppen' ? stepper('Tischgruppen', 'groups', d.groups, { min: d.groups > 1, max: d.groups < Math.min(20, d.tables) }) + stepper('Tischgruppen nebeneinander', 'icols', ic, { min: ic > 1, max: ic < Math.min(6, nIsl) }) : ''}
        </div>
        <p class="muted small-text">${usesTables ? 'Ein Tisch hat zwei Plätze. Leere Tische am Ende lassen sich wieder entfernen.' : 'Diese Organisationsform braucht keine Tische; die Reihenfolge der Plätze bleibt.'}</p>
      </div>` : ''}
      ${d ? layoutCard(L) : ''}
      ${groups.peopleCardHtml(g, search)}
      ${d ? `<div class="card">
        ${c.plan ? `<button class="btn ghost full" data-act="std-from-mix" title="Ersetzt den Standardsitzplan durch die jetzige gemischte Verteilung">Gemischte Verteilung übernehmen</button>` : ''}
        <button class="btn ghost full danger-text" data-act="std-clear" style="margin-top:8px">${icon('trash', 15)} Standardsitzplan löschen</button>
        <p class="muted small-text center">Alle Änderungen werden automatisch gespeichert.</p>
      </div>` : ''}
    </aside>
  </div>`;
  }

  // ----- Gemischte Gruppen -----
  const cols = colsOf(c.settings.cols, c.settings.tables), nIsl = c.plan?.groups.length || c.settings.groups, ic = icolsOf(c.settings.icols, nIsl);
  return `<div class="work-grid">
    <div class="card room-card print-area">
      <div class="card-head">
        <div><p class="eyebrow">Dein Raum</p><h2>${esc(layout.name)} <span class="badge">${present} anwesend</span></h2></div>
        <div class="tools no-print">
          <button class="btn primary" data-act="mix-seat">${icon('shuffle')} Neu mischen</button>
          ${listMode === 'plan' ? flipBtn : ''}
          <div class="seg" role="group" aria-label="Darstellung">
            <button class="${listMode === 'plan' ? 'on' : ''}" data-act="list-mode" data-v="plan" title="Sitzplan">${icon('grid', 16)}</button>
            <button class="${listMode === 'list' ? 'on' : ''}" data-act="list-mode" data-v="list" title="Gruppenliste">${icon('list', 16)}</button>
          </div>
          ${head}
        </div>
      </div>
      ${title}
      ${problem ? `<p class="notice no-print">${esc(problem)}</p>` : ''}
      <div class="room-wrap">${c.plan ? (listMode === 'plan' ? room(c, null, off) : groupList(c)) : '<div class="room-empty"><p>Noch keine Verteilung.</p></div>'}</div>
      ${c.plan ? `<p class="hint no-print">${icon('check', 14)} Die Farben zeigen die Gruppen. Ziehe ein Kind auf ein anderes, um die beiden zu tauschen.</p>` : ''}
    </div>
    <aside class="side no-print">
      <div class="card">
        <h3>${icon('users', 16)} Gruppen und Tische</h3>
        <div class="num-row">
          ${stepper('Anzahl Gruppen', 'groups', c.settings.groups)}
          ${stepper('Anzahl Tische', 'tables', c.settings.tables, { min: c.settings.tables > minT, disabled: !usesTables })}
          ${L === 'omnibus' ? stepper('Tische nebeneinander', 'cols', cols, { min: cols > 2, max: cols < 5 }) : ''}
          ${L === 'gruppen' ? stepper('Tischgruppen nebeneinander', 'icols', ic, { min: ic > 1, max: ic < Math.min(6, nIsl) }) : ''}
        </div>
        <p class="muted small-text">${L === 'raum' ? `Die Plätze kommen aus dem Raumplaner (${rooms.seatCount(rooms.byId(c.settings.room))} Plätze); jede Gruppe bekommt eigene Tische.` : usesTables ? `Ein Tisch hat zwei Plätze. Für ${present} Anwesende in ${c.settings.groups} Gruppen sind mindestens ${minT} Tische nötig.` : 'Diese Organisationsform braucht keine Tische.'} Die Gruppen werden möglichst gleich groß.</p>
      </div>
      ${L === 'raum' ? roomCard(c.settings.room) : ''}
      ${layoutCard(L)}
      ${groups.peopleCardHtml(g, search)}
      <div class="card">
        <button class="btn ghost full" data-act="rules">${icon('sliders', 16)} Einteilung anpassen</button>
        ${c.plan ? `<button class="btn ghost full" data-act="std-from-mix" style="margin-top:8px" title="Speichert diese Verteilung als festen Sitzplan">${icon('check', 15)} Als Standardsitzplan speichern</button>` : ''}
        <p class="muted small-text center">Alle Einstellungen werden automatisch gespeichert.</p>
      </div>
    </aside>
  </div>`;
}

// Sitzplan auf schmalen Bildschirmen (Handy) verkleinern statt waagerecht scrollen
function fitRoom() {
  const wrap = root?.querySelector('.room-wrap'), r = wrap?.querySelector('.room'); if (!r) return;
  r.style.zoom = '';
  if (document.body.classList.contains('presenting') && innerWidth > 900) return;
  const cs = getComputedStyle(wrap), avail = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  let lo = Infinity, hi = -Infinity;
  r.querySelectorAll('.seat, .desk, .table, .island').forEach(el => { const b = el.getBoundingClientRect(); lo = Math.min(lo, b.left); hi = Math.max(hi, b.right); });
  const need = Math.max(r.scrollWidth, hi - lo + 8);
  if (need > avail + 1) r.style.zoom = String(Math.max(0.5, avail / need));
}

// ---------- Teams ----------
function teamsHtml(g) {
  const k = groups.sportView(g), present = groups.presentCount(g);
  const person = id => g.students.find(p => p.id === id);
  return `<div class="work-grid">
    <div class="main-col print-area"><div class="card">
      <div class="card-head">
        <div><p class="eyebrow">Heute gemeinsam</p><h2>Deine Teams <span class="badge">${present} dabei</span></h2></div>
        <button class="btn primary sport-btn no-print" data-act="mix-teams">${icon('shuffle')} Neu mischen</button>
      </div>
      <p class="print-only print-title">${esc(g.name)} · Teams · ${new Date().toLocaleDateString('de-DE')}</p>
      ${k.teams.length ? `<div class="team-grid">${k.teams.map((t, i) => `<div class="team" style="${palStyle(i)}"><h4><span class="gdot"></span>${esc(t.name)}<span class="count">${t.members.length}</span></h4><ul>${t.members.map(id => { const p = person(id); return p ? `<li data-pid="${esc(id)}">${esc(p.name)}${p.className ? `<small>${esc(p.className)}</small>` : ''}</li>` : ''; }).join('')}</ul></div>`).join('')}</div>`
        : '<div class="room-empty"><p>Noch keine Teams.</p></div>'}
      ${problem ? `<p class="notice no-print">${esc(problem)}</p>` : ''}
      <div class="card-foot no-print"><span class="muted small-text">${icon('check', 14)} Teams sind möglichst gleich groß. Ziehe ein Kind auf ein anderes, um die beiden zu tauschen.</span>
        <button class="btn ghost" data-act="new-tournament" ${k.teams.length >= 2 && !problem ? '' : 'disabled'}>Turnier mit diesen Teams →</button></div>
    </div></div>
    <aside class="side no-print">
      <div class="card">
        <h3>Teams</h3>
        <label class="field inline">Anzahl Teams<select class="select sm" id="team-count">${Array.from({ length: 19 }, (_, i) => i + 2).map(n => `<option ${n === k.teamCount ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <p class="muted small-text">Alle heute anwesenden Kinder werden genau einmal zugeordnet. Ändert sich die Anzahl, wird neu gemischt; fehlt ein Kind, wird nur ausgeglichen.</p>
      </div>
      ${groups.peopleCardHtml(g, search)}
      <div class="card"><button class="btn ghost full" data-act="rules">${icon('sliders', 16)} Einteilung anpassen</button></div>
    </aside>
  </div>`;
}

// Kinderliste neu zeichnen (Suche), mit Gruppenfarbe aus Sitzplan bzw. Teams
function drawPeople() {
  const g = groups.active(), ul = root?.querySelector('#lg-people'); if (!g || !ul) return;
  let color = () => '';
  if (viewFor(g) === 'sitz' && modeFor(g) === 'std') color = () => '';
  else if (viewFor(g) === 'sitz' && g.seat?.plan) { const m = new Map(g.seat.plan.groups.flatMap((gr, i) => gr.map(id => [id, i]))); color = id => (m.has(id) ? palStyle(m.get(id)) : ''); }
  else if (g.sport?.teams.length) { const m = new Map(g.sport.teams.flatMap((t, i) => t.members.map(id => [id, i]))); color = id => (m.has(id) ? palStyle(m.get(id)) : ''); }
  ul.innerHTML = groups.peopleItems(g, search, color);
}

// Ablegen: im Standardsitzplan Plätze tauschen, auf einen freien Platz umziehen, aus der Liste „ohne Platz“ setzen
// oder dorthin zurücklegen; sonst zwei Kinder tauschen
function drop(aEl, bEl) {
  const g = groups.active(); if (!g) return;
  if (viewFor(g) !== 'sitz' || modeFor(g) !== 'std') { if (bEl.dataset.pid) swap(aEl.dataset.pid, bEl.dataset.pid); return; }
  const from = aEl.dataset.seat, to = bEl.dataset.seat, pid = aEl.dataset.pid;
  if (bEl.hasAttribute('data-tray') || (to === undefined && !bEl.closest('.room'))) { if (from !== undefined) updStd(g, d => setS(d, from, null)); return; }
  if (to === undefined) return;
  updStd(g, d => {
    if (from !== undefined) { const a = getS(d, from), b = getS(d, to); setS(d, from, b); setS(d, to, a); }
    else { const old = keyOf(d, pid); if (old !== undefined) setS(d, old, null); setS(d, to, pid); }   // wer dort saß, steht danach bei „ohne Platz“
  });
}
function swap(a, b) {
  const g = groups.active(); if (!g || a === b) return;
  const teams = viewFor(g) === 'teams', view = teams ? groups.sportView(g) : groups.seatView(g);
  const cur = teams ? view.teams.map(t => t.members) : view.plan?.groups; if (!cur) return;
  const r = swapMembers(cur, a, b, view.rules);
  if (r.error) return toast(r.error, { kind: 'warn' });
  store.update(s => {
    if (teams) { const p = groups.sportPart(s, g.id); p.teams = p.teams.map((t, i) => ({ ...t, members: r.groups[i] })); }
    else groups.seatPart(s, g.id).plan.groups = r.groups;
  });
}

// Raum für die gezeigte Fassung wählen; im Standardsitzplan bleibt die Reihenfolge der Plätze erhalten
function useRoom(g, id, mode = modeFor(g)) {
  if (mode === 'std') updStd(g, d => { const old = isRaum(d) ? rooms.slotsToFlat(rooms.byId(d.room), d.slots) : d.seats; d.layout = 'raum'; d.room = id; d.slots = rooms.flatToSlots(rooms.byId(id), old); });
  else store.update(s => { const st = groups.seatPart(s, g.id).settings; st.layout = 'raum'; st.room = id; });
}
// Raum gelöscht: Lerngruppen, die ihn nutzen, wechseln zu Omnibus (Reihenfolge der Plätze bleibt)
function roomDeleted(r) {
  store.update(s => { for (const c of s.technik.classes) {
    if (c.settings?.room === r.id) { if (c.settings.layout === 'raum') c.settings.layout = 'omnibus'; delete c.settings.room; }
    const d = c.standard; if (d?.room !== r.id) continue;
    if (d.layout === 'raum') { toFlat(d, r); d.layout = 'omnibus'; }
    delete d.room; delete d.slots;
  } });
}
function newRoom(g) {
  const c = groups.seatView(g), d = modeFor(g) === 'std' ? stdOf(c) : null;
  rooms.roomDialog({ tables: d ? d.tables : c.settings.tables, cols: colsOf(d ? d.cols : c.settings.cols, d ? d.tables : c.settings.tables),
    onDone: r => { useRoom(g, r.id); rooms.open(r.id); draw(); toast('Raum angelegt – jetzt Tür, Tische und mehr verschieben.'); } });
}

// ---------- Aktionen ----------
function onChange(e) {
  if (rooms.change(e)) return;
  const t = e.target, g = groups.active();
  if (t.id === 'room-pick' && g && t.value) { useRoom(g, t.value); return; }
  if (t.id === 'lg-select') { search = ''; groups.setActive(t.value); }
  else if (t.id === 'team-count' && g) store.update(s => { groups.sportPart(s, g.id).teamCount = Number(t.value); });
}
async function onClick(e) {
  const lg = e.target.closest('[data-lg]');
  if (lg && await groups.handle(lg, draw)) return;
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, g = groups.active(); if (!g) return;
  const absent = groups.absent(g.id);
  if (rooms.click(act, b, roomDeleted)) return;
  switch (act) {
    case 'room-new': newRoom(g); break;
    case 'room-edit': { const c = groups.seatView(g), id = modeFor(g) === 'std' ? stdOf(c)?.room : c.settings.room; if (rooms.byId(id)) { rooms.open(id); draw(); scrollTo(0, 0); } break; }
    case 'view': viewOf.set(g.id, b.dataset.v); search = ''; draw(); break;
    case 'list-mode': listMode = b.dataset.v; draw(); break;
    case 'print': window.print(); break;
    case 'present': toggleFullscreen(); draw(); break;
    case 'seat-mode': modeOf.set(g.id, b.dataset.v); draw(); break;
    case 'flip': flip = !flip; try { localStorage.setItem(FLIP_KEY, flip ? '1' : '0'); } catch {} draw(); break;
    case 'std-from-mix': {
      const c = groups.seatView(g); if (!c.plan) return;
      if (c.standard && !(await confirmDialog('Standardsitzplan ersetzen', 'Den bisherigen Standardsitzplan durch die jetzige gemischte Verteilung ersetzen?', 'Ersetzen'))) return;
      // jede Gruppe behält ihre Tische (auch als Tischgruppe); Einzelplätze bleiben neben einem freien Platz
      const per = Math.max(...c.plan.groups.map(x => Math.ceil(x.length / 2)), 1), island = c.settings.layout === 'gruppen';
      const seats = c.plan.groups.flatMap(x => { const r = x.slice(); const n = island ? per * 2 : Math.ceil(r.length / 2) * 2; while (r.length < n) r.push(null); return r; });
      const tables = Math.max(seats.length / 2, TABLE_LAYOUTS.includes(c.settings.layout) && !island ? c.settings.tables : 0);
      const r = c.settings.layout === 'raum' ? rooms.byId(c.settings.room) : null;
      if (r) {
        const slots = Object.fromEntries([...rooms.mixSlots(r, c.plan.groups).map].map(([k, v]) => [k, v.id])), flat = rooms.slotsToFlat(r, slots);
        if (flat.length % 2) flat.push(null);
        store.update(s => { groups.seatPart(s, g.id).standard = { layout: 'raum', room: r.id, slots, tables: Math.max(1, flat.length / 2), groups: c.plan.groups.length, cols: 0, seats: flat, savedAt: new Date().toISOString() }; });
      } else store.update(s => { groups.seatPart(s, g.id).standard = { layout: c.settings.layout, tables, groups: c.plan.groups.length, cols: c.settings.cols || 0, icols: c.settings.icols || 0, seats, savedAt: new Date().toISOString() }; });
      // Kinder, die heute fehlen, stehen danach bei „ohne Platz“
      modeOf.set(g.id, 'std'); draw(); toast('Als Standardsitzplan gespeichert.');
      break;
    }
    case 'std-alpha': {
      const c = groups.seatView(g), seats = c.students.slice().sort((x, y) => x.name.localeCompare(y.name, 'de')).map(p => p.id);
      if (seats.length % 2) seats.push(null);
      store.update(s => { groups.seatPart(s, g.id).standard = { layout: 'omnibus', tables: seats.length / 2, groups: c.settings.groups, cols: 0, seats, savedAt: new Date().toISOString() }; });
      modeOf.set(g.id, 'std'); toast('Alphabetisch gefüllt – jetzt durch Ziehen ordnen.');
      break;
    }
    case 'std-seat-missing': updStd(g, d => seatMissing(d, d.missing)); break;
    case 'std-clear': {
      if (!(await confirmDialog('Standardsitzplan löschen', `Den Standardsitzplan von „${g.name}“ löschen? Die gemischten Gruppen bleiben.`))) return;
      const old = groups.seatView(g).standard;
      store.update(s => { delete groups.seatPart(s, g.id).standard; });
      toast('Standardsitzplan gelöscht.', { action: 'Rückgängig', onAction: () => store.update(s => { groups.seatPart(s, g.id).standard = old; }) });
      break;
    }
    case 'layout': {
      const to = b.dataset.id, mode = modeFor(g), c = groups.seatView(g);
      if (to === 'raum') {
        const cur = (mode === 'std' ? c.standard?.room : null) || c.settings.room, pick = rooms.byId(cur) ? cur : rooms.list()[0]?.id;
        if (pick) useRoom(g, pick, mode); else newRoom(g);
        break;
      }
      if (mode === 'std') updStd(g, d => { if (isRaum(d)) toFlat(d, rooms.byId(d.room)); d.layout = to; });
      else store.update(s => { groups.seatPart(s, g.id).settings.layout = to; });
      break;
    }
    case 'step': {
      const k = b.dataset.k, d = Number(b.dataset.d);
      if (modeFor(g) === 'std') {
        updStd(g, x => {
          if (k === 'tables') { const used = Math.ceil((x.seats.findLastIndex(Boolean) + 1) / 2); x.tables = Math.min(40, Math.max(1, used, x.tables + d)); x.seats = x.seats.slice(0, x.tables * 2); while (x.seats.length < x.tables * 2) x.seats.push(null); }
          else if (k === 'cols') x.cols = Math.min(5, Math.max(2, colsOf(x.cols, x.tables) + d));
          else if (k === 'groups') x.groups = Math.min(20, Math.max(1, x.groups + d));
          else if (k === 'icols') x.icols = Math.min(6, Math.max(1, Number(b.dataset.base) + d));
        });
        break;
      }
      if (k === 'icols') { store.update(s => { groups.seatPart(s, g.id).settings.icols = Math.min(6, Math.max(1, Number(b.dataset.base) + d)); }); break; }
      if (k === 'cols') { store.update(s => { const st = groups.seatPart(s, g.id).settings; st.cols = Math.min(5, Math.max(2, colsOf(st.cols, st.tables) + d)); }); break; }
      const minT = k === 'tables' ? minimumTables(groups.presentCount(g), groups.seatView(g).settings.groups) : 1;
      store.update(s => { const st = groups.seatPart(s, g.id).settings; st[k] = Math.min(k === 'tables' ? 40 : 20, Math.max(minT, 1, st[k] + d)); });
      break;
    }
    case 'mix-seat': {
      const c = groups.seatView(g);
      const res = mixGroups({ students: c.students, rules: c.rules, groupCount: c.settings.groups }, absent);
      if (!res.ok) return toast(res.message, { kind: 'warn' });
      const need = res.groups.reduce((n, gr) => n + Math.ceil(gr.length / 2), 0);
      store.update(s => { const p = groups.seatPart(s, g.id); p.plan = { groups: res.groups, createdAt: new Date().toISOString() }; if (TABLE_LAYOUTS.includes(p.settings.layout)) p.settings.tables = Math.min(40, Math.max(p.settings.tables, need)); });
      toast('Neu verteilt.');
      break;
    }
    case 'mix-teams': {
      const k = groups.sportView(g);
      const res = mixGroups({ students: k.students, rules: k.rules, groupCount: k.teamCount }, absent);
      if (!res.ok) return toast(res.message, { kind: 'warn' });
      store.update(s => { groups.sportPart(s, g.id).teams = res.groups.map((members, i) => ({ id: uid(), name: 'Team ' + (i + 1), members })); });
      break;
    }
    case 'rules': {
      const teams = viewFor(g) === 'teams', part = s => (teams ? groups.sportPart(s, g.id) : groups.seatPart(s, g.id));
      rulesDialog({ title: teams ? 'Teams: Einteilung anpassen' : 'Sitzordnung: Einteilung anpassen',
        people: g.students.map(p => ({ id: p.id, label: p.name + (p.className ? ' (' + p.className + ')' : '') })),
        getRules: () => { const x = groups.byId(g.id); return (teams ? x?.sport?.rules : x?.seat?.rules) ?? []; },
        note: teams ? 'Die Regeln gelten beim Mischen der Teams.' : 'Die Regeln gelten in jeder Organisationsform.',
        onAdd: pair => store.update(s => { part(s).rules.push(pair); }),
        onDelete: i => store.update(s => { part(s).rules.splice(i, 1); }) });
      break;
    }
    case 'new-tournament': tournamentDialog(g, null, () => { location.hash = '#/turniere'; }); break;
  }
}

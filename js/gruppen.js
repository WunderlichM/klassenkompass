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
];
const LAYOUT_PICS = {
  omnibus: '<rect x="4" y="5" width="7" height="3" rx="1"/><rect x="13" y="5" width="7" height="3" rx="1"/><rect x="4" y="11" width="7" height="3" rx="1"/><rect x="13" y="11" width="7" height="3" rx="1"/><rect x="4" y="17" width="7" height="3" rx="1"/><rect x="13" y="17" width="7" height="3" rx="1"/>',
  gruppen: '<rect x="3" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="4" width="8" height="7" rx="1.5"/><rect x="3" y="14" width="8" height="7" rx="1.5"/><rect x="13" y="14" width="8" height="7" rx="1.5"/>',
  sitzkreis: '<circle cx="12" cy="4" r="1.6"/><circle cx="18.5" cy="7.5" r="1.6"/><circle cx="18.5" cy="16.5" r="1.6"/><circle cx="12" cy="20" r="1.6"/><circle cx="5.5" cy="16.5" r="1.6"/><circle cx="5.5" cy="7.5" r="1.6"/>',
  stehkreis: '<circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/><circle cx="12" cy="4" r="1.3"/><circle cx="20" cy="12" r="1.3"/><circle cx="12" cy="20" r="1.3"/><circle cx="4" cy="12" r="1.3"/>',
  uform: '<path d="M4 4v16h16V4"/><path d="M8 4v12h8V4"/>',
  arena: '<path d="M3 9q9-6 18 0M3 14q9-6 18 0M3 19q9-6 18 0"/>',
};

// Ansicht je Lerngruppe: Sport-Gruppen öffnen mit „Teams“, alle anderen mit „Sitzordnung“; eine andere Wahl gilt bis zur nächsten Auswahl der Lerngruppe (seit 2.8.1)
const viewOf = groups.viewOf;
let listMode = 'plan', search = '', root = null, problem = '';
const viewFor = g => viewOf.get(g.id) || (groups.isSport(g) ? 'teams' : 'sitz');
// Sitzordnung (seit 2.6.0) in zwei Fassungen: „std“ = Standardsitzplan (wer normalerweise wo sitzt, fest gespeichert),
// „mix“ = gemischte Gruppen wie bisher. Gibt es einen Standardsitzplan, öffnet die Sitzordnung damit.
const modeOf = new Map();
const modeFor = g => modeOf.get(g.id) || (groups.seatView(g).standard ? 'std' : 'mix');
// Blick von der Tafel (Lehrkraft) statt von hinten – gilt je Gerät
const FLIP_KEY = 'klassenkompass.seatFlip';
let flip = (() => { try { return localStorage.getItem(FLIP_KEY) === '1'; } catch { return false; } })();
// Raum (seit 2.8.0): oben gewählt, gilt bis zum Wechsel der Lerngruppe; danach wieder ihr Standardraum (technik.classes[].room).
// '' = kein Raum (Organisationsformen ohne Raum).
const roomSel = new Map();
let lastActive = null;
function roomOf(g) {
  const id = roomSel.has(g.id) ? roomSel.get(g.id) : groups.seatView(g).room || '';
  return id ? rooms.byId(id) : null;
}
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
  // Wechsel der Lerngruppe: wieder ihr Standardraum
  if (g && g.id !== lastActive) { if (lastActive !== null) roomSel.delete(g.id); lastActive = g.id; }
  root.innerHTML = `
  <section class="page gruppen ${v === 'teams' ? 'sport' : 'technik'}">
    <div class="page-head">
      <div>
        <p class="eyebrow">Gruppen${g ? ' · ' + esc(g.subject) : ''}</p>
        <h1>Gruppen<span class="dot">.</span></h1>
        <p class="sub">${v === 'teams' ? 'Teams mischen – gerecht und schnell.' : 'Ein neuer Platz. Eine neue Perspektive.'}</p>
      </div>
      <div class="pickers">${g && v === 'sitz' ? roomPickerHtml(g) : ''}${groups.pickerHtml(g)}</div>
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
  return { layout, tables, groups: Math.min(20, Math.max(1, Math.round(Number(d.groups)) || 4)), cols: Number(d.cols) || 0, icols: Number(d.icols) || 0, seats, missing: c.students.filter(p => !seen.has(p.id)) };
}
const getS = (d, k) => d.seats[Number(k)] ?? null;
const setS = (d, k, v) => { d.seats[Number(k)] = v; };
const keyOf = (d, pid) => (i => (i >= 0 ? String(i) : undefined))(d.seats.indexOf(pid));
const icolsOf = (v, n) => (v >= 1 && v <= 6 ? Math.min(v, Math.max(1, n)) : n <= 4 ? 2 : 3);
// Standardsitzplan ändern (immer über die bereinigte Fassung); Plätze hinter dem letzten Tisch (z. B. in einem Raum mit
// mehr Plätzen) erweitern die Zahl der Tische
function updStd(g, fn) {
  store.update(s => {
    const p = groups.seatPart(s, g.id), d = stdOf(p); if (!d) return; fn(d);
    d.seats = Array.from({ length: Math.min(80, d.seats.length) }, (_, i) => d.seats[i] ?? null);
    d.tables = Math.min(40, Math.max(d.tables, Math.ceil((d.seats.findLastIndex(Boolean) + 1) / 2)));
    const { missing, ...keep } = d; p.standard = { ...keep, savedAt: new Date().toISOString() };
  });
}
// Kinder ohne Platz auf die ersten freien Plätze setzen (limit = Zahl der Plätze im Raum); reichen sie ohne Raum nicht,
// kommen Tische dazu
function seatMissing(d, people, limit = 0) {
  let n = 0;
  for (const p of people) {
    const old = d.seats.indexOf(p.id);
    let k = d.seats.findIndex((x, i) => !x && (!limit || i < limit));
    if (k < 0 && limit) { k = d.seats.length < limit ? d.seats.length : -1; }
    if (k < 0 && !limit) { k = d.seats.length; d.seats.push(null, null); d.tables++; }
    if (k < 0 || k >= 80) { n++; continue; }
    if (old >= 0) d.seats[old] = null;
    d.seats[k] = p.id;
  }
  if (n) toast(`${n === 1 ? '1 Kind hat' : n + ' Kinder haben'} im Raum keinen Platz – im Raumplaner Plätze ergänzen.`, { kind: 'warn' });
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

// Plätze einer Organisationsform in ihrer Reihenfolge ({ id, g, k }) und die Angaben für die automatische Anordnung
// im Raum (rooms.arrange). tag(i) = Marke des i-ten Tisches (Tischnummer bzw. Tischgruppe).
function seatSpec(c, d, L) {
  const plan = d || c.plan ? null : { groups: [] }, cc = plan ? { ...c, plan } : c;
  if (L === 'omnibus' || L === 'uform') {
    const tables = tablesOf(cc, d);
    return { spec: { tables: tables.length, cols: colsOf(d ? d.cols : c.settings.cols, tables.length) }, entries: tables.flatMap(t => t.seats), tag: i => (L === 'omnibus' ? tables[i]?.no ?? '' : '') };
  }
  if (L === 'gruppen') {
    const isl = d ? islandsOf(c, d) : (c.plan?.groups.length ? islandsOf(c, null) : Array.from({ length: c.settings.groups }, (_, g) => ({ g, title: `Gruppe ${g + 1}`, n: 0, tables: [{ g, seats: [{ id: null, g }, { id: null, g }] }] })));
    return { spec: { islands: isl.map(i => i.tables.length * 2), icols: icolsOf(d ? d.icols : c.settings.icols, isl.length) }, entries: isl.flatMap(i => i.tables.flatMap(t => t.seats)), islands: isl };
  }
  const flat = d ? d.seats.map((id, k) => ({ id, g: -1, k })) : (c.plan?.groups || []).flatMap((g, gi) => g.map(id => ({ id, g: gi })));
  if (L === 'sitzkreis' || L === 'stehkreis') { const ids = flat.filter(x => x.id); return { spec: { n: ids.length }, entries: ids }; }
  const list = d ? flat.slice(0, Math.max(flat.findLastIndex(x => x.id) + 1, 1)) : flat;
  return { spec: { n: list.length }, entries: list };
}
// automatische Anordnung im Raum für den Raumplaner (gewählte Lerngruppe und Fassung)
function autoFor(g) {
  return (r, L) => { const c = groups.seatView(g), d = modeFor(g) === 'std' ? stdOf(c) : null; return rooms.arrange(r, L, seatSpec(c, d, L).spec); };
}

// Sitzordnung im gewählten Raum: Grundriss des Raums und die Plätze der Organisationsform – angepasst (aus dem
// Raumplaner) oder automatisch passend zur Lerngruppe. Rückgabe { html, outside } (outside = Kinder ohne Platz).
function roomIn(c, d, off, r, L) {
  const cus = rooms.custom(r, L), std = !!d;
  let seated, at, over = 0, outside = [], tagOf = () => '';
  if (cus) {
    seated = cus;
    const keys = rooms.slotKeys(rooms.compose(r, seated));
    if (d) { const idx = new Map(keys.map((k, i) => [k, i])); at = k => { const i = idx.get(k); return { id: d.seats[i] ?? null, g: -1, k: i }; }; outside = d.seats.slice(keys.length).filter(Boolean); }
    else { const m = rooms.mixSlots(rooms.compose(r, seated), c.plan?.groups || []); over = m.over; at = k => m.map.get(k) || { id: null, g: -1 }; }
  } else {
    const sp = seatSpec(c, d, L);
    seated = rooms.arrange(r, L, sp.spec);
    const keys = rooms.slotKeys(rooms.compose(r, seated)), idx = new Map(keys.map((k, i) => [k, sp.entries[i] || { id: null, g: -1 }]));
    at = k => idx.get(k) || { id: null, g: -1 };
    if (L === 'gruppen') tagOf = it => { const i = sp.islands[it.grp]; return i && seated.find(x => x.grp === it.grp) === it ? (std ? String(it.grp + 1) : `G${it.grp + 1}`) : ''; };
    else if (L === 'omnibus') tagOf = it => sp.tag(it.o);
  }
  // Gruppenfarbe je Tisch: Gruppe des ersten belegten Platzes
  const colorOf = new Map();
  if (!std) for (const it of seated) { const n = rooms.seatsOf(it); for (let i = 0; i < n; i++) { const e = at(it.id + ':' + i); if (e.id && e.g >= 0) { colorOf.set(it.id, e.g); break; } } }
  const html = `<div class="room v2 raum ${L} ${std ? 'std' : 'mix'} ${flip ? 'flip' : ''}">${std ? '' : legend(c)}${over ? `<p class="notice">Im Raum fehlen ${over} ${over === 1 ? 'Platz' : 'Plätze'} – im Raumplaner Plätze ergänzen.</p>` : ''}${rooms.roomHtml(rooms.compose(r, seated), { flip,
    seat: k => seatBox(c, at(k), off),
    itemClass: it => (colorOf.has(it.id) ? ['grouped', palStyle(colorOf.get(it.id))] : ['plain', '']),
    tag: it => String(tagOf(it) ?? '') })}</div>`;
  return { html, outside };
}

// c = Sitzordnung der Lerngruppe, d = Standardsitzplan (oder null für die gemischten Gruppen), off = heute abwesend,
// r = gewählter Raum (oder null)
function room(c, d, off, r = null) {
  const L = d ? d.layout : c.settings.layout, std = !!d;
  if (r) return roomIn(c, d, off, r, L).html;
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

// Raumauswahl oben neben der Lerngruppe (seit 2.8.0): Raum wählen, als Standardraum der Lerngruppe merken, bearbeiten
function roomPickerHtml(g) {
  const all = rooms.list(), r = roomOf(g), def = groups.seatView(g).room || '', cur = r?.id || '', isDef = cur === def;
  return `<div class="picker room-picker no-print">
    <label class="eyebrow" for="room-select">Raum</label>
    <div class="picker-row">
      <select id="room-select" class="select"><option value="" ${cur ? '' : 'selected'}>Kein Raum (Standard)${def ? '' : ' ★'}</option>${all.map(x => `<option value="${esc(x.id)}" ${x.id === cur ? 'selected' : ''}>${esc(x.name)}${x.id === def ? ' ★' : ''}</option>`).join('')}<option value="__new">+ Neuer Raum …</option></select>
      <button class="icon-btn ${isDef ? 'on' : ''}" data-act="room-default" aria-pressed="${isDef}" title="${isDef ? `Standardraum von ${esc(g.name)}` : `Als Standardraum für ${esc(g.name)} merken`}" aria-label="Als Standardraum merken">${icon('star')}</button>
      ${r ? `<button class="icon-btn" data-act="room-edit" title="Raum bearbeiten (Grundriss und Plätze je Organisationsform)" aria-label="Raum bearbeiten">${icon('edit')}</button>` : ''}
    </div>
  </div>`;
}
function seatHtml(g) {
  if (rooms.editor.id && rooms.byId(rooms.editor.id)) return `<div class="work-grid">${rooms.editorHtml()}<aside class="side no-print">${rooms.editorSide()}</aside></div>`;
  const c = groups.seatView(g), off = groups.absent(g.id), present = groups.presentCount(g), mode = modeFor(g), d = mode === 'std' ? stdOf(c) : null;
  const L = d ? d.layout : c.settings.layout, layout = LAYOUTS.find(l => l.id === L) || LAYOUTS[0], r = roomOf(g), cus = rooms.custom(r, L);
  const usesTables = TABLE_LAYOUTS.includes(L) && !cus, minT = minimumTables(present, c.settings.groups);
  const head = `<div class="seg mode-seg no-print" role="group" aria-label="Fassung der Sitzordnung">
            <button class="${mode === 'std' ? 'on' : ''}" data-act="seat-mode" data-v="std" title="Wer normalerweise wo sitzt">Standardsitzplan</button>
            <button class="${mode === 'mix' ? 'on' : ''}" data-act="seat-mode" data-v="mix" title="Gruppen nach Anwesenheit mischen">Gemischt</button></div>`;
  const flipBtn = `<button class="btn ghost sm" data-act="flip" aria-pressed="${flip}" title="Den Raum von der Tafel aus zeigen (für dich) oder von hinten (für die Klasse)">${icon('repeat', 15)} ${flip ? 'Blick von der Tafel' : 'Blick von hinten'}</button>`;
  const title = `<p class="print-only print-title">${esc(g.name)} · ${mode === 'std' ? 'Standardsitzplan' : esc(layout.name)}${r ? ' · ' + esc(r.name) : ''}${flip ? ' · Blick von der Tafel' : ''} · ${new Date().toLocaleDateString('de-DE')}</p>`;
  const where = r ? `${esc(r.name)} · ${esc(layout.name)}` : esc(layout.name);
  // Hinweis zu den Plätzen im Raum (angepasst oder automatisch)
  const roomNote = r ? `<p class="muted small-text">${cus ? `Die Plätze für ${esc(layout.name)} sind im Raum „${esc(r.name)}“ fest angeordnet (${rooms.seatCount(rooms.compose(r, cus))} Plätze).` : `Im Raum „${esc(r.name)}“ stellt die App ${esc(layout.name)} selbst passend auf.`} <button class="linkish" data-act="room-edit">Im Raumplaner ${cus ? 'ändern' : 'anpassen'}</button></p>` : '';

  // ----- Standardsitzplan -----
  if (mode === 'std') {
    const used = d ? Math.ceil((d.seats.findLastIndex(Boolean) + 1) / 2) : 0, seated = d ? d.seats.filter(Boolean).length : 0;
    const nIsl = d && L === 'gruppen' ? islandsOf(c, d).length : 0, ic = icolsOf(d?.icols, nIsl);
    const inRoom = d && r ? roomIn(c, d, off, r, L) : null;
    // ohne festen Platz: Kinder ohne Platz und Kinder auf Plätzen, die es im Raum nicht gibt
    const tray = d ? [...d.missing, ...(inRoom?.outside || []).map(id => c.students.find(p => p.id === id)).filter(Boolean)] : [];
    return `<div class="work-grid">
    <div class="card room-card print-area">
      <div class="card-head">
        <div><p class="eyebrow">Dein Raum · ${where}</p><h2>Standardsitzplan ${d ? `<span class="badge">${seated} Plätze belegt</span>` : ''}</h2></div>
        <div class="tools no-print">${d ? flipBtn : ''}${head}</div>
      </div>
      ${title}
      ${d ? `${tray.length ? `<div class="tray no-print no-present" data-tray><b>${tray.length === 1 ? '1 Kind hat' : tray.length + ' Kinder haben'} ${r ? 'hier' : 'noch'} keinen festen Platz:</b>${tray.map(p => `<span class="chip" data-pid="${esc(p.id)}">${esc(p.name)}</span>`).join('')}<button class="btn ghost sm" data-act="std-seat-missing">Auf freie Plätze setzen</button></div>` : ''}
      <div class="room-wrap">${inRoom ? inRoom.html : room(c, d, off)}</div>
      <p class="hint no-print no-present">${icon('check', 14)} Kind auf ein anderes ziehen: Die beiden tauschen. Auf einen freien Platz ziehen: Das Kind zieht um. Wer heute fehlt, ist grau – der Platz bleibt.</p>`
      : `<div class="room-wrap"><div class="room-empty"><p><b>Noch kein Standardsitzplan.</b><br>Hier steht, wer normalerweise wo sitzt – fest gespeichert, unabhängig vom Mischen und vom Raum.</p>
          <div class="tools">${c.plan ? `<button class="btn primary" data-act="std-from-mix">${icon('check', 16)} Jetzige Verteilung übernehmen</button>` : ''}<button class="btn ${c.plan ? 'ghost' : 'primary'}" data-act="std-alpha">Alphabetisch füllen</button></div>
          <p class="muted small-text">Danach ordnest du die Kinder durch Ziehen an ihre Plätze.</p></div></div>`}
    </div>
    <aside class="side no-print">
      ${d ? `<div class="card">
        <h3>${icon('grid', 16)} Tische</h3>
        ${cus ? '' : `<div class="num-row">
          ${stepper('Anzahl Tische', 'tables', d.tables, { min: d.tables > Math.max(1, used), max: d.tables < 40, disabled: !usesTables })}
          ${L === 'omnibus' ? stepper('Tische nebeneinander', 'cols', colsOf(d.cols, d.tables), { min: colsOf(d.cols, d.tables) > 2, max: colsOf(d.cols, d.tables) < 5 }) : ''}
          ${L === 'gruppen' ? stepper('Tischgruppen', 'groups', d.groups, { min: d.groups > 1, max: d.groups < Math.min(20, d.tables) }) + stepper('Tischgruppen nebeneinander', 'icols', ic, { min: ic > 1, max: ic < Math.min(6, nIsl) }) : ''}
        </div>`}
        ${roomNote}
        <p class="muted small-text">${cus ? 'Die Reihenfolge der Plätze bleibt in jedem Raum und jeder Organisationsform gleich (von vorn links nach hinten rechts).' : usesTables ? 'Ein Tisch hat zwei Plätze. Leere Tische am Ende lassen sich wieder entfernen.' : 'Diese Organisationsform braucht keine Tische; die Reihenfolge der Plätze bleibt.'}</p>
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
        <div><p class="eyebrow">Dein Raum${r ? ' · ' + esc(r.name) : ''}</p><h2>${esc(layout.name)} <span class="badge">${present} anwesend</span></h2></div>
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
      <div class="room-wrap">${c.plan ? (listMode === 'plan' ? room(c, null, off, r) : groupList(c)) : '<div class="room-empty"><p>Noch keine Verteilung.</p></div>'}</div>
      ${c.plan ? `<p class="hint no-print no-present">${icon('check', 14)} Die Farben zeigen die Gruppen. Ziehe ein Kind auf ein anderes, um die beiden zu tauschen.</p>` : ''}
    </div>
    <aside class="side no-print">
      <div class="card">
        <h3>${icon('users', 16)} Gruppen und Tische</h3>
        <div class="num-row">
          ${stepper('Anzahl Gruppen', 'groups', c.settings.groups)}
          ${cus ? '' : stepper('Anzahl Tische', 'tables', c.settings.tables, { min: c.settings.tables > minT, disabled: !usesTables })}
          ${L === 'omnibus' && !cus ? stepper('Tische nebeneinander', 'cols', cols, { min: cols > 2, max: cols < 5 }) : ''}
          ${L === 'gruppen' && !cus ? stepper('Tischgruppen nebeneinander', 'icols', ic, { min: ic > 1, max: ic < Math.min(6, nIsl) }) : ''}
        </div>
        <p class="muted small-text">${cus ? `Die Plätze kommen aus dem Raumplaner; jede Gruppe bekommt eigene Tische.` : usesTables ? `Ein Tisch hat zwei Plätze. Für ${present} Anwesende in ${c.settings.groups} Gruppen sind mindestens ${minT} Tische nötig.` : 'Diese Organisationsform braucht keine Tische.'} Die Gruppen werden möglichst gleich groß.</p>
        ${roomNote}
      </div>
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

// Vollbild (seit 2.8.0): Sitzplan bzw. Teams so verkleinern, dass alles ohne Scrollen auf einen Bildschirm passt.
// Räume (maßstäblich) werden schmaler, alle anderen Darstellungen über zoom (mehrere Schritte, weil sich die
// Darstellung bei kleinerer Breite neu umbricht). Rückgabe true = Vollbild erledigt.
function fitPresent() {
  if (!root || !document.body.classList.contains('presenting')) return false;
  const el = root.querySelector('.room-wrap > .room, .team-grid'); if (!el) return true;
  const rp = el.querySelector('.rp'), doc = document.documentElement, over = () => doc.scrollHeight - innerHeight;
  el.style.zoom = ''; if (rp) rp.style.maxWidth = '';
  if (rp) {
    for (let i = 0; i < 3; i++) { const o = over(); if (o <= 1) break; const w = rp.getBoundingClientRect().width, h = rp.getBoundingClientRect().height; rp.style.maxWidth = Math.max(220, (w * (h - o - 2)) / h) + 'px'; }
    return true;
  }
  for (let i = 0; i < 6; i++) {
    const o = over(); if (o <= 1) break;
    const h = el.getBoundingClientRect().height; if (h < 40) break;
    el.style.zoom = String(Math.max(0.25, (parseFloat(el.style.zoom) || 1) * Math.max(0.5, (h - o - 2) / h)));
  }
  return true;
}
// Sitzplan auf schmalen Bildschirmen (Handy) verkleinern statt waagerecht scrollen
function fitRoom() {
  if (fitPresent()) return;
  root?.querySelectorAll('.team-grid, .rp').forEach(e => { e.style.zoom = ''; e.style.maxWidth = ''; });
  const wrap = root?.querySelector('.room-wrap'), r = wrap?.querySelector('.room'); if (!r) return;
  r.style.zoom = '';
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
      <div class="card-foot no-print"><span class="muted small-text no-present">${icon('check', 14)} Teams sind möglichst gleich groß. Ziehe ein Kind auf ein anderes, um die beiden zu tauschen.</span>
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

// Raum gelöscht: Lerngruppen, die ihn als Standardraum haben, zeigen danach die Organisationsformen ohne Raum
function roomDeleted(r) {
  for (const [k, v] of roomSel) if (v === r.id) roomSel.delete(k);
  store.update(s => { for (const c of s.technik.classes) if (c.room === r.id) delete c.room; });
}
function setDefaultRoom(g, id) { store.update(s => { const p = groups.seatPart(s, g.id); if (id) p.room = id; else delete p.room; }); }
function editRoom(g, r, part) {
  const c = groups.seatView(g), L = modeFor(g) === 'std' && c.standard ? stdOf(c).layout : c.settings.layout;
  rooms.open(r.id, { part: part || L, form: L, auto: autoFor(g) }); draw(); scrollTo(0, 0);
}
function newRoom(g) {
  const c = groups.seatView(g), d = modeFor(g) === 'std' ? stdOf(c) : null;
  rooms.roomDialog({ tables: d ? d.tables : c.settings.tables, cols: colsOf(d ? d.cols : c.settings.cols, d ? d.tables : c.settings.tables),
    onDone: r => {
      roomSel.set(g.id, r.id);
      const first = !groups.seatView(g).room; if (first) setDefaultRoom(g, r.id);
      editRoom(g, rooms.byId(r.id) || r, 'base');
      toast(first ? `Raum angelegt und als Standardraum von „${g.name}“ gemerkt.` : 'Raum angelegt – jetzt Tür, Fenster und Schränke verschieben.');
    } });
}

// ---------- Aktionen ----------
function onChange(e) {
  if (rooms.change(e)) return;
  const t = e.target, g = groups.active();
  if (t.id === 'room-select' && g) {
    if (t.value === '__new') { t.value = roomOf(g)?.id || ''; newRoom(g); return; }
    roomSel.set(g.id, t.value); draw(); return;
  }
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
    case 'room-edit': { const r = roomOf(g); if (r) editRoom(g, r); break; }
    case 'room-default': {
      const r = roomOf(g), cur = r?.id || '';
      if ((groups.seatView(g).room || '') === cur) { toast(cur ? `„${r.name}“ ist schon der Standardraum von „${g.name}“.` : `„${g.name}“ hat keinen Standardraum.`); break; }
      setDefaultRoom(g, cur); toast(cur ? `„${r.name}“ ist jetzt der Standardraum von „${g.name}“.` : `„${g.name}“ öffnet jetzt ohne Raum.`);
      break;
    }
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
      const r = roomOf(g), cus = rooms.custom(r, c.settings.layout);
      if (cus) {
        // fest angeordneter Raum: Plätze so übernehmen, wie sie im Raum zu sehen sind
        const R = rooms.compose(r, cus), m = rooms.mixSlots(R, c.plan.groups).map, flat = rooms.slotKeys(R).map(k => m.get(k)?.id ?? null).slice(0, 80);
        while (flat.length && !flat[flat.length - 1]) flat.pop(); if (flat.length % 2) flat.push(null);
        store.update(s => { groups.seatPart(s, g.id).standard = { layout: c.settings.layout, tables: Math.min(40, Math.max(1, flat.length / 2)), groups: c.plan.groups.length, cols: c.settings.cols || 0, icols: c.settings.icols || 0, seats: flat, savedAt: new Date().toISOString() }; });
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
    case 'std-seat-missing': {
      const r = roomOf(g), c = groups.seatView(g), L = stdOf(c)?.layout, cus = rooms.custom(r, L), limit = cus ? Math.min(80, rooms.seatCount(rooms.compose(r, cus))) : 0;
      updStd(g, d => { const out = limit ? d.seats.slice(limit).filter(Boolean).map(id => ({ id })) : []; seatMissing(d, [...d.missing, ...out], limit); });
      break;
    }
    case 'std-clear': {
      if (!(await confirmDialog('Standardsitzplan löschen', `Den Standardsitzplan von „${g.name}“ löschen? Die gemischten Gruppen bleiben.`))) return;
      const old = groups.seatView(g).standard;
      store.update(s => { delete groups.seatPart(s, g.id).standard; });
      toast('Standardsitzplan gelöscht.', { action: 'Rückgängig', onAction: () => store.update(s => { groups.seatPart(s, g.id).standard = old; }) });
      break;
    }
    case 'layout': {
      const to = b.dataset.id, mode = modeFor(g), c = groups.seatView(g);
      if (mode === 'std') updStd(g, d => { d.layout = to; });
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

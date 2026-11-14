// Bereich Gruppen (seit 2.0.0): eine Lerngruppe in zwei Ansichten – Sitzordnung (Raum, Tische, Organisationsformen)
// und Teams (Sport). Beide nutzen dieselben Kinder und dieselbe Anwesenheit (js/groups.js).
import * as store from './store.js';
import * as groups from './groups.js';
import { mixGroups, minimumTables, uid, swapMembers, TABLE_LAYOUTS } from './engine.js';
import { enableDrag } from './drag.js';
import { esc, icon, toast, palStyle, toggleFullscreen, rulesDialog } from './ui.js';
import { tournamentDialog } from './turniere.js';

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

// Ansicht je Lerngruppe merken: Sport-Gruppen öffnen mit „Teams“, alle anderen mit „Sitzordnung“
const viewOf = groups.viewOf;
let listMode = 'plan', search = '', root = null, problem = '';
const viewFor = g => viewOf.get(g.id) || (g.subject === 'Sport' ? 'teams' : 'sitz');
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
  const offDrag = enableDrag(el, { item: '[data-pid]', target: '[data-pid]', onDrop: (a, b) => swap(a.dataset.pid, b.dataset.pid) });
  render();
  return () => { off(); offDrag(); removeEventListener('resize', onResize); el.onclick = el.onchange = el.oninput = null; root = null; };
}

// Einteilung der gezeigten Ansicht aktuell halten (js/groups.js): mischen, wenn noch keine da ist oder die Anzahl
// nicht passt; bei Abwesenheit, neuen und entfernten Kindern nur ausgleichen. Die Änderung zeichnet die Seite neu.
function keepCurrent(g) {
  const teams = viewFor(g) === 'teams', r = teams ? groups.ensureTeams(g) : groups.ensureSeat(g);
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
function seatHtml(g) {
  const c = groups.seatView(g), absent = groups.absent(g.id), present = groups.presentCount(g);
  const layout = LAYOUTS.find(l => l.id === c.settings.layout) || LAYOUTS[0];
  const usesTables = TABLE_LAYOUTS.includes(c.settings.layout), minT = minimumTables(present, c.settings.groups);
  return `<div class="work-grid">
    <div class="card room-card print-area">
      <div class="card-head">
        <div><p class="eyebrow">Dein Raum</p><h2>${esc(layout.name)} <span class="badge">${present} anwesend</span></h2></div>
        <div class="tools no-print">
          <button class="btn primary" data-act="mix-seat">${icon('shuffle')} Neu mischen</button>
          <div class="seg" role="group" aria-label="Darstellung">
            <button class="${listMode === 'plan' ? 'on' : ''}" data-act="list-mode" data-v="plan" title="Sitzplan">${icon('grid', 16)}</button>
            <button class="${listMode === 'list' ? 'on' : ''}" data-act="list-mode" data-v="list" title="Gruppenliste">${icon('list', 16)}</button>
          </div>
        </div>
      </div>
      <p class="print-only print-title">${esc(g.name)} · ${esc(layout.name)} · ${new Date().toLocaleDateString('de-DE')}</p>
      ${problem ? `<p class="notice no-print">${esc(problem)}</p>` : ''}
      <div class="room-wrap">${c.plan ? (listMode === 'plan' ? room(c) : groupList(c)) : '<div class="room-empty"><p>Noch keine Verteilung.</p></div>'}</div>
      ${c.plan ? `<p class="hint no-print">${icon('check', 14)} Die Farben zeigen die Gruppen. Ziehe ein Kind auf ein anderes, um die beiden zu tauschen.</p>` : ''}
    </div>
    <aside class="side no-print">
      <div class="card">
        <h3>${icon('users', 16)} Gruppen und Tische</h3>
        <div class="num-row">
          <label>Anzahl Gruppen<span class="stepper"><button data-act="step" data-k="groups" data-d="-1">−</button><output>${c.settings.groups}</output><button data-act="step" data-k="groups" data-d="1">+</button></span></label>
          <label ${usesTables ? '' : 'class="disabled"'}>Anzahl Tische<span class="stepper"><button data-act="step" data-k="tables" data-d="-1" ${usesTables && c.settings.tables > minT ? '' : 'disabled'}>−</button><output>${c.settings.tables}</output><button data-act="step" data-k="tables" data-d="1" ${usesTables ? '' : 'disabled'}>+</button></span></label>
        </div>
        <p class="muted small-text">${usesTables ? `Ein Tisch hat zwei Plätze. Für ${present} Anwesende in ${c.settings.groups} Gruppen sind mindestens ${minT} Tische nötig.` : 'Diese Organisationsform braucht keine Tische.'} Die Gruppen werden möglichst gleich groß.</p>
      </div>
      <div class="card">
        <h3>${icon('sliders', 16)} Organisationsform</h3>
        <div class="layout-grid">${LAYOUTS.map(l => `<button class="layout-opt ${l.id === c.settings.layout ? 'on' : ''}" data-act="layout" data-id="${l.id}" title="${esc(l.hint)}"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.4">${LAYOUT_PICS[l.id]}</svg><span>${esc(l.name)}</span></button>`).join('')}</div>
      </div>
      ${groups.peopleCardHtml(g, search)}
      <div class="card">
        <button class="btn ghost full" data-act="rules">${icon('sliders', 16)} Einteilung anpassen</button>
        <p class="muted small-text center">Alle Einstellungen werden automatisch gespeichert.</p>
      </div>
    </aside>
  </div>`;
}

const seat = (c, id, g) => id
  ? `<div class="seat" data-pid="${esc(id)}" style="${palStyle(g)}"><span>${esc(nameOf(c, id))}</span></div>`
  : '<div class="seat free"><span>frei</span></div>';
function tablesFromPlan(c) {
  const tables = [];
  c.plan.groups.forEach((g, gi) => { for (let i = 0; i < g.length; i += 2) tables.push({ g: gi, a: g[i], b: g[i + 1] ?? null }); });
  return tables;
}
// Zweiertisch: Gruppenfarbe auf dem ganzen Tisch, Gruppennummer im Kopf
const deskTable = (c, t, label) => t.g < 0
  ? `<div class="table empty">${label ? `<small><span>${label}</span></small>` : ''}<div class="pair"><div class="seat free"></div><div class="seat free"></div></div></div>`
  : `<div class="table grouped" style="${palStyle(t.g)}"><small><b class="gtag">G${t.g + 1}</b>${label ? `<span>${label}</span>` : ''}</small><div class="pair">${seat(c, t.a, t.g) + seat(c, t.b, t.g)}</div></div>`;
const legend = c => c.plan.groups.length > 1
  ? `<div class="legend">${c.plan.groups.map((g, gi) => `<span class="legend-item" style="${palStyle(gi)}"><span class="gdot"></span>Gruppe ${gi + 1}<em>${g.length}</em></span>`).join('')}</div>` : '';
function room(c) {
  const L = c.settings.layout;
  const front = '<div class="front"><span>Vorne · Tafel</span><div class="desk">Lehrerpult</div></div>';
  if (L === 'omnibus') {
    const tables = tablesFromPlan(c);
    while (tables.length < c.settings.tables) tables.push({ g: -1, a: null, b: null });
    return `<div class="room omnibus">${front}${legend(c)}<div class="rows">${tables.map((t, i) => deskTable(c, t, `Tisch ${i + 1}`)).join('')}</div><div class="back">Hinten</div></div>`;
  }
  if (L === 'gruppen') {
    // Gruppentisch aus zusammengeschobenen Zweiertischen; ein übrig bleibender Tisch steht quer an der Stirnseite
    return `<div class="room gruppen">${front}<div class="islands">${c.plan.groups.map((g, gi) => {
      const pairs = [];
      for (let i = 0; i < g.length; i += 2) pairs.push([g[i], g[i + 1] ?? null]);
      const end = pairs.length > 1 && pairs.length % 2 ? pairs.pop() : null, half = Math.ceil(pairs.length / 2);
      const desk = p => `<div class="table grouped"><div class="pair">${seat(c, p[0], gi) + seat(c, p[1], gi)}</div></div>`;
      return `<div class="island" style="${palStyle(gi)}"><small><b class="gtag">G${gi + 1}</b>Gruppe ${gi + 1} · ${g.length}</small><div class="cluster${end ? ' has-end' : ''}"><div class="side top">${pairs.slice(0, half).map(desk).join('')}</div>${pairs.length > half ? `<div class="side bottom">${pairs.slice(half).map(desk).join('')}</div>` : ''}${end ? `<div class="end">${desk(end)}</div>` : ''}</div></div>`;
    }).join('')}</div><div class="back">Hinten</div></div>`;
  }
  if (L === 'uform') {
    const tables = tablesFromPlan(c);
    while (tables.length < c.settings.tables) tables.push({ g: -1, a: null, b: null });
    const n = tables.length, side = Math.ceil(n / 3), left = tables.slice(0, side), bottom = tables.slice(side, n - side), right = tables.slice(n - side).reverse();
    const t = x => deskTable(c, x, '');
    return `<div class="room uform">${front}${legend(c)}<div class="u"><div class="u-left">${left.map(t).join('')}</div><div class="u-mid">Offene Mitte</div><div class="u-right">${right.map(t).join('')}</div><div class="u-bottom">${bottom.map(t).join('')}</div></div></div>`;
  }
  if (L === 'sitzkreis' || L === 'stehkreis') {
    const ids = c.plan.groups.flatMap((g, gi) => g.map(id => ({ id, gi }))), n = ids.length || 1, r = 42;
    return `<div class="room circle ${L}"><div class="ring">${ids.map((x, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return `<div class="seat round" data-pid="${esc(x.id)}" style="${palStyle(x.gi)};left:${50 + r * Math.cos(a)}%;top:${50 + r * Math.sin(a)}%"><span>${esc(nameOf(c, x.id))}</span></div>`;
    }).join('')}<div class="ring-center">${L === 'sitzkreis' ? 'Sitzkreis' : 'Stehkreis'}</div></div></div>`;
  }
  // Arena / Kino: Reihen ohne Tische, Gruppen nebeneinander
  const ids = c.plan.groups.flatMap((g, gi) => g.map(id => ({ id, gi }))), per = Math.max(6, Math.ceil(Math.sqrt(ids.length * 2.2))), rows = [];
  for (let i = 0; i < ids.length; i += per) rows.push(ids.slice(i, i + per));
  return `<div class="room arena">${front}${rows.map((row, ri) => `<div class="arena-row" style="--curve:${ri}">${row.map(x => seat(c, x.id, x.gi)).join('')}</div>`).join('')}</div>`;
}
const groupList = c => `<div class="group-list">${c.plan.groups.map((g, gi) => `<div class="group-card" style="${palStyle(gi)}"><h4><span class="gdot"></span>Gruppe ${gi + 1} <span class="badge">${g.length}</span></h4><ol>${g.map(id => `<li data-pid="${esc(id)}">${esc(nameOf(c, id))}</li>`).join('')}</ol></div>`).join('')}</div>`;

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
  if (viewFor(g) === 'sitz' && g.seat?.plan) { const m = new Map(g.seat.plan.groups.flatMap((gr, i) => gr.map(id => [id, i]))); color = id => (m.has(id) ? palStyle(m.get(id)) : ''); }
  else if (g.sport?.teams.length) { const m = new Map(g.sport.teams.flatMap((t, i) => t.members.map(id => [id, i]))); color = id => (m.has(id) ? palStyle(m.get(id)) : ''); }
  ul.innerHTML = groups.peopleItems(g, search, color);
}

// Zwei Kinder tauschen (Ziehen und Ablegen)
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

// ---------- Aktionen ----------
function onChange(e) {
  const t = e.target, g = groups.active();
  if (t.id === 'lg-select') { search = ''; groups.setActive(t.value); }
  else if (t.id === 'team-count' && g) store.update(s => { groups.sportPart(s, g.id).teamCount = Number(t.value); });
}
async function onClick(e) {
  const lg = e.target.closest('[data-lg]');
  if (lg && await groups.handle(lg, draw)) return;
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, g = groups.active(); if (!g) return;
  const absent = groups.absent(g.id);
  switch (act) {
    case 'view': viewOf.set(g.id, b.dataset.v); search = ''; draw(); break;
    case 'list-mode': listMode = b.dataset.v; draw(); break;
    case 'print': window.print(); break;
    case 'present': toggleFullscreen(); draw(); break;
    case 'layout': store.update(s => { groups.seatPart(s, g.id).settings.layout = b.dataset.id; }); break;
    case 'step': {
      const k = b.dataset.k, d = Number(b.dataset.d);
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

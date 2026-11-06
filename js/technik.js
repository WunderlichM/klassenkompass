// Bereich Technik: Klassen, Sitzplan und Gruppen
import * as store from './store.js';
import { mixGroups, planIsCurrent, minimumTables, uid, TABLE_LAYOUTS } from './engine.js';
import { esc, icon, dialog, confirmDialog, toast, namesFromText, initials, palStyle, toggleFullscreen, rulesDialog } from './ui.js';

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

const absentByClass = new Map(); // gilt nur bis zum nächsten Öffnen
let view = 'plan', search = '';

const cls = () => { const s = store.get().technik; return s.classes.find(c => c.id === s.activeId) || null; };
const absentFor = c => { if (!absentByClass.has(c.id)) absentByClass.set(c.id, new Set()); return absentByClass.get(c.id); };
const nameOf = (c, id) => c.students.find(s => s.id === id)?.name ?? '?';

export function mount(root) {
  const render = () => draw(root);
  const off = store.subscribe(render);
  root.onclick = e => onClick(e, root);
  root.onchange = e => onChange(e);
  root.oninput = e => { if (e.target.id === 'student-search') { search = e.target.value; drawStudents(root); } };
  const onResize = () => fitRoom(root);
  addEventListener('resize', onResize);
  render();
  return () => { off(); removeEventListener('resize', onResize); root.onclick = root.onchange = root.oninput = null; };
}

// Sitzplan auf schmalen Bildschirmen (Handy) verkleinern statt waagerecht scrollen
function fitRoom(root) {
  const wrap = root.querySelector('.room-wrap'), room = wrap?.querySelector('.room'); if (!room) return;
  room.style.zoom = '';
  if (document.body.classList.contains('presenting') && innerWidth > 900) return;
  const cs = getComputedStyle(wrap), avail = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  // Breite aus allen Plätzen bestimmen (zentrierte Reihen ragen sonst links unbemerkt hinaus)
  let lo = Infinity, hi = -Infinity;
  room.querySelectorAll('.seat, .desk, .table, .island').forEach(el => { const r = el.getBoundingClientRect(); lo = Math.min(lo, r.left); hi = Math.max(hi, r.right); });
  const need = Math.max(room.scrollWidth, hi - lo + 8);
  if (need > avail + 1) room.style.zoom = String(Math.max(0.5, avail / need));
}

function draw(root) {
  const s = store.get().technik, c = cls();
  root.innerHTML = `
  <section class="page technik">
    <div class="page-head">
      <div>
        <p class="eyebrow">Technik · Organisation</p>
        <h1>Sitzplan &amp; Gruppen<span class="dot">.</span></h1>
        <p class="sub">Ein neuer Platz. Eine neue Perspektive.</p>
      </div>
      <div class="picker">
        <label class="eyebrow" for="class-select">Deine Klasse</label>
        <div class="picker-row">
          <select id="class-select" class="select">${s.classes.map(x => `<option value="${esc(x.id)}" ${x.id === s.activeId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}${s.classes.length ? '' : '<option>Noch keine Klasse</option>'}</select>
          <button class="icon-btn" data-act="manage" title="Klassen verwalten" aria-label="Klassen verwalten">${icon('sliders')}</button>
        </div>
      </div>
    </div>
    ${c ? body(c) : `<div class="card empty"><p>Lege deine erste Klasse an. Gespeichert werden nur Vornamen.</p><button class="btn primary" data-act="new-class">${icon('plus')} Neue Klasse</button></div>`}
  </section>`;
  drawStudents(root);
  fitRoom(root);
}

function body(c) {
  const absent = absentFor(c), present = c.students.length - [...absent].filter(id => c.students.some(s => s.id === id)).length;
  const layout = LAYOUTS.find(l => l.id === c.settings.layout);
  const current = planIsCurrent(c, absent);
  const usesTables = TABLE_LAYOUTS.includes(c.settings.layout);
  const minT = minimumTables(present, c.settings.groups);
  return `
  <div class="work-grid">
    <div class="card room-card print-area">
      <div class="card-head">
        <div><p class="eyebrow">Dein Raum</p><h2>${esc(layout.name)} <span class="badge">${present} anwesend</span></h2></div>
        <div class="tools no-print">
          <button class="btn primary" data-act="mix">${icon('shuffle')} Neu mischen</button>
          <div class="seg" role="group" aria-label="Ansicht">
            <button class="${view === 'plan' ? 'on' : ''}" data-act="view" data-v="plan" title="Sitzplan">${icon('grid', 16)}</button>
            <button class="${view === 'list' ? 'on' : ''}" data-act="view" data-v="list" title="Gruppenliste">${icon('list', 16)}</button>
          </div>
          <button class="icon-btn" data-act="print" title="Drucken / PDF">${icon('print')}</button>
          <button class="icon-btn" data-act="present" title="Ansicht vergrößern">${icon(document.body.classList.contains('presenting') ? 'shrink' : 'expand')}</button>
        </div>
      </div>
      <p class="print-only print-title">${esc(c.name)} · ${esc(layout.name)} · ${new Date().toLocaleDateString('de-DE')}</p>
      ${c.plan && !current ? `<p class="notice no-print">Anwesenheit oder Einstellungen wurden geändert. Mische neu, damit der Plan passt.</p>` : ''}
      <div class="room-wrap">${c.plan ? (view === 'plan' ? room(c) : groupList(c)) : `<div class="room-empty"><p>Noch keine Verteilung.</p></div>`}</div>
      ${c.plan ? `<p class="hint no-print">${icon('check', 14)} Die Farben zeigen die Gruppen – auch im Sitzplan.</p>` : ''}
    </div>
    <aside class="side no-print">
      <div class="card">
        <div class="card-head small">
          <h3>${icon('users', 16)} Schüler <span class="badge">${c.students.length}</span></h3>
          <button class="icon-btn sm" data-act="add-students" title="Schüler hinzufügen" aria-label="Schüler hinzufügen">${icon('plus', 16)}</button>
        </div>
        <p class="muted small-text"><span class="live-dot"></span>${present} anwesend</p>
        <input id="student-search" class="input" type="search" placeholder="Schüler suchen …" value="${esc(search)}" autocomplete="off">
        <ul class="student-list" id="student-list"></ul>
        <p class="muted small-text">„Heute krank“ gilt bis zum nächsten Öffnen.</p>
      </div>
      <div class="card">
        <h3>${icon('sliders', 16)} Organisationsform</h3>
        <div class="layout-grid">${LAYOUTS.map(l => `<button class="layout-opt ${l.id === c.settings.layout ? 'on' : ''}" data-act="layout" data-id="${l.id}" title="${esc(l.hint)}"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.4">${LAYOUT_PICS[l.id]}</svg><span>${esc(l.name)}</span></button>`).join('')}</div>
        <div class="num-row">
          <label ${usesTables ? '' : 'class="disabled"'}>Anzahl Tische<span class="stepper"><button data-act="step" data-k="tables" data-d="-1" ${usesTables ? '' : 'disabled'}>−</button><output>${c.settings.tables}</output><button data-act="step" data-k="tables" data-d="1" ${usesTables ? '' : 'disabled'}>+</button></span></label>
          <label>Anzahl Gruppen<span class="stepper"><button data-act="step" data-k="groups" data-d="-1">−</button><output>${c.settings.groups}</output><button data-act="step" data-k="groups" data-d="1">+</button></span></label>
        </div>
        <p class="muted small-text">${usesTables ? `Ein Tisch hat zwei Plätze. Für ${present} Anwesende in ${c.settings.groups} Gruppen sind mindestens ${minT} Tische nötig.` : 'Diese Form braucht keine Tische.'} Die Gruppen werden möglichst gleich groß.</p>
      </div>
      <div class="card">
        <button class="btn ghost full" data-act="rules">${icon('sliders', 16)} Einteilung anpassen</button>
        <p class="muted small-text center">Alle Einstellungen werden automatisch gespeichert.</p>
      </div>
    </aside>
  </div>`;
}

function drawStudents(root) {
  const c = cls(); if (!c) return;
  const ul = root.querySelector('#student-list'); if (!ul) return;
  const absent = absentFor(c), q = search.trim().toLocaleLowerCase('de');
  const groupOf = new Map((c.plan?.groups || []).flatMap((g, i) => g.map(id => [id, i])));
  const list = c.students.filter(s => !q || s.name.toLocaleLowerCase('de').includes(q));
  ul.innerHTML = list.map(s => {
    const off = absent.has(s.id), g = groupOf.get(s.id);
    return `<li class="${off ? 'off' : ''}"><span class="avatar" style="${g !== undefined ? palStyle(g) : ''}">${esc(initials(s.name))}</span>
      <button class="link name" data-act="rename" data-id="${esc(s.id)}" title="Namen bearbeiten">${esc(s.name)}</button>
      <button class="icon-btn xs ${off ? 'active' : ''}" data-act="sick" data-id="${esc(s.id)}" title="${off ? 'Wieder anwesend' : 'Heute krank'}" aria-pressed="${off}">${icon(off ? 'sick' : 'user', 15)}</button>
      <button class="icon-btn xs" data-act="del-student" data-id="${esc(s.id)}" title="Aus der Klasse entfernen" aria-label="Entfernen">${icon('x', 14)}</button></li>`;
  }).join('') || '<li class="muted small-text">Keine Treffer.</li>';
}

// ---------- Raumdarstellungen ----------
const seat = (c, id, g) => id
  ? `<div class="seat" style="${palStyle(g)}"><span>${esc(nameOf(c, id))}</span></div>`
  : `<div class="seat free"><span>frei</span></div>`;

function tablesFromPlan(c) {
  const tables = [];
  c.plan.groups.forEach((g, gi) => { for (let i = 0; i < g.length; i += 2) tables.push({ g: gi, a: g[i], b: g[i + 1] ?? null }); });
  return tables;
}

// Zweiertisch: Gruppenfarbe auf dem ganzen Tisch, Gruppennummer im Kopf
const deskTable = (c, t, label) => t.g < 0
  ? `<div class="table empty">${label ? `<small><span>${label}</span></small>` : ''}<div class="pair"><div class="seat free"></div><div class="seat free"></div></div></div>`
  : `<div class="table grouped" style="${palStyle(t.g)}"><small><b class="gtag">G${t.g + 1}</b>${label ? `<span>${label}</span>` : ''}</small><div class="pair">${seat(c, t.a, t.g) + seat(c, t.b, t.g)}</div></div>`;
// Legende über dem Raum: welche Farbe gehört zu welcher Gruppe
const legend = c => c.plan.groups.length > 1
  ? `<div class="legend">${c.plan.groups.map((g, gi) => `<span class="legend-item" style="${palStyle(gi)}"><span class="gdot"></span>Gruppe ${gi + 1}<em>${g.length}</em></span>`).join('')}</div>`
  : '';

function room(c) {
  const L = c.settings.layout;
  const front = `<div class="front"><span>Vorne · Tafel</span><div class="desk">Lehrerpult</div></div>`;
  if (L === 'omnibus') {
    const tables = tablesFromPlan(c);
    while (tables.length < c.settings.tables) tables.push({ g: -1, a: null, b: null });
    return `<div class="room omnibus">${front}${legend(c)}<div class="rows">${tables.map((t, i) => deskTable(c, t, `Tisch ${i + 1}`)).join('')}</div><div class="back">Hinten</div></div>`;
  }
  if (L === 'gruppen') {
    // Gruppentisch aus zusammengeschobenen Zweiertischen: zwei Längsseiten gegenüber,
    // ein übrig bleibender Tisch steht quer an der Stirnseite
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
    const ids = c.plan.groups.flatMap((g, gi) => g.map(id => ({ id, gi }))), n = ids.length || 1;
    const r = 42;
    return `<div class="room circle ${L}"><div class="ring">${ids.map((x, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return `<div class="seat round" style="${palStyle(x.gi)};left:${50 + r * Math.cos(a)}%;top:${50 + r * Math.sin(a)}%"><span>${esc(nameOf(c, x.id))}</span></div>`;
    }).join('')}<div class="ring-center">${L === 'sitzkreis' ? 'Sitzkreis' : 'Stehkreis'}</div></div></div>`;
  }
  // Arena / Kino: Reihen ohne Tische, Gruppen nebeneinander
  const ids = c.plan.groups.flatMap((g, gi) => g.map(id => ({ id, gi }))), per = Math.max(6, Math.ceil(Math.sqrt(ids.length * 2.2))), rows = [];
  for (let i = 0; i < ids.length; i += per) rows.push(ids.slice(i, i + per));
  return `<div class="room arena">${front}${rows.map((row, ri) => `<div class="arena-row" style="--curve:${ri}">${row.map(x => seat(c, x.id, x.gi)).join('')}</div>`).join('')}</div>`;
}

function groupList(c) {
  return `<div class="group-list">${c.plan.groups.map((g, gi) => `<div class="group-card" style="${palStyle(gi)}"><h4><span class="gdot"></span>Gruppe ${gi + 1} <span class="badge">${g.length}</span></h4><ol>${g.map(id => `<li>${esc(nameOf(c, id))}</li>`).join('')}</ol></div>`).join('')}</div>`;
}

// ---------- Aktionen ----------
function onChange(e) {
  if (e.target.id === 'class-select') { search = ''; store.update(s => { s.technik.activeId = e.target.value; }); }
}

async function onClick(e, root) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, c = cls();
  if (act === 'new-class') return newClassDialog();
  if (act === 'manage') return manageDialog();
  if (!c) return;
  const absent = absentFor(c);
  switch (act) {
    case 'view': view = b.dataset.v; draw(root); break;
    case 'print': window.print(); break;
    case 'present': toggleFullscreen(); draw(root); break;
    case 'layout': store.update(s => { cur(s).settings.layout = b.dataset.id; }); break;
    case 'step': {
      const k = b.dataset.k, d = Number(b.dataset.d);
      store.update(s => { const st = cur(s).settings; st[k] = Math.min(k === 'tables' ? 40 : 20, Math.max(1, st[k] + d)); });
      break;
    }
    case 'mix': {
      const res = mixGroups({ students: c.students, rules: c.rules, groupCount: c.settings.groups, layout: c.settings.layout, tables: c.settings.tables }, absent);
      if (!res.ok) return toast(res.message, { kind: 'warn' });
      store.update(s => { cur(s).plan = { groups: res.groups, createdAt: new Date().toISOString() }; });
      toast('Neu verteilt.');
      break;
    }
    case 'sick': {
      const id = b.dataset.id;
      absent.has(id) ? absent.delete(id) : absent.add(id);
      draw(root);
      break;
    }
    case 'rename': renameDialog(c, b.dataset.id); break;
    case 'del-student': {
      const st = c.students.find(s => s.id === b.dataset.id);
      if (!st || !(await confirmDialog('Schüler entfernen', `${st.name} dauerhaft aus „${c.name}“ entfernen? Zugehörige Trennungsregeln werden ebenfalls gelöscht.`, 'Entfernen'))) return;
      store.update(s => { const k = cur(s); k.students = k.students.filter(x => x.id !== st.id); k.rules = k.rules.filter(r => !r.includes(st.id)); if (k.plan) k.plan.groups = k.plan.groups.map(g => g.filter(id => id !== st.id)); });
      break;
    }
    case 'add-students': addStudentsDialog(c); break;
    case 'rules': rulesFor(c); break;
  }
}
const cur = s => s.technik.classes.find(c => c.id === s.technik.activeId);

function newClassDialog() {
  dialog({ title: 'Neue Klasse anlegen', submit: 'Klasse anlegen',
    body: `<label class="field">Name der Klasse<input name="name" class="input" maxlength="60" placeholder="z. B. 7ab · Technik" required></label>
      <label class="field">Vornamen <small class="muted">– einer pro Zeile oder durch Komma getrennt</small><textarea name="names" class="input" rows="8" placeholder="Anna&#10;Ben&#10;…"></textarea></label>
      <p class="muted small-text">Bitte nur Vornamen eintragen. Die Daten bleiben auf diesem Gerät.</p>`,
    onSubmit: fd => {
      const name = String(fd.get('name')).trim();
      if (!name) throw new Error('Bitte einen Namen für die Klasse eingeben.');
      const students = namesFromText(String(fd.get('names'))).slice(0, 80).map(n => ({ id: uid(), name: n }));
      const id = uid();
      store.update(s => { s.technik.classes.push({ id, name, students, settings: { layout: 'omnibus', tables: Math.max(8, Math.ceil(students.length / 2)), groups: 4 }, rules: [], plan: null }); s.technik.activeId = id; });
    } });
}

function manageDialog() {
  const s = store.get().technik;
  const d = dialog({ title: 'Klassen verwalten', submit: null, cancel: 'Fertig',
    body: `<ul class="manage-list">${s.classes.map(c => `<li><input class="input" data-rename="${esc(c.id)}" value="${esc(c.name)}" maxlength="60" aria-label="Name"><span class="muted small-text">${c.students.length} Schüler</span><button type="button" class="icon-btn" data-delete="${esc(c.id)}" title="Klasse löschen">${icon('trash')}</button></li>`).join('')}</ul>
      <button type="button" class="btn primary" data-new>${icon('plus')} Neue Klasse anlegen</button>`,
    onOpen: (el, close) => {
      el.querySelector('[data-new]').onclick = () => { close(); newClassDialog(); };
      el.querySelectorAll('[data-rename]').forEach(inp => inp.onchange = () => { const v = inp.value.trim(); if (v) store.update(st => { st.technik.classes.find(c => c.id === inp.dataset.rename).name = v; }); });
      el.querySelectorAll('[data-delete]').forEach(btn => btn.onclick = async () => {
        const c = store.get().technik.classes.find(x => x.id === btn.dataset.delete);
        close();
        if (!(await confirmDialog('Klasse löschen', `„${c.name}“ mit allen Schülern, Regeln und dem Sitzplan löschen?`))) return manageDialog();
        const backup = structuredClone(c);
        store.update(st => { st.technik.classes = st.technik.classes.filter(x => x.id !== c.id); if (st.technik.activeId === c.id) st.technik.activeId = st.technik.classes[0]?.id ?? null; });
        toast(`„${c.name}“ gelöscht.`, { action: 'Rückgängig', onAction: () => store.update(st => { st.technik.classes.push(backup); st.technik.activeId = backup.id; }) });
      });
    } });
  return d;
}

function addStudentsDialog(c) {
  dialog({ title: `Schüler zu „${c.name}“ hinzufügen`, submit: 'Hinzufügen',
    body: `<label class="field">Vornamen <small class="muted">– einer pro Zeile</small><textarea name="names" class="input" rows="6"></textarea></label>`,
    onSubmit: fd => {
      const names = namesFromText(String(fd.get('names')));
      if (!names.length) throw new Error('Bitte mindestens einen Vornamen eintragen.');
      if (c.students.length + names.length > 80) throw new Error('Eine Klasse kann höchstens 80 Schüler haben.');
      store.update(s => { cur(s).students.push(...names.map(n => ({ id: uid(), name: n }))); });
      toast(`${names.length} hinzugefügt. Verteile neu, um sie einzuplanen.`);
    } });
}

function renameDialog(c, id) {
  const st = c.students.find(s => s.id === id); if (!st) return;
  dialog({ title: 'Namen bearbeiten', body: `<label class="field">Vorname<input name="name" class="input" value="${esc(st.name)}" maxlength="40"></label>`,
    onSubmit: fd => { const v = String(fd.get('name')).trim(); if (!v) throw new Error('Der Name darf nicht leer sein.'); store.update(s => { cur(s).students.find(x => x.id === id).name = v; }); } });
}

function rulesFor(c) {
  rulesDialog({ title: 'Einteilung anpassen', people: c.students.map(s => ({ id: s.id, label: s.name })),
    getRules: () => cls()?.rules ?? [], note: 'Die Regeln gelten in jeder Organisationsform.',
    onAdd: pair => store.update(s => { cur(s).rules.push(pair); }),
    onDelete: i => store.update(s => { cur(s).rules.splice(i, 1); }) });
}

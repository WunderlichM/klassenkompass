// Bereich Sport: Teams, Turniere und Einzelranglisten
import * as store from './store.js';
import { mixGroups, teamsAreCurrent, roundRobin, tournamentTable, individualTable, reconcileSeries, linkTournament, uid } from './engine.js';
import { esc, icon, dialog, confirmDialog, toast, namesFromText, palStyle, toggleFullscreen, todayISO, displayDate, rulesDialog } from './ui.js';

const SPORTS = ['Fußball', 'Basketball', 'Volleyball', 'Handball', 'Badminton', 'Tischtennis', 'Leichtathletik', 'Turnen', 'Hockey', 'Brennball'];
const absentByGroup = new Map();
let tab = 'teams', search = '', activeTournament = null, activeSeries = null;

const grp = () => { const s = store.get().sport; return s.groups.find(g => g.id === s.activeId) || null; };
const cur = s => s.sport.groups.find(g => g.id === s.sport.activeId);
const absentFor = g => { if (!absentByGroup.has(g.id)) absentByGroup.set(g.id, new Set()); return absentByGroup.get(g.id); };
const person = (g, id) => g.students.find(s => s.id === id);

export function mount(root) {
  const render = () => draw(root);
  const off = store.subscribe(render);
  root.onclick = e => onClick(e, root);
  root.onchange = e => onChange(e, root);
  root.oninput = e => { if (e.target.id === 'sport-search') { search = e.target.value; drawPeople(root); } };
  render();
  return () => { off(); root.onclick = root.onchange = root.oninput = null; };
}

function draw(root) {
  const s = store.get().sport, g = grp();
  root.innerHTML = `
  <section class="page sport">
    <div class="page-head">
      <div>
        <p class="eyebrow">Sport · Zusammen spielen</p>
        <h1>Teams &amp; Ranglisten<span class="dot">.</span></h1>
        <p class="sub">Teams mischen. Ergebnisse zählen. Fortschritte sehen.</p>
      </div>
      <div class="picker">
        <label class="eyebrow" for="group-select">Deine Sportgruppe</label>
        <div class="picker-row">
          <select id="group-select" class="select">${s.groups.map(x => `<option value="${esc(x.id)}" ${x.id === s.activeId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}${s.groups.length ? '' : '<option>Noch keine Gruppe</option>'}</select>
          <button class="icon-btn" data-act="manage" title="Gruppen verwalten" aria-label="Gruppen verwalten">${icon('sliders')}</button>
        </div>
      </div>
    </div>
    ${g ? `
    <div class="tabs-row no-print">
      <div class="tabs" role="tablist">
        ${[['teams', 'users', 'Teams'], ['turnier', 'trophy', 'Turnier'], ['rangliste', 'chart', 'Einzelrangliste']].map(([id, ic, label]) => `<button role="tab" aria-selected="${tab === id}" class="${tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}">${icon(ic, 16)} ${label}</button>`).join('')}
      </div>
      <div class="tools"><button class="btn ghost sm" data-act="print">${icon('print', 16)} Drucken / PDF</button><button class="btn ghost sm" data-act="present">${icon(document.body.classList.contains('presenting') ? 'shrink' : 'expand', 16)} ${document.body.classList.contains('presenting') ? 'Ansicht verkleinern' : 'Ansicht vergrößern'}</button></div>
    </div>
    <div class="work-grid">
      <div class="main-col print-area">${tab === 'teams' ? teamsView(g) : tab === 'turnier' ? tournamentView(g) : seriesView(g)}</div>
      <aside class="side no-print">${sidebar(g)}</aside>
    </div>` : `<div class="card empty"><p>Lege deine erste Sportgruppe an. Gespeichert werden nur Vornamen und Klasse.</p><button class="btn primary" data-act="new-group">${icon('plus')} Neue Sportgruppe</button></div>`}
  </section>`;
  drawPeople(root);
}

// ---------- Teams ----------
function teamsView(g) {
  const absent = absentFor(g), present = g.students.filter(s => !absent.has(s.id)).length;
  const current = teamsAreCurrent(g, absent);
  return `<div class="card">
    <div class="card-head">
      <div><p class="eyebrow">Heute gemeinsam</p><h2>Deine Teams <span class="badge">${present} dabei</span></h2></div>
      <button class="btn primary sport-btn no-print" data-act="mix">${icon('shuffle')} Neu mischen</button>
    </div>
    <p class="print-only print-title">${esc(g.name)} · Teams · ${new Date().toLocaleDateString('de-DE')}</p>
    ${g.teams.length ? `<div class="team-grid">${g.teams.map((t, i) => `<div class="team" style="${palStyle(i)}"><h4><span class="gdot"></span>${esc(t.name)}<span class="count">${t.members.length}</span></h4><ul>${t.members.map(id => { const p = person(g, id); return p ? `<li>${esc(p.name)}${p.className ? `<small>${esc(p.className)}</small>` : ''}</li>` : ''; }).join('')}</ul></div>`).join('')}</div>`
      : `<div class="room-empty"><p>Noch keine Teams.</p></div>`}
    ${g.teams.length && !current ? '<p class="notice">Die Anwesenheit oder Teamanzahl wurde geändert. Mische neu, bevor du ein neues Turnier anlegst.</p>' : ''}
    <div class="card-foot no-print"><span class="muted small-text">${icon('check', 14)} Teams sind möglichst gleich groß.</span>
      <button class="btn ghost" data-act="new-tournament" ${g.teams.length >= 2 && current ? '' : 'disabled'}>Turnier mit diesen Teams →</button></div>
  </div>`;
}

function sidebar(g) {
  const absent = absentFor(g), present = g.students.filter(s => !absent.has(s.id)).length;
  return `
    <div class="card">
      <h3>Gruppeneinstellungen</h3>
      <label class="field inline">Anzahl Teams<select class="select sm" id="team-count">${Array.from({ length: 19 }, (_, i) => i + 2).map(n => `<option ${n === g.teamCount ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <p class="muted small-text">Alle heute anwesenden Personen werden genau einmal zugeordnet.</p>
    </div>
    <div class="card">
      <div class="card-head small"><h3>${icon('users', 16)} Anwesenheit <span class="badge">${present}/${g.students.length}</span></h3>
        <button class="icon-btn sm" data-act="add-people" title="Personen hinzufügen" aria-label="Personen hinzufügen">${icon('plus', 16)}</button></div>
      <input id="sport-search" class="input" type="search" placeholder="Vorname oder Klasse …" value="${esc(search)}" autocomplete="off">
      <ul class="student-list" id="people-list"></ul>
      <p class="muted small-text">„Heute nicht dabei“ gilt bis zum nächsten Öffnen.</p>
    </div>
    <div class="card">
      <button class="btn ghost full" data-act="rules">${icon('sliders', 16)} Einteilung anpassen</button>
    </div>`;
}

function drawPeople(root) {
  const g = grp(); const ul = root.querySelector('#people-list'); if (!g || !ul) return;
  const absent = absentFor(g), q = search.trim().toLocaleLowerCase('de');
  const list = g.students.filter(s => !q || (s.name + ' ' + s.className).toLocaleLowerCase('de').includes(q));
  ul.innerHTML = list.map(s => { const off = absent.has(s.id); return `<li class="${off ? 'off' : ''}">
      <button class="link name" data-act="edit-person" data-id="${esc(s.id)}">${esc(s.name)}</button>${s.className ? `<small class="cls">${esc(s.className)}</small>` : ''}
      <button class="icon-btn xs ${off ? 'active' : ''}" data-act="absent" data-id="${esc(s.id)}" title="${off ? 'Wieder dabei' : 'Heute nicht dabei'}" aria-pressed="${off}">${icon(off ? 'sick' : 'user', 15)}</button>
      <button class="icon-btn xs" data-act="del-person" data-id="${esc(s.id)}" title="Aus der Gruppe entfernen" aria-label="Entfernen">${icon('x', 14)}</button></li>`; }).join('') || '<li class="muted small-text">Keine Treffer.</li>';
}

// ---------- Turniere ----------
function tournamentView(g) {
  const list = [...g.tournaments].reverse();
  if (!list.length) return `<div class="card empty"><p>Noch kein Turnier. Mische zuerst Teams und wähle dann „Turnier mit diesen Teams“.</p><button class="btn primary sport-btn" data-act="tab" data-tab="teams">Zu den Teams</button></div>`;
  const t = g.tournaments.find(x => x.id === activeTournament) || list[0];
  activeTournament = t.id;
  const rounds = [...new Set(t.matches.map(m => m.round))].sort((a, b) => a - b);
  const teamName = id => t.teams.find(x => x.id === id)?.name ?? '?';
  const done = t.matches.filter(m => m.scoreA !== null && m.scoreB !== null).length;
  const byeTeams = r => t.teams.filter(team => !t.matches.some(m => m.round === r && (m.a === team.id || m.b === team.id)));
  return `<div class="card">
    <div class="card-head">
      <div><p class="eyebrow">${esc(t.sport)} · ${esc(displayDate(t.date))}</p><h2>${esc(t.title)} <span class="badge">${done}/${t.matches.length} Spiele</span></h2></div>
      <div class="tools no-print">
        ${list.length > 1 ? `<select class="select sm" id="tournament-select">${list.map(x => `<option value="${esc(x.id)}" ${x.id === t.id ? 'selected' : ''}>${esc(x.title)} · ${esc(displayDate(x.date))}</option>`).join('')}</select>` : ''}
        <button class="icon-btn" data-act="edit-tournament" title="Turnier bearbeiten">${icon('edit')}</button>
        <button class="icon-btn" data-act="del-tournament" title="Turnier löschen">${icon('trash')}</button>
      </div>
    </div>
    <div class="t-layout">
      <div class="schedule">${rounds.map(r => `<div class="round"><h4>Runde ${r}${byeTeams(r).length ? ` <small class="muted">· spielfrei: ${byeTeams(r).map(x => esc(x.name)).join(', ')}</small>` : ''}</h4>
        ${t.matches.filter(m => m.round === r).map(m => `<div class="match"><span class="ta">${esc(teamName(m.a))}</span>
          <input class="score" type="number" inputmode="numeric" min="0" max="999" data-score="${esc(m.id)}" data-side="A" value="${m.scoreA ?? ''}" aria-label="Ergebnis ${esc(teamName(m.a))}">
          <span class="colon">:</span>
          <input class="score" type="number" inputmode="numeric" min="0" max="999" data-score="${esc(m.id)}" data-side="B" value="${m.scoreB ?? ''}" aria-label="Ergebnis ${esc(teamName(m.b))}">
          <span class="tb">${esc(teamName(m.b))}</span></div>`).join('')}</div>`).join('')}</div>
      <div class="standings"><h4>Tabelle</h4>${standings(t)}<p class="muted small-text">Sieg ${t.win} · Unentschieden ${t.draw} · Niederlage ${t.loss} Punkte. Ein Spiel zählt, wenn beide Ergebnisse eingetragen sind.</p>
        <details class="teams-detail"><summary>Teams anzeigen</summary>${t.teams.map((team, i) => `<p style="${palStyle(i)}"><span class="gdot"></span><b>${esc(team.name)}:</b> ${team.members.map(id => esc(t.participants.find(p => p.id === id)?.name ?? '?')).join(', ')}</p>`).join('')}</details>
        <button class="btn ghost full no-print" data-act="link-series" ${done === t.matches.length ? '' : 'disabled'}>${icon('chart', 16)} In Einzelrangliste übernehmen</button></div>
    </div>
  </div>`;
}
function standings(t) {
  const rows = tournamentTable(t);
  return `<table class="table-std"><thead><tr><th>#</th><th>Team</th><th title="Spiele">Sp</th><th title="Siege">S</th><th title="Unentschieden">U</th><th title="Niederlagen">N</th><th title="Tore/Punkte">±</th><th>Pkt</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${r.rank}.</td><td>${esc(r.name)}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td><td>${r.scored}:${r.conceded}</td><td><b>${r.points}</b></td></tr>`).join('')}</tbody></table>`;
}

// ---------- Einzelranglisten ----------
function seriesView(g) {
  if (!g.series.length) return `<div class="card empty"><p>Lege für jede Sportart eine eigene Rangliste an. Punkte aus mehreren Wochen werden addiert.</p><button class="btn primary sport-btn" data-act="new-series">${icon('plus')} Neue Rangliste</button></div>`;
  const s = g.series.find(x => x.id === activeSeries) || g.series[0];
  activeSeries = s.id;
  const rows = individualTable(s), sessions = [...s.sessions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<div class="card">
    <div class="card-head">
      <div><p class="eyebrow">${esc(s.sport)} · Einzelrangliste</p><h2>${esc(s.title)} <span class="badge">${s.sessions.length} Spieltage</span></h2></div>
      <div class="tools no-print">
        <select class="select sm" id="series-select">${g.series.map(x => `<option value="${esc(x.id)}" ${x.id === s.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select>
        <button class="icon-btn" data-act="new-series" title="Neue Rangliste">${icon('plus')}</button>
        <button class="icon-btn" data-act="del-series" title="Rangliste löschen">${icon('trash')}</button>
      </div>
    </div>
    <div class="t-layout">
      <div><h4>Rangliste</h4>${rows.length ? `<table class="table-std"><thead><tr><th>#</th><th>Name</th><th>Klasse</th><th>Spieltage</th><th>Punkte</th></tr></thead><tbody>${rows.map(r => `<tr class="${r.rank <= 3 ? 'top' + r.rank : ''}"><td>${r.rank}.</td><td>${esc(r.name)}</td><td>${esc(r.className)}</td><td>${r.sessions}</td><td><b>${r.points}</b></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Noch keine Punkte eingetragen.</p>'}</div>
      <div><h4>Spieltage</h4>
        <button class="btn primary sport-btn full no-print" data-act="new-session">${icon('plus')} Spieltag eintragen</button>
        <ul class="sessions">${sessions.map(x => `<li><div><b>${esc(x.title || 'Spieltag')}</b><small class="muted">${esc(displayDate(x.date))}${x.tournamentId ? ' · aus Turnier' : ''}</small></div>
          <span class="no-print">${x.tournamentId ? '' : `<button class="icon-btn xs" data-act="edit-session" data-id="${esc(x.id)}" title="Bearbeiten">${icon('edit', 14)}</button>`}<button class="icon-btn xs" data-act="del-session" data-id="${esc(x.id)}" title="Löschen">${icon('trash', 14)}</button></span></li>`).join('')}</ul>
        <p class="muted small-text">Leeres Feld = keine Wertung; eine eingetragene 0 zählt als Teilnahme. Turnierpunkte werden im Turnier korrigiert.</p>
      </div>
    </div>
  </div>`;
}

// ---------- Aktionen ----------
function onChange(e, root) {
  const t = e.target;
  if (t.id === 'group-select') { search = ''; activeTournament = activeSeries = null; store.update(s => { s.sport.activeId = t.value; }); }
  else if (t.id === 'team-count') store.update(s => { cur(s).teamCount = Number(t.value); });
  else if (t.id === 'tournament-select') { activeTournament = t.value; draw(root); }
  else if (t.id === 'series-select') { activeSeries = t.value; draw(root); }
  else if (t.dataset.score) {
    const v = t.value === '' ? null : Math.max(0, Math.min(999, Math.round(Number(t.value))));
    store.update(s => {
      const g = cur(s), tour = g.tournaments.find(x => x.id === activeTournament), m = tour.matches.find(x => x.id === t.dataset.score);
      m['score' + t.dataset.side] = Number.isFinite(v) ? v : null;
      reconcileSeries(g);
    });
  }
}

async function onClick(e, root) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'new-group') return groupDialog();
  if (act === 'manage') return manageDialog();
  const g = grp(); if (!g) return;
  const absent = absentFor(g);
  switch (act) {
    case 'tab': tab = b.dataset.tab; draw(root); break;
    case 'print': window.print(); break;
    case 'present': toggleFullscreen(); draw(root); break;
    case 'mix': {
      const res = mixGroups({ students: g.students, rules: g.rules, groupCount: g.teamCount }, absent);
      if (!res.ok) return toast(res.message, { kind: 'warn' });
      store.update(s => { cur(s).teams = res.groups.map((members, i) => ({ id: uid(), name: 'Team ' + (i + 1), members })); });
      break;
    }
    case 'absent': { const id = b.dataset.id; absent.has(id) ? absent.delete(id) : absent.add(id); draw(root); break; }
    case 'add-people': peopleDialog(g); break;
    case 'edit-person': personDialog(g, b.dataset.id); break;
    case 'del-person': {
      const p = person(g, b.dataset.id);
      if (!p || !(await confirmDialog('Person entfernen', `${p.name} aus „${g.name}“ entfernen? Turniere und Ranglisten behalten den Namen.`, 'Entfernen'))) return;
      store.update(s => { const k = cur(s); k.students = k.students.filter(x => x.id !== p.id); k.rules = k.rules.filter(r => !r.includes(p.id)); k.teams = k.teams.map(t => ({ ...t, members: t.members.filter(id => id !== p.id) })); });
      break;
    }
    case 'rules': rulesFor(g); break;
    case 'new-tournament': tournamentDialog(g); break;
    case 'edit-tournament': tournamentDialog(g, g.tournaments.find(x => x.id === activeTournament)); break;
    case 'del-tournament': {
      const t = g.tournaments.find(x => x.id === activeTournament);
      if (!(await confirmDialog('Turnier löschen', `„${t.title}“ löschen? Übernommene Ranglisteneinträge werden ebenfalls entfernt.`))) return;
      store.update(s => { const k = cur(s); k.tournaments = k.tournaments.filter(x => x.id !== t.id); k.series.forEach(se => { se.sessions = se.sessions.filter(x => x.tournamentId !== t.id); }); });
      activeTournament = null; break;
    }
    case 'link-series': linkDialog(g); break;
    case 'new-series': seriesDialog(g); break;
    case 'del-series': {
      const se = g.series.find(x => x.id === activeSeries);
      if (!(await confirmDialog('Rangliste löschen', `„${se.title}“ mit allen Spieltagen löschen?`))) return;
      store.update(s => { const k = cur(s); k.series = k.series.filter(x => x.id !== se.id); }); activeSeries = null; break;
    }
    case 'new-session': sessionDialog(g); break;
    case 'edit-session': sessionDialog(g, b.dataset.id); break;
    case 'del-session': {
      if (!(await confirmDialog('Spieltag löschen', 'Diesen Spieltag mit allen Punkten löschen?'))) return;
      store.update(s => { const se = cur(s).series.find(x => x.id === activeSeries); se.sessions = se.sessions.filter(x => x.id !== b.dataset.id); }); break;
    }
  }
}

function parsePeople(text) {
  // Zeilen „Vorname, Klasse“ oder „Vorname (Klasse)“ oder nur „Vorname“
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(.+?)\s*[,;(\t]\s*([^)]*)\)?$/);
    return { id: uid(), name: (m ? m[1] : l).trim().slice(0, 40), className: (m ? m[2] : '').trim().slice(0, 20) };
  }).filter(p => p.name);
}

function groupDialog() {
  dialog({ title: 'Neue Sportgruppe', submit: 'Gruppe anlegen',
    body: `<label class="field">Name der Gruppe<input name="name" class="input" maxlength="60" placeholder="z. B. Sport 6a/6b"></label>
      <label class="field">Personen <small class="muted">– eine pro Zeile, optional mit Klasse: „Anna, 6a“</small><textarea name="names" class="input" rows="9"></textarea></label>`,
    onSubmit: fd => {
      const name = String(fd.get('name')).trim(); if (!name) throw new Error('Bitte einen Namen für die Gruppe eingeben.');
      const students = parsePeople(String(fd.get('names'))).slice(0, 120), id = uid();
      store.update(s => { s.sport.groups.push({ id, name, students, teamCount: 4, rules: [], teams: [], tournaments: [], series: [] }); s.sport.activeId = id; });
    } });
}

function manageDialog() {
  const s = store.get().sport;
  dialog({ title: 'Sportgruppen verwalten', submit: null, cancel: 'Fertig',
    body: `<ul class="manage-list">${s.groups.map(g => `<li><input class="input" data-rename="${esc(g.id)}" value="${esc(g.name)}" maxlength="60" aria-label="Name"><span class="muted small-text">${g.students.length} Personen</span><button type="button" class="icon-btn" data-copy="${esc(g.id)}" title="Kopie anlegen">${icon('plus')}</button><button type="button" class="icon-btn" data-delete="${esc(g.id)}" title="Gruppe löschen">${icon('trash')}</button></li>`).join('')}</ul>
      <button type="button" class="btn primary" data-new>${icon('plus')} Neue Sportgruppe</button>`,
    onOpen: (el, close) => {
      el.querySelector('[data-new]').onclick = () => { close(); groupDialog(); };
      el.querySelectorAll('[data-rename]').forEach(inp => inp.onchange = () => { const v = inp.value.trim(); if (v) store.update(st => { st.sport.groups.find(x => x.id === inp.dataset.rename).name = v; }); });
      el.querySelectorAll('[data-copy]').forEach(btn => btn.onclick = () => {
        const src = store.get().sport.groups.find(x => x.id === btn.dataset.copy), id = uid();
        store.update(st => { st.sport.groups.push({ id, name: src.name + ' (Kopie)', students: src.students.map(p => ({ ...p })), teamCount: src.teamCount, rules: src.rules.map(r => [...r]), teams: [], tournaments: [], series: [] }); st.sport.activeId = id; });
        close(); toast('Kopie angelegt (ohne Turniere und Ranglisten).');
      });
      el.querySelectorAll('[data-delete]').forEach(btn => btn.onclick = async () => {
        const g = store.get().sport.groups.find(x => x.id === btn.dataset.delete); close();
        if (!(await confirmDialog('Sportgruppe löschen', `„${g.name}“ mit Teams, Turnieren und Ranglisten löschen?`))) return manageDialog();
        const backup = structuredClone(g);
        store.update(st => { st.sport.groups = st.sport.groups.filter(x => x.id !== g.id); if (st.sport.activeId === g.id) st.sport.activeId = st.sport.groups[0]?.id ?? null; });
        toast(`„${g.name}“ gelöscht.`, { action: 'Rückgängig', onAction: () => store.update(st => { st.sport.groups.push(backup); st.sport.activeId = backup.id; }) });
      });
    } });
}

function peopleDialog(g) {
  dialog({ title: `Personen zu „${g.name}“ hinzufügen`, submit: 'Hinzufügen',
    body: `<label class="field">Eine Person pro Zeile, optional mit Klasse: „Anna, 6a“<textarea name="names" class="input" rows="6"></textarea></label>`,
    onSubmit: fd => {
      const people = parsePeople(String(fd.get('names')));
      if (!people.length) throw new Error('Bitte mindestens einen Vornamen eintragen.');
      if (g.students.length + people.length > 120) throw new Error('Eine Sportgruppe kann höchstens 120 Personen haben.');
      store.update(s => { cur(s).students.push(...people); });
    } });
}

function personDialog(g, id) {
  const p = person(g, id); if (!p) return;
  dialog({ title: 'Person bearbeiten', body: `<div class="two"><label class="field">Vorname<input name="name" class="input" value="${esc(p.name)}" maxlength="40"></label><label class="field">Klasse<input name="cls" class="input" value="${esc(p.className)}" maxlength="20"></label></div>`,
    onSubmit: fd => { const n = String(fd.get('name')).trim(); if (!n) throw new Error('Der Name darf nicht leer sein.'); store.update(s => { const x = cur(s).students.find(y => y.id === id); x.name = n; x.className = String(fd.get('cls')).trim(); }); } });
}

function rulesFor(g) {
  rulesDialog({ title: 'Einteilung anpassen', people: g.students.map(p => ({ id: p.id, label: p.name + (p.className ? ' (' + p.className + ')' : '') })),
    getRules: () => grp()?.rules ?? [],
    onAdd: pair => store.update(s => { cur(s).rules.push(pair); }),
    onDelete: i => store.update(s => { cur(s).rules.splice(i, 1); }) });
}

function tournamentDialog(g, existing) {
  const t = existing || { title: 'Turnier', sport: 'Fußball', date: todayISO(), win: 3, draw: 1, loss: 0 };
  dialog({ title: existing ? 'Turnier bearbeiten' : 'Turnier mit diesen Teams', submit: existing ? 'Speichern' : 'Turnier anlegen',
    body: `<label class="field">Titel<input name="title" class="input" maxlength="80" value="${esc(t.title)}"></label>
      <div class="two"><label class="field">Sportart<input name="sport" class="input" list="sports" maxlength="40" value="${esc(t.sport)}"><datalist id="sports">${SPORTS.map(x => `<option value="${x}">`).join('')}</datalist></label>
      <label class="field">Datum<input name="date" type="date" class="input" value="${esc(t.date)}"></label></div>
      <div class="three"><label class="field">Punkte Sieg<input name="win" type="number" class="input" value="${t.win}"></label><label class="field">Unentschieden<input name="draw" type="number" class="input" value="${t.draw}"></label><label class="field">Niederlage<input name="loss" type="number" class="input" value="${t.loss}"></label></div>
      ${existing ? '' : `<p class="muted small-text">Jedes Team spielt einmal gegen jedes andere. Die aktuelle Teamverteilung (${g.teams.length} Teams) wird übernommen.</p>`}`,
    onSubmit: fd => {
      const data = { title: String(fd.get('title')).trim() || 'Turnier', sport: String(fd.get('sport')).trim() || 'Sport', date: String(fd.get('date')) || todayISO(),
        win: Number(fd.get('win')) || 0, draw: Number(fd.get('draw')) || 0, loss: Number(fd.get('loss')) || 0 };
      store.update(s => {
        const k = cur(s);
        if (existing) { Object.assign(k.tournaments.find(x => x.id === existing.id), data); reconcileSeries(k); return; }
        const teams = k.teams.map(x => ({ ...x, members: [...x.members] })), ids = new Set(teams.flatMap(x => x.members));
        const tour = { id: uid(), ...data, participants: k.students.filter(p => ids.has(p.id)).map(p => ({ ...p })), teams, matches: roundRobin(teams) };
        k.tournaments.push(tour); activeTournament = tour.id;
      });
      tab = 'turnier'; draw(document.getElementById('view'));
    } });
}

function linkDialog(g) {
  const t = g.tournaments.find(x => x.id === activeTournament);
  const same = g.series.filter(s => s.sport.toLocaleLowerCase('de') === t.sport.toLocaleLowerCase('de'));
  dialog({ title: 'In Einzelrangliste übernehmen', submit: 'Übernehmen',
    body: `<label class="field">Rangliste (${esc(t.sport)})<select name="series" class="select">${same.map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('')}<option value="__new">+ Neue Rangliste „${esc(t.sport)}“</option></select></label>
      <p class="muted small-text">Jede teilnehmende Person erhält die Turnierpunkte ihres Teams. Spätere Korrekturen im Turnier aktualisieren den Eintrag automatisch.</p>`,
    onSubmit: fd => {
      let sid = String(fd.get('series'));
      store.update(s => {
        const k = cur(s);
        if (sid === '__new') { sid = uid(); k.series.push({ id: sid, title: 'Rangliste ' + t.sport, sport: t.sport, participants: [], sessions: [] }); }
        linkTournament(k, t.id, sid);
      });
      activeSeries = sid; toast('In die Rangliste übernommen.');
    } });
}

function seriesDialog(g) {
  dialog({ title: 'Neue Einzelrangliste', submit: 'Anlegen',
    body: `<label class="field">Titel<input name="title" class="input" maxlength="80" placeholder="z. B. Badminton-Liga"></label>
      <label class="field">Sportart<input name="sport" class="input" list="sports2" maxlength="40" value="Badminton"><datalist id="sports2">${SPORTS.map(x => `<option value="${x}">`).join('')}</datalist></label>`,
    onSubmit: fd => {
      const sport = String(fd.get('sport')).trim() || 'Sport', title = String(fd.get('title')).trim() || 'Rangliste ' + sport, id = uid();
      store.update(s => { cur(s).series.push({ id, title, sport, participants: [], sessions: [] }); });
      activeSeries = id; tab = 'rangliste';
    } });
}

function sessionDialog(g, sessionId) {
  const se = g.series.find(x => x.id === activeSeries), existing = se.sessions.find(x => x.id === sessionId);
  const absent = absentFor(g);
  const people = [...se.participants.filter(p => !g.students.some(s => s.id === p.id) && existing && Object.prototype.hasOwnProperty.call(existing.points, p.id)), ...g.students];
  dialog({ title: existing ? 'Spieltag bearbeiten' : 'Spieltag eintragen', wide: true, submit: 'Speichern',
    body: `<div class="two"><label class="field">Datum<input name="date" type="date" class="input" value="${esc(existing?.date || todayISO())}"></label><label class="field">Titel<input name="title" class="input" maxlength="80" value="${esc(existing?.title || 'Spieltag')}"></label></div>
      <div class="points-grid">${people.map(p => `<label class="${absent.has(p.id) && !existing ? 'off' : ''}"><span>${esc(p.name)} <small class="muted">${esc(p.className)}</small></span><input class="input" type="number" inputmode="decimal" step="any" name="p:${esc(p.id)}" value="${existing && Object.prototype.hasOwnProperty.call(existing.points, p.id) ? existing.points[p.id] : ''}"></label>`).join('')}</div>
      <p class="muted small-text">Leeres Feld = keine Wertung. 0 zählt als Teilnahme.</p>`,
    onSubmit: fd => {
      const points = {};
      for (const [k, v] of fd.entries()) if (k.startsWith('p:') && String(v).trim() !== '' && Number.isFinite(Number(v))) points[k.slice(2)] = Number(v);
      if (!Object.keys(points).length) throw new Error('Bitte mindestens für eine Person Punkte eintragen.');
      store.update(s => {
        const k = cur(s), series = k.series.find(x => x.id === se.id);
        const known = new Set(series.participants.map(p => p.id));
        series.participants.push(...people.filter(p => points[p.id] !== undefined && !known.has(p.id)).map(p => ({ id: p.id, name: p.name, className: p.className })));
        const data = { date: String(fd.get('date')) || todayISO(), title: String(fd.get('title')).trim() || 'Spieltag', points, tournamentId: null };
        if (existing) Object.assign(series.sessions.find(x => x.id === existing.id), data); else series.sessions.push({ id: uid(), ...data });
      });
    } });
}

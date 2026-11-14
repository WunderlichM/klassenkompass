// Bereich Turniere (seit 2.0.0): Turniere (Jeder gegen jeden, K.-o. mit Platzierung, King of the Court) und
// Einzelranglisten einer Lerngruppe. Die Teams kommen aus Gruppen → Teams (js/gruppen.js).
import * as store from './store.js';
import * as groups from './groups.js';
import { tournamentTable, individualTable, reconcileSeries, linkTournament, uid, FORMATS, formatOf, matchWinner, koPlan, koLabel, koSize, kotcPlan, kotcCourts, defaultCourtPoints, syncTournament, tournamentDone, createTournament, teamsAreCurrent } from './engine.js';
import { esc, icon, dialog, confirmDialog, toast, palStyle, toggleFullscreen, todayISO, displayDate } from './ui.js';

const SPORTS = ['Fußball', 'Basketball', 'Volleyball', 'Handball', 'Badminton', 'Tischtennis', 'Leichtathletik', 'Turnen', 'Hockey', 'Brennball', 'Völkerball', 'Treibball'];
let tab = 'turnier', activeTournament = null, activeSeries = null, root = null;
const sportOf = g => groups.sportView(g);
const cur = (s, g) => groups.sportPart(s, g.id);

export function mount(el) {
  root = el;
  const off = store.subscribe(draw);
  el.onclick = onClick;
  el.onchange = onChange;
  draw();
  return () => { off(); el.onclick = el.onchange = null; root = null; };
}

function draw() {
  if (!root) return;
  const g = groups.active(), presenting = document.body.classList.contains('presenting');
  if (g && !g.sport?.tournaments.some(t => t.id === activeTournament)) activeTournament = null;
  root.innerHTML = `
  <section class="page sport turniere">
    <div class="page-head">
      <div>
        <p class="eyebrow">Turniere${g ? ' · ' + esc(g.subject) : ''}</p>
        <h1>Turniere &amp; Ranglisten<span class="dot">.</span></h1>
        <p class="sub">Ergebnisse zählen. Fortschritte sehen.</p>
      </div>
      ${groups.pickerHtml(g)}
    </div>
    ${g ? `
    <div class="tabs-row no-print">
      <div class="tabs" role="tablist">
        ${[['turnier', 'trophy', 'Turniere'], ['rangliste', 'chart', 'Einzelrangliste']].map(([id, ic, label]) => `<button role="tab" aria-selected="${tab === id}" class="${tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}">${icon(ic, 16)} ${label}</button>`).join('')}
      </div>
      <div class="tools"><button class="btn ghost sm" data-act="print">${icon('print', 16)} Drucken / PDF</button><button class="btn ghost sm" data-act="present">${icon(presenting ? 'shrink' : 'expand', 16)} ${presenting ? 'Ansicht verkleinern' : 'Ansicht vergrößern'}</button></div>
    </div>
    <div class="work-grid">
      <div class="main-col print-area">${tab === 'turnier' ? tournamentView(g) : seriesView(g)}</div>
      <aside class="side no-print">${sidebar(g)}</aside>
    </div>` : groups.emptyHtml()}
  </section>`;
}

// Seitenleiste: aktuelle Teams aus „Gruppen“ und der Weg zum neuen Turnier
function sidebar(g) {
  const k = sportOf(g), current = teamsAreCurrent(k, groups.absent(g.id));
  return `<div class="card">
      <div class="card-head small"><h3>${icon('users', 16)} Aktuelle Teams <span class="badge">${k.teams.length}</span></h3></div>
      ${k.teams.length ? `<ul class="team-mini">${k.teams.map((t, i) => `<li style="${palStyle(i)}"><span class="gdot"></span>${esc(t.name)} <small class="muted">${t.members.length}</small></li>`).join('')}</ul>` : '<p class="muted small-text">Noch keine Teams.</p>'}
      ${k.teams.length && !current ? '<p class="notice small-text">Anwesenheit oder Teamzahl haben sich geändert – unter Gruppen → Teams neu mischen.</p>' : ''}
      <button class="btn primary sport-btn full" data-act="new-tournament" ${k.teams.length >= 2 && current ? '' : 'disabled'}>${icon('plus', 16)} Turnier mit diesen Teams</button>
      <a class="btn ghost full" href="#/" data-act="to-teams">${icon('shuffle', 16)} Teams mischen (Gruppen)</a>
    </div>
    <div class="card"><p class="muted small-text">Turnierformen ohne Ausscheiden und Warten: Bei K.-o. spielen Verlierer um die hinteren Plätze, bei King of the Court steigen Teams über mehrere Felder auf und ab.</p></div>`;
}

// ---------- Turniere ----------
function tournamentView(g) {
  const k = sportOf(g), list = [...k.tournaments].reverse();
  if (!list.length) return `<div class="card empty"><p>Noch kein Turnier. Mische unter Gruppen → Teams und lege dann ein Turnier an.</p><a class="btn primary sport-btn" href="#/" data-act="to-teams">Zu den Teams</a></div>`;
  const t = k.tournaments.find(x => x.id === activeTournament) || list[0];
  activeTournament = t.id;
  const f = formatOf(t), finished = tournamentDone(t);
  const plan = f === 'ko' ? koPlan(t) : f === 'kotc' ? kotcPlan(t) : null;
  const rounds = [...new Set(t.matches.map(m => m.round))].sort((a, b) => a - b);
  const teamName = id => t.teams.find(x => x.id === id)?.name ?? '?';
  const done = t.matches.filter(m => m.scoreA !== null && m.scoreB !== null).length;
  const freeTeams = r => plan ? (plan.free[r] || []).map(teamName) : t.teams.filter(team => !t.matches.some(m => m.round === r && (m.a === team.id || m.b === team.id))).map(x => x.name);
  const totalRounds = f === 'ko' ? Math.log2(koSize(t.teams.length)) : f === 'kotc' ? t.rounds : rounds.length;
  const badge = f === 'rr' ? `${done}/${t.matches.length} Spiele` : finished ? 'beendet' : `Runde ${rounds.at(-1) ?? 1} von ${totalRounds}`;
  const label = m => f === 'ko' ? koLabel(t, m) : f === 'kotc' ? `Feld ${m.court}${m.court === 1 ? ' · Königsfeld' : ''}` : '';
  const ordered = r => { const ms = t.matches.filter(m => m.round === r); return f === 'rr' ? ms : ms.sort((x, y) => x.court - y.court || (x.pos ?? 0) - (y.pos ?? 0)); };
  const matchRow = m => {
    const w = f === 'rr' ? null : matchWinner(m), tie = f !== 'rr' && m.scoreA !== null && m.scoreA === m.scoreB;
    return `<div class="match-wrap">${label(m) ? `<p class="match-label">${esc(label(m))}</p>` : ''}<div class="match"><span class="ta ${w === 'A' ? 'win' : ''}">${esc(teamName(m.a))}</span>
      <input class="score" type="number" inputmode="numeric" min="0" max="999" data-score="${esc(m.id)}" data-side="A" value="${m.scoreA ?? ''}" aria-label="Ergebnis ${esc(teamName(m.a))}">
      <span class="colon">:</span>
      <input class="score" type="number" inputmode="numeric" min="0" max="999" data-score="${esc(m.id)}" data-side="B" value="${m.scoreB ?? ''}" aria-label="Ergebnis ${esc(teamName(m.b))}">
      <span class="tb ${w === 'B' ? 'win' : ''}">${esc(teamName(m.b))}</span></div>
      ${tie ? `<div class="tie no-print"><span class="muted small-text">Gleichstand – Sieger:</span>${['A', 'B'].map(side => `<button class="btn ghost sm ${m.winner === side ? 'on' : ''}" data-act="tie" data-id="${esc(m.id)}" data-side="${side}" aria-pressed="${m.winner === side}">${esc(teamName(side === 'A' ? m.a : m.b))}</button>`).join('')}</div>` : ''}</div>`;
  };
  const note = f === 'ko' ? (t.placement === 'top' ? 'Ausgespielt werden Finale und Spiel um Platz 3; die übrigen Teams teilen sich ihren Platz.' : 'Kein Team scheidet aus: Verlierer spielen um die hinteren Plätze.')
    : f === 'kotc' ? 'Feld 1 ist das Königsfeld. Sieger steigen ein Feld auf, Verlierer ein Feld ab.' : '';
  return `<div class="card">
    <div class="card-head">
      <div><p class="eyebrow">${esc(t.sport)} · ${esc(displayDate(t.date))} · ${esc(FORMATS[f])}</p><h2>${esc(t.title)} <span class="badge">${badge}</span></h2></div>
      <div class="tools no-print">
        ${list.length > 1 ? `<select class="select sm" id="tournament-select">${list.map(x => `<option value="${esc(x.id)}" ${x.id === t.id ? 'selected' : ''}>${esc(x.title)} · ${esc(displayDate(x.date))}</option>`).join('')}</select>` : ''}
        <button class="icon-btn" data-act="edit-tournament" title="Turnier bearbeiten">${icon('edit')}</button>
        <button class="icon-btn" data-act="del-tournament" title="Turnier löschen">${icon('trash')}</button>
      </div>
    </div>
    <p class="print-only print-title">${esc(g.name)} · ${esc(t.title)}</p>
    ${note ? `<p class="muted small-text t-note">${note}</p>` : ''}
    <div class="t-layout">
      <div class="schedule">${rounds.map(r => { const fr = freeTeams(r); return `<div class="round"><h4>Runde ${r}${fr.length ? ` <small class="muted">· spielfrei: ${fr.map(esc).join(', ')}</small>` : ''}</h4>
        ${ordered(r).map(matchRow).join('')}</div>`; }).join('')}
        ${f !== 'rr' && !finished ? '<p class="muted small-text no-print">Die nächste Runde erscheint, sobald alle Spiele dieser Runde ein Ergebnis haben.</p>' : ''}</div>
      <div class="standings"><h4>${f === 'ko' ? 'Platzierung' : 'Tabelle'}</h4>${standings(t, plan)}<p class="muted small-text">${scoringText(t)}</p>
        <details class="teams-detail"><summary>Teams anzeigen</summary>${t.teams.map((team, i) => `<p style="${palStyle(i)}"><span class="gdot"></span><b>${esc(team.name)}:</b> ${team.members.map(id => esc(t.participants.find(p => p.id === id)?.name ?? '?')).join(', ')}</p>`).join('')}</details>
        <button class="btn ghost full no-print" data-act="link-series" ${finished ? '' : 'disabled'}>${icon('chart', 16)} In Einzelrangliste übernehmen</button></div>
    </div>
  </div>`;
}
function scoringText(t) {
  const f = formatOf(t);
  if (f === 'ko') return `Einzelrangliste: Platz 1 erhält ${t.teams.length} Punkte, jeder weitere Platz einen weniger. Bei Gleichstand den Sieger auswählen.`;
  if (f === 'kotc') return `Sieg auf ${(t.courtPoints || []).map((p, i) => `Feld ${i + 1} = ${p}`).join(' · ')} Punkte. Bei Punktgleichheit zählt das bessere Feld. Bei Gleichstand im Spiel den Sieger auswählen.`;
  return `Sieg ${t.win} · Unentschieden ${t.draw} · Niederlage ${t.loss} Punkte. Ein Spiel zählt, wenn beide Ergebnisse eingetragen sind.`;
}
function standings(t, plan) {
  const rows = tournamentTable(t), f = formatOf(t);
  if (f === 'ko') return `<table class="table-std"><thead><tr><th>Platz</th><th>Team</th><th title="Spiele">Sp</th><th title="Siege">S</th><th title="Niederlagen">N</th><th title="Tore/Punkte">±</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="${r.rank && r.rank <= 3 ? 'top' + r.rank : ''}"><td>${r.rank ? r.rank + '.' : '–'}</td><td>${esc(r.name)}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.losses}</td><td>${r.scored}:${r.conceded}</td></tr>`).join('')}</tbody></table>`;
  if (f === 'kotc') return `<table class="table-std"><thead><tr><th>#</th><th>Team</th><th title="Spiele">Sp</th><th title="Siege">S</th><th title="Feld in der nächsten bzw. letzten Aufstellung">Feld</th><th>Pkt</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${r.rank}.</td><td>${esc(r.name)}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.court === null ? '–' : r.court > plan.courts ? 'spielfrei' : r.court}</td><td><b>${r.points}</b></td></tr>`).join('')}</tbody></table>`;
  return `<table class="table-std"><thead><tr><th>#</th><th>Team</th><th title="Spiele">Sp</th><th title="Siege">S</th><th title="Unentschieden">U</th><th title="Niederlagen">N</th><th title="Tore/Punkte">±</th><th>Pkt</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${r.rank}.</td><td>${esc(r.name)}</td><td>${r.played}</td><td>${r.wins}</td><td>${r.draws}</td><td>${r.losses}</td><td>${r.scored}:${r.conceded}</td><td><b>${r.points}</b></td></tr>`).join('')}</tbody></table>`;
}

// Ergebnisänderung anwenden; bei K.-o./King of the Court warnen, wenn dadurch eingetragene Folgespiele wegfallen.
let confirming = false;
async function applyMatch(matchId, change) {
  if (confirming) return;
  const g = groups.active(), tour = g?.sport?.tournaments.find(x => x.id === activeTournament); if (!tour) return;
  const probe = structuredClone(tour); change(probe.matches.find(x => x.id === matchId)); syncTournament(probe);
  const keep = new Set(probe.matches.map(m => m.id));
  const lost = tour.matches.filter(m => !keep.has(m.id) && m.scoreA !== null && m.scoreB !== null).length;
  if (lost) {
    confirming = true;
    const ok = await confirmDialog('Paarungen ändern sich', `Durch diese Änderung ändern sich spätere Paarungen. ${lost === 1 ? 'Ein bereits eingetragenes Ergebnis wird' : lost + ' bereits eingetragene Ergebnisse werden'} verworfen.`, 'Ändern').finally(() => { confirming = false; });
    if (!ok) return draw();
  }
  store.update(s => {
    const k = cur(s, g), t = k.tournaments.find(x => x.id === tour.id), m = t.matches.find(x => x.id === matchId);
    change(m); if (m.scoreA !== m.scoreB) m.winner = null; syncTournament(t); reconcileSeries(k);
  });
}

// ---------- Einzelranglisten ----------
function seriesView(g) {
  const k = sportOf(g);
  if (!k.series.length) return `<div class="card empty"><p>Lege für jede Sportart eine eigene Rangliste an. Punkte aus mehreren Wochen werden addiert.</p><button class="btn primary sport-btn" data-act="new-series">${icon('plus')} Neue Rangliste</button></div>`;
  const s = k.series.find(x => x.id === activeSeries) || k.series[0];
  activeSeries = s.id;
  const rows = individualTable(s), sessions = [...s.sessions].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return `<div class="card">
    <div class="card-head">
      <div><p class="eyebrow">${esc(s.sport)} · Einzelrangliste</p><h2>${esc(s.title)} <span class="badge">${s.sessions.length} Spieltage</span></h2></div>
      <div class="tools no-print">
        <select class="select sm" id="series-select">${k.series.map(x => `<option value="${esc(x.id)}" ${x.id === s.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select>
        <button class="icon-btn" data-act="new-series" title="Neue Rangliste">${icon('plus')}</button>
        <button class="icon-btn" data-act="del-series" title="Rangliste löschen">${icon('trash')}</button>
      </div>
    </div>
    <p class="print-only print-title">${esc(g.name)} · ${esc(s.title)}</p>
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
function onChange(e) {
  const t = e.target;
  if (t.id === 'lg-select') { activeTournament = activeSeries = null; groups.setActive(t.value); }
  else if (t.id === 'tournament-select') { activeTournament = t.value; draw(); }
  else if (t.id === 'series-select') { activeSeries = t.value; draw(); }
  else if (t.dataset.score) {
    const v = t.value === '' ? null : Math.max(0, Math.min(999, Math.round(Number(t.value))));
    applyMatch(t.dataset.score, m => { m['score' + t.dataset.side] = Number.isFinite(v) ? v : null; });
  }
}
async function onClick(e) {
  const lg = e.target.closest('[data-lg]');
  if (lg && await groups.handle(lg, draw)) return;
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, g = groups.active(); if (!g) return;
  const k = sportOf(g);
  switch (act) {
    case 'tab': tab = b.dataset.tab; draw(); break;
    case 'print': window.print(); break;
    case 'present': toggleFullscreen(); draw(); break;
    case 'to-teams': groups.viewOf.set(g.id, 'teams'); break;   // der Link öffnet danach Gruppen → Teams
    case 'new-tournament': tournamentDialog(g); break;
    case 'edit-tournament': tournamentDialog(g, k.tournaments.find(x => x.id === activeTournament)); break;
    case 'del-tournament': {
      const t = k.tournaments.find(x => x.id === activeTournament);
      if (!(await confirmDialog('Turnier löschen', `„${t.title}“ löschen? Übernommene Ranglisteneinträge werden ebenfalls entfernt.`))) return;
      store.update(s => { const x = cur(s, g); x.tournaments = x.tournaments.filter(y => y.id !== t.id); x.series.forEach(se => { se.sessions = se.sessions.filter(y => y.tournamentId !== t.id); }); });
      activeTournament = null; break;
    }
    case 'link-series': linkDialog(g); break;
    case 'tie': applyMatch(b.dataset.id, m => { m.winner = b.dataset.side; }); break;
    case 'new-series': seriesDialog(); break;
    case 'del-series': {
      const se = k.series.find(x => x.id === activeSeries);
      if (!(await confirmDialog('Rangliste löschen', `„${se.title}“ mit allen Spieltagen löschen?`))) return;
      store.update(s => { const x = cur(s, g); x.series = x.series.filter(y => y.id !== se.id); }); activeSeries = null; break;
    }
    case 'new-session': sessionDialog(g); break;
    case 'edit-session': sessionDialog(g, b.dataset.id); break;
    case 'del-session': {
      if (!(await confirmDialog('Spieltag löschen', 'Diesen Spieltag mit allen Punkten löschen?'))) return;
      store.update(s => { const se = cur(s, g).series.find(x => x.id === activeSeries); se.sessions = se.sessions.filter(x => x.id !== b.dataset.id); }); break;
    }
  }
}

// Neues Turnier aus den aktuellen Teams oder bestehendes bearbeiten (auch aus Gruppen → Teams aufgerufen; after = danach)
export function tournamentDialog(g, existing, after) {
  const k = sportOf(g);
  const t = existing || { title: 'Turnier', sport: 'Fußball', date: todayISO(), win: 3, draw: 1, loss: 0, format: 'rr', placement: 'all', rounds: 6 };
  const f0 = formatOf(t), n = existing ? existing.teams.length : k.teams.length, courts = kotcCourts(n);
  const cp = Array.from({ length: courts }, (_, i) => t.courtPoints?.[i] ?? defaultCourtPoints(courts)[i]);
  const show = f => (f === f0 ? '' : 'hidden');
  dialog({ title: existing ? 'Turnier bearbeiten' : 'Turnier mit diesen Teams', submit: existing ? 'Speichern' : 'Turnier anlegen',
    body: `<label class="field">Titel<input name="title" class="input" maxlength="80" value="${esc(t.title)}"></label>
      <div class="two"><label class="field">Sportart<input name="sport" class="input" list="sports" maxlength="40" value="${esc(t.sport)}"><datalist id="sports">${SPORTS.map(x => `<option value="${x}">`).join('')}</datalist></label>
      <label class="field">Datum<input name="date" type="date" class="input" value="${esc(t.date)}"></label></div>
      <label class="field">Turnierform<select name="format" class="select" ${existing ? 'disabled' : ''}>${Object.entries(FORMATS).map(([key, v]) => `<option value="${key}" ${key === f0 ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div data-format="rr" ${show('rr')}>
        <div class="three"><label class="field">Punkte Sieg<input name="win" type="number" class="input" value="${t.win}"></label><label class="field">Unentschieden<input name="draw" type="number" class="input" value="${t.draw}"></label><label class="field">Niederlage<input name="loss" type="number" class="input" value="${t.loss}"></label></div>
        <p class="muted small-text">Jedes Team spielt einmal gegen jedes andere.</p></div>
      <div data-format="ko" ${show('ko')}>
        <label class="field">Platzierungsspiele<select name="placement" class="select"><option value="all" ${t.placement !== 'top' ? 'selected' : ''}>Alle Plätze ausspielen – jedes Team spielt jede Runde</option><option value="top" ${t.placement === 'top' ? 'selected' : ''}>Nur Finale und Spiel um Platz 3</option></select></label>
        <p class="muted small-text">Die erste Runde wird ausgelost. Verlierer scheiden nicht aus, sondern spielen um die hinteren Plätze. ${koSize(n) > n ? `Bei ${n} Teams erhalten ${koSize(n) - n} Teams in Runde 1 ein Freilos – dafür in der Planung eine Bewegungsaufgabe vorsehen.` : ''}</p></div>
      <div data-format="kotc" ${show('kotc')}>
        <label class="field">Anzahl Runden<input name="rounds" type="number" class="input" min="1" max="30" value="${t.rounds || 6}"></label>
        <p class="field-label">Punkte für einen Sieg auf …</p>
        <div class="court-points">${cp.map((p, i) => `<label class="field">Feld ${i + 1}${i === 0 ? ' (König)' : ''}<input name="cp${i}" type="number" class="input" value="${p}"></label>`).join('')}</div>
        <p class="muted small-text">${n} Teams spielen gleichzeitig auf ${courts} ${courts === 1 ? 'Feld' : 'Feldern'}${n % 2 ? '; je Runde setzt ein Team aus und steigt danach auf dem untersten Feld ein' : ''}. Die erste Aufstellung wird ausgelost.</p></div>
      ${existing ? '<p class="muted small-text">Die Turnierform lässt sich nachträglich nicht ändern.</p>' : `<p class="muted small-text">Die aktuelle Teamverteilung (${n} Teams) wird übernommen.</p>`}`,
    onOpen: el => {
      const sel = el.querySelector('[name=format]');
      sel.onchange = () => el.querySelectorAll('[data-format]').forEach(d => { d.hidden = d.dataset.format !== sel.value; });
    },
    onSubmit: fd => {
      const format = existing ? f0 : String(fd.get('format') || 'rr');
      const data = { title: String(fd.get('title')).trim() || 'Turnier', sport: String(fd.get('sport')).trim() || 'Sport', date: String(fd.get('date')) || todayISO(),
        win: Number(fd.get('win')) || 0, draw: Number(fd.get('draw')) || 0, loss: Number(fd.get('loss')) || 0 };
      const opts = { placement: fd.get('placement') === 'top' ? 'top' : 'all', rounds: Math.max(1, Math.min(30, Math.round(Number(fd.get('rounds')) || 6))),
        courtPoints: cp.map((_, i) => Number(fd.get('cp' + i)) || 0) };
      store.update(s => {
        const x = cur(s, g);
        if (existing) {
          const y = x.tournaments.find(z => z.id === existing.id);
          Object.assign(y, data);
          if (format === 'ko') y.placement = opts.placement;
          if (format === 'kotc') Object.assign(y, { rounds: opts.rounds, courtPoints: opts.courtPoints });
          syncTournament(y); reconcileSeries(x); return;
        }
        const teams = x.teams.map(y => ({ ...y, members: [...y.members] })), ids = new Set(teams.flatMap(y => y.members));
        const tour = createTournament({ id: uid(), ...data, participants: g.students.filter(p => ids.has(p.id)).map(p => ({ id: p.id, name: p.name, className: p.className })), teams }, format, opts);
        x.tournaments.push(tour); activeTournament = tour.id;
      });
      tab = 'turnier';
      if (after) after(); else draw();
    } });
}

function linkDialog(g) {
  const k = sportOf(g), t = k.tournaments.find(x => x.id === activeTournament);
  const same = k.series.filter(s => s.sport.toLocaleLowerCase('de') === t.sport.toLocaleLowerCase('de'));
  dialog({ title: 'In Einzelrangliste übernehmen', submit: 'Übernehmen',
    body: `<label class="field">Rangliste (${esc(t.sport)})<select name="series" class="select">${same.map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('')}<option value="__new">+ Neue Rangliste „${esc(t.sport)}“</option></select></label>
      <p class="muted small-text">Jede teilnehmende Person erhält die Turnierpunkte ihres Teams. Spätere Korrekturen im Turnier aktualisieren den Eintrag automatisch.</p>`,
    onSubmit: fd => {
      let sid = String(fd.get('series'));
      store.update(s => {
        const x = cur(s, g);
        if (sid === '__new') { sid = uid(); x.series.push({ id: sid, title: 'Rangliste ' + t.sport, sport: t.sport, participants: [], sessions: [] }); }
        linkTournament(x, t.id, sid);
      });
      activeSeries = sid; toast('In die Rangliste übernommen.');
    } });
}

function seriesDialog() {
  const g = groups.active();
  dialog({ title: 'Neue Einzelrangliste', submit: 'Anlegen',
    body: `<label class="field">Titel<input name="title" class="input" maxlength="80" placeholder="z. B. Badminton-Liga"></label>
      <label class="field">Sportart<input name="sport" class="input" list="sports2" maxlength="40" value="Badminton"><datalist id="sports2">${SPORTS.map(x => `<option value="${x}">`).join('')}</datalist></label>`,
    onSubmit: fd => {
      const sport = String(fd.get('sport')).trim() || 'Sport', title = String(fd.get('title')).trim() || 'Rangliste ' + sport, id = uid();
      activeSeries = id; tab = 'rangliste';
      store.update(s => { cur(s, g).series.push({ id, title, sport, participants: [], sessions: [] }); });
    } });
}

function sessionDialog(g, sessionId) {
  const k = sportOf(g), se = k.series.find(x => x.id === activeSeries), existing = se.sessions.find(x => x.id === sessionId);
  const absent = groups.absent(g.id);
  const people = [...se.participants.filter(p => !g.students.some(s => s.id === p.id) && existing && Object.prototype.hasOwnProperty.call(existing.points, p.id)), ...g.students];
  dialog({ title: existing ? 'Spieltag bearbeiten' : 'Spieltag eintragen', wide: true, submit: 'Speichern',
    body: `<div class="two"><label class="field">Datum<input name="date" type="date" class="input" value="${esc(existing?.date || todayISO())}"></label><label class="field">Titel<input name="title" class="input" maxlength="80" value="${esc(existing?.title || 'Spieltag')}"></label></div>
      <div class="points-grid">${people.map(p => `<label class="${absent.has(p.id) && !existing ? 'off' : ''}"><span>${esc(p.name)} <small class="muted">${esc(p.className)}</small></span><input class="input" type="number" inputmode="decimal" step="any" name="p:${esc(p.id)}" value="${existing && Object.prototype.hasOwnProperty.call(existing.points, p.id) ? existing.points[p.id] : ''}"></label>`).join('')}</div>
      <p class="muted small-text">Leeres Feld = keine Wertung. 0 zählt als Teilnahme.</p>`,
    onSubmit: fd => {
      const points = {};
      for (const [key, v] of fd.entries()) if (key.startsWith('p:') && String(v).trim() !== '' && Number.isFinite(Number(v))) points[key.slice(2)] = Number(v);
      if (!Object.keys(points).length) throw new Error('Bitte mindestens für eine Person Punkte eintragen.');
      store.update(s => {
        const x = cur(s, g), series = x.series.find(y => y.id === se.id);
        const known = new Set(series.participants.map(p => p.id));
        series.participants.push(...people.filter(p => points[p.id] !== undefined && !known.has(p.id)).map(p => ({ id: p.id, name: p.name, className: p.className })));
        const data = { date: String(fd.get('date')) || todayISO(), title: String(fd.get('title')).trim() || 'Spieltag', points, tournamentId: null };
        if (existing) Object.assign(series.sessions.find(y => y.id === existing.id), data); else series.sessions.push({ id: uid(), ...data });
      });
    } });
}

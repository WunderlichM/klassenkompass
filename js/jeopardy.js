// Bereich Quiz → Jeopardy (seit 2.20.0): Spiel für die ganze Klasse, z. B. vor einer Klassenarbeit.
// Teams kommen aus Gruppen → Teams der gewählten Lerngruppe. Ein Spielbrett hat 2–6 Kategorien mit je bis zu 5 Fragen
// (20, 40, 60, 80, 100 Punkte). Das Team am Zug wählt ein Feld und antwortet mündlich; die Lehrkraft wertet.
// Bei falscher Antwort dürfen die anderen Teams klauen (keine Minuspunkte). Danach ist das nächste Team am Zug.
// Gespeichert werden Spielbretter (quiz.boards) und das laufende Spiel (quiz.jgame) – ohne Namen: Teams bestehen aus
// Kennungen der Kinder, die Namen liest die Ansicht aus der Lerngruppe.
// Seit 2.21.0 kann jede Frage ein Bild haben (q.img = Bildkennung wie im Kartenquiz, Bild in IndexedDB bzw. im Konto).
import * as store from './store.js';
import * as groups from './groups.js';
import { uid, mixGroups } from './engine.js';
import { esc, icon, dialog, confirmDialog, toast, downloadFile, toggleFullscreen, hooks, helpCard, onViewportChange, fitZoom, palStyle } from './ui.js';
import * as sound from './sound.js';
import * as images from './images.js';

const ROWS = store.ROW_MAX, POINTS = Array.from({ length: ROWS }, (_, r) => (r + 1) * 20);
const Q = () => store.get().quiz;
const game = () => Q().jgame || null;
const boards = () => Q().boards || [];
const board = id => boards().find(b => b.id === id) || null;
const key = (c, r) => `${c}-${r}`;
const filled = q => !!(q?.text && q?.answer);
const fields = b => b.categories.flatMap((c, ci) => c.questions.map((q, r) => (filled(q) ? key(ci, r) : null))).filter(Boolean);

let root = null, boardId = null, confettiFor = '';
try { boardId = localStorage.getItem('klassenkompass.jeoBoard'); } catch { /* privater Modus */ }
const curBoard = () => board(boardId) || boards()[0] || null;
function pickBoard(id) { boardId = id; try { localStorage.setItem('klassenkompass.jeoBoard', id || ''); } catch { /* egal */ } }

export function mount(el) {
  root = el;
  const off = store.subscribe(() => draw());
  const onImages = () => draw();
  addEventListener('kk-images', onImages);
  root.onclick = onClick;
  root.onchange = onChange;
  draw();
  const offView = onViewportChange(fit);
  return () => { off(); offView(); removeEventListener('kk-images', onImages); keepAwake(false); root.onclick = root.onchange = null; root = null; };
}
// Läuft ein Spiel? (für die automatische App-Sperre)
export const busy = () => !!(root && game());

function draw() {
  if (!root) return;
  const g = game();
  if (g && board(g.boardId)) { g.done ? drawPodium(g) : drawRun(g); keepAwake(true); }
  else { drawHome(); keepAwake(false); }
  images.hydrate(root);
  fit();
}
function fit() {
  const el = root?.querySelector('.jeo-run .qs'); if (!el) return;
  if (!document.body.classList.contains('presenting')) { el.style.zoom = ''; return; }
  if (!fitZoom(el, { own: true, max: 2.2 })) el.style.zoom = '0.3';
  // Bilder, die erst noch laden, ändern die Höhe: danach noch einmal einpassen
  el.querySelectorAll('img').forEach(img => { if (!img.complete) img.addEventListener('load', () => fit(), { once: true }); });
}
let wakeLock = null;
function keepAwake(want) {
  if (!('wakeLock' in navigator)) return;
  if (want && !wakeLock && document.visibilityState === 'visible') navigator.wakeLock.request('screen').then(l => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }).catch(() => {});
  else if (!want && wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

// Kartenquiz | Jeopardy
const modeSeg = on => `<div class="seg jeo-mode" role="group" aria-label="Art des Quiz"><a class="btn-seg ${on === 'quiz' ? 'on' : ''}" href="#/quiz">${icon('cards', 15)} Kartenquiz</a><a class="btn-seg ${on === 'jeo' ? 'on' : ''}" href="#/jeopardy">${icon('grid', 15)} Jeopardy</a></div>`;
export { modeSeg };

// ======================================================================
// Startseite: Spielbrett wählen und bearbeiten, Teams prüfen, Spiel starten
// ======================================================================
function drawHome() {
  const lg = groups.active();
  if (lg && groups.ensureTeams(lg).changed) return;   // Teams wurden gerade angepasst – die Änderung zeichnet neu
  const b = curBoard(), k = lg ? groups.sportView(lg) : null, teams = k?.teams || [];
  const names = new Map((lg?.students || []).map(p => [p.id, p.name]));
  const n = b ? fields(b).length : 0, total = b ? b.categories.length * ROWS : 0;
  const teamOk = teams.length >= 2 && teams.every(t => t.members.length);
  root.innerHTML = `
  <section class="page quiz jeo">
    <div class="page-head">
      <div>
        <p class="eyebrow">Quiz · Spiel</p>
        <h1>Jeopardy<span class="dot">.</span></h1>
        <p class="sub">Teams wählen ein Feld, antworten mündlich – du wertest. Ideal vor der Klassenarbeit.</p>
        ${modeSeg('jeo')}
      </div>
      ${groups.pickerHtml(lg, 'Lerngruppe')}
    </div>
    <div class="work-grid">
      <div>
        <div class="card">
          <div class="card-head">
            <div><p class="eyebrow">Spielbrett</p>
              <div class="picker-row"><select id="jeo-board" class="select">${boards().map(x => `<option value="${esc(x.id)}" ${x.id === b?.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('') || '<option>Noch kein Spielbrett</option>'}</select>
              ${b ? `<button class="btn ghost sm" data-act="edit">${icon('edit', 15)} Bearbeiten</button>` : ''}
              <button class="btn ghost sm" data-act="new">${icon('plus', 15)} Neu</button>
              <button class="btn ghost sm" data-act="import" title="Spielbretter aus einer Datei oder eingefügtem Text übernehmen">${icon('upload', 15)} Importieren</button></div>
            </div>
          </div>
          ${b ? boardPreview(b) : '<p class="muted">Lege ein Spielbrett an: vier Kategorien mit je fünf Fragen von 20 bis 100 Punkten – oder importiere eines.</p>'}
          <div class="card-foot">
            <span class="muted small-text">${b ? `${n} von ${total} Feldern mit Frage und Antwort` : ''}</span>
            <div class="tools"><button class="btn primary big" data-act="start" ${b && n && teamOk ? '' : 'disabled'}>${icon('play', 16)} Spiel starten</button></div>
          </div>
        </div>
      </div>
      <aside class="side">
        <div class="card">
          <div class="card-head small"><h3>${icon('users', 16)} Teams <span class="badge">${teams.length}</span></h3></div>
          ${!lg ? '<p class="muted">Lege unter Gruppen eine Lerngruppe an – die Teams kommen aus Gruppen → Teams.</p>'
            : `${teams.length ? `<ul class="team-mini jeo-teams-mini">${teams.map((t, i) => `<li style="${palStyle(i)}"><span class="gdot"></span><span><b>${esc(t.name)}</b><small class="muted"> ${t.members.map(id => esc(names.get(id) || '?')).join(', ')}</small></span></li>`).join('')}</ul>` : '<p class="muted small-text">Noch keine Teams.</p>'}
            ${k.teamCount !== 4 ? `<p class="notice small-text">Für Jeopardy sind 4 Teams gedacht – gerade sind es ${k.teamCount}.</p><button class="btn ghost full" data-act="four">${icon('users', 16)} Auf 4 Teams stellen</button>` : ''}
            <button class="btn ghost full" data-act="mix" style="margin-top:8px">${icon('shuffle', 16)} Teams neu mischen</button>
            <p class="muted small-text">Wer heute fehlt, unter Gruppen bei den Kindern markieren – die Teams passen sich an.</p>`}
        </div>
        ${helpCard('jeopardy', `${icon('help', 16)} So geht’s`, `<ol class="help-list steps small-text">
          <li>Spielbrett anlegen oder importieren: Kategorien mit Fragen und der richtigen Antwort, oben 20 Punkte, unten 100.</li>
          <li>Lerngruppe wählen – die vier Teams kommen aus Gruppen → Teams. „Spiel starten“ und am Beamer zeigen.</li>
          <li>Das Team am Zug wählt ein Feld und antwortet mündlich. Du tippst <b>Richtig</b> oder <b>Falsch</b>.</li>
          <li>Bei „Falsch“ dürfen die anderen Teams klauen – es gibt keine Minuspunkte. Danach ist das nächste Team dran.</li>
          <li>Sind alle Felder gespielt, zeigt „Siegerehrung“ das Podium. Punkte lassen sich jederzeit per Klick auf den Punktestand korrigieren.</li>
        </ol>`)}
      </aside>
    </div>
  </section>`;
}
function boardPreview(b) {
  return `<div class="jeo-prev" style="--cols:${b.categories.length}">${b.categories.map(c => `<div class="jp-col"><b class="jp-cat">${esc(c.name) || '<span class="muted">(ohne Namen)</span>'}</b>${c.questions.map((q, r) => `<div class="jp-q ${filled(q) ? '' : 'empty'}"><span class="jp-pts">${POINTS[r]}</span>${filled(q) ? `${q.img ? images.imgTag(q.img, 'jp-thumb') : ''}<span>${esc(q.text)}</span><small>→ ${esc(q.answer)}</small>` : '<span class="muted">leer</span>'}</div>`).join('')}</div>`).join('')}</div>`;
}

// ======================================================================
// Laufendes Spiel (Beamer)
// ======================================================================
function teamNames(g) {
  const lg = groups.byId(g.groupId), names = new Map((lg?.students || []).map(p => [p.id, p.name]));
  return t => t.members.map(id => names.get(id)).filter(Boolean);
}
function drawRun(g) {
  const b = board(g.boardId), members = teamNames(g), turn = g.teams[g.turn], all = fields(b), done = all.every(k => k in g.used);
  const lg = groups.byId(g.groupId), cur = g.cur;
  const teamCards = g.teams.map((t, i) => `<button class="jt ${!cur && t.id === turn.id ? 'turn' : ''} ${cur && t.id === cur.team && cur.step === 'q' ? 'turn' : ''}" style="${palStyle(i)}" data-act="score" data-id="${esc(t.id)}" title="Punkte korrigieren">
      <span class="jt-name"><span class="gdot"></span>${esc(t.name)}</span><span class="jt-pts">${g.scores[t.id] ?? 0}</span>
      ${g.showNames ? `<span class="jt-mem">${members(t).map(esc).join(' · ')}</span>` : ''}
      ${!cur && t.id === turn.id && !done ? '<span class="jt-badge">ist dran</span>' : ''}</button>`).join('');
  root.innerHTML = `
  <section class="page quiz jeo-run">
    <div class="run-head">
      <div><p class="eyebrow">Jeopardy${lg ? ' · ' + esc(lg.name) : ''}</p><h1>${esc(g.title)}<span class="dot">.</span></h1></div>
      <div class="tools">
        <button class="icon-btn" data-act="names" title="${g.showNames ? 'Namen ausblenden' : 'Namen zeigen'}" aria-label="Namen ein- oder ausblenden">${icon(g.showNames ? 'users' : 'user')}</button>
        <button class="icon-btn" data-act="sound" title="Töne an/aus" aria-label="Töne an/aus">${icon(sound.quizSound().on ? 'volume' : 'mute')}</button>
        <button class="icon-btn" data-act="present" title="Vollbild" aria-label="Vollbild">${icon(document.body.classList.contains('presenting') ? 'shrink' : 'expand')}</button>
        ${done && !cur ? `<button class="btn primary sm" data-act="finish">${icon('trophy', 16)} Siegerehrung</button>` : ''}
        <button class="btn ghost sm" data-act="end">${icon('x', 16)} Beenden</button>
      </div>
    </div>
    <div class="qs jeo-stage">
      ${cur ? questionHtml(g, b) : boardHtml(g, b)}
      <div class="jt-row" style="--n:${g.teams.length}">${teamCards}</div>
    </div>
  </section>`;
}
function boardHtml(g, b) {
  const color = id => { const i = g.teams.findIndex(t => t.id === id); return i >= 0 ? palStyle(i) : ''; };
  return `<div class="jb" style="--cols:${b.categories.length}">
    ${b.categories.map(c => `<div class="jb-cat">${esc(c.name)}</div>`).join('')}
    ${POINTS.map((p, r) => b.categories.map((c, ci) => { const k = key(ci, r), q = c.questions[r];
      if (!filled(q)) return '<div class="jb-tile none"></div>';
      if (k in g.used) { const w = g.used[k]; return `<div class="jb-tile used" ${w ? `style="${color(w)}"` : ''}>${w ? '<span class="gdot"></span>' : ''}</div>`; }
      return `<button class="jb-tile" data-act="pick" data-c="${ci}" data-r="${r}">${p}</button>`; }).join('')).join('')}
  </div>`;
}
function questionHtml(g, b) {
  const c = g.cur, cat = b.categories[c.c], q = cat.questions[c.r], pts = POINTS[c.r];
  const ti = id => g.teams.findIndex(t => t.id === id), team = g.teams[ti(c.team)], left = g.teams.filter(t => !c.tried.includes(t.id) && t.id !== c.team);
  const chip = (t, extra = '') => `<span class="jq-team" style="${palStyle(ti(t.id))}"><span class="gdot"></span>${esc(t.name)}${extra}</span>`;
  let ctrl = '';
  if (c.step === 'q') ctrl = `<p class="jq-who">${chip(team, c.tried.length ? ' klaut' : ' antwortet')}</p>
      <div class="jq-ctrl"><button class="btn jq-ok" data-act="right">${icon('check', 20)} Richtig</button><button class="btn jq-no" data-act="wrong">${icon('x', 20)} Falsch</button>
      <button class="btn ghost jq-show" data-act="show">${c.show ? 'Antwort verbergen' : 'Antwort zeigen'}</button></div>`;
  else if (c.step === 'steal') ctrl = `<p class="jq-who">Leider falsch. <b>Wer klaut?</b> Die anderen Teams dürfen antworten.</p>
      <div class="jq-ctrl">${left.map(t => `<button class="btn jq-steal" style="${palStyle(ti(t.id))}" data-act="steal" data-id="${esc(t.id)}"><span class="gdot"></span>${esc(t.name)}</button>`).join('')}
      <button class="btn ghost" data-act="nobody">Niemand – Antwort zeigen</button></div>`;
  else ctrl = `<p class="jq-who">${c.won ? `${chip(g.teams[ti(c.won)])} bekommt <b>+${pts}</b> Punkte` : 'Diesmal keine Punkte.'}</p>
      <div class="jq-ctrl"><button class="btn primary big" data-act="back">${icon('grid', 18)} Zurück zum Brett</button></div>`;
  return `<div class="jq">
    <p class="jq-head"><span>${esc(cat.name)}</span><b>${pts} Punkte</b></p>
    <div class="qs-q jq-q ${q.img ? 'with-img' : ''}"><p>${esc(q.text)}</p>${q.img ? `<div class="qs-img jq-img">${images.imgTag(q.img)}</div>` : ''}</div>
    ${c.show || c.step === 'a' ? `<div class="jq-a ${c.won ? 'ok' : ''}"><small>Antwort</small><p>${esc(q.answer)}</p></div>` : ''}
    ${ctrl}
  </div>`;
}

// Siegerehrung: Teams nach Punkten, Gleichstand teilt sich einen Platz
function drawPodium(g) {
  const members = teamNames(g), ti = id => g.teams.findIndex(t => t.id === id);
  const levels = [...new Set(g.teams.map(t => g.scores[t.id] ?? 0))].sort((a, b) => b - a);
  const place = t => levels.indexOf(g.scores[t.id] ?? 0) + 1;
  const sorted = g.teams.slice().sort((a, b) => (g.scores[b.id] ?? 0) - (g.scores[a.id] ?? 0));
  const step = n => { const ts = sorted.filter(t => place(t) === n); if (!ts.length) return '<div class="pod-col empty"></div>';
    return `<div class="pod-col p${n}"><div class="pod-names">${ts.map(t => `<span style="${palStyle(ti(t.id))}"><span class="gdot"></span> ${esc(t.name)}</span>${g.showNames ? `<small class="jt-mem">${members(t).map(esc).join(' · ')}</small>` : ''}`).join('')}</div>
      <div class="pod-step"><span class="pod-place">${n}</span><span class="pod-score">${g.scores[ts[0].id] ?? 0} Punkte</span></div></div>`; };
  const first = confettiFor !== g.id;
  if (first) { confettiFor = g.id; sound.quizFx('podium'); }
  const rest = sorted.filter(t => place(t) > 3);
  root.innerHTML = `
  <section class="page quiz quiz-podium jeo-run">
    <div class="run-head">
      <div><p class="eyebrow">Jeopardy · ${esc(g.title)}</p><h1>Siegerehrung<span class="dot">.</span></h1></div>
      <div class="tools">
        <button class="icon-btn" data-act="present" title="Vollbild" aria-label="Vollbild">${icon(document.body.classList.contains('presenting') ? 'shrink' : 'expand')}</button>
        <button class="btn ghost sm no-present" data-act="reopen">${icon('back', 16)} Zurück zum Spiel</button>
        <button class="btn primary sm" data-act="close">${icon('check', 16)} Fertig</button>
      </div>
    </div>
    <div class="qs pod-card">${first ? confetti() : ''}<div class="podium">${step(2)}${step(1)}${step(3)}</div>
      ${rest.length ? `<p class="jeo-rest">${rest.map(t => `${place(t)}. ${esc(t.name)} · ${g.scores[t.id] ?? 0} Punkte`).join(' &nbsp; ')}</p>` : ''}</div>
  </section>`;
}
function confetti() {
  const cols = ['#e0533d', '#2f6fd0', '#e3a312', '#7a4fc4', '#3f9a5c', '#f2c14e'];
  return `<div class="confetti" aria-hidden="true">${Array.from({ length: 70 }, (_, i) => `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${cols[i % cols.length]};animation-delay:${(3.5 + Math.random() * 1.4).toFixed(2)}s;animation-duration:${(2.6 + Math.random() * 1.8).toFixed(2)}s;--dx:${(Math.random() * 160 - 80).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;width:${6 + Math.round(Math.random() * 6)}px"></i>`).join('')}</div>`;
}

// ======================================================================
// Bedienung
// ======================================================================
const play = fn => store.update(s => { if (s.quiz.jgame) fn(s.quiz.jgame, s); });
function onChange(e) {
  const t = e.target;
  if (t.id === 'lg-select') groups.setActive(t.value);
  else if (t.id === 'jeo-board') { pickBoard(t.value); draw(); }
}
async function onClick(e) {
  const lgBtn = e.target.closest('[data-lg]');
  if (lgBtn && lgBtn.tagName !== 'SELECT' && await groups.handle(lgBtn, draw)) return;
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT') return;
  const act = b.dataset.act, g = game();
  switch (act) {
    case 'new': return editDialog(null);
    case 'edit': return curBoard() && editDialog(curBoard());
    case 'import': return hooks.importDialog?.();
    case 'four': { const lg = groups.active(); if (lg) store.update(s => { groups.sportPart(s, lg.id).teamCount = 4; }); return; }
    case 'mix': return mixTeams();
    case 'start': return start();
    case 'present': toggleFullscreen(); return draw();
    case 'sound': sound.setQuizSound({ on: !sound.quizSound().on }); return draw();
    case 'names': return play(x => { x.showNames = !x.showNames; });
    case 'pick': {
      const c = Number(b.dataset.c), r = Number(b.dataset.r);
      play(x => { if (x.cur || key(c, r) in x.used) return; x.cur = { c, r, team: x.teams[x.turn].id, tried: [], step: 'q', show: false }; });
      return sound.quizFx('question');
    }
    case 'show': return play(x => { if (x.cur) x.cur.show = !x.cur.show; });
    case 'right': {
      play(x => { const c = x.cur; if (!c || c.step !== 'q') return; x.scores[c.team] = (x.scores[c.team] ?? 0) + POINTS[c.r]; x.used[key(c.c, c.r)] = c.team; c.won = c.team; c.step = 'a'; c.show = true; });
      return sound.quizFx('reveal');
    }
    case 'wrong': {
      play(x => { const c = x.cur; if (!c || c.step !== 'q') return; c.tried.push(c.team); c.show = false;
        if (x.teams.some(t => !c.tried.includes(t.id))) c.step = 'steal'; else { x.used[key(c.c, c.r)] = ''; c.step = 'a'; c.show = true; } });
      return sound.quizFx('show');
    }
    case 'steal': return play(x => { const c = x.cur; if (c?.step === 'steal' && x.teams.some(t => t.id === b.dataset.id)) { c.team = b.dataset.id; c.step = 'q'; } });
    case 'nobody': return play(x => { const c = x.cur; if (!c) return; x.used[key(c.c, c.r)] = ''; delete c.won; c.step = 'a'; c.show = true; });
    case 'back': return play(x => { if (!x.cur || x.cur.step !== 'a') return; x.cur = null; x.turn = (x.turn + 1) % x.teams.length; });
    case 'score': return g && scoreDialog(g, b.dataset.id);
    case 'finish': return play(x => { x.cur = null; x.done = true; });
    case 'reopen': confettiFor = ''; return play(x => { x.done = false; });
    case 'end': {
      if (!g) return;
      const any = Object.keys(g.used).length;
      if (!any) { if (await confirmDialog('Spiel beenden', 'Das Spiel hat noch nicht begonnen. Beenden?', 'Beenden')) store.update(s => { delete s.quiz.jgame; }); return; }
      if (await confirmDialog('Spiel beenden', 'Spiel jetzt beenden und die Siegerehrung zeigen?', 'Siegerehrung')) play(x => { x.cur = null; x.done = true; });
      return;
    }
    case 'close': confettiFor = ''; if (document.body.classList.contains('presenting')) toggleFullscreen(); return store.update(s => { delete s.quiz.jgame; });
  }
}

function mixTeams() {
  const lg = groups.active(); if (!lg) return;
  const k = groups.sportView(lg);
  const res = mixGroups({ students: k.students, rules: k.rules, groupCount: k.teamCount }, groups.absent(lg.id));
  if (!res.ok) return toast(res.message, { kind: 'warn' });
  store.update(s => { groups.sportPart(s, lg.id).teams = res.groups.map((members, i) => ({ id: uid(), name: 'Team ' + (i + 1), members })); });
  toast('Teams neu gemischt.');
}

async function start() {
  const b = curBoard(), lg = groups.active(); if (!b || !lg) return;
  const k = groups.sportView(lg), teams = k.teams.filter(t => t.members.length);
  if (teams.length < 2) return toast('Es braucht mindestens zwei Teams.', { kind: 'warn' });
  if (!fields(b).length) return toast('Auf dem Spielbrett steht noch keine Frage mit Antwort.', { kind: 'warn' });
  const empty = b.categories.filter(c => !c.name).length;
  if (empty && !(await confirmDialog('Kategorie ohne Namen', `${empty === 1 ? 'Eine Kategorie hat' : empty + ' Kategorien haben'} noch keinen Namen. Trotzdem starten?`, 'Starten'))) return;
  if (game() && !(await confirmDialog('Neues Spiel', 'Es gibt noch ein Spiel. Dieses beenden und neu starten?', 'Neu starten'))) return;
  store.update(s => {
    s.quiz.jgame = { id: uid(), boardId: b.id, groupId: lg.id, title: b.title, teams: teams.map(t => ({ id: t.id, name: t.name, members: [...t.members] })),
      scores: Object.fromEntries(teams.map(t => [t.id, 0])), used: {}, turn: 0, cur: null, done: false, at: Date.now(), showNames: true };
  });
  confettiFor = '';
  sound.quizFx('go');
  scrollTo(0, 0);
}

function scoreDialog(g, id) {
  const t = g.teams.find(x => x.id === id); if (!t) return;
  dialog({ title: `Punkte: ${t.name}`, submit: 'Übernehmen', body: `
    <label class="field">Punktestand<input name="pts" class="input" type="number" step="10" min="-9999" max="9999" value="${g.scores[id] ?? 0}"></label>
    <div class="jeo-adj">${[-20, -10, 10, 20].map(d => `<button type="button" class="btn ghost sm" data-d="${d}">${d > 0 ? '+' : ''}${d}</button>`).join('')}</div>
    <p class="muted small-text">Zum Korrigieren, z. B. wenn eine Antwort doch gelten soll.</p>`,
    onOpen: el => el.querySelectorAll('[data-d]').forEach(x => x.onclick = () => { const i = el.querySelector('[name=pts]'); i.value = (Number(i.value) || 0) + Number(x.dataset.d); }),
    onSubmit: fd => { const v = Math.round(Number(fd.get('pts'))); if (!Number.isFinite(v)) throw new Error('Bitte eine Zahl eingeben.'); play(x => { x.scores[id] = Math.max(-9999, Math.min(9999, v)); }); } });
}

// ---------- Spielbrett bearbeiten ----------
function editDialog(b) {
  const src = b ? structuredClone(b) : { title: '', categories: Array.from({ length: 4 }, () => ({ name: '', questions: Array.from({ length: ROWS }, () => ({ text: '', answer: '' })) })) };
  // Bilder je Feld (seit 2.21.0): Kennung in imgs[ci][r], wählen, fotografieren oder mit Strg+V in das Feld mit dem Cursor
  const imgs = src.categories.map(c => c.questions.map(q => q.img || ''));
  const slot = (ci, r) => { const id = imgs[ci][r], k = `${ci}-${r}`;
    return id ? `${images.imgTag(id, 'img-thumb')}<button type="button" class="icon-btn xs" data-img-del="${k}" title="Bild entfernen" aria-label="Bild entfernen">${icon('x', 14)}</button>`
      : `<label class="btn ghost sm img-pick" title="Bild zur Frage wählen, fotografieren oder mit Strg+V einfügen">${icon('camera', 15)} Bild<input type="file" accept="image/*" data-img-file="${k}" hidden></label>`; };
  const catHtml = (c, ci) => `<fieldset class="jeo-ed-cat"><legend><input name="cat${ci}" class="input" maxlength="40" placeholder="Kategorie ${ci + 1}" value="${esc(c.name)}" aria-label="Name der Kategorie ${ci + 1}"></legend>
    ${c.questions.map((q, r) => `<div class="jeo-ed-row" data-row="${ci}-${r}"><span class="jp-pts">${POINTS[r]}</span><textarea name="q${ci}-${r}" class="input" rows="2" maxlength="400" placeholder="Frage">${esc(q.text)}</textarea><input name="a${ci}-${r}" class="input" maxlength="300" placeholder="Richtige Antwort" value="${esc(q.answer)}"><div class="img-slot jeo-ed-img" data-slot="${ci}-${r}">${slot(ci, r)}</div></div>`).join('')}</fieldset>`;
  dialog({ title: b ? 'Spielbrett bearbeiten' : 'Neues Spielbrett', wide: true, submit: 'Speichern', body: `
    <label class="field">Titel<input name="title" class="input" maxlength="80" required placeholder="z. B. Klassenarbeit Holz – Klasse 6" value="${esc(src.title)}"></label>
    <p class="muted small-text">Je Kategorie bis zu fünf Fragen von leicht (20 Punkte) nach schwer (100 Punkte). Leere Felder erscheinen im Spiel nicht. Jede Frage braucht genau eine eindeutige Antwort. Ein Bild zur Frage ist möglich – es darf die Antwort nicht verraten.</p>
    <div class="jeo-ed">${src.categories.map(catHtml).join('')}</div>
    ${b ? `<div class="jeo-ed-tools"><button type="button" class="btn ghost sm" data-x="export">${icon('download', 15)} Exportieren</button><button type="button" class="btn ghost sm" data-x="copy">${icon('plus', 15)} Kopie anlegen</button><button type="button" class="btn ghost sm danger-text" data-x="delete">${icon('trash', 15)} Löschen</button></div>` : ''}`,
    onOpen: (el, close) => { imgEvents(el, imgs, slot); el.querySelectorAll('[data-x]').forEach(x => x.onclick = async () => {
      if (x.dataset.x === 'export') return downloadFile(`jeopardy-${(b.title || 'spielbrett').replace(/[^\wäöüß-]+/gi, '_')}.json`, await exportText([b]));
      if (x.dataset.x === 'copy') { const id = uid(); store.update(s => { s.quiz.boards.push({ ...structuredClone(b), id, title: b.title + ' (Kopie)' }); }); pickBoard(id); close(); return toast('Kopie angelegt.'); }
      if (x.dataset.x === 'delete') {
        if (game()?.boardId === b.id) return toast('Mit diesem Spielbrett läuft gerade ein Spiel.', { kind: 'warn' });
        if (await confirmDialog('Spielbrett löschen', `„${b.title}“ löschen?`)) { store.update(s => { s.quiz.boards = s.quiz.boards.filter(z => z.id !== b.id); }); pickBoard(''); close(); }
      }
    }); },
    onSubmit: fd => {
      const title = String(fd.get('title') || '').trim(); if (!title) throw new Error('Bitte einen Titel eingeben.');
      const categories = src.categories.map((c, ci) => ({ name: String(fd.get('cat' + ci) || '').trim().slice(0, 40),
        questions: c.questions.map((q, r) => { const { img: _old, ...rest } = q, img = imgs[ci][r];
          return { ...rest, text: String(fd.get(`q${ci}-${r}`) || '').trim().slice(0, 400), answer: String(fd.get(`a${ci}-${r}`) || '').trim().slice(0, 300), ...(img ? { img } : {}) }; }) }));
      const half = categories.flatMap(c => c.questions).filter(q => !!q.text !== !!q.answer).length;
      const lone = categories.flatMap(c => c.questions).filter(q => q.img && !q.text).length;
      if (lone) throw new Error(`${lone === 1 ? 'Ein Bild hat' : lone + ' Bilder haben'} keine Frage – bitte Frage und Antwort ergänzen oder das Bild entfernen.`);
      if (half) throw new Error(`${half === 1 ? 'Ein Feld hat' : half + ' Felder haben'} nur Frage oder nur Antwort – bitte ergänzen oder ganz leeren.`);
      const id = b?.id || uid();
      store.update(s => { const list = (s.quiz.boards ||= []), i = list.findIndex(z => z.id === id), v = { id, title: title.slice(0, 80), classId: b?.classId || '', categories };
        if (i >= 0) list[i] = v; else list.push(v); });
      pickBoard(id);
      toast(b ? 'Gespeichert.' : 'Spielbrett angelegt.');
    } });
}
// Bildfelder im Bearbeiten-Fenster: Datei, Kamera, Entfernen, Einfügen mit Strg+V in das Feld mit dem Cursor
function imgEvents(el, imgs, slot) {
  const form = el.querySelector('form'), err = el.querySelector('.form-error');
  const set = (k, id) => { const [ci, r] = k.split('-').map(Number), box = el.querySelector(`[data-slot="${k}"]`); if (!box) return;
    imgs[ci][r] = id; box.innerHTML = slot(ci, r); images.hydrate(box); };
  const add = async (k, file) => { try { err.hidden = true; set(k, await images.add(file)); } catch (e) { err.textContent = e.message; err.hidden = false; } };
  form.addEventListener('change', e => { const k = e.target.dataset?.imgFile; if (k && e.target.files?.[0]) add(k, e.target.files[0]); });
  form.addEventListener('click', e => { const k = e.target.closest('[data-img-del]')?.dataset.imgDel; if (k) { e.preventDefault(); set(k, ''); } });
  form.addEventListener('paste', e => {
    const file = [...(e.clipboardData?.items || [])].find(x => x.kind === 'file' && x.type.startsWith('image/'))?.getAsFile(); if (!file) return;
    const k = document.activeElement?.closest?.('.jeo-ed-row')?.dataset.row; if (!k) return;
    e.preventDefault(); add(k, file);
  });
  images.hydrate(el);
}

// Export als Datei – mit Bildern als data:-URL (seit 2.21.0), damit Spielbretter samt Bildern auf ein anderes Gerät passen
async function exportText(list) {
  const out = [];
  for (const b of list) out.push({ title: b.title, categories: await Promise.all(b.categories.map(async c => ({ name: c.name,
    questions: await Promise.all(c.questions.filter(filled).map(async q => { const img = q.img ? await images.toDataUrl(q.img) : '';
      return { text: q.text, answer: q.answer, ...(img ? { img } : {}) }; })) }))) });
  return JSON.stringify({ app: 'KlassenKompass', kind: 'bundle', v: 1, boards: out }, null, 1);
}

// Import (aus dem gemeinsamen Import-Dialog): Spielbretter kommen dazu, gleiche Titel bekommen „(2)“.
// Bilder (data:-URL) werden danach auf dem Gerät gespeichert und als Kennung eingetragen.
export function applyBoards(list) {
  let last = null; const todo = [];
  store.update(s => {
    s.quiz.boards ||= [];
    const titles = new Set(s.quiz.boards.map(b => b.title));
    for (const b of list) {
      let title = b.title, n = 2; while (titles.has(title)) title = `${b.title} (${n++})`; titles.add(title);
      last = uid();
      b.categories.forEach((c, ci) => c.questions.forEach((q, r) => { if (q.img) todo.push({ id: last, ci, r, data: q.img }); }));
      s.quiz.boards.push({ id: last, title, classId: '', categories: b.categories.map(c => ({ name: c.name,
        questions: Array.from({ length: ROWS }, (_, r) => ({ text: c.questions[r]?.text || '', answer: c.questions[r]?.answer || '' })) })) });
    }
  });
  if (last) pickBoard(last);
  if (todo.length) attachImages(todo);
  return todo.length;
}
async function attachImages(todo) {
  let bad = 0;
  for (const t of todo) {
    try { const img = await images.fromDataUrl(t.data);
      store.update(s => { const q = s.quiz.boards?.find(b => b.id === t.id)?.categories[t.ci]?.questions[t.r]; if (q) q.img = img; }); }
    catch { bad++; }
  }
  if (bad) toast(`${bad === 1 ? 'Ein Bild' : bad + ' Bilder'} ließ${bad === 1 ? '' : 'en'} sich nicht übernehmen.`, { kind: 'warn' });
}

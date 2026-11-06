// Bereich Quiz: Kartenquiz mit gedruckten Antwortkarten (Fragen, Klassen, Kartendruck, Beamer-Ansicht, Scannen, Ergebnisse)
import * as store from './store.js';
import * as account from './account.js';
import { uid } from './engine.js';
import { esc, icon, dialog, confirmDialog, toast, namesFromText, todayISO, displayDate, downloadFile, toggleFullscreen } from './ui.js';
import { cardSvg, CARD_COUNT, LETTERS } from './cards.js';
import { openScanner } from './scan.js';

// Jedes Gerät bekommt eine zufällige Kennung, damit klar ist, wo ein Quiz läuft
const DEVICE = (() => { const k = 'klassenkompass.device'; try { let d = localStorage.getItem(k); if (!d) { d = uid(); localStorage.setItem(k, d); } return d; } catch { return uid(); } })();
const TYPES = { abcd: { name: 'A – D (4 Antworten)', n: 4 }, abc: { name: 'A – C (3 Antworten)', n: 3 }, ab: { name: 'A – B (2 Antworten)', n: 2 }, tf: { name: 'Richtig / Falsch', n: 2 } };

const Q = () => store.get().quiz;
const cls = () => Q().classes.find(c => c.id === Q().activeClassId) || null;
const qset = () => Q().sets.find(t => t.id === Q().activeSetId) || null;
const running = () => Q().sessions.find(s => !s.done && s.device === DEVICE) || null;
const optLabel = (q, i) => q.options[i] ? `${LETTERS[i]} · ${q.options[i]}` : LETTERS[i];

let root = null, showNames = false, scanner = null, homeTimer = null, podiumId = null;
const live = { remote: null, scanTimer: null, keep: null, lastControl: '', lastCmd: null, applied: new Map(), phoneAt: 0, lastScanAt: 0, error: '' };

export function mount(el) {
  root = el;
  const off = store.subscribe(() => draw());
  root.onclick = onClick;
  root.onchange = onChange;
  draw();
  homeTimer = setInterval(pollHome, 4000); pollHome();
  return () => { off(); clearInterval(homeTimer); stopScanPoll(); scanner?.close(); podiumId = null; root.onclick = root.onchange = null; root = null; };
}

function draw() {
  if (!root) return;
  const s = running();
  if (s) { drawRun(s); startScanPoll(); syncControl(s); }
  else { stopScanPoll(); const p = podiumId && Q().sessions.find(x => x.id === podiumId); if (p) drawPodium(p); else { podiumId = null; drawHome(); } }
}

// ======================================================================
// Podium nach dem Quiz: die besten drei Plätze (Gleichstand teilt sich einen Platz)
// ======================================================================
function ranking(s) {
  const graded = s.questions.filter(q => q.correct !== null && Object.keys(q.answers).length);
  if (!graded.length) return { graded: 0, places: [] };
  const scores = s.students.map(x => ({ name: x.name, score: graded.filter(q => q.answers[x.id] === q.correct).length })).filter(x => x.score > 0);
  const levels = [...new Set(scores.map(x => x.score))].sort((a, b) => b - a).slice(0, 3);
  return { graded: graded.length, places: levels.map((score, i) => ({ place: i + 1, score, names: scores.filter(x => x.score === score).map(x => x.name).sort((a, b) => a.localeCompare(b, 'de')) })) };
}
function drawPodium(s) {
  const { graded, places } = ranking(s);
  const step = n => { const p = places[n - 1]; if (!p) return `<div class="pod-col empty"></div>`;
    return `<div class="pod-col p${n}"><div class="pod-names ${p.names.length > 4 ? 'many' : ''}">${p.names.map(x => `<span>${esc(x)}</span>`).join('')}</div>
      <div class="pod-step"><span class="pod-place">${n}</span><span class="pod-score">${p.score} / ${graded} richtig</span></div></div>`; };
  root.innerHTML = `
  <section class="page quiz quiz-podium">
    <div class="run-head">
      <div><p class="eyebrow">Kartenquiz · ${esc(s.className)} · ${esc(s.title)}</p><h1>Unsere Besten<span class="dot">.</span></h1></div>
      <div class="tools">
        <button class="icon-btn" data-act="present" title="Vollbild" aria-label="Vollbild">${icon(document.body.classList.contains('presenting') ? 'shrink' : 'expand')}</button>
        <button class="btn ghost sm no-present" data-act="result" data-id="${esc(s.id)}">${icon('chart', 16)} Alle Ergebnisse</button>
        <button class="btn primary sm" data-act="podium-close">${icon('check', 16)} Fertig</button>
      </div>
    </div>
    <div class="card pod-card">${places.length ? `<div class="podium">${step(2)}${step(1)}${step(3)}</div>` : '<p class="muted center">Für ein Podium braucht es Fragen mit richtiger Antwort und mindestens eine richtige Antwort.</p>'}</div>
  </section>`;
}

// ======================================================================
// Startseite
// ======================================================================
function drawHome() {
  const q = Q(), c = cls(), t = qset();
  const done = q.sessions.filter(x => x.done).slice().reverse();
  const other = q.sessions.filter(x => !x.done && x.device !== DEVICE && x.id !== live.remote?.sessionId);
  root.innerHTML = `
  <section class="page quiz">
    <div class="page-head">
      <div>
        <p class="eyebrow">Quiz · Abfrage</p>
        <h1>Kartenquiz<span class="dot">.</span></h1>
        <p class="sub">Jede Karte eine Stimme – ohne Handys für die Kinder.</p>
      </div>
      <div class="picker">
        <label class="eyebrow" for="quiz-class">Deine Klasse</label>
        <div class="picker-row">
          <select id="quiz-class" class="select">${q.classes.map(x => `<option value="${esc(x.id)}" ${x.id === q.activeClassId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}${q.classes.length ? '' : '<option>Noch keine Klasse</option>'}</select>
          <button class="icon-btn" data-act="classes" title="Klassen verwalten" aria-label="Klassen verwalten">${icon('sliders')}</button>
        </div>
      </div>
    </div>
    ${live.remote ? `<div class="card live-banner"><div><b>${icon('camera', 18)} Live-Quiz auf einem anderen Gerät</b><span class="muted">${esc(live.remote.className)} · Frage ${live.remote.index + 1}/${live.remote.total}</span></div><button class="btn primary big" data-act="scan-remote">${icon('camera')} Karten scannen</button></div>` : ''}
    <div class="work-grid">
      <div>
        <div class="card">
          <div class="card-head">
            <div><p class="eyebrow">Fragensatz</p>
              <div class="picker-row"><select id="quiz-set" class="select">${q.sets.map(x => `<option value="${esc(x.id)}" ${x.id === q.activeSetId ? 'selected' : ''}>${esc(x.title)} (${x.questions.length})</option>`).join('')}${q.sets.length ? '' : '<option>Noch kein Fragensatz</option>'}</select>
              <button class="icon-btn" data-act="set-new" title="Neuer Fragensatz" aria-label="Neuer Fragensatz">${icon('plus')}</button>
              ${t ? `<button class="icon-btn" data-act="set-edit" title="Umbenennen, kopieren oder löschen" aria-label="Fragensatz bearbeiten">${icon('edit')}</button>` : ''}</div>
            </div>
          </div>
          ${t ? questionList(t) : `<p class="muted">Lege einen Fragensatz an oder starte mit „Schnellstart“ und stelle die Fragen mündlich.</p>`}
          <div class="card-foot">
            <button class="btn ghost" data-act="q-add" ${t ? '' : 'disabled'}>${icon('plus', 16)} Frage hinzufügen</button>
            <div class="tools">
              <button class="btn ghost" data-act="start-quick" ${c ? '' : 'disabled'} title="Ohne vorbereitete Fragen: Du stellst die Frage mündlich oder an der Tafel">Schnellstart</button>
              <button class="btn primary big" data-act="start" ${c && t?.questions.length ? '' : 'disabled'}>${icon('play', 16)} Quiz starten</button>
            </div>
          </div>
        </div>
        <div class="card">
          <h3>${icon('chart', 16)} Ergebnisse</h3>
          ${other.length ? other.map(x => `<p class="notice">Auf einem anderen Gerät läuft noch: ${esc(x.title)} · ${esc(x.className)} <button class="link" data-act="end-other" data-id="${esc(x.id)}">als beendet markieren</button></p>`).join('') : ''}
          ${done.length ? `<ul class="result-list">${done.map(x => { const st = stats(x); return `<li><button class="result-row" data-act="result" data-id="${esc(x.id)}"><span class="r-date">${esc(displayDate(x.date))}</span><span class="r-title"><b>${esc(x.title)}</b><small>${esc(x.className)} · ${x.questions.length} Frage(n) · ${st.answered} Antworten</small></span><span class="r-score">${st.pct === null ? '–' : st.pct + ' %'}</span></button></li>`; }).join('')}</ul>` : '<p class="muted small-text">Noch keine Ergebnisse. Nach jedem Quiz erscheinen sie hier.</p>'}
        </div>
      </div>
      <aside class="side">
        <div class="card">
          <div class="card-head small">
            <h3>${icon('cards', 16)} Klasse &amp; Karten ${c ? `<span class="badge">${c.students.length}</span>` : ''}</h3>
            ${c ? `<button class="icon-btn sm" data-act="students-add" title="Schüler hinzufügen" aria-label="Schüler hinzufügen">${icon('plus', 16)}</button>` : ''}
          </div>
          ${c ? `<ul class="student-list card-list">${c.students.slice().sort((a, b) => a.card - b.card).map(s => `<li><span class="card-no">${s.card}</span><span class="name">${esc(s.name)}</span><button class="icon-btn xs" data-act="student-edit" data-id="${esc(s.id)}" title="Kartennummer ändern oder entfernen" aria-label="${esc(s.name)} bearbeiten">${icon('edit', 14)}</button></li>`).join('')}</ul>
          <p class="muted small-text">Jedes Kind behält seine Kartennummer. Dieselben gedruckten Karten passen für alle Klassen.</p>` : `<p class="muted">Lege eine Klasse an oder übernimm die Namen aus Technik oder Sport.</p><button class="btn primary full" data-act="class-new">${icon('plus')} Neue Klasse</button>`}
          <button class="btn ghost full" data-act="print">${icon('print', 16)} Karten drucken</button>
        </div>
        <div class="card">
          <h3>${icon('help', 16)} So geht’s</h3>
          <ol class="help-list steps small-text">
            <li>Karten einmal drucken (am besten auf festem Papier) und austeilen. Jedes Kind bekommt seine Nummer.</li>
            <li>Quiz starten und am Beamer zeigen. Die Kinder halten ihre Karte so, dass ihre Antwort <b>oben</b> steht.</li>
            <li>Mit dem Handy scannen: Mit Konto auf dem Handy einfach „Karten scannen“ – sonst das Quiz direkt auf dem Gerät mit Kamera starten.</li>
            <li>„Auflösen“ zeigt die Verteilung. Nach „Beenden“ erscheint ein Podium mit den Besten; die Ergebnisse werden gespeichert.</li>
          </ol>
        </div>
      </aside>
    </div>
  </section>`;
}

function questionList(t) {
  if (!t.questions.length) return '<p class="muted">Noch keine Fragen in diesem Satz.</p>';
  return `<ol class="q-list">${t.questions.map((x, i) => `<li>
    <div class="q-main"><b>${esc(x.text) || '<span class="muted">(Frage ohne Text)</span>'}</b>
      <span class="q-opts">${x.options.map((o, k) => `<span class="${x.correct === k ? 'ok' : ''}">${LETTERS[k]}${o ? ' · ' + esc(o) : ''}</span>`).join('')}</span></div>
    <div class="q-tools">
      <button class="icon-btn xs" data-act="q-up" data-i="${i}" ${i ? '' : 'disabled'} title="Nach oben" aria-label="Nach oben">${icon('back', 14)}</button>
      <button class="icon-btn xs" data-act="q-edit" data-i="${i}" title="Bearbeiten" aria-label="Bearbeiten">${icon('edit', 14)}</button>
      <button class="icon-btn xs" data-act="q-del" data-i="${i}" title="Löschen" aria-label="Löschen">${icon('trash', 14)}</button>
    </div></li>`).join('')}</ol>`;
}

function stats(sess) {
  let right = 0, graded = 0, answered = 0;
  for (const q of sess.questions) {
    const vals = Object.values(q.answers); answered += vals.length;
    if (q.correct !== null) { graded += vals.length; right += vals.filter(v => v === q.correct).length; }
  }
  return { answered, pct: graded ? Math.round(right / graded * 100) : null };
}

// ======================================================================
// Beamer-Ansicht eines laufenden Quiz
// ======================================================================
function drawRun(s) {
  const q = s.questions[s.index], n = q.options.length;
  const byStudent = q.answers, answered = s.students.filter(x => byStudent[x.id] !== undefined).length;
  const counts = q.options.map((_, i) => Object.values(byStudent).filter(v => v === i).length);
  const max = Math.max(1, ...counts);
  const phone = account.loggedIn() ? (Date.now() - live.phoneAt < 8000 ? `${icon('check', 14)} Handy verbunden` : `${icon('camera', 14)} Handy: auf dem Handy mit demselben Konto anmelden → Quiz → „Karten scannen“`) : `${icon('camera', 14)} Ohne Konto: auf diesem Gerät scannen oder das Quiz auf dem Handy starten`;
  root.innerHTML = `
  <section class="page quiz quiz-run">
    <div class="run-head">
      <div><p class="eyebrow">Kartenquiz · ${esc(s.className)} · ${esc(s.title)}</p><h1>Frage ${s.index + 1}<span class="muted"> / ${s.questions.length}</span></h1></div>
      <div class="tools">
        <button class="btn ghost sm" data-act="scan-here">${icon('camera', 16)} Hier scannen</button>
        <button class="btn ghost sm no-present" data-act="add-q" title="Weitere Frage spontan anhängen">${icon('plus', 16)} Frage</button>
        <button class="icon-btn" data-act="present" title="Vollbild" aria-label="Vollbild">${icon(document.body.classList.contains('presenting') ? 'shrink' : 'expand')}</button>
        <button class="btn ghost sm" data-act="end">${icon('x', 16)} Beenden</button>
      </div>
    </div>
    <div class="card run-card">
      <p class="run-q">${esc(q.text) || '<span class="muted">Frage mündlich oder an der Tafel</span>'}</p>
      <div class="run-opts n${n}">${q.options.map((o, i) => `
        <div class="run-opt ${s.reveal && q.correct === i ? 'correct' : ''} ${s.reveal && q.correct !== null && q.correct !== i ? 'wrong' : ''}">
          <span class="run-letter">${LETTERS[i]}</span><span class="run-text">${esc(o)}</span>
          ${s.reveal ? `<span class="run-bar"><i style="width:${counts[i] / max * 100}%"></i></span><span class="run-count">${counts[i]}</span>` : ''}
        </div>`).join('')}</div>
      <div class="run-foot">
        <span class="run-progress"><b>${answered}</b> / ${s.students.length} geantwortet${s.reveal && q.correct !== null && answered ? ` · <b>${Math.round(counts[q.correct] / answered * 100)} %</b> richtig` : ''}</span>
        <div class="tools">
          ${q.correct === null ? `<label class="run-correct no-present">Richtig: <select class="select sm" data-act="set-correct"><option value="">–</option>${q.options.map((_, i) => `<option value="${i}">${LETTERS[i]}</option>`).join('')}</select></label>` : ''}
          <button class="btn ghost" data-act="prev" ${s.index ? '' : 'disabled'}>${icon('back', 16)} Zurück</button>
          <button class="btn ${s.reveal ? 'ghost' : 'primary'}" data-act="reveal">${icon('chart', 16)} ${s.reveal ? 'Verbergen' : 'Auflösen'}</button>
          ${s.index < s.questions.length - 1 ? `<button class="btn primary" data-act="next">Weiter ${icon('forward', 16)}</button>` : `<button class="btn primary" data-act="end">${icon('check', 16)} Fertig</button>`}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-head small"><h3>${icon('users', 16)} ${esc(s.className)}</h3>
        <label class="check no-present"><input type="checkbox" data-act="names" ${showNames ? 'checked' : ''}> Antworten bei den Namen zeigen</label></div>
      <div class="tiles">${s.students.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')).map(x => {
        const a = byStudent[x.id], has = a !== undefined, open = s.reveal && showNames && has;
        const cl = !has ? '' : open && q.correct !== null ? (a === q.correct ? 'right' : 'miss') : 'done';
        return `<button class="tile ${cl}" data-act="tile" data-id="${esc(x.id)}" title="Antwort von Hand setzen"><span class="t-no">${x.card}</span><span class="t-name">${esc(x.name)}</span>${open ? `<b class="t-ans">${LETTERS[a]}</b>` : has ? icon('check', 14) : ''}</button>`;
      }).join('')}</div>
      <p class="hint no-present">${phone}${live.error ? ` · <span class="warn-text">${esc(live.error)}</span>` : ''}</p>
    </div>
  </section>`;
}

// ======================================================================
// Aktionen
// ======================================================================
function onChange(e) {
  const t = e.target;
  if (t.id === 'quiz-class') store.update(s => { s.quiz.activeClassId = t.value; });
  else if (t.id === 'quiz-set') store.update(s => { s.quiz.activeSetId = t.value; });
  else if (t.dataset.act === 'names') { showNames = t.checked; draw(); }
  else if (t.dataset.act === 'set-correct' && t.value !== '') updateRun(s => { s.questions[s.index].correct = Number(t.value); });
}

function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
  const act = b.dataset.act, i = Number(b.dataset.i);
  switch (act) {
    case 'classes': return classesDialog();
    case 'class-new': return classDialog();
    case 'students-add': return studentsAddDialog(cls());
    case 'student-edit': return studentDialog(cls(), b.dataset.id);
    case 'print': return printDialog();
    case 'set-new': return setDialog();
    case 'set-edit': return setDialog(qset());
    case 'q-add': return questionDialog(qset());
    case 'q-edit': return questionDialog(qset(), i);
    case 'q-up': return store.update(s => { const t = s.quiz.sets.find(x => x.id === s.quiz.activeSetId); [t.questions[i - 1], t.questions[i]] = [t.questions[i], t.questions[i - 1]]; });
    case 'q-del': return (async () => { if (await confirmDialog('Frage löschen', `„${qset().questions[i].text || 'Frage ' + (i + 1)}“ löschen?`)) store.update(s => { s.quiz.sets.find(x => x.id === s.quiz.activeSetId).questions.splice(i, 1); }); })();
    case 'start': return start(false);
    case 'start-quick': return start(true);
    case 'result': return resultDialog(b.dataset.id);
    case 'end-other': return store.update(s => { const x = s.quiz.sessions.find(y => y.id === b.dataset.id); if (x) x.done = true; });
    case 'scan-remote': return scanRemote();
    // laufendes Quiz
    case 'prev': return go(-1);
    case 'next': return go(1);
    case 'reveal': return updateRun(s => { s.reveal = !s.reveal; });
    case 'end': return endRun();
    case 'add-q': return updateRun(s => { s.questions.push({ id: uid(), text: '', options: ['', '', '', ''], correct: null, answers: {} }); s.index = s.questions.length - 1; s.reveal = false; });
    case 'present': toggleFullscreen(); return draw();
    case 'podium-close': podiumId = null; if (document.body.classList.contains('presenting')) toggleFullscreen(); return draw();
    case 'scan-here': return scanLocal();
    case 'tile': return tileDialog(b.dataset.id);
  }
}

function updateRun(fn) { store.update(st => { const s = st.quiz.sessions.find(x => !x.done && x.device === DEVICE); if (s) fn(s); }); }
function go(d) { updateRun(s => { const n = Math.max(0, Math.min(s.questions.length - 1, s.index + d)); if (n !== s.index) { s.index = n; s.reveal = false; } }); }

function start(quick) {
  const c = cls(), t = qset(); if (!c) return;
  if (!c.students.length) return toast('Die Klasse hat noch keine Schüler.', { kind: 'warn' });
  const old = Q().sessions.find(x => !x.done && x.device === DEVICE);
  const questions = quick ? [{ id: uid(), text: '', options: ['', '', '', ''], correct: null }] : t.questions.filter(x => x.options.length >= 2);
  store.update(s => {
    if (old) s.quiz.sessions.find(x => x.id === old.id).done = true;
    s.quiz.sessions.push({ id: uid(), device: DEVICE, classId: c.id, className: c.name, setId: quick ? '' : t.id, title: quick ? 'Schnellstart' : t.title, date: todayISO(), index: 0, reveal: false, done: false,
      students: c.students.map(x => ({ id: x.id, name: x.name, card: x.card })), questions: questions.map(x => ({ ...structuredClone(x), id: uid(), answers: {} })) });
  });
  live.applied.clear(); live.lastCmd = null; live.lastControl = '';
  scrollTo(0, 0);
}

async function endRun() {
  const s = running(); if (!s) return;
  const st = stats(s);
  if (!(await new Promise(res => { let ok = false; const d = dialog({ title: 'Quiz beenden', submit: 'Beenden', body: `<p>${st.answered ? `Die Ergebnisse (${st.answered} Antworten) werden unter „Ergebnisse“ gespeichert.` : 'Es wurden noch keine Antworten erfasst. Das Quiz wird ohne Ergebnis beendet.'}</p>`, onSubmit: () => { ok = true; res(true); } }); d.el.addEventListener('close', () => { if (!ok) res(false); }); }))) return;
  scanner?.close();
  const showPodium = st.answered && ranking(s).places.length;
  if (showPodium) podiumId = s.id;
  else if (document.body.classList.contains('presenting')) toggleFullscreen();
  store.update(x => {
    const ses = x.quiz.sessions.find(y => y.id === s.id); if (!ses) return;
    if (!st.answered) x.quiz.sessions.splice(x.quiz.sessions.indexOf(ses), 1); else { ses.done = true; ses.reveal = false; }
  });
  stopScanPoll();
  account.liveClear().catch(() => {});
  live.lastControl = '';
  toast(st.answered ? 'Quiz beendet – Ergebnis gespeichert.' : 'Quiz beendet.');
  scrollTo(0, 0);
}

function tileDialog(studentId) {
  const s = running(); if (!s) return;
  const stu = s.students.find(x => x.id === studentId), q = s.questions[s.index], cur = q.answers[studentId];
  const d = dialog({ title: `${stu.name} (Karte ${stu.card})`, submit: null, cancel: 'Schließen', body: `
    <p class="muted small-text">Antwort von Hand setzen, z. B. wenn die Karte fehlt.</p>
    <div class="answer-pick">${q.options.map((o, i) => `<button type="button" class="btn ${cur === i ? 'primary' : 'ghost'}" data-a="${i}">${esc(optLabel(q, i))}</button>`).join('')}
    <button type="button" class="btn ghost" data-a="-1">Keine Antwort</button></div>`,
    onOpen: (el, close) => el.querySelectorAll('[data-a]').forEach(btn => btn.onclick = () => {
      const a = Number(btn.dataset.a);
      updateRun(x => { const qq = x.questions[x.index]; if (a < 0) delete qq.answers[studentId]; else qq.answers[studentId] = a; });
      close();
    }) });
  return d;
}

// ======================================================================
// Scannen
// ======================================================================
function localProvider() {
  return {
    state() {
      const s = running(); if (!s) return null;
      const q = s.questions[s.index], byCard = {};
      s.students.forEach(x => { if (q.answers[x.id] !== undefined) byCard[x.card] = q.answers[x.id]; });
      return { sessionId: s.id, title: s.className, index: s.index, total: s.questions.length, text: q.text, options: q.options, reveal: s.reveal, roster: s.students.map(x => ({ card: x.card, name: x.name })), answers: byCard };
    },
    answer(card, idx) { updateRun(s => { const stu = s.students.find(x => x.card === card); if (stu) s.questions[s.index].answers[stu.id] = idx; }); },
    command(c) { if (c === 'reveal') updateRun(s => { s.reveal = !s.reveal; }); else go(c === 'next' ? 1 : -1); },
    subscribe(fn) { return store.subscribe(fn); },
  };
}
async function scanLocal() {
  if (scanner) return;
  scanner = { close() {} };
  scanner = await openScanner(localProvider(), { onClose: () => { scanner = null; } }) || null;
}

// Handy scannt für ein Quiz, das auf einem anderen Gerät (Beamer-PC) läuft
function remoteProvider() {
  let ctrl = live.remote, mine = {}, cmd = null, pushT = null, poll = null, missing = 0, beat = 0;
  const subs = new Set(), notify = () => subs.forEach(fn => fn());
  const names = () => {
    const ses = Q().sessions.find(x => x.id === ctrl?.sessionId), c = Q().classes.find(x => x.id === ctrl?.classId);
    return new Map((ses?.students || c?.students || []).map(x => [x.card, x.name]));
  };
  const push = () => { clearTimeout(pushT); if (ctrl) pushT = setTimeout(() => { if (ctrl) account.livePut('scans', { v: 1, sessionId: ctrl.sessionId, answers: mine, cmd, at: Date.now() }).catch(() => {}); }, 150); };
  const tick = async () => {
    try {
      const c = await account.liveGet('control');
      if (!c || c.ended || c.sessionId !== ctrl?.sessionId) { if (++missing >= 2 || (c && c.sessionId !== ctrl?.sessionId)) { ctrl = null; clearTimeout(pushT); notify(); toast('Das Quiz wurde am anderen Gerät beendet.'); return; } }
      else { missing = 0; const changed = JSON.stringify(c) !== JSON.stringify(ctrl); ctrl = c; if (changed) notify(); if (++beat % 3 === 0) push(); }
    } catch {}
    poll = setTimeout(tick, 1000);
  };
  poll = setTimeout(tick, 1000);
  push(); // meldet dem Beamer-Gerät: Handy ist verbunden
  return {
    state() {
      if (!ctrl) return null;
      const nm = names(), qid = ctrl.question.id;
      return { sessionId: ctrl.sessionId, title: ctrl.className, index: ctrl.index, total: ctrl.total, text: ctrl.question.text, options: ctrl.question.options, reveal: ctrl.reveal,
        roster: ctrl.cards.map(card => ({ card, name: nm.get(card) || `Karte ${card}` })), answers: { ...(ctrl.answers || {}), ...(mine[qid] || {}) } };
    },
    answer(card, idx) { const qid = ctrl.question.id; (mine[qid] ||= {})[card] = idx; push(); notify(); },
    command(c) { cmd = { id: uid(), type: c }; push(); },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); if (!subs.size) { clearTimeout(poll); clearTimeout(pushT); } }; },
  };
}
async function scanRemote() {
  if (scanner || !live.remote) return;
  scanner = { close() {} };
  scanner = await openScanner(remoteProvider(), { onClose: () => { scanner = null; pollHome(); } }) || null;
}

// ======================================================================
// Live-Abgleich zwischen Beamer-Gerät und Handy (nur mit Konto)
// ======================================================================
async function pollHome() {
  if (!root || running() || scanner || !account.loggedIn() || document.visibilityState !== 'visible') return;
  try {
    const c = await account.liveGet('control');
    const next = c && !c.ended && c.device !== DEVICE && Date.now() - (c.at || 0) < 6 * 3600e3 ? c : null;
    const changed = JSON.stringify(next && [next.sessionId, next.index, next.total, next.className]) !== JSON.stringify(live.remote && [live.remote.sessionId, live.remote.index, live.remote.total, live.remote.className]);
    live.remote = next;
    if (changed && root && !running()) drawHome();
  } catch {}
}

let controlT = null;
function syncControl(s) {
  if (!account.loggedIn()) return;
  const q = s.questions[s.index], answers = {};
  s.students.forEach(x => { if (q.answers[x.id] !== undefined) answers[x.card] = q.answers[x.id]; });
  const payload = { v: 1, device: DEVICE, sessionId: s.id, classId: s.classId, className: s.className, index: s.index, total: s.questions.length, reveal: s.reveal,
    question: { id: q.id, text: q.text, options: q.options }, cards: s.students.map(x => x.card), answers };
  const key = JSON.stringify(payload);
  if (key === live.lastControl) return;
  live.lastControl = key;
  clearTimeout(controlT);
  controlT = setTimeout(() => account.livePut('control', { ...payload, at: Date.now() }).then(() => { live.error = ''; }).catch(() => { live.error = 'Live-Verbindung gestört'; live.lastControl = ''; }), 120);
}
function startScanPoll() {
  if (live.scanTimer || !account.loggedIn()) return;
  clearInterval(live.keep);
  const tick = async () => {
    const cur = running();
    if (!cur) { live.scanTimer = null; return; }
    try {
      const p = await account.liveGet('scans');
      if (p && p.sessionId === cur.id) applyScans(cur, p);
    } catch {}
    if (live.scanTimer) live.scanTimer = setTimeout(tick, 1500);
  };
  live.scanTimer = setTimeout(tick, 300);
  // Bei abgelaufenem Zeitstempel wenigstens einmal pro Minute erneut senden, damit das Handy das Quiz findet
  live.keep = setInterval(() => { live.lastControl = ''; const r = running(); if (r) syncControl(r); }, 60000);
}
function stopScanPoll() { clearTimeout(live.scanTimer); live.scanTimer = null; clearInterval(live.keep); }

function applyScans(s, p) {
  const wasConnected = Date.now() - live.phoneAt < 8000;
  if (p.at && p.at !== live.lastScanAt) { live.lastScanAt = p.at; live.phoneAt = Date.now(); }
  const changes = [];
  for (const [qid, map] of Object.entries(p.answers || {})) for (const [card, idx] of Object.entries(map)) {
    const key = qid + ':' + card;
    if (live.applied.get(key) === idx) continue; // schon übernommen (Korrekturen am PC bleiben bestehen)
    live.applied.set(key, idx); changes.push([qid, Number(card), idx]);
  }
  const cmd = p.cmd && p.cmd.id !== live.lastCmd ? p.cmd : null;
  if (cmd) live.lastCmd = cmd.id;
  if (changes.length) updateRun(x => { for (const [qid, card, idx] of changes) { const q = x.questions.find(y => y.id === qid), stu = x.students.find(y => y.card === card); if (q && stu && idx >= 0 && idx < q.options.length) q.answers[stu.id] = idx; } });
  if (cmd) { if (cmd.type === 'reveal') updateRun(x => { x.reveal = !x.reveal; }); else if (cmd.type === 'next' || cmd.type === 'prev') go(cmd.type === 'next' ? 1 : -1); }
  if (!changes.length && !cmd && wasConnected !== (Date.now() - live.phoneAt < 8000)) draw();
}

// ======================================================================
// Klassen
// ======================================================================
function classesDialog() {
  const q = Q();
  dialog({ title: 'Quiz-Klassen', submit: null, cancel: 'Schließen', body: `
    <ul class="manage-list">${q.classes.map(c => `<li><span class="name"><b>${esc(c.name)}</b> <small class="muted">${c.students.length} Schüler</small></span>
      <button type="button" class="icon-btn sm" data-m="edit" data-id="${esc(c.id)}" title="Umbenennen" aria-label="Umbenennen">${icon('edit', 15)}</button>
      <button type="button" class="icon-btn sm" data-m="del" data-id="${esc(c.id)}" title="Löschen" aria-label="Löschen">${icon('trash', 15)}</button></li>`).join('') || '<li class="muted">Noch keine Klasse.</li>'}</ul>
    <button type="button" class="btn primary full" data-m="new">${icon('plus')} Neue Klasse</button>`,
    onOpen: (el, close) => el.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
      const id = b.dataset.id, c = Q().classes.find(x => x.id === id);
      if (b.dataset.m === 'new') { close(); return classDialog(); }
      if (b.dataset.m === 'edit') { close(); return renameClass(c); }
      close();
      if (await confirmDialog('Klasse löschen', `Die Quiz-Klasse „${c.name}“ löschen? Gespeicherte Ergebnisse bleiben erhalten.`)) store.update(s => { s.quiz.classes = s.quiz.classes.filter(x => x.id !== id); if (s.quiz.activeClassId === id) s.quiz.activeClassId = s.quiz.classes[0]?.id ?? null; });
    }) });
}
function renameClass(c) {
  dialog({ title: 'Klasse umbenennen', body: `<label class="field">Name<input name="name" class="input" value="${esc(c.name)}" maxlength="60" required></label>`,
    onSubmit: fd => { const n = String(fd.get('name')).trim(); if (!n) throw new Error('Bitte einen Namen eingeben.'); store.update(s => { s.quiz.classes.find(x => x.id === c.id).name = n; }); } });
}
function sources() {
  const s = store.get();
  return [...s.technik.classes.map(c => ({ id: 't:' + c.id, label: `Technik · ${c.name}`, names: c.students.map(x => x.name) })),
    ...s.sport.groups.map(g => ({ id: 's:' + g.id, label: `Sport · ${g.name}`, names: g.students.map(x => x.name) }))];
}
function classDialog() {
  const src = sources();
  dialog({ title: 'Neue Quiz-Klasse', submit: 'Anlegen', body: `
    <label class="field">Name der Klasse<input name="name" class="input" maxlength="60" placeholder="z. B. Informatik 8" required></label>
    ${src.length ? `<label class="field">Namen übernehmen aus<select name="src" class="select"><option value="">– eigene Liste eingeben –</option>${src.map(x => `<option value="${esc(x.id)}">${esc(x.label)} (${x.names.length})</option>`).join('')}</select></label>` : ''}
    <label class="field">Vornamen <small class="muted">(eine Zeile pro Kind, höchstens ${CARD_COUNT})</small><textarea name="names" class="input" rows="6" placeholder="Amelie&#10;Ben&#10;…"></textarea></label>`,
    onOpen: el => { const sel = el.querySelector('[name=src]'); if (sel) sel.onchange = () => { const x = src.find(y => y.id === sel.value); if (x) { el.querySelector('[name=names]').value = x.names.join('\n'); if (!el.querySelector('[name=name]').value) el.querySelector('[name=name]').value = x.label.split(' · ')[1]; } }; },
    onSubmit: fd => {
      const name = String(fd.get('name')).trim(), names = namesFromText(String(fd.get('names') || ''));
      if (!name) throw new Error('Bitte einen Namen eingeben.');
      if (names.length > CARD_COUNT) throw new Error(`Höchstens ${CARD_COUNT} Kinder – es gibt ${CARD_COUNT} Karten.`);
      const c = { id: uid(), name, students: names.map((n, i) => ({ id: uid(), name: n, card: i + 1 })) };
      store.update(s => { s.quiz.classes.push(c); s.quiz.activeClassId = c.id; });
      toast(`Klasse angelegt: Karten 1 bis ${names.length || 0} vergeben.`);
    } });
}
function studentsAddDialog(c) {
  if (!c) return;
  dialog({ title: `Schüler zu ${c.name} hinzufügen`, submit: 'Hinzufügen', body: `<label class="field">Vornamen <small class="muted">(eine Zeile pro Kind)</small><textarea name="names" class="input" rows="5"></textarea></label>`,
    onSubmit: fd => {
      const names = namesFromText(String(fd.get('names') || ''));
      if (c.students.length + names.length > CARD_COUNT) throw new Error(`Höchstens ${CARD_COUNT} Kinder pro Klasse.`);
      store.update(s => { const k = s.quiz.classes.find(x => x.id === c.id), used = new Set(k.students.map(x => x.card));
        names.forEach(n => { let no = 1; while (used.has(no)) no++; used.add(no); k.students.push({ id: uid(), name: n, card: no }); }); });
    } });
}
function studentDialog(c, id) {
  const stu = c.students.find(x => x.id === id); if (!stu) return;
  const owner = no => c.students.find(x => x.card === no && x.id !== id);
  dialog({ title: stu.name, submit: 'Speichern', body: `
    <label class="field">Vorname<input name="name" class="input" value="${esc(stu.name)}" maxlength="40" required></label>
    <label class="field">Kartennummer<select name="card" class="select">${Array.from({ length: CARD_COUNT }, (_, i) => i + 1).map(no => `<option value="${no}" ${no === stu.card ? 'selected' : ''}>${no}${owner(no) ? ` – tauschen mit ${esc(owner(no).name)}` : ''}</option>`).join('')}</select></label>
    <button type="button" class="btn ghost danger-text" data-m="del">${icon('trash', 16)} Aus der Klasse entfernen</button>`,
    onOpen: (el, close) => el.querySelector('[data-m=del]').onclick = async () => { close(); if (await confirmDialog('Entfernen', `${stu.name} aus der Quiz-Klasse entfernen?`, 'Entfernen')) store.update(s => { const k = s.quiz.classes.find(x => x.id === c.id); k.students = k.students.filter(x => x.id !== id); }); },
    onSubmit: fd => {
      const name = String(fd.get('name')).trim(), no = Number(fd.get('card'));
      if (!name) throw new Error('Bitte einen Namen eingeben.');
      store.update(s => { const k = s.quiz.classes.find(x => x.id === c.id), me = k.students.find(x => x.id === id), other = k.students.find(x => x.card === no && x.id !== id);
        if (other) other.card = me.card; me.card = no; me.name = name; });
    } });
}

// ======================================================================
// Fragensätze und Fragen
// ======================================================================
function setDialog(t) {
  dialog({ title: t ? 'Fragensatz bearbeiten' : 'Neuer Fragensatz', submit: 'Speichern', body: `
    <label class="field">Titel<input name="title" class="input" value="${esc(t?.title || '')}" maxlength="80" placeholder="z. B. Werkzeugkunde – Wiederholung" required></label>
    ${t ? `<div class="tools"><button type="button" class="btn ghost sm" data-m="copy">Kopie anlegen</button><button type="button" class="btn ghost sm danger-text" data-m="del">${icon('trash', 15)} Löschen</button></div>` : ''}`,
    onOpen: (el, close) => {
      el.querySelector('[data-m=copy]')?.addEventListener('click', () => { close(); const copy = { ...structuredClone(t), id: uid(), demo: false, title: t.title + ' (Kopie)' }; copy.questions.forEach(x => { x.id = uid(); }); store.update(s => { s.quiz.sets.push(copy); s.quiz.activeSetId = copy.id; }); });
      el.querySelector('[data-m=del]')?.addEventListener('click', async () => { close(); if (await confirmDialog('Fragensatz löschen', `„${t.title}“ mit ${t.questions.length} Frage(n) löschen? Gespeicherte Ergebnisse bleiben erhalten.`)) store.update(s => { s.quiz.sets = s.quiz.sets.filter(x => x.id !== t.id); if (s.quiz.activeSetId === t.id) s.quiz.activeSetId = s.quiz.sets[0]?.id ?? null; }); });
    },
    onSubmit: fd => {
      const title = String(fd.get('title')).trim(); if (!title) throw new Error('Bitte einen Titel eingeben.');
      if (t) store.update(s => { s.quiz.sets.find(x => x.id === t.id).title = title; });
      else { const n = { id: uid(), title, questions: [] }; store.update(s => { s.quiz.sets.push(n); s.quiz.activeSetId = n.id; }); setTimeout(() => questionDialog(qset()), 50); }
    } });
}

function questionDialog(t, index = -1) {
  if (!t) return;
  const old = index >= 0 ? t.questions[index] : null;
  let type = !old ? 'abcd' : old.options.length === 2 && old.options[0] === 'Richtig' && old.options[1] === 'Falsch' ? 'tf' : ({ 4: 'abcd', 3: 'abc', 2: 'ab' })[old.options.length];
  let opts = old ? [...old.options] : ['', '', '', ''], correct = old ? old.correct : null;
  const optHtml = () => {
    const n = TYPES[type].n;
    return Array.from({ length: n }, (_, i) => `<div class="opt-row"><label class="opt-correct" title="Richtige Antwort"><input type="radio" name="correct" value="${i}" ${correct === i ? 'checked' : ''}><span>${LETTERS[i]}</span></label>
      <input name="o${i}" class="input" maxlength="120" value="${esc(type === 'tf' ? ['Richtig', 'Falsch'][i] : opts[i] || '')}" ${type === 'tf' ? 'readonly' : ''} placeholder="Antwort ${LETTERS[i]} (optional)"></div>`).join('') +
      `<label class="check"><input type="radio" name="correct" value="" ${correct === null ? 'checked' : ''}> Keine richtige Antwort (Umfrage, Meinung)</label>`;
  };
  dialog({ title: old ? `Frage ${index + 1} bearbeiten` : 'Neue Frage', submit: old ? 'Speichern' : 'Hinzufügen', wide: true, body: `
    <label class="field">Frage<textarea name="text" class="input" rows="3" maxlength="400" placeholder="Was möchtest du fragen?">${esc(old?.text || '')}</textarea></label>
    <label class="field">Antwortart<select name="type" class="select">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
    <p class="eyebrow">Antworten · Kreis = richtige Antwort</p>
    <div data-opts>${optHtml()}</div>
    ${old ? '' : '<label class="check"><input type="checkbox" name="more" checked> Danach gleich die nächste Frage anlegen</label>'}`,
    onOpen: el => {
      const sel = el.querySelector('[name=type]'), wrap = el.querySelector('[data-opts]');
      sel.onchange = () => {
        wrap.querySelectorAll('input[name^=o]').forEach((inp, i) => { if (type !== 'tf') opts[i] = inp.value; });
        const r = wrap.querySelector('[name=correct]:checked'); correct = r && r.value !== '' ? Number(r.value) : null;
        type = sel.value; if (correct !== null && correct >= TYPES[type].n) correct = null;
        wrap.innerHTML = optHtml();
      };
    },
    onSubmit: fd => {
      const n = TYPES[fd.get('type')].n;
      const options = Array.from({ length: n }, (_, i) => String(fd.get('o' + i) || '').trim());
      const c = fd.get('correct'), q = { id: old?.id || uid(), text: String(fd.get('text') || '').trim(), options, correct: c === null || c === '' ? null : Number(c) };
      if (!q.text && options.every(o => !o)) throw new Error('Bitte eine Frage oder Antworten eintragen.');
      store.update(s => { const set = s.quiz.sets.find(x => x.id === t.id); if (old) set.questions[index] = q; else set.questions.push(q); });
      if (!old && fd.get('more') === 'on') setTimeout(() => questionDialog(qset()), 50);
    } });
}

// ======================================================================
// Kartendruck
// ======================================================================
function printDialog() {
  const c = cls();
  dialog({ title: 'Antwortkarten drucken', submit: 'Drucken', body: `
    <div class="print-preview">${cardSvg(1, { size: '120' })}<p class="small-text muted">Jede Karte hat ein eigenes Muster. Die Kinder halten sie so, dass der Buchstabe ihrer Antwort <b>oben</b> steht. Die Buchstaben sind klein und hell, damit die Nachbarn sie kaum lesen können.</p></div>
    <label class="field">Karten pro Seite (A4)<select name="per" class="select"><option value="2" selected>2 – groß, für Räume bis etwa 8 m</option><option value="1">1 – sehr groß, für Halle oder großen Raum</option><option value="4">4 – klein, für kleine Räume</option></select></label>
    <label class="field">Welche Karten<select name="which" class="select"><option value="all">Alle ${CARD_COUNT} Karten</option>${c?.students.length ? `<option value="class">Nur die Nummern der Klasse ${esc(c.name)} (${c.students.length})</option>` : ''}<option value="range">Bereich wählen …</option></select></label>
    <div class="two" data-range hidden><label class="field">Von<input name="from" type="number" class="input" min="1" max="${CARD_COUNT}" value="1"></label><label class="field">Bis<input name="to" type="number" class="input" min="1" max="${CARD_COUNT}" value="${CARD_COUNT}"></label></div>
    <p class="muted small-text">Tipp: auf festes Papier drucken oder laminieren (matte Folie spiegelt weniger). Im Druckdialog „Tatsächliche Größe“ bzw. 100 % wählen.</p>`,
    onOpen: el => { const w = el.querySelector('[name=which]'); w.onchange = () => { el.querySelector('[data-range]').hidden = w.value !== 'range'; }; },
    onSubmit: fd => {
      const which = fd.get('which'); let nums;
      if (which === 'class') nums = c.students.map(x => x.card).sort((a, b) => a - b);
      else if (which === 'range') { const a = Math.max(1, Math.min(CARD_COUNT, Number(fd.get('from')) || 1)), b = Math.max(a, Math.min(CARD_COUNT, Number(fd.get('to')) || CARD_COUNT)); nums = Array.from({ length: b - a + 1 }, (_, i) => a + i); }
      else nums = Array.from({ length: CARD_COUNT }, (_, i) => i + 1);
      printCards(nums, Number(fd.get('per')));
    } });
}
function printCards(nums, per) {
  document.getElementById('print-cards')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'print-cards'; wrap.className = 'pc-' + per;
  const pages = [];
  for (let i = 0; i < nums.length; i += per) pages.push(nums.slice(i, i + per));
  wrap.innerHTML = pages.map(p => `<section class="pc-page">${p.map(n => `<div class="pc-cell">${cardSvg(n)}</div>`).join('')}</section>`).join('');
  document.body.append(wrap); document.body.classList.add('printing-cards');
  const done = () => { wrap.remove(); document.body.classList.remove('printing-cards'); removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  setTimeout(() => print(), 60);
}

// ======================================================================
// Ergebnisse
// ======================================================================
function resultDialog(id) {
  const s = Q().sessions.find(x => x.id === id); if (!s) return;
  const st = stats(s), graded = s.questions.filter(q => q.correct !== null && Object.keys(q.answers).length);
  const rows = s.students.slice().sort((a, b) => a.name.localeCompare(b.name, 'de')).map(stu => {
    const right = graded.filter(q => q.answers[stu.id] === q.correct).length;
    return `<tr><th>${esc(stu.name)} <small class="muted">${stu.card}</small></th>${s.questions.map(q => { const a = q.answers[stu.id]; return `<td class="${a === undefined ? 'none' : q.correct === null ? '' : a === q.correct ? 'right' : 'miss'}">${a === undefined ? '–' : LETTERS[a]}</td>`; }).join('')}<td class="sum">${graded.length ? `${right}/${graded.length}` : '–'}</td></tr>`;
  }).join('');
  const qpct = q => { const v = Object.values(q.answers); return q.correct === null || !v.length ? '–' : Math.round(v.filter(x => x === q.correct).length / v.length * 100) + ' %'; };
  dialog({ title: `${s.title} · ${s.className}`, submit: null, cancel: 'Schließen', wide: true, body: `
    <p class="muted">${esc(displayDate(s.date))} · ${s.questions.length} Frage(n) · ${st.answered} Antworten${st.pct !== null ? ` · <b>${st.pct} % richtig</b>` : ''}</p>
    <ol class="result-qs">${s.questions.map((q, i) => `<li><b>${esc(q.text) || `Frage ${i + 1}`}</b> <span class="muted">${q.correct !== null ? `richtig: ${LETTERS[q.correct]} · ${qpct(q)}` : 'ohne richtige Antwort'}</span>
      <span class="q-dist">${q.options.map((o, k) => `<span class="${q.correct === k ? 'ok' : ''}">${LETTERS[k]}: ${Object.values(q.answers).filter(v => v === k).length}</span>`).join('')}</span></li>`).join('')}</ol>
    <div class="table-scroll"><table class="table-std result-table"><thead><tr><th>Name</th>${s.questions.map((_, i) => `<th>F${i + 1}</th>`).join('')}<th>Richtig</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="tools">${ranking(s).places.length ? `<button type="button" class="btn ghost sm" data-m="podium">${icon('trophy', 15)} Podium zeigen</button>` : ''}<button type="button" class="btn ghost sm" data-m="csv">${icon('download', 15)} Als Tabelle (CSV)</button><button type="button" class="btn ghost sm danger-text" data-m="del">${icon('trash', 15)} Ergebnis löschen</button></div>`,
    onOpen: (el, close) => {
      el.querySelector('[data-m=podium]')?.addEventListener('click', () => { close(); podiumId = id; draw(); scrollTo(0, 0); });
      el.querySelector('[data-m=csv]').onclick = () => downloadFile(`Kartenquiz-${s.date}-${s.className}.csv`.replace(/[\\/:*?"<>|]/g, '_'), csv(s), 'text/csv;charset=utf-8');
      el.querySelector('[data-m=del]').onclick = async () => { close(); if (await confirmDialog('Ergebnis löschen', `Ergebnis „${s.title}“ vom ${displayDate(s.date)} löschen?`)) store.update(x => { x.quiz.sessions = x.quiz.sessions.filter(y => y.id !== id); }); };
    } });
}
function csv(s) {
  const cell = v => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const graded = s.questions.filter(q => q.correct !== null && Object.keys(q.answers).length);
  const lines = [['Name', 'Karte', ...s.questions.map((q, i) => `F${i + 1}${q.text ? ': ' + q.text : ''}`), 'Richtig', 'Bewertete Fragen']];
  lines.push(['Richtige Antwort', '', ...s.questions.map(q => q.correct === null ? '' : LETTERS[q.correct]), '', '']);
  for (const stu of s.students) lines.push([stu.name, stu.card, ...s.questions.map(q => q.answers[stu.id] === undefined ? '' : LETTERS[q.answers[stu.id]]), graded.filter(q => q.answers[stu.id] === q.correct).length, graded.length]);
  return '﻿' + lines.map(l => l.map(cell).join(';')).join('\r\n');
}

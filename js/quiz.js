// Bereich Quiz: Kartenquiz mit gedruckten Antwortkarten (Fragen, Klassen, Kartendruck, Beamer-Ansicht, Scannen, Ergebnisse)
import * as store from './store.js';
import * as account from './account.js';
import { uid } from './engine.js';
import { esc, icon, dialog, confirmDialog, toast, todayISO, displayDate, downloadFile, toggleFullscreen } from './ui.js';
import { ANIMALS, animalSvg } from './animals.js';
import { cardSvg, CARD_COUNT, LETTERS } from './cards.js';
import { openScanner } from './scan.js';
import * as images from './images.js';
import * as sound from './sound.js';

// Jedes Gerät bekommt eine zufällige Kennung, damit klar ist, wo ein Quiz läuft
const DEVICE = (() => { const k = 'klassenkompass.device'; try { let d = localStorage.getItem(k); if (!d) { d = uid(); localStorage.setItem(k, d); } return d; } catch { return uid(); } })();
const TYPES = { abcd: { name: 'A – D (4 Antworten)', n: 4 }, abc: { name: 'A – C (3 Antworten)', n: 3 }, ab: { name: 'A – B (2 Antworten)', n: 2 }, tf: { name: 'Richtig / Falsch', n: 2 } };

const Q = () => store.get().quiz;
// Seit 1.17.0 nur Tiernamen: Jede Quiz-Klasse hat Name und Kinderzahl; Karte 1 ist immer der Adler, Karte 2 der Biber …
// Wer welches Tier ist, steht nur auf dem Zuordnungsblatt der Lehrkraft (Papier), nie in der App.
const cls = () => Q().classes.find(c => c.id === Q().activeClassId) || null;
const sym = (card, size = '1.35em') => animalSvg(card, { size, title: false });
const qset = () => Q().sets.find(t => t.id === Q().activeSetId) || null;
const running = () => Q().sessions.find(s => !s.done && s.device === DEVICE) || null;
const present = s => s.students.filter(x => !s.absent?.includes(x.id));
const autoDone = new Set();
// „Fehlt heute“ vor dem Start – gilt nur bis zum nächsten Öffnen der App und wird nicht gespeichert
const absentByClass = new Map();
const absentFor = id => { if (!absentByClass.has(id)) absentByClass.set(id, new Set()); return absentByClass.get(id); };
const optLabel = (q, i) => q.options[i] ? `${LETTERS[i]} · ${q.options[i]}` : LETTERS[i];

let root = null, showNames = false, scanner = null, homeTimer = null, podiumId = null, rankId = null;
// Nur für die Optik: welche Antworten schon gezeigt wurden (Kachel „springt“ nur beim ersten Mal), welche Auflösung schon animiert wurde, welches Podium schon Konfetti hatte
const seenAns = new Set(); let seenQ = '', revealAnim = '', confettiFor = '';
// Bühne: Animationen laufen ab einem festen Startzeitpunkt. Weil bei jeder Änderung neu gezeichnet wird, setzt die
// Zeichnung sie mit negativer Verzögerung (CSS-Variable) an der richtigen Stelle fort, statt sie neu zu starten.
const animAt = new Map(), begun = new Set();
const animT = key => { const now = performance.now(), first = !animAt.has(key); if (first) animAt.set(key, now); return { first, t: `-${Math.round(now - animAt.get(key))}ms` }; };
let boardFor = '', allInFor = '';
// Formen der Antworten (zusätzlich zur Farbe): A Dreieck, B Raute, C Kreis, D Quadrat
const SHAPES = ['<path d="M50 10 92 86H8Z"/>', '<path d="M50 6 94 50 50 94 6 50Z"/>', '<circle cx="50" cy="50" r="43"/>', '<rect x="10" y="10" width="80" height="80" rx="9"/>'];
const shape = i => `<span class="qs-shape"><svg viewBox="0 0 100 100" aria-hidden="true">${SHAPES[i]}</svg><b>${LETTERS[i]}</b></span>`;
const live = { remote: null, scanTimer: null, keep: null, lastControl: '', lastCmd: null, applied: new Map(), phoneAt: 0, lastScanAt: 0, error: '' };

export function mount(el) {
  root = el;
  const off = store.subscribe(() => draw());
  const onImages = () => draw();
  addEventListener('kk-images', onImages);
  root.onclick = onClick;
  root.onchange = onChange;
  draw();
  homeTimer = setInterval(pollHome, 4000); pollHome();
  document.addEventListener('visibilitychange', onVisible);
  return () => { off(); removeEventListener('kk-images', onImages); document.removeEventListener('visibilitychange', onVisible); clearInterval(homeTimer); stopScanPoll(); scanner?.close(); podiumId = null; keepAwake(false); sound.quizMusic(false); root.onclick = root.onchange = null; root = null; };
}

function draw() {
  if (!root) return;
  const s = running();
  if (s) { drawRun(s); startScanPoll(); syncControl(s); checkAuto(s); }
  else { sound.quizMusic(false); stopScanPoll(); const p = podiumId && Q().sessions.find(x => x.id === podiumId), r = !p && rankId && Q().classes.find(x => x.id === rankId);
    if (p) drawPodium(p); else if (r) drawRanking(r); else { podiumId = rankId = null; drawHome(); } }
  images.hydrate(root);
  keepAwake(!!(s || podiumId));
}

// ---------- Bildschirm anlassen, solange ein Quiz läuft oder das Podium steht (Screen Wake Lock) ----------
// Der Browser gibt die Sperre frei, sobald die Seite verdeckt ist; beim Zurückkehren wird sie neu angefordert.
let wakeLock = null, wakePending = false;
function keepAwake(want) {
  if (!('wakeLock' in navigator)) return;
  const held = wakeLock && !wakeLock.released;
  if (want && !held && !wakePending && document.visibilityState === 'visible') {
    wakePending = true;
    navigator.wakeLock.request('screen').then(l => { wakeLock = l; if (!root || !(running() || podiumId)) keepAwake(false); }).catch(() => {}).finally(() => { wakePending = false; });
  } else if (!want && held) { wakeLock.release().catch(() => {}); wakeLock = null; }
}
function onVisible() { if (document.visibilityState === 'visible' && root) keepAwake(!!(running() || podiumId)); }

// Automatisch auflösen, sobald alle anwesenden Kinder geantwortet haben (je Frage nur einmal)
function checkAuto(s) {
  if (Q().autoReveal === false || s.reveal) return;
  const q = s.questions[s.index], pres = present(s);
  if (!pres.length || autoDone.has(q.id) || pres.some(x => q.answers[x.id] === undefined)) return;
  autoDone.add(q.id);
  setTimeout(() => updateRun(x => { if (x.questions[x.index].id === q.id) x.reveal = true; }), 800);
}

// ======================================================================
// Podium nach dem Quiz: die besten drei Plätze (Gleichstand teilt sich einen Platz)
// ======================================================================
function ranking(s) {
  const graded = s.questions.filter(q => q.correct !== null && Object.keys(q.answers).length);
  if (!graded.length) return { graded: 0, places: [] };
  const scores = s.students.map(x => ({ name: x.name, card: x.card, score: graded.filter(q => q.answers[x.id] === q.correct).length })).filter(x => x.score > 0);
  const levels = [...new Set(scores.map(x => x.score))].sort((a, b) => b - a).slice(0, 3);
  return { graded: graded.length, places: levels.map((score, i) => ({ place: i + 1, score, names: scores.filter(x => x.score === score).sort((a, b) => a.name.localeCompare(b.name, 'de')) })) };
}
function drawPodium(s) {
  const { graded, places } = ranking(s), a = animT('podium|' + s.id);
  if (a.first && places.length) sound.quizFx('podium');
  const step = n => { const p = places[n - 1]; if (!p) return `<div class="pod-col empty"></div>`;
    return `<div class="pod-col p${n}"><div class="pod-names ${p.names.length > 4 ? 'many' : ''}">${p.names.map(x => `<span>${sym(x.card, '1.2em')} ${esc(x.name)}</span>`).join('')}</div>
      <div class="pod-step"><span class="pod-place">${n}</span><span class="pod-score">${p.score} / ${graded} richtig</span></div></div>`; };
  root.innerHTML = `
  <section class="page quiz quiz-podium">
    <div class="run-head">
      <div><p class="eyebrow">Kartenquiz · ${esc(s.className)} · ${esc(s.title)}</p><h1>Unsere Besten<span class="dot">.</span></h1></div>
      <div class="tools">
        <button class="icon-btn" data-act="sound" title="Töne im Quiz" aria-label="Töne im Quiz">${icon(sound.quizSound().on ? 'volume' : 'mute')}</button>
        <button class="icon-btn" data-act="present" title="Vollbild" aria-label="Vollbild">${icon(document.body.classList.contains('presenting') ? 'shrink' : 'expand')}</button>
        <button class="btn ghost sm no-present" data-act="result" data-id="${esc(s.id)}">${icon('chart', 16)} Alle Ergebnisse</button>
        <button class="btn primary sm" data-act="podium-close">${icon('check', 16)} Fertig</button>
      </div>
    </div>
    <div class="qs pod-card" style="--tp:${a.t}">${places.length ? confetti(s.id) : ''}${places.length ? `<div class="podium">${step(2)}${step(1)}${step(3)}</div>` : '<p class="qs-empty">Für ein Podium braucht es Fragen mit richtiger Antwort und mindestens eine richtige Antwort.</p>'}</div>
  </section>`;
}

// Konfetti nur beim ersten Anzeigen eines Podiums (bei „weniger Bewegung“ per CSS ausgeblendet)
function confetti(id) {
  if (confettiFor === id) return '';
  confettiFor = id;
  const cols = ['#e0533d', '#2f6fd0', '#e3a312', '#7a4fc4', '#3f9a5c', '#f2c14e'];
  return `<div class="confetti" aria-hidden="true">${Array.from({ length: 70 }, (_, i) => `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${cols[i % cols.length]};animation-delay:${(3.5 + Math.random() * 1.4).toFixed(2)}s;animation-duration:${(2.6 + Math.random() * 1.8).toFixed(2)}s;--dx:${(Math.random() * 160 - 80).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;width:${6 + Math.round(Math.random() * 6)}px"></i>`).join('')}</div>`;
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
              <button class="icon-btn" data-act="set-import" title="Fragensätze importieren (Datei oder Text)" aria-label="Fragensätze importieren">${icon('upload')}</button>
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
        ${c ? rankCard(c) : ''}
      </div>
      <aside class="side">
        <div class="card">
          <div class="card-head small">
            <h3>${icon('cards', 16)} Klasse &amp; Karten ${c ? `<span class="badge">${c.students.length}</span>` : ''}</h3>
            ${c ? `<button class="icon-btn sm" data-act="class-edit" title="Name oder Kinderzahl ändern" aria-label="Klasse bearbeiten">${icon('edit', 16)}</button>` : ''}
          </div>
          ${c ? (() => { const off = absentFor(c.id), n = c.students.filter(x => off.has(x.id)).length; return `<ul class="student-list card-list">${c.students.slice().sort((a, b) => a.card - b.card).map(s => `<li class="${off.has(s.id) ? 'off' : ''}"><span class="card-no">${s.card}</span>${sym(s.card)}<span class="name">${esc(s.name)}</span>${off.has(s.id) ? '<small class="muted">fehlt heute</small>' : ''}<button class="icon-btn xs ${off.has(s.id) ? 'active' : ''}" data-act="student-absent" data-id="${esc(s.id)}" title="${off.has(s.id) ? 'Ist doch da' : 'Fehlt heute'}" aria-pressed="${off.has(s.id)}">${icon(off.has(s.id) ? 'sick' : 'user', 14)}</button></li>`).join('')}</ul>
          <p class="muted small-text">${n ? `<b>${n === 1 ? '1 Kind fehlt' : n + ' Kinder fehlen'} heute</b> – im Quiz ist keine Antwort nötig. ` : ''}„Fehlt heute“ gilt bis zum nächsten Öffnen der App. Jedes Kind hat ein festes Tier (Karte 1 Adler, 2 Biber …) – in allen Klassen gleich. Wer welches Tier ist, steht nur auf deinem Zuordnungsblatt.</p>`; })() : `<p class="muted">Lege eine Klasse an: Name und Anzahl der Kinder genügen.</p><button class="btn primary full" data-act="class-new">${icon('plus')} Neue Klasse</button>`}
          <button class="btn ghost full" data-act="print">${icon('print', 16)} Karten drucken</button>
          <button class="btn ghost full" data-act="print-sheet" style="margin-top:8px">${icon('print', 16)} Zuordnungsblatt drucken</button>
        </div>
        <div class="card">
          <h3>${icon('help', 16)} So geht’s</h3>
          <ol class="help-list steps small-text">
            <li>Einen Kartensatz drucken (am besten auf festem Papier) – er passt für alle Klassen. Jede Karte trägt Nummer und Tier. Mit dem Zuordnungsblatt notieren die Kinder einmal, welches Tier sie haben; das Blatt bleibt bei dir.</li>
            <li>Quiz starten und am Beamer zeigen. Die Kinder halten ihre Karte so, dass ihre Antwort <b>oben</b> steht.</li>
            <li>Mit dem Handy scannen: Mit Konto auf dem Handy einfach „Karten scannen“ – sonst das Quiz direkt auf dem Gerät mit Kamera starten.</li>
            <li>Fehlt ein Kind, vor dem Start bei „Klasse &amp; Karten“ auf das Personensymbol tippen (oder im Quiz auf sein Tier → „Fehlt heute“). Sobald alle anwesenden Kinder erfasst sind, wird automatisch aufgelöst (abschaltbar). „Auflösen“ zeigt die Verteilung. Nach „Beenden“ erscheint ein Podium mit den Besten; die Ergebnisse werden gespeichert.</li>
          </ol>
        </div>
      </aside>
    </div>
  </section>`;
}

function questionList(t) {
  if (!t.questions.length) return '<p class="muted">Noch keine Fragen in diesem Satz.</p>';
  return `<ol class="q-list">${t.questions.map((x, i) => `<li>
    ${x.img ? images.imgTag(x.img, 'q-thumb') : ''}<div class="q-main"><b>${esc(x.text) || (x.img ? '<span class="muted">(Bildfrage)</span>' : '<span class="muted">(Frage ohne Text)</span>')}</b>
      <span class="q-opts">${x.options.map((o, k) => `<span class="l${k} ${x.correct === k ? 'ok' : ''}"><i>${LETTERS[k]}</i>${x.optImgs?.[k] ? ' ' + images.imgTag(x.optImgs[k], 'opt-thumb') : ''}${o ? ' ' + esc(o) : ''}</span>`).join('')}</span></div>
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
  const byStudent = q.answers, pres = present(s), answered = pres.filter(x => byStudent[x.id] !== undefined).length;
  const counts = q.options.map((_, i) => Object.values(byStudent).filter(v => v === i).length);
  const votes = counts.reduce((a, b) => a + b, 0), pct = i => votes ? Math.round(counts[i] / votes * 100) : 0;
  const full = pres.length > 0 && answered === pres.length;
  const fs = `<button class="icon-btn" data-act="present" title="Vollbild" aria-label="Vollbild">${icon(document.body.classList.contains('presenting') ? 'shrink' : 'expand')}</button>`;
  const snd = `<button class="icon-btn" data-act="sound" title="Töne im Quiz" aria-label="Töne im Quiz">${icon(sound.quizSound().on ? 'volume' : 'mute')}</button>`;
  const phone = account.loggedIn() ? (Date.now() - live.phoneAt < 8000 ? `${icon('check', 14)} Handy verbunden` : `${icon('camera', 14)} Handy: auf dem Handy mit demselben Konto anmelden → Quiz → „Karten scannen“`) : `${icon('camera', 14)} Ohne Konto: auf diesem Gerät scannen oder das Quiz auf dem Handy starten`;

  // Startbildschirm, bis „Los geht's“ gedrückt oder die erste Antwort erfasst ist
  if (!begun.has(s.id) && (s.index > 0 || s.reveal || s.questions.some(x => Object.keys(x.answers).length))) begun.add(s.id);
  if (!begun.has(s.id)) {
    sound.quizMusic(false);
    const a = animT('lobby|' + s.id);
    root.innerHTML = `
  <section class="page quiz quiz-run">
    <div class="run-head">
      <div><p class="eyebrow">Kartenquiz · ${esc(s.className)}</p><h1>Gleich geht's los<span class="dot">.</span></h1></div>
      <div class="tools">${snd}${fs}<button class="btn ghost sm" data-act="end">${icon('x', 16)} Beenden</button></div>
    </div>
    <div class="qs qs-lobby" style="--ti:${a.t}">
      <p class="ql-kicker">Kartenquiz</p>
      <h2 class="ql-title">${esc(s.title)}</h2>
      <p class="ql-sub">${s.questions.length === 1 ? '1 Frage' : s.questions.length + ' Fragen'} · ${pres.length === 1 ? '1 Tier' : pres.length + ' Tiere'} am Start</p>
      <div class="ql-animals" aria-hidden="true">${pres.slice().sort((x, y) => x.card - y.card).map((x, k) => `<span style="--d:${(k * 0.06).toFixed(2)}s">${sym(x.card, '1em')}</span>`).join('')}</div>
      <p class="ql-ready">Karten bereithalten!</p>
      <button class="btn primary big ql-go" data-act="begin">${icon('play', 20)} Los geht's</button>
    </div>
    <p class="hint no-present">${phone}${live.error ? ` · <span class="warn-text">${esc(live.error)}</span>` : ''}</p>
  </section>`;
    return;
  }

  // Töne und Animationen hängen an Zustandswechseln, nicht am Neuzeichnen
  const intro = animT('intro|' + q.id);
  if (intro.first) sound.quizFx('question');
  if (seenQ !== q.id) { seenQ = q.id; boardFor = ''; for (const [k, v] of Object.entries(byStudent)) seenAns.add(`${q.id}|${k}|${v}`); if (full) allInFor = q.id; }
  const fresh = id => { const k = `${q.id}|${id}|${byStudent[id]}`; if (seenAns.has(k)) return false; seenAns.add(k); return true; };
  const popped = new Set(pres.filter(x => byStudent[x.id] !== undefined && fresh(x.id)).map(x => x.id));
  if (full && allInFor !== q.id) { allInFor = q.id; sound.quizFx('allin'); } else if (popped.size) sound.quizFx('plop', answered);
  if (!full && allInFor === q.id) allInFor = '';
  let rev = null;
  if (s.reveal) { rev = animT('reveal|' + q.id); if (rev.first) sound.quizFx(q.correct === null ? 'show' : 'reveal'); } else animAt.delete('reveal|' + q.id);
  const board = s.reveal && boardFor === q.id;
  let brd = null;
  if (board) { brd = animT('board|' + q.id); if (brd.first) sound.quizFx('board'); } else animAt.delete('board|' + q.id);
  sound.quizMusic(!s.reveal && !full);
  const ring = pres.length ? answered / pres.length * 100 : 0;
  const right = s.reveal && q.correct !== null && answered ? Math.round(pres.filter(x => byStudent[x.id] === q.correct).length / answered * 100) : null;

  // Zwischenstand: die besten fünf nach den bisher aufgelösten Fragen
  const boardHtml = () => {
    const graded = s.questions.slice(0, s.index + 1).filter(x => x.correct !== null);
    const rows = pres.map(x => ({ x, score: graded.filter(g => g.answers[x.id] === g.correct).length, plus: q.correct !== null && byStudent[x.id] === q.correct }))
      .filter(r => r.score > 0).sort((a, b) => b.score - a.score || a.x.name.localeCompare(b.x.name, 'de'));
    const top = rows.slice(0, 5), more = rows.filter(r => r.score === top[top.length - 1]?.score).length - top.filter(r => r.score === top[top.length - 1]?.score).length;
    let place = 0, last = -1;
    return `<div class="qs-board"><h2>${icon('trophy', 26)} Zwischenstand</h2>${top.length ? `<ol>${top.map((r, k) => { if (r.score !== last) { place = k + 1; last = r.score; }
      return `<li style="--d:${(0.15 + k * 0.14).toFixed(2)}s"><span class="qb-place">${place}</span>${sym(r.x.card, '1.5em')}<span class="qb-name">${esc(r.x.name)}</span>${r.plus ? '<i class="qb-plus">+1</i>' : ''}<b>${r.score}</b></li>`; }).join('')}</ol>
      ${more > 0 ? `<p class="qb-note">… und ${more} weitere mit ${last} ${last === 1 ? 'Punkt' : 'Punkten'}</p>` : ''}` : '<p class="qs-empty">Noch keine Punkte – das kommt noch!</p>'}</div>`;
  };

  root.innerHTML = `
  <section class="page quiz quiz-run">
    <div class="run-head">
      <div><p class="eyebrow">Kartenquiz · ${esc(s.className)} · ${esc(s.title)}</p><h1>Frage ${s.index + 1}<span class="muted"> / ${s.questions.length}</span></h1>
        ${s.questions.length > 1 ? `<div class="run-dots" aria-hidden="true">${s.questions.map((_, k) => `<i class="${k < s.index ? 'past' : k === s.index ? 'now' : ''}"></i>`).join('')}</div>` : ''}</div>
      <div class="tools">
        <button class="btn ghost sm" data-act="scan-here">${icon('camera', 16)} Hier scannen</button>
        <button class="btn ghost sm no-present" data-act="add-q" title="Weitere Frage spontan anhängen">${icon('plus', 16)} Frage</button>
        ${snd}${fs}
        <button class="btn ghost sm" data-act="end">${icon('x', 16)} Beenden</button>
      </div>
    </div>
    <div class="qs ${s.reveal ? 'revealed' : ''} ${board ? 'boarding' : ''}" style="--ti:${intro.t};--tr:${rev ? rev.t : '0ms'};--tb:${brd ? brd.t : '0ms'}">
      <div class="qs-head">
        <div class="qs-q">${q.text || !q.img ? `<p>${esc(q.text) || '<span class="qs-oral">Frage mündlich oder an der Tafel</span>'}</p>` : ''}${q.img && !board ? `<div class="qs-img">${images.imgTag(q.img)}</div>` : ''}</div>
        <div class="qs-count ${full ? 'full' : ''}" title="${answered} von ${pres.length} haben geantwortet">
          <svg viewBox="0 0 40 40" aria-hidden="true"><circle class="r-bg" cx="20" cy="20" r="17"/><circle class="r-fg" cx="20" cy="20" r="17" pathLength="100" stroke-dasharray="${ring.toFixed(1)} 100"/></svg>
          <span><b>${answered}</b><small>von ${pres.length}</small></span>
        </div>
      </div>
      ${board ? boardHtml() : `<div class="qs-opts n${n} ${q.optImgs?.some(Boolean) ? 'with-img' : ''}">${q.options.map((o, i) => `
        <div class="qs-opt l${i} ${s.reveal && q.correct === i ? 'correct' : ''} ${s.reveal && q.correct !== null && q.correct !== i ? 'wrong' : ''}" style="--d:${(0.35 + i * 0.12).toFixed(2)}s">
          ${shape(i)}${q.optImgs?.[i] ? `<span class="qs-opt-img">${images.imgTag(q.optImgs[i])}</span>` : ''}<span class="qs-text">${esc(o)}</span>
          ${s.reveal ? `<span class="qs-stat"><b>${counts[i]}</b><small>${pct(i)} %</small></span><span class="qs-fill" style="--w:${pct(i)}%"></span>` : ''}
          ${s.reveal && q.correct === i ? `<span class="qs-ok" title="Richtige Antwort">${icon('check', 22)}</span>` : ''}
        </div>`).join('')}</div>`}
      <div class="qs-foot">
        <div class="qs-info">${right !== null ? `<span class="qs-right"><b>${right} %</b> richtig</span>` : s.reveal ? '' : full ? '<span class="qs-wait done">Alle haben geantwortet!</span>' : '<span class="qs-wait">Karten hochhalten …</span>'}</div>
        <div class="tools">
          ${q.correct === null ? `<label class="run-correct no-present">Richtig: <select class="select sm" data-act="set-correct"><option value="">–</option>${q.options.map((_, i) => `<option value="${i}">${LETTERS[i]}</option>`).join('')}</select></label>` : ''}
          <button class="btn ghost" data-act="prev" ${s.index ? '' : 'disabled'}>${icon('back', 16)} Zurück</button>
          <button class="btn ${s.reveal ? 'ghost' : 'primary'}" data-act="reveal">${icon('chart', 16)} ${s.reveal ? 'Verbergen' : 'Auflösen'}</button>
          ${s.reveal ? `<button class="btn ghost" data-act="board">${icon('trophy', 16)} ${board ? 'Antworten' : 'Zwischenstand'}</button>` : ''}
          ${s.index < s.questions.length - 1 ? `<button class="btn ${s.reveal ? 'primary' : 'ghost'}" data-act="next">Weiter ${icon('forward', 16)}</button>` : `<button class="btn ${s.reveal ? 'primary' : 'ghost'}" data-act="end">${icon('check', 16)} Fertig</button>`}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-head small"><h3>${icon('users', 16)} ${esc(s.className)}</h3>
        <div class="tools no-present"><label class="check"><input type="checkbox" data-act="auto" ${Q().autoReveal !== false ? 'checked' : ''}> Automatisch auflösen, wenn alle geantwortet haben</label>
        <label class="check"><input type="checkbox" data-act="names" ${showNames ? 'checked' : ''}> Antworten bei den Tieren zeigen</label></div></div>
      <div class="tiles">${s.students.slice().sort((a, b) => a.card - b.card).map(x => {
        if (s.absent?.includes(x.id)) return `<button class="tile absent" data-act="tile" data-id="${esc(x.id)}" title="Fehlt heute – antippen zum Ändern"><span class="t-no">${x.card}</span>${sym(x.card)}<span class="t-name">${esc(x.name)}</span><small>fehlt</small></button>`;
        const a = byStudent[x.id], has = a !== undefined, open = s.reveal && showNames && has;
        const cl = !has ? '' : open && q.correct !== null ? (a === q.correct ? 'right' : 'miss') : 'done';
        return `<button class="tile ${cl} ${popped.has(x.id) ? 'pop' : ''}" data-act="tile" data-id="${esc(x.id)}" title="Antwort von Hand setzen"><span class="t-no">${x.card}</span>${sym(x.card)}<span class="t-name">${esc(x.name)}</span>${open ? `<b class="t-ans">${LETTERS[a]}</b>` : has ? icon('check', 14) : ''}</button>`;
      }).join('')}</div>
      <p class="hint no-present">${phone}${live.error ? ` · <span class="warn-text">${esc(live.error)}</span>` : ''}</p>
    </div>
  </section>`;
}

// Töne im Quiz: an/aus, Denkmusik, Lautstärke (je Gerät) und Probehören
function soundDialog() {
  const p = sound.quizSound(); let demo = 0;
  const d = dialog({ title: 'Töne im Quiz', submit: 'Fertig', cancel: null, body: `
    <label class="check"><input type="checkbox" name="on" ${p.on ? 'checked' : ''}> Töne einschalten</label>
    <label class="check"><input type="checkbox" name="music" ${p.music ? 'checked' : ''}> Denkmusik, bis aufgelöst wird</label>
    <label class="field">Lautstärke<input type="range" name="vol" min="0" max="100" step="5" value="${Math.round(p.vol * 100)}" class="range"></label>
    <p class="field-label">Probehören</p>
    <div class="tools">${Object.entries(sound.QUIZ_FX_NAMES).map(([k, v]) => `<button type="button" class="btn ghost sm" data-fx="${k}">${esc(v)}</button>`).join('')}<button type="button" class="btn ghost sm" data-fx="music">Denkmusik (8 s)</button></div>
    <p class="muted small-text">Gilt für dieses Gerät. Die Töne kommen aus dem Gerät, auf dem das Quiz läuft – am Beamer also aus dessen Lautsprechern.</p>`,
    onOpen: el => {
      const read = () => sound.setQuizSound({ on: el.querySelector('[name=on]').checked, music: el.querySelector('[name=music]').checked, vol: Number(el.querySelector('[name=vol]').value) / 100 });
      el.addEventListener('input', read);
      el.addEventListener('click', e => { const b = e.target.closest('[data-fx]'); if (!b) return; read();
        if (b.dataset.fx === 'music') { clearTimeout(demo); sound.quizMusic(true); demo = setTimeout(() => { sound.quizMusic(false); draw(); }, 8000); } else sound.quizFx(b.dataset.fx, 8); });
    },
    onSubmit: () => {} });
  d.el.addEventListener('close', () => { clearTimeout(demo); sound.quizMusic(false); draw(); });
}

// ======================================================================
// Aktionen
// ======================================================================
function onChange(e) {
  const t = e.target;
  if (t.id === 'quiz-class') store.update(s => { s.quiz.activeClassId = t.value; });
  else if (t.id === 'quiz-set') store.update(s => { s.quiz.activeSetId = t.value; });
  else if (t.dataset.act === 'names') { showNames = t.checked; draw(); }
  else if (t.dataset.act === 'auto') store.update(s => { s.quiz.autoReveal = t.checked; });
  else if (t.dataset.act === 'set-correct' && t.value !== '') updateRun(s => { s.questions[s.index].correct = Number(t.value); });
}

function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
  const act = b.dataset.act, i = Number(b.dataset.i);
  switch (act) {
    case 'classes': return classesDialog();
    case 'class-new': return classDialog();
    case 'class-edit': return classEditDialog(cls());
    case 'student-absent': { const off = absentFor(cls().id), id = b.dataset.id; off.has(id) ? off.delete(id) : off.add(id); return draw(); }
    case 'print': return printDialog();
    case 'print-sheet': return sheetDialog();
    case 'rank-show': rankId = cls()?.id || null; draw(); return scrollTo(0, 0);
    case 'rank-close': rankId = null; if (document.body.classList.contains('presenting')) toggleFullscreen(); return draw();
    case 'rank-csv': return rankCsv(cls());
    case 'rank-reset': return rankReset(cls());
    case 'set-new': return setDialog();
    case 'set-import': return importSetsDialog();
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
    case 'reveal': boardFor = ''; return updateRun(s => { s.reveal = !s.reveal; });
    case 'begin': { const s = running(); if (s) begun.add(s.id); sound.quizFx('go'); return draw(); }
    case 'board': { const s = running(); if (!s) return; const id = s.questions[s.index].id; boardFor = boardFor === id ? '' : id; return draw(); }
    case 'sound': return soundDialog();
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
    s.quiz.sessions.push({ id: uid(), device: DEVICE, classId: c.id, className: c.name, setId: quick ? '' : t.id, title: quick ? 'Schnellstart' : t.title, date: todayISO(), at: Date.now(), index: 0, reveal: false, done: false, absent: c.students.filter(x => absentFor(c.id).has(x.id)).map(x => x.id),
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
    <button type="button" class="btn ghost" data-a="-1">Keine Antwort</button>
    <button type="button" class="btn ghost" data-a="absent">${s.absent?.includes(studentId) ? 'Ist doch da' : 'Fehlt heute (zählt nicht mit)'}</button></div>`,
    onOpen: (el, close) => el.querySelectorAll('[data-a]').forEach(btn => btn.onclick = () => {
      if (btn.dataset.a === 'absent') {
        const off = absentFor(s.classId), now = !s.absent?.includes(studentId);
        now ? off.add(studentId) : off.delete(studentId);
        updateRun(x => { x.absent ||= []; if (!now) x.absent = x.absent.filter(y => y !== studentId); else if (!x.absent.includes(studentId)) x.absent.push(studentId); });
        return close();
      }
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
      return { sessionId: s.id, title: s.className, index: s.index, total: s.questions.length, text: q.text, options: q.options, reveal: s.reveal, roster: present(s).map(x => ({ card: x.card, name: x.name })), answers: byCard };
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
    question: { id: q.id, text: q.text, options: q.options }, cards: present(s).map(x => x.card), answers };
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
    <ul class="manage-list">${q.classes.map(c => `<li><span class="name"><b>${esc(c.name)}</b> <small class="muted">${c.count} Kinder · ${esc(ANIMALS[0])} bis ${esc(ANIMALS[c.count - 1])}</small></span>
      <button type="button" class="icon-btn sm" data-m="edit" data-id="${esc(c.id)}" title="Name oder Kinderzahl ändern" aria-label="Bearbeiten">${icon('edit', 15)}</button>
      <button type="button" class="icon-btn sm" data-m="del" data-id="${esc(c.id)}" title="Löschen" aria-label="Löschen">${icon('trash', 15)}</button></li>`).join('') || '<li class="muted">Noch keine Klasse.</li>'}</ul>
    <button type="button" class="btn primary full" data-m="new">${icon('plus')} Neue Klasse</button>`,
    onOpen: (el, close) => el.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
      const id = b.dataset.id, c = Q().classes.find(x => x.id === id);
      if (b.dataset.m === 'new') { close(); return classDialog(); }
      if (b.dataset.m === 'edit') { close(); return classEditDialog(c); }
      close();
      if (await confirmDialog('Klasse löschen', `Die Quiz-Klasse „${c.name}“ löschen? Gespeicherte Ergebnisse bleiben erhalten, die Rangliste der Klasse entfällt.`)) store.update(s => { s.quiz.classes = s.quiz.classes.filter(x => x.id !== id); if (s.quiz.activeClassId === id) s.quiz.activeClassId = s.quiz.classes[0]?.id ?? null; });
    }) });
}
const countField = (n = 16) => `<label class="field">Anzahl Kinder <small class="muted">(Karte 1 bis ${CARD_COUNT})</small><input name="count" type="number" class="input" min="1" max="${CARD_COUNT}" value="${n}" inputmode="numeric" required></label>`;
const readCount = fd => { const n = Math.round(Number(fd.get('count'))); if (!(n >= 1 && n <= CARD_COUNT)) throw new Error(`Bitte eine Anzahl von 1 bis ${CARD_COUNT} eingeben.`); return n; };
function classDialog() {
  dialog({ title: 'Neue Quiz-Klasse', submit: 'Anlegen', body: `
    <label class="field">Name der Klasse<input name="name" class="input" maxlength="60" placeholder="z. B. Technik 6" required></label>
    ${countField(16)}
    <p class="muted small-text">Die Kinder bekommen die Karten 1 bis zur Anzahl mit festem Tier (1 Adler, 2 Biber, 3 Dachs …). Bei weniger Kindern fallen die letzten Tiere weg. Vornamen werden nicht eingegeben – wer welches Tier ist, notierst du auf dem Zuordnungsblatt.</p>`,
    onSubmit: fd => {
      const name = String(fd.get('name')).trim(), count = readCount(fd);
      if (!name) throw new Error('Bitte einen Namen eingeben.');
      const id = uid(), c = { id, name, demo: false, count, resetAt: 0, students: store.quizStudents(id, count) };
      store.update(s => { s.quiz.classes.push(c); s.quiz.activeClassId = c.id; });
      toast(`Klasse angelegt: Karten 1 bis ${count} (${ANIMALS[0]} bis ${ANIMALS[count - 1]}).`);
    } });
}
function classEditDialog(c) {
  if (!c) return;
  dialog({ title: `Klasse ${c.name}`, submit: 'Speichern', body: `
    <label class="field">Name<input name="name" class="input" value="${esc(c.name)}" maxlength="60" required></label>
    ${countField(c.count)}
    <p class="muted small-text">Wird die Anzahl kleiner, fallen die letzten Tiere weg; frühere Ergebnisse bleiben gespeichert.</p>`,
    onSubmit: fd => {
      const name = String(fd.get('name')).trim(), count = readCount(fd);
      if (!name) throw new Error('Bitte einen Namen eingeben.');
      store.update(s => { const k = s.quiz.classes.find(x => x.id === c.id); if (!k) return; k.name = name; k.count = count; k.students = store.quizStudents(k.id, count, k.students); k.demo = false; });
    } });
}

// ======================================================================
// Rangliste je Klasse: alle beendeten Quiz seit dem letzten „Neu beginnen“, sortiert nach Anteil richtig
// ======================================================================
const sessTime = x => x.at || Date.parse(`${x.date}T00:00:00`) || 0;
const rankSessions = c => Q().sessions.filter(x => x.done && x.classId === c.id && sessTime(x) >= (c.resetAt || 0));
function classRanking(c) {
  const ses = rankSessions(c), rows = new Map();
  for (let n = 1; n <= c.count; n++) rows.set(n, { card: n, name: ANIMALS[n - 1], quizzes: 0, right: 0, asked: 0 });
  for (const x of ses) {
    const graded = x.questions.filter(q => q.correct !== null && Object.keys(q.answers).length);
    if (!graded.length) continue;
    for (const stu of x.students) {
      const r = rows.get(stu.card); if (!r) continue;
      if (x.absent?.includes(stu.id) && !graded.some(q => q.answers[stu.id] !== undefined)) continue;
      r.quizzes++; r.asked += graded.length; r.right += graded.filter(q => q.answers[stu.id] === q.correct).length;
    }
  }
  const list = [...rows.values()].map(r => ({ ...r, pct: r.asked ? r.right / r.asked : null }));
  list.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.right - a.right || a.card - b.card);
  let place = 0, prev = null;
  list.forEach((r, i) => { const key = r.pct === null ? null : `${r.pct}|${r.right}`; if (key === null) r.place = null; else { if (key !== prev) place = i + 1; prev = key; r.place = place; } });
  return { sessions: ses.length, list };
}
const pctText = r => r.pct === null ? '–' : `${Math.round(r.pct * 100)} %`;
function rankTable(c, limit = 0) {
  const { list } = classRanking(c), rows = limit ? list.filter(r => r.place !== null).slice(0, limit) : list;
  return `<table class="table-std rank-table"><thead><tr><th>Platz</th><th>Tier</th><th>Richtig</th><th>Antworten</th><th>Quiz</th></tr></thead><tbody>${rows.map(r => `
    <tr class="${r.place === 1 ? 'gold' : r.place === 2 ? 'silver' : r.place === 3 ? 'bronze' : ''} ${r.place === null ? 'none' : ''}"><td class="place">${r.place ?? '–'}</td><th>${sym(r.card)} <span>${esc(r.name)}</span> <small class="muted">${r.card}</small></th><td class="pct">${pctText(r)}</td><td>${r.asked ? `${r.right} / ${r.asked}` : '–'}</td><td>${r.quizzes}</td></tr>`).join('')}</tbody></table>`;
}
function rankCard(c) {
  const { sessions, list } = classRanking(c), any = list.some(r => r.place !== null);
  return `<div class="card">
    <div class="card-head small"><h3>${icon('trophy', 16)} Rangliste · ${esc(c.name)}</h3>
      <div class="tools">${any ? `<button class="btn ghost sm" data-act="rank-show">${icon('expand', 15)} Zeigen</button><button class="icon-btn sm" data-act="rank-csv" title="Als Tabelle (CSV)" aria-label="Als Tabelle (CSV)">${icon('download', 15)}</button>` : ''}
      <button class="icon-btn sm" data-act="rank-reset" title="Neu beginnen" aria-label="Rangliste neu beginnen">${icon('reset', 15)}</button></div></div>
    ${any ? `<div class="table-scroll">${rankTable(c, 5)}</div><p class="muted small-text">Sortiert nach Anteil richtiger Antworten; bei Gleichstand zählen mehr richtige Antworten. ${sessions} Quiz${c.resetAt ? ` seit ${esc(displayDate(new Date(c.resetAt).toISOString().slice(0, 10)))}` : ''}. „Zeigen“ öffnet die ganze Liste.</p>`
      : `<p class="muted small-text">Noch keine Quiz mit richtiger Antwort${c.resetAt ? ' seit dem Neubeginn' : ''}. Nach jedem beendeten Quiz wächst die Rangliste der Klasse.</p>`}
  </div>`;
}
function drawRanking(c) {
  const { sessions } = classRanking(c);
  root.innerHTML = `
  <section class="page quiz quiz-rank">
    <div class="run-head">
      <div><p class="eyebrow">Kartenquiz · ${esc(c.name)} · ${sessions} Quiz</p><h1>Rangliste<span class="dot">.</span></h1></div>
      <div class="tools">
        <button class="icon-btn" data-act="present" title="Vollbild" aria-label="Vollbild">${icon(document.body.classList.contains('presenting') ? 'shrink' : 'expand')}</button>
        <button class="btn primary sm" data-act="rank-close">${icon('check', 16)} Fertig</button>
      </div>
    </div>
    <div class="card"><div class="table-scroll">${rankTable(c)}</div></div>
  </section>`;
}
function rankCsv(c) {
  if (!c) return;
  const { list } = classRanking(c);
  const lines = [['Platz', 'Karte', 'Tier', 'Anteil richtig', 'Richtig', 'Antworten', 'Quiz'], ...list.map(r => [r.place ?? '', r.card, r.name, r.pct === null ? '' : Math.round(r.pct * 100) + ' %', r.right, r.asked, r.quizzes])];
  downloadFile(`Rangliste-${c.name}-${todayISO()}.csv`.replace(/[\\/:*?"<>|]/g, '_'), '﻿' + lines.map(l => l.join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}
async function rankReset(c) {
  if (!c) return;
  if (!(await confirmDialog('Rangliste neu beginnen', `Die Rangliste von „${c.name}“ ab jetzt neu zählen? Die bisherigen Ergebnisse bleiben unter „Ergebnisse“ gespeichert.`, 'Neu beginnen'))) return;
  store.update(s => { const k = s.quiz.classes.find(x => x.id === c.id); if (k) k.resetAt = Date.now(); });
  toast('Die Rangliste beginnt neu.');
}

// ======================================================================
// Fragensätze und Fragen
// ======================================================================
function setDialog(t) {
  dialog({ title: t ? 'Fragensatz bearbeiten' : 'Neuer Fragensatz', submit: 'Speichern', body: `
    <label class="field">Titel<input name="title" class="input" value="${esc(t?.title || '')}" maxlength="80" placeholder="z. B. Werkzeugkunde – Wiederholung" required></label>
    ${t ? `<div class="tools"><button type="button" class="btn ghost sm" data-m="copy">Kopie anlegen</button><button type="button" class="btn ghost sm" data-m="export">${icon('download', 15)} Exportieren</button><button type="button" class="btn ghost sm danger-text" data-m="del">${icon('trash', 15)} Löschen</button></div>` : ''}`,
    onOpen: (el, close) => {
      el.querySelector('[data-m=copy]')?.addEventListener('click', () => { close(); const copy = { ...structuredClone(t), id: uid(), demo: false, title: t.title + ' (Kopie)' }; copy.questions.forEach(x => { x.id = uid(); }); store.update(s => { s.quiz.sets.push(copy); s.quiz.activeSetId = copy.id; }); });
      el.querySelector('[data-m=export]')?.addEventListener('click', () => downloadFile(`Fragensatz-${t.title}.json`.replace(/[\\/:*?"<>|]/g, '_'), exportSets([t])));
      el.querySelector('[data-m=del]')?.addEventListener('click', async () => { close(); if (await confirmDialog('Fragensatz löschen', `„${t.title}“ mit ${t.questions.length} Frage(n) löschen? Gespeicherte Ergebnisse bleiben erhalten.`)) store.update(s => { s.quiz.sets = s.quiz.sets.filter(x => x.id !== t.id); if (s.quiz.activeSetId === t.id) s.quiz.activeSetId = s.quiz.sets[0]?.id ?? null; }); });
    },
    onSubmit: fd => {
      const title = String(fd.get('title')).trim(); if (!title) throw new Error('Bitte einen Titel eingeben.');
      if (t) store.update(s => { s.quiz.sets.find(x => x.id === t.id).title = title; });
      else { const n = { id: uid(), title, questions: [] }; store.update(s => { s.quiz.sets.push(n); s.quiz.activeSetId = n.id; }); setTimeout(() => questionDialog(qset()), 50); }
    } });
}

// ---------- Fragensätze als Datei: nur Texte (Bilder liegen auf dem Gerät und werden nicht mitgegeben)
const SETS_KIND = 'quiz-sets';
function exportSets(sets) {
  return JSON.stringify({ app: 'KlassenKompass', kind: SETS_KIND, v: 1, sets: sets.map(t => ({ title: t.title,
    questions: t.questions.map(x => ({ text: x.text, options: x.options, correct: x.correct === null ? null : LETTERS[x.correct] })) })) }, null, 2);
}
// Liest eine Datei mit einem oder mehreren Fragensätzen. Erlaubt: { sets: [...] }, eine Liste von Sätzen oder ein einzelner Satz.
// „correct“ darf ein Buchstabe (A–D), eine Zahl ab 0 oder null (Umfrage) sein.
export function parseSets(text) {
  let raw;
  try { raw = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch { throw new Error('Das ist keine gültige Fragensatz-Datei (JSON).'); }
  if (raw?.app === 'KlassenKompass' && raw.kind && raw.kind !== SETS_KIND) throw new Error('Das ist eine Sicherung der ganzen App – bitte über „Daten importieren“ einlesen.');
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.sets) ? raw.sets : raw && Array.isArray(raw.questions) ? [raw] : null;
  if (!list || !list.length) throw new Error('In der Datei wurde kein Fragensatz gefunden.');
  const txt = (v, n) => String(v ?? '').trim().slice(0, n);
  return list.slice(0, 50).map((t, k) => {
    const questions = (Array.isArray(t?.questions) ? t.questions : []).slice(0, 100).map((x, i) => {
      const options = (Array.isArray(x?.options) ? x.options : []).map(o => txt(o, 120)).slice(0, 4);
      if (options.length < 2) throw new Error(`Satz ${k + 1}, Frage ${i + 1}: Es braucht 2 bis 4 Antworten.`);
      let c = x?.correct;
      if (typeof c === 'string') c = c.trim() === '' ? null : LETTERS.indexOf(c.trim().toUpperCase());
      if (c !== null && c !== undefined && !(Number.isInteger(c) && c >= 0 && c < options.length)) throw new Error(`Satz ${k + 1}, Frage ${i + 1}: „correct“ passt nicht zu den Antworten.`);
      return { id: uid(), text: txt(x?.text, 400), options, correct: c ?? null };
    });
    if (!questions.length) throw new Error(`Satz ${k + 1} enthält keine Fragen.`);
    return { id: uid(), title: txt(t?.title, 80) || 'Importierter Fragensatz', questions };
  });
}
function importSetsDialog() {
  dialog({ title: 'Fragensätze importieren', submit: 'Importieren', body: `
    <label class="field">Datei <small class="muted">(.json, z. B. aus „Exportieren“ beim Bearbeiten eines Fragensatzes)</small><input type="file" class="input" accept=".json,.txt,application/json,text/plain" data-m="file"></label>
    <label class="field">… oder Inhalt einfügen<textarea name="json" class="input" rows="7" spellcheck="false" placeholder='{ "sets": [ { "title": "…", "questions": [ { "text": "…", "options": ["…", "…"], "correct": "A" } ] } ] }'></textarea></label>
    <p class="muted small-text">Die Fragensätze kommen zu den vorhandenen dazu; nichts wird überschrieben. Bilder sind in der Datei nicht enthalten.</p>`,
    onOpen: el => { el.querySelector('[data-m=file]').onchange = async e => { const f = e.target.files?.[0]; if (f) el.querySelector('[name=json]').value = await f.text(); }; },
    onSubmit: fd => {
      const text = String(fd.get('json') || '').trim(); if (!text) throw new Error('Bitte eine Datei wählen oder den Inhalt einfügen.');
      const sets = parseSets(text), titles = new Set(Q().sets.map(x => x.title));
      sets.forEach(t => { const base = t.title; let n = 2; while (titles.has(t.title)) t.title = `${base} (${n++})`.slice(0, 80); titles.add(t.title); });
      store.update(s => { s.quiz.sets.push(...sets); s.quiz.activeSetId = sets[0].id; });
      toast(`${sets.length === 1 ? '1 Fragensatz' : sets.length + ' Fragensätze'} mit ${sets.reduce((a, t) => a + t.questions.length, 0)} Fragen importiert.`);
    } });
}
function questionDialog(t, index = -1) {
  if (!t) return;
  const old = index >= 0 ? t.questions[index] : null;
  let type = !old ? 'abcd' : old.options.length === 2 && old.options[0] === 'Richtig' && old.options[1] === 'Falsch' && !old.optImgs ? 'tf' : ({ 4: 'abcd', 3: 'abc', 2: 'ab' })[old.options.length];
  let opts = old ? [...old.options] : ['', '', '', ''], correct = old ? old.correct : null;
  // Bilder: Frage und je Antwort eine Kennung (leer = kein Bild)
  let qImg = old?.img || '';
  const optImgs = Array.from({ length: 4 }, (_, i) => old?.optImgs?.[i] || '');
  const slot = (key, id) => `<div class="img-slot ${id ? 'has' : ''}" data-slot="${key}">${id ? `${images.imgTag(id, 'img-thumb')}<button type="button" class="icon-btn xs" data-img-del="${key}" title="Bild entfernen" aria-label="Bild entfernen">${icon('x', 14)}</button>`
    : `<label class="btn ghost sm img-pick" title="Bild wählen, fotografieren oder mit Strg+V einfügen">${icon('camera', 15)} Bild<input type="file" accept="image/*" data-img-file="${key}" hidden></label>`}</div>`;
  const optHtml = () => {
    const n = TYPES[type].n;
    return Array.from({ length: n }, (_, i) => `<div class="opt-row"><label class="opt-correct" title="Richtige Antwort"><input type="radio" name="correct" value="${i}" ${correct === i ? 'checked' : ''}><span>${LETTERS[i]}</span></label>
      <input name="o${i}" class="input" maxlength="120" value="${esc(type === 'tf' ? ['Richtig', 'Falsch'][i] : opts[i] || '')}" ${type === 'tf' ? 'readonly' : ''} placeholder="Antwort ${LETTERS[i]} (optional)">${type === 'tf' ? '' : slot('o' + i, optImgs[i])}</div>`).join('') +
      `<label class="check"><input type="radio" name="correct" value="" ${correct === null ? 'checked' : ''}> Keine richtige Antwort (Umfrage, Meinung)</label>`;
  };
  dialog({ title: old ? `Frage ${index + 1} bearbeiten` : 'Neue Frage', submit: old ? 'Speichern' : 'Hinzufügen', wide: true, body: `
    <label class="field">Frage<textarea name="text" class="input" rows="3" maxlength="400" placeholder="Was möchtest du fragen?">${esc(old?.text || '')}</textarea></label>
    <div class="q-img-row"><span class="muted small-text">Bild zur Frage (optional) – auch mit Strg+V einfügen</span><div data-qslot>${slot('q', qImg)}</div></div>
    <label class="field">Antwortart<select name="type" class="select">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
    <p class="eyebrow">Antworten · Kreis = richtige Antwort · Bild statt oder zusätzlich zum Text möglich</p>
    <div data-opts>${optHtml()}</div>
    ${old ? '' : '<label class="check"><input type="checkbox" name="more" checked> Danach gleich die nächste Frage anlegen</label>'}`,
    onOpen: el => {
      const sel = el.querySelector('[name=type]'), wrap = el.querySelector('[data-opts]'), qwrap = el.querySelector('[data-qslot]');
      const keep = () => {
        wrap.querySelectorAll('input[name^=o]').forEach((inp, i) => { if (type !== 'tf') opts[i] = inp.value; });
        const r = wrap.querySelector('[name=correct]:checked'); correct = r && r.value !== '' ? Number(r.value) : null;
      };
      const redraw = () => { keep(); wrap.innerHTML = optHtml(); qwrap.innerHTML = slot('q', qImg); images.hydrate(el); };
      const setImg = (key, id) => { if (key === 'q') qImg = id; else optImgs[Number(key.slice(1))] = id; redraw(); };
      const addFile = async (key, file) => {
        const err = el.querySelector('.form-error');
        try { err.hidden = true; setImg(key, await images.add(file)); }
        catch (e) { err.textContent = e.message; err.hidden = false; }
      };
      sel.onchange = () => { keep(); type = sel.value; if (correct !== null && correct >= TYPES[type].n) correct = null; redraw(); };
      el.addEventListener('change', e => { const k = e.target.dataset?.imgFile; if (k && e.target.files?.[0]) addFile(k, e.target.files[0]); });
      el.addEventListener('click', e => { const k = e.target.closest('[data-img-del]')?.dataset.imgDel; if (k) { e.preventDefault(); setImg(k, ''); } });
      // Einfügen aus der Zwischenablage: in die Antwortzeile mit dem Cursor, sonst zur Frage
      el.addEventListener('paste', e => {
        const file = [...(e.clipboardData?.items || [])].find(x => x.kind === 'file' && x.type.startsWith('image/'))?.getAsFile();
        if (!file) return;
        e.preventDefault();
        const row = document.activeElement?.closest?.('.opt-row'), inp = row?.querySelector('input[name^=o]');
        addFile(inp && type !== 'tf' ? inp.name : 'q', file);
      });
      images.hydrate(el);
    },
    onSubmit: fd => {
      const n = TYPES[fd.get('type')].n, tf = fd.get('type') === 'tf';
      const options = Array.from({ length: n }, (_, i) => String(fd.get('o' + i) || '').trim());
      const oi = tf ? [] : optImgs.slice(0, n);
      const c = fd.get('correct'), q = { id: old?.id || uid(), text: String(fd.get('text') || '').trim(), options, correct: c === null || c === '' ? null : Number(c) };
      if (qImg) q.img = qImg;
      if (oi.some(Boolean)) q.optImgs = oi;
      if (!q.text && !q.img && options.every(o => !o) && !oi.some(Boolean)) throw new Error('Bitte eine Frage, ein Bild oder Antworten eintragen.');
      store.update(s => { const set = s.quiz.sets.find(x => x.id === t.id); if (old) set.questions[index] = q; else set.questions.push(q); });
      if (!old && fd.get('more') === 'on') setTimeout(() => questionDialog(qset()), 50);
    } });
}

// ======================================================================
// Kartendruck
// ======================================================================
// Ein Kartensatz passt für alle Klassen: Karte n trägt immer dasselbe Tier.
function printDialog() {
  const c = cls(), n = c?.count || 16;
  dialog({ title: 'Antwortkarten drucken', submit: 'Drucken', body: `
    <div class="print-preview">${cardSvg(1, { size: '120', name: ANIMALS[0], animal: true })}<p class="small-text muted">Jede Karte hat ein eigenes Muster und trägt Nummer, Tiersymbol und Tiername. Karte 1 ist in jeder Klasse der Adler, Karte 2 der Biber … – ein Kartensatz reicht für alle Klassen. Die Kinder halten die Karte so, dass der Buchstabe ihrer Antwort oben steht.</p></div>
    <label class="field">Karten pro Seite (A4)<select name="per" class="select"><option value="2" selected>2 – groß, für Räume bis etwa 8 m</option><option value="1">1 – sehr groß, für Halle oder großen Raum</option><option value="4">4 – klein, für kleine Räume</option></select></label>
    <label class="field">Welche Karten<select name="which" class="select"><option value="16" ${n <= 16 ? 'selected' : ''}>Karten 1–16 (${ANIMALS[0]} bis ${ANIMALS[15]})</option><option value="32" ${n > 16 && n <= 32 ? 'selected' : ''}>Karten 1–32 (bis ${ANIMALS[31]})</option><option value="all" ${n > 32 ? 'selected' : ''}>Alle ${CARD_COUNT} Karten</option><option value="range">Bereich …</option></select></label>
    <div class="two" data-range hidden><label class="field">Von<input name="from" type="number" class="input" min="1" max="${CARD_COUNT}" value="1"></label><label class="field">Bis<input name="to" type="number" class="input" min="1" max="${CARD_COUNT}" value="${n}"></label></div>
    <p class="muted small-text">Geht eine Karte verloren, nur diese neu drucken (Bereich wählen). Tipp: auf festes Papier drucken oder laminieren (matte Folie spiegelt weniger). Im Druckdialog „Tatsächliche Größe“ wählen.</p>`,
    onOpen: el => { const w = el.querySelector('[name=which]'), r = el.querySelector('[data-range]'); const sync = () => { r.hidden = w.value !== 'range'; r.style.display = r.hidden ? 'none' : ''; }; w.onchange = sync; sync(); },
    onSubmit: fd => {
      const which = fd.get('which'); let a = 1, b = CARD_COUNT;
      if (which === '16') b = 16; else if (which === '32') b = 32;
      else if (which === 'range') { a = Math.max(1, Math.min(CARD_COUNT, Number(fd.get('from')) || 1)); b = Math.max(a, Math.min(CARD_COUNT, Number(fd.get('to')) || CARD_COUNT)); }
      printCards(Array.from({ length: b - a + 1 }, (_, i) => ({ n: a + i, name: ANIMALS[a + i - 1] })), Number(fd.get('per')));
    } });
}
// Zuordnungsblatt: Nummer, Symbol und Tier sind vorgedruckt, die Kinder tragen nur ihren Namen ein. Bleibt bei der Lehrkraft.
function sheetDialog() {
  const c = cls(), n = c?.count || 16;
  dialog({ title: 'Zuordnungsblatt drucken', submit: 'Drucken', body: `
    <p class="small-text">Auf dem Blatt stehen Nummer, Tiersymbol und Tiername schon. Die Kinder tragen nur Vor- und Nachnamen neben ihrem Tier ein. Das Blatt bleibt bei dir und wird <b>nicht</b> in die App übertragen.</p>
    <label class="field">Klasse (oben auf dem Blatt)<input name="cls" class="input" maxlength="60" value="${esc(c?.name || '')}"></label>
    <label class="field">Tiere<select name="which" class="select"><option value="1" ${n <= 16 ? 'selected' : ''}>1–16 (${ANIMALS[0]} bis ${ANIMALS[15]})</option><option value="2">17–32 (${ANIMALS[16]} bis ${ANIMALS[31]})</option><option value="3" ${n > 16 ? 'selected' : ''}>beide Blätter (1–32)</option></select></label>`,
    onSubmit: fd => {
      const w = fd.get('which'), pages = w === '1' ? [1] : w === '2' ? [17] : [1, 17];
      printSheet(String(fd.get('cls') || '').trim(), pages);
    } });
}
function printSheet(className, starts) {
  document.getElementById('print-cards')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'print-cards'; wrap.className = 'ps';
  wrap.innerHTML = starts.map(a => `<section class="ps-page">
    <div class="ps-head"><span>Klasse: <b>${esc(className)}</b></span><span>Datum:</span></div>
    <h1>Kartenquiz: Welches Tier bist du?</h1>
    <p>Suche dein Tier (es steht auch auf deiner Antwortkarte) und schreibe deinen Namen daneben.</p>
    <table><thead><tr><th>Nr.</th><th colspan="2">Tier</th><th>Vorname</th><th>Nachname</th></tr></thead><tbody>${Array.from({ length: 16 }, (_, i) => a + i).map(k => `<tr><td class="no">${k}</td><td class="sym">${animalSvg(k, { size: '9mm', title: false })}</td><td class="an">${esc(ANIMALS[k - 1])}</td><td></td><td></td></tr>`).join('')}</tbody></table>
    <p class="ps-foot">Bleibt bei der Lehrkraft – nicht in die App übertragen.</p></section>`).join('');
  document.body.append(wrap); document.body.classList.add('printing-cards');
  const done = () => { wrap.remove(); document.body.classList.remove('printing-cards'); removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  setTimeout(() => print(), 60);
}
function printCards(cards, per) {
  document.getElementById('print-cards')?.remove();
  const wrap = document.createElement('div');
  wrap.id = 'print-cards'; wrap.className = 'pc-' + per;
  const pages = [];
  for (let i = 0; i < cards.length; i += per) pages.push(cards.slice(i, i + per));
  wrap.innerHTML = pages.map(p => `<section class="pc-page">${p.map(x => `<div class="pc-cell">${cardSvg(x.n, { name: x.name || '', animal: true })}</div>`).join('')}</section>`).join('');
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
  const rows = s.students.slice().sort((a, b) => a.card - b.card).map(stu => {
    const right = graded.filter(q => q.answers[stu.id] === q.correct).length;
    if (s.absent?.includes(stu.id) && !s.questions.some(q => q.answers[stu.id] !== undefined)) return `<tr class="absent"><th>${sym(stu.card)} ${esc(stu.name)} <small class="muted">${stu.card}</small></th><td class="none" colspan="${s.questions.length + 1}">fehlte</td></tr>`;
    return `<tr><th>${sym(stu.card)} ${esc(stu.name)} <small class="muted">${stu.card}</small></th>${s.questions.map(q => { const a = q.answers[stu.id]; return `<td class="${a === undefined ? 'none' : q.correct === null ? '' : a === q.correct ? 'right' : 'miss'}">${a === undefined ? '–' : LETTERS[a]}</td>`; }).join('')}<td class="sum">${graded.length ? `${right}/${graded.length}` : '–'}</td></tr>`;
  }).join('');
  const qpct = q => { const v = Object.values(q.answers); return q.correct === null || !v.length ? '–' : Math.round(v.filter(x => x === q.correct).length / v.length * 100) + ' %'; };
  dialog({ title: `${s.title} · ${s.className}`, submit: null, cancel: 'Schließen', wide: true, body: `
    <p class="muted">${esc(displayDate(s.date))} · ${s.questions.length} Frage(n) · ${st.answered} Antworten${st.pct !== null ? ` · <b>${st.pct} % richtig</b>` : ''}</p>
    <ol class="result-qs">${s.questions.map((q, i) => `<li>${q.img ? images.imgTag(q.img, 'opt-thumb') + ' ' : ''}<b>${esc(q.text) || `Frage ${i + 1}`}</b> <span class="muted">${q.correct !== null ? `richtig: ${LETTERS[q.correct]} · ${qpct(q)}` : 'ohne richtige Antwort'}</span>
      <span class="q-dist">${q.options.map((o, k) => `<span class="${q.correct === k ? 'ok' : ''}">${LETTERS[k]}: ${Object.values(q.answers).filter(v => v === k).length}</span>`).join('')}</span></li>`).join('')}</ol>
    <div class="table-scroll"><table class="table-std result-table"><thead><tr><th>Tier</th>${s.questions.map((_, i) => `<th>F${i + 1}</th>`).join('')}<th>Richtig</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="tools">${ranking(s).places.length ? `<button type="button" class="btn ghost sm" data-m="podium">${icon('trophy', 15)} Podium zeigen</button>` : ''}<button type="button" class="btn ghost sm" data-m="csv">${icon('download', 15)} Als Tabelle (CSV)</button><button type="button" class="btn ghost sm danger-text" data-m="del">${icon('trash', 15)} Ergebnis löschen</button></div>`,
    onOpen: (el, close) => {
      images.hydrate(el);
      el.querySelector('[data-m=podium]')?.addEventListener('click', () => { close(); podiumId = id; draw(); scrollTo(0, 0); });
      el.querySelector('[data-m=csv]').onclick = () => downloadFile(`Kartenquiz-${s.date}-${s.className}.csv`.replace(/[\\/:*?"<>|]/g, '_'), csv(s), 'text/csv;charset=utf-8');
      el.querySelector('[data-m=del]').onclick = async () => { close(); if (await confirmDialog('Ergebnis löschen', `Ergebnis „${s.title}“ vom ${displayDate(s.date)} löschen?`)) store.update(x => { x.quiz.sessions = x.quiz.sessions.filter(y => y.id !== id); }); };
    } });
}
function csv(s) {
  const cell = v => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const graded = s.questions.filter(q => q.correct !== null && Object.keys(q.answers).length);
  const lines = [['Tier', 'Karte', ...s.questions.map((q, i) => `F${i + 1}${q.text ? ': ' + q.text : ''}`), 'Richtig', 'Bewertete Fragen']];
  lines.push(['Richtige Antwort', '', ...s.questions.map(q => q.correct === null ? '' : LETTERS[q.correct]), '', '']);
  for (const stu of s.students.slice().sort((a, b) => a.card - b.card)) if (s.absent?.includes(stu.id) && !s.questions.some(q => q.answers[stu.id] !== undefined)) lines.push([stu.name, stu.card, 'fehlte', ...s.questions.slice(1).map(() => ''), '', '']);
  else lines.push([stu.name, stu.card, ...s.questions.map(q => q.answers[stu.id] === undefined ? '' : LETTERS[q.answers[stu.id]]), graded.filter(q => q.answers[stu.id] === q.correct).length, graded.length]);
  return '﻿' + lines.map(l => l.map(cell).join(';')).join('\r\n');
}

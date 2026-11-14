// Bereich Hallenpläne (seit 2.0.0): links die Sammlung (seit 2.3.0 umschaltbar nach Stunden oder nach Themen, mit Suche), rechts der Editor (hall.js).
import * as store from './store.js';
import * as hall from './hall.js';
import { esc, icon, toggleFullscreen, dialog, confirmDialog, toast } from './ui.js';
import { enableDrag } from './drag.js';

let root = null, search = '';
const pref = (k, d) => { try { return localStorage.getItem('klassenkompass.' + k) ?? d; } catch { return d; } };
let libHidden = pref('hallLib', '1') === '0';
let mode = pref('hallLibMode', 'lesson') === 'topic' ? 'topic' : 'lesson';   // Sammlung nach Stunden (Standard) oder nach Themen; gilt je Gerät
const closed = new Set(); // zugeklappte Gruppen ('t:' + Thema bzw. 'l:' + Stunde)
const NO_LESSON = '\u0000';   // Kennung der Gruppe „Ohne Stunde“

export function mount(el) {
  root = el;
  const off = store.subscribe(draw);
  el.onclick = onClick;
  el.oninput = e => { if (e.target.id === 'hall-search') { search = e.target.value; drawLib(); } };
  // Plan aus der Sammlung auf ein Thema bzw. eine Stunde ziehen = dort einordnen (seit 2.1.0 bzw. 2.3.0)
  const offDrag = enableDrag(el, { item: '.hall-lib [data-open]', target: '.hall-lib [data-drop-topic], .hall-lib [data-drop-lesson]',
    canDrop: (a, t) => { const p = hall.planById(a.dataset.open); if (!p) return false;
      return 'dropLesson' in t.dataset ? (p.lesson || NO_LESSON) !== t.dataset.dropLesson : (p.topic || '') !== t.dataset.dropTopic; },
    onDrop: (a, t) => ('dropLesson' in t.dataset ? setLesson(a.dataset.open, t.dataset.dropLesson === NO_LESSON ? '' : t.dataset.dropLesson) : setTopic(a.dataset.open, t.dataset.dropTopic)) });
  draw();
  return () => { off(); offDrag(); el.onclick = el.oninput = null; root = null; };
}

function draw() {
  if (!root) return;
  const presenting = document.body.classList.contains('presenting'), n = store.get().sport.halls.length;
  root.innerHTML = `
  <section class="page hallen">
    <div class="page-head">
      <div>
        <p class="eyebrow">Hallenpläne · Sport</p>
        <h1>Hallenpläne<span class="dot">.</span></h1>
        <p class="sub">Zeichnen, nach Stunden ordnen, groß zeigen.</p>
      </div>
      <div class="tools no-print">
        <button class="btn ghost sm" data-p="lib">${icon('list', 16)} ${libHidden ? 'Sammlung zeigen' : 'Sammlung ausblenden'}</button>
        <button class="btn ghost sm" data-p="print" title="Schüleransicht: A4 quer mit Titel und Zeichnung, Spielregeln (falls angelegt) auf Seite 2">${icon('print', 16)} Schüleransicht drucken</button>
        <button class="btn ghost sm" data-p="present">${icon(presenting ? 'shrink' : 'expand', 16)} ${presenting ? 'Ansicht verkleinern' : 'Ansicht vergrößern'}</button>
      </div>
    </div>
    <div class="hall-page ${libHidden ? 'no-lib' : ''}">
      ${libHidden ? '' : `<aside class="hall-lib card no-print no-present">
        <div class="hall-lib-head"><b>Sammlung</b> <span class="badge">${n}</span>
          <button class="icon-btn sm" data-h="new" title="Neuer Hallenplan" aria-label="Neuer Hallenplan">${icon('plus', 16)}</button>
          <button class="icon-btn sm" data-h="import-plan" title="Hallenpläne importieren (Datei oder Text)" aria-label="Hallenpläne importieren">${icon('upload', 16)}</button>
          <button class="icon-btn sm" data-h="topics" title="Themen anlegen, umbenennen, ordnen" aria-label="Themen verwalten">${icon('sliders', 16)}</button></div>
        <div class="seg hall-mode" role="group" aria-label="Sammlung ordnen nach"><button type="button" data-mode="lesson" class="${mode === 'lesson' ? 'on' : ''}" aria-pressed="${mode === 'lesson'}">${icon('clock', 14)} Stunden</button><button type="button" data-mode="topic" class="${mode === 'topic' ? 'on' : ''}" aria-pressed="${mode === 'topic'}">${icon('list', 14)} Themen</button></div>
        <input id="hall-search" class="input" type="search" placeholder="Name, Thema, Stunde …" value="${esc(search)}" autocomplete="off">
        <div class="hall-lib-list" data-liblist></div>
      </aside>`}
      <div class="print-area hall-host" id="hall-host"></div>
    </div>
  </section>`;
  drawLib();
  hall.attach(root.querySelector('#hall-host'));
}

// Sammlung nach Stunden (seit 2.3.0, Standard): je Stunde ein aufklappbarer Ordner mit den Phasen in Reihenfolge
// (Thema klein dahinter), neueste Stunde oben; Pläne ohne Stunde zuletzt unter „Ohne Stunde“.
function drawLessons(box, s, list, q) {
  const groups = new Map(), none = [];
  list.forEach(p => { if (!p.lesson) return none.push(p); if (!groups.has(p.lesson)) groups.set(p.lesson, []); groups.get(p.lesson).push(p); });
  const lessons = [...groups.keys()].sort((a, b) => b.localeCompare(a, 'de', { numeric: true }));
  if (!lessons.length && !none.length) { box.innerHTML = `<p class="muted small-text">${s.halls.length ? 'Keine Treffer.' : 'Noch kein Hallenplan.'}</p>`; return; }
  const item = (p, ph) => `<button class="hall-lib-item ${p.id === s.activeHall ? 'on' : ''}" data-open="${esc(p.id)}" title="${esc(p.title)}${p.topic ? ' · ' + esc(p.topic) : ''} – zum Einordnen auf eine Stunde ziehen">${ph ? `<span class="ph">${ph}</span>` : ''}<span class="t">${esc(p.title)}</span>${p.topic ? `<span class="tp">${esc(p.topic)}</span>` : ''}</button>`;
  const group = (key, label, plans, body, add) => `<details class="hall-topic" data-group="l:${esc(key)}" ${q || !closed.has('l:' + key) ? 'open' : ''}><summary data-drop-lesson="${esc(key)}">${label} <span class="muted">${plans.length}</span></summary>${body}${add}</details>`;
  box.innerHTML = lessons.map(l => { const ps = groups.get(l).sort((a, b) => a.phase - b.phase);
      return group(l, `${icon('clock', 13)} ${esc(l)}`, ps, ps.map(p => item(p, p.phase)).join(''), `<button class="link small-text" data-new-lesson="${esc(l)}">${icon('plus', 13)} Phase</button>`); }).join('')
    + (none.length ? group(NO_LESSON, 'Ohne Stunde', none, none.map(p => item(p)).join(''), '') : '')
    + (q ? '' : '<p class="muted small-text">Plan auf eine Stunde ziehen = dort als letzte Phase einordnen (am Tablett kurz gedrückt halten).</p>');
}

// Sammlung: Themen in der Reihenfolge der Themenliste (aufklappbar, auch ohne Plan), darin Stunden mit Phasen und einzelne Pläne
function drawLib() {
  const box = root?.querySelector('[data-liblist]'); if (!box) return;
  const s = store.get().sport, q = search.trim().toLocaleLowerCase('de');
  const hit = p => !q || [p.title, p.topic, p.lesson].join(' ').toLocaleLowerCase('de').includes(q);
  const list = hall.sortPlans(s.halls).filter(hit);
  if (mode === 'lesson') return drawLessons(box, s, list, q);
  const byTopic = new Map(q ? [] : hall.topics().map(t => [t, []]));
  list.forEach(p => { const t = p.topic || ''; if (!byTopic.has(t)) byTopic.set(t, []); byTopic.get(t).push(p); });
  if (byTopic.has('')) { const none = byTopic.get(''); byTopic.delete(''); byTopic.set('', none); }   // „Ohne Thema“ zuletzt
  if (!byTopic.size) { box.innerHTML = `<p class="muted small-text">${s.halls.length ? 'Keine Treffer.' : 'Noch kein Hallenplan.'}</p>`; return; }
  const item = (p, sub = '') => `<button class="hall-lib-item ${p.id === s.activeHall ? 'on' : ''}" data-open="${esc(p.id)}" title="${esc(p.title)} – zum Zuordnen auf ein Thema ziehen">${sub ? `<span class="ph">${sub}</span>` : ''}<span class="t">${esc(p.title)}</span></button>`;
  box.innerHTML = [...byTopic.entries()].map(([t, plans]) => {
    const open = q || (plans.length && !closed.has('t:' + t)), lessons = new Map(), single = [];
    plans.forEach(p => { if (p.lesson) { if (!lessons.has(p.lesson)) lessons.set(p.lesson, []); lessons.get(p.lesson).push(p); } else single.push(p); });
    return `<details class="hall-topic ${plans.length ? '' : 'empty-topic'}" data-group="t:${esc(t)}" ${open ? 'open' : ''}><summary data-drop-topic="${esc(t)}">${esc(t || 'Ohne Thema')} <span class="muted">${plans.length}</span></summary>
      ${[...lessons.entries()].map(([l, ps]) => `<div class="hall-lesson"><p class="small-text muted">${icon('clock', 13)} ${esc(l)}</p>${ps.map(p => item(p, p.phase)).join('')}</div>`).join('')}
      ${single.map(p => item(p)).join('')}
      <button class="link small-text" data-new-topic="${esc(t)}">${icon('plus', 13)} Plan${t ? ' in „' + esc(t) + '“' : ''}</button></details>`;
  }).join('') + (q ? '' : '<p class="muted small-text">Pläne lassen sich auf ein Thema ziehen (am Tablett kurz gedrückt halten).</p>');
}

// Plan einem Thema zuordnen ('' = ohne Thema)
function setTopic(id, topic) {
  const p = hall.planById(id); if (!p) return;
  store.update(s => { const x = s.sport.halls.find(h => h.id === id); if (x) { x.topic = topic; x.demo = false; } });
  closed.delete('t:' + topic);
  toast(`„${p.title}“ ${topic ? `steht jetzt unter „${topic}“` : 'hat jetzt kein Thema'}.`);
}

// Plan einer Stunde zuordnen (als letzte Phase) bzw. aus der Stunde nehmen ('')
function setLesson(id, lesson) {
  const p = hall.planById(id); if (!p) return;
  const phase = lesson ? hall.nextPhase(lesson) : 0;
  store.update(s => { const x = s.sport.halls.find(h => h.id === id); if (x) { x.lesson = lesson; x.phase = phase; x.demo = false; } });
  closed.delete('l:' + (lesson || NO_LESSON));
  toast(lesson ? `„${p.title}“ ist jetzt Phase ${phase} von „${lesson}“.` : `„${p.title}“ gehört zu keiner Stunde mehr.`);
}

// Themen anlegen, umbenennen, ordnen, löschen; Änderungen gelten sofort
function topicsDialog() {
  const s = store.get().sport, list = hall.topics(), count = t => s.halls.filter(h => h.topic === t).length;
  dialog({ title: 'Themen verwalten', submit: null, cancel: 'Fertig', wide: true,
    body: `<label class="field">Neues Thema<span class="topic-add"><input class="input" data-topic-add maxlength="60" placeholder="z. B. Badminton"><button type="button" class="btn primary" data-add-btn>${icon('plus', 16)} Anlegen</button></span></label>
      <ul class="manage-list topic-manage">${list.map((t, i) => `<li><input class="input" data-rename="${i}" value="${esc(t)}" maxlength="60" aria-label="Name des Themas">
        <span class="muted small-text">${count(t)} ${count(t) === 1 ? 'Plan' : 'Pläne'}</span>
        <button type="button" class="icon-btn" data-up="${i}" title="Nach oben" ${i ? '' : 'disabled'}>${icon('up', 16)}</button>
        <button type="button" class="icon-btn" data-down="${i}" title="Nach unten" ${i < list.length - 1 ? '' : 'disabled'}>${icon('down', 16)}</button>
        <button type="button" class="icon-btn" data-del="${i}" title="Thema löschen">${icon('trash', 16)}</button></li>`).join('') || '<li class="muted">Noch kein Thema.</li>'}</ul>
      <p class="muted small-text">Die Reihenfolge gilt in der Sammlung. Ein gelöschtes Thema nimmt keine Pläne mit – sie stehen dann unter „Ohne Thema“. Gleicher Name beim Umbenennen = Themen zusammenlegen.</p>`,
    onOpen: (el, close) => {
      const again = () => { close(); topicsDialog(); };
      const add = () => {
        const v = hall.topicName(el.querySelector("[data-topic-add]").value); if (!v) return;
        if (hall.topics().includes(v)) return toast(`„${v}“ gibt es schon.`, { kind: 'warn' });
        store.update(x => hall.addTopic(x, v)); again();
      };
      el.querySelector('[data-add-btn]').onclick = add;
      el.querySelector("[data-topic-add]").onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
      const move = (i, d) => { store.update(x => { const a = x.sport.hallTopics; [a[i], a[i + d]] = [a[i + d], a[i]]; }); again(); };
      el.querySelectorAll('[data-up]').forEach(b => b.onclick = () => move(+b.dataset.up, -1));
      el.querySelectorAll('[data-down]').forEach(b => b.onclick = () => move(+b.dataset.down, 1));
      el.querySelectorAll('[data-rename]').forEach(inp => inp.onchange = () => {
        const old = list[+inp.dataset.rename], v = inp.value.trim().slice(0, 60); if (!v || v === old) return;
        const other = hall.topics().find(x => x !== old && x.toLocaleLowerCase('de') === v.toLocaleLowerCase('de'));
        store.update(x => {
          x.sport.halls.forEach(h => { if (h.topic === old) h.topic = other || v; });
          x.sport.hallTopics = other ? x.sport.hallTopics.filter(t => t !== old) : x.sport.hallTopics.map(t => (t === old ? v : t));
        });
        if (other) toast(`„${old}“ mit „${other}“ zusammengelegt.`);
        again();
      });
      el.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
        const t = list[+b.dataset.del], n = count(t); close();
        if (n && !(await confirmDialog('Thema löschen', `„${t}“ löschen? Die ${n === 1 ? 'Plan bleibt' : n + ' Pläne bleiben'} erhalten und ${n === 1 ? 'steht' : 'stehen'} dann unter „Ohne Thema“.`, 'Löschen'))) return topicsDialog();
        store.update(x => { x.sport.hallTopics = x.sport.hallTopics.filter(y => y !== t); x.sport.halls.forEach(h => { if (h.topic === t) h.topic = ''; }); });
        topicsDialog();
      });
    } });
}

function onClick(e) {
  const o = e.target.closest('[data-open]');
  if (o) { hall.openPlan(o.dataset.open); return; }
  const nt = e.target.closest('[data-new-topic]');
  if (nt) { hall.newPlanDialog(nt.dataset.newTopic); return; }
  const nl = e.target.closest('[data-new-lesson]');
  if (nl) { hall.newPlanDialog('', nl.dataset.newLesson); return; }
  const m = e.target.closest('[data-mode]');
  if (m) { mode = m.dataset.mode === 'topic' ? 'topic' : 'lesson'; try { localStorage.setItem('klassenkompass.hallLibMode', mode); } catch {} draw(); return; }
  const lib = e.target.closest('[data-h]');
  if (lib && lib.closest('.hall-lib')) { e.stopPropagation(); if (lib.dataset.h === 'new') hall.newPlanDialog(); else if (lib.dataset.h === 'import-plan') hall.importPlansDialog(); else if (lib.dataset.h === 'topics') topicsDialog(); return; }
  const b = e.target.closest('[data-p]'); if (!b) return;
  if (b.dataset.p === 'lib') { libHidden = !libHidden; try { localStorage.setItem('klassenkompass.hallLib', libHidden ? '0' : '1'); } catch {} draw(); }
  else if (b.dataset.p === 'print') window.print();
  else if (b.dataset.p === 'present') { toggleFullscreen(); draw(); }
}
// Zugeklappte Gruppen merken
document.addEventListener('toggle', e => { const d = e.target; if (!d?.classList?.contains('hall-topic')) return; const g = d.dataset.group; if (search || !g) return; d.open ? closed.delete(g) : closed.add(g); }, true);

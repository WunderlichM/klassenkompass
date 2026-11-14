// Bereich Hallenpläne (seit 2.0.0): links die Sammlung (nach Themen, Stunden mit Phasen, Suche), rechts der Editor (hall.js).
import * as store from './store.js';
import * as hall from './hall.js';
import { esc, icon, toggleFullscreen } from './ui.js';

let root = null, search = '';
const pref = (k, d) => { try { return localStorage.getItem('klassenkompass.' + k) ?? d; } catch { return d; } };
let libHidden = pref('hallLib', '1') === '0';
const closed = new Set(); // zugeklappte Themen

export function mount(el) {
  root = el;
  const off = store.subscribe(draw);
  el.onclick = onClick;
  el.oninput = e => { if (e.target.id === 'hall-search') { search = e.target.value; drawLib(); } };
  draw();
  return () => { off(); el.onclick = el.oninput = null; root = null; };
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
        <p class="sub">Zeichnen, nach Themen ordnen, groß zeigen.</p>
      </div>
      <div class="tools no-print">
        <button class="btn ghost sm" data-p="lib">${icon('list', 16)} ${libHidden ? 'Sammlung zeigen' : 'Sammlung ausblenden'}</button>
        <button class="btn ghost sm" data-p="print" title="Schüleransicht: A4 quer mit Titel und Zeichnung">${icon('print', 16)} Schüleransicht drucken</button>
        <button class="btn ghost sm" data-p="present">${icon(presenting ? 'shrink' : 'expand', 16)} ${presenting ? 'Ansicht verkleinern' : 'Ansicht vergrößern'}</button>
      </div>
    </div>
    <div class="hall-page ${libHidden ? 'no-lib' : ''}">
      ${libHidden ? '' : `<aside class="hall-lib card no-print no-present">
        <div class="hall-lib-head"><b>Sammlung</b> <span class="badge">${n}</span>
          <button class="icon-btn sm" data-h="new" title="Neuer Hallenplan" aria-label="Neuer Hallenplan">${icon('plus', 16)}</button>
          <button class="icon-btn sm" data-h="import-plan" title="Hallenpläne importieren (Datei oder Text)" aria-label="Hallenpläne importieren">${icon('upload', 16)}</button></div>
        <input id="hall-search" class="input" type="search" placeholder="Name, Thema, Stunde …" value="${esc(search)}" autocomplete="off">
        <div class="hall-lib-list" data-liblist></div>
      </aside>`}
      <div class="print-area hall-host" id="hall-host"></div>
    </div>
  </section>`;
  drawLib();
  hall.attach(root.querySelector('#hall-host'));
}

// Sammlung: Themen (aufklappbar), darin Stunden mit ihren Phasen und einzelne Pläne
function drawLib() {
  const box = root?.querySelector('[data-liblist]'); if (!box) return;
  const s = store.get().sport, q = search.trim().toLocaleLowerCase('de');
  const hit = p => !q || [p.title, p.topic, p.lesson].join(' ').toLocaleLowerCase('de').includes(q);
  const list = hall.sortPlans(s.halls).filter(hit);
  if (!list.length) { box.innerHTML = `<p class="muted small-text">${s.halls.length ? 'Keine Treffer.' : 'Noch kein Hallenplan.'}</p>`; return; }
  const byTopic = new Map();
  list.forEach(p => { const t = p.topic || ''; if (!byTopic.has(t)) byTopic.set(t, []); byTopic.get(t).push(p); });
  const item = (p, sub = '') => `<button class="hall-lib-item ${p.id === s.activeHall ? 'on' : ''}" data-open="${esc(p.id)}" title="${esc(p.title)}">${sub ? `<span class="ph">${sub}</span>` : ''}<span class="t">${esc(p.title)}</span></button>`;
  box.innerHTML = [...byTopic.entries()].map(([t, plans]) => {
    const open = q || !closed.has(t), lessons = new Map(), single = [];
    plans.forEach(p => { if (p.lesson) { if (!lessons.has(p.lesson)) lessons.set(p.lesson, []); lessons.get(p.lesson).push(p); } else single.push(p); });
    return `<details class="hall-topic" data-topic="${esc(t)}" ${open ? 'open' : ''}><summary>${esc(t || 'Ohne Thema')} <span class="muted">${plans.length}</span></summary>
      ${[...lessons.entries()].map(([l, ps]) => `<div class="hall-lesson"><p class="small-text muted">${icon('clock', 13)} ${esc(l)}</p>${ps.map(p => item(p, p.phase)).join('')}</div>`).join('')}
      ${single.map(p => item(p)).join('')}
      <button class="link small-text" data-new-topic="${esc(t)}">${icon('plus', 13)} Plan${t ? ' in „' + esc(t) + '“' : ''}</button></details>`;
  }).join('');
}

function onClick(e) {
  const o = e.target.closest('[data-open]');
  if (o) { hall.openPlan(o.dataset.open); return; }
  const nt = e.target.closest('[data-new-topic]');
  if (nt) { hall.newPlanDialog(nt.dataset.newTopic); return; }
  const lib = e.target.closest('[data-h]');
  if (lib && lib.closest('.hall-lib')) { e.stopPropagation(); if (lib.dataset.h === 'new') hall.newPlanDialog(); else if (lib.dataset.h === 'import-plan') hall.importPlansDialog(); return; }
  const b = e.target.closest('[data-p]'); if (!b) return;
  if (b.dataset.p === 'lib') { libHidden = !libHidden; try { localStorage.setItem('klassenkompass.hallLib', libHidden ? '0' : '1'); } catch {} draw(); }
  else if (b.dataset.p === 'print') window.print();
  else if (b.dataset.p === 'present') { toggleFullscreen(); draw(); }
}
// Zugeklappte Themen merken
document.addEventListener('toggle', e => { const d = e.target; if (!d?.classList?.contains('hall-topic')) return; const t = d.dataset.topic; if (search) return; d.open ? closed.delete(t) : closed.add(t); }, true);

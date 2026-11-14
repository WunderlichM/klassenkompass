// Weitere Objekte für den Unterrichtsbildschirm (seit 2.5.0): Zufallsauswahl, Arbeitsform mit Lautstärke-Ampel,
// Auftragskarte, Stundenablauf, Ruhezeichen, Dienste, Hilfe-Warteliste, Anzeigetafel, Stationen und Tafel.
// js/screen.js bindet sie ein: Rahmen, Ziehen, Größe und Speichern liegen dort, Inhalt und Bedienung hier.
import * as store from './store.js';
import { uid, shuffle } from './engine.js';
import { esc, icon, dialog, toast } from './ui.js';
import * as groups from './groups.js';
import * as hall from './hall.js';
import { ANIMALS, animalSvg } from './animals.js';
import { play, TONES, DEFAULT_INTERVAL_TONES } from './sound.js';

export const ADD = [
  { kind: 'pick', label: 'Zufallsauswahl', ic: 'dice' },
  { kind: 'mode', label: 'Arbeitsform', ic: 'mic' },
  { kind: 'task', label: 'Auftragskarte', ic: 'clipboard' },
  { kind: 'agenda', label: 'Stundenablauf', ic: 'list' },
  { kind: 'signal', label: 'Ruhezeichen', ic: 'bell' },
  { kind: 'duty', label: 'Dienste', ic: 'broom' },
  { kind: 'queue', label: 'Hilfe-Warteliste', ic: 'hand' },
  { kind: 'score', label: 'Anzeigetafel', ic: 'score' },
  { kind: 'stations', label: 'Stationen', ic: 'route' },
  { kind: 'board', label: 'Tafel', ic: 'edit' },
];
export const TYPES = ADD.map(a => a.kind);
export const MIN = { pick: [240, 220], mode: [240, 240], task: [300, 220], agenda: [280, 240], signal: [180, 180], duty: [260, 220], queue: [240, 260], score: [380, 240], stations: [320, 330], board: [300, 240] };

const arr = v => (Array.isArray(v) ? v : []);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const patch = (id, fn, opts) => store.update(s => { const w = s.screen.widgets.find(x => x.id === id); if (w) fn(w); }, opts);
const lines = (v, max = 12, len = 80) => String(v ?? '').split(/\n/).map(l => l.trim().slice(0, len)).filter(Boolean).slice(0, max);

export function create(kind) {
  const g = groups.active();
  const src = g ? { src: g.id, count: 16 } : { src: 'animals', count: 16 };
  switch (kind) {
    case 'pick': return { type: 'pick', ...src, n: 1, drawn: [], current: [], width: 340, height: 300 };
    case 'mode': return { type: 'mode', mode: 'stille', mic: false, adj: 0, alarm: false, width: 320, height: 330 };
    case 'task': return { type: 'task', must: '', extra: '', material: '', help: '', width: 620, height: 380 };
    case 'agenda': return { type: 'agenda', start: '', items: [{ min: 10, text: 'Einstieg' }, { min: 25, text: 'Arbeitsphase' }, { min: 10, text: 'Aufräumen und Abschluss' }], tone: 'none', width: 380, height: 330 };
    case 'signal': return { type: 'signal', tone: 'bowl', volume: 90, width: 240, height: 250 };
    case 'duty': return { type: 'duty', ...src, duties: [{ name: 'Kehren', n: 2 }, { name: 'Werkzeug prüfen', n: 2 }, { name: 'Tische wischen', n: 1 }], offset: 0, width: 400, height: 300 };
    case 'queue': return { type: 'queue', ...src, items: [], width: 300, height: 360 };
    case 'score': return { type: 'score', a: { name: 'Team A', pts: 0 }, b: { name: 'Team B', pts: 0 }, timed: true, durationMs: 600000, remainingMs: 600000, endsAt: null, sound: true, tone: 'whistle', volume: 90, repeats: 2, warn: 0, width: 560, height: 320 };
    case 'board': return { type: 'board', bg: 'white', color: '#25272e', size: 4, tool: 'pen', strokes: [], width: 700, height: 440 };
    case 'stations': return { type: 'stations', trainMs: 180000, pauseMs: 30000, sets: 4, rounds: 1, roundPauseMs: 0, groupsN: 4, names: '', planId: null, volume: 70, tones: { ...DEFAULT_INTERVAL_TONES }, elapsedMs: 0, startedAt: null, width: 420, height: 440 };
  }
  return null;
}

// ---------- Wer macht mit? Lerngruppe (ohne „fehlt heute“), Tiere des Kartenquiz oder Nummern ----------
function people(w) {
  const n = clamp(Math.round(Number(w.count)) || 16, 1, 40);
  if (w.src === 'animals') return Array.from({ length: n }, (_, i) => ({ id: 'a' + (i + 1), name: ANIMALS[i], card: i + 1 }));
  if (w.src === 'numbers') return Array.from({ length: n }, (_, i) => ({ id: 'n' + (i + 1), name: String(i + 1) }));
  const g = groups.byId(w.src); if (!g) return [];
  const off = groups.absent(g.id);
  return g.students.filter(p => !off.has(p.id)).map(p => ({ id: p.id, name: p.name }));
}
const srcMissing = w => !['animals', 'numbers'].includes(w.src) && !groups.byId(w.src);
const personHtml = p => `${p.card ? animalSvg(p.card, { size: '1em', title: false }) + ' ' : ''}${esc(p.name)}`;
function srcField(w) {
  const list = groups.list();
  return `<div class="two"><label class="field">Wer macht mit?<select name="src" class="select">${list.map(g => `<option value="${esc(g.id)}" ${w.src === g.id ? 'selected' : ''}>${esc(g.name)} (${g.students.length})</option>`).join('')}
    <option value="animals" ${w.src === 'animals' ? 'selected' : ''}>Tiere des Kartenquiz</option><option value="numbers" ${w.src === 'numbers' ? 'selected' : ''}>Nummern</option></select></label>
    <label class="field">Anzahl <small class="muted">(nur Tiere/Nummern)</small><input class="input" type="number" name="count" min="1" max="40" value="${clamp(Number(w.count) || 16, 1, 40)}"></label></div>
    <p class="muted small-text">Bei einer Lerngruppe zählen nur Kinder, die im Bereich Gruppen nicht als „fehlt heute“ markiert sind. Mit Tieren oder Nummern steht kein Name am Beamer.</p>`;
}
function readSrc(fd, x) {
  const src = String(fd.get('src') || 'animals');
  if (src !== x.src) { x.drawn = []; x.current = []; x.offset = 0; }
  x.src = src; x.count = clamp(Math.round(Number(fd.get('count'))) || 16, 1, 40);
}

// ---------- Arbeitsform ----------
const MODES = {
  stille: { name: 'Stille', sub: 'Ich arbeite allein und leise.', limit: 38, color: '#3d6c8a', svg: '<circle cx="50" cy="38" r="17"/><path d="M22 86a28 28 0 0 1 56 0"/><path d="M50 44v12" stroke-width="7"/>' },
  fluestern: { name: 'Flüstern', sub: 'Nur mein Nachbar hört mich.', limit: 50, color: '#4e713a', svg: '<circle cx="34" cy="40" r="15"/><path d="M10 86a24 24 0 0 1 48 0"/><path d="M66 34q8 8 0 16M76 26q16 16 0 32"/>' },
  partner: { name: 'Partnerarbeit', sub: 'Wir arbeiten zu zweit.', limit: 60, color: '#b8862b', svg: '<circle cx="32" cy="38" r="14"/><circle cx="68" cy="38" r="14"/><path d="M8 84a24 24 0 0 1 48 0M44 84a24 24 0 0 1 48 0"/>' },
  gruppe: { name: 'Gruppenarbeit', sub: 'Wir arbeiten im Team.', limit: 68, color: '#b25125', svg: '<circle cx="50" cy="26" r="11"/><circle cx="24" cy="50" r="11"/><circle cx="76" cy="50" r="11"/><path d="M32 46a18 18 0 0 1 36 0M6 90a18 18 0 0 1 36 0M58 90a18 18 0 0 1 36 0"/>' },
  plenum: { name: 'Alle hören zu', sub: 'Eine Person spricht, alle schauen nach vorn.', limit: 55, color: '#6a4c9c', svg: '<rect x="14" y="14" width="72" height="44" rx="6"/><path d="M50 58v14M30 86h40"/><circle cx="50" cy="36" r="9"/>' },
};
const modeOf = w => (MODES[w.mode] ? w.mode : 'stille');
const limitOf = w => clamp(MODES[modeOf(w)].limit + (Number(w.adj) || 0), 10, 95);

// Mikrofon der Lautstärke-Ampel: läuft nur in diesem Tab, es wird nichts aufgenommen oder gesendet
const mic = { state: 'off', level: 0, stream: null, ctx: null, analyser: null, buf: null, loudSince: 0, lastAlarm: 0 };
async function micStart() {
  if (mic.state === 'on' || mic.state === 'starting') return;
  if (!navigator.mediaDevices?.getUserMedia) { mic.state = 'error'; return toast('Dieser Browser gibt das Mikrofon nicht frei.', { kind: 'warn' }); }
  mic.state = 'starting';
  try {
    mic.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const C = window.AudioContext || window.webkitAudioContext; mic.ctx = new C();
    mic.analyser = mic.ctx.createAnalyser(); mic.analyser.fftSize = 1024; mic.buf = new Float32Array(mic.analyser.fftSize);
    mic.ctx.createMediaStreamSource(mic.stream).connect(mic.analyser);
    mic.state = 'on'; mic.level = 0;
  } catch (e) { mic.state = 'error'; toast('Das Mikrofon wurde nicht freigegeben.', { kind: 'warn' }); }
}
export function micStop() {
  mic.stream?.getTracks().forEach(t => t.stop()); mic.ctx?.close().catch(() => {});
  mic.stream = mic.ctx = mic.analyser = null; mic.state = 'off'; mic.level = 0; mic.loudSince = 0;
}
// Pegel 0–100 (grob: −60 dB … 0 dB), geglättet
function micRead() {
  if (mic.state !== 'on') return 0;
  mic.analyser.getFloatTimeDomainData(mic.buf);
  let sum = 0; for (const v of mic.buf) sum += v * v;
  const db = 20 * Math.log10(Math.sqrt(sum / mic.buf.length) || 1e-6), lv = clamp((db + 60) / 60 * 100, 0, 100);
  mic.level += (lv - mic.level) * (lv > mic.level ? 0.35 : 0.06);
  return mic.level;
}

// ---------- Stundenablauf ----------
const hhmm = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
function agendaState(w, now) {
  const items = arr(w.items).filter(i => i && Number(i.min) > 0), m = /^(\d{1,2}):(\d{2})$/.exec(w.start || '');
  if (!m || !items.length) return { items, rows: [], idx: -1, state: 'idle' };
  const d = new Date(now); d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  let t = d.getTime(); const rows = items.map(i => { const r = { from: t, to: t + i.min * 60000, text: i.text, min: i.min }; t = r.to; return r; });
  const idx = rows.findIndex(r => now >= r.from && now < r.to);
  return { items, rows, idx, state: idx >= 0 ? 'run' : now < rows[0].from ? 'before' : 'after' };
}
const agendaText = items => arr(items).map(i => `${i.min} ${i.text}`).join('\n');
function agendaParse(text) {
  return lines(text, 14, 70).map(l => { const m = /^(\d{1,3})\s*(?:min\.?|Minuten|')?\s*[:·–-]?\s*(.*)$/i.exec(l); return m && Number(m[1]) > 0 ? { min: clamp(Number(m[1]), 1, 300), text: m[2].trim() || 'Phase' } : null; }).filter(Boolean);
}

// ---------- Dienste ----------
const dutyText = d => arr(d).map(x => `${x.name}${x.n > 1 ? ' ' + x.n : ''}`).join('\n');
const dutyParse = text => lines(text, 12, 50).map(l => { const m = /^(.*?)\s+(\d)$/.exec(l); return m ? { name: m[1].trim(), n: clamp(Number(m[2]), 1, 6) } : { name: l, n: 1 }; }).filter(d => d.name);
function dutyPlan(w) {
  const ps = people(w), duties = arr(w.duties); let k = ps.length ? ((Number(w.offset) || 0) % ps.length + ps.length) % ps.length : 0, used = 0;
  const rows = duties.map(d => { const who = []; for (let i = 0; i < d.n && used < ps.length; i++, used++) { who.push(ps[k]); k = (k + 1) % ps.length; } return { name: d.name, who }; });
  return { rows, slots: duties.reduce((a, d) => a + d.n, 0), total: ps.length };
}

// ---------- Stationen ----------
const stationNames = w => { const l = lines(w.names, 12, 40), n = clamp(Number(w.sets) || 1, 1, 12); return Array.from({ length: n }, (_, i) => l[i] || `Station ${i + 1}`); };

// ---------- Tafel: Schreiben und Malen mit Stift, Finger oder Maus ----------
// Striche liegen als Punktlisten im Objekt (in Pixeln der Zeichenfläche): { c: Farbe, w: Breite, p: [x, y, x, y, …] }.
const BOARD_BG = { white: 'Weiß', green: 'Tafelgrün', lines: 'Liniert', grid: 'Kariert' };
const BOARD_COLORS = ['#25272e', '#2f6fd0', '#d0453a', '#3f9a5c', '#e3a312'];
const BOARD_SIZES = [[2.5, 'fein'], [4, 'mittel'], [9, 'dick']];
const MAX_STROKES = 500, MAX_POINTS = 60000;
const inkOf = (w, c) => (w.bg === 'green' && c === BOARD_COLORS[0] ? '#f4f1e6' : c);   // auf Tafelgrün schreibt „Schwarz“ als Kreide
function strokePath(p) {
  if (p.length < 4) return `M${p[0]} ${p[1]}h.01`;
  // weiche Linie: Punkte als Stützpunkte, Kurven durch die Mitten
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) d += `Q${p[i]} ${p[i + 1]} ${(p[i] + p[i + 2]) / 2} ${(p[i + 1] + p[i + 3]) / 2}`;
  return d + `L${p[p.length - 2]} ${p[p.length - 1]}`;
}
const strokeSvg = (w, s, i) => `<path data-s="${i}" d="${strokePath(arr(s.p))}" stroke="${esc(inkOf(w, s.c))}" stroke-width="${Number(s.w) || 4}"/>`;
let pen = null;   // laufender Strich: { id, pts, path } bzw. Radierer: { id, erase: true }
const boardPos = (svg, e) => { const r = svg.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * (svg.clientWidth / r.width) * 10) / 10, Math.round((e.clientY - r.top) * (svg.clientHeight / r.height) * 10) / 10]; };
const boardSvgOf = id => document.querySelector(`[data-wid="${CSS.escape(id)}"] .bd-svg`);
function eraseAt(id, x, y) {
  const w = store.get().screen.widgets.find(v => v.id === id); if (!w) return;
  const hit = arr(w.strokes).findIndex(s => { const p = arr(s.p), r = 10 + (Number(s.w) || 4) / 2; for (let i = 0; i < p.length; i += 2) if (Math.abs(p[i] - x) < r && Math.abs(p[i + 1] - y) < r) return true; return false; });
  if (hit >= 0) patch(id, v => { v.strokes = arr(v.strokes).filter((_, i) => i !== hit); });
}
document.addEventListener('pointerdown', e => {
  const svg = e.target.closest?.('.bd-svg'); if (!svg || e.button > 0) return;
  const id = svg.closest('[data-wid]')?.dataset.wid, w = store.get().screen.widgets.find(v => v.id === id); if (!w) return;
  e.preventDefault();
  const [x, y] = boardPos(svg, e);
  if (w.tool === 'eraser') { pen = { id, erase: true }; eraseAt(id, x, y); return; }
  pen = { id, pts: [x, y], c: BOARD_COLORS.includes(w.color) ? w.color : BOARD_COLORS[0], w: Number(w.size) || 4, path: null };
});
document.addEventListener('pointermove', e => {
  if (!pen) return;
  const svg = boardSvgOf(pen.id); if (!svg) return;
  const evs = e.getCoalescedEvents?.() || [e];
  for (const ev of evs.length ? evs : [e]) {
    const [x, y] = boardPos(svg, ev);
    if (pen.erase) { eraseAt(pen.id, x, y); continue; }
    const n = pen.pts.length; if (Math.hypot(x - pen.pts[n - 2], y - pen.pts[n - 1]) < 1.5) continue;
    pen.pts.push(x, y);
  }
  if (pen.erase) return;
  // Wurde inzwischen neu gezeichnet (z. B. weil ein Timer ablief), hängt der Strich an der neuen Fläche weiter
  if (!pen.path?.isConnected) { pen.path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); const w = store.get().screen.widgets.find(v => v.id === pen.id); pen.path.setAttribute('stroke', inkOf(w || {}, pen.c)); pen.path.setAttribute('stroke-width', pen.w); svg.querySelector('.bd-ink').append(pen.path); }
  pen.path.setAttribute('d', strokePath(pen.pts));
});
function penUp() {
  const p = pen; pen = null; if (!p || p.erase) return;
  patch(p.id, w => {
    const list = arr(w.strokes); list.push({ c: p.c, w: p.w, p: p.pts.slice(0, 4000) });
    // Grenzen: die ältesten Striche weichen, wenn die Tafel sehr voll wird
    while (list.length > MAX_STROKES || list.reduce((a, s) => a + arr(s.p).length, 0) > MAX_POINTS) list.shift();
    w.strokes = list;
  });
}
document.addEventListener('pointerup', penUp);
document.addEventListener('pointercancel', penUp);

// ======================================================================
// Darstellung (Rückgabe: Inhalt und CSS-Klassen für den Rahmen aus screen.js)
// ======================================================================
const emptyBtn = (text, label) => `<div class="hall-pick"><p class="muted small-text">${text}</p><button class="btn primary sm" data-act="settings">${icon('gear', 15)} ${label}</button></div>`;
export function html(w, { ctrl }) {
  switch (w.type) {
    case 'pick': {
      const ps = people(w), by = new Map(ps.map(p => [p.id, p])), cur = arr(w.current).map(id => by.get(id)).filter(Boolean), left = ps.filter(p => !arr(w.drawn).includes(p.id)).length;
      if (srcMissing(w)) return [emptyBtn('Diese Lerngruppe gibt es nicht mehr.', 'Auswahl ändern'), 'pick'];
      return [`<div class="pk-name ${cur.length > 1 ? 'many' : ''}" aria-live="polite">${cur.length ? cur.map(p => `<span>${personHtml(p)}</span>`).join('') : '<span class="pk-wait">?</span>'}</div>
        <div class="w-ctrl"><button class="btn primary" data-act="x-draw">${icon('dice', 17)} Ziehen</button><button class="round-btn" data-act="x-pick-reset" aria-label="Neu beginnen" title="Neu beginnen: alle sind wieder im Topf">${icon('reset', 18)}</button></div>
        <p class="w-state">${ps.length ? `noch ${left} von ${ps.length} im Topf` : 'Niemand zum Ziehen da'}</p>`, 'pick'];
    }
    case 'mode': {
      const id = modeOf(w), m = MODES[id];
      return [`<div class="md-sym" style="--md:${m.color}"><svg viewBox="0 0 100 100" aria-hidden="true">${m.svg}</svg></div><p class="md-name" style="--md:${m.color}">${m.name}</p><p class="md-sub">${m.sub}</p>
        ${w.mic ? `<div class="md-meter" data-live="meter"><span class="md-lamp"></span><span class="md-bar"><i data-live="level"></i><b style="left:${limitOf(w)}%"></b></span>${mic.state === 'on' ? `<button class="icon-btn xs" data-act="x-mic-off" title="Mikrofon aus" aria-label="Mikrofon aus">${icon('x', 13)}</button>` : `<button class="btn ghost sm" data-act="x-mic">${icon('mic', 14)} Start</button>`}</div>` : ''}
        <div class="md-pick no-present" role="group" aria-label="Arbeitsform wählen">${Object.entries(MODES).map(([k, v]) => `<button class="md-btn ${k === id ? 'on' : ''}" data-act="x-mode" data-mode="${k}" style="--md:${v.color}" title="${v.name}"><svg viewBox="0 0 100 100" aria-hidden="true">${v.svg}</svg></button>`).join('')}</div>`, 'mode'];
    }
    case 'task': {
      const must = lines(w.must), extra = lines(w.extra), mat = lines(w.material), help = lines(w.help);
      if (!must.length && !extra.length && !mat.length && !help.length) return [emptyBtn('Pflicht, Zusatz, Material und Hilfe – dauerhaft sichtbar für die ganze Arbeitsphase.', 'Auftrag eintragen'), 'task'];
      const side = mat.length || help.length;
      return [`<div class="tk ${side ? 'two-col' : ''}"><div class="tk-main">${must.length ? `<h4>Pflicht</h4><ol>${must.map(l => `<li>${esc(l)}</li>`).join('')}</ol>` : ''}${extra.length ? `<h4 class="tk-extra">Zusatz</h4><ul>${extra.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}</div>
        ${side ? `<div class="tk-side">${mat.length ? `<h4>Material</h4><ul>${mat.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}${help.length ? `<h4>Hilfe</h4><ul>${help.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}</div>` : ''}</div>`, 'task'];
    }
    case 'agenda': {
      const st = agendaState(w, Date.now());
      if (!st.items.length) return [emptyBtn('Phasen mit Minuten eintragen, z. B. „10 Einstieg“.', 'Ablauf eintragen'), 'agenda'];
      const rows = st.rows.length ? st.rows : st.items.map(i => ({ text: i.text, min: i.min }));
      return [`<ol class="ag">${rows.map((r, i) => `<li data-i="${i}"><span class="ag-t">${r.from ? hhmm(new Date(r.from)) : ''}</span><span class="ag-x">${esc(r.text)}</span><span class="ag-m">${r.min} min</span><i class="ag-bar"></i></li>`).join('')}</ol>
        <p class="ag-foot" data-live="agfoot"></p>${st.rows.length ? '' : `<button class="btn primary sm" data-act="x-agenda-now">${icon('play', 15)} Jetzt beginnen</button>`}`, 'agenda'];
    }
    case 'signal': return [`<button class="sig-btn" data-act="x-signal" aria-label="Ruhezeichen spielen">${icon('bell', 44)}</button><p class="w-state">${esc(TONES[w.tone]?.name || 'Klangschale')}</p>`, 'signal'];
    case 'duty': {
      if (srcMissing(w)) return [emptyBtn('Diese Lerngruppe gibt es nicht mehr.', 'Auswahl ändern'), 'duty'];
      const p = dutyPlan(w);
      if (!p.rows.length) return [emptyBtn('Dienste eintragen, z. B. „Kehren 2“ für zwei Kinder.', 'Dienste eintragen'), 'duty'];
      return [`<table class="dt"><tbody>${p.rows.map(r => `<tr><th>${esc(r.name)}</th><td>${r.who.length ? r.who.map(x => `<span>${personHtml(x)}</span>`).join('') : '<span class="muted">–</span>'}</td></tr>`).join('')}</tbody></table>
        <div class="w-ctrl no-present"><button class="round-btn" data-act="x-duty" data-d="-1" aria-label="Vorherige Einteilung">${icon('back', 18)}</button><button class="btn primary" data-act="x-duty" data-d="1">Weiter ${icon('forward', 16)}</button></div>`, 'duty'];
    }
    case 'queue': {
      const items = arr(w.items);
      return [`<ol class="qu">${items.map((x, i) => `<li class="${i ? '' : 'now'}"><span class="qu-no">${i + 1}</span><span class="qu-name">${esc(x.name)}</span><button class="icon-btn xs" data-act="x-queue-done" data-qid="${esc(x.id)}" title="Erledigt" aria-label="${esc(x.name)} ist fertig">${icon('check', 14)}</button></li>`).join('') || '<li class="qu-empty">Niemand wartet.</li>'}</ol>
        <form class="sw-record no-present" data-wq="${esc(w.id)}"><input class="input sm" name="name" placeholder="Name oder Tischnummer" maxlength="30"><button class="btn primary sm">Anstellen</button>${people(w).length ? `<button type="button" class="icon-btn sm" data-act="x-queue-pick" title="Aus der Liste wählen" aria-label="Aus der Liste wählen">${icon('users', 15)}</button>` : ''}</form>`, 'queue'];
    }
    case 'score': {
      const side = k => { const t = w[k] || {}; return `<div class="sc-side sc-${k}"><p class="sc-name">${esc(t.name || (k === 'a' ? 'Team A' : 'Team B'))}</p><p class="sc-pts">${Number(t.pts) || 0}</p>
        <div class="sc-btns no-present"><button class="round-btn" data-act="x-score" data-k="${k}" data-d="-1" aria-label="Punkt abziehen">−</button><button class="round-btn primary" data-act="x-score" data-k="${k}" data-d="1" aria-label="Punkt dazu">+</button></div></div>`; };
      return [`<div class="sc">${side('a')}<div class="sc-mid">${w.timed ? `<div class="time" data-live="time"></div>${ctrl(w, w.endsAt !== null)}<p class="w-state" data-live="state"></p>` : '<span class="sc-colon">:</span>'}</div>${side('b')}</div>`, 'score'];
    }
    case 'board': {
      const er = w.tool === 'eraser', cur = BOARD_COLORS.includes(w.color) ? w.color : BOARD_COLORS[0], size = Number(w.size) || 4, n = arr(w.strokes).length;
      return [`<div class="bd-bar">${BOARD_COLORS.map(c => `<button class="bd-col ${!er && c === cur ? 'on' : ''}" data-act="x-board-color" data-c="${c}" style="--c:${inkOf(w, c)}" aria-label="Farbe wählen"></button>`).join('')}
        <span class="bd-sep"></span>${BOARD_SIZES.map(([v, l]) => `<button class="bd-size ${!er && v === size ? 'on' : ''}" data-act="x-board-size" data-v="${v}" title="Strich ${l}" aria-label="Strich ${l}"><i style="height:${Math.max(2, v)}px"></i></button>`).join('')}
        <span class="bd-sep"></span><button class="bd-tool ${er ? 'on' : ''}" data-act="x-board-eraser" title="Radierer: Striche antippen oder darüberfahren" aria-pressed="${er}">Radierer</button>
        <span class="bd-grow"></span><button class="icon-btn xs" data-act="x-board-undo" title="Letzten Strich zurücknehmen" aria-label="Letzten Strich zurücknehmen" ${n ? '' : 'disabled'}>${icon('reset', 15)}</button><button class="icon-btn xs" data-act="x-board-clear" title="Tafel wischen" aria-label="Tafel wischen" ${n ? '' : 'disabled'}>${icon('trash', 15)}</button></div>
        <svg class="bd-svg bg-${BOARD_BG[w.bg] ? w.bg : 'white'} ${er ? 'erasing' : ''}"><g class="bd-ink">${arr(w.strokes).map((s, i) => strokeSvg(w, s, i)).join('')}</g></svg>`, 'board'];
    }
    case 'stations': {
      const p = w.planId ? hall.planById(w.planId) : null, n = clamp(Number(w.groupsN) || 1, 1, 12);
      return [`<div class="stn ${p ? 'with-plan' : ''}"><div class="stn-main"><p class="phase" data-live="phase"></p><div class="time" data-live="iv"></div><div class="bar"><span data-live="ivbar"></span></div>
        <table class="stn-t"><tbody>${Array.from({ length: n }, (_, i) => `<tr><th>Gruppe ${i + 1}</th><td data-g="${i}"></td></tr>`).join('')}</tbody></table>
        ${ctrl(w, w.startedAt !== null)}<p class="w-state" data-live="ivtotal"></p></div>${p ? `<div class="hall-mini">${hall.boardSvg(p, { crop: true })}</div>` : ''}</div>`, 'stations interval'];
    }
  }
  return ['', ''];
}

// ======================================================================
// Laufende Anzeige (jedes Bild): q(k) sucht data-live="k" im Objekt
// ======================================================================
const lastAgenda = new Map();
export function live(w, el, q, now, { withSound, muted, st }) {
  if (w.type === 'mode' && w.mic) {
    const lv = micRead(), lim = limitOf(w), meter = q('meter'); if (!meter) return;
    const bar = q('level'); if (bar) bar.style.width = lv.toFixed(0) + '%';
    const zone = mic.state !== 'on' ? 'off' : lv >= lim ? 'red' : lv >= lim - 10 ? 'yellow' : 'green';
    if (meter.dataset.zone !== zone) meter.dataset.zone = zone;
    if (zone === 'red') { mic.loudSince ||= now; if (w.alarm && withSound && !muted && now - mic.loudSince > 2500 && now - mic.lastAlarm > 20000) { mic.lastAlarm = now; play('bowl', 0.9); } } else mic.loudSince = 0;
  } else if (w.type === 'agenda') {
    const a = agendaState(w, now), foot = q('agfoot');
    el.querySelectorAll('.ag li').forEach((li, i) => {
      const r = a.rows[i], on = i === a.idx; li.classList.toggle('now', on); li.classList.toggle('past', !!r && now >= r.to);
      const bar = li.querySelector('.ag-bar'); if (bar) bar.style.width = on ? clamp((now - r.from) / (r.to - r.from) * 100, 0, 100) + '%' : '0';
    });
    let t = '';
    if (a.state === 'run') { const r = a.rows[a.idx], left = Math.ceil((r.to - now) / 60000), nx = a.rows[a.idx + 1]; t = `noch ${left} min${nx ? ` · dann: ${nx.text}` : ' · dann ist Schluss'}`; }
    else if (a.state === 'before') t = `beginnt um ${hhmm(new Date(a.rows[0].from))} Uhr`;
    else if (a.state === 'after') t = 'Die Stunde ist vorbei.';
    if (foot && foot.textContent !== t) foot.textContent = t;
    if (withSound && a.rows.length) { const prev = lastAgenda.get(w.id), key = a.state + a.idx; if (prev !== undefined && prev !== key && a.state !== 'before' && !muted && w.tone && w.tone !== 'none') play(w.tone, 0.8); lastAgenda.set(w.id, key); }
  } else if (w.type === 'stations' && st) {
    const names = stationNames(w), n = names.length, change = st.stage === 'pause', fin = st.stage === 'finished';
    const ph = q('phase'), text = fin ? 'Geschafft!' : change ? 'Wechsel' : `Durchgang ${st.set} von ${n}`; if (ph && ph.textContent !== text) ph.textContent = text;
    el.querySelectorAll('[data-g]').forEach(td => {
      const g = Number(td.dataset.g), at = (g + st.set - 1) % n, t = fin ? '–' : change ? `→ ${names[(at + 1) % n]}` : names[at];
      if (td.textContent !== t) td.textContent = t;
    });
  }
}
export const wantsFrame = w => (w.type === 'mode' && w.mic && mic.state === 'on');

// ======================================================================
// Bedienung
// ======================================================================
document.addEventListener('submit', e => {
  const f = e.target; if (!f.dataset?.wq) return;
  e.preventDefault();
  const name = String(new FormData(f).get('name') || '').trim().slice(0, 30); if (!name) return;
  queueAdd(f.dataset.wq, name);
  requestAnimationFrame(() => document.querySelector(`[data-wq="${CSS.escape(f.dataset.wq)}"] input`)?.focus());
});
function queueAdd(id, name) {
  const w = store.get().screen.widgets.find(x => x.id === id); if (!w) return;
  if (arr(w.items).length >= 30) return toast('Höchstens 30 Einträge in der Warteliste.');
  if (arr(w.items).some(x => x.name === name)) return toast(`${name} steht schon in der Liste.`);
  patch(id, x => { x.items = [...arr(x.items), { id: uid(), name }]; });
}

// Rückgabe true = erledigt (screen.js macht nichts weiter)
export function click(act, w, b) {
  if (!act.startsWith('x-') || !w) return false;
  const id = w.id;
  switch (act) {
    case 'x-draw': {
      const ps = people(w); if (!ps.length) return toast('Niemand zum Ziehen da.'), true;
      let drawn = arr(w.drawn).filter(d => ps.some(p => p.id === d)), pool = ps.filter(p => !drawn.includes(p.id));
      if (!pool.length) { drawn = []; pool = ps; toast('Alle waren dran – der Topf ist wieder voll.'); }
      const got = shuffle(pool).slice(0, clamp(Number(w.n) || 1, 1, 6)).map(p => p.id);
      patch(id, x => { x.drawn = [...drawn, ...got]; x.current = got; });
      play('tick', 0.5);
      return true;
    }
    case 'x-pick-reset': patch(id, x => { x.drawn = []; x.current = []; }); return true;
    case 'x-mode': patch(id, x => { x.mode = b.dataset.mode; }); return true;
    case 'x-mic': micStart().then(() => patch(id, () => {})); return true;
    case 'x-mic-off': micStop(); patch(id, () => {}); return true;
    case 'x-agenda-now': patch(id, x => { x.start = hhmm(new Date()); }); return true;
    case 'x-signal': play(TONES[w.tone] ? w.tone : 'bowl', (w.volume ?? 90) / 100); return true;
    case 'x-duty': { const p = dutyPlan(w); if (p.total) patch(id, x => { x.offset = (((Number(x.offset) || 0) + Number(b.dataset.d) * Math.max(1, Math.min(p.slots, p.total))) % p.total + p.total) % p.total; }); return true; }
    case 'x-queue-done': patch(id, x => { x.items = arr(x.items).filter(i => i.id !== b.dataset.qid); }); return true;
    case 'x-queue-pick': {
      const ps = people(w), has = new Set(arr(w.items).map(i => i.name));
      dialog({ title: 'Wer braucht Hilfe?', submit: null, cancel: 'Fertig', body: `<div class="chip-pick">${ps.map(p => `<button type="button" class="btn ghost sm" data-n="${esc(p.name)}" ${has.has(p.name) ? 'disabled' : ''}>${personHtml(p)}</button>`).join('')}</div>`,
        onOpen: el => el.querySelectorAll('[data-n]').forEach(btn => btn.onclick = () => { queueAdd(id, btn.dataset.n); btn.disabled = true; }) });
      return true;
    }
    case 'x-board-color': patch(id, x => { x.color = b.dataset.c; x.tool = 'pen'; }); return true;
    case 'x-board-size': patch(id, x => { x.size = Number(b.dataset.v); x.tool = 'pen'; }); return true;
    case 'x-board-eraser': patch(id, x => { x.tool = x.tool === 'eraser' ? 'pen' : 'eraser'; }); return true;
    case 'x-board-undo': patch(id, x => { x.strokes = arr(x.strokes).slice(0, -1); }); return true;
    case 'x-board-clear': { const old = arr(w.strokes); patch(id, x => { x.strokes = []; }); toast('Tafel gewischt.', { action: 'Rückgängig', onAction: () => patch(id, x => { x.strokes = old; }) }); return true; }
    case 'x-score': patch(id, x => { const t = x[b.dataset.k] ||= { name: '', pts: 0 }; t.pts = clamp((Number(t.pts) || 0) + Number(b.dataset.d), 0, 999); }); return true;
  }
  return false;
}

// ======================================================================
// Einstellungen: { body, wide?, onOpen?, apply(fd, x) } – Titel, Position und Größe ergänzt screen.js
// ======================================================================
const toneSelect = (name, cur, none = false) => `<span class="tone-row"><select name="${name}" class="select">${none ? `<option value="none" ${cur === 'none' ? 'selected' : ''}>Kein Ton</option>` : ''}${Object.entries(TONES).filter(([k]) => k !== 'none').map(([k, t]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${t.name}</option>`).join('')}</select><button type="button" class="icon-btn sm" data-tone-test="${name}" aria-label="Probehören" title="Probehören">${icon('play', 14)}</button></span>`;
const bindToneTest = el => el.querySelectorAll('[data-tone-test]').forEach(btn => btn.onclick = () => { const v = el.querySelector(`[name="${btn.dataset.toneTest}"]`).value; if (v !== 'none') play(v, Number(el.querySelector('[name=volume]')?.value ?? 80) / 100); });
const area = (name, label, val, rows = 4, ph = '') => `<label class="field">${label}<textarea name="${name}" class="input" rows="${rows}" placeholder="${esc(ph)}">${esc(val || '')}</textarea></label>`;
const volField = v => `<label class="field">Lautstärke <output>${v} %</output><input type="range" min="0" max="100" step="5" name="volume" value="${v}" oninput="this.previousElementSibling.value=this.value+' %'"></label>`;

export function settings(w, { durField, readDur, toneFields, readTone }) {
  switch (w.type) {
    case 'pick': return { body: `${srcField(w)}<label class="field">Wie viele auf einmal?<select name="n" class="select">${[1, 2, 3, 4, 5, 6].map(n => `<option ${Number(w.n) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <p class="muted small-text">Wer gezogen wurde, kommt erst wieder dran, wenn alle an der Reihe waren.</p>`,
      apply: (fd, x) => { readSrc(fd, x); x.n = clamp(Number(fd.get('n')) || 1, 1, 6); } };
    case 'mode': return { body: `<label class="check"><input type="checkbox" name="mic" ${w.mic ? 'checked' : ''}> Lautstärke-Ampel mit dem Mikrofon dieses Geräts</label>
      <label class="field">Empfindlichkeit der Ampel <output>${Number(w.adj) || 0}</output><input type="range" min="-25" max="25" step="5" name="adj" value="${Number(w.adj) || 0}" oninput="this.previousElementSibling.value=this.value"></label>
      <label class="check"><input type="checkbox" name="alarm" ${w.alarm ? 'checked' : ''}> Klangschale, wenn es länger zu laut ist (höchstens alle 20 Sekunden)</label>
      <p class="muted small-text">Jede Arbeitsform hat eine eigene Grenze (Stille streng, Gruppenarbeit großzügig). Der Regler verschiebt sie: nach links strenger, nach rechts großzügiger. Das Mikrofon wird nur ausgewertet – nichts wird aufgenommen, gespeichert oder gesendet. Der Browser fragt beim Start nach der Freigabe.</p>`,
      apply: (fd, x) => { x.mic = fd.get('mic') === 'on'; x.adj = clamp(Number(fd.get('adj')) || 0, -25, 25); x.alarm = fd.get('alarm') === 'on'; if (!x.mic) micStop(); } };
    case 'task': return { wide: true, body: `<div class="two">${area('must', 'Pflicht <small class="muted">(eine Zeile je Schritt)</small>', w.must, 6, 'Werkstück anreißen\nSägen\nKanten feilen')}${area('material', 'Material und Werkzeug', w.material, 6, 'Feinsäge\nSchraubzwinge')}</div>
      <div class="two">${area('extra', 'Zusatz <small class="muted">(für Schnelle)</small>', w.extra, 3)}${area('help', 'Hilfe', w.help, 3, 'Hilfeheft Seite 4\nErst Partner fragen')}</div>`,
      apply: (fd, x) => { for (const k of ['must', 'extra', 'material', 'help']) x[k] = lines(fd.get(k), 12, 80).join('\n'); } };
    case 'agenda': return { body: `<label class="field">Beginn <small class="muted">(leer = mit „Jetzt beginnen“ starten)</small><input class="input" type="time" name="start" value="${esc(w.start || '')}"></label>
      ${area('items', 'Phasen <small class="muted">(je Zeile: Minuten und Name)</small>', agendaText(w.items), 7, '10 Einstieg\n25 Arbeitsphase\n10 Aufräumen')}
      <label class="field">Ton beim Phasenwechsel${toneSelect('tone', w.tone || 'none', true)}</label>`,
      onOpen: bindToneTest,
      apply: (fd, x) => { const items = agendaParse(fd.get('items')); if (!items.length) throw new Error('Bitte mindestens eine Phase eintragen, z. B. „10 Einstieg“.'); x.items = items; x.start = /^\d{1,2}:\d{2}$/.test(fd.get('start')) ? String(fd.get('start')) : ''; x.tone = String(fd.get('tone')); } };
    case 'signal': return { body: `<label class="field">Ton${toneSelect('tone', w.tone || 'bowl')}</label>${volField(w.volume ?? 90)}`, onOpen: bindToneTest,
      apply: (fd, x) => { x.tone = String(fd.get('tone')); x.volume = clamp(Number(fd.get('volume')), 0, 100); } };
    case 'duty': return { body: `${srcField(w)}${area('duties', 'Dienste <small class="muted">(je Zeile ein Dienst; Zahl am Ende = Anzahl Kinder)</small>', dutyText(w.duties), 6, 'Kehren 2\nWerkzeug prüfen 2\nTische wischen')}
      <p class="muted small-text">„Weiter“ gibt die Dienste an die nächsten Kinder der Liste – so kommt reihum jedes Kind dran.</p>`,
      apply: (fd, x) => { readSrc(fd, x); x.duties = dutyParse(fd.get('duties')); } };
    case 'queue': return { body: `${srcField(w)}<p class="muted small-text">Du trägst ein, wer Hilfe braucht – per Namen oder über die Liste. Der Haken entfernt das Kind, die nächsten rücken auf.</p>`,
      apply: (fd, x) => { readSrc(fd, x); } };
    case 'score': return { body: `<div class="two"><label class="field">Team links<input class="input" name="an" maxlength="24" value="${esc(w.a?.name || '')}"></label><label class="field">Team rechts<input class="input" name="bn" maxlength="24" value="${esc(w.b?.name || '')}"></label></div>
      <label class="check"><input type="checkbox" name="timed" ${w.timed ? 'checked' : ''}> Mit Spielzeit</label>${durField('dur', 'Spielzeit', w.durationMs || 600000)}
      ${toneFields(w)}<label class="check"><input type="checkbox" name="zero"> Punkte auf 0 : 0 setzen</label>`,
      apply: (fd, x) => { readTone(fd, x); x.a = { name: String(fd.get('an')).trim().slice(0, 24) || 'Team A', pts: fd.get('zero') ? 0 : Number(x.a?.pts) || 0 }; x.b = { name: String(fd.get('bn')).trim().slice(0, 24) || 'Team B', pts: fd.get('zero') ? 0 : Number(x.b?.pts) || 0 };
        x.timed = fd.get('timed') === 'on'; const d = clamp(readDur(fd, 'dur'), 1000, 24 * 3600000); if (d !== x.durationMs || !x.timed) { x.durationMs = d; x.remainingMs = d; x.endsAt = null; } } };
    case 'board': return { body: `<label class="field">Hintergrund<select name="bg" class="select">${Object.entries(BOARD_BG).map(([k, v]) => `<option value="${k}" ${w.bg === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <p class="muted small-text">Schreiben mit Stift, Finger oder Maus. Verschieben lässt sich die Tafel an ihrer Kopfzeile. Das Tafelbild wird wie alle Objekte gespeichert und bleibt nach dem Neuladen stehen.</p>`,
      apply: (fd, x) => { x.bg = BOARD_BG[fd.get('bg')] ? String(fd.get('bg')) : 'white'; } };
    case 'stations': {
      const plans = hall.planList();
      return { wide: true, body: `<div class="two">${durField('train', 'Zeit je Station', w.trainMs)}${durField('pause', 'Zeit zum Wechseln', w.pauseMs)}</div>
        <div class="three"><label class="field">Stationen<input class="input" type="number" min="2" max="12" name="sets" value="${w.sets}"></label><label class="field">Gruppen<input class="input" type="number" min="1" max="12" name="groupsN" value="${w.groupsN}"></label>${volField(w.volume ?? 70)}</div>
        <div class="two">${area('names', 'Namen der Stationen <small class="muted">(optional, je Zeile)</small>', w.names, 4, 'Seilspringen\nBankdrücken')}<label class="field">Hallenplan daneben<select name="plan" class="select"><option value="">– keiner –</option>${plans.map(p => `<option value="${esc(p.id)}" ${p.id === w.planId ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></label></div>
        <p class="muted small-text">Jede Gruppe beginnt an ihrer Station (Gruppe 1 an Station 1 …) und rückt nach jedem Durchgang eine Station weiter. Es gibt so viele Durchgänge wie Stationen. Die Töne sind die des Intervalltimers (Start, Wechsel, Ende, 3-2-1).</p>`,
        apply: (fd, x) => {
          const next = { trainMs: Math.max(1000, readDur(fd, 'train')), pauseMs: readDur(fd, 'pause'), sets: clamp(Number(fd.get('sets')) || 2, 2, 12) };
          if (['trainMs', 'pauseMs', 'sets'].some(k => next[k] !== x[k])) { Object.assign(x, next); x.elapsedMs = 0; x.startedAt = null; }
          x.rounds = 1; x.roundPauseMs = 0; x.groupsN = clamp(Number(fd.get('groupsN')) || 1, 1, 12); x.volume = clamp(Number(fd.get('volume')), 0, 100);
          x.names = lines(fd.get('names'), 12, 40).join('\n'); x.planId = String(fd.get('plan') || '') || null;
        } };
    }
  }
  return null;
}

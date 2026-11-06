// Bereich Bildschirm: frei anordnbare Timer, Stoppuhren, Intervalltimer und QR-Codes
import * as store from './store.js';
import { SCREEN_W, SCREEN_H } from './store.js';
import { uid } from './engine.js';
import { esc, icon, dialog, confirmDialog, toast, toggleFullscreen } from './ui.js';
import { qrSvg } from './qr.js';
import { play, timerEnd, TONES, DEFAULT_INTERVAL_TONES, INTERVAL_TONE_LABELS } from './sound.js';

const MAX_WIDGETS = 30, MAX_RESULTS = 200;
const ADD = [
  { kind: 'digital', label: 'Digitaler Timer', ic: 'clock' },
  { kind: 'circle', label: 'Kreistimer', ic: 'reset' },
  { kind: 'egg', label: 'Ei-Timer', ic: 'egg' },
  { kind: 'qr', label: 'QR-Code', ic: 'qr' },
  { kind: 'stopwatch', label: 'Stoppuhr', ic: 'stopwatch' },
  { kind: 'people', label: 'Mehrpersonen-Stoppuhr', ic: 'users' },
  { kind: 'interval', label: 'Intervalltimer', ic: 'repeat' },
];
const MIN = { qr: [220, 300], stopwatch: [280, 210], people: [300, 380], interval: [300, 370], circle: [240, 320], egg: [240, 320], digital: [280, 210] };
const minFor = w => MIN[w.type === 'timer' ? w.style : w.type === 'stopwatch' && w.mode === 'people' ? 'people' : w.type] || [220, 200];

let root = null, raf = 0, selected = null, scale = 1, muted = false;
const fired = new Set(); // bereits gemeldete Timer-Enden
const lastPhase = new Map(), lastCount = new Map();

const scr = () => store.get().screen;
const wid = id => scr().widgets.find(w => w.id === id);
const patch = (id, fn, opts) => store.update(s => { const w = s.screen.widgets.find(x => x.id === id); if (w) fn(w); }, opts);

export function mount(el) {
  root = el;
  const off = store.subscribe(() => draw());
  el.onclick = onClick;
  el.onchange = onChange;
  el.onpointerdown = onPointerDown;
  el.onkeydown = onKey;
  addEventListener('resize', fit);
  draw();
  raf = requestAnimationFrame(tick);
  return () => { off(); cancelAnimationFrame(raf); removeEventListener('resize', fit); el.onclick = el.onchange = el.onpointerdown = el.onkeydown = null; root = null; };
}

function draw() {
  if (!root) return;
  const s = scr(), presenting = document.body.classList.contains('presenting');
  root.innerHTML = `
  <section class="page screen bg-${s.background}">
    <div class="page-head no-present">
      <div><p class="eyebrow">Bildschirm · Gemeinsam im Blick</p><h1>Unterrichtsbildschirm<span class="dot">.</span></h1></div>
      <div class="tools">
        <button class="btn ghost sm" data-act="help">${icon('help', 16)} Hilfe</button>
        <button class="btn ghost sm" data-act="mute" title="Signaltöne ein/aus">${icon(muted ? 'mute' : 'volume', 16)} ${muted ? 'Töne aus' : 'Töne an'}</button>
        <button class="btn ghost" data-act="present">${icon(presenting ? 'shrink' : 'expand', 16)} ${presenting ? 'Ansicht verkleinern' : 'Große Ansicht'}</button>
      </div>
    </div>
    <div class="stage-wrap" id="stage-wrap">
      <div class="stage" id="stage" style="width:${SCREEN_W}px;height:${SCREEN_H}px">${s.widgets.map(widgetHtml).join('')}
        ${s.widgets.length ? '' : '<div class="stage-empty">Füge unten einen Timer, eine Stoppuhr oder einen QR-Code hinzu.</div>'}</div>
    </div>
    <div class="dock no-present">
      <div class="add-row">${ADD.map(a => `<button class="add-btn" data-act="add" data-kind="${a.kind}">${icon(a.ic, 18)}<span>${a.label}</span></button>`).join('')}</div>
      <div class="dock-row">
        <span class="muted small-text dock-hint">Objekte an freien Stellen ziehen · Ecke für die Größe · Pfeiltasten zum Verschieben</span><span class="muted small-text stack-hint">Auf dem Handy stehen alle Objekte untereinander. „Alles anzeigen“ zeigt die Anordnung wie am Bildschirm.</span>
        <span class="swatches" role="group" aria-label="Hintergrund">${['mint', 'paper', 'night'].map(b => `<button class="swatch sw-${b} ${s.background === b ? 'on' : ''}" data-act="bg" data-bg="${b}" title="${{ mint: 'Mint', paper: 'Papier', night: 'Nacht' }[b]}"></button>`).join('')}</span>
        <label class="small-text">Ansicht <select class="select sm" id="zoom">${[['auto', 'Automatisch'], ['fit', 'Alles anzeigen'], ['0.5', '50 %'], ['0.75', '75 %'], ['1', '100 %'], ['1.25', '125 %'], ['1.5', '150 %']].map(([v, l]) => `<option value="${v}" ${String(s.zoom) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
    </div>
  </section>`;
  fit();
  updateLive(Date.now(), false);
}

// Handy: Objekte untereinander statt verkleinerter Bühne (nur bei Ansicht „Automatisch“)
const isStack = () => root?.querySelector('#stage-wrap')?.classList.contains('stack');

function fit() {
  const wrap = root?.querySelector('#stage-wrap'), stage = root?.querySelector('#stage'); if (!wrap || !stage) return;
  const z = scr().zoom, availW = wrap.clientWidth;
  const presenting = document.body.classList.contains('presenting');
  const stack = z === 'auto' && availW < 640;
  wrap.classList.toggle('stack', stack);
  root.querySelector('.screen')?.classList.toggle('stacked', stack);
  if (stack) {
    scale = 1; stage.style.transform = 'none'; stage.style.marginLeft = '0'; wrap.style.height = ''; wrap.classList.remove('scroll-x');
    return;
  }
  const vh = window.visualViewport?.height || innerHeight;
  const availH = presenting ? vh - 24 : Math.max(320, vh - wrap.getBoundingClientRect().top - 150);
  if (z === 'fit' || presenting) scale = Math.min(availW / SCREEN_W, availH / SCREEN_H);
  else if (z === 'auto') scale = Math.max(0.4, Math.min(availW / SCREEN_W, 1.6));
  else scale = Number(z) || 1;
  stage.style.transform = `scale(${scale})`;
  wrap.style.height = SCREEN_H * scale + 'px';
  wrap.classList.toggle('scroll-x', SCREEN_W * scale > availW + 1);
  stage.style.marginLeft = SCREEN_W * scale < availW ? (availW - SCREEN_W * scale) / 2 + 'px' : '0';
}

// ---------- Widgets ----------
function frame(w, inner, cls = '') {
  return `<div class="widget ${cls} ${selected === w.id ? 'selected' : ''}" data-wid="${esc(w.id)}" tabindex="0" style="left:${w.x}px;top:${w.y}px;width:${w.width}px;height:${w.height}px;order:${Math.round(w.y / 20) * 10000 + Math.round(w.x)}">
    <div class="w-head" data-drag><span class="w-title">${esc(w.label || '')}</span>
      <span class="w-tools"><button class="icon-btn xs" data-act="settings" title="Einstellungen">${icon('gear', 15)}</button><button class="icon-btn xs" data-act="remove" title="Entfernen">${icon('trash', 15)}</button></span></div>
    <div class="w-body">${inner}</div><div class="w-resize" data-resize title="Größe ändern"></div></div>`;
}
const ctrl = (w, running, extra = '') => `<div class="w-ctrl">
  <button class="round-btn primary" data-act="${running ? 'pause' : 'start'}" aria-label="${running ? 'Pause' : 'Start'}">${icon(running ? 'pause' : 'play', 18)}</button>
  <button class="round-btn" data-act="reset" aria-label="Zurücksetzen">${icon('reset', 18)}</button>${extra}</div>`;

function widgetHtml(w) {
  if (w.type === 'timer') {
    const running = w.endsAt !== null;
    const sound = `<button class="round-btn" data-act="sound" aria-label="Ton ein/aus" title="${w.sound ? 'Ton an' : 'Ton aus'}">${icon(w.sound ? 'volume' : 'mute', 18)}</button>`;
    if (w.style === 'circle') return frame(w, `<div class="circle-timer"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="track"/><path data-live="pie" class="pie"/></svg><div class="time" data-live="time"></div></div>${ctrl(w, running, sound)}<p class="w-state" data-live="state"></p>`, 'timer circle');
    if (w.style === 'egg') return frame(w, `<div class="egg-timer" data-live="egg">${eggSvg()}</div><div class="time" data-live="time"></div>${ctrl(w, running, sound)}<p class="w-state" data-live="state"></p>`, 'timer egg');
    return frame(w, `<div class="time big" data-live="time"></div><div class="bar"><span data-live="bar"></span></div>${ctrl(w, running, sound)}<p class="w-state" data-live="state"></p>`, 'timer digital');
  }
  if (w.type === 'qr') {
    let svg = '';
    try { svg = w.content ? qrSvg(w.content) : ''; } catch (e) { svg = `<p class="muted">${esc(e.message)}</p>`; }
    return frame(w, w.content ? `<div class="qr-box">${svg}</div><p class="qr-text" title="${esc(w.content)}">${esc(w.content)}</p>`
      : `<form class="qr-form" data-qr="${esc(w.id)}"><textarea class="input" name="content" rows="3" placeholder="Link oder Text"></textarea><button class="btn primary sm">QR-Code erstellen</button></form>`, 'qr');
  }
  if (w.type === 'stopwatch') {
    const running = w.startedAt !== null;
    if (w.mode === 'people') return frame(w, `<div class="time mid" data-live="sw"></div>
      ${ctrl(w, running)}
      <form class="sw-record" data-record="${esc(w.id)}"><input class="input sm" name="name" placeholder="Vorname oder Startnummer (optional)" maxlength="40"><button class="btn primary sm" ${running ? '' : 'disabled'}>Zeit speichern</button></form>
      <ol class="results">${w.results.map((r, i) => `<li><span class="rank">${i + 1}.</span><button class="link" data-act="rename-result" data-rid="${esc(r.id)}">${esc(r.name)}</button><span class="rt">${swText(r.elapsedMs)}</span><button class="icon-btn xs" data-act="del-result" data-rid="${esc(r.id)}" aria-label="Messung entfernen">${icon('x', 13)}</button></li>`).join('')}</ol>
      ${w.results.length ? `<button class="link small-text" data-act="clear-results">Liste leeren</button>` : ''}`, 'stopwatch people');
    return frame(w, `<div class="time big" data-live="sw"></div>${ctrl(w, running)}`, 'stopwatch');
  }
  if (w.type === 'interval') {
    const running = w.startedAt !== null;
    return frame(w, `<p class="phase" data-live="phase"></p><div class="time big" data-live="iv"></div><p class="iv-meta" data-live="meta"></p><div class="bar"><span data-live="ivbar"></span></div>${ctrl(w, running)}<p class="w-state" data-live="ivtotal"></p>`, 'interval');
  }
  return '';
}

function eggSvg() {
  // eigenes, schlichtes Motiv: Ei, das am Ende aufbricht
  return `<svg viewBox="0 0 120 120" class="egg-svg">
    <g class="egg-whole"><path d="M60 12c20 0 34 32 34 54a34 34 0 0 1-68 0c0-22 14-54 34-54z" fill="#fbf3df" stroke="#e2cfa3" stroke-width="2"/>
      <clipPath id="eggclip"><path d="M60 12c20 0 34 32 34 54a34 34 0 0 1-68 0c0-22 14-54 34-54z"/></clipPath>
      <rect data-live="eggfill" x="20" y="12" width="80" height="90" fill="#f6dd8c" clip-path="url(#eggclip)"/></g>
    <g class="egg-open"><path d="M30 76l8-8 8 8 8-8 8 8 8-8 8 8 8-8 4 4a34 34 0 0 1-68 4z" fill="#fbf3df" stroke="#e2cfa3" stroke-width="2"/>
      <circle cx="60" cy="56" r="20" fill="#f7d659"/><circle cx="53" cy="52" r="2.4" fill="#3b3226"/><circle cx="67" cy="52" r="2.4" fill="#3b3226"/><path d="M56 59l4 4 4-4z" fill="#e8913a"/>
      <circle cx="47" cy="59" r="3" fill="#f4a9a0" opacity=".7"/><circle cx="73" cy="59" r="3" fill="#f4a9a0" opacity=".7"/>
      <path d="M58 36q2-6 6-4" stroke="#e6b93f" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M22 30l4 0M24 28l0 4M96 24l5 0M98.5 21.5l0 5M100 52l4 0M102 50l0 4" stroke="#e0a43c" stroke-width="2.5" stroke-linecap="round"/></g></svg>`;
}

// ---------- Zeitlogik ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function timerRemaining(w, now) { return w.endsAt !== null ? Math.max(0, w.endsAt - now) : w.remainingMs; }
function mmss(ms, ceil = true) {
  const t = ceil ? Math.ceil(ms / 1000) : Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0');
}
const swElapsed = (w, now) => w.elapsedMs + (w.startedAt === null ? 0 : Math.max(0, now - w.startedAt));
function swText(ms) {
  const hs = Math.max(0, Math.floor(ms / 10)), s = Math.floor(hs / 100), h = Math.floor(s / 3600);
  return (h ? h + ':' : '') + String(h ? Math.floor(s / 60) % 60 : Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + ',' + String(hs % 100).padStart(2, '0');
}
export const ivTotal = w => w.rounds * (w.sets * w.trainMs + (w.sets - 1) * w.pauseMs) + (w.rounds - 1) * w.roundPauseMs;
export function ivState(w, now) {
  const total = ivTotal(w), el = swElapsed(w, now);
  if (el >= total) return { stage: 'finished', round: w.rounds, set: w.sets, remaining: 0, totalRemaining: 0, phase: 'done', el, total };
  const roundDur = w.sets * w.trainMs + (w.sets - 1) * w.pauseMs, block = roundDur + w.roundPauseMs;
  const ri = Math.min(w.rounds - 1, Math.floor(el / block)), inR = el - ri * block;
  if (inR >= roundDur) return { stage: 'round-pause', round: ri + 1, set: w.sets, remaining: block - inR, totalRemaining: total - el, phase: `r${ri}`, el, total };
  const si = Math.min(w.sets - 1, Math.floor(inR / (w.trainMs + w.pauseMs))), inS = inR - si * (w.trainMs + w.pauseMs), pause = inS >= w.trainMs;
  return { stage: pause ? 'pause' : 'train', round: ri + 1, set: si + 1, remaining: (pause ? w.trainMs + w.pauseMs : w.trainMs) - inS, totalRemaining: total - el, phase: `${ri}-${si}-${pause ? 'p' : 't'}`, el, total };
}

function tick() {
  updateLive(Date.now(), true);
  raf = requestAnimationFrame(tick);
}

function updateLive(now, withSound) {
  if (!root) return;
  for (const w of scr().widgets) {
    const el = root.querySelector(`[data-wid="${CSS.escape(w.id)}"]`); if (!el) continue;
    const q = k => el.querySelector(`[data-live="${k}"]`);
    if (w.type === 'timer') {
      const rem = timerRemaining(w, now), done = w.endsAt !== null && rem <= 0, frac = w.durationMs ? rem / w.durationMs : 0;
      setText(q('time'), mmss(rem));
      el.classList.toggle('done', done);
      el.classList.toggle('low', !done && w.endsAt !== null && rem <= 10000);
      setText(q('state'), done ? 'Zeit abgelaufen' : w.endsAt !== null ? 'läuft' : rem === w.durationMs ? 'Bereit' : 'pausiert');
      const bar = q('bar'); if (bar) bar.style.width = clamp(frac * 100, 0, 100) + '%';
      const pie = q('pie'); if (pie) pie.setAttribute('d', piePath(frac));
      const fill = q('eggfill'); if (fill) { fill.setAttribute('y', 12 + (1 - frac) * 90); }
      const egg = q('egg'); if (egg) egg.classList.toggle('hatched', done);
      const key = w.id + ':' + w.endsAt;
      if (done && !fired.has(key)) { fired.add(key); if (withSound && w.sound && !muted) timerEnd(0.7); }
    } else if (w.type === 'stopwatch') {
      setText(q('sw'), swText(swElapsed(w, now)));
    } else if (w.type === 'interval') {
      const st = ivState(w, now);
      setText(q('iv'), mmss(st.remaining));
      setText(q('phase'), { train: 'Training', pause: 'Satzpause', 'round-pause': 'Rundenpause', finished: 'Geschafft!' }[st.stage]);
      setText(q('meta'), st.stage === 'finished' ? `${w.rounds} Runden · ${w.sets} Sätze` : `Runde ${st.round}/${w.rounds} · Satz ${st.set}/${w.sets}`);
      setText(q('ivtotal'), `Gesamt noch ${mmss(st.totalRemaining)} von ${mmss(st.total)}`);
      const len = st.stage === 'train' ? w.trainMs : st.stage === 'pause' ? w.pauseMs : st.stage === 'round-pause' ? w.roundPauseMs : 1;
      const bar = q('ivbar'); if (bar) bar.style.width = clamp((st.remaining / len) * 100, 0, 100) + '%';
      el.dataset.stage = st.stage;
      if (w.startedAt !== null && withSound) {
        const tones = { ...DEFAULT_INTERVAL_TONES, ...(w.tones || {}) }, vol = (w.volume ?? 70) / 100;
        const prev = lastPhase.get(w.id);
        if (prev !== undefined && prev !== st.phase && !muted) {
          play(st.stage === 'train' ? tones.start : st.stage === 'pause' ? tones.pause : st.stage === 'round-pause' ? tones.roundPause : tones.finish, vol);
        }
        lastPhase.set(w.id, st.phase);
        const sec = Math.ceil(st.remaining / 1000), cdKey = st.phase + ':' + sec;
        if (sec <= 3 && sec >= 1 && len >= 5000 && st.stage !== 'finished' && lastCount.get(w.id) !== cdKey) { lastCount.set(w.id, cdKey); if (!muted) play(tones.countdown, vol); }
        if (st.stage === 'finished') { patch(w.id, x => { x.elapsedMs = ivTotal(x); x.startedAt = null; }); }
      } else lastPhase.set(w.id, st.phase);
    }
  }
}
function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }
function piePath(frac) {
  const f = clamp(frac, 0, 1); if (f <= 0) return '';
  if (f >= 0.9999) return 'M50 8a42 42 0 1 1 -0.01 0z';
  const a = -Math.PI / 2 + f * Math.PI * 2, x = 50 + 42 * Math.cos(a), y = 50 + 42 * Math.sin(a);
  return `M50 50L50 8A42 42 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}z`;
}

// ---------- Aktionen ----------
function freeSpot(wd, ht) {
  const ws = scr().widgets, hit = (x, y) => ws.some(o => x < o.x + o.width + 12 && x + wd + 12 > o.x && y < o.y + o.height + 12 && y + ht + 12 > o.y);
  for (let y = 30; y + ht <= SCREEN_H - 10; y += 30) for (let x = 30; x + wd <= SCREEN_W - 10; x += 30) if (!hit(x, y)) return { x, y };
  const n = ws.length % 10; return { x: 40 + n * 24, y: 40 + n * 20 };
}
function addWidget(kind) {
  if (scr().widgets.length >= MAX_WIDGETS) return toast(`Höchstens ${MAX_WIDGETS} Objekte pro Bildschirm.`);
  const base = { id: uid(), label: ADD.find(a => a.kind === kind).label };
  let w;
  if (['digital', 'circle', 'egg'].includes(kind)) w = { ...base, type: 'timer', style: kind, durationMs: kind === 'egg' ? 180000 : 300000, remainingMs: kind === 'egg' ? 180000 : 300000, endsAt: null, sound: true, width: kind === 'digital' ? 340 : 280, height: kind === 'digital' ? 230 : 360 };
  else if (kind === 'qr') w = { ...base, type: 'qr', content: '', width: 280, height: 360 };
  else if (kind === 'stopwatch') w = { ...base, type: 'stopwatch', mode: 'single', elapsedMs: 0, startedAt: null, results: [], width: 340, height: 230 };
  else if (kind === 'people') w = { ...base, type: 'stopwatch', mode: 'people', elapsedMs: 0, startedAt: null, results: [], width: 340, height: 460 };
  else w = { ...base, type: 'interval', trainMs: 30000, pauseMs: 25000, sets: 12, rounds: 2, roundPauseMs: 120000, volume: 70, tones: { ...DEFAULT_INTERVAL_TONES }, elapsedMs: 0, startedAt: null, width: 340, height: 400 };
  Object.assign(w, freeSpot(w.width, w.height));
  selected = w.id;
  store.update(s => { s.screen.widgets.push(w); });
}

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  const wEl = e.target.closest('[data-wid]');
  if (wEl && selected !== wEl.dataset.wid) { selected = wEl.dataset.wid; root.querySelectorAll('.widget.selected').forEach(x => x.classList.remove('selected')); wEl.classList.add('selected'); }
  if (!b) return;
  const act = b.dataset.act, id = wEl?.dataset.wid, w = id ? wid(id) : null, now = Date.now();
  switch (act) {
    case 'add': addWidget(b.dataset.kind); break;
    case 'bg': store.update(s => { s.screen.background = b.dataset.bg; }); break;
    case 'present': toggleFullscreen(); draw(); break;
    case 'mute': muted = !muted; draw(); break;
    case 'help': helpDialog(); break;
    case 'settings': settingsDialog(w); break;
    case 'remove': {
      const backup = structuredClone(w), idx = scr().widgets.indexOf(w);
      store.update(s => { s.screen.widgets = s.screen.widgets.filter(x => x.id !== id); });
      toast(`„${backup.label || 'Objekt'}“ entfernt.`, { action: 'Rückgängig', onAction: () => store.update(s => { s.screen.widgets.splice(idx, 0, backup); }) });
      break;
    }
    case 'start':
      if (w.type === 'timer') patch(id, x => { const rem = x.remainingMs > 0 ? x.remainingMs : x.durationMs; x.remainingMs = rem; x.endsAt = now + rem; });
      else if (w.type === 'interval') patch(id, x => { if (swElapsed(x, now) >= ivTotal(x)) x.elapsedMs = 0; x.startedAt = now; lastPhase.delete(id); if (!muted) play({ ...DEFAULT_INTERVAL_TONES, ...(x.tones || {}) }.start, (x.volume ?? 70) / 100); });
      else patch(id, x => { if (x.startedAt === null) x.startedAt = now; });
      break;
    case 'pause':
      if (w.type === 'timer') patch(id, x => { x.remainingMs = timerRemaining(x, now); x.endsAt = null; if (x.remainingMs <= 0) x.remainingMs = x.durationMs; });
      else patch(id, x => { x.elapsedMs = swElapsed(x, now); x.startedAt = null; });
      break;
    case 'reset':
      if (w.type === 'timer') patch(id, x => { x.remainingMs = x.durationMs; x.endsAt = null; });
      else patch(id, x => { x.elapsedMs = 0; x.startedAt = null; });
      break;
    case 'sound': patch(id, x => { x.sound = !x.sound; }); break;
    case 'del-result': patch(id, x => { x.results = x.results.filter(r => r.id !== b.dataset.rid); }); break;
    case 'clear-results': if (await confirmDialog('Liste leeren', 'Alle gespeicherten Zeiten dieser Stoppuhr löschen?', 'Leeren')) patch(id, x => { x.results = []; }); break;
    case 'rename-result': {
      const r = w.results.find(x => x.id === b.dataset.rid);
      dialog({ title: 'Namen ändern', body: `<label class="field">Vorname oder Startnummer<input name="n" class="input" maxlength="40" value="${esc(r.name)}"></label>`,
        onSubmit: fd => patch(id, x => { const t = x.results.find(y => y.id === r.id); t.name = String(fd.get('n')).trim() || t.name; }) });
      break;
    }
  }
}

function onChange(e) {
  if (e.target.id === 'zoom') store.update(s => { s.screen.zoom = e.target.value; });
}

document.addEventListener('submit', e => {
  const f = e.target;
  if (f.dataset?.qr) {
    e.preventDefault();
    const v = String(new FormData(f).get('content') || '').trim();
    if (!v) return;
    try { qrSvg(v); } catch (ex) { return toast(ex.message, { kind: 'warn' }); }
    patch(f.dataset.qr, x => { x.content = v.slice(0, 2000); });
  } else if (f.dataset?.record) {
    e.preventDefault();
    const id = f.dataset.record, w = wid(id), now = Date.now();
    if (!w || w.startedAt === null) return;
    if (w.results.length >= MAX_RESULTS) return toast(`Höchstens ${MAX_RESULTS} Messungen pro Stoppuhr.`);
    const name = String(new FormData(f).get('name') || '').trim().split(/\s+/)[0]?.slice(0, 40) || `Person ${w.results.length + 1}`;
    patch(id, x => { x.results.push({ id: uid(), name, elapsedMs: swElapsed(x, now), recordedAt: now }); });
    requestAnimationFrame(() => { const inp = root?.querySelector(`[data-record="${CSS.escape(id)}"] input`); inp?.focus(); const ol = root?.querySelector(`[data-wid="${CSS.escape(id)}"] .results`); if (ol) ol.scrollTop = ol.scrollHeight; });
  }
});

// Ziehen und Größe ändern
function onPointerDown(e) {
  const wEl = e.target.closest('[data-wid]'); if (!wEl || e.button > 0 || isStack()) return;
  const resize = e.target.closest('[data-resize]');
  const onFree = e.target.closest('[data-drag]') || (e.pointerType !== 'touch' && e.target.closest('.w-body') && !e.target.closest('button,input,textarea,select,a,form,.results,label'));
  if (!resize && !onFree) return;
  if (e.target.closest('button')) return;
  e.preventDefault();
  const w = wid(wEl.dataset.wid), start = { x: e.clientX, y: e.clientY, wx: w.x, wy: w.y, ww: w.width, wh: w.height }, [minW, minH] = minFor(w);
  selected = w.id; wEl.classList.add('selected', 'dragging');
  wEl.setPointerCapture?.(e.pointerId);
  let nx = w.x, ny = w.y, nw = w.width, nh = w.height;
  const move = ev => {
    const dx = (ev.clientX - start.x) / scale, dy = (ev.clientY - start.y) / scale;
    if (resize) { nw = clamp(Math.round(start.ww + dx), minW, SCREEN_W - w.x); nh = clamp(Math.round(start.wh + dy), minH, SCREEN_H - w.y); wEl.style.width = nw + 'px'; wEl.style.height = nh + 'px'; }
    else { nx = clamp(Math.round(start.wx + dx), 0, SCREEN_W - w.width); ny = clamp(Math.round(start.wy + dy), 0, SCREEN_H - w.height); wEl.style.left = nx + 'px'; wEl.style.top = ny + 'px'; }
  };
  const up = () => {
    wEl.removeEventListener('pointermove', move); wEl.removeEventListener('pointerup', up); wEl.removeEventListener('pointercancel', up);
    wEl.classList.remove('dragging');
    if (nx !== w.x || ny !== w.y || nw !== w.width || nh !== w.height) patch(w.id, x => { x.x = nx; x.y = ny; x.width = nw; x.height = nh; });
  };
  wEl.addEventListener('pointermove', move); wEl.addEventListener('pointerup', up); wEl.addEventListener('pointercancel', up);
}

function onKey(e) {
  if (!selected || !e.key.startsWith('Arrow') || e.target.closest('input,textarea,select')) return;
  const w = wid(selected); if (!w) return;
  e.preventDefault();
  const step = e.altKey ? 1 : 10, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key], [minW, minH] = minFor(w);
  patch(w.id, x => {
    if (e.shiftKey) { x.width = clamp(x.width + d[0], minW, SCREEN_W - x.x); x.height = clamp(x.height + d[1], minH, SCREEN_H - x.y); }
    else { x.x = clamp(x.x + d[0], 0, SCREEN_W - x.width); x.y = clamp(x.y + d[1], 0, SCREEN_H - x.height); }
  });
  requestAnimationFrame(() => root?.querySelector(`[data-wid="${CSS.escape(w.id)}"]`)?.focus());
}

// ---------- Einstellungen ----------
const msToMin = ms => Math.floor(ms / 60000), msToSec = ms => Math.round(ms / 1000) % 60;
const durField = (name, label, ms) => `<label class="field">${label}<span class="dur"><input class="input" type="number" min="0" max="1439" name="${name}m" value="${msToMin(ms)}" aria-label="${label} Minuten"> min <input class="input" type="number" min="0" max="59" name="${name}s" value="${msToSec(ms)}" aria-label="${label} Sekunden"> s</span></label>`;
const readDur = (fd, name) => (Math.max(0, Number(fd.get(name + 'm')) || 0) * 60 + clamp(Number(fd.get(name + 's')) || 0, 0, 59)) * 1000;

function settingsDialog(w) {
  const pos = `<details class="pos"><summary>Position und Größe</summary><div class="four">${['x', 'y', 'width', 'height'].map(k => `<label class="field">${{ x: 'Links', y: 'Oben', width: 'Breite', height: 'Höhe' }[k]}<input class="input" type="number" name="${k}" value="${w[k]}"></label>`).join('')}</div></details>`;
  let body = `<label class="field">Titel<input name="label" class="input" maxlength="60" value="${esc(w.label)}"></label>`;
  if (w.type === 'timer') body += `<div class="two">${durField('dur', 'Dauer', w.durationMs)}<label class="field">Darstellung<select name="style" class="select">${[['digital', 'Digital'], ['circle', 'Kreis'], ['egg', 'Ei']].map(([v, l]) => `<option value="${v}" ${w.style === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <label class="check"><input type="checkbox" name="sound" ${w.sound ? 'checked' : ''}> Signalton am Ende</label><p class="muted small-text">Eine geänderte Dauer setzt nur diesen Timer zurück.</p>`;
  if (w.type === 'qr') body += `<label class="field">Link oder Text<textarea name="content" class="input" rows="4" maxlength="2000">${esc(w.content)}</textarea></label><p class="muted small-text">Der QR-Code wird direkt auf diesem Gerät erzeugt; der Text wird an keinen Dienst gesendet.</p>`;
  if (w.type === 'stopwatch') body += `<p class="muted small-text">${w.mode === 'people' ? 'Mehrpersonen-Stoppuhr: gemeinsame Uhr starten, für jede Person „Zeit speichern“ drücken.' : 'Einfache Stoppuhr mit Hundertstelsekunden.'}</p>`;
  if (w.type === 'interval') {
    const tones = { ...DEFAULT_INTERVAL_TONES, ...(w.tones || {}) };
    body += `<div class="two">${durField('train', 'Trainingszeit', w.trainMs)}${durField('pause', 'Pause zwischen Sätzen', w.pauseMs)}</div>
      <div class="three"><label class="field">Sätze je Runde<input class="input" type="number" min="1" max="99" name="sets" value="${w.sets}"></label><label class="field">Runden<input class="input" type="number" min="1" max="99" name="rounds" value="${w.rounds}"></label><label class="field">Lautstärke ${'<output>' + (w.volume ?? 70) + ' %</output>'}<input type="range" min="0" max="100" step="5" name="volume" value="${w.volume ?? 70}" oninput="this.previousElementSibling.value=this.value+' %'"></label></div>
      ${durField('rp', 'Rundenpause', w.roundPauseMs)}
      <details><summary>Töne auswählen und vorhören</summary><div class="tone-grid">${Object.entries(INTERVAL_TONE_LABELS).map(([k, l]) => `<label class="field">${l}<span class="tone-row"><select name="tone_${k}" class="select sm">${Object.entries(TONES).map(([id, t]) => `<option value="${id}" ${tones[k] === id ? 'selected' : ''}>${t.name}</option>`).join('')}</select><button type="button" class="icon-btn sm" data-preview="${k}" aria-label="Vorhören">${icon('play', 14)}</button></span></label>`).join('')}</div></details>
      <p class="muted small-text" data-total></p>`;
  }
  body += pos;
  dialog({ title: 'Einstellungen', body, wide: w.type === 'interval',
    onOpen: el => {
      el.querySelectorAll('[data-preview]').forEach(btn => btn.onclick = () => play(el.querySelector(`[name="tone_${btn.dataset.preview}"]`).value, Number(el.querySelector('[name=volume]').value) / 100));
      const tot = el.querySelector('[data-total]');
      if (tot) { const upd = () => { const fd = new FormData(el.querySelector('form')); const x = { trainMs: readDur(fd, 'train'), pauseMs: readDur(fd, 'pause'), sets: Math.max(1, Number(fd.get('sets')) || 1), rounds: Math.max(1, Number(fd.get('rounds')) || 1), roundPauseMs: readDur(fd, 'rp') }; tot.textContent = 'Gesamtdauer: ' + mmss(ivTotal(x)) + ' Minuten'; }; el.addEventListener('input', upd); upd(); }
    },
    onSubmit: fd => {
      const [minW, minH] = minFor(w);
      patch(w.id, x => {
        x.label = String(fd.get('label')).trim().slice(0, 60);
        x.x = clamp(Number(fd.get('x')) || 0, 0, SCREEN_W - 60); x.y = clamp(Number(fd.get('y')) || 0, 0, SCREEN_H - 60);
        if (x.type === 'timer') {
          const d = clamp(readDur(fd, 'dur'), 1000, 24 * 3600000);
          if (d !== x.durationMs) { x.durationMs = d; x.remainingMs = d; x.endsAt = null; }
          x.style = fd.get('style'); x.sound = fd.get('sound') === 'on';
        }
        if (x.type === 'qr') { const v = String(fd.get('content')).trim(); if (v) qrSvg(v); x.content = v; }
        if (x.type === 'interval') {
          const next = { trainMs: Math.max(1000, readDur(fd, 'train')), pauseMs: readDur(fd, 'pause'), sets: clamp(Number(fd.get('sets')) || 1, 1, 99), rounds: clamp(Number(fd.get('rounds')) || 1, 1, 99), roundPauseMs: readDur(fd, 'rp') };
          if (['trainMs', 'pauseMs', 'sets', 'rounds', 'roundPauseMs'].some(k => next[k] !== x[k])) { Object.assign(x, next); x.elapsedMs = 0; x.startedAt = null; }
          x.volume = clamp(Number(fd.get('volume')), 0, 100);
          x.tones = Object.fromEntries(Object.keys(INTERVAL_TONE_LABELS).map(k => [k, String(fd.get('tone_' + k))]));
        }
        const [mw, mh] = minFor(x);
        x.width = clamp(Number(fd.get('width')) || x.width, Math.max(minW, mw), SCREEN_W - x.x); x.height = clamp(Number(fd.get('height')) || x.height, Math.max(minH, mh), SCREEN_H - x.y);
      });
    } });
}

function helpDialog() {
  dialog({ title: 'Unterrichtsbildschirm – Hilfe', submit: null, cancel: 'Schließen', wide: true, body: `
    <ul class="help-list">
      <li><b>Hinzufügen:</b> Unten Timer, Stoppuhr, Intervalltimer oder QR-Code wählen (bis zu 30 Objekte).</li>
      <li><b>Verschieben:</b> Objekt an einer freien Stelle oder an der Kopfzeile ziehen – mit Maus oder Stift; mit dem Finger an der Kopfzeile. Auf dem Handy stehen die Objekte untereinander; für die freie Anordnung unten „Ansicht: Alles anzeigen“ wählen. Pfeiltasten verschieben ein ausgewähltes Objekt, Umschalt + Pfeiltaste ändert die Größe.</li>
      <li><b>Größe:</b> Die Ecke unten rechts ziehen oder im Zahnrad Breite und Höhe eingeben.</li>
      <li><b>Timer:</b> Am Zahnrad Titel, Dauer, Darstellung (Digital, Kreis, Ei) und Signalton einstellen. Laufende Timer behalten ihre Endzeit auch nach dem Neuladen.</li>
      <li><b>Mehrpersonen-Stoppuhr:</b> Uhr starten, optional Vorname oder Startnummer eintragen und „Zeit speichern“ drücken. Die Uhr läuft weiter.</li>
      <li><b>Intervalltimer:</b> Trainingszeit, Satzpause, Sätze, Runden, Rundenpause, Lautstärke und Töne einstellen. Die Phasen wechseln automatisch.</li>
      <li><b>Töne:</b> Der Browser spielt Töne nur, solange die Seite geöffnet und das Gerät nicht gesperrt ist. Mit „Töne an/aus“ schaltest du alle Signale stumm.</li>
      <li><b>Präsentieren:</b> „Große Ansicht“ blendet alles andere aus. Mit Esc oder „Ansicht verkleinern“ zurück.</li>
    </ul>` });
}

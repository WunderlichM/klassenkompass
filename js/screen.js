// Bereich Bildschirm: frei anordnbare Timer, Stoppuhren, Intervalltimer und QR-Codes
import * as store from './store.js';
import { SCREEN_H, SCREEN_W, SCREEN_W_WIDE } from './store.js';
import { uid } from './engine.js';
import { esc, icon, dialog, confirmDialog, toast, toggleFullscreen, downloadFile, todayISO } from './ui.js';
import { qrSvg } from './qr.js';
import * as hall from './hall.js';
import { petIndex, petSvg, petText } from './hatch.js';
import { play, scheduleEnd, endToneSeconds, endToneId, previewEnd, stopPreview, END_TONES, TONES, DEFAULT_INTERVAL_TONES, INTERVAL_TONE_LABELS } from './sound.js';
import * as extra from './widgets.js';

const MAX_WIDGETS = 30, MAX_RESULTS = 200, MAX_LAYOUTS = 12;
const ADD = [
  { kind: 'digital', label: 'Digitaler Timer', ic: 'clock' },
  { kind: 'circle', label: 'Kreistimer', ic: 'reset' },
  { kind: 'egg', label: 'Ei-Timer', ic: 'egg' },
  { kind: 'qr', label: 'QR-Code', ic: 'qr' },
  { kind: 'stopwatch', label: 'Stoppuhr', ic: 'stopwatch' },
  { kind: 'people', label: 'Mehrpersonen-Stoppuhr', ic: 'users' },
  { kind: 'interval', label: 'Intervalltimer', ic: 'repeat' },
  { kind: 'hall', label: 'Hallenplan', ic: 'hall' },
];
const MIN = { ...extra.MIN, hall: [260, 200], qr: [220, 300], stopwatch: [280, 210], people: [300, 380], interval: [300, 370], circle: [240, 320], egg: [240, 320], digital: [280, 210] };
const minFor = w => MIN[w.type === 'timer' ? w.style : w.type === 'stopwatch' && w.mode === 'people' ? 'people' : w.type] || [220, 200];
// Objekte mit Countdown (Timer, Anzeigetafel mit Spielzeit) und mit Phasen (Intervalltimer, Stationen)
const isTimer = w => w.type === 'timer' || (w.type === 'score' && w.timed);
const isPhased = w => w.type === 'interval' || w.type === 'stations';
const allAdd = [...ADD, ...extra.ADD];

let root = null, raf = 0, selected = null, scale = 1, muted = false;
const alarms = new Map(); // eingeplante Endtöne je Timer: Schlüssel id:endsAt → Wiedergabe
const lastPhase = new Map(), lastCount = new Map();

const scr = () => store.get().screen;
// Bühnenbreite: 16:9 oder – auf Breitbildschirmen ab etwa 2:1 (z. B. 3440 × 1440) – 21:9. Wird je Gerät erkannt,
// nicht eingestellt. Liegen Objekte weiter rechts (an einem Breitbildschirm angeordnet), wächst die Bühne mit.
const deviceWide = () => { const a = Math.max(screen.width, screen.height), b = Math.min(screen.width, screen.height) || 1; return a / b >= 2; };
const W = () => Math.min(SCREEN_W_WIDE, Math.max(deviceWide() ? SCREEN_W_WIDE : SCREEN_W, ...scr().widgets.map(w => w.x + w.width)));
// Ansicht (Zoom) gilt nur für dieses Gerät und wird nicht abgeglichen; Standard: Automatisch
const ZOOM_KEY = 'klassenkompass.screenZoom', ZOOMS = ['auto', 'fit', '0.5', '0.75', '1', '1.25', '1.5'];
let zoom = (() => { try { const z = localStorage.getItem(ZOOM_KEY); return ZOOMS.includes(z) ? z : 'auto'; } catch { return 'auto'; } })();
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
  addEventListener('orientationchange', fitSoon);
  window.visualViewport?.addEventListener('resize', fit);
  draw();
  raf = requestAnimationFrame(tick);
  return () => { off(); cancelAnimationFrame(raf); keepAwake(false); removeEventListener('resize', fit); removeEventListener('orientationchange', fitSoon); window.visualViewport?.removeEventListener('resize', fit); el.onclick = el.onchange = el.onpointerdown = el.onkeydown = null; root = null; };
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
      <div class="stage" id="stage" style="width:${W()}px;height:${SCREEN_H}px">${s.widgets.map(widgetHtml).join('')}
        ${s.widgets.length ? '' : '<div class="stage-empty">Füge unten ein Objekt hinzu, z. B. einen Timer, die Zufallsauswahl oder eine Auftragskarte.</div>'}</div>
    </div>
    <div class="dock no-present">
      ${[ADD, extra.ADD].map(row => `<div class="add-row">${row.map(a => `<button class="add-btn" data-act="add" data-kind="${a.kind}">${icon(a.ic, 18)}<span>${a.label}</span></button>`).join('')}</div>`).join('')}
      <div class="dock-row">
        <span class="muted small-text dock-hint">Objekte an freien Stellen ziehen · Ecke für die Größe · Pfeiltasten zum Verschieben</span><span class="muted small-text stack-hint">Auf dem Handy stehen alle Objekte groß untereinander; „Große Ansicht“ füllt den ganzen Bildschirm. Die freie Anordnung zeigen PC und Tablet.</span>
        <button class="btn ghost sm" data-act="layouts" title="Anordnungen speichern und wieder laden, z. B. Ankommen, Arbeitsphase, Aufräumen">${icon('layers', 15)} Vorlagen${s.layouts?.length ? ` <span class="badge">${s.layouts.length}</span>` : ''}</button>
        <span class="swatches" role="group" aria-label="Hintergrund">${['mint', 'paper', 'night'].map(b => `<button class="swatch sw-${b} ${s.background === b ? 'on' : ''}" data-act="bg" data-bg="${b}" title="${{ mint: 'Mint', paper: 'Papier', night: 'Nacht' }[b]}"></button>`).join('')}</span>
        <label class="small-text" title="Gilt nur für dieses Gerät. Das Format (16:9 oder 21:9) passt sich dem Bildschirm automatisch an.">Ansicht <select class="select sm" id="zoom">${[['auto', 'Automatisch'], ['fit', 'Alles anzeigen'], ['0.5', '50 %'], ['0.75', '75 %'], ['1', '100 %'], ['1.25', '125 %'], ['1.5', '150 %']].map(([v, l]) => `<option value="${v}" ${zoom === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
    </div>
  </section>`;
  fit();
  root.querySelectorAll('.hall-mini').forEach(hall.hydrateSvg);
  updateLive(Date.now(), false);
}

// Handy: Objekte groß untereinander statt verkleinerter 16:9-Bühne – immer, unabhängig von der
// (mitsynchronisierten) Ansicht-Einstellung des PCs; in der großen Ansicht füllen sie den Bildschirm.
const isStack = () => root?.querySelector('#stage-wrap')?.classList.contains('stack');
const isTouch = () => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const isPhone = () => isTouch() && Math.min(innerWidth, innerHeight) < 600;
// Unterer Sicherheitsabstand (Home-Balken am iPad/iPhone), gemessen statt geschätzt
let insetProbe = null;
function bottomInset() {
  if (!insetProbe) { insetProbe = document.createElement('div'); insetProbe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-bottom,0px)'; document.body.append(insetProbe); }
  return insetProbe.offsetHeight || 0;
}
let fitTimer = 0;
function fitSoon() { clearTimeout(fitTimer); fit(); fitTimer = setTimeout(fit, 350); }

function fit() {
  const wrap = root?.querySelector('#stage-wrap'), stage = root?.querySelector('#stage'); if (!wrap || !stage) return;
  const z = zoom, availW = wrap.clientWidth;
  const presenting = document.body.classList.contains('presenting');
  // Tablett hochkant in der großen Ansicht: Objekte groß untereinander statt einer kleinen 16:9-Bühne
  const stack = isPhone() || (availW < 640 && (z === 'auto' || presenting)) || (presenting && isTouch() && innerHeight > innerWidth);
  wrap.classList.toggle('stack', stack);
  root.querySelector('.screen')?.classList.toggle('stacked', stack);
  if (stack) {
    scale = 1; stage.style.transform = 'none'; stage.style.marginLeft = '0'; wrap.style.height = ''; wrap.classList.remove('scroll-x');
    return;
  }
  const vh = window.visualViewport?.height || innerHeight;
  const top = wrap.getBoundingClientRect().top + (window.scrollY || 0);
  const availH = presenting ? vh - top - Math.max(12, bottomInset()) - 2 : Math.max(320, vh - wrap.getBoundingClientRect().top - 150);
  if (z === 'fit' || presenting) scale = Math.min(availW / W(), availH / SCREEN_H);
  else if (z === 'auto') scale = Math.max(0.4, Math.min(availW / W(), 1.6, innerWidth >= 1800 ? availH / SCREEN_H : Infinity));
  else scale = Number(z) || 1;
  stage.style.transform = `scale(${scale})`;
  wrap.style.height = SCREEN_H * scale + 'px';
  wrap.classList.toggle('scroll-x', W() * scale > availW + 1);
  stage.style.marginLeft = W() * scale < availW ? (availW - W() * scale) / 2 + 'px' : '0';
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
      ${w.results.length ? `<p class="sw-links"><button class="link small-text" data-act="csv-results">${icon('download', 13)} Als Tabelle (CSV)</button><button class="link small-text" data-act="clear-results">Liste leeren</button></p>` : ''}`, 'stopwatch people');
    return frame(w, `<div class="time big" data-live="sw"></div>${ctrl(w, running)}`, 'stopwatch');
  }
  if (w.type === 'interval') {
    const running = w.startedAt !== null;
    return frame(w, `<p class="phase" data-live="phase"></p><div class="time big" data-live="iv"></div><p class="iv-meta" data-live="meta"></p><div class="bar"><span data-live="ivbar"></span></div>${ctrl(w, running)}<p class="w-state" data-live="ivtotal"></p>`, 'interval');
  }
  if (w.type === 'hall') {
    const p = w.planId ? hall.planById(w.planId) : null;
    return frame(w, p ? `<div class="hall-mini">${hall.boardSvg(p, { crop: true })}</div>`
      : `<div class="hall-pick"><p class="muted small-text">${w.planId ? 'Dieser Hallenplan wurde gelöscht.' : 'Welcher Hallenplan soll hier stehen?'}</p><button class="btn primary sm" data-act="settings">${icon('hall', 15)} Hallenplan wählen</button><p class="muted small-text">Hallenpläne zeichnest du im Bereich Hallenpläne.</p></div>`, 'hall');
  }
  if (extra.TYPES.includes(w.type)) { const [inner, cls] = extra.html(w, { ctrl }); return frame(w, inner, cls); }
  return '';
}

function eggSvg() {
  // eigenes, schlichtes Motiv: Ei bekommt mit der Zeit immer mehr Risse und bricht am Ende auf;
  // heraus schaut jedes Mal ein anderes Tier (js/hatch.js)
  return `<svg viewBox="0 0 120 120" class="egg-svg">
    <g class="egg-whole"><path d="M60 12c20 0 34 32 34 54a34 34 0 0 1-68 0c0-22 14-54 34-54z" fill="#fbf3df" stroke="#e2cfa3" stroke-width="2"/>
      <g class="cracks" data-live="cracks"><path class="crack" pathLength="1" data-crack="0.02,0.4" d="M61 58l-6 6-5-6-6 6-6-5-6 6-5-2"/><path class="crack" pathLength="1" data-crack="0.12,0.52" d="M61 58l6 6 6-6 6 6 6-5 6 3"/><path class="crack" pathLength="1" data-crack="0.3,0.66" d="M50 58l2-8-4-6 1-7"/><path class="crack" pathLength="1" data-crack="0.42,0.76" d="M73 58l-1-9 5-5-2-8"/><path class="crack" pathLength="1" data-crack="0.52,0.84" d="M38 64l3 8-4 7"/><path class="crack" pathLength="1" data-crack="0.6,0.88" d="M79 64l-2 8 4 7"/><path class="crack" pathLength="1" data-crack="0.72,0.94" d="M49 37l-6-4-1-7"/><path class="crack" pathLength="1" data-crack="0.78,0.97" d="M76 41l6-5 0-7"/></g></g>
    <g class="egg-open"><g transform="translate(0 -4)"><g class="egg-chick" data-live="pet"></g></g>
      <path class="egg-bottom" d="M30 76l8-8 8 8 8-8 8 8 8-8 8 8 8-8 4 4a34 34 0 0 1-68 4z" fill="#fbf3df" stroke="#e2cfa3" stroke-width="2"/>
      <path class="egg-cap" d="M28 64c2-24 15-52 32-52s30 28 32 52l-5-4-6 6-6-6-6 6-6-6-6 6-6-6-6 6-6-6-6 6z" fill="#fbf3df" stroke="#e2cfa3" stroke-width="2" stroke-linejoin="round"/>
      <path class="egg-sparks" d="M22 30l4 0M24 28l0 4M96 24l5 0M98.5 21.5l0 5M100 52l4 0M102 50l0 4" stroke="#e0a43c" stroke-width="2.5" stroke-linecap="round"/></g></svg>`;
}

// Risse: jeder Riss wächst in seinem Abschnitt der Laufzeit (0 = Start, 1 = Ende) von 0 bis zur vollen Länge
function setCracks(g, p) {
  for (const c of g.children) {
    const [a, b] = c.dataset.crack.split(',').map(Number), v = clamp((p - a) / (b - a), 0, 1);
    c.style.strokeDashoffset = 1 - v; c.style.opacity = v > 0 ? 1 : 0;
  }
}

// Endtöne: für jeden laufenden Timer mit Ton im Voraus einplanen, bei Pause, Zurücksetzen, Ton aus oder Entfernen sofort stoppen.
// Dazu der Vorwarnton (leise, einstellbar) – ebenfalls im Voraus, damit er auch im Hintergrund erklingt.
const toneOf = w => ({ tone: endToneId(w.tone), volume: (w.volume ?? 90) / 100, repeats: w.repeats ?? 2 });
function syncAlarms(now) {
  const want = new Map();
  for (const w of scr().widgets) {
    if (!isTimer(w) || w.endsAt === null || !w.sound || muted) continue;
    const opt = toneOf(w), warnMs = (Number(w.warn) || 0) * 1000;
    if (now - w.endsAt <= endToneSeconds(opt.tone, opt.repeats) * 1000) want.set(w.id + ':' + w.endsAt + ':' + opt.tone + opt.volume + opt.repeats, { at: w.endsAt, opt }); // sonst längst abgelaufen (z. B. nach dem Neuladen)
    if (warnMs && w.durationMs > warnMs + 5000 && w.endsAt - warnMs > now - 800) want.set(w.id + ':' + w.endsAt + ':warn' + warnMs, { at: w.endsAt - warnMs, opt: { tone: 'warn', volume: opt.volume * 0.7, repeats: 1 } });
  }
  for (const [key, a] of alarms) if (!want.has(key)) { a?.stop(); alarms.delete(key); }
  for (const [key, { at, opt }] of want) {
    if (alarms.has(key)) continue;
    const a = scheduleEnd((at - now) / 1000, opt);
    if (a) alarms.set(key, a); // sonst (Ton noch gesperrt) beim nächsten Bild erneut versuchen
  }
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
  const now = Date.now();
  updateLive(now, true);
  syncAlarms(now);
  keepAwake(anyRunning(now));
  raf = requestAnimationFrame(tick);
}

// ---------- Bildschirm anlassen, solange etwas läuft (Screen Wake Lock) ----------
let wakeLock = null, wakePending = false, wakeRetryAt = 0;
function anyRunning(now) {
  return scr().widgets.some(w => isTimer(w) ? w.endsAt !== null && w.endsAt > now
    : isPhased(w) ? w.startedAt !== null && ivState(w, now).stage !== 'finished'
    : w.type === 'stopwatch' ? w.startedAt !== null : extra.wantsFrame(w));
}
// Läuft gerade etwas? (für die automatische App-Sperre)
export const busy = () => anyRunning(Date.now());
function keepAwake(want) {
  if (!('wakeLock' in navigator)) return;
  const held = wakeLock && !wakeLock.released;
  if (want && !held && !wakePending && Date.now() >= wakeRetryAt && document.visibilityState === 'visible') {
    wakePending = true;
    navigator.wakeLock.request('screen').then(l => { wakeLock = l; }).catch(() => { wakeRetryAt = Date.now() + 15000; }).finally(() => { wakePending = false; });
  } else if (!want && held) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

function updateLive(now, withSound) {
  if (!root) return;
  for (const w of scr().widgets) {
    const el = root.querySelector(`[data-wid="${CSS.escape(w.id)}"]`); if (!el) continue;
    const q = k => el.querySelector(`[data-live="${k}"]`);
    if (w.type === 'score') {
      if (!w.timed) continue;
      const rem = timerRemaining(w, now), done = w.endsAt !== null && rem <= 0;
      setText(q('time'), mmss(rem));
      el.classList.toggle('done', done); el.classList.toggle('low', !done && w.endsAt !== null && rem <= 10000);
      setText(q('state'), done ? 'Abpfiff' : w.endsAt !== null ? 'läuft' : rem === w.durationMs ? 'Bereit' : 'unterbrochen');
    } else if (w.type === 'timer') {
      const rem = timerRemaining(w, now), done = w.endsAt !== null && rem <= 0, frac = w.durationMs ? rem / w.durationMs : 0;
      setText(q('time'), mmss(rem));
      el.classList.toggle('done', done);
      el.classList.toggle('low', !done && w.endsAt !== null && rem <= 10000);
      const pet = done && w.style === 'egg' ? petIndex(w.id, w.endsAt) : -1;
      setText(q('state'), pet >= 0 ? petText(pet) : done ? 'Zeit abgelaufen' : w.endsAt !== null ? 'läuft' : rem === w.durationMs ? 'Bereit' : 'pausiert');
      const petEl = q('pet'); if (petEl && pet >= 0 && petEl.dataset.pet !== String(pet)) { petEl.dataset.pet = pet; petEl.innerHTML = petSvg(pet); }
      const bar = q('bar'); if (bar) bar.style.width = clamp(frac * 100, 0, 100) + '%';
      const pie = q('pie'); if (pie) pie.setAttribute('d', piePath(frac));
      const cracks = q('cracks'); if (cracks) setCracks(cracks, rem === w.durationMs ? 0 : 1 - frac);
      const egg = q('egg'); if (egg) { egg.classList.toggle('hatched', done); egg.classList.toggle('wobble', !done && w.endsAt !== null && rem <= 10000); }
    } else if (w.type === 'stopwatch') {
      setText(q('sw'), swText(swElapsed(w, now)));
    } else if (isPhased(w)) {
      const st = ivState(w, now);
      setText(q('iv'), mmss(st.remaining));
      if (w.type === 'stations') extra.live(w, el, q, now, { withSound, muted, st });
      else {
        setText(q('phase'), { train: 'Training', pause: 'Satzpause', 'round-pause': 'Rundenpause', finished: 'Geschafft!' }[st.stage]);
        setText(q('meta'), st.stage === 'finished' ? `${w.rounds} Runden · ${w.sets} Sätze` : `Runde ${st.round}/${w.rounds} · Satz ${st.set}/${w.sets}`);
      }
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
    } else if (extra.TYPES.includes(w.type)) extra.live(w, el, q, now, { withSound, muted });
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
  for (let y = 30; y + ht <= SCREEN_H - 10; y += 30) for (let x = 30; x + wd <= W() - 10; x += 30) if (!hit(x, y)) return { x, y };
  const n = ws.length % 10; return { x: 40 + n * 24, y: 40 + n * 20 };
}
function addWidget(kind) {
  if (scr().widgets.length >= MAX_WIDGETS) return toast(`Höchstens ${MAX_WIDGETS} Objekte pro Bildschirm.`);
  const base = { id: uid(), label: allAdd.find(a => a.kind === kind).label };
  let w;
  if (['digital', 'circle', 'egg'].includes(kind)) w = { ...base, type: 'timer', style: kind, durationMs: kind === 'egg' ? 180000 : 300000, remainingMs: kind === 'egg' ? 180000 : 300000, endsAt: null, sound: true, width: kind === 'digital' ? 340 : 280, height: kind === 'digital' ? 230 : 360 };
  else if (kind === 'qr') w = { ...base, type: 'qr', content: '', width: 280, height: 360 };
  else if (kind === 'stopwatch') w = { ...base, type: 'stopwatch', mode: 'single', elapsedMs: 0, startedAt: null, results: [], width: 340, height: 230 };
  else if (kind === 'people') w = { ...base, type: 'stopwatch', mode: 'people', elapsedMs: 0, startedAt: null, results: [], width: 340, height: 460 };
  else if (extra.TYPES.includes(kind)) w = { ...base, ...extra.create(kind) };
  else if (kind === 'hall') { const list = hall.planList(), p = list.find(x => x.id === store.get().sport.activeHall) || list[0]; w = { ...base, type: 'hall', planId: p?.id ?? null, label: p?.title || 'Hallenplan', width: 500, height: 350 }; }
  else w = { ...base, type: 'interval', trainMs: 30000, pauseMs: 25000, sets: 12, rounds: 2, roundPauseMs: 120000, volume: 70, tones: { ...DEFAULT_INTERVAL_TONES }, elapsedMs: 0, startedAt: null, width: 340, height: 400 };
  Object.assign(w, freeSpot(w.width, w.height));
  selected = w.id;
  store.update(s => { s.screen.widgets.push(w); });
  // Handy: neues Objekt sichtbar machen, weil es in der Liste irgendwo einsortiert wird
  if (isStack()) requestAnimationFrame(() => root?.querySelector(`[data-wid="${CSS.escape(w.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
}

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  const wEl = e.target.closest('[data-wid]');
  if (wEl && selected !== wEl.dataset.wid) { selected = wEl.dataset.wid; root.querySelectorAll('.widget.selected').forEach(x => x.classList.remove('selected')); wEl.classList.add('selected'); }
  if (!b) return;
  const act = b.dataset.act, id = wEl?.dataset.wid, w = id ? wid(id) : null, now = Date.now();
  if (extra.click(act, w, b)) return;
  switch (act) {
    case 'layouts': layoutsDialog(); break;
    case 'csv-results': {
      const rows = [['Platz', 'Name', 'Zeit', 'Sekunden'], ...w.results.map((r, i) => [i + 1, r.name, swText(r.elapsedMs), (r.elapsedMs / 1000).toFixed(2).replace('.', ',')])];
      downloadFile(`Zeiten-${w.label || 'Stoppuhr'}-${todayISO()}.csv`.replace(/[\\/:*?"<>|]/g, '_'), '\ufeff' + rows.map(l => l.map(v => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
      break;
    }
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
      if (isTimer(w)) patch(id, x => { const rem = x.remainingMs > 0 ? x.remainingMs : x.durationMs; x.remainingMs = rem; x.endsAt = now + rem; });
      else if (isPhased(w)) patch(id, x => { if (swElapsed(x, now) >= ivTotal(x)) x.elapsedMs = 0; x.startedAt = now; lastPhase.delete(id); if (!muted) play({ ...DEFAULT_INTERVAL_TONES, ...(x.tones || {}) }.start, (x.volume ?? 70) / 100); });
      else patch(id, x => { if (x.startedAt === null) x.startedAt = now; });
      break;
    case 'pause':
      if (isTimer(w)) patch(id, x => { x.remainingMs = timerRemaining(x, now); x.endsAt = null; if (x.remainingMs <= 0) x.remainingMs = x.durationMs; });
      else patch(id, x => { x.elapsedMs = swElapsed(x, now); x.startedAt = null; });
      break;
    case 'reset':
      if (isTimer(w)) patch(id, x => { x.remainingMs = x.durationMs; x.endsAt = null; });
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
  if (e.target.id === 'zoom') { zoom = ZOOMS.includes(e.target.value) ? e.target.value : 'auto'; try { localStorage.setItem(ZOOM_KEY, zoom); } catch {} fit(); }
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
  const onFree = e.target.closest('[data-drag]') || (e.pointerType !== 'touch' && e.target.closest('.w-body') && !e.target.closest('button,input,textarea,select,a,form,.results,label,.bd-svg,.bd-bar'));
  if (!resize && !onFree) return;
  if (e.target.closest('button')) return;
  e.preventDefault();
  const w = wid(wEl.dataset.wid), start = { x: e.clientX, y: e.clientY, wx: w.x, wy: w.y, ww: w.width, wh: w.height }, [minW, minH] = minFor(w);
  selected = w.id; wEl.classList.add('selected', 'dragging');
  wEl.setPointerCapture?.(e.pointerId);
  let nx = w.x, ny = w.y, nw = w.width, nh = w.height;
  const move = ev => {
    const dx = (ev.clientX - start.x) / scale, dy = (ev.clientY - start.y) / scale;
    if (resize) { nw = clamp(Math.round(start.ww + dx), minW, W() - w.x); nh = clamp(Math.round(start.wh + dy), minH, SCREEN_H - w.y); wEl.style.width = nw + 'px'; wEl.style.height = nh + 'px'; }
    else { nx = clamp(Math.round(start.wx + dx), 0, W() - w.width); ny = clamp(Math.round(start.wy + dy), 0, SCREEN_H - w.height); wEl.style.left = nx + 'px'; wEl.style.top = ny + 'px'; }
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
    if (e.shiftKey) { x.width = clamp(x.width + d[0], minW, W() - x.x); x.height = clamp(x.height + d[1], minH, SCREEN_H - x.y); }
    else { x.x = clamp(x.x + d[0], 0, W() - x.width); x.y = clamp(x.y + d[1], 0, SCREEN_H - x.height); }
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
    ${toneFields(w)}<p class="muted small-text">Eine geänderte Dauer setzt nur diesen Timer zurück.</p>`;
  if (w.type === 'qr') body += `<label class="field">Link oder Text<textarea name="content" class="input" rows="4" maxlength="2000">${esc(w.content)}</textarea></label><p class="muted small-text">Der QR-Code wird direkt auf diesem Gerät erzeugt; der Text wird an keinen Dienst gesendet.</p>`;
  if (w.type === 'hall') { const list = hall.planList(); body += list.length ? `<label class="field">Hallenplan<select name="plan" class="select">${list.map(p => `<option value="${esc(p.id)}" ${p.id === w.planId ? 'selected' : ''}>${esc(p.title)}</option>`).join('')}</select></label><p class="muted small-text">Bearbeiten im Bereich Hallenpläne; Änderungen erscheinen hier sofort.</p>` : '<p class="muted">Noch kein Hallenplan. Lege einen im Bereich Hallenpläne an.</p>'; }
  if (w.type === 'stopwatch') body += `<p class="muted small-text">${w.mode === 'people' ? 'Mehrpersonen-Stoppuhr: gemeinsame Uhr starten, für jede Person „Zeit speichern“ drücken.' : 'Einfache Stoppuhr mit Hundertstelsekunden.'}</p>`;
  if (w.type === 'interval') {
    const tones = { ...DEFAULT_INTERVAL_TONES, ...(w.tones || {}) };
    body += `<div class="two">${durField('train', 'Trainingszeit', w.trainMs)}${durField('pause', 'Pause zwischen Sätzen', w.pauseMs)}</div>
      <div class="three"><label class="field">Sätze je Runde<input class="input" type="number" min="1" max="99" name="sets" value="${w.sets}"></label><label class="field">Runden<input class="input" type="number" min="1" max="99" name="rounds" value="${w.rounds}"></label><label class="field">Lautstärke ${'<output>' + (w.volume ?? 70) + ' %</output>'}<input type="range" min="0" max="100" step="5" name="volume" value="${w.volume ?? 70}" oninput="this.previousElementSibling.value=this.value+' %'"></label></div>
      ${durField('rp', 'Rundenpause', w.roundPauseMs)}
      <details><summary>Töne auswählen und vorhören</summary><div class="tone-grid">${Object.entries(INTERVAL_TONE_LABELS).map(([k, l]) => `<label class="field">${l}<span class="tone-row"><select name="tone_${k}" class="select sm">${Object.entries(TONES).map(([id, t]) => `<option value="${id}" ${tones[k] === id ? 'selected' : ''}>${t.name}</option>`).join('')}</select><button type="button" class="icon-btn sm" data-preview="${k}" aria-label="Vorhören">${icon('play', 14)}</button></span></label>`).join('')}</div></details>
      <p class="muted small-text" data-total></p>`;
  }
  const ex = extra.TYPES.includes(w.type) ? extra.settings(w, { durField, readDur, toneFields, readTone }) : null;
  if (ex) body += ex.body;
  body += pos;
  const d = dialog({ title: 'Einstellungen', body, wide: w.type === 'interval' || !!ex?.wide,
    onOpen: el => {
      bindTone(el); ex?.onOpen?.(el);
      el.querySelectorAll('[data-preview]').forEach(btn => btn.onclick = () => play(el.querySelector(`[name="tone_${btn.dataset.preview}"]`).value, Number(el.querySelector('[name=volume]').value) / 100));
      const tot = el.querySelector('[data-total]');
      if (tot) { const upd = () => { const fd = new FormData(el.querySelector('form')); const x = { trainMs: readDur(fd, 'train'), pauseMs: readDur(fd, 'pause'), sets: Math.max(1, Number(fd.get('sets')) || 1), rounds: Math.max(1, Number(fd.get('rounds')) || 1), roundPauseMs: readDur(fd, 'rp') }; tot.textContent = 'Gesamtdauer: ' + mmss(ivTotal(x)) + ' Minuten'; }; el.addEventListener('input', upd); upd(); }
    },
    onSubmit: fd => {
      const [minW, minH] = minFor(w);
      patch(w.id, x => {
        x.label = String(fd.get('label')).trim().slice(0, 60);
        x.x = clamp(Number(fd.get('x')) || 0, 0, W() - 60); x.y = clamp(Number(fd.get('y')) || 0, 0, SCREEN_H - 60);
        if (x.type === 'timer') {
          const d = clamp(readDur(fd, 'dur'), 1000, 24 * 3600000);
          if (d !== x.durationMs) { x.durationMs = d; x.remainingMs = d; x.endsAt = null; }
          x.style = fd.get('style'); readTone(fd, x);
        }
        ex?.apply(fd, x);
        if (x.type === 'hall' && fd.get('plan')) { const prevTitle = hall.planById(x.planId)?.title; x.planId = String(fd.get('plan')); const t = hall.planById(x.planId)?.title; if (t && (!x.label || x.label === prevTitle || x.label === 'Hallenplan')) x.label = t.slice(0, 60); }
        if (x.type === 'qr') { const v = String(fd.get('content')).trim(); if (v) qrSvg(v); x.content = v; }
        if (x.type === 'interval') {
          const next = { trainMs: Math.max(1000, readDur(fd, 'train')), pauseMs: readDur(fd, 'pause'), sets: clamp(Number(fd.get('sets')) || 1, 1, 99), rounds: clamp(Number(fd.get('rounds')) || 1, 1, 99), roundPauseMs: readDur(fd, 'rp') };
          if (['trainMs', 'pauseMs', 'sets', 'rounds', 'roundPauseMs'].some(k => next[k] !== x[k])) { Object.assign(x, next); x.elapsedMs = 0; x.startedAt = null; }
          x.volume = clamp(Number(fd.get('volume')), 0, 100);
          x.tones = Object.fromEntries(Object.keys(INTERVAL_TONE_LABELS).map(k => [k, String(fd.get('tone_' + k))]));
        }
        const [mw, mh] = minFor(x);
        x.width = clamp(Number(fd.get('width')) || x.width, Math.max(minW, mw), W() - x.x); x.height = clamp(Number(fd.get('height')) || x.height, Math.max(minH, mh), SCREEN_H - x.y);
      });
    } });
  d.el.addEventListener('close', stopPreview);
}

// Endton eines Timers: Auswahl mit Probehören, Lautstärke, Wiederholungen und Vorwarnton
const WARNS = [[0, 'Aus'], [30, '30 Sekunden vorher'], [60, '1 Minute vorher'], [120, '2 Minuten vorher'], [300, '5 Minuten vorher']];
function toneFields(w) {
  const cur = endToneId(w.tone), vol = w.volume ?? 90, rep = w.repeats ?? 2;
  return `<label class="check"><input type="checkbox" name="sound" ${w.sound ? 'checked' : ''}> Ton am Ende</label>
    <div class="two"><label class="field">Endton<span class="tone-row"><select name="tone" class="select">${Object.entries(END_TONES).filter(([, t]) => !t.hidden).map(([id, t]) => `<option value="${id}" ${cur === id ? 'selected' : ''}>${t.name} – ${t.hint}</option>`).join('')}</select><button type="button" class="icon-btn sm" data-end-test aria-label="Probehören" title="Probehören">${icon('play', 14)}</button></span></label>
    <label class="field">Lautstärke <output>${vol} %</output><input type="range" min="10" max="100" step="5" name="volume" value="${vol}" oninput="this.previousElementSibling.value=this.value+' %'"></label></div>
    <div class="two"><label class="field">Wie oft?<select name="repeats" class="select">${[1, 2, 3].map(n => `<option value="${n}" ${rep === n ? 'selected' : ''}>${n} Mal</option>`).join('')}</select></label>
    <label class="field">Vorwarnton <small class="muted">(leise)</small><select name="warn" class="select">${WARNS.map(([v, l]) => `<option value="${v}" ${(Number(w.warn) || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>`;
}
function readTone(fd, x) {
  x.sound = fd.get('sound') === 'on'; x.tone = endToneId(String(fd.get('tone'))); x.volume = clamp(Number(fd.get('volume')) || 90, 10, 100);
  x.repeats = clamp(Number(fd.get('repeats')) || 1, 1, 3); x.warn = WARNS.some(([v]) => v === Number(fd.get('warn'))) ? Number(fd.get('warn')) : 0;
}
function bindTone(el) {
  const btn = el.querySelector('[data-end-test]'); if (!btn) return;
  btn.onclick = () => previewEnd({ tone: el.querySelector('[name=tone]').value, volume: Number(el.querySelector('[name=volume]').value) / 100 });
}

// ---------- Vorlagen: Anordnungen des Bildschirms speichern und wieder laden ----------
// Beim Laden beginnen Timer, Stoppuhren und Intervalle von vorn; Inhalte (Aufträge, Dienste, Punkte) bleiben wie gespeichert.
function freshCopy(w) {
  const x = { ...structuredClone(w), id: uid() };
  if ('endsAt' in x) { x.endsAt = null; x.remainingMs = x.durationMs; }
  if ('startedAt' in x) { x.startedAt = null; x.elapsedMs = 0; }
  return x;
}
function layoutsDialog() {
  const list = () => scr().layouts || [];
  const rows = () => list().map(l => `<li><span class="name"><b>${esc(l.name)}</b> <small class="muted">${l.widgets.length} ${l.widgets.length === 1 ? 'Objekt' : 'Objekte'}</small></span>
    <button type="button" class="btn primary sm" data-l="load" data-id="${esc(l.id)}">Laden</button><button type="button" class="icon-btn sm" data-l="save" data-id="${esc(l.id)}" title="Mit der jetzigen Anordnung überschreiben" aria-label="Überschreiben">${icon('download', 15)}</button><button type="button" class="icon-btn sm" data-l="del" data-id="${esc(l.id)}" title="Löschen" aria-label="Löschen">${icon('trash', 15)}</button></li>`).join('') || '<li class="muted">Noch keine Vorlage gespeichert.</li>';
  const snap = () => ({ background: scr().background, widgets: scr().widgets.map(freshCopy) });
  dialog({ title: 'Vorlagen für den Bildschirm', submit: 'Speichern', cancel: 'Schließen', body: `
    <ul class="manage-list" data-list>${rows()}</ul>
    <label class="field">Jetzige Anordnung speichern als<input name="name" class="input" maxlength="40" placeholder="z. B. Arbeitsphase Technik"></label>
    <p class="muted small-text">Eine Vorlage merkt sich alle Objekte mit Platz, Größe und Einstellungen. „Laden“ ersetzt den jetzigen Bildschirm; Timer beginnen dabei von vorn.</p>`,
    onOpen: (el, close) => el.addEventListener('click', async e => {
      const b = e.target.closest('[data-l]'); if (!b) return;
      const l = list().find(x => x.id === b.dataset.id); if (!l) return;
      if (b.dataset.l === 'load') {
        close();
        const before = { background: scr().background, widgets: scr().widgets };
        store.update(s => { s.screen.background = l.background; s.screen.widgets = l.widgets.map(freshCopy); });
        toast(`Vorlage „${l.name}“ geladen.`, { action: 'Rückgängig', onAction: () => store.update(s => { s.screen.background = before.background; s.screen.widgets = before.widgets; }) });
      } else if (b.dataset.l === 'save') { store.update(s => { Object.assign(s.screen.layouts.find(x => x.id === l.id), snap()); }); el.querySelector('[data-list]').innerHTML = rows(); toast(`„${l.name}“ überschrieben.`); }
      else { close(); if (await confirmDialog('Vorlage löschen', `Die Vorlage „${l.name}“ löschen? Der jetzige Bildschirm bleibt, wie er ist.`)) store.update(s => { s.screen.layouts = s.screen.layouts.filter(x => x.id !== l.id); }); }
    }),
    onSubmit: fd => {
      const name = String(fd.get('name')).trim().slice(0, 40); if (!name) throw new Error('Bitte einen Namen für die Vorlage eingeben.');
      if (!scr().widgets.length) throw new Error('Der Bildschirm ist leer – erst Objekte hinzufügen.');
      if (list().length >= MAX_LAYOUTS && !list().some(l => l.name === name)) throw new Error(`Höchstens ${MAX_LAYOUTS} Vorlagen. Bitte eine löschen oder überschreiben.`);
      store.update(s => { s.screen.layouts ||= []; const old = s.screen.layouts.find(l => l.name === name); if (old) Object.assign(old, snap()); else s.screen.layouts.push({ id: uid(), name, ...snap() }); });
      toast(`Vorlage „${name}“ gespeichert.`);
    } });
}

function helpDialog() {
  dialog({ title: 'Unterrichtsbildschirm – Hilfe', submit: null, cancel: 'Schließen', wide: true, body: `
    <ul class="help-list">
      <li><b>Hinzufügen:</b> Unten ein Objekt wählen (bis zu 30). Obere Reihe: Timer, Stoppuhren, QR-Code und Hallenplan; untere Reihe: Zufallsauswahl, Arbeitsform, Auftragskarte, Stundenablauf, Ruhezeichen, Dienste, Hilfe-Warteliste, Anzeigetafel, Stationen und Tafel.</li>
      <li><b>Verschieben:</b> Objekt an einer freien Stelle oder an der Kopfzeile ziehen – mit Maus oder Stift; mit dem Finger an der Kopfzeile. Auf dem Handy stehen die Objekte untereinander; für die freie Anordnung unten „Ansicht: Alles anzeigen“ wählen. Am Tablett hochkant stehen die Objekte in der großen Ansicht ebenfalls groß untereinander. Pfeiltasten verschieben ein ausgewähltes Objekt, Umschalt + Pfeiltaste ändert die Größe.</li>
      <li><b>Größe:</b> Die Ecke unten rechts ziehen oder im Zahnrad Breite und Höhe eingeben.</li>
      <li><b>Timer:</b> Am Zahnrad Titel, Dauer, Darstellung (Digital, Kreis, Ei) und den Endton einstellen: Klangschale (Standard), Glockenspiel, Windspiel, Gong, Wecker oder Pfiff – mit Probehören, Lautstärke, Wiederholungen und leisem Vorwarnton. Beim Ei-Timer schlüpft am Ende jedes Mal ein anderes Tier – echte und erfundene. Laufende Timer behalten ihre Endzeit auch nach dem Neuladen.</li>
      <li><b>Mehrpersonen-Stoppuhr:</b> Uhr starten, optional Vorname oder Startnummer eintragen und „Zeit speichern“ drücken. Die Uhr läuft weiter. Die Zeiten gibt es auch als Tabelle (CSV).</li>
      <li><b>Zufallsauswahl:</b> Zieht ein Kind (oder mehrere) aus einer Lerngruppe, aus den Tieren des Kartenquiz oder aus Nummern – ohne Wiederholung, bis alle dran waren. Kinder, die im Bereich Gruppen als „fehlt heute“ markiert sind, werden übersprungen.</li>
      <li><b>Arbeitsform:</b> Zeigt groß Stille, Flüstern, Partnerarbeit, Gruppenarbeit oder „Alle hören zu“. Am Zahnrad lässt sich eine Lautstärke-Ampel mit dem Mikrofon zuschalten; es wird nichts aufgenommen.</li>
      <li><b>Auftragskarte:</b> Pflicht, Zusatz, Material und Hilfe – bleibt die ganze Arbeitsphase sichtbar.</li>
      <li><b>Stundenablauf:</b> Phasen mit Minuten; die laufende Phase ist hervorgehoben („noch 12 min · dann: Aufräumen“).</li>
      <li><b>Ruhezeichen:</b> Ein Knopf, der sofort einen Ton spielt (Standard: Klangschale).</li>
      <li><b>Dienste:</b> Verteilt Dienste reihum; „Weiter“ gibt sie an die nächsten Kinder.</li>
      <li><b>Hilfe-Warteliste:</b> Du trägst ein, wer Hilfe braucht; der Haken entfernt das Kind, die nächsten rücken auf.</li>
      <li><b>Anzeigetafel:</b> Spielstand für zwei Teams, auf Wunsch mit Spielzeit und Schlusspfiff.</li>
      <li><b>Stationen:</b> Zeit je Station und Wechselzeit; die Tabelle zeigt, welche Gruppe an welcher Station ist und wohin sie wechselt – auf Wunsch mit Hallenplan daneben.</li>
      <li><b>Tafel:</b> Schreiben und Malen mit Stift, Finger oder Maus – fünf Farben, drei Strichstärken, Radierer (Striche antippen), „zurück“ und „wischen“. Hintergrund am Zahnrad: Weiß, Tafelgrün, liniert oder kariert. Verschieben an der Kopfzeile.</li>
      <li><b>Vorlagen:</b> Unten „Vorlagen“ speichert die jetzige Anordnung unter einem Namen (z. B. Ankommen, Arbeitsphase, Aufräumen) und lädt sie wieder.</li>
      <li><b>Hallenplan:</b> Zeigt einen Plan aus dem Bereich Hallenpläne, z. B. neben dem Intervalltimer. Am Zahnrad den Plan wählen.</li>
      <li><b>Intervalltimer:</b> Trainingszeit, Satzpause, Sätze, Runden, Rundenpause, Lautstärke und Töne einstellen. Die Phasen wechseln automatisch.</li>
      <li><b>Töne:</b> Der Browser spielt Töne nur, solange die Seite geöffnet und das Gerät nicht gesperrt ist. Mit „Töne an/aus“ schaltest du alle Signale stumm. Läuft auf dem Gerät Musik (Spotify, YouTube), kann die App sie bei Signalen leiser stellen oder kurz anhalten: Zahnrad oben rechts → „Musik bei Signalen“.</li>
      <li><b>Präsentieren:</b> „Große Ansicht“ blendet alles andere aus. Mit Esc oder „Ansicht verkleinern“ zurück.</li>
      <li><b>Ansicht und Format:</b> „Ansicht“ gilt nur für dieses Gerät (Standard: Automatisch). Das Format passt sich dem Bildschirm selbst an: 16:9, an Breitbildschirmen (z. B. 3440 × 1440) 21:9.</li>
    </ul>` });
}

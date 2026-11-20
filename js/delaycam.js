// Bereich Delay-Cam: Kamerabild mit einstellbarer Verzögerung zeigen (z. B. Sport: Bewegung ausführen, umdrehen, sich selbst sehen).
// Wiederholung in Zeitlupe, Einzelbilder, Spiegeln, Kamerawechsel. Nichts wird gespeichert oder übertragen:
// die Bilder liegen nur im Arbeitsspeicher und werden beim Beenden verworfen.
import { esc, icon, toast } from './ui.js';

const KEY = 'klassenkompass.delaycam';
const DELAYS = [2, 3, 5, 8, 10, 15, 20, 30];
const MIN_DELAY = 1, MAX_DELAY = 60;
const REPLAY_EXTRA = 10;            // Sekunden, die zusätzlich zur Verzögerung für die Wiederholung im Puffer bleiben
const MEM_CAP = 220 * 1024 * 1024;  // höchstens so viel Bilddaten im Arbeitsspeicher
const QUALITY = { hd: { label: 'Scharf (720p)', h: 720, q: 0.72 }, sd: { label: 'Sparsam (480p)', h: 480, q: 0.68 } };
const SPEEDS = [0.25, 0.5, 1];

const defaults = () => ({ delay: 5, facing: 'environment', mirror: false, quality: 'hd', fps: 30, live: false });
let prefs = load();
function load() { try { return { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return defaults(); } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} }
const clampDelay = v => Math.max(MIN_DELAY, Math.min(MAX_DELAY, Math.round(Number(v) * 2) / 2 || 5));
const fmt = s => (Math.round(s * 10) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 });

let root = null, cam = null;

// Läuft gerade eine Delay-Cam? (App-Sperre wartet dann)
export const busy = () => !!cam;

export function mount(el) {
  root = el;
  el.onclick = onClick;
  el.onchange = onChange;
  el.oninput = onInput;
  draw();
  return () => { cam?.close(); el.onclick = el.onchange = el.oninput = null; root = null; };
}

function draw() {
  if (!root) return;
  const ok = !!navigator.mediaDevices?.getUserMedia;
  root.innerHTML = `
  <section class="page dcam-page">
    <div class="page-head">
      <div>
        <p class="eyebrow">Delay-Cam · Sport</p>
        <h1>Delay-Cam<span class="dot">.</span></h1>
        <p class="sub">Bewegung ausführen, umdrehen – und sich mit Verzögerung selbst sehen.</p>
      </div>
    </div>
    <div class="dcam-grid">
      <div class="card dcam-setup">
        <h3>${icon('clock', 16)} Verzögerung</h3>
        <div class="dcam-delay"><b data-v="delay">${fmt(prefs.delay)}</b><span>Sekunden</span></div>
        <input type="range" class="dcam-range" name="delay" min="${MIN_DELAY}" max="${MAX_DELAY}" step="0.5" value="${prefs.delay}" aria-label="Verzögerung in Sekunden">
        <div class="dcam-chips" role="group" aria-label="Schnellwahl">${DELAYS.map(d => `<button type="button" class="chip${d === prefs.delay ? ' on' : ''}" data-delay="${d}">${d} s</button>`).join('')}</div>
        <div class="dcam-opts">
          <div class="field-label">Kamera</div>
          <div class="seg" role="group" aria-label="Kamera">${[['environment', 'Rückkamera'], ['user', 'Frontkamera']].map(([v, l]) => `<button type="button" data-facing="${v}" class="${prefs.facing === v ? 'on' : ''}" aria-pressed="${prefs.facing === v}">${l}</button>`).join('')}</div>
          <label class="check"><input type="checkbox" name="mirror" ${prefs.mirror ? 'checked' : ''}> Bild spiegeln (wie ein Spiegel – bei der Frontkamera üblich)</label>
          <label class="check"><input type="checkbox" name="live" ${prefs.live ? 'checked' : ''}> Live-Bild klein in der Ecke zeigen</label>
          <div class="two">
            <label class="field">Bildqualität<select class="select" name="quality">${Object.entries(QUALITY).map(([k, q]) => `<option value="${k}" ${prefs.quality === k ? 'selected' : ''}>${esc(q.label)}</option>`).join('')}</select></label>
            <label class="field">Bilder pro Sekunde<select class="select" name="fps">${[30, 15].map(f => `<option value="${f}" ${prefs.fps === f ? 'selected' : ''}>${f}${f === 30 ? ' (flüssig)' : ' (ältere Geräte)'}</option>`).join('')}</select></label>
          </div>
        </div>
        ${ok ? `<button type="button" class="btn primary big full" data-act="start">${icon('camera', 20)} Delay-Cam starten</button>`
          : `<div class="notice">Dieser Browser kann nicht auf die Kamera zugreifen. Bitte einen aktuellen Browser (Chrome, Safari, Edge, Firefox) verwenden und die Seite über https öffnen.</div>`}
      </div>
      <div class="card dcam-help">
        <h3>${icon('bulb', 16)} So geht's</h3>
        <ol class="help-list steps">
          <li>Tablet oder Handy auf ein Stativ, eine Bank oder an die Wand stellen – Kamera zur Übungsstelle, Bildschirm dorthin, wo die Kinder nach der Übung hinschauen.</li>
          <li>Verzögerung so wählen, dass Übung plus Rückweg hineinpasst (Rolle oder Wurf: etwa 5–8 s, Anlauf mit Sprung: 10–15 s).</li>
          <li>Starten. Bis die Verzögerung erreicht ist, siehst du das Live-Bild zum Ausrichten; dann läuft das verzögerte Bild ohne Unterbrechung.</li>
          <li><b>Pause</b> hält das Bild an: mit dem Regler durch die letzten Sekunden fahren, Einzelbilder vor und zurück, in Zeitlupe abspielen. <b>Weiter</b> startet die Verzögerung neu.</li>
        </ol>
        <p class="muted small-text"><b>Tasten:</b> Leertaste Pause/Weiter · ← → Einzelbild · + − Verzögerung · F Vollbild · Esc Beenden</p>
        <div class="notice dcam-privacy">${icon('lock', 14)}<span>Es wird <b>nichts aufgenommen, gespeichert oder übertragen</b>. Die Bilder liegen nur kurz im Arbeitsspeicher dieses Geräts und sind beim Beenden weg. Bitte trotzdem nur zeigen, wenn alle im Bild einverstanden sind.</span></div>
      </div>
    </div>
  </section>`;
}

function setDelay(v) {
  prefs.delay = clampDelay(v); save();
  if (!root) return;
  const b = root.querySelector('[data-v=delay]'); if (b) b.textContent = fmt(prefs.delay);
  const r = root.querySelector('input[name=delay]'); if (r && Number(r.value) !== prefs.delay) r.value = prefs.delay;
  root.querySelectorAll('[data-delay]').forEach(c => c.classList.toggle('on', Number(c.dataset.delay) === prefs.delay));
}

function onClick(e) {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.delay) return setDelay(t.dataset.delay);
  if (t.dataset.facing) {
    prefs.facing = t.dataset.facing; prefs.mirror = prefs.facing === 'user'; save(); draw(); return;
  }
  if (t.dataset.act === 'start') start();
}
function onInput(e) { if (e.target.name === 'delay') setDelay(e.target.value); }
function onChange(e) {
  const n = e.target.name;
  if (n === 'mirror' || n === 'live') { prefs[n] = e.target.checked; save(); }
  else if (n === 'quality') { prefs.quality = QUALITY[e.target.value] ? e.target.value : 'hd'; save(); }
  else if (n === 'fps') { prefs.fps = Number(e.target.value) === 15 ? 15 : 30; save(); }
}

function start() {
  if (cam) return;
  cam = openCam({ onClose: () => { cam = null; draw(); } });
}

// ---------- Laufende Delay-Cam (Vollbild-Ebene) ----------
function openCam({ onClose }) {
  const el = document.createElement('div');
  el.className = 'dcam';
  el.tabIndex = -1;
  el.innerHTML = `
    <canvas class="dcam-view"></canvas>
    <video class="dcam-live" playsinline muted autoplay></video>
    <div class="dcam-top">
      <div class="dcam-badge" data-s="badge"><span class="dcam-dot"></span><b data-s="state">Kamera wird gestartet …</b><small data-s="info"></small></div>
      <div class="dcam-top-btns">
        <button type="button" class="dcam-btn" data-c="switch" title="Kamera wechseln" aria-label="Kamera wechseln">${icon('repeat', 20)}</button>
        <button type="button" class="dcam-btn" data-c="mirror" title="Spiegeln" aria-label="Bild spiegeln"><svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18"/><path d="M8 7 3 12l5 5z"/><path d="M16 7l5 5-5 5z"/></svg></button>
        <button type="button" class="dcam-btn" data-c="pip" title="Live-Bild in der Ecke" aria-label="Live-Bild in der Ecke ein/aus">${icon('screen', 20)}</button>
        <button type="button" class="dcam-btn" data-c="full" title="Vollbild (F)" aria-label="Vollbild">${icon('expand', 20)}</button>
        <button type="button" class="dcam-btn done" data-c="close" title="Beenden (Esc)">${icon('x', 20)}<span>Beenden</span></button>
      </div>
    </div>
    <div class="dcam-fill" data-s="fill" hidden><div class="dcam-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg" data-s="ring"/></svg><b data-s="count"></b></div><p>Verzögerung startet gleich – jetzt Kamera ausrichten</p></div>
    <div class="dcam-msg" data-s="msg"></div>
    <div class="dcam-bottom">
      <div class="dcam-replay" data-s="replay" hidden>
        <input type="range" class="dcam-scrub" data-s="scrub" min="0" max="1000" value="1000" step="1" aria-label="Position in der Wiederholung">
        <div class="dcam-replay-row">
          <span class="dcam-time" data-s="time"></span>
          <div class="dcam-speeds" role="group" aria-label="Geschwindigkeit">${SPEEDS.map(s => `<button type="button" class="dcam-chip${s === 1 ? ' on' : ''}" data-speed="${s}">${s === 1 ? '1×' : String(s).replace('.', ',') + '×'}</button>`).join('')}</div>
        </div>
      </div>
      <div class="dcam-btns">
        <div class="dcam-stepper" data-s="stepper">
          <button type="button" class="dcam-btn" data-c="less" aria-label="Verzögerung kürzer">−</button>
          <span><b data-s="delay"></b><small>Verzögerung</small></span>
          <button type="button" class="dcam-btn" data-c="more" aria-label="Verzögerung länger">+</button>
        </div>
        <button type="button" class="dcam-btn" data-c="prev" aria-label="Einzelbild zurück" hidden>${icon('back', 22)}</button>
        <button type="button" class="dcam-btn wide main" data-c="pause">${icon('pause', 20)}<span>Pause</span></button>
        <button type="button" class="dcam-btn" data-c="next" aria-label="Einzelbild vor" hidden>${icon('forward', 22)}</button>
      </div>
    </div>`;
  document.body.append(el);
  document.body.classList.add('dcam-on');
  el.focus({ preventScroll: true });

  const $ = k => el.querySelector(`[data-s=${k}]`);
  const view = el.querySelector('.dcam-view'), vctx = view.getContext('2d');
  const video = el.querySelector('.dcam-live');
  const grab = document.createElement('canvas'), gctx = grab.getContext('2d');

  let running = true, stream = null, wake = null, raf = 0, hideT = 0;
  let frames = [], bytes = 0, inflight = 0, lastGrab = 0, startedAt = 0;
  let paused = false, replayT = 0, replayPlay = false, speed = 1, lastTick = 0;
  let shown = null, shownBmp = null, decoding = false, devices = [], deviceId = '', facing = prefs.facing;
  let memWarned = false, reqId = 0;

  // --- Puffer ---
  const clear = () => { frames = []; bytes = 0; shown = null; startedAt = performance.now(); };
  const keepMs = () => (prefs.delay + REPLAY_EXTRA) * 1000;
  function trim(now) {
    if (paused) return;   // während der Pause nichts verwerfen (es wird auch nichts aufgenommen)
    const limit = now - keepMs() - 500;
    while (frames.length > 2 && (frames[0].t < limit || bytes > MEM_CAP)) {
      if (bytes > MEM_CAP && frames[0].t >= limit && !memWarned) { memWarned = true; toast('Speicher knapp: Die Verzögerung ist kürzer als eingestellt. Bildqualität „Sparsam“ oder 15 Bilder/s wählen.', { kind: 'warn' }); }
      bytes -= frames.shift().blob.size;
    }
  }
  // letztes Bild mit Zeit ≤ t (binäre Suche); -1 = keins
  function indexAt(t) {
    let lo = 0, hi = frames.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (frames[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  }
  function capture(now) {
    if (paused || video.readyState < 2 || !video.videoWidth) return;
    if (now - lastGrab < 1000 / prefs.fps - 4 || inflight > 2) return;
    lastGrab = now;
    const q = QUALITY[prefs.quality] || QUALITY.hd, vw = video.videoWidth, vh = video.videoHeight;
    const sc = Math.min(1, q.h / Math.min(vw, vh));
    const w = Math.round(vw * sc), h = Math.round(vh * sc);
    if (grab.width !== w || grab.height !== h) { grab.width = w; grab.height = h; }
    gctx.drawImage(video, 0, 0, w, h);
    inflight++;
    const id = reqId;
    grab.toBlob(blob => {
      inflight--;
      if (!running || !blob || id !== reqId || paused) return;
      frames.push({ t: now, blob }); bytes += blob.size;
      trim(performance.now());
    }, 'image/jpeg', q.q);
  }

  // --- Anzeige ---
  function fitCanvas() {
    const dpr = Math.min(2, devicePixelRatio || 1), w = Math.round(el.clientWidth * dpr), h = Math.round(el.clientHeight * dpr);
    if (view.width !== w || view.height !== h) { view.width = w; view.height = h; if (shownBmp) paint(shownBmp); }
  }
  function paint(bmp) {
    const W = view.width, H = view.height, s = Math.min(W / bmp.width, H / bmp.height), w = bmp.width * s, h = bmp.height * s;
    vctx.fillStyle = '#000'; vctx.fillRect(0, 0, W, H);
    vctx.save();
    if (prefs.mirror) { vctx.translate(W, 0); vctx.scale(-1, 1); }
    vctx.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
    vctx.restore();
  }
  function show(f) {
    if (!f || f === shown || decoding) return;
    decoding = true;
    const fr = f;
    createImageBitmap(fr.blob).then(bmp => {
      decoding = false;
      if (!running) { bmp.close?.(); return; }
      shownBmp?.close?.(); shownBmp = bmp; shown = fr; paint(bmp);
    }).catch(() => { decoding = false; });
  }

  function tick(now) {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const dt = lastTick ? Math.min(100, now - lastTick) : 0; lastTick = now;
    fitCanvas();
    capture(now);
    if (!paused) {
      trim(now);
      const target = now - prefs.delay * 1000, i = indexAt(target);
      const filling = i < 0 || now - startedAt < prefs.delay * 1000;
      el.classList.toggle('filling', filling);
      $('fill').hidden = !filling || !stream;
      if (filling && stream) {
        const left = Math.max(0, prefs.delay - (now - startedAt) / 1000), p = 1 - left / prefs.delay;
        $('count').textContent = Math.ceil(left);
        $('ring').style.strokeDashoffset = String(326.7 * (1 - Math.min(1, p)));
      } else show(frames[i]);
      setState(filling ? 'Puffer füllt sich' : `−${fmt(prefs.delay)} s`, filling ? 'Live-Bild zum Ausrichten' : 'verzögert');
    } else if (frames.length) {
      const t0 = frames[0].t, t1 = frames[frames.length - 1].t;
      if (replayPlay) {
        replayT += dt * speed;
        if (replayT >= t1) { replayT = t1; replayPlay = false; syncPlay(); }
      }
      replayT = Math.max(t0, Math.min(t1, replayT));
      show(frames[Math.max(0, indexAt(replayT))]);
      const scrub = $('scrub');
      if (document.activeElement !== scrub) scrub.value = String(Math.round(t1 > t0 ? (replayT - t0) / (t1 - t0) * 1000 : 1000));
      $('time').textContent = `${fmt((replayT - t1) / 1000)} s · Bild ${indexAt(replayT) + 1}/${frames.length}`;
    }
  }
  let lastState = '';
  function setState(s, info) {
    const k = s + '|' + info; if (k === lastState) return; lastState = k;
    $('state').textContent = s; $('info').textContent = info;
  }

  // --- Bedienung ---
  function syncDelay() { $('delay').textContent = fmt(prefs.delay) + ' s'; }
  function syncPlay() {
    const b = el.querySelector('[data-c=pause]');
    if (!paused) b.innerHTML = `${icon('pause', 20)}<span>Pause</span>`;
    else b.innerHTML = replayPlay ? `${icon('pause', 20)}<span>Anhalten</span>` : `${icon('play', 20)}<span>Abspielen</span>`;
  }
  function setPaused(on) {
    if (on === paused) return;
    if (on && !frames.length) return;
    paused = on; replayPlay = false;
    el.classList.toggle('paused', on);
    $('replay').hidden = !on; $('stepper').hidden = on;
    el.querySelector('[data-c=prev]').hidden = el.querySelector('[data-c=next]').hidden = !on;
    let resume = el.querySelector('[data-c=resume]');
    if (on) {
      // Wiederholung beginnt beim zuletzt gezeigten (verzögerten) Bild
      replayT = shown ? shown.t : frames[frames.length - 1].t;
      setState('Pause', 'Wiederholung – nichts wird aufgenommen');
      if (!resume) {
        resume = document.createElement('button'); resume.type = 'button'; resume.className = 'dcam-btn resume'; resume.dataset.c = 'resume';
        resume.innerHTML = `${icon('reset', 18)}<span>Weiter mit Verzögerung</span>`;
        el.querySelector('.dcam-btns').append(resume);
      }
    } else {
      resume?.remove();
      reqId++; clear();   // Verzögerung neu aufbauen: sonst kämen alte Bilder von vor der Pause
    }
    syncPlay(); poke();
  }
  function step(d) {
    if (!paused || !frames.length) return;
    replayPlay = false; syncPlay();
    const i = Math.max(0, Math.min(frames.length - 1, indexAt(replayT) + d));
    replayT = frames[i].t;
  }
  function changeDelay(d) {
    if (paused) return;
    const v = d > 0 ? DELAYS.find(x => x > prefs.delay) ?? prefs.delay + 5
      : [...DELAYS].reverse().find(x => x < prefs.delay) ?? prefs.delay - 1;
    prefs.delay = clampDelay(v); save(); syncDelay();
    // Länger als der Puffer reicht: Live-Bild mit Countdown, bis genug Bilder da sind
    if (frames.length) startedAt = frames[0].t;
    poke();
  }
  function setPip(on) {
    prefs.live = on; save();
    el.classList.toggle('pip', on);
    el.querySelector('[data-c=pip]').classList.toggle('on', on);
  }
  function setMirror(on) {
    prefs.mirror = on; save();
    el.classList.toggle('mirror', on);
    el.querySelector('[data-c=mirror]').classList.toggle('on', on);
    if (shownBmp) paint(shownBmp);
  }

  // Bedienleisten nach einigen Sekunden ohne Berührung ausblenden (Bild frei für die Klasse)
  function poke() {
    el.classList.remove('idle');
    clearTimeout(hideT);
    hideT = setTimeout(() => { if (running && !paused && !el.querySelector(':focus-visible.dcam-scrub')) el.classList.add('idle'); }, 4000);
  }
  el.addEventListener('pointermove', poke);
  el.addEventListener('pointerdown', poke);

  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.speed) {
      speed = Number(b.dataset.speed);
      el.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x === b));
      if (paused && !replayPlay) { replayPlay = true; if (frames.length && replayT >= frames[frames.length - 1].t) replayT = frames[0].t; syncPlay(); }
      return;
    }
    const c = b.dataset.c;
    if (c === 'close') close();
    else if (c === 'pause') {
      if (!paused) setPaused(true);
      else { replayPlay = !replayPlay; if (replayPlay && frames.length && replayT >= frames[frames.length - 1].t) replayT = frames[0].t; syncPlay(); }
    }
    else if (c === 'resume') setPaused(false);
    else if (c === 'prev') step(-1);
    else if (c === 'next') step(1);
    else if (c === 'less') changeDelay(-1);
    else if (c === 'more') changeDelay(1);
    else if (c === 'pip') setPip(!prefs.live);
    else if (c === 'mirror') setMirror(!prefs.mirror);
    else if (c === 'switch') switchCam();
    else if (c === 'full') fullscreen();
  });
  $('scrub').addEventListener('input', e => {
    if (!paused || !frames.length) return;
    replayPlay = false; syncPlay();
    const t0 = frames[0].t, t1 = frames[frames.length - 1].t;
    replayT = t0 + (t1 - t0) * Number(e.target.value) / 1000;
  });
  const onKey = e => {
    if (e.target.closest?.('input, select, textarea') && e.key !== 'Escape') return;
    const k = e.key;
    if (k === 'Escape') { if (document.fullscreenElement) return; e.preventDefault(); close(); }
    else if (k === ' ' || k === 'k') { e.preventDefault(); el.querySelector('[data-c=pause]').click(); }
    else if (k === 'ArrowLeft') { e.preventDefault(); if (!paused) setPaused(true); step(-1); }
    else if (k === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (k === '+' || k === 'ArrowUp') { e.preventDefault(); changeDelay(1); }
    else if (k === '-' || k === 'ArrowDown') { e.preventDefault(); changeDelay(-1); }
    else if (k === 'Enter' && paused) { e.preventDefault(); setPaused(false); }
    else if (k === 'f' || k === 'F') { e.preventDefault(); fullscreen(); }
    else return;
    poke();
  };
  document.addEventListener('keydown', onKey);

  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else (el.requestFullscreen?.() || document.documentElement.requestFullscreen?.())?.catch?.(() => {});
  }

  // --- Kamera ---
  async function openStream() {
    const q = QUALITY[prefs.quality] || QUALITY.hd;
    const video = { width: { ideal: q.h === 720 ? 1280 : 854 }, height: { ideal: q.h }, frameRate: { ideal: prefs.fps } };
    if (deviceId) video.deviceId = { exact: deviceId }; else video.facingMode = { ideal: facing };
    return navigator.mediaDevices.getUserMedia({ audio: false, video });
  }
  async function startStream() {
    $('msg').textContent = 'Kamera wird gestartet …';
    stream?.getTracks().forEach(t => t.stop()); stream = null;
    let s;
    try { s = await openStream(); }
    catch (e) {
      if (deviceId) { deviceId = ''; try { s = await openStream(); } catch (e2) { e = e2; } }
      if (!s) {
        $('msg').innerHTML = `Kein Zugriff auf die Kamera. ${e?.name === 'NotAllowedError' ? 'Bitte die Kamera für diese Seite erlauben (Schloss-Symbol in der Adressleiste) und erneut starten.' : 'Ist eine Kamera vorhanden und nicht von einer anderen App belegt?'}`;
        setState('Keine Kamera', '');
        return;
      }
    }
    if (!running) { s.getTracks().forEach(t => t.stop()); return; }
    stream = s;
    video.srcObject = s;
    await video.play().catch(() => {});
    $('msg').textContent = '';
    reqId++; clear();
    const set = s.getVideoTracks()[0]?.getSettings?.() || {};
    if (set.deviceId) deviceId = set.deviceId;
    if (set.facingMode) facing = set.facingMode;
    try { devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'); } catch { devices = []; }
    el.querySelector('[data-c=switch]').hidden = devices.length < 2;
  }
  async function switchCam() {
    if (devices.length < 2) return;
    const i = devices.findIndex(d => d.deviceId === deviceId);
    deviceId = devices[(i + 1) % devices.length].deviceId;
    if (paused) setPaused(false);
    await startStream();
    // Frontkamera meist gespiegelt gewünscht
    const f = stream?.getVideoTracks()[0]?.getSettings?.().facingMode;
    if (f) { prefs.facing = f === 'user' ? 'user' : 'environment'; setMirror(f === 'user'); }
  }
  async function keepAwake() {
    try { if (document.visibilityState === 'visible' && (!wake || wake.released)) wake = await navigator.wakeLock?.request('screen'); } catch {}
  }
  const onVis = () => {
    if (document.visibilityState === 'visible') {
      keepAwake();
      if (!paused) { reqId++; clear(); }   // im Hintergrund liefert die Kamera keine Bilder – Verzögerung neu aufbauen
    }
  };
  document.addEventListener('visibilitychange', onVis);
  addEventListener('resize', fitCanvas);

  function close() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf); clearTimeout(hideT);
    stream?.getTracks().forEach(t => t.stop());
    wake?.release?.().catch(() => {});
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    removeEventListener('resize', fitCanvas);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    shownBmp?.close?.(); shownBmp = null; frames = []; bytes = 0;
    el.remove(); document.body.classList.remove('dcam-on');
    onClose?.();
  }

  syncDelay(); setPip(prefs.live); setMirror(prefs.mirror); syncPlay(); poke();
  fitCanvas();
  raf = requestAnimationFrame(tick);
  startStream().then(keepAwake);
  return { close };
}

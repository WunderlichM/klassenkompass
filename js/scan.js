// Scanner: Kamera öffnen, Antwortkarten laufend erkennen und Antworten melden.
// provider liefert den Stand (Frage, Klasse, Antworten) und nimmt Antworten und Befehle entgegen:
//   provider.state() → { title, index, total, text, options, reveal, roster: [{ card, name }], answers: { card: idx } } | null
//   provider.answer(card, idx), provider.command('prev' | 'next' | 'reveal'), provider.subscribe(fn) → abmelden
import { detectCards, toGray } from './detect.js';
import { esc, icon, toast } from './ui.js';
import { LETTERS } from './cards.js';

const PROC_MAX = 1280; // längste Bildseite für die Erkennung

export async function openScanner(provider, { onClose } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) { toast('Dieser Browser kann nicht auf die Kamera zugreifen.', { kind: 'warn' }); return; }
  const el = document.createElement('div');
  el.className = 'scan';
  el.innerHTML = `
    <video playsinline muted autoplay></video>
    <canvas class="scan-overlay"></canvas>
    <div class="scan-top">
      <div class="scan-q"><small data-s="title"></small><b data-s="text"></b></div>
      <div class="scan-count"><b data-s="count">0</b><small data-s="of"></small></div>
    </div>
    <div class="scan-msg" data-s="msg">Kamera wird gestartet …</div>
    <div class="scan-bottom">
      <p class="scan-missing" data-s="missing"></p>
      <div class="scan-btns">
        <button type="button" class="scan-btn" data-c="prev" aria-label="Vorherige Frage">${icon('back', 22)}</button>
        <button type="button" class="scan-btn wide" data-c="reveal">${icon('chart', 20)}<span>Auflösen</span></button>
        <button type="button" class="scan-btn" data-c="next" aria-label="Nächste Frage">${icon('forward', 22)}</button>
        <button type="button" class="scan-btn done" data-c="close">${icon('check', 20)}<span>Fertig</span></button>
      </div>
    </div>`;
  document.body.append(el);
  document.body.classList.add('scanning');
  const video = el.querySelector('video'), overlay = el.querySelector('.scan-overlay'), octx = overlay.getContext('2d');
  const $ = k => el.querySelector(`[data-s=${k}]`);
  const proc = document.createElement('canvas'), pctx = proc.getContext('2d', { willReadFrequently: true });
  let stream = null, running = true, gray = null, lastKey = '', wake = null, dets = [], off = null;
  const seen = new Map(); // card → { idx, streak, t }

  const close = () => {
    if (!running) return; running = false;
    stream?.getTracks().forEach(t => t.stop());
    wake?.release?.().catch(() => {});
    off?.();
    el.remove(); document.body.classList.remove('scanning');
    onClose?.();
  };
  el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { const c = b.dataset.c; if (c === 'close') close(); else provider.command(c); });

  const render = () => {
    const st = provider.state();
    if (!st) { close(); return; }
    const key = st.sessionId + ':' + st.index;
    if (key !== lastKey) { lastKey = key; seen.clear(); }
    $('title').textContent = `${st.title} · Frage ${st.index + 1}/${st.total}`;
    $('text').textContent = st.text || 'Frage ohne Text';
    const ans = st.answers || {}, roster = st.roster || [];
    const done = roster.filter(r => ans[r.card] !== undefined).length;
    $('count').textContent = done; $('of').textContent = `/ ${roster.length} erfasst`;
    const miss = roster.filter(r => ans[r.card] === undefined);
    $('missing').innerHTML = !roster.length ? '' : miss.length ? `<span>Fehlt:</span> ${miss.slice(0, 40).map(r => esc(r.name)).join(', ')}` : `${icon('check', 14)} Alle erfasst`;
    const rv = el.querySelector('[data-c=reveal] span'); rv.textContent = st.reveal ? 'Verbergen' : 'Auflösen';
    el.querySelector('[data-c=prev]').disabled = st.index <= 0;
    el.querySelector('[data-c=next]').disabled = st.index >= st.total - 1;
  };
  off = provider.subscribe(render);
  render();
  if (!running) return { close };

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
  } catch (e) {
    $('msg').innerHTML = `Kein Zugriff auf die Kamera. ${e?.name === 'NotAllowedError' ? 'Bitte die Kamera für diese Seite erlauben (Schloss-Symbol in der Adressleiste) und erneut öffnen.' : 'Ist eine Kamera vorhanden und nicht von einer anderen App belegt?'}`;
    return { close };
  }
  if (!running) { stream.getTracks().forEach(t => t.stop()); return { close }; }
  video.srcObject = stream;
  await video.play().catch(() => {});
  $('msg').textContent = 'Karten ins Bild nehmen – ruhig halten';
  try { wake = await navigator.wakeLock?.request('screen'); } catch {}

  // Lage des Videobilds im Fenster (object-fit: cover)
  const viewMap = () => {
    const vw = video.videoWidth, vh = video.videoHeight, cw = el.clientWidth, ch = el.clientHeight;
    const s = Math.max(cw / vw, ch / vh);
    return { s, ox: (cw - vw * s) / 2, oy: (ch - vh * s) / 2 };
  };

  const step = () => {
    if (!running) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (vw && vh && video.readyState >= 2) {
      const k = Math.min(1, PROC_MAX / Math.max(vw, vh)), w = Math.round(vw * k), h = Math.round(vh * k);
      if (proc.width !== w || proc.height !== h) { proc.width = w; proc.height = h; gray = new Uint8Array(w * h); }
      pctx.drawImage(video, 0, 0, w, h);
      const img = pctx.getImageData(0, 0, w, h);
      toGray(img.data, w, h, gray);
      dets = detectCards(gray, w, h).map(d => ({ ...d, k }));
      handle(dets);
      draw();
    }
    setTimeout(() => requestAnimationFrame(step), 30);
  };

  const handle = list => {
    const st = provider.state(); if (!st) return;
    const now = performance.now(), roster = new Set((st.roster || []).map(r => r.card));
    $('msg').textContent = list.length ? '' : 'Karten ins Bild nehmen – ruhig halten';
    for (const d of list) {
      if (d.answerIndex === null || (roster.size && !roster.has(d.card))) continue;
      if (d.answerIndex >= (st.options?.length || 4)) continue; // Antwort, die es bei dieser Frage nicht gibt
      const prev = seen.get(d.card);
      const streak = prev && prev.idx === d.answerIndex && now - prev.t < 1500 ? prev.streak + 1 : 1;
      seen.set(d.card, { idx: d.answerIndex, streak, t: now });
      if (streak === 2 && st.answers?.[d.card] !== d.answerIndex) {
        const isNew = st.answers?.[d.card] === undefined;
        provider.answer(d.card, d.answerIndex);
        if (isNew) navigator.vibrate?.(12);
      }
    }
  };

  const draw = () => {
    const dpr = devicePixelRatio || 1, cw = el.clientWidth, ch = el.clientHeight;
    if (overlay.width !== Math.round(cw * dpr)) { overlay.width = Math.round(cw * dpr); overlay.height = Math.round(ch * dpr); }
    octx.setTransform(dpr, 0, 0, dpr, 0, 0); octx.clearRect(0, 0, cw, ch);
    const st = provider.state(); if (!st) return;
    const m = viewMap(), names = new Map((st.roster || []).map(r => [r.card, r.name]));
    for (const d of dets) {
      const pts = d.corners.map(([x, y]) => [x / d.k * m.s + m.ox, y / d.k * m.s + m.oy]);
      const known = !names.size || names.has(d.card), ok = known && st.answers?.[d.card] !== undefined;
      octx.lineWidth = 3; octx.strokeStyle = ok ? '#3ccf7a' : known ? '#ffd166' : '#ff6b6b';
      octx.fillStyle = ok ? 'rgba(60,207,122,.28)' : 'rgba(255,209,102,.18)';
      octx.beginPath(); pts.forEach(([x, y], i) => i ? octx.lineTo(x, y) : octx.moveTo(x, y)); octx.closePath(); octx.fill(); octx.stroke();
      const cx = pts.reduce((s, p) => s + p[0], 0) / 4, top = Math.min(...pts.map(p => p[1]));
      const label = known ? (names.get(d.card) || `Karte ${d.card}`) : `Karte ${d.card} – nicht in der Klasse`;
      octx.font = '600 13px system-ui, sans-serif'; const tw = octx.measureText(label).width + 12;
      octx.fillStyle = 'rgba(0,0,0,.65)'; octx.fillRect(cx - tw / 2, top - 24, tw, 20);
      octx.fillStyle = '#fff'; octx.textAlign = 'center'; octx.textBaseline = 'middle'; octx.fillText(label, cx, top - 14);
    }
  };
  step();
  return { close };
}

export const letter = i => LETTERS[i] ?? '–';

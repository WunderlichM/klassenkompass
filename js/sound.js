// Signaltöne werden im Browser erzeugt (Web Audio), keine Audiodateien nötig.
//
// „Musik bei Signalen“ (gilt je Gerät): Läuft auf demselben Gerät Musik (Spotify, YouTube …, auch über eine
// Bluetooth-Box), kann die App sie während eines Signals leiser stellen oder kurz anhalten lassen. Das geht nur über
// die Audio-Sitzung des Browsers (navigator.audioSession, Safari ab iOS/iPadOS 16.4). Nach dem Signal (mit kurzem
// Nachlauf, damit 3-2-1 und Phasenton im Intervalltimer ein Block bleiben) gibt die App den Ton wieder frei.
const MODE_KEY = 'klassenkompass.musicMode', TAIL = 1.3;
export const MUSIC_MODES = {
  off: { name: 'Nicht beeinflussen', hint: 'Wie bisher: Die Signale laufen über die Musik.' },
  duck: { name: 'Musik leiser stellen', hint: 'Die Musik wird während des Signals leiser und danach wieder lauter.' },
  pause: { name: 'Musik kurz anhalten', hint: 'Die Musik pausiert während des Signals und läuft danach hoffentlich weiter.' },
};
export const musicSupported = () => 'audioSession' in navigator;
let mode = (() => { try { const m = localStorage.getItem(MODE_KEY); return MUSIC_MODES[m] ? m : 'off'; } catch { return 'off'; } })();
export const musicMode = () => mode;
const managed = () => mode !== 'off' && musicSupported();
function applySession() {
  if (!musicSupported()) return;
  try { navigator.audioSession.type = mode === 'duck' ? 'transient' : mode === 'pause' ? 'transient-solo' : 'auto'; } catch (e) {}
}
export function setMusicMode(m) {
  mode = MUSIC_MODES[m] ? m : 'off';
  try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
  applySession();
  if (!managed() && ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

let ctx = null, holdUntil = 0, releaseTimer = 0;
function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (managed()) applySession();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
// Audio-Sitzung halten, solange Signale klingen; danach Ton freigeben, damit die Musik normal weiterläuft
function hold(sec) {
  if (!managed()) return;
  holdUntil = Math.max(holdUntil, performance.now() + sec * 1000);
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(release, holdUntil - performance.now() + 30);
}
function release() {
  if (!managed() || !ctx) return;
  const left = holdUntil - performance.now();
  if (left > 5) { releaseTimer = setTimeout(release, left + 30); return; }
  ctx.suspend().catch(() => {});
}
// Beim ersten Klick freischalten (Browser erlauben Töne erst nach einer Bedienung)
addEventListener('pointerdown', () => { ac(); hold(0.05); }, { once: true });

function tone(freq, start, dur, vol, type = 'sine') {
  const c = ac(); if (!c || vol <= 0) return;
  const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + start;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  hold(start + dur + TAIL);
}

export const TONES = {
  none: { name: 'Kein Ton', play: () => {} },
  beep: { name: 'Piepton', play: v => tone(880, 0, 0.25, v, 'square') },
  start: { name: 'Start (aufsteigend)', play: v => { tone(523, 0, 0.18, v); tone(659, 0.15, 0.18, v); tone(784, 0.3, 0.3, v); } },
  pause: { name: 'Pause (absteigend)', play: v => { tone(784, 0, 0.18, v); tone(587, 0.16, 0.3, v); } },
  gong: { name: 'Gong', play: v => { tone(196, 0, 1.6, v, 'sine'); tone(392, 0, 1.2, v * 0.5); tone(588, 0, 0.8, v * 0.25); } },
  success: { name: 'Erfolg', play: v => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.35, v, 'triangle')); } },
  tick: { name: 'Klick', play: v => tone(1200, 0, 0.06, v, 'square') },
  bell: { name: 'Glocke', play: v => { tone(1318, 0, 1.2, v * 0.8, 'sine'); tone(1975, 0, 0.8, v * 0.3, 'sine'); } },
  bowl: { name: 'Klangschale', play: v => { scheduleEnd(0, { tone: 'bowl', volume: Math.min(1, v * 2), repeats: 1 }); } },
  chimes: { name: 'Glockenspiel', play: v => { scheduleEnd(0, { tone: 'chimes', volume: Math.min(1, v * 2), repeats: 1 }); } },
  whistle: { name: 'Pfiff', play: v => { scheduleEnd(0, { tone: 'whistle', volume: Math.min(1, v * 2), repeats: 1 }); } },
};
export const DEFAULT_INTERVAL_TONES = { start: 'start', pause: 'pause', roundPause: 'gong', finish: 'success', countdown: 'tick' };
export const INTERVAL_TONE_LABELS = { start: 'Trainingsbeginn', pause: 'Satzpause', roundPause: 'Rundenpause', finish: 'Trainingsende', countdown: 'Countdown (3, 2, 1)' };

export function play(id, volume = 0.6) { (TONES[id] || TONES.beep).play(Math.max(0, Math.min(1, volume)) * 0.5); }
// Endton der Timer: kräftiges Weckersignal (je Sekunde drei Pieptöne, 5 Sekunden lang).
// Er wird im Voraus auf der Audio-Uhr eingeplant und erklingt daher auch, wenn das Fenster im Hintergrund liegt.
export const ALARM_SECONDS = 5;
export function scheduleAlarm(delaySec = 0, seconds = ALARM_SECONDS) {
  if (managed()) {
    // Musik wird beeinflusst: Ton erst kurz vor dem Signal einschalten, damit die Musik bis dahin normal läuft
    let cancelled = false, beeps = null;
    const fire = lead => { if (cancelled) return; const c = ac(); if (!c) return; hold(lead + seconds + TAIL); beeps = beepPattern(c, c.currentTime + lead, seconds); };
    const t = delaySec > 0.5 ? setTimeout(() => fire(0.3), (delaySec - 0.3) * 1000) : (fire(Math.max(0, delaySec)), 0);
    return { stop() { cancelled = true; clearTimeout(t); beeps?.stop(); } };
  }
  const c = ac(); if (!c || c.state !== 'running') return null;
  return beepPattern(c, c.currentTime + Math.max(0, delaySec), seconds);
}
function beepPattern(c, t0, seconds, vol = 1) {
  const comp = c.createDynamicsCompressor(), out = c.createGain();
  comp.threshold.value = -6; comp.knee.value = 3; comp.ratio.value = 12; comp.attack.value = 0.002; comp.release.value = 0.08;
  out.gain.value = vol; out.connect(comp).connect(c.destination);
  const oscs = [];
  const beep = (t, freq) => {
    for (const [f, type, v] of [[freq, 'square', 0.55], [freq * 2, 'triangle', 0.3]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008);
      g.gain.setValueAtTime(v, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.15); oscs.push(o);
    }
  };
  for (let s = 0; s < seconds; s++) for (let b = 0; b < 3; b++) beep(t0 + s + b * 0.17, s % 2 ? 1175 : 1046);
  return { stop() { for (const o of oscs) { try { o.stop(); } catch (e) {} } try { out.disconnect(); } catch (e) {} } };
}
export function timerEnd() { return scheduleAlarm(0); }
// Test unter Zahnrad → „Musik bei Signalen“: gewählte Variante einstellen und ein kurzes Signal spielen
export function testMusic(m, delaySec = 0) { setMusicMode(m); return scheduleAlarm(delaySec, 2); }

// ======================================================================
// Endtöne der Timer (seit 2.5.0 wählbar; Standard: Klangschale – laut, aber ruhig)
// Jeder Ton wird wie das Weckersignal im Voraus auf der Audio-Uhr eingeplant. Tiefe Töne fehlen bewusst:
// Beamer- und Laptoplautsprecher geben sie kaum wieder, die Grundtöne liegen deshalb bei etwa 250–900 Hz.
// ======================================================================
// Ein Teilton. Ausklang: gleichmäßig leiser bis auf 3 % (klingt lange nach), am Ende weich auf null.
// sustain = true hält den Ton stattdessen bis kurz vor dem Ende (Pfiff).
function voice(c, out, nodes, t, freq, dur, vol, type = 'sine', attack = 0.012, sustain = false) {
  const o = c.createOscillator(), g = c.createGain(), v = Math.max(0.0002, vol);
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + attack);
  if (sustain) g.gain.setValueAtTime(v, t + dur - 0.07); else g.gain.exponentialRampToValueAtTime(v * 0.03, t + dur * 0.92);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05); nodes.push(o);
}
// len = Dauer eines Schlags, gap = Abstand zum nächsten Schlag bei Wiederholung (Sekunden)
export const END_TONES = {
  bowl: { name: 'Klangschale', hint: 'ruhig, langer Ausklang', len: 5.5, gap: 3.4,
    // zwei leicht verstimmte Grundtöne schweben wie bei einer echten Schale, darüber die typischen Obertöne
    make: (c, out, n, t) => { for (const [r, v, d] of [[1, 0.5, 5.5], [1.004, 0.32, 5.2], [2.76, 0.2, 3.4], [2.772, 0.1, 3], [5.2, 0.07, 1.6], [8.1, 0.03, 0.7]]) voice(c, out, n, t, 432 * r, d, v); } },
  chimes: { name: 'Glockenspiel', hint: 'drei aufsteigende Töne', len: 2.8, gap: 2.6,
    make: (c, out, n, t) => { [523.3, 659.3, 784].forEach((f, i) => { voice(c, out, n, t + i * 0.42, f, 1.9, 0.5); voice(c, out, n, t + i * 0.42, f * 2.76, 0.7, 0.13); voice(c, out, n, t + i * 0.42, f * 5.4, 0.25, 0.05); }); } },
  wind: { name: 'Windspiel', hint: 'hell und leise', len: 3.8, gap: 3.2,
    make: (c, out, n, t) => { [[0, 1047], [0.24, 1319], [0.52, 1175], [0.74, 1568], [1.08, 1397], [1.34, 1760], [1.72, 1319], [2.0, 1047]].forEach(([d, f]) => { voice(c, out, n, t + d, f, 1.7, 0.26, 'sine', 0.006); voice(c, out, n, t + d, f * 2.01, 0.6, 0.05, 'sine', 0.006); }); } },
  gong: { name: 'Gong', hint: 'voll, für die Werkstatt', len: 4.6, gap: 3.2,
    make: (c, out, n, t) => { for (const [r, v, d] of [[1, 0.5, 4.6], [1.48, 0.3, 3.6], [2.02, 0.26, 3], [2.74, 0.16, 2.1], [3.76, 0.09, 1.3], [5.1, 0.05, 0.6]]) voice(c, out, n, t, 262 * r, d, v, 'sine', 0.02); } },
  alarm: { name: 'Wecker (bisheriger Ton)', hint: 'kurz und deutlich', len: 5, gap: 5 },
  whistle: { name: 'Pfiff', hint: 'hart und sehr laut, für die Halle', len: 0.9, gap: 1.2,
    make: (c, out, n, t) => {
      // Trillerpfeife: zwei nahe Töne mit schnellem Tremolo
      const tr = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
      tr.gain.setValueAtTime(0.6, t); lfo.type = 'square'; lfo.frequency.setValueAtTime(38, t); depth.gain.setValueAtTime(0.4, t);
      lfo.connect(depth).connect(tr.gain); tr.connect(out); lfo.start(t); lfo.stop(t + 1); n.push(lfo);
      voice(c, tr, n, t, 2850, 0.85, 0.5, 'triangle', 0.02, true); voice(c, tr, n, t, 3120, 0.85, 0.4, 'triangle', 0.02, true); voice(c, tr, n, t, 5700, 0.6, 0.1, 'sine', 0.02, true);
    } },
  // leiser Hinweis kurz vor dem Ende (nicht in der Auswahl)
  warn: { name: 'Vorwarnton', hidden: true, len: 1.6, gap: 2,
    make: (c, out, n, t) => { voice(c, out, n, t, 659.3, 1.2, 0.3); voice(c, out, n, t + 0.28, 523.3, 1.3, 0.3); } },
};
export const END_TONE_DEFAULT = 'bowl';
export const endToneId = id => (END_TONES[id] && !END_TONES[id].hidden ? id : END_TONE_DEFAULT);
const repOf = (id, r) => (id === 'alarm' || id === 'warn' ? 1 : Math.max(1, Math.min(3, Math.round(Number(r)) || 1)));
// Gesamtdauer eines Endtons samt Wiederholungen (Sekunden)
export function endToneSeconds(id, repeats = 1) { const t = END_TONES[id] || END_TONES[END_TONE_DEFAULT]; return (repOf(id, repeats) - 1) * t.gap + t.len; }
function renderEnd(c, t0, id, vol, repeats, late = 0) {
  const tone = END_TONES[id] || END_TONES[END_TONE_DEFAULT];
  if (!tone.make) return beepPattern(c, t0, Math.max(1, Math.ceil(ALARM_SECONDS - late)), vol);
  const comp = c.createDynamicsCompressor(), out = c.createGain(), nodes = [];
  comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.2;
  out.gain.value = vol * 1.25; out.connect(comp).connect(c.destination);
  // verspätet (z. B. nach dem Neuladen): schon verklungene Schläge auslassen
  for (let r = Math.min(repOf(id, repeats) - 1, Math.floor(late / tone.gap)); r < repOf(id, repeats); r++) tone.make(c, out, nodes, t0 + Math.max(0, r * tone.gap - late));
  return { stop() { for (const o of nodes) { try { o.stop(); } catch (e) {} } try { out.disconnect(); } catch (e) {} } };
}
// Endton einplanen: delaySec bis zum Beginn (negativ = schon überfällig). Rückgabe { stop() } oder null (Ton noch gesperrt).
export function scheduleEnd(delaySec = 0, { tone = END_TONE_DEFAULT, volume = 0.9, repeats = 2 } = {}) {
  const id = END_TONES[tone] ? tone : END_TONE_DEFAULT, vol = Math.max(0, Math.min(1, volume)), late = Math.max(0, -delaySec), total = endToneSeconds(id, repeats);
  if (vol <= 0 || late >= total) return { stop() {} };
  if (managed()) {
    // Musik wird beeinflusst: Ton erst kurz vor dem Signal einschalten, damit die Musik bis dahin normal läuft
    let cancelled = false, snd = null;
    const fire = lead => { if (cancelled) return; const c = ac(); if (!c) return; hold(lead + total - late + TAIL); snd = renderEnd(c, c.currentTime + lead, id, vol, repeats, late); };
    const t = delaySec > 0.5 ? setTimeout(() => fire(0.3), (delaySec - 0.3) * 1000) : (fire(Math.max(0, delaySec)), 0);
    return { stop() { cancelled = true; clearTimeout(t); snd?.stop(); } };
  }
  const c = ac(); if (!c || c.state !== 'running') return null;
  return renderEnd(c, c.currentTime + Math.max(0, delaySec), id, vol, repeats, late);
}
// Probehören: immer nur ein Ton gleichzeitig
let previewSnd = null;
export function previewEnd(opts) { previewSnd?.stop(); previewSnd = scheduleEnd(0, { ...opts, repeats: 1 }); return previewSnd; }
export function stopPreview() { previewSnd?.stop(); previewSnd = null; }

// ======================================================================
// Kartenquiz: Spieltöne und Denkmusik (alles im Browser erzeugt, keine Audiodateien)
// Einstellungen gelten je Gerät: Töne an/aus, Denkmusik an/aus, Lautstärke.
// ======================================================================
const QUIZ_KEY = 'klassenkompass.quizSound';
const quizPrefs = (() => { const d = { on: true, music: true, vol: 0.7 };
  try { const p = JSON.parse(localStorage.getItem(QUIZ_KEY) || '{}'); return { on: p.on !== false, music: p.music !== false, vol: typeof p.vol === 'number' && p.vol >= 0 && p.vol <= 1 ? p.vol : d.vol }; } catch { return d; } })();
export const quizSound = () => ({ ...quizPrefs });
export function setQuizSound(p) {
  Object.assign(quizPrefs, p);
  try { localStorage.setItem(QUIZ_KEY, JSON.stringify(quizPrefs)); } catch (e) {}
  if (!quizPrefs.on || !quizPrefs.music) quizMusic(false);
}
const qv = (v = 1) => (quizPrefs.on ? quizPrefs.vol * 0.5 * v : 0);
// Gleitender Ton (für „Wusch“ und Plopp)
function sweep(f0, f1, start, dur, vol, type = 'sine') {
  const c = ac(); if (!c || vol <= 0) return;
  const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + start;
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.02, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  hold(start + dur + TAIL);
}
// Rauschen (für Trommel und Becken)
let noiseBuf = null;
function noise(start, dur, vol, freq = 1800, q = 0.8, type = 'bandpass') {
  const c = ac(); if (!c || vol <= 0) return;
  if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime + start;
  s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(c.destination); s.start(t); s.stop(t + dur + 0.05);
  hold(start + dur + TAIL);
}
const drum = (start, vol) => { sweep(160, 50, start, 0.22, vol, 'sine'); noise(start, 0.09, vol * 0.5, 900, 0.6); };
const QUIZ_FX = {
  // „Los geht's“: kurzer Auftakt
  go: v => { [392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.22, v, 'triangle')); tone(1047, 0.38, 0.5, v, 'triangle'); tone(523, 0.38, 0.5, v * 0.6); noise(0.38, 0.5, v * 0.25, 6000, 0.5, 'highpass'); },
  // neue Frage erscheint
  question: v => { sweep(300, 900, 0, 0.28, v * 0.5, 'triangle'); tone(784, 0.26, 0.16, v * 0.8, 'triangle'); tone(1175, 0.38, 0.3, v * 0.8, 'triangle'); },
  // eine Karte wurde erkannt; n = wievielte Antwort (der Ton steigt mit)
  plop: (v, n = 0) => { const f = 420 * 2 ** (Math.min(n, 24) / 24); sweep(f, f * 1.9, 0, 0.09, v * 0.7, 'sine'); },
  // alle haben geantwortet
  allin: v => { tone(988, 0, 0.14, v, 'triangle'); tone(1319, 0.13, 0.14, v, 'triangle'); tone(1976, 0.26, 0.45, v * 0.8, 'triangle'); },
  // Auflösung: Schlag und Akkord
  reveal: v => { drum(0, v * 1.4); noise(0, 0.6, v * 0.3, 5000, 0.5, 'highpass'); [523, 659, 784, 1047].forEach(f => tone(f, 0.04, 0.9, v * 0.5, 'triangle')); },
  // Auflösung ohne richtige Antwort (Meinungsbild)
  show: v => { drum(0, v); tone(440, 0.04, 0.5, v * 0.5, 'triangle'); tone(659, 0.04, 0.5, v * 0.5, 'triangle'); },
  // Zwischenstand
  board: v => { sweep(250, 1100, 0, 0.3, v * 0.4, 'triangle'); [659, 784, 988].forEach((f, i) => tone(f, 0.25 + i * 0.1, 0.25, v * 0.7, 'triangle')); },
  // Podium: Trommelwirbel, drei Stufen, Fanfare
  podium: v => {
    for (let i = 0; i < 26; i++) noise(i * 0.045, 0.05, v * (0.25 + i / 60), 1400, 1.2);
    [[1.2, 392], [1.6, 494], [2.0, 587]].forEach(([t, f]) => { drum(t, v * 1.3); tone(f, t, 0.3, v * 0.8, 'triangle'); });
    [[2.6, 523, 0.16], [2.78, 523, 0.16], [2.96, 523, 0.16], [3.14, 659, 0.3], [3.46, 587, 0.16], [3.64, 659, 0.9]].forEach(([t, f, d]) => { tone(f, t, d + 0.1, v, 'triangle'); tone(f * 1.5, t, d + 0.1, v * 0.5, 'triangle'); tone(f / 2, t, d + 0.1, v * 0.6, 'square'); });
    noise(3.64, 1.2, v * 0.35, 6000, 0.5, 'highpass');
  },
};
export const QUIZ_FX_NAMES = { go: 'Start', question: 'Neue Frage', plop: 'Karte erkannt', allin: 'Alle haben geantwortet', reveal: 'Auflösung', board: 'Zwischenstand', podium: 'Podium' };
export function quizFx(name, arg) { const v = qv(); if (v > 0) QUIZ_FX[name]?.(v, arg); }

// Denkmusik: ruhige Schleife aus Bass, Begleitung und Melodie (vier Takte, a-Moll – F – C – G), läuft bis zur Auflösung
const BPM = 104, STEP = 60 / BPM / 2;                       // Achtelnoten
const BARS = [[110, [220, 261.6, 329.6]], [87.3, [174.6, 220, 261.6]], [130.8, [196, 261.6, 329.6]], [98, [196, 246.9, 293.7]]];
const LEAD = [0, 2, 1, 2, 0, 2, 1, 3];                      // Töne des Akkords, 3 = Oktave des Grundtons
let musicTimer = 0, musicNext = 0, musicStep = 0;
function musicTick() {
  const c = ac(); if (!c) return;
  const v = qv(0.22);
  while (musicNext < c.currentTime + 0.35) {
    const rel = Math.max(0, musicNext - c.currentTime), bar = BARS[Math.floor(musicStep / 8) % 4], k = musicStep % 8;
    if (v > 0) {
      if (k === 0 || k === 4) tone(bar[0], rel, 0.34, v * 1.5, 'triangle');
      if (k === 3 || k === 6) tone(bar[0] * 2, rel, 0.14, v * 0.8, 'triangle');
      if (k % 2 === 1) for (const f of bar[1]) tone(f, rel, 0.11, v * 0.32, 'square');
      const l = LEAD[k], f = l === 3 ? bar[1][0] * 2 : bar[1][l];
      tone(f * 2, rel, 0.2, v * 0.75, 'sine');
      if (k === 2 || k === 6) noise(rel, 0.03, v * 0.5, 7000, 0.7, 'highpass');
    }
    musicNext += STEP; musicStep++;
  }
}
export function quizMusic(want) {
  const on = !!want && quizPrefs.on && quizPrefs.music;
  if (on === !!musicTimer) return;
  if (on) { const c = ac(); if (!c) return; musicNext = c.currentTime + 0.12; musicStep = 0; musicTimer = setInterval(musicTick, 110); musicTick(); }
  else { clearInterval(musicTimer); musicTimer = 0; }
}

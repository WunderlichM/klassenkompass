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
function beepPattern(c, t0, seconds) {
  const comp = c.createDynamicsCompressor(), out = c.createGain();
  comp.threshold.value = -6; comp.knee.value = 3; comp.ratio.value = 12; comp.attack.value = 0.002; comp.release.value = 0.08;
  out.gain.value = 1; out.connect(comp).connect(c.destination);
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

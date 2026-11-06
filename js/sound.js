// Signaltöne werden im Browser erzeugt (Web Audio), keine Audiodateien nötig.
let ctx = null;
function ac() {
  if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
// Beim ersten Klick freischalten (Browser erlauben Töne erst nach einer Bedienung)
addEventListener('pointerdown', () => ac(), { once: true });

function tone(freq, start, dur, vol, type = 'sine') {
  const c = ac(); if (!c || vol <= 0) return;
  const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + start;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
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
  const c = ac(); if (!c || c.state !== 'running') return null;
  const comp = c.createDynamicsCompressor(), out = c.createGain();
  comp.threshold.value = -6; comp.knee.value = 3; comp.ratio.value = 12; comp.attack.value = 0.002; comp.release.value = 0.08;
  out.gain.value = 1; out.connect(comp).connect(c.destination);
  const t0 = c.currentTime + Math.max(0, delaySec), oscs = [];
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

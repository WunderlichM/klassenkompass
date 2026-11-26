// Prüft die Übertragung Handy → PC (js/micsync.js) mit simuliertem Netz: Verzögerung, Schwankung, verlorene Abfragen,
// leicht abweichende Uhren. Aufruf: node tools/micsync-test.mjs
import { packer, player, STEP, SEND_MS, POLL_MS, DELAY } from '../js/micsync.js';

function run({ jitter = 250, loss = 0.15, drift = 1.0, seconds = 300, seed = 7 } = {}) {
  let r = seed; const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pk = packer('A'), pl = player(); const sent = [], inbox = []; let row = null;
  const vals = [];                     // Messwerte des Handys nach Nummer
  let n = 0, holds = 0, wrong = 0, last = null, warps = 0, delaySum = 0;
  let nextSample = 0, nextSend = SEND_MS;
  for (let t = 0; t < seconds * 1000; t += 10) {
    const tp = t * drift;   // Uhr des Handys (läuft bei drift ≠ 1 etwas anders)
    if (tp >= nextSample) { nextSample += STEP; const v = Math.round(50 + 45 * Math.sin(tp / 700) * Math.sin(tp / 173)); pk.push(v); vals[pk.seq] = v; }
    // Das Handy lädt hoch (mit Verzögerung); der Server behält die zuletzt eingetroffene Zeile
    if (tp >= nextSend) { nextSend += SEND_MS; sent.push({ at: t + 80 + rnd() * jitter, p: pk.packet() }); }
    sent.sort((a, b) => a.at - b.at);
    while (sent.length && sent[0].at <= t) row = sent.shift().p;
    // Abfrage des PCs: liest die Zeile jetzt, die Antwort kommt nach einer Netzverzögerung an (oder geht verloren)
    if (t % POLL_MS === 130 && row && rnd() > loss) inbox.push({ at: t + 60 + rnd() * jitter, p: JSON.parse(JSON.stringify(row)) });
    inbox.sort((a, b) => a.at - b.at);
    while (inbox.length && inbox[0].at <= t) pl.add(inbox.shift().p, t);
    if (t > 15000 && t % 50 === 0) {
      const lv = pl.level(t), st = pl.state(t); if (lv === null) { holds++; continue; }
      n++;
      if (st.pos > st.maxSeq) holds++;                                   // Wiedergabe hat die Daten eingeholt
      const a = Math.floor(st.pos), exp = vals[a] + ((vals[a + 1] ?? vals[a]) - vals[a]) * (st.pos - a);
      if (Math.abs(exp - lv) > 0.5) wrong++;                            // gezeigter Wert ≠ Wert des Handys
      if (last !== null && Math.abs(st.pos - last - 0.5) > 0.05) warps++; // Sprung in der Wiedergabe (> 5 ms)
      last = st.pos; delaySum += t - st.pos * STEP;
    }
  }
  return { holds: (holds / n * 100).toFixed(2), wrong: (wrong / n * 100).toFixed(2), warps, delay: Math.round(delaySum / n) };
}
const cases = [['ruhiges WLAN', { jitter: 60, loss: 0 }], ['normales WLAN', {}], ['wackeliges WLAN', { jitter: 600, loss: 0.35 }], ['Handy-Uhr 1 % schneller', { drift: 1.01 }]];
let ok = true;
for (const [name, o] of cases) {
  const res = run(o); const pass = Number(res.holds) < 1 && Number(res.wrong) < 1 && res.warps < 5;
  ok &&= pass;
  console.log(`${pass ? 'ok    ' : 'FEHLER'} ${name}: Verzögerung ${(res.delay / 1000).toFixed(1)} s · Werte genau wie am Handy: ${(100 - res.wrong).toFixed(1)} % · Wiedergabe angehalten: ${res.holds} % · Sprünge: ${res.warps}`);
}
process.exit(ok ? 0 : 1);

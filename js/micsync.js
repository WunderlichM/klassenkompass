// Handy als Mikrofon (seit 2.27.0): genaue Übertragung des Pegels vom Handy zum PC.
// Das Handy misst alle 100 ms und schickt bei jedem Senden die letzten KEEP Messwerte mit laufender Nummer.
// Der PC fügt die Werte lückenlos zusammen (auch wenn eine Abfrage ausfällt) und spielt sie mit fester
// Verzögerung im selben Takt ab – so stimmt die Kurve am PC mit der auf dem Handy überein, nur etwas später.
// Reine Logik ohne Netz und ohne Browser (siehe tools/micsync-test.mjs).

export const STEP = 100;      // ms je Messwert
export const KEEP = 30;       // Messwerte je Paket (3 s) – überbrückt ausgefallene Abfragen
export const SEND_MS = 300;   // so oft sendet das Handy
export const POLL_MS = 300;   // so oft fragt der PC ab
export const DELAY = 1200;    // Abstand der Wiedergabe zum neuesten Messwert (ms)
const STALE = 4000;           // ohne neue Werte gilt das Handy als getrennt

// Handy: Messwerte sammeln und Pakete bilden
export function packer(id = Math.random().toString(36).slice(2, 8)) {
  let seq = 0; const buf = [];
  return {
    push(lv) { seq++; buf.push(Math.max(0, Math.min(100, Math.round(lv)))); if (buf.length > KEEP) buf.shift(); },
    packet() { return { v: 2, id, seq, lv: buf.slice() }; },
    get seq() { return seq; },
  };
}

// PC: Pakete aufnehmen und den Pegel für einen Zeitpunkt liefern.
// Uhrabgleich: Für jedes neue Paket ergibt sich „Ankunft − Nummer × 100 ms“. Netzverzögerungen machen diesen Wert nur
// größer, nie kleiner – der kleinste Wert der letzten 30 s ist daher der beste Bezug (schwankt kaum, folgt leicht
// abweichenden Uhren). Die Wiedergabe läuft so weit dahinter, dass auch verspätete Pakete rechtzeitig da sind:
// fest mindestens `delay`, bei sehr unruhigem Netz entsprechend mehr.
export function player({ delay = DELAY } = {}) {
  const q = new Map(), offs = [], lates = [];
  let id = null, maxSeq = 0, recv = 0, lag = delay, want = delay, off = null, tick = null;
  const reset = () => { q.clear(); offs.length = 0; lates.length = 0; maxSeq = 0; lag = want = delay; off = tick = null; };
  const offset = () => offs.reduce((m, o) => Math.min(m, o[1]), Infinity);
  return {
    add(p, now) {
      if (!p || p.v !== 2 || !Array.isArray(p.lv) || !Number.isFinite(p.seq)) return;
      if (p.id !== id || p.seq < maxSeq - 50) { reset(); id = p.id; }   // Handy hat neu begonnen
      const n = p.lv.length;
      p.lv.forEach((v, i) => { const k = p.seq - (n - 1 - i); if (!q.has(k)) q.set(k, Number(v) || 0); });
      if (p.seq <= maxSeq) return;
      // wie alt war der neueste Wert unmittelbar vor diesem Paket? (Wartezeit plus Verspätung – bestimmt den Puffer)
      if (offs.length) { lates.push(now - offset() - maxSeq * STEP); if (lates.length > 75) lates.shift(); }
      maxSeq = p.seq; recv = now;
      offs.push([now, now - p.seq * STEP]); while (offs.length && offs[0][0] < now - 30000) offs.shift();
      // Puffer: so lang wie das späteste der letzten Pakete plus Reserve (wird in level() gleitend angepasst)
      want = Math.max(delay, Math.min(5000, Math.max(...lates) + STEP * 3));
      if (off === null) off = offset();
    },
    level(now) {
      if (!offs.length || now - recv > STALE) return null;
      // Bezug und Puffer gleiten zum Ziel (höchstens 6 % schneller oder langsamer abspielen, kein Springen);
      // ein längerer Puffer wird zügig erreicht, ein kürzerer nur sehr langsam
      const dt = tick === null ? 0 : Math.max(0, Math.min(1000, now - tick)); tick = now;
      const step = (v, goal, rate) => v + Math.max(-dt * rate, Math.min(dt * rate, goal - v));
      off = step(off, offset(), 0.03);
      lag = want > lag ? step(lag, want, 0.03) : step(lag, want, 0.002);
      const f = Math.min((now - off - lag) / STEP, maxSeq), a = Math.floor(f);
      for (const k of q.keys()) if (k < a - 30) q.delete(k);
      const at = k => { for (let i = k; i > k - 30; i--) if (q.has(i)) return q.get(i); return null; };
      const v0 = at(a), v1 = q.has(a + 1) ? q.get(a + 1) : v0;
      if (v0 === null) return null;
      return v0 + (v1 - v0) * (f - a);
    },
    connected: now => offs.length > 0 && now - recv <= STALE,
    get lag() { return lag; },
    // für Tests: Abspielposition (Messwert-Nummer) und neuester vorhandener Messwert
    state: now => ({ pos: off === null ? null : (now - off - lag) / STEP, maxSeq }),
  };
}

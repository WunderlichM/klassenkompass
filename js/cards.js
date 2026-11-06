// Antwortkarten für das Kartenquiz: Muster, Druckbild und Auswertung der Drehung.
// Jede Karte trägt ein 7 × 7-Raster: schwarzer Rand und innen 5 × 5 Felder mit einem eigenen Code.
// Die 40 Codes unterscheiden sich untereinander – auch gedreht – in mindestens 7 Feldern.
export const CARD_COUNT = 40;
const CODES = ['1a690b6', '1aa3914', '05665e4', '02cda74', '077f20c', '0c2e82c', '0a56a52', '03f414a', '069b49a', '007f928',
  '118ef68', '16c2ae8', '19c06a8', '1ad3428', '0ce6328', '039dba8', '062de1f', '0be4eb0', '1218f70', '04a9e30',
  '1b46890', '162ec50', '04689f0', '1afdb90', '0b31750', '0e63f0e', '005d7fc', '133beac', '1d731dc', '1f9430c',
  '0d73480', '0d5e3c0', '0d99780', '1f16e20', '0dd8dd8', '1a2a7d8', '0bc7958', '197c058', '0e3f690', '0e97370'].map(h => parseInt(h, 16));
export const LETTERS = ['A', 'B', 'C', 'D'];

// Feld (Zeile r, Spalte c) des inneren 5 × 5-Rasters; 1 = schwarz
export const bit = (code, r, c) => (code >>> (24 - (r * 5 + c))) & 1;
// Um 90° im Uhrzeigersinn drehen
export function rotCW(code) {
  let out = 0;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (bit(code, 4 - c, r)) out |= 1 << (24 - (r * 5 + c));
  return out >>> 0;
}
const pop = x => { let n = 0; for (; x; x &= x - 1) n++; return n; };
// Alle vier Lagen jeder Karte: WORDS[k] = Code nach k Vierteldrehungen im Uhrzeigersinn
const WORDS = CODES.map(c => { const w = [c]; for (let k = 1; k < 4; k++) w.push(rotCW(w[k - 1])); return w; });

// Gelesenes Raster einer Karte zuordnen: { card (1 …), k (Lage) } oder null
export function matchCode(read, maxErr = 1) {
  let best = null, second = 99;
  for (let i = 0; i < WORDS.length; i++) for (let k = 0; k < 4; k++) {
    const d = pop((read ^ WORDS[i][k]) >>> 0);
    if (!best || d < best.d) { if (best) second = Math.min(second, best.d); best = { card: i + 1, k, d }; }
    else second = Math.min(second, d);
  }
  return best && best.d <= maxErr && second > best.d ? best : null;
}

// Druckbild einer Karte als SVG. Maße in Rastereinheiten: Rand 2,2 Einheiten um das 7er-Raster.
const M = 2.2, SIZE = 7 + 2 * M;
// name: Vorname gut sichtbar oben links neben der Nummer (zum Austeilen); bleibt mit Abstand außerhalb des Musters
export function cardSvg(n, { name = '', size = '100%' } = {}) {
  const code = CODES[n - 1];
  let cells = '';
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    const border = r === 0 || r === 6 || c === 0 || c === 6;
    if (border || bit(code, r - 1, c - 1)) cells += `<rect x="${M + c}" y="${M + r}" width="1.02" height="1.02"/>`;
  }
  const mid = SIZE / 2, off = 0.75, fs = 0.62;
  const letter = (t, x, y, rot) => `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="700" fill="#9a9aa3">${t}</text>`;
  return `<svg class="kq-card" viewBox="0 0 ${SIZE} ${SIZE}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial, sans-serif">
    <rect width="${SIZE}" height="${SIZE}" fill="#fff"/>
    <g fill="#111">${cells}</g>
    ${letter('A', mid, off, 0)}${letter('B', SIZE - off, mid, 90)}${letter('C', mid, SIZE - off, 180)}${letter('D', off, mid, -90)}
    ${name ? nameText(n, name) : `<text x="0.45" y="0.55" font-size="0.42" fill="#9a9aa3" dominant-baseline="hanging">${n}</text>`}
  </svg>`;
}
// Nummer und Name in der Ecke oben links; lange Namen werden auf den Platz bis vor das „A“ gestaucht
function nameText(n, name) {
  const t = String(name).replace(/[&<>"]/g, '').trim();
  const fs = 0.6, x = 0.45, room = SIZE / 2 - 0.65 - x;
  const est = (String(n).length + 1.5 + t.length) * fs * 0.56;
  const fit = est > room ? ` textLength="${room.toFixed(2)}" lengthAdjust="spacingAndGlyphs"` : '';
  return `<text x="${x}" y="0.42" font-size="${fs}" fill="#55555d" dominant-baseline="hanging"${fit}><tspan font-weight="700">${n}</tspan><tspan font-weight="600" dx="${(fs * 0.5).toFixed(2)}">${t}</tspan></text>`;
}

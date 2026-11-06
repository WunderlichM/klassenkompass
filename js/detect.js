// Antwortkarten in einem Kamerabild finden (eigene Umsetzung, ohne Bibliotheken).
// Ablauf: Graustufen → örtlicher Schwellwert → zusammenhängende dunkle Flächen → konvexe Hülle →
// Viereck → Raster abtasten → Code und Drehung bestimmen.
import { matchCode, LETTERS } from './cards.js';

let buf = { n: 0 };
function buffers(w, h) {
  const n = w * h;
  if (buf.n !== n || buf.w !== w) buf = { n, w, integ: new Float64Array((w + 1) * (h + 1)), bin: new Uint8Array(n), label: new Int32Array(n), stack: new Int32Array(n) };
  return buf;
}

// rgba: Uint8ClampedArray eines ImageData; liefert Graustufen
export function toGray(rgba, w, h, out = new Uint8Array(w * h)) {
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  return out;
}

// Hauptfunktion: gray = Uint8Array (w × h). Ergebnis: [{ card, answer, corners, cx, cy, size }]
export function detectCards(gray, w, h, { minSide = 12, contrast = 12 } = {}) {
  const { integ, bin, label, stack } = buffers(w, h);
  // 1. Integralbild und örtlicher Schwellwert (dunkler als Umgebung)
  const W1 = w + 1;
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += gray[y * w + x]; integ[(y + 1) * W1 + x + 1] = integ[y * W1 + x + 1] + row; }
  }
  const r = Math.max(4, Math.round(Math.min(w, h) / 16));
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = integ[y1 * W1 + x1] - integ[y0 * W1 + x1] - integ[y1 * W1 + x0] + integ[y0 * W1 + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      bin[y * w + x] = gray[y * w + x] < mean - contrast ? 1 : 0;
    }
  }
  // 2. Zusammenhängende dunkle Flächen (8er-Nachbarschaft)
  label.fill(0);
  const comps = [];
  for (let start = 0; start < w * h; start++) {
    if (!bin[start] || label[start]) continue;
    const id = comps.length + 1;
    let sp = 0, area = 0, minx = w, maxx = 0, miny = h, maxy = 0;
    stack[sp++] = start; label[start] = id;
    while (sp) {
      const p = stack[--sp], px = p % w, py = (p - px) / w;
      area++;
      if (px < minx) minx = px; if (px > maxx) maxx = px; if (py < miny) miny = py; if (py > maxy) maxy = py;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy; if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx; if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (bin[q] && !label[q]) { label[q] = id; stack[sp++] = q; }
        }
      }
    }
    comps.push({ id, area, minx, maxx, miny, maxy });
  }
  // 3. Kandidaten prüfen
  const found = [];
  for (const c of comps) {
    const bw = c.maxx - c.minx + 1, bh = c.maxy - c.miny + 1;
    if (bw < minSide || bh < minSide || bw > w * 0.9 || bh > h * 0.9) continue;
    if (bw > bh * 3 || bh > bw * 3) continue;
    const fill = c.area / (bw * bh);
    if (fill < 0.18 || fill > 0.97) continue;
    const pts = [];
    for (let y = c.miny; y <= c.maxy; y++) {
      let a = -1, b = -1;
      for (let x = c.minx; x <= c.maxx; x++) if (label[y * w + x] === c.id) { if (a < 0) a = x; b = x; }
      if (a >= 0) { pts.push([a, y]); if (b !== a) pts.push([b + 1, y]); }
    }
    pts.push(...pts.filter(p => p[1] === c.maxy).map(p => [p[0], p[1] + 1]));
    const hull = convexHull(pts);
    if (hull.length < 4) continue;
    const quad = hullToQuad(hull);
    if (!quad) continue;
    const qa = polyArea(quad), ha = polyArea(hull);
    if (qa < ha * 0.85 || c.area < qa * 0.4) continue;
    const res = readQuad(gray, w, h, quad);
    if (res) found.push({ ...res, area: qa });
  }
  // gleiche Karte nur einmal (die größere Fundstelle zählt)
  const byCard = new Map();
  for (const f of found) if (!byCard.has(f.card) || byCard.get(f.card).area < f.area) byCard.set(f.card, f);
  return [...byCard.values()];
}

function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function polyArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return Math.abs(s) / 2;
}
// Vier Ecken aus der Hülle: weitester Punkt, Gegenecke, dann je Seite der weiteste Punkt zur Diagonale
function hullToQuad(hull) {
  let cx = 0, cy = 0; hull.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= hull.length; cy /= hull.length;
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  let A = hull[0]; for (const p of hull) if (d2(p, [cx, cy]) > d2(A, [cx, cy])) A = p;
  let C = hull[0]; for (const p of hull) if (d2(p, A) > d2(C, A)) C = p;
  const side = p => (C[0] - A[0]) * (p[1] - A[1]) - (C[1] - A[1]) * (p[0] - A[0]);
  let B = null, D = null, sb = 0, sd = 0;
  for (const p of hull) { const s = side(p); if (s > sb) { sb = s; B = p; } if (s < sd) { sd = s; D = p; } }
  if (!B || !D) return null;
  // Reihenfolge im Uhrzeigersinn (Bildkoordinaten, y nach unten)
  let q = [A, B, C, D];
  const area2 = q.reduce((s, a, i) => { const b = q[(i + 1) % 4]; return s + a[0] * b[1] - b[0] * a[1]; }, 0);
  if (area2 < 0) q = [A, D, C, B];
  // Seiten nicht zu ungleich (schräg gehaltene Karte ist erlaubt)
  const len = q.map((a, i) => Math.sqrt(d2(a, q[(i + 1) % 4])));
  if (Math.min(...len) < Math.max(...len) * 0.3) return null;
  return q;
}

// Projektive Abbildung des Einheitsquadrats auf das Viereck (Heckbert)
function squareToQuad(q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  let a, b, c, d, e, f, g, hh;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    a = x1 - x0; b = x2 - x1; c = x0; d = y1 - y0; e = y2 - y1; f = y0; g = 0; hh = 0;
  } else {
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den; hh = (dx1 * sy - sx * dy1) / den;
    a = x1 - x0 + g * x1; b = x3 - x0 + hh * x3; c = x0;
    d = y1 - y0 + g * y1; e = y3 - y0 + hh * y3; f = y0;
    return (u, v) => { const z = g * u + hh * v + 1; return [(a * u + b * v + c) / z, (d * u + e * v + f) / z]; };
  }
  // affiner Sonderfall: u entlang q0→q1, v entlang q1→q2
  return (u, v) => [a * u + b * v + c, d * u + e * v + f];
}

function readQuad(gray, w, h, quad) {
  const map = squareToQuad(quad);
  const at = (u, v) => { // Mittelwert von 5 Punkten um (u, v) in Rastereinheiten 0 … 7
    let s = 0;
    for (const [du, dv] of [[0, 0], [-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      const [x, y] = map((u + du) / 7, (v + dv) / 7);
      const xi = Math.round(x), yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) return -1;
      s += gray[yi * w + xi];
    }
    return s / 5;
  };
  const cell = [];
  for (let r = 0; r < 7; r++) { cell.push([]); for (let c = 0; c < 7; c++) { const v = at(c + 0.5, r + 0.5); if (v < 0) return null; cell[r].push(v); } }
  let dark = 0, nd = 0;
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if (r === 0 || r === 6 || c === 0 || c === 6) { dark += cell[r][c]; nd++; }
  dark /= nd;
  // heller Rand um das Raster (halbe Einheit außerhalb)
  const quiet = [];
  for (let i = 0; i < 7; i++) quiet.push(at(i + 0.5, -0.55), at(i + 0.5, 7.55), at(-0.55, i + 0.5), at(7.55, i + 0.5));
  if (quiet.some(v => v < 0)) return null;
  const light = quiet.reduce((s, v) => s + v, 0) / quiet.length;
  if (light - dark < 30) return null;
  const thr = (light + dark) / 2;
  let bad = 0;
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) if ((r === 0 || r === 6 || c === 0 || c === 6) && cell[r][c] > thr) bad++;
  if (bad > 1 || quiet.filter(v => v < thr).length > 2) return null;
  let code = 0;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (cell[r + 1][c + 1] < thr) code |= 1 << (24 - (r * 5 + c));
  const m = matchCode(code >>> 0);
  if (!m) return null;
  // Lage k: obere Kante der Karte liegt an Viereckseite k (0 = q0→q1, im Uhrzeigersinn weiter)
  const [cx, cy] = map(0.5, 0.5);
  const a = quad[m.k], b = quad[(m.k + 1) % 4];
  const dx = (a[0] + b[0]) / 2 - cx, dy = (a[1] + b[1]) / 2 - cy;
  const ang = Math.atan2(dy, dx) * 180 / Math.PI; // -90 = oben
  // Zeigt die Kartenoberkante nach oben → A; nach links → B oben; nach unten → C; nach rechts → D
  const dirs = [[-90, 0], [180, 1], [-180, 1], [90, 2], [0, 3]];
  let answer = null;
  for (const [deg, i] of dirs) if (Math.abs(ang - deg) <= 35) answer = i;
  const size = Math.sqrt(polyArea(quad));
  return { card: m.card, answer: answer === null ? null : LETTERS[answer], answerIndex: answer, corners: quad, cx, cy, size };
}

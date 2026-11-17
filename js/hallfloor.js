// Hallenfläche des Hallenplaners: Maße, Umrechnung Meter → Zeichenfläche, Spielfeldmarkierungen.
// Standardhalle 27 m × 15 m (lange Seite quer), schräg von oben gesehen wie die Geräte (hallgear.js):
// Tiefe nach hinten = nach oben, mit waagerechtem Versatz K je Höhe.
// Seit 2.10.0 gibt es eigene Hallen mit anderen Maßen (sport.gyms): geo(halle) legt die Fläche maßstäblich in dieselbe
// Zeichenfläche (größtmöglich, gleiche Verkürzung der Tiefe); die Standardhalle bleibt genau wie bisher.
export const BW = 1600, BH = 740;      // Zeichenfläche (Einheiten der viewBox)
export const K = 0.31;
export const HALL = { len: 27, dep: 15 };
export const FLOOR = { left: 40, top: 190, width: 1380, height: 476 };
FLOOR.bottom = FLOOR.top + FLOOR.height;
export const GYM_LEN = [6, 60], GYM_DEP = [5, 40];   // erlaubte Maße eigener Hallen in m
const n1 = v => Math.round(v * 10) / 10;
const C = FLOOR.height / HALL.dep / (FLOOR.width / HALL.len);   // Verkürzung der Tiefe
const lim = (v, [a, b], d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, Math.round(n * 10) / 10)) : d; };
const geoCache = new Map();
// Geometrie einer Halle ({ len, dep } in m; ohne Angabe die Standardhalle): Fläche in der Zeichenfläche,
// s = Einheiten je Meter (entlang der Länge), fp(x, y) = Bodenpunkt (x von links, y von vorn nach hinten)
export function geo(h) {
  const len = lim(h?.len, GYM_LEN, HALL.len), dep = lim(h?.dep, GYM_DEP, HALL.dep), key = len + 'x' + dep;
  if (geoCache.has(key)) return geoCache.get(key);
  const s = Math.min(FLOOR.width / len, FLOOR.height / (dep * C)), width = len * s, height = dep * C * s;
  const left = FLOOR.left + (FLOOR.width + FLOOR.height * K - width - height * K) / 2, bottom = FLOOR.bottom, top = bottom - height;
  const g = { len, dep, key, s, left, top, width, height, bottom, std: key === HALL.len + 'x' + HALL.dep };
  g.fp = (x, y) => { const dy = y / dep * height; return [left + x / len * width + dy * K, bottom - dy]; };
  g.floorPoints = () => [g.fp(0, dep), g.fp(len, dep), g.fp(len, 0), g.fp(0, 0)].map(p => p.map(n1).join(',')).join(' ');
  // Zeichenfläche → Anteile auf dem Boden (u 0…1 von links, v 0…1 von vorn) und zurück
  g.uv = (x, y) => { const v = (bottom - y) / height; return [(x - left - v * height * K) / width, v]; };
  g.at = (u, v) => [left + u * width + v * height * K, bottom - v * height];
  geoCache.set(key, g); return g;
}
export const STD = geo(HALL);
// Punkt auf dem Boden der Standardhalle: x = 0…27 m von links, y = 0…15 m von vorn nach hinten
export const fp = STD.fp;
export const floorPoints = () => STD.floorPoints();

// ---------- Spielfeldmarkierungen ----------
export const MARKS = [
  { id: 'basketball', label: 'Basketball', color: '#25272e' },
  { id: 'handball', label: 'Handball', color: '#e07b2a' },
  { id: 'volleyball', label: 'Volleyball', color: '#3d6fb5' },
  { id: 'badminton', label: 'Badminton', color: '#2e9a5a' },
  { id: 'fussball', label: 'Hallenfußball', color: '#e07b2a' },
];
const arc = (cx, cy, r, a0, a1, n = 28) => Array.from({ length: n + 1 }, (_, i) => { const t = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [cx + r * Math.cos(t), cy + r * Math.sin(t)]; });
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
// Felder richten sich nach der Halle: höchstens die echten Maße, sonst so groß, wie die Halle mit etwas Rand erlaubt
// (in der Standardhalle genau wie bisher: Handball/Fußball 25 m × 13,5 m mit verkleinertem Torraum, Basketball 26 m × 14 m).
// Handballfeld: auch Grundlage für Hallenfußball
function hb(L, D) {
  const w = Math.min(40, L - 2), d = Math.min(20, D - 1.5), r = Math.min(6, w * 0.2);
  return { x0: (L - w) / 2, x1: (L + w) / 2, y0: (D - d) / 2, y1: (D + d) / 2, goal: Math.min(3, d / 3), r, free: Math.min(9, r + 3), pen: r + 1, keep: r * 0.72, circle: Math.min(3, d / 5.4) };
}
function goalArea(HB, CY, side, r, o = {}) {       // side: -1 links, 1 rechts; Kreisbögen um die Torpfosten, dazwischen gerade
  const x = side < 0 ? HB.x0 : HB.x1, a = side < 0 ? [-90, 0, 90] : [270, 180, 90], g = HB.goal / 2;
  const ps = [...arc(x, CY - g, r, a[0], a[1]), ...arc(x, CY + g, r, a[1], a[2])];
  return { ps: ps.filter(p => p[1] >= HB.y0 - 0.01 && p[1] <= HB.y1 + 0.01), ...o };
}
// Jede Markierung: Liste von Linienzügen in Metern ({ ps, dash })
const DRAW = {
  handball: (L, D) => { const HB = hb(L, D), CX = L / 2, CY = D / 2;
    return [{ ps: rect(HB.x0, HB.y0, HB.x1, HB.y1) }, { ps: [[CX, HB.y0], [CX, HB.y1]] },
      ...[-1, 1].flatMap(s => [goalArea(HB, CY, s, HB.r), goalArea(HB, CY, s, HB.free, { dash: true }),
        { ps: [[(s < 0 ? HB.x0 : HB.x1) - s * HB.pen, CY - 0.5], [(s < 0 ? HB.x0 : HB.x1) - s * HB.pen, CY + 0.5]] },
        { ps: [[(s < 0 ? HB.x0 : HB.x1) - s * HB.keep, CY - 0.15], [(s < 0 ? HB.x0 : HB.x1) - s * HB.keep, CY + 0.15]] }])]; },
  fussball: (L, D) => { const HB = hb(L, D), CX = L / 2, CY = D / 2;
    return [{ ps: rect(HB.x0, HB.y0, HB.x1, HB.y1) }, { ps: [[CX, HB.y0], [CX, HB.y1]] }, { ps: arc(CX, CY, HB.circle, 0, 360, 48) }, { ps: arc(CX, CY, 0.12, 0, 360, 8) },
      ...[-1, 1].flatMap(s => [goalArea(HB, CY, s, HB.r), { ps: arc((s < 0 ? HB.x0 : HB.x1) - s * HB.pen, CY, 0.12, 0, 360, 8) }])]; },
  basketball: (L, D) => {
    const w = Math.min(28, L - 1), d = Math.min(15, D - 1), CX = L / 2, CY = D / 2;
    const x0 = CX - w / 2, x1 = CX + w / 2, y0 = CY - d / 2, y1 = CY + d / 2, out = [{ ps: rect(x0, y0, x1, y1) }, { ps: [[CX, y0], [CX, y1]] }, { ps: arc(CX, CY, 1.8, 0, 360, 48) }];
    [-1, 1].forEach(s => {
      // in kleinen Hallen Freiwurflinie und Drei-Punkte-Bogen verkürzt, damit sie nicht über die Mitte reichen
      const bx = s < 0 ? x0 : x1, dd = -s, hoop = bx + dd * 1.575, ft = bx + dd * Math.min(5.8, w / 2 - 2), r3 = Math.min(6.75, w / 2 - 1.8);
      out.push({ ps: [[bx, CY - 2.45], [ft, CY - 2.45], [ft, CY + 2.45], [bx, CY + 2.45]] });
      out.push({ ps: arc(ft, CY, 1.8, s < 0 ? -90 : 90, s < 0 ? 90 : 270) }, { ps: arc(ft, CY, 1.8, s < 0 ? 90 : -90, s < 0 ? 270 : 90), dash: true });
      // Drei-Punkte-Linie: gerade 0,9 m neben den Seitenlinien, dann Bogen mit 6,75 m um den Korb
      const yy = Math.max(0.5, d / 2 - 0.9), al = Math.asin(Math.min(1, yy / r3)) * 180 / Math.PI, a = arc(hoop, CY, r3, s < 0 ? -al : 180 - al, s < 0 ? al : 180 + al, 36);
      out.push({ ps: [[bx, a[0][1]], ...a, [bx, a.at(-1)[1]]] });
      out.push({ ps: arc(hoop, CY, 0.23, 0, 360, 12) }, { ps: [[bx + dd * 1.2, CY - 0.9], [bx + dd * 1.2, CY + 0.9]] });
    });
    return out;
  },
  volleyball: (L, D) => { const CX = L / 2, CY = D / 2, hw = Math.min(9, (L - 1) / 2), hd = Math.min(4.5, (D - 1) / 2), at = hw / 3;
    return [{ ps: rect(CX - hw, CY - hd, CX + hw, CY + hd) }, { ps: [[CX, CY - hd], [CX, CY + hd]] }, { ps: [[CX - at, CY - hd], [CX - at, CY + hd]] }, { ps: [[CX + at, CY - hd], [CX + at, CY + hd]] }]; },
  // Felder quer zur Halle (je 6,10 m × 13,40 m; in der Standardhalle vier)
  badminton: (L, D) => badmintonCourts({ len: L, dep: D }).flatMap(([x0, y0, l]) => {
    const w = 6.1, x1 = x0 + w, y1 = y0 + l, m = y0 + l / 2, c = x0 + w / 2, k = l / 13.4;
    return [{ ps: rect(x0, y0, x1, y1) }, { ps: [[x0 + 0.46, y0], [x0 + 0.46, y1]] }, { ps: [[x1 - 0.46, y0], [x1 - 0.46, y1]] }, { ps: [[x0, m], [x1, m]] },
      { ps: [[x0, m - 1.98 * k], [x1, m - 1.98 * k]] }, { ps: [[x0, m + 1.98 * k], [x1, m + 1.98 * k]] }, { ps: [[x0, y0 + 0.76 * k], [x1, y0 + 0.76 * k]] }, { ps: [[x0, y1 - 0.76 * k], [x1, y1 - 0.76 * k]] },
      { ps: [[c, y0], [c, m - 1.98 * k]] }, { ps: [[c, m + 1.98 * k], [c, y1]] }];
  }),
};
// linke vordere Ecke und Länge der Badmintonfelder: so viele, wie quer in die Halle passen (höchstens 8)
export function badmintonCourts(h = HALL) {
  const L = h.len, D = h.dep, n = Math.max(1, Math.min(8, Math.floor((L - 0.3) / 6.4))), gap = (L - n * 6.1) / (n + 1), l = Math.min(13.4, D - 0.6);
  return Array.from({ length: n }, (_, k) => [gap + k * (6.1 + gap), (D - l) / 2, l]);
}
const cache = new Map();
export function marksSvg(ids, g = STD) {
  return MARKS.filter(m => ids?.includes(m.id)).map(m => {
    const key = m.id + '|' + g.key;
    if (!cache.has(key)) cache.set(key, DRAW[m.id](g.len, g.dep).map(l => `<polyline points="${l.ps.map(p => g.fp(p[0], p[1]).map(n1).join(',')).join(' ')}"${l.dash ? ' stroke-dasharray="12 9"' : ''}/>`).join(''));
    return `<g class="hf-mark" stroke="${m.color}">${cache.get(key)}</g>`;
  }).join('');
}

// ---------- Pläne bis 1.14 (fast quadratische Fläche) auf die neue Halle umrechnen ----------
const OLD = { top: 110, bottom: 930, left: 60, width: 1230 };
export function fromOldFloor(i) {
  const zone = i.kind === 'zone';
  let w = Number(i.w) || 80, h = Number(i.h) || 80;
  const cx = (Number(i.x) || 0) + w / 2, cy = (Number(i.y) || 0) + h / 2;
  const v = (OLD.bottom - cy) / (OLD.bottom - OLD.top), u = (cx - OLD.left - (OLD.bottom - cy) * K) / OLD.width;
  if (zone) { const d = h * K; h = h * FLOOR.height / (OLD.bottom - OLD.top); w = (w - d) * FLOOR.width / OLD.width + h * K; }
  const ny = FLOOR.bottom - v * FLOOR.height, nx = FLOOR.left + u * FLOOR.width + v * FLOOR.height * K;
  return { ...i, x: Math.round(nx - w / 2), y: Math.round(ny - h / 2), w: Math.round(w), h: Math.round(h) };
}

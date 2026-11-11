// Hallenfläche des Hallenplaners: Maße, Umrechnung Meter → Zeichenfläche, Spielfeldmarkierungen.
// Die Halle ist 27 m × 15 m (lange Seite quer), schräg von oben gesehen wie die Geräte (hallgear.js):
// Tiefe nach hinten = nach oben, mit waagerechtem Versatz K je Höhe.
export const BW = 1600, BH = 740;      // Zeichenfläche (Einheiten der viewBox)
export const K = 0.31;
export const HALL = { len: 27, dep: 15 };
export const FLOOR = { left: 40, top: 190, width: 1380, height: 476 };
FLOOR.bottom = FLOOR.top + FLOOR.height;
const n1 = v => Math.round(v * 10) / 10;
// Punkt auf dem Hallenboden: x = 0…27 m von links, y = 0…15 m von vorn nach hinten
export const fp = (x, y) => { const dy = y / HALL.dep * FLOOR.height; return [FLOOR.left + x / HALL.len * FLOOR.width + dy * K, FLOOR.bottom - dy]; };
export const floorPoints = () => [fp(0, HALL.dep), fp(HALL.len, HALL.dep), fp(HALL.len, 0), fp(0, 0)].map(p => p.map(n1).join(',')).join(' ');

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
const CX = HALL.len / 2, CY = HALL.dep / 2;
// Handballfeld (verkleinert auf die Halle): auch Grundlage für Hallenfußball
const HB = { x0: 1, x1: 26, y0: 0.75, y1: 14.25, goal: 3, r: 5, free: 8 };
function goalArea(side, r, o = {}) {       // side: -1 links, 1 rechts; Kreisbögen um die Torpfosten, dazwischen gerade
  const x = side < 0 ? HB.x0 : HB.x1, a = side < 0 ? [-90, 0, 90] : [270, 180, 90], g = HB.goal / 2;
  const ps = [...arc(x, CY - g, r, a[0], a[1]), ...arc(x, CY + g, r, a[1], a[2])];
  return { ps: ps.filter(p => p[1] >= HB.y0 - 0.01 && p[1] <= HB.y1 + 0.01), ...o };
}
// Jede Markierung: Liste von Linienzügen in Metern ({ ps, dash })
const DRAW = {
  handball: () => [{ ps: rect(HB.x0, HB.y0, HB.x1, HB.y1) }, { ps: [[CX, HB.y0], [CX, HB.y1]] },
    ...[-1, 1].flatMap(s => [goalArea(s, HB.r), goalArea(s, HB.free, { dash: true }),
      { ps: [[(s < 0 ? HB.x0 : HB.x1) - s * 6, CY - 0.5], [(s < 0 ? HB.x0 : HB.x1) - s * 6, CY + 0.5]] },
      { ps: [[(s < 0 ? HB.x0 : HB.x1) - s * 3.6, CY - 0.15], [(s < 0 ? HB.x0 : HB.x1) - s * 3.6, CY + 0.15]] }])],
  fussball: () => [{ ps: rect(HB.x0, HB.y0, HB.x1, HB.y1) }, { ps: [[CX, HB.y0], [CX, HB.y1]] }, { ps: arc(CX, CY, 2.5, 0, 360, 48) }, { ps: arc(CX, CY, 0.12, 0, 360, 8) },
    ...[-1, 1].flatMap(s => [goalArea(s, HB.r), { ps: arc((s < 0 ? HB.x0 : HB.x1) - s * 6, CY, 0.12, 0, 360, 8) }])],
  basketball: () => {
    const x0 = 0.5, x1 = 26.5, y0 = 0.5, y1 = 14.5, out = [{ ps: rect(x0, y0, x1, y1) }, { ps: [[CX, y0], [CX, y1]] }, { ps: arc(CX, CY, 1.8, 0, 360, 48) }];
    [-1, 1].forEach(s => {
      const bx = s < 0 ? x0 : x1, d = -s, hoop = bx + d * 1.575, ft = bx + d * 5.8;
      out.push({ ps: [[bx, CY - 2.45], [ft, CY - 2.45], [ft, CY + 2.45], [bx, CY + 2.45]] });
      out.push({ ps: arc(ft, CY, 1.8, s < 0 ? -90 : 90, s < 0 ? 90 : 270) }, { ps: arc(ft, CY, 1.8, s < 0 ? 90 : -90, s < 0 ? 270 : 90), dash: true });
      // Drei-Punkte-Linie: gerade 0,9 m neben den Seitenlinien, dann Bogen mit 6,75 m um den Korb
      const yy = (y1 - y0) / 2 - 0.9, al = Math.asin(yy / 6.75) * 180 / Math.PI, a = arc(hoop, CY, 6.75, s < 0 ? -al : 180 - al, s < 0 ? al : 180 + al, 36);
      out.push({ ps: [[bx, a[0][1]], ...a, [bx, a.at(-1)[1]]] });
      out.push({ ps: arc(hoop, CY, 0.23, 0, 360, 12) }, { ps: [[bx + d * 1.2, CY - 0.9], [bx + d * 1.2, CY + 0.9]] });
    });
    return out;
  },
  volleyball: () => [{ ps: rect(CX - 9, CY - 4.5, CX + 9, CY + 4.5) }, { ps: [[CX, CY - 4.5], [CX, CY + 4.5]] }, { ps: [[CX - 3, CY - 4.5], [CX - 3, CY + 4.5]] }, { ps: [[CX + 3, CY - 4.5], [CX + 3, CY + 4.5]] }],
  // vier Felder quer zur Halle (je 6,10 m × 13,40 m)
  badminton: () => badmintonCourts().flatMap(([x0, y0]) => {
    const w = 6.1, l = 13.4, x1 = x0 + w, y1 = y0 + l, m = y0 + l / 2, c = x0 + w / 2;
    return [{ ps: rect(x0, y0, x1, y1) }, { ps: [[x0 + 0.46, y0], [x0 + 0.46, y1]] }, { ps: [[x1 - 0.46, y0], [x1 - 0.46, y1]] }, { ps: [[x0, m], [x1, m]] },
      { ps: [[x0, m - 1.98], [x1, m - 1.98]] }, { ps: [[x0, m + 1.98], [x1, m + 1.98]] }, { ps: [[x0, y0 + 0.76], [x1, y0 + 0.76]] }, { ps: [[x0, y1 - 0.76], [x1, y1 - 0.76]] },
      { ps: [[c, y0], [c, m - 1.98]] }, { ps: [[c, m + 1.98], [c, y1]] }];
  }),
};
// linke vordere Ecke der vier Badmintonfelder
export function badmintonCourts() { const gap = (HALL.len - 4 * 6.1) / 5; return [0, 1, 2, 3].map(k => [gap + k * (6.1 + gap), (HALL.dep - 13.4) / 2]); }
const cache = new Map();
export function marksSvg(ids) {
  return MARKS.filter(m => ids?.includes(m.id)).map(m => {
    if (!cache.has(m.id)) cache.set(m.id, DRAW[m.id]().map(l => `<polyline points="${l.ps.map(p => fp(p[0], p[1]).map(n1).join(',')).join(' ')}"${l.dash ? ' stroke-dasharray="12 9"' : ''}/>`).join(''));
    return `<g class="hf-mark" stroke="${m.color}">${cache.get(m.id)}</g>`;
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

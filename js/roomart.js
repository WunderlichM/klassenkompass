// Zeichnungen der Raumteile (seit 2.9.0): Draufsichten als SVG, Maße in Zentimetern. Jedes Teil wird in einer
// Grundlage gezeichnet – u entlang der langen Seite (0 … L), v von der Wand in den Raum (0 … D) – und dann so gedreht,
// dass seine Vorderseite in den Raum zeigt (f: 's' Wand oben, 'n' Wand unten, 'e' Wand links, 'w' Wand rechts).
const n1 = v => Math.round(v * 10) / 10;
const R = (x, y, w, h, fill, extra = '') => `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(Math.max(0, w))}" height="${n1(Math.max(0, h))}" fill="${fill}" ${extra}/>`;
const C = (x, y, r, fill, extra = '') => `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="${fill}" ${extra}/>`;
const LN = (x1, y1, x2, y2, stroke, sw = 1, extra = '') => `<line x1="${n1(x1)}" y1="${n1(y1)}" x2="${n1(x2)}" y2="${n1(y2)}" stroke="${stroke}" stroke-width="${sw}" ${extra}/>`;
const WOOD = '#dcc198', WOOD_EDGE = '#a8885a', METAL = '#b4bac1', METAL_EDGE = '#7d858e', CHAIR = '#55606d', CHAIR_BACK = '#353e49';

const PARTS = {
  // Kreidetafel: Rahmen, grüne Fläche, Ablage mit Kreide und Schwamm
  board(L, D) {
    const t = D * 0.62, tray = D - t;
    return R(0, 0, L, t, METAL, `stroke="${METAL_EDGE}" stroke-width="1" rx="1.5"`) + R(2, 1.6, L - 4, t - 3.2, '#2f5f4c') +
      LN(L * 0.08, t * 0.55, L * 0.3, t * 0.55, 'rgba(255,255,255,.35)', 0.9, 'stroke-linecap="round"') + LN(L * 0.36, t * 0.45, L * 0.5, t * 0.45, 'rgba(255,255,255,.25)', 0.9, 'stroke-linecap="round"') +
      R(4, t, L - 8, tray, '#d5d9dd', `stroke="${METAL_EDGE}" stroke-width=".8" rx="1"`) +
      R(L * 0.62, t + tray * 0.25, 9, tray * 0.45, '#fff', 'rx="1"') + R(L * 0.62 + 12, t + tray * 0.25, 7, tray * 0.45, '#f6d7d0', 'rx="1"') + R(L * 0.74, t + tray * 0.12, 15, tray * 0.72, '#e8c64f', 'stroke="#b6962f" stroke-width=".6" rx="1.5"');
  },
  // Bildschirm an der Wand: Halterung und dunkles, glänzendes Display
  screen(L, D) {
    const a = D * 0.3, t = D - a;
    return R(L / 2 - 14, 0, 28, a + 1, '#8a9099') + R(0, a, L, t, '#14171b', 'stroke="#454b53" stroke-width="1.4" rx="2"') +
      `<polygon points="${n1(L * 0.08)},${n1(a + 1)} ${n1(L * 0.3)},${n1(a + 1)} ${n1(L * 0.2)},${n1(D - 1)} ${n1(L * 0.04)},${n1(D - 1)}" fill="rgba(255,255,255,.13)"/>` + C(L - 6, D - t * 0.3, 1.2, '#4fd17c');
  },
  // Weiße Tafel mit Beamer davor: Tafel an der Wand, Arm, Beamer, angedeuteter Lichtkegel
  beamboard(L, D) {
    const b = Math.min(20, D * 0.3), bw = Math.min(46, L * 0.3), bh = Math.min(32, (D - b) * 0.55), by = D - bh, cx = L / 2;
    return `<polygon points="${n1(cx - 6)},${n1(by + 3)} ${n1(cx + 6)},${n1(by + 3)} ${n1(L - 5)},${n1(b)} 5,${n1(b)}" fill="rgba(255,226,130,.26)"/>` +
      R(0, 0, L, b * 0.72, '#fafbfc', `stroke="${METAL_EDGE}" stroke-width="1.2" rx="1.5"`) + R(4, b * 0.72, L - 8, b * 0.28, '#d5d9dd', `stroke="${METAL_EDGE}" stroke-width=".8" rx="1"`) +
      R(L * 0.66, b * 0.76, 10, b * 0.18, '#2d6cb0', 'rx="1"') + R(L * 0.66 + 13, b * 0.76, 10, b * 0.18, '#c0392b', 'rx="1"') +
      R(cx - 2.5, 0, 5, by + 2, '#8a9099') + R(cx - bw / 2, by, bw, bh, '#eceef1', `stroke="${METAL_EDGE}" stroke-width="1.2" rx="${n1(bh * 0.18)}"`) +
      C(cx, by + bh * 0.2, Math.min(5, bh * 0.2), '#27303a', 'stroke="#8a9099" stroke-width="1"') + LN(cx - bw * 0.3, by + bh * 0.72, cx + bw * 0.3, by + bh * 0.72, '#b4bac1', 1.2) + LN(cx - bw * 0.3, by + bh * 0.84, cx + bw * 0.3, by + bh * 0.84, '#b4bac1', 1.2);
  },
  // Schreibtisch der Lehrkraft: Platte, Bildschirm, Tastatur, Maus, Heft, Stift, Stiftebecher; Stuhl an der Wandseite
  desk(L, D, o) {
    const s = Math.min(L / 160, D / 80), mx = L * 0.36;
    const chair = o.chair ? R(L / 2 - 23 * s, -40 * s, 46 * s, 44 * s, CHAIR, `rx="${n1(8 * s)}"`) + R(L / 2 - 25 * s, -47 * s, 50 * s, 9 * s, CHAIR_BACK, `rx="${n1(4 * s)}"`) : '';
    return chair + R(0, 0, L, D, WOOD, `stroke="${WOOD_EDGE}" stroke-width="1.4" rx="${n1(3 * s)}"`) + LN(6, D * 0.33, L - 6, D * 0.33, 'rgba(120,90,50,.16)', 0.8) + LN(6, D * 0.7, L - 6, D * 0.7, 'rgba(120,90,50,.16)', 0.8) +
      // Bildschirm (von oben: schmale Leiste mit Fuß)
      R(mx - 9 * s, D * 0.74, 18 * s, 11 * s, '#5d646d', `rx="${n1(2 * s)}"`) + R(mx - 28 * s, D * 0.7, 56 * s, 5 * s, '#1b1f24', `rx="${n1(1.5 * s)}"`) +
      // Tastatur und Maus
      R(mx - 22 * s, D * 0.26, 44 * s, 14 * s, '#eef0f2', `stroke="#9aa1a9" stroke-width=".8" rx="${n1(2 * s)}"`) + LN(mx - 18 * s, D * 0.26 + 4.6 * s, mx + 18 * s, D * 0.26 + 4.6 * s, '#b9bfc6', 0.8) + LN(mx - 18 * s, D * 0.26 + 9.2 * s, mx + 18 * s, D * 0.26 + 9.2 * s, '#b9bfc6', 0.8) +
      `<ellipse cx="${n1(mx + 33 * s)}" cy="${n1(D * 0.26 + 7 * s)}" rx="${n1(3.6 * s)}" ry="${n1(5.6 * s)}" fill="#3b424b"/>` +
      // Heft mit Stift
      `<g transform="rotate(-7 ${n1(L * 0.72)} ${n1(D * 0.36)})">${R(L * 0.72 - 12 * s, D * 0.36 - 16 * s, 24 * s, 32 * s, '#fff', 'stroke="#b9bfc6" stroke-width=".8" rx="1"')}${[0.3, 0.45, 0.6, 0.75].map(k => LN(L * 0.72 - 8 * s, D * 0.36 - 16 * s + 32 * s * k, L * 0.72 + 8 * s, D * 0.36 - 16 * s + 32 * s * k, '#c9d3e2', 0.7)).join('')}</g>` +
      LN(L * 0.83, D * 0.2, L * 0.86, D * 0.5, '#c0392b', 1.8 * s, 'stroke-linecap="round"') +
      // Stiftebecher
      C(L * 0.86, D * 0.76, 6 * s, '#2f6f9f', 'stroke="#1f4f74" stroke-width=".8"') + LN(L * 0.86 - 2 * s, D * 0.76, L * 0.86 - 6 * s, D * 0.76 - 8 * s, '#e0a526', 1.6 * s, 'stroke-linecap="round"') + LN(L * 0.86 + 1 * s, D * 0.76 - 1 * s, L * 0.86 + 6 * s, D * 0.76 - 7 * s, '#2e8b57', 1.6 * s, 'stroke-linecap="round"');
  },
  // Schrank: Korpus, Türen an der Vorderseite mit Fugen und Griffen
  cabinet(L, D) {
    const doors = Math.max(2, Math.round(L / 50)), dw = L / doors, f = Math.min(7, D * 0.22);
    let s = R(0, 0, L, D, '#cfb084', `stroke="${WOOD_EDGE}" stroke-width="1.4" rx="1.5"`) + R(2.5, 2.5, L - 5, D - f - 4, '#dcc198', 'rx="1"') + R(0.7, D - f, L - 1.4, f - 0.7, '#b8935f');
    for (let i = 1; i < doors; i++) s += LN(i * dw, D - f, i * dw, D, '#7b5d38', 1);
    for (let i = 0; i < doors; i++) { const hx = i % 2 ? i * dw + 4 : (i + 1) * dw - 9; s += R(hx, D - 1, 5, 2.6, '#4a4f55', 'rx="1"'); }
    return s;
  },
  // Tür: Zarge, offenes Türblatt in den Raum, Öffnungsbogen
  door: (L, D, o) => doorArt(L, D, { post: '#6f5a45', leaf: '#bd8a55', edge: '#8a6037', sill: '#ece6da', knob: '#d9dde1' }),
  glassdoor: (L, D, o) => doorArt(L, D, { post: '#8d96a0', leaf: 'rgba(150,205,238,.62)', edge: '#5b8db3', sill: '#dcebf5', knob: '#6f7882', glass: true }),
  // Fenster: Rahmen, Glasscheiben mit Lichtreflex, Fensterbank zum Raum
  window(L, D) {
    const panes = Math.max(1, Math.round(L / 80)), pw = (L - 3) / panes;
    let s = R(-2, D - 1, L + 4, 3.5, '#f1f3f5', 'stroke="#aeb5bc" stroke-width=".7" rx="1"') + R(0, 0, L, D, '#e9ecef', `stroke="${METAL_EDGE}" stroke-width="1.2" rx="1"`);
    for (let i = 0; i < panes; i++) {
      const x = 1.5 + i * pw + 1.5, w = pw - 3;
      s += R(x, 3, w, D - 6, '#b7dcf4', 'stroke="#7fb0d2" stroke-width=".7"') + LN(x + w * 0.2, D - 4, x + w * 0.32, 4, 'rgba(255,255,255,.75)', 1.6, 'stroke-linecap="round"');
    }
    return s;
  },
};
function doorArt(L, D, c) {
  const r = L - 6, y0 = D / 2;
  return R(0, 0, L, D, c.sill) + R(0, 0, 4.5, D, c.post) + R(L - 4.5, 0, 4.5, D, c.post) +
    `<path d="M ${n1(4.5 + 2.5)} ${n1(y0 + r)} A ${n1(r)} ${n1(r)} 0 0 0 ${n1(L - 2)} ${n1(y0)}" fill="none" stroke="#8a9199" stroke-width="1.1" stroke-dasharray="5 4"/>` +
    R(4.5, y0, 5, r, c.leaf, `stroke="${c.edge}" stroke-width="1.1" rx="1"`) + (c.glass ? LN(7, y0 + r * 0.12, 7, y0 + r * 0.88, 'rgba(255,255,255,.8)', 1) : '') +
    R(9.5, y0 + r - 16, 3.2, 9, c.knob, 'stroke="#6f7882" stroke-width=".5" rx="1.4"');
}
export const ART_KINDS = Object.keys(PARTS);
// Wohin die Vorderseite zeigt: weg von der nächsten Wand (quer liegende Teile oben/unten, hochkant links/rechts)
export const facing = (x, y, w, h, W, H) => (w >= h ? (y + h / 2 < H / 2 ? 's' : 'n') : (x + w / 2 < W / 2 ? 'e' : 'w'));
// Zeichnung eines Teils: w, h in Metern (so wie es im Raum liegt), f = Richtung der Vorderseite
export function art(kind, w, h, f = 's', o = {}) {
  const draw = PARTS[kind]; if (!draw) return '';
  const hor = f === 's' || f === 'n', L = (hor ? w : h) * 100, D = (hor ? h : w) * 100;
  const m = { s: '', n: `matrix(-1 0 0 -1 ${n1(L)} ${n1(D)})`, e: `matrix(0 -1 1 0 0 ${n1(L)})`, w: `matrix(0 1 -1 0 ${n1(D)} 0)` }[f];
  return `<svg class="rp-art" viewBox="0 0 ${n1(w * 100)} ${n1(h * 100)}" preserveAspectRatio="none" aria-hidden="true"><g ${m ? `transform="${m}"` : ''}>${draw(L, D, o)}</g></svg>`;
}
// Stühle (oder Hocker an der Werkbank) an den Seiten eines Tisches: sides = [{ side: 's'|'n'|'e'|'w', n }]
export function chairs(w, h, sides, { stool = false, vise = false } = {}) {
  const W = w * 100, H = h * 100;
  const g = sides.map(({ side, n }, k) => {
    const len = side === 's' || side === 'n' ? W : H, dep = side === 's' || side === 'n' ? H : W, cw = Math.min(40, (len / n) * 0.62);
    const m = { s: `matrix(1 0 0 1 0 ${n1(H)})`, n: `matrix(-1 0 0 -1 ${n1(W)} 0)`, e: `matrix(0 -1 1 0 ${n1(W)} ${n1(H)})`, w: 'matrix(0 1 -1 0 0 0)' }[side];
    let s = '';
    for (let i = 0; i < n; i++) {
      const cx = (len * (i + 0.5)) / n;
      s += stool ? C(cx, 22, Math.min(17, cw / 2), '#c9a877', 'stroke="#7d5c36" stroke-width="1.4"') + C(cx, 22, Math.min(17, cw / 2) * 0.5, 'none', 'stroke="rgba(90,60,25,.3)" stroke-width=".8"')
        : R(cx - cw / 2, -12, cw, 36, CHAIR, 'rx="6"') + R(cx - cw / 2 - 1.5, 19, cw + 3, 7, CHAIR_BACK, 'rx="3.5"');
    }
    // Schraubstock (Holzzange) an der Werkbank: an der Stirnseite links vom Sitzenden (a < 0), Backen quer zur Bank
    if (vise && k === 0) s += R(-13, -dep * 0.85, 15, dep * 0.7, '#b98a55', 'stroke="#7d5c36" stroke-width="1.4" rx="1.5"') + LN(-6, -dep * 0.85, -6, -dep * 0.15, 'rgba(90,60,25,.55)', 1);
    return `<g transform="${m}">${s}</g>`;
  }).join('');
  return `<svg class="rp-art rp-chairs" viewBox="0 0 ${n1(W)} ${n1(H)}" preserveAspectRatio="none" aria-hidden="true">${g}</svg>`;
}

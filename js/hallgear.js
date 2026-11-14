// Gerätekatalog für den Hallenplaner: eigene, einfache Zeichnungen (keine fremden Bilder).
// Jedes Gerät wird aus einfachen Körpern (Quader, Stangen, Scheiben, Kugeln) in Metern beschrieben und
// in derselben Schrägansicht wie die Hallenfläche gezeichnet: Tiefe nach hinten = nach oben mit dem
// waagerechten Versatz K, Höhe senkrecht nach oben. Vorderseite, rechte Seite und Oberseite sind sichtbar.
import { K, FLOOR, HALL } from './hallfloor.js';
export { K };
const U = 110;            // Zeichen-Einheiten je Meter (im Plan auf den Maßstab der Halle verkleinert, siehe scaleOf)
const F = 0.62;           // Verkürzung der Tiefe
const SW = 3.5, INK = '#1f2a3c';
const n1 = v => Math.round(v * 10) / 10;

// ---------- Farben ----------
const rgb = c => { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const mix = (c, t, f) => { const a = rgb(c), b = rgb(t); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * f).toString(16).padStart(2, '0')).join(''); };
const light = (c, f = 0.2) => mix(c, '#ffffff', f), dark = (c, f = 0.18) => mix(c, '#000000', f);
const C = { wood: '#dcb27a', woodD: '#b8874f', mat: '#3f78b8', soft: '#8bb6e2', leather: '#93593a', metal: '#b3bac3', metalD: '#69727e',
  white: '#f7f7f4', red: '#c94040', orange: '#e07b2a', yellow: '#e8c33a', green: '#4f8f5b', black: '#2b2f36', rope: '#d9b77e',
  board: '#2f5d4a', tt: '#2f6f9a', curtain: '#8aa293', shadow: '#c9ced6', hole: '#c3c8d0' };

// ---------- Zeichenwerkzeug ----------
// swap: Gerät um 90° auf dem Boden gedreht (Länge nach hinten), die Reihenfolge der Teile ergibt sich aus der Tiefe.
// mx / my: zusätzlich in der Breite bzw. Tiefe gespiegelt (Gerät von der anderen Seite bzw. von hinten gesehen).
function builder(swap, mx = false, my = false) {
  const items = []; let grp = null, seq = 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ext = (x, y, pad = SW / 2) => { x0 = Math.min(x0, x - pad); y0 = Math.min(y0, y - pad); x1 = Math.max(x1, x + pad); y1 = Math.max(y1, y + pad); };
  const W = (x, y, z) => { const p = [(x + y * F * K) * U, -(y * F + z) * U]; ext(p[0], p[1]); return p; };
  const sw = (x, y) => { const a = swap ? y : x, c = swap ? x : y; return [mx ? -a : a, my ? -c : c]; };
  const P = (x, y, z) => { const [a, c] = sw(x, y); return W(a, c, z); };
  const pts = ps => ps.map(p => `${n1(p[0])},${n1(p[1])}`).join(' ');
  const keyOf = ps3 => { let a = Infinity, c = Infinity, z = Infinity; ps3.forEach(([x, y, zz]) => { const [wx, wy] = sw(x, y); a = Math.min(a, wx); c = Math.min(c, wy); z = Math.min(z, zz); }); return [a, c, z]; };
  const put = (svg, [wx, wy, z], layer = 0) => { if (grp) grp.push(svg); else items.push({ k: [layer, -wy, z, wx], s: seq++, svg }); };
  const hc = (cx, cy, z, r, n = 36) => Array.from({ length: n }, (_, i) => { const t = i / n * 2 * Math.PI; return [cx + r * Math.cos(t), cy + r * Math.sin(t), z]; });
  const b = {
    swap, P, pts, back: my && !swap,
    // Vorderseite des Geräts (y = 0) ist zu sehen
    front: swap ? mx : !my,
    // gewölbter Körper aus ebenen Flächen ([Punkte, Farbe]): gezeichnet werden nur die Flächen zum Betrachter hin
    solid(faces, at = [0, 0, 0], layer = 0) {
      const T = p => { const [a, c] = sw(p[0], p[1]); return [a, c, p[2]]; }, all = faces.flatMap(f => f[0]).map(T);
      const mid = [0, 1, 2].map(k => all.reduce((v, p) => v + p[k], 0) / all.length), view = [F * K, -1, F];
      const vis = faces.filter(([ps]) => { const q = ps.map(T), u = [0, 1, 2].map(k => q[1][k] - q[0][k]), w = [0, 1, 2].map(k => q[2][k] - q[0][k]);
        let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const c = [0, 1, 2].map(k => q.reduce((v, p) => v + p[k], 0) / q.length);
        if (n.reduce((v, x, k) => v + x * (c[k] - mid[k]), 0) < 0) n = n.map(x => -x);
        return n.reduce((v, x, k) => v + x * view[k], 0) > 1e-6; });
      put(vis.map(([ps, fill]) => `<polygon points="${pts(ps.map(p => P(...p)))}" fill="${fill}"/>`).join(''), keyOf(faces.flatMap(f => f[0])), layer);
    },
    // Teile, die immer in dieser Reihenfolge zusammen gezeichnet werden
    group(at, fn, layer = 0) { const g = [], prev = grp; grp = g; fn(); grp = prev; put(g.join(''), keyOf([at]), layer); },
    poly(ps3, fill, o = {}) { put(`<polygon points="${pts(ps3.map(p => P(...p)))}" fill="${fill}"${o.sw ? ` stroke-width="${o.sw}"` : ''}${o.stroke ? ` stroke="${o.stroke}"` : ''}/>`, keyOf(ps3), o.layer); },
    box(x, y, z, lx, ly, lz, c, o = {}) {
      const at = keyOf([[x, y, z], [x + lx, y + ly, z]]);
      if (swap) { [x, y] = [y, x]; [lx, ly] = [ly, lx]; }
      if (mx) x = -(x + lx);
      if (my) y = -(y + ly);
      // Farben gelten für die Seiten des Geräts (front = Vorderseite, back = Rückseite), nicht für die Lage im Bild
      const fFace = swap ? o.side : (my ? o.back : o.front), sFace = swap ? (mx ? o.front : o.back) : o.side;
      const X = x + lx, Y = y + ly, Z = z + lz;
      const fr = [W(x, y, z), W(X, y, z), W(X, y, Z), W(x, y, Z)], sd = [W(X, y, z), W(X, Y, z), W(X, Y, Z), W(X, y, Z)], tp = [W(x, y, Z), W(X, y, Z), W(X, Y, Z), W(x, Y, Z)];
      let s = `<polygon points="${pts(fr)}" fill="${fFace || c}"/><polygon points="${pts(sd)}" fill="${sFace || dark(c)}"/><polygon points="${pts(tp)}" fill="${o.top || light(c)}"/>`;
      (o.seams || []).forEach(h => { s += `<polyline points="${pts([W(x, y, z + h), W(X, y, z + h), W(X, Y, z + h)])}" fill="none" stroke-width="2.5"/>`; });
      if (o.inset) { const d = o.inset; s += `<polygon points="${pts([W(x + d, y + d * 1.3, Z), W(X - d, y + d * 1.3, Z), W(X - d, Y - d * 1.3, Z), W(x + d, Y - d * 1.3, Z)])}" fill="none" stroke="${dark(o.top || light(c), 0.3)}" stroke-width="2"/>`; }
      if (o.hole) { const d = o.hole; s += `<polygon points="${pts([W(x + d, y + d, Z), W(X - d, y + d, Z), W(X - d, Y - d, Z), W(x + d, Y - d, Z)])}" fill="${C.hole}" stroke-width="2.5"/>`; }
      // Griffmulden an den Stirnseiten (quer: rechte Seite, längs: Vorderseite)
      (o.slots || []).forEach(zc => {
        const hh = 0.03;
        const q = !swap ? (() => { const m = y + ly / 2, w = ly * 0.22; return [W(X, m - w, zc - hh), W(X, m + w, zc - hh), W(X, m + w, zc + hh), W(X, m - w, zc + hh)]; })()
          : (() => { const m = x + lx / 2, w = lx * 0.22; return [W(m - w, y, zc - hh), W(m + w, y, zc - hh), W(m + w, y, zc + hh), W(m - w, y, zc + hh)]; })();
        s += `<polygon points="${pts(q)}" fill="${dark(c, 0.45)}" stroke-width="2"/>`;
      });
      put(s, at, o.layer);
    },
    // Stange mit Kontur; stripe = [Farbe, Anzahl] für rot-weiße Abschnitte
    rod(a, e, w, c, o = {}) {
      const p = P(...a), q = P(...e); ext(p[0], p[1], w / 2 + 3); ext(q[0], q[1], w / 2 + 3);
      const L = (s, wd, col) => `<line x1="${n1(s[0][0])}" y1="${n1(s[0][1])}" x2="${n1(s[1][0])}" y2="${n1(s[1][1])}" stroke-width="${wd}"${col ? ` stroke="${col}"` : ''}/>`;
      let s = L([p, q], w + 5) + L([p, q], w, c);
      if (o.stripe) { const [c2, n] = o.stripe; for (let i = 1; i < n; i += 2) { const t0 = i / n, t1 = (i + 1) / n, A = [p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0], B = [p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1]; s += `<line x1="${n1(A[0])}" y1="${n1(A[1])}" x2="${n1(B[0])}" y2="${n1(B[1])}" stroke-width="${w}" stroke="${c2}" stroke-linecap="butt"/>`; } }
      put(s, keyOf([a, e]), o.layer);
    },
    // dünne Linie ohne Kontur (Netze, Markierungen)
    line(a, e, w, c, o = {}) { const p = P(...a), q = P(...e); put(`<line x1="${n1(p[0])}" y1="${n1(p[1])}" x2="${n1(q[0])}" y2="${n1(q[1])}" stroke="${c}" stroke-width="${w}"/>`, keyOf([a, e]), o.layer); },
    // Linienzug mit Kontur (Reifen, Seile)
    curve(ps3, w, c, o = {}) { const ps = ps3.map(p => P(...p)); ps.forEach(p => ext(p[0], p[1], w / 2 + 3)); const tag = o.closed ? 'polygon' : 'polyline';
      put(`<${tag} points="${pts(ps)}" fill="none" stroke-width="${w + 5}"/><${tag} points="${pts(ps)}" fill="none" stroke="${c}" stroke-width="${w}"/>`, keyOf(ps3), o.layer); },
    hcircle: hc,
    vcircle(cx, cy, cz, r, plane = 'x', n = 32) { return Array.from({ length: n }, (_, i) => { const t = i / n * 2 * Math.PI; return plane === 'x' ? [cx + r * Math.cos(t), cy, cz + r * Math.sin(t)] : [cx, cy + r * Math.cos(t), cz + r * Math.sin(t)]; }); },
    disc(cx, cy, z, r, fill, o = {}) { b.poly(hc(cx, cy, z, r), fill, o); },
    // Kugel (Ball): Kreis um den Mittelpunkt, deco zeichnet Muster im Bildschirmmaß
    sphere(cx, cy, r, fill, deco, o = {}) {
      if (o.shadow !== false) b.disc(cx, cy, 0, r * 0.95, C.shadow, { stroke: 'none', layer: -1 });
      const p = P(cx, cy, r), R = r * U; ext(p[0] - R, p[1] - R); ext(p[0] + R, p[1] + R);
      put(`<circle cx="${n1(p[0])}" cy="${n1(p[1])}" r="${n1(R)}" fill="${fill}"/>${deco ? deco(p[0], p[1], R) : ''}`, keyOf([[cx - r, cy - r, 0]]), o.layer);
    },
    // Kegel (Hütchen, seit 2.8.0 mit Schatten, Fußplatte, Licht und Schatten, Streifen und Öffnung an der Spitze):
    // vordere Hälfte des Fußkreises bis zur Spitze
    cone(cx, cy, r, h, c, o = {}) {
      const [wx, wy] = sw(cx, cy), t1 = Math.atan(F * K), t2 = t1 + Math.PI, z0 = h * 0.06, top = h * 0.94;
      const arc = (rr, z, rev, a0 = 0, a1 = 1, n = 16) => { const a = []; for (let i = 0; i <= n; i++) { const t = t2 + (t1 + 2 * Math.PI - t2) * (a0 + (a1 - a0) * i / n); a.push(W(wx + rr * Math.cos(t), wy + rr * Math.sin(t), z)); } return rev ? a.reverse() : a; };
      const rAt = z => r * (1 - (z - z0) / (h - z0)) + r * 0.14 * ((z - z0) / (h - z0));   // oben bleibt eine kleine Öffnung
      const shadow = hc(wx + r * 0.25, wy - r * 0.15, 0, r * 1.35).map(p => W(...p));
      let s = `<polygon points="${pts(shadow)}" fill="${C.shadow}" stroke="none" opacity=".75"/>`;
      // Fußplatte: Kante und Oberseite
      s += `<polygon points="${pts([...arc(r * 1.25, 0), ...arc(r * 1.25, z0, true)])}" fill="${dark(c, 0.35)}" stroke="none"/>`;
      s += `<polygon points="${pts(hc(wx, wy, z0, r * 1.25).map(p => W(...p)))}" fill="${dark(c, 0.12)}" stroke-width="2.5"/>`;
      // Kegel mit Licht von links und Schatten rechts
      const cone = (a0, a1, fill, extra = '') => `<polygon points="${pts([...arc(r, z0, false, a0, a1), ...arc(rAt(top), top, true, a0, a1)])}" fill="${fill}"${extra}/>`;
      s += cone(0, 1, c, ' stroke-width="3"') + cone(0.62, 1, dark(c, 0.16), ' stroke="none"') + cone(0.16, 0.3, light(c, 0.35), ' stroke="none"');
      // weißer Streifen
      const za = h * 0.4, zb = h * 0.6;
      s += `<polygon points="${pts([...arc(rAt(za), za), ...arc(rAt(zb), zb, true)])}" fill="${C.white}" stroke-width="2"/>`;
      s += `<polygon points="${pts([...arc(rAt(za), za, false, 0.62, 1), ...arc(rAt(zb), zb, true, 0.62, 1)])}" fill="#d9dde3" stroke="none"/>`;
      // Öffnung an der Spitze
      s += `<polygon points="${pts(hc(wx, wy, top, rAt(top)).map(p => W(...p)))}" fill="${dark(c, 0.5)}" stroke-width="2"/>`;
      put(s, [wx - r, wy - r, 0], o.layer);
    },
    // fertiges SVG (Punkte bereits mit P berechnet); p/R erweitern den Rahmen für Kreise
    raw(svg, p, R = 0, at = [0, 0, 0], layer = 0) { if (p) { ext(p[0] - R, p[1] - R); ext(p[0] + R, p[1] + R); } put(svg, keyOf([at]), layer); },
    finish() {
      items.sort((a, c) => a.k[0] - c.k[0] || a.k[1] - c.k[1] || a.k[2] - c.k[2] || a.k[3] - c.k[3] || a.s - c.s);
      return { svg: items.map(i => i.svg).join(''), x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },
  };
  return b;
}

// ---------- Bausteine ----------
const bench = (b, L, legs) => {
  const lh = 0.3, xs = legs === 3 ? [0.14, L / 2 - 0.03, L - 0.2] : [0.14, L - 0.2];
  b.box(0.16, 0.09, 0.07, L - 0.32, 0.08, 0.05, C.woodD);
  xs.forEach(x => b.box(x, 0.03, 0, 0.06, 0.2, lh, C.woodD));
  b.box(0, 0, lh, L, 0.26, 0.045, C.wood);
};
const benchFlip = (b, L, legs) => {
  const xs = legs === 3 ? [0.14, L / 2 - 0.03, L - 0.2] : [0.14, L - 0.2];
  b.box(0, 0, 0, L, 0.26, 0.045, C.wood);
  xs.forEach(x => b.box(x, 0.03, 0.045, 0.06, 0.2, 0.26, C.woodD));
  b.box(0.08, 0.085, 0.305, L - 0.16, 0.09, 0.05, C.woodD, { layer: 1 });
};
const kasten = (b, n) => {
  const L = 1.0, D = 0.72, hb = 0.2 * (n - 1);
  const seams = Array.from({ length: n - 2 }, (_, i) => 0.2 * (i + 1)), slots = Array.from({ length: n - 1 }, (_, i) => 0.2 * i + 0.1);
  b.group([0, 0, 0], () => {
    b.box(0, 0, 0, L, D, hb, C.wood, { seams, slots });
    b.box(-0.02, -0.02, hb, L + 0.04, D + 0.04, 0.12, C.wood, { top: C.leather, slots: [hb + 0.06] });
  });
};
const wall = (b, fields) => {
  const fw = 0.95, xs = Array.from({ length: fields + 1 }, (_, i) => i * fw);
  for (let z = 0.25; z < 2.2; z += 0.19) b.rod([0, 0.04, z], [fields * fw, 0.04, z], 5, C.wood);
  xs.forEach(x => b.box(x - 0.04, 0, 0, 0.08, 0.08, 2.3, C.wood));
};
const barren = (b, L, hi) => {
  const yb = hi ? 1.2 : 0.5, zf = 1.45, zb = hi ? 2.2 : 1.45;
  [0.45, L - 0.55].forEach(x => b.box(x, -0.12, 0, 0.12, yb + 0.34, 0.07, C.metalD, { layer: -1 }));
  [[0.5, yb + 0.03, zb], [L - 0.5, yb + 0.03, zb], [0.5, 0.03, zf], [L - 0.5, 0.03, zf]].forEach(([x, y, z]) => b.rod([x, y, 0.07], [x, y, z - 0.02], 7, C.metal));
  b.box(0, yb, zb, L, 0.06, 0.07, C.wood);
  b.box(0, 0, zf, L, 0.06, 0.07, C.wood);
};
const net = (b, x0, x1, y, z0, z1) => {
  b.group([x0, y, z0], () => {
    b.poly([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], '#ffffff', { sw: 2 });
    for (let x = x0 + 0.15; x < x1; x += 0.15) b.line([x, y, z0], [x, y, z1 - 0.08], 1.4, '#7c8694');
    for (let z = z0 + 0.15; z < z1 - 0.08; z += 0.15) b.line([x0, y, z], [x1, y, z], 1.4, '#7c8694');
    b.poly([[x0, y, z1 - 0.08], [x1, y, z1 - 0.08], [x1, y, z1], [x0, y, z1]], '#ffffff', { sw: 2.5 });
  });
};
const goal = (b, W, H, D) => {
  const zt = H * 0.75, nt = 'url(#h-net)';
  b.group([0, 0, 0], () => {
    b.poly([[0, D, 0], [W, D, 0], [W, D, zt], [0, D, zt]], nt, { sw: 2 });
    b.poly([[0, 0, 0], [0, D, 0], [0, D, zt], [0, 0, H]], nt, { sw: 2 });
    b.poly([[W, 0, 0], [W, D, 0], [W, D, zt], [W, 0, H]], nt, { sw: 2 });
    b.poly([[0, 0, H], [W, 0, H], [W, D, zt], [0, D, zt]], nt, { sw: 2 });
    b.line([0, D, 0], [W, D, 0], 3, C.metalD);
  });
  const st = { stripe: ['#ffffff', 10], layer: b.back ? 0 : 1 }, wd = W > 2 ? 10 : 8;
  b.rod([0, 0, 0], [0, 0, H], wd, C.red, st); b.rod([W, 0, 0], [W, 0, H], wd, C.red, st); b.rod([0, 0, H], [W, 0, H], wd, C.red, { ...st, stripe: ['#ffffff', W > 2 ? 15 : 7] });
};
const roll = (b, L, r, c) => {
  // Zylinder liegend: Hülle beider Endkreise, dann die sichtbare Stirnseite
  const sx = !b.swap, cap = x => Array.from({ length: 28 }, (_, i) => { const t = i / 28 * 2 * Math.PI; return sx ? [x, r + r * Math.cos(t), r + r * Math.sin(t)] : [r + r * Math.cos(t), x, r + r * Math.sin(t)]; });
  const raw = q => b.P(...(b.swap ? [q[1], q[0], q[2]] : q));
  const ends = sx ? [cap(0), cap(L)] : [cap(L), cap(0)];
  const all = [...ends[0], ...ends[1]].map(raw).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cr = (o, a, e) => (a[0] - o[0]) * (e[1] - o[1]) - (a[1] - o[1]) * (e[0] - o[0]);
  const lo = [], up = []; all.forEach(p => { while (lo.length > 1 && cr(lo.at(-2), lo.at(-1), p) <= 0) lo.pop(); lo.push(p); });
  [...all].reverse().forEach(p => { while (up.length > 1 && cr(up.at(-2), up.at(-1), p) <= 0) up.pop(); up.push(p); });
  const hull = [...lo.slice(0, -1), ...up.slice(0, -1)];
  const s = `<polygon points="${b.pts(hull)}" fill="${c}"/><polygon points="${b.pts(ends[1].map(raw))}" fill="${light(c, 0.25)}"/>`;
  b.raw(s);
};

// ---------- Katalog ----------
export const GROUPS = ['Matten, Kästen, Bänke', 'Sprossenwand, Barren, Reck', 'Hängen, Springen', 'Balken, Netze, Tore', 'Kleingeräte', 'Raum'];
export const VIEW_LABEL = { quer: 'quer', laengs: 'längs', quergespiegelt: 'quer, andere Richtung', laengsgespiegelt: 'längs, andere Richtung',
  frontal: 'von vorn', seitlich: 'von der Seite', hinten: 'von hinten', gespiegelt: 'von der anderen Seite', stehend: 'stehend', liegend: 'liegend' };
// Blickrichtungen: swap = um 90° gedreht, mx/my = gespiegelt in Breite/Tiefe
const FLAGS = { laengs: [1, 0, 0], seitlich: [1, 0, 0], gespiegelt: [1, 1, 0], hinten: [0, 0, 1], quergespiegelt: [0, 1, 0], laengsgespiegelt: [1, 0, 1] };
const SWAP = { has: v => !!FLAGS[v]?.[0] };
const list = [];
// def: views = Ansichten (laengs/seitlich = um 90° gedreht), build(b, L, view), len = Länge in m, stretch = in der Länge dehnbar
const def = (id, name, group, o) => list.push({ id, name, group, views: o.views || ['quer'], build: o.build, len: o.len || 1, stretch: !!o.stretch, color: o.color || null, short: o.short || name });
const QL = ['quer', 'laengs'], FS = ['frontal', 'seitlich'], FRONT4 = ['frontal', 'seitlich', 'hinten', 'gespiegelt'], SIDE4 = ['quer', 'laengs', 'quergespiegelt', 'laengsgespiegelt'];
const G0 = GROUPS[0], G1 = GROUPS[1], G2 = GROUPS[2], G3 = GROUPS[3], G4 = GROUPS[4], G5 = GROUPS[5];

// Matten, Kästen, Bänke
def('turnmatte', 'Turnmatte', G0, { views: QL, len: 2, stretch: true, build: (b, L) => b.box(0, 0, 0, L, 1, 0.08, C.mat, { inset: 0.07 }) });
def('matte_stehend', 'Matte stehend', G0, { views: QL, len: 2, stretch: true, build: (b, L) => b.box(0, 0, 0, L, 0.08, 1, C.mat, { seams: [0.5] }) });
def('weichboden', 'Weichboden', G0, { views: QL, len: 2.5, stretch: true, build: (b, L) => b.box(0, 0, 0, L, 1.6, 0.35, C.soft, { seams: [0.17], inset: 0.1 }) });
def('mattenwagen', 'Mattenwagen', G0, { views: SIDE4, build: b => {
  [[0.15, 0.95], [1.95, 0.95], [0.15, 0.05], [1.95, 0.05]].forEach(([x, y]) => b.sphere(x, y, 0.06, C.black, null, { shadow: false, layer: -1 }));
  b.box(0, 0, 0.1, 2.1, 1.0, 0.05, C.metalD, { layer: -1 });
  for (let i = 0; i < 4; i++) b.box(0.05, 0.03, 0.15 + i * 0.08, 2.0, 0.94, 0.08, i % 2 ? '#4a86c8' : C.mat);
  b.rod([2.14, 0.08, 0.15], [2.14, 0.08, 0.8], 6, C.metal, { layer: 1 }); b.rod([2.14, 0.92, 0.15], [2.14, 0.92, 0.8], 6, C.metal, { layer: 1 });
  b.rod([2.14, 0.08, 0.8], [2.14, 0.92, 0.8], 6, C.metal, { layer: 1 });
} });
for (let n = 2; n <= 6; n++) def('kasten' + n, `Kasten ${n} Teile`, G0, { views: QL, short: `Kasten ${n}`, build: b => kasten(b, n) });
def('kleinkasten', 'Kleinkasten', G0, { views: QL, build: b => b.group([0, 0, 0], () => { b.box(0, 0, 0, 0.6, 0.42, 0.24, C.wood, { slots: [0.12] }); b.box(-0.02, -0.02, 0.24, 0.64, 0.46, 0.1, C.wood, { top: C.leather }); }) });
def('kastenteil', 'Kastenteil', G0, { views: QL, build: b => b.box(0, 0, 0, 1.0, 0.72, 0.2, C.wood, { hole: 0.07, slots: [0.1] }) });
def('bank_kurz', 'Bank kurz', G0, { views: QL, len: 2, stretch: true, build: (b, L) => bench(b, L, 2) });
def('bank_lang', 'Bank lang', G0, { views: QL, len: 3, stretch: true, build: (b, L) => bench(b, L, 3) });
def('bank_um', 'Bank umgedreht', G0, { views: QL, len: 3, stretch: true, short: 'Bank umgedr.', build: (b, L) => benchFlip(b, L, 3) });

// Sprossenwand, Barren, Reck
def('sprossenwand', 'Sprossenwand', G1, { views: FS, build: b => wall(b, 1) });
def('sprossenwand2', 'Sprossenwand 2 Felder', G1, { views: FS, short: 'Sprossenw. 2', build: b => wall(b, 2) });
def('leiter', 'Leiter', G1, { views: ['quer', 'laengs', 'stehend'], len: 2.6, build: (b, L, v) => {
  if (v === 'stehend') { for (let z = 0.3; z < 2.5; z += 0.3) b.rod([0.05, 0.03, z], [0.45, 0.03, z], 5, C.wood); [0, 0.44].forEach(x => b.box(x - 0.03, 0, 0, 0.07, 0.06, 2.6, C.wood)); return; }
  for (let x = 0.2; x < L; x += 0.3) b.rod([x, 0.06, 0.035], [x, 0.43, 0.035], 5, C.wood);
  b.box(0, 0.43, 0, L, 0.06, 0.07, C.wood); b.box(0, 0, 0, L, 0.06, 0.07, C.wood);
} });
def('barren', 'Barren', G1, { views: QL, build: b => barren(b, 2.6, false) });
def('stufenbarren', 'Stufenbarren', G1, { views: QL, build: b => barren(b, 2.6, true) });
def('reck', 'Reck', G1, { views: FS, build: b => {
  [0, 2.2].forEach(x => { b.line([x, 0.3, 2.25], [x, -0.6, 0], 2, '#59616c'); b.line([x, 0.3, 2.25], [x, 1.2, 0], 2, '#59616c'); });
  [0, 2.2].forEach(x => { b.box(x - 0.12, 0.18, 0, 0.24, 0.24, 0.04, C.metalD, { layer: -1 }); b.rod([x, 0.3, 0.04], [x, 0.3, 2.3], 9, C.metal); });
  b.rod([0, 0.3, 2.22], [2.2, 0.3, 2.22], 5, '#d5dae0', { layer: 1 });
} });
def('reckpfosten', 'Reckpfosten', G1, { views: ['stehend'], build: b => { b.box(-0.14, -0.14, 0, 0.28, 0.28, 0.05, C.metalD); b.rod([0, 0, 0.05], [0, 0, 2.3], 10, C.metal, { layer: 1 }); } });

// Hängen, Springen
def('basketballkorb', 'Basketballkorb', G2, { views: FRONT4, short: 'Basketballkorb', build: b => {
  b.group([0, 0, 1], () => {
    b.box(0, 0, 1.0, 1.8, 0.05, 1.05, C.white);
    if (b.front) b.poly([[0.62, 0, 1.18], [1.18, 0, 1.18], [1.18, 0, 1.58], [0.62, 0, 1.58]], 'none', { stroke: C.orange, sw: 5 });
  });
  b.group([0.9, -0.55, 0.75], () => {
    const top = b.hcircle(0.9, -0.3, 1.16, 0.24, 24), bot = b.hcircle(0.9, -0.3, 0.84, 0.16, 24);
    top.forEach((p, i) => { if (i % 3 === 0) b.line(p, bot[i], 2, '#7c8694'); });
    b.curve(bot, 2, '#ffffff', { closed: true });
    b.curve(top, 5, C.orange, { closed: true });
  });
} });
def('kletterseile', 'Kletterseile', G2, { views: FS, build: b => {
  [0.3, 0.8, 1.3].forEach(x => { b.rod([x, 0, 2.6], [x, 0, 0.15], 7, C.rope); b.disc(x, 0, 0.12, 0.06, C.rope, { sw: 2 }); });
  b.rod([0, 0, 2.62], [1.6, 0, 2.62], 9, C.metalD, { layer: 1 });
} });
def('turnringe', 'Turnringe', G2, { views: FS, build: b => {
  [0.25, 0.75].forEach(x => { b.rod([x, 0, 2.5], [x, 0, 1.22], 4, C.black); b.curve(b.vcircle(x, 0, 1.08, 0.14), 7, C.wood, { closed: true }); });
} });
def('sprungbrett', 'Sprungbrett', G2, { views: SIDE4, build: b => {
  const lo = 0.06, hi = 0.22, X = 1.2, Y = 0.6;
  b.solid([[[[0, 0, 0], [X, 0, 0], [X, 0, hi], [0, 0, lo]], C.wood], [[[0, Y, 0], [X, Y, 0], [X, Y, hi], [0, Y, lo]], C.wood],
    [[[X, 0, 0], [X, Y, 0], [X, Y, hi], [X, 0, hi]], C.woodD], [[[0, 0, 0], [0, Y, 0], [0, Y, lo], [0, 0, lo]], C.woodD],
    [[[0, 0, lo], [X, 0, hi], [X, Y, hi], [0, Y, lo]], C.green]]);
} });
def('minitrampolin', 'Minitrampolin', G2, { views: ['quer'], build: b => {
  const cx = 0.6, cy = 0.6;
  [45, 135, 225, 315].forEach(a => { const t = a * Math.PI / 180; b.rod([cx + 0.42 * Math.cos(t), cy + 0.42 * Math.sin(t), 0.3], [cx + 0.52 * Math.cos(t), cy + 0.52 * Math.sin(t), 0], 5, C.metalD); });
  b.group([cx - 0.55, cy - 0.55, 0.28], () => { b.disc(cx, cy, 0.27, 0.56, dark(C.mat, 0.3)); b.disc(cx, cy, 0.33, 0.56, C.mat); b.disc(cx, cy, 0.335, 0.42, C.black, { sw: 2.5 }); });
} });
def('turnbock', 'Turnbock', G2, { views: QL, build: b => {
  [[-0.12, 0.5], [0.72, 0.5], [-0.12, -0.12], [0.72, -0.12]].forEach(([x, y]) => b.rod([0.3, 0.18, 0.42], [x, y, 0], 6, C.metalD));
  b.rod([0.3, 0.18, 0.42], [0.3, 0.18, 1.0], 9, C.metal);
  b.box(0, 0, 1.0, 0.6, 0.36, 0.3, C.leather, { top: light(C.leather, 0.15) });
} });
def('sprungpferd', 'Sprungpferd', G2, { views: QL, build: b => {
  [0.4, 1.2].forEach(x => { [[x - 0.35, 0.5], [x + 0.35, 0.5], [x - 0.35, -0.14], [x + 0.35, -0.14]].forEach(([fx, fy]) => b.rod([x, 0.18, 0.4], [fx, fy, 0], 6, C.metalD)); b.rod([x, 0.18, 0.4], [x, 0.18, 1.1], 9, C.metal); });
  b.box(0, 0, 1.1, 1.6, 0.36, 0.32, C.leather, { top: light(C.leather, 0.15) });
} });
def('hochsprung', 'Hochsprungständer mit Latte', G2, { views: QL, short: 'Hochsprung', build: b => {
  [0, 2.6].forEach(x => { b.box(x - 0.15, -0.15, 0, 0.3, 0.3, 0.04, C.metalD, { layer: -1 }); b.rod([x, 0, 0.04], [x, 0, 1.6], 7, C.metal); });
  b.rod([0, -0.03, 1.08], [2.6, -0.03, 1.08], 6, C.red, { stripe: ['#ffffff', 12], layer: 1 });
} });
def('huerde', 'Hürde', G2, { views: QL, build: b => {
  [0, 1.0].forEach(x => { b.rod([x, -0.25, 0.02], [x, 0.32, 0.02], 6, C.metalD); b.rod([x, 0.3, 0.02], [x, 0.3, 0.66], 6, C.metal); });
  b.rod([-0.03, 0.3, 0.66], [1.03, 0.3, 0.66], 11, '#ffffff', { stripe: [C.red, 7], layer: 1 });
} });

// Balken, Netze, Tore
const beam = (b, L, z) => {
  [0.3, L - 0.3].forEach(x => { b.box(x - 0.12, -0.3, 0, 0.24, 0.7, 0.08, C.metalD, { layer: -1 }); if (z > 0.4) b.box(x - 0.05, 0, 0.08, 0.1, 0.1, z - 0.08, C.metalD); else b.box(x - 0.08, -0.02, 0.08, 0.16, 0.14, z - 0.08, C.metalD); });
  b.box(0, 0, z, L, 0.1, 0.16, '#d5a873');
};
def('schwebebalken', 'Schwebebalken', G3, { views: QL, len: 3, stretch: true, build: (b, L) => beam(b, L, 1.0) });
def('balken_niedrig', 'Balken niedrig', G3, { views: QL, len: 3, stretch: true, build: (b, L) => beam(b, L, 0.3) });
def('netz', 'Netz mit Pfosten', G3, { views: QL, len: 4, stretch: true, short: 'Netz', build: (b, L) => {
  [0, L].forEach(x => { b.disc(x, 0, 0, 0.18, C.metalD, { layer: -1 }); b.rod([x, 0, 0], [x, 0, 2.43], 8, C.metal); });
  net(b, 0.05, L - 0.05, 0, 1.55, 2.35);
} });
def('tor', 'Tor', G3, { views: FRONT4, build: b => goal(b, 3, 2, 1) });
def('kleintor', 'Kleintor', G3, { views: FRONT4, build: b => goal(b, 1.2, 0.8, 0.6) });

// Kleingeräte
const ball = (r, fill, deco) => b => b.sphere(r, r, r, fill, deco);
def('huetchen', 'Hütchen', G4, { views: ['quer'], color: C.orange, build: (b, L, v, c) => b.cone(0.2, 0.2, 0.16, 0.32, c) });
def('markierteller', 'Markierteller', G4, { views: ['quer'], color: C.yellow, short: 'Markierteller', build: (b, L, v, c) => {
  b.group([0, 0, 0], () => {
    const t1 = Math.atan(F * K), t2 = t1 + Math.PI, arc = (r, z, rev) => { const a = []; for (let i = 0; i <= 16; i++) { const t = t2 + (t1 + 2 * Math.PI - t2) * i / 16; a.push([0.22 + r * Math.cos(t), 0.22 + r * Math.sin(t), z]); } return rev ? a.reverse() : a; };
    b.poly([...arc(0.21, 0), ...arc(0.12, 0.07, true)], c);
    b.disc(0.22, 0.22, 0.07, 0.12, light(c, 0.25)); b.disc(0.22, 0.22, 0.07, 0.045, '#eceef1', { sw: 2.5 });
  });
} });
def('reifen', 'Reifen', G4, { views: ['quer'], color: C.red, build: (b, L, v, c) => b.curve(b.hcircle(0.45, 0.45, 0.02, 0.42, 40), 7, c, { closed: true }) });
def('stange', 'Slalomstange', G4, { views: ['stehend', 'liegend'], color: C.red, short: 'Stange', build: (b, L, v, c) => {
  if (v === 'liegend') return b.rod([0, 0, 0.04], [1.6, 0, 0.04], 8, c, { stripe: ['#ffffff', 8] });
  b.disc(0, 0, 0, 0.16, C.black); b.disc(0, 0, 0.05, 0.16, '#454b55'); b.rod([0, 0, 0.05], [0, 0, 1.6], 8, c, { stripe: ['#ffffff', 8], layer: 1 });
} });
def('springseil', 'Springseil', G4, { views: SIDE4, build: b => {
  const ps = []; for (let i = 0; i <= 24; i++) { const t = -Math.PI / 2 + Math.PI * i / 24; ps.push([0.15 + 1.25 * Math.cos(t) + 0.08 * Math.sin(3 * t), 0.3 + 0.3 * Math.sin(t), 0.02]); }
  b.curve(ps, 4, C.yellow);
  b.rod([0.15, 0, 0.03], [-0.12, -0.02, 0.03], 10, C.red, { layer: 1 }); b.rod([0.15, 0.6, 0.03], [-0.12, 0.62, 0.03], 10, C.red, { layer: 1 });
} });
def('schlaeger', 'Schläger', G4, { views: SIDE4, build: b => {
  b.rod([0, 0.2, 0.03], [0.32, 0.2, 0.03], 10, C.black); b.rod([0.32, 0.2, 0.03], [0.48, 0.2, 0.03], 5, '#3d6fb5');
  const head = Array.from({ length: 28 }, (_, i) => { const t = i / 28 * 2 * Math.PI; return [0.72 + 0.25 * Math.cos(t), 0.2 + 0.19 * Math.sin(t), 0.03]; });
  b.group([0.47, 0, 0.03], () => {
    b.poly(head, '#f4f5f7', { sw: 2 });
    for (let k = -2; k <= 2; k++) { b.line([0.72 + k * 0.08, 0.2 - 0.17 * Math.sqrt(1 - (k * 0.08 / 0.25) ** 2), 0.03], [0.72 + k * 0.08, 0.2 + 0.17 * Math.sqrt(1 - (k * 0.08 / 0.25) ** 2), 0.03], 1.4, '#7c8694'); b.line([0.72 - 0.23 * Math.sqrt(1 - (k * 0.06 / 0.19) ** 2), 0.2 + k * 0.06, 0.03], [0.72 + 0.23 * Math.sqrt(1 - (k * 0.06 / 0.19) ** 2), 0.2 + k * 0.06, 0.03], 1.4, '#7c8694'); }
    b.curve(head, 5, '#3d6fb5', { closed: true });
  });
} });
def('ballwagen', 'Ballwagen', G4, { views: SIDE4, build: b => {
  // Gitterkorb auf vier Lenkrollen mit Schiebebügel (seit 1.25.0): Innenraum grau, darin vom Boden an gestapelte Bälle (seit 1.26.0),
  // davor die Gitterwände und der Metallrahmen; die Bälle schauen oben aus dem Korb heraus.
  const L = 1.0, D = 0.6, z0 = 0.16, H = 0.6, zt = z0 + H, cage = 'url(#h-grid)';
  [[0.07, 0.07], [L - 0.07, 0.07], [0.07, D - 0.07], [L - 0.07, D - 0.07]].forEach(([x, y]) => {
    b.rod([x, y, z0], [x, y, 0.1], 3, C.metalD, { layer: -2 });
    b.poly(b.vcircle(x, y, 0.05, 0.05, b.swap ? 'y' : 'x', 16), C.black, { layer: -2, sw: 2 });
  });
  b.box(0, 0, z0, L, D, H, '#d3d8df', { front: '#dfe3e8', back: '#dfe3e8', side: '#cfd4db', top: 'none', layer: -1 });
  // Bälle liegen am Boden des Korbs und stapeln sich nach oben (drei Lagen, hinten und vorn); die oberste Lage schaut leicht heraus
  const r = 0.12, cols = [C.orange, C.white, '#3d6fb5', C.yellow, C.red, '#4f8f5b'], types = ['b', 'v', '', 'v', '', 'f'];
  const balls = [];
  [[0.13, [0.15, 0.5, 0.85]], [0.34, [0.3, 0.68]], [0.55, [0.2, 0.52, 0.82]]].forEach(([dz, xs], lv) => [0.45, 0.17].forEach((y, ry) => xs.forEach((x, k) => {
    if (lv === 2 && ry === 0 && k === 1) return; // oben hinten eine Lücke, damit der Haufen nicht zu gleichmäßig wirkt
    const n = balls.length, j = ((n * 37) % 7 - 3) * 0.01; balls.push([x + j, y - j, z0 + dz + (k % 2) * 0.02, cols[(n * 5 + lv) % 6], types[(n * 5 + lv) % 6]]);
  })));
  balls.forEach(([x, y, z, c, t]) => {
    const p = b.P(x, y, z), R = r * U, f = v => n1(v);
    const deco = t === 'b' ? `<path d="M${f(p[0] - R)} ${f(p[1])}H${f(p[0] + R)}M${f(p[0])} ${f(p[1] - R)}V${f(p[1] + R)}M${f(p[0] - R * .6)} ${f(p[1] - R * .8)}Q${f(p[0] - R * .1)} ${f(p[1])} ${f(p[0] - R * .6)} ${f(p[1] + R * .8)}" fill="none" stroke-width="1.8"/>`
      : t === 'v' ? `<path d="M${f(p[0] - R * .95)} ${f(p[1] - R * .25)}Q${f(p[0])} ${f(p[1] - R * .1)} ${f(p[0] + R * .6)} ${f(p[1] - R * .8)}M${f(p[0] - R * .7)} ${f(p[1] + R * .7)}Q${f(p[0] + R * .1)} ${f(p[1] + R * .2)} ${f(p[0] + R * .95)} ${f(p[1] + R * .2)}" fill="none" stroke-width="1.8"/>`
      : t === 'f' ? `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(R * .32)}" fill="${C.black}" stroke-width="1.5"/>` : '';
    b.raw(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="${f(R)}" fill="${c}"/>${deco}<circle cx="${f(p[0] - R * .35)}" cy="${f(p[1] - R * .38)}" r="${f(R * .2)}" fill="#fff" opacity=".55" stroke="none"/>`, p, R, [x, y, z]);
  });
  b.box(0, 0, z0, L, D, H, cage, { front: cage, back: cage, side: cage, top: 'none', layer: 1 });
  // Rahmen: oberer Rand als Rohr (hintere Kante hinter den Bällen), dazu der Schiebebügel an einer Stirnseite
  [[[0, D, zt], [L, D, zt], 0], [[0, 0, zt], [L, 0, zt], 2], [[L, 0, zt], [L, D, zt], 2], [[0, 0, zt], [0, D, zt], 2]].forEach(([a, e, layer]) => b.rod(a, e, 4, C.metal, { layer }));
  const hl = b.swap && !b.front ? -1 : 3; // Bügel hinten (Längsansicht von vorn) liegt hinter dem Korb
  [0.1, D - 0.1].forEach(y => b.rod([L, y, zt - 0.1], [L + 0.13, y, zt + 0.16], 5, C.metalD, { layer: hl }));
  b.rod([L + 0.13, 0.06, zt + 0.16], [L + 0.13, D - 0.06, zt + 0.16], 8, C.black, { layer: hl });
} });
const R0 = 0.16;
def('fussball', 'Fußball', G4, { views: ['quer'], build: ball(R0, '#ffffff', (x, y, R) => {
  const pg = (r, off) => Array.from({ length: 5 }, (_, i) => { const t = off + i * 2 * Math.PI / 5; return [x + r * Math.cos(t), y + r * Math.sin(t)]; });
  const a = pg(R * 0.36, -Math.PI / 2), o = pg(R * 0.72, -Math.PI / 2);
  return `<polygon points="${a.map(p => p.map(n1).join(',')).join(' ')}" fill="${C.black}"/>` + a.map((p, i) => `<line x1="${n1(p[0])}" y1="${n1(p[1])}" x2="${n1(o[i][0])}" y2="${n1(o[i][1])}" stroke-width="2.5"/>`).join('')
    + o.map((p, i) => { const q = pg(R * 1.0, -Math.PI / 2 + 0.33)[i], s = pg(R * 1.0, -Math.PI / 2 - 0.33)[i]; return `<polyline points="${n1(s[0])},${n1(s[1])} ${n1(p[0])},${n1(p[1])} ${n1(q[0])},${n1(q[1])}" fill="none" stroke-width="2.5"/>`; }).join('');
}) });
def('basketball', 'Basketball', G4, { views: ['quer'], build: ball(R0 * 1.1, '#e0782f', (x, y, R) =>
  `<path d="M${n1(x)} ${n1(y - R)}V${n1(y + R)}M${n1(x - R)} ${n1(y)}H${n1(x + R)}M${n1(x - R * 0.62)} ${n1(y - R * 0.78)}Q${n1(x - R * 0.1)} ${n1(y)} ${n1(x - R * 0.62)} ${n1(y + R * 0.78)}M${n1(x + R * 0.62)} ${n1(y - R * 0.78)}Q${n1(x + R * 0.1)} ${n1(y)} ${n1(x + R * 0.62)} ${n1(y + R * 0.78)}" fill="none" stroke-width="2.5"/>`) });
def('volleyball', 'Volleyball', G4, { views: ['quer'], build: ball(R0 * 1.05, '#ffffff', (x, y, R) => {
  const cap = (a0, a1) => Array.from({ length: 13 }, (_, i) => { const t = a0 + (a1 - a0) * i / 12; return `${n1(x + R * Math.cos(t))},${n1(y + R * Math.sin(t))}`; }).join(' ');
  const h = Math.asin(0.42);
  return `<polygon points="${cap(Math.PI + h, 2 * Math.PI - h)}" fill="${C.yellow}" stroke-width="2.5"/><polygon points="${cap(h, Math.PI - h)}" fill="#3d6fb5" stroke-width="2.5"/>`
    + `<path d="M${n1(x - R * 0.93)} ${n1(y - R * 0.12)}Q${n1(x)} ${n1(y + R * 0.12)} ${n1(x + R * 0.93)} ${n1(y - R * 0.12)}" fill="none" stroke-width="2"/>`;
}) });
def('tennisball', 'Tennisball', G4, { views: ['quer'], build: ball(0.1, '#cbdc3f', (x, y, R) =>
  `<path d="M${n1(x - R * 0.72)} ${n1(y - R * 0.7)}Q${n1(x - R * 0.05)} ${n1(y)} ${n1(x - R * 0.72)} ${n1(y + R * 0.7)}M${n1(x + R * 0.72)} ${n1(y - R * 0.7)}Q${n1(x + R * 0.05)} ${n1(y)} ${n1(x + R * 0.72)} ${n1(y + R * 0.7)}" fill="none" stroke="#ffffff" stroke-width="3"/>`) });
def('gymnastikball', 'Gymnastikball', G4, { views: ['quer'], color: C.red, short: 'Gymnastikball', build: (b, L, v, c) => b.sphere(0.32, 0.32, 0.32, c, (x, y, R) => `<ellipse cx="${n1(x - R * 0.38)}" cy="${n1(y - R * 0.42)}" rx="${n1(R * 0.22)}" ry="${n1(R * 0.14)}" transform="rotate(-35 ${n1(x - R * 0.38)} ${n1(y - R * 0.42)})" fill="${light(c, 0.45)}" stroke="none"/>`) });

// Raum
def('tischtennis', 'Tischtennisplatte', G5, { views: QL, short: 'Tischtennis', build: b => {
  [[0.25, 0.2], [2.15, 0.2], [0.25, 1.15], [2.15, 1.15]].forEach(([x, y]) => b.rod([x, y, 0], [x, y, 0.74], 6, C.metalD));
  b.group([0, 0, 0.74], () => {
    b.box(0, 0, 0.74, 2.4, 1.35, 0.05, C.tt);
    const z = 0.795, d = 0.04;
    b.poly([[d, d, z], [2.4 - d, d, z], [2.4 - d, 1.35 - d, z], [d, 1.35 - d, z]], 'none', { stroke: '#ffffff', sw: 2.5 });
    b.line([d, 0.675, z], [2.4 - d, 0.675, z], 2, '#ffffff');
  });
  b.group([1.2, -0.08, 0.8], () => {
    b.poly([[1.2, -0.08, 0.795], [1.2, 1.43, 0.795], [1.2, 1.43, 0.94], [1.2, -0.08, 0.94]], 'url(#h-net)', { sw: 2.5 });
  }, 1);
} });
def('bande', 'Bande', G5, { views: QL, len: 2, stretch: true, build: (b, L) => b.box(0, 0, 0, L, 0.06, 0.35, '#ece4d2', { seams: [0.08] }) });
def('polsterrolle', 'Polsterrolle', G5, { views: QL, build: b => roll(b, 1.6, 0.3, '#c9503f') });
def('trennwand', 'Trennwand', G5, { views: QL, len: 3, stretch: true, build: (b, L) => {
  b.group([0, 0, 0], () => {
    b.box(0, 0, 0, L, 0.06, 2.4, C.curtain, { seams: [0.3] });
    const y = b.swap ? 0.06 : 0; for (let x = 0.4; x < L - 0.1; x += 0.4) b.line([x, y, 0.32], [x, y, 2.35], 2, dark(C.curtain, 0.3));
  });
} });
def('tuer', 'Tür', G5, { views: FRONT4, build: b => {
  b.group([-0.08, 0, 0], () => {
    b.box(-0.08, -0.01, 0, 1.16, 0.08, 2.22, '#9aa3ad');
    b.box(0, -0.02, 0, 1.0, 0.06, 2.12, '#c49564');
    if (b.front) b.rod([0.78, -0.03, 1.05], [0.9, -0.03, 1.05], 5, C.metalD);
  });
} });
// Geräteraumtor: breites Holztor mit waagrechten Brettern (seams zeichnen sie auch von der Seite), in der Breite dehnbar
def('geraeteraumtor', 'Geräteraumtor', G5, { views: FRONT4, len: 3, stretch: true, short: 'Geräteraumtor', build: (b, L) => {
  b.group([0, 0, 0], () => {
    b.box(-0.1, -0.01, 0, L + 0.2, 0.08, 2.6, C.woodD);
    b.box(0, -0.02, 0, L, 0.06, 2.45, C.wood, { seams: Array.from({ length: 7 }, (_, k) => 0.3 * (k + 1)) });
    if (b.front) b.rod([L / 2 - 0.25, -0.04, 0.12], [L / 2 + 0.25, -0.04, 0.12], 5, C.metalD);
  });
} });
def('lautsprecher', 'Lautsprecher', G5, { views: FRONT4, build: b => {
  b.group([0, 0, 0], () => {
    b.box(0, 0, 0, 0.46, 0.36, 0.72, '#30353d');
    if (!b.front) return;
    b.poly(b.vcircle(0.23, 0, 0.24, 0.15), '#5a6270', { sw: 2.5 }); b.poly(b.vcircle(0.23, 0, 0.24, 0.06), '#30353d', { sw: 2 });
    b.poly(b.vcircle(0.23, 0, 0.55, 0.07), '#5a6270', { sw: 2.5 });
  });
} });
def('tafel', 'Tafel', G5, { views: FRONT4, build: b => {
  // von hinten liegen die hinteren Stützen vorn
  const fl = b.back ? -1 : 1;
  [0.12, 1.68].forEach(x => { b.rod([x, 0.12, 0.8], [x, 0.55, 0], 6, C.woodD, { layer: -fl }); });
  b.box(0, 0.1, 0.8, 1.8, 0.05, 1.1, C.wood, { front: C.board, back: C.wood, top: C.wood, side: C.woodD });
  [0.12, 1.68].forEach(x => { b.rod([x, 0.1, 0.8], [x, -0.3, 0], 6, C.woodD, { layer: fl }); });
  b.box(0.1, 0.02, 0.76, 1.6, 0.08, 0.04, C.woodD, { layer: fl });
} });

export const GEAR = Object.fromEntries(list.map(g => [g.id, g]));
export const gearList = () => list;
export const gearViews = id => GEAR[id]?.views || [];
export const viewLabel = v => VIEW_LABEL[v] || v;

// ---------- Zeichnen ----------
const cache = new Map();
function render(g, view, L, color) {
  const key = `${g.id}|${view}|${n1(L)}|${color || ''}`;
  if (cache.has(key)) return cache.get(key);
  const b = builder(...(FLAGS[view] || [0, 0, 0]).map(Boolean));
  g.build(b, L, view, color || g.color);
  const out = b.finish();
  if (cache.size > 600) cache.clear();
  cache.set(key, out); return out;
}
export function gearSize(id, view, L) {
  const g = GEAR[id]; if (!g) return { w: 120, h: 80 };
  const r = render(g, view || g.views[0], L ?? g.len, null);
  return { w: Math.round(r.w), h: Math.round(r.h) };
}
export const isStretch = (id, view) => !!GEAR[id]?.stretch && !SWAP.has(view);
// Maßstab im Plan: Geräte passen zur Halle (27 m = Breite der Hallenfläche); Kleingeräte bleiben zur Erkennbarkeit größer
const TRUE = FLOOR.width / HALL.len / U;
export const scaleOf = id => (GEAR[id]?.group === G4 ? 0.8 : TRUE);
// Länge (m) und Größenfaktor eines Elements aus seinem Rahmen; dehnbare Geräte werden länger statt verzerrt
export function fit(i) {
  const g = GEAR[i.gear]; if (!g) return { L: 1, s: 1 };
  const view = g.views.includes(i.view) ? i.view : g.views[0], d = render(g, view, g.len, null);
  if (!g.stretch) return { L: g.len, s: Math.sqrt((i.w * i.h) / (d.w * d.h)), view };
  let L, s;
  if (!SWAP.has(view)) { s = i.h / d.h; L = g.len + (i.w / s - d.w) / U; }
  else { // längs: Breite und Höhe hängen beide von der Länge ab
    const A = F * K * U, B = F * U, cw = d.w - A * g.len, ch = d.h - B * g.len, den = i.h * A - i.w * B;
    L = Math.abs(den) > 1e-6 ? (i.w * ch - i.h * cw) / den : g.len; if (!(L > 0)) L = g.len;
    L = Math.min(14, Math.max(0.4, L)); s = i.h / (B * L + ch);
  }
  return { L: Math.min(14, Math.max(0.4, L)), s, view };
}
// SVG im Bereich 0…w × 0…h
export function gearSvg(i) {
  const g = GEAR[i.gear], { w, h } = i;
  if (!g) return `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" fill="#f3f4f6" stroke="#b6bcc7" stroke-dasharray="8 6" stroke-width="2"/><text x="${w / 2}" y="${h / 2}" dy=".35em" text-anchor="middle" font-size="${n1(Math.max(12, Math.min(w, h) * 0.16))}" fill="#8b909b">Gerät?</text>`;
  const { L, view } = fit(i);
  const r = render(g, view, L, g.color ? (i.color || g.color) : null), sx = w / r.w, sy = h / r.h;
  // Kontur bleibt auch bei kleinen Geräten sichtbar
  const sw = Math.min(6.5, Math.max(SW, 2.3 / Math.sqrt(sx * sy)));
  return `<g transform="scale(${n1(sx * 1000) / 1000} ${n1(sy * 1000) / 1000}) translate(${n1(-r.x)} ${n1(-r.y)})" stroke="${INK}" stroke-width="${n1(sw)}" stroke-linejoin="round" stroke-linecap="round">${r.svg}</g>`;
}

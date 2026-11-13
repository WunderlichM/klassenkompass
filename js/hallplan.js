// Hallenplan ohne Browser: Zeichnung (SVG), Maße in Metern und Austauschformat. Dieses Modul braucht weder
// document noch Speicher und läuft deshalb auch in Node (tools/hallplan.mjs erzeugt damit Schüleransicht und PNG).
import { uid } from './engine.js';
import * as gear from './hallgear.js';
import { BW, BH, K, FLOOR, HALL, MARKS, fp, floorPoints, marksSvg } from './hallfloor.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Elementarten: Standardgröße, Farbe, Text; keep = Seitenverhältnis beim Vergrößern beibehalten
export const KINDS = {
  zone: { label: 'Bereich', w: 420, h: 560, color: '#3d6fb5', text: 'Gruppe', rotate: false },
  cone: { label: 'Hütchen', w: 70, h: 70, color: '#2e7d4f', text: 'H1', keep: true },
  kid: { label: 'Kind', w: 56, h: 96, color: '#3d6fb5', keep: true },
  teacher: { label: 'Lehrkraft', w: 56, h: 128, color: '#25272e', keep: true },
  ball: { label: 'Ball', w: 40, h: 40, color: '#6c6cf0', keep: true },
  arrow: { label: 'Laufweg', w: 220, h: 44, color: '#2f5e8e' },
  path: { label: 'Weg (Freigabe)', w: 320, h: 34, color: '#b0602a' },
  cross: { label: 'Sperrfläche', w: 64, h: 64, color: '#25272e', keep: true },
  tag: { label: 'Schild S/LK', w: 90, h: 64, text: 'S' },
  text: { label: 'Text', w: 260, h: 54, text: 'Text', color: '#25272e' },
  gear: { label: 'Gerät', keep: true },
  img: { label: 'Bild', keep: true },
};

// ---------- Zeichnen (auch für den Bildschirm, dort nur ansehen) ----------
export const num = v => Math.round(v * 10) / 10;
function floorSvg(p) {
  if (p.floor === 'leer') return '';
  let lines = '';
  if (p.floor === 'linien') {
    const a = fp(HALL.len / 2, 0), b = fp(HALL.len / 2, HALL.dep), c = Array.from({ length: 40 }, (_, i) => { const t = i / 40 * 2 * Math.PI; return fp(HALL.len / 2 + 2.2 * Math.cos(t), HALL.dep / 2 + 2.2 * Math.sin(t)).map(num).join(','); }).join(' ');
    lines = `<line x1="${num(a[0])}" y1="${num(a[1])}" x2="${num(b[0])}" y2="${num(b[1])}" class="hf-line"/><polygon points="${c}" class="hf-line"/>`;
  }
  return `<polygon points="${floorPoints()}" class="hf-floor"/>${lines}${marksSvg(p.lines)}`;
}
function para(w, h, k = K) { const d = h * k; return `${num(d)},0 ${num(w)},0 ${num(w - d)},${num(h)} 0,${num(h)}`; }
// Bereichsformen (seit 1.22.0): Rechteck oder U-, L-Form und Rahmen. tx, ty = Randbreite als Anteil von Breite bzw. Tiefe (0,04–0,48).
// Gezeichnet im Rahmen des Bereichs (u nach rechts, v nach vorn = unten), dann in die Schräge der Halle gelegt.
export const ZONE_FORMS = [['rect', 'Rechteck'], ['u-l', 'U – offen nach links'], ['u-r', 'U – offen nach rechts'], ['u-v', 'U – offen nach vorn'], ['u-h', 'U – offen nach hinten'],
  ['l-vl', 'L – Ecke vorn links'], ['l-vr', 'L – Ecke vorn rechts'], ['l-hl', 'L – Ecke hinten links'], ['l-hr', 'L – Ecke hinten rechts'], ['ring', 'Rahmen']];
export const FORM_IDS = ZONE_FORMS.map(f => f[0]);
export const bandOf = v => clamp(Number.isFinite(v) ? v : 0.25, 0.04, 0.48);
function formRings(form, tx, ty) {
  const mx = r => r.map(([u, v]) => [1 - u, v]), my = r => r.map(([u, v]) => [u, 1 - v]);
  const uL = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 1 - ty], [1 - tx, 1 - ty], [1 - tx, ty], [0, ty]];
  const uH = [[0, 0], [tx, 0], [tx, 1 - ty], [1 - tx, 1 - ty], [1 - tx, 0], [1, 0], [1, 1], [0, 1]];
  const lVL = [[0, 0], [tx, 0], [tx, 1 - ty], [1, 1 - ty], [1, 1], [0, 1]];
  switch (form) {
    case 'u-l': return [uL];
    case 'u-r': return [mx(uL)];
    case 'u-h': return [uH];
    case 'u-v': return [my(uH)];
    case 'l-vl': return [lVL];
    case 'l-vr': return [mx(lVL)];
    case 'l-hl': return [my(lVL)];
    case 'l-hr': return [mx(my(lVL))];
    case 'ring': return [[[0, 0], [1, 0], [1, 1], [0, 1]], [[tx, ty], [1 - tx, ty], [1 - tx, 1 - ty], [tx, 1 - ty]]];
  }
  return null;
}
function zonePath(i) {
  const rings = formRings(i.form, bandOf(i.tx), bandOf(i.ty)); if (!rings) return null;
  const d = i.h * K, pt = ([u, v]) => `${num(d * (1 - v) + u * (i.w - d))},${num(v * i.h)}`;
  return rings.map(r => 'M' + r.map(pt).join('L') + 'Z').join('');
}
function textLines(t, x, y, size, cls = '') {
  const lines = String(t || '').split('\n');
  return `<text x="${num(x)}" y="${num(y)}" font-size="${num(size)}" class="${cls}" text-anchor="middle">${lines.map((l, i) => `<tspan x="${num(x)}" dy="${i ? '1.15em' : 0}">${esc(l)}</tspan>`).join('')}</text>`;
}
// ---------- Kind (seit 1.24.0) ----------
// Kinderfigur in Gruppenfarbe (T-Shirt) mit weißem Rand und Bodenschatten. Frisur, Haarfarbe und Hautton werden zufällig
// gewählt, aber fest aus der Kennung des Elements abgeleitet: Beim Neuzeichnen, auf allen Geräten und im Druck sieht
// dasselbe Kind gleich aus; ein neues Kind (auch eine Kopie) bekommt ein neues Aussehen. Die Füße stehen bei 0,7 · h.
// Eine Nummer oder Beschriftung zeigt das Kind bewusst nicht (Nutzerentscheidung 13.11.2026).
// Hauttöne nach Häufigkeit (Nutzerentscheidung 13.11.2026): 50 % hell, 45 % braun, 5 % dunkel; die Haarfarbe passt zum Hautton.
const KID_SKIN = { hell: ['#fae3d0', '#f7d7bd', '#f0c6a4'], braun: ['#dca47a', '#c48a5e', '#a96e44'], dunkel: ['#7d4c2f', '#5f3a24'] };
const KID_HAIR = { hell: ['#2a1d15', '#4a2f1d', '#6e4524', '#a8702f', '#d9ab5c', '#e6c27a', '#9c3d1b'], braun: ['#1b1b1d', '#2a1d15', '#4a2f1d'], dunkel: ['#1b1b1d', '#2a1d15'] };
const KID_STYLES = 6; // 0 kurz, 1 Seitenscheitel, 2 Locken (Jungen); 3 Pferdeschwanz, 4 lange Haare, 5 Dutt (Mädchen)
function kidHash(t) { let h = 2166136261; for (const ch of String(t || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; return h >>> 0; }
export function kidLook(i) {
  const h = kidHash(i.id || 'kind'), q = h % 100, tone = q < 50 ? 'hell' : q < 95 ? 'braun' : 'dunkel', sk = KID_SKIN[tone], hr = KID_HAIR[tone];
  return { skin: sk[(h >>> 7) % sk.length], hair: hr[(h >>> 11) % hr.length], style: (h >>> 16) % KID_STYLES, shirt: i.color || KINDS.kid.color };
}
function kidSvg(i) {
  const s = i.w / 56, L = kidLook(i), X = v => num(v * s), ink = '#1f2a3c', sw = num(1.8 * s);
  const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`;
  // Körperteile (Koordinaten im 56 × 96-Raster)
  const shirt = `M${X(16)} ${X(27.5)}Q${X(28)} ${X(24.5)} ${X(40)} ${X(27.5)}L${X(46.5)} ${X(36)}L${X(41)} ${X(38.5)}L${X(40.5)} ${X(48)}L${X(15.5)} ${X(48)}L${X(15)} ${X(38.5)}L${X(9.5)} ${X(36)}Z`;
  const shorts = `M${X(16)} ${X(47)}H${X(40)}L${X(40.5)} ${X(56)}H${X(29.5)}L${X(28)} ${X(51)}L${X(26.5)} ${X(56)}H${X(15.5)}Z`;
  const legs = `M${X(19)} ${X(55)}H${X(25.5)}V${X(63.5)}H${X(19)}ZM${X(30.5)} ${X(55)}H${X(37)}V${X(63.5)}H${X(30.5)}Z`;
  const shoes = `M${X(18)} ${X(63)}H${X(26)}V${X(68)}H${X(14.5)}Q${X(14.5)} ${X(63)} ${X(18)} ${X(63)}ZM${X(30)} ${X(63)}H${X(38)}Q${X(41.5)} ${X(63)} ${X(41.5)} ${X(68)}H${X(30)}Z`;
  const arms = `M${X(11.5)} ${X(37)}Q${X(10)} ${X(43)} ${X(11.5)} ${X(49)}M${X(44.5)} ${X(37)}Q${X(46)} ${X(43)} ${X(44.5)} ${X(49)}`;
  const head = `<circle cx="${X(28)}" cy="${X(15)}" r="${X(10.5)}"`;
  // Haare hinter dem Kopf (lange Haare, Pferdeschwanz) und auf dem Kopf
  const back = L.style === 4 ? P(`M${X(17)} ${X(14)}Q${X(16)} ${X(28)} ${X(19)} ${X(31)}H${X(37)}Q${X(40)} ${X(28)} ${X(39)} ${X(14)}Z`, L.hair)
    : L.style === 3 ? P(`M${X(36)} ${X(9)}Q${X(46)} ${X(11)} ${X(43)} ${X(25)}Q${X(41)} ${X(17)} ${X(35)} ${X(15)}Z`, L.hair)
    : L.style === 5 ? `<circle cx="${X(28)}" cy="${X(3.5)}" r="${X(5)}" fill="${L.hair}"/>` : '';
  const top = L.style === 0 ? P(`M${X(17.5)} ${X(14.5)}A${X(10.5)} ${X(10.5)} 0 0 1 ${X(38.5)} ${X(14.5)}Q${X(33)} ${X(9.5)} ${X(28)} ${X(10.5)}Q${X(22)} ${X(9.5)} ${X(17.5)} ${X(14.5)}Z`, L.hair)
    : L.style === 1 ? P(`M${X(17.5)} ${X(16)}A${X(10.5)} ${X(10.5)} 0 0 1 ${X(38.5)} ${X(15)}Q${X(36)} ${X(9)} ${X(24)} ${X(11.5)}Q${X(20)} ${X(12.5)} ${X(17.5)} ${X(16)}Z`, L.hair)
    : L.style === 2 ? `<g fill="${L.hair}">${[[19, 12], [22.5, 7.5], [28, 5.5], [33.5, 7.5], [37, 12], [18, 16.5], [38, 16.5]].map(([a, b]) => `<circle cx="${X(a)}" cy="${X(b)}" r="${X(4.3)}"/>`).join('')}</g>`
    : P(`M${X(17.5)} ${X(16)}A${X(10.5)} ${X(10.5)} 0 0 1 ${X(38.5)} ${X(16)}Q${X(37)} ${X(10)} ${X(30)} ${X(9.5)}Q${X(27)} ${X(12.5)} ${X(17.5)} ${X(16)}Z`, L.hair);
  const face = [24.3, 31.7].map(x => `<circle cx="${X(x)}" cy="${X(16.3)}" r="${X(1.45)}" fill="${ink}"/><circle cx="${X(x + 0.5)}" cy="${X(15.8)}" r="${X(0.5)}" fill="#fff"/>`).join('')
    + `<path d="M${X(24.8)} ${X(20)}Q${X(28)} ${X(22.8)} ${X(31.2)} ${X(20)}" fill="none" stroke="${ink}" stroke-width="${num(1.3 * s)}" stroke-linecap="round"/>`;
  // weißer Rand: alle Flächen einmal breit weiß nachzeichnen, damit sich das Kind vom Hallenboden und von Bereichen abhebt
  const halo = `<g fill="#fff" stroke="#fff" stroke-width="${num(6 * s)}" stroke-linejoin="round" stroke-linecap="round">${back.replace(/fill="[^"]*"/g, '')}${head}/>${P(shirt, '#fff')}${P(shorts, '#fff')}${P(legs, '#fff')}${P(shoes, '#fff')}<path d="${arms}" fill="none" stroke-width="${num(10 * s)}"/></g>`;
  const line = ` stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"`;
  return `<ellipse cx="${X(28)}" cy="${X(68.5)}" rx="${X(18)}" ry="${X(4.5)}" fill="#000" opacity=".22"/>${halo}`
    + `${back}${P(legs, L.skin, line)}${P(shoes, ink)}${P(shorts, '#33415c', line)}`
    + `<path d="${arms}" fill="none" stroke="${ink}" stroke-width="${num(6.6 * s)}" stroke-linecap="round"/><path d="${arms}" fill="none" stroke="${L.skin}" stroke-width="${num(3.6 * s)}" stroke-linecap="round"/>`
    + `${P(shirt, L.shirt, line)}${head} fill="${L.skin}"${line}/>${top}${face}`;
}
// ---------- Lehrkraft (seit 1.25.0) ----------
// Erwachsene Figur für den Standort der Lehrkraft: blond, kurze Haare, Sportshirt in wählbarer Farbe, lange Trainingshose,
// Pfeife am Band. Raster 56 × 128, die Füße stehen wie beim Kind bei 0,7 · h. Keine Beschriftung.
function teacherSvg(i) {
  const s = i.w / 56, X = v => num(v * s), ink = '#1f2a3c', skin = '#f4d3b8', hair = '#dcb35a', c = i.color || KINDS.teacher.color;
  const P = (d, fill, extra = '') => `<path d="${d}" fill="${fill}"${extra}/>`, line = ` stroke="${ink}" stroke-width="${num(1.8 * s)}" stroke-linejoin="round"`;
  const shirt = `M${X(16.5)} ${X(26)}Q${X(28)} ${X(23)} ${X(39.5)} ${X(26)}L${X(46)} ${X(38)}L${X(40.5)} ${X(40.5)}L${X(40)} ${X(59)}L${X(16)} ${X(59)}L${X(15.5)} ${X(40.5)}L${X(10)} ${X(38)}Z`;
  const pants = `M${X(16.5)} ${X(58)}H${X(39.5)}L${X(38.5)} ${X(85)}H${X(29.5)}L${X(28)} ${X(64)}L${X(26.5)} ${X(85)}H${X(17.5)}Z`;
  const shoes = `M${X(18)} ${X(84.5)}H${X(26.5)}V${X(90)}H${X(14)}Q${X(14)} ${X(84.5)} ${X(18)} ${X(84.5)}ZM${X(29.5)} ${X(84.5)}H${X(38)}Q${X(42)} ${X(84.5)} ${X(42)} ${X(90)}H${X(29.5)}Z`;
  const arms = `M${X(12)} ${X(39)}Q${X(10.5)} ${X(48)} ${X(12)} ${X(58)}M${X(44)} ${X(39)}Q${X(45.5)} ${X(48)} ${X(44)} ${X(58)}`;
  const head = `<circle cx="${X(28)}" cy="${X(13.5)}" r="${X(9.5)}"`;
  const top = P(`M${X(18.4)} ${X(13)}A${X(9.6)} ${X(9.6)} 0 0 1 ${X(37.6)} ${X(12.5)}Q${X(37)} ${X(9.5)} ${X(33)} ${X(8.8)}Q${X(30)} ${X(11)} ${X(24)} ${X(9.8)}Q${X(20.5)} ${X(10)} ${X(18.4)} ${X(13)}Z`, hair);
  const face = [24.6, 31.4].map(x => `<circle cx="${X(x)}" cy="${X(14.6)}" r="${X(1.3)}" fill="${ink}"/><circle cx="${X(x + 0.45)}" cy="${X(14.1)}" r="${X(0.45)}" fill="#fff"/>`).join('')
    + `<path d="M${X(23)} ${X(11.6)}H${X(26.3)}M${X(29.7)} ${X(11.6)}H${X(33)}" stroke="#a9853a" stroke-width="${num(1.1 * s)}" stroke-linecap="round"/>`
    + `<path d="M${X(25)} ${X(18)}Q${X(28)} ${X(20.6)} ${X(31)} ${X(18)}" fill="none" stroke="${ink}" stroke-width="${num(1.3 * s)}" stroke-linecap="round"/>`;
  // Pfeife am Band
  const whistle = `<path d="M${X(23.5)} ${X(24.5)}L${X(28)} ${X(37)}L${X(32.5)} ${X(24.5)}" fill="none" stroke="#f2f2f2" stroke-width="${num(1.4 * s)}"/>`
    + `<rect x="${X(25.8)}" y="${X(36.5)}" width="${X(5.6)}" height="${X(3.6)}" rx="${X(1.2)}" fill="#c3c9d1" stroke="${ink}" stroke-width="${num(1 * s)}"/>`;
  const halo = `<g fill="#fff" stroke="#fff" stroke-width="${num(6 * s)}" stroke-linejoin="round" stroke-linecap="round">${head}/>${P(shirt, '#fff')}${P(pants, '#fff')}${P(shoes, '#fff')}<path d="${arms}" fill="none" stroke-width="${num(10 * s)}"/></g>`;
  return `<ellipse cx="${X(28)}" cy="${X(90.5)}" rx="${X(19)}" ry="${X(4.8)}" fill="#000" opacity=".22"/>${halo}`
    + `${P(pants, '#3a465e', line)}<path d="M${X(28)} ${X(64)}V${X(84)}" stroke="#2a3346" stroke-width="${num(0.8 * s)}"/>${P(shoes, ink)}`
    + `<path d="${arms}" fill="none" stroke="${ink}" stroke-width="${num(6.6 * s)}" stroke-linecap="round"/><path d="${arms}" fill="none" stroke="${skin}" stroke-width="${num(3.6 * s)}" stroke-linecap="round"/>`
    + `${P(shirt, c, line)}${whistle}${head} fill="${skin}"${line}/>${top}${face}`;
}
export function shape(i) {
  const { w, h } = i, c = i.color || KINDS[i.kind]?.color || '#333';
  switch (i.kind) {
    case 'zone': {
      const fs = clamp(Math.min(w, h) * 0.11, 18, 48);
      const zp = zonePath(i), body = zp ? `<path d="${zp}" fill-rule="evenodd"` : `<polygon points="${para(w, h)}"`;
      return `${body} fill="${c}" fill-opacity=".14" stroke="${c}" stroke-opacity=".55" stroke-width="4"/>${i.text ? textLines(i.text, w / 2 + h * K * 0.35, fs * 1.4, fs, 'h-label') : ''}`;
    }
    case 'cone': {
      const r = Math.min(w, h) / 2, fs = r * (String(i.text || '').length > 2 ? 0.62 : 0.78);
      return `<circle cx="${w / 2}" cy="${h / 2}" r="${num(r - 3)}" fill="${c}" stroke="#1f2a3c" stroke-width="4"/>${i.text ? `<text x="${w / 2}" y="${h / 2}" dy=".35em" font-size="${num(fs)}" text-anchor="middle" class="h-on-color">${esc(i.text)}</text>` : ''}`;
    }
    case 'kid':
      return kidSvg(i);
    case 'teacher':
      return teacherSvg(i);
    case 'ball': {
      const r = Math.min(w, h) / 2;
      return `<circle cx="${w / 2}" cy="${h / 2}" r="${num(r - 2)}" fill="${c}" stroke="#2c2f6e" stroke-width="3"/><circle cx="${num(w / 2 - r * .3)}" cy="${num(h / 2 - r * .3)}" r="${num(r * .22)}" fill="#fff" opacity=".6"/>`;
    }
    case 'arrow': {
      const t = h * 0.42, head = Math.min(h * 1.1, w * 0.45);
      return `<polygon points="0,${num(h / 2 - t / 2)} ${num(w - head)},${num(h / 2 - t / 2)} ${num(w - head)},0 ${w},${num(h / 2)} ${num(w - head)},${h} ${num(w - head)},${num(h / 2 + t / 2)} 0,${num(h / 2 + t / 2)}" fill="${c}"/>`;
    }
    case 'path': {
      const head = Math.min(h * 1.1, w * 0.4), t = Math.max(4, h * 0.22);
      return `<line x1="0" y1="${h / 2}" x2="${num(w - head * .8)}" y2="${h / 2}" stroke="${c}" stroke-width="${num(t)}" stroke-dasharray="${num(t * 3)} ${num(t * 2.2)}"/><polygon points="${num(w - head)},0 ${w},${h / 2} ${num(w - head)},${h}" fill="${c}"/>`;
    }
    case 'cross':
      return `<path d="M6 6L${w - 6} ${h - 6}M${w - 6} 6L6 ${h - 6}" stroke="${c}" stroke-width="${num(Math.min(w, h) * .14)}" stroke-linecap="round"/>`;
    case 'tag':
      return `<rect x="3" y="3" width="${w - 6}" height="${h - 6}" fill="#fff" stroke="#1f2a3c" stroke-width="5"/><text x="${w / 2}" y="${h / 2}" dy=".35em" font-size="${num(h * .52)}" text-anchor="middle" class="h-label">${esc(i.text || '')}</text>`;
    case 'text':
      return `<text x="${w / 2}" y="${h / 2}" dy=".35em" font-size="${num(h * .72)}" text-anchor="middle" class="h-label" fill="${c}">${esc(i.text || '')}</text>`;
    case 'gear':
      return gear.gearSvg(i);
    case 'img':
      return `<rect class="h-ph" width="${w}" height="${h}" rx="6"/><text class="h-ph-t" x="${w / 2}" y="${h / 2}" dy=".35em" text-anchor="middle" font-size="${num(clamp(Math.min(w, h) * .16, 12, 28))}">Bild fehlt</text><image data-img="${esc(i.img)}" width="${w}" height="${h}" preserveAspectRatio="none"/>`;
  }
  return '';
}
const itemSvg = i => `<g class="hi" data-hid="${esc(i.id)}" transform="translate(${num(i.x)} ${num(i.y)})${i.rot ? ` rotate(${i.rot} ${num(i.w / 2)} ${num(i.h / 2)})` : ''}">${shape(i)}</g>`;
export const defs = '<defs><pattern id="h-net" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M0 0L16 16M16 0L0 16" stroke="#9aa3b2" stroke-width="1.5"/></pattern><pattern id="h-grid" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M0 0H14M0 0V14" stroke="#7d8794" stroke-width="1.6"/></pattern></defs>';
// Ausschnitt um Hallenfläche und Elemente (für das Bildschirm-Objekt, damit wenig Rand bleibt)
export function contentBox(p) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
  if (p.floor !== 'leer') add(FLOOR.left, FLOOR.top, FLOOR.left + FLOOR.width + FLOOR.height * K, FLOOR.bottom);
  p.items.forEach(i => { const r = i.rot ? Math.hypot(i.w, i.h) / 2 : 0, cx = i.x + i.w / 2, cy = i.y + i.h / 2; r ? add(cx - r, cy - r, cx + r, cy + r) : add(i.x, i.y, i.x + i.w, i.y + i.h); });
  if (!Number.isFinite(x0)) return `0 0 ${BW} ${BH}`;
  const pad = 24; return `${num(x0 - pad)} ${num(y0 - pad)} ${num(x1 - x0 + 2 * pad)} ${num(y1 - y0 + 2 * pad)}`;
}
export function boardSvg(p, { edit = false, cls = '', crop = false } = {}) {
  if (!p) return '';
  return `<svg class="hall-svg ${cls}" viewBox="${crop ? contentBox(p) : `0 0 ${BW} ${BH}`}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Hallenplan ${esc(p.title)}">${defs}
    <rect x="-2000" y="-2000" width="${BW + 4000}" height="${BH + 4000}" class="hf-bg"/>${floorSvg(p)}${p.items.map(itemSvg).join('')}${edit ? '<g class="h-sel" data-sel></g>' : ''}</svg>`;
}

// ---------- Maße in Metern ----------
// Vorlagen: Maße in Metern auf dem Hallenboden (x von links, y von vorn nach hinten)
export const zoneAt = (x0, x1, y0, y1, color, text) => { const a = fp(x0, y0), b = fp(x0, y1), h = a[1] - b[1]; return { id: uid(), kind: 'zone', x: Math.round(a[0]), y: Math.round(b[1]), w: Math.round((x1 - x0) / HALL.len * FLOOR.width + h * K), h: Math.round(h), rot: 0, color, text }; };
// Gerät maßstäblich so setzen, dass der Punkt (ax, ay) seines Rahmens (Anteile 0…1) auf dem Bodenpunkt liegt; L = Länge in m bei dehnbaren Geräten
export function gearAt(id, view, x, y, { ax = 0.5, ay = 0.9, L } = {}) {
  const s = gear.gearSize(id, view, L), f = gear.scaleOf(id), p = fp(x, y), h = Math.round(s.h * f), w = Math.round(s.w * f);
  return { id: uid(), kind: 'gear', gear: id, view, x: Math.round(p[0] - w * ax), y: Math.round(p[1] - h * ay), w, h, rot: 0 };
}
// Element über einen Bodenpunkt in Metern setzen (x von links 0…27, y von vorn nach hinten 0…15); size = Größenfaktor.
// Kind steht mit den Füßen auf dem Punkt, alles andere liegt mittig darauf.
export function itemAt(kind, x, y, { size = 1, color, text } = {}) {
  const k = KINDS[kind], p = fp(x, y), t = text ?? (kind === 'zone' ? '' : k.text);
  const h = Math.round(k.h * size), w = Math.round(kind === 'text' ? Math.max(60, String(t || '').length * h * 0.45 + 30) : k.w * size);
  return { id: uid(), kind, x: Math.round(p[0] - w / 2), y: Math.round(p[1] - (kind === 'kid' || kind === 'teacher' ? h * 0.7 : h / 2)), w, h, rot: 0, ...(color || k.color ? { color: color || k.color } : {}), ...(t ? { text: String(t) } : {}) };
}
// Laufweg (arrow) oder Weg nach Freigabe (path) zwischen zwei Bodenpunkten in Metern
export function lineAt(kind, from, to, { size = 1, color } = {}) {
  const a = fp(from[0], from[1]), b = fp(to[0], to[1]), w = Math.max(30, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]))), h = Math.round(KINDS[kind].h * size);
  let rot = Math.round(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI); if (rot > 180) rot -= 360;
  return { id: uid(), kind, x: Math.round((a[0] + b[0]) / 2 - w / 2), y: Math.round((a[1] + b[1]) / 2 - h / 2), w, h, rot, color: color || KINDS[kind].color };
}

// ---------- Austauschformat ----------
// { "app": "KlassenKompass", "kind": "hall-plans", "v": 1, "plans": [ { "title": "…", "floor": "halle", "lines": ["handball"], "items": [ … ] } ] }
// Elemente stehen entweder in Einheiten der Zeichenfläche (x, y, w, h, rot – so exportiert die App) oder in Metern:
//   { "kind": "zone", "m": [x0, x1, y0, y1], "color": "#2e7d4f", "text": "Feld 1" }
//   { "kind": "zone", "m": [13.5, 26.2, 1.5, 13.5], "form": "u-l", "band": [3.6, 1.5] }   (Form und Randbreite in m, seit 1.22.0)
//   { "kind": "gear", "gear": "bank_lang", "view": "laengs", "at": [9, 7.5], "L": 3.4 }        (ax, ay = Ankerpunkt 0…1, optional)
//   { "kind": "cone" | "kid" | "teacher" | "ball" | "cross" | "tag" | "text", "at": [x, y], "text": "1", "color": "#c94040", "size": 1 }
//   { "kind": "arrow" | "path", "from": [x, y], "to": [x, y] }
export const PLANS_KIND = 'hall-plans';
const PLAN_KINDS = ['zone', 'cone', 'kid', 'teacher', 'ball', 'arrow', 'path', 'cross', 'tag', 'text', 'gear', 'img'];
const COLOR_RE = /^#[0-9a-f]{6}$/i, IMG_RE = /^img_[0-9a-f]{20}$/;
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const pair = (v, where) => { if (!Array.isArray(v) || v.length !== 2 || !v.every(isNum)) throw new Error(`${where}: Es braucht zwei Zahlen in Metern, z. B. [9, 7.5].`); return v; };
const num2 = v => Math.round(v * 1000) / 1000;
const int = (v, a, b, d) => (isNum(v) ? clamp(Math.round(v), a, b) : d);
const str = (v, n) => String(v ?? '').trim().slice(0, n);

function readItem(raw, where) {
  if (!raw || typeof raw !== 'object') throw new Error(`${where}: kein Element.`);
  const kind = raw.kind;
  if (!PLAN_KINDS.includes(kind)) throw new Error(`${where}: unbekannte Art „${str(kind, 30)}“.`);
  const color = COLOR_RE.test(raw.color) ? raw.color : undefined, size = isNum(raw.size) ? clamp(raw.size, 0.2, 6) : 1;
  let i;
  if (kind === 'gear') {
    const g = gear.GEAR[raw.gear];
    if (!g) throw new Error(`${where}: Gerät „${str(raw.gear, 30)}“ gibt es nicht.`);
    const view = raw.view === undefined ? g.views[0] : raw.view;
    if (!g.views.includes(view)) throw new Error(`${where}: ${g.name} hat die Ansicht „${str(view, 30)}“ nicht (möglich: ${g.views.join(', ')}).`);
    if (raw.at) { const [x, y] = pair(raw.at, where); i = gearAt(g.id, view, x, y, { ...(isNum(raw.ax) ? { ax: raw.ax } : {}), ...(isNum(raw.ay) ? { ay: raw.ay } : {}), ...(isNum(raw.L) && g.stretch ? { L: clamp(raw.L, 0.4, 14) } : {}) }); }
    else i = { kind, gear: g.id, view };
  } else if (kind === 'img') {
    if (!IMG_RE.test(raw.img)) throw new Error(`${where}: Bildkennung fehlt.`);
    i = { kind, img: raw.img };
  } else if (kind === 'zone' && raw.m) {
    if (!Array.isArray(raw.m) || raw.m.length !== 4 || !raw.m.every(isNum) || raw.m[1] <= raw.m[0] || raw.m[3] <= raw.m[2]) throw new Error(`${where}: „m“ braucht [x0, x1, y0, y1] in Metern mit x1 > x0 und y1 > y0.`);
    i = zoneAt(raw.m[0], raw.m[1], raw.m[2], raw.m[3], color || KINDS.zone.color, '');
  } else if ((kind === 'arrow' || kind === 'path') && raw.from) {
    i = lineAt(kind, pair(raw.from, where), pair(raw.to, where), { size, color });
  } else if (raw.at) {
    const [x, y] = pair(raw.at, where); i = itemAt(kind, x, y, { size, color, text: raw.text === undefined ? undefined : str(raw.text, 60) });
  } else i = { kind };
  if (!raw.at && !raw.m && !raw.from) {
    if (![raw.x, raw.y, raw.w, raw.h].every(isNum)) throw new Error(`${where}: Es fehlen x, y, w, h (oder eine Angabe in Metern: at, m, from/to).`);
    Object.assign(i, { x: raw.x, y: raw.y, w: raw.w, h: raw.h, rot: raw.rot });
  } else if (isNum(raw.rot)) i.rot = raw.rot;
  const text = raw.text === undefined ? i.text : str(raw.text, 60), c = color || i.color;
  let form;
  if (kind === 'zone' && raw.form !== undefined && raw.form !== 'rect') {
    if (!FORM_IDS.includes(raw.form)) throw new Error(`${where}: Form „${str(raw.form, 30)}“ gibt es nicht (möglich: ${FORM_IDS.join(', ')}).`);
    let tx = raw.tx, ty = raw.ty;
    if (raw.band !== undefined) {
      const [bx, by] = pair(raw.band, where);
      if (!raw.m) throw new Error(`${where}: „band“ (Randbreite in m) geht nur zusammen mit „m“.`);
      tx = bx / (raw.m[1] - raw.m[0]); ty = by / (raw.m[3] - raw.m[2]);
    }
    form = { form: raw.form, tx: num2(bandOf(tx)), ty: num2(bandOf(ty)) };
  }
  return { id: uid(), kind, x: int(i.x, -400, 2000, 100), y: int(i.y, -400, 1400, 100), w: int(i.w, 8, 2000, 80), h: int(i.h, 8, 1400, 80), rot: int(i.rot, -360, 360, 0), ...(form || {}),
    ...(c && COLOR_RE.test(c) ? { color: c } : {}), ...(text && kind !== 'gear' && kind !== 'img' ? { text } : {}), ...(kind === 'img' ? { img: i.img } : {}), ...(kind === 'gear' ? { gear: i.gear, view: i.view } : {}) };
}

// Liest eine Datei mit einem oder mehreren Hallenplänen. Erlaubt: { plans: [...] }, eine Liste von Plänen oder ein einzelner Plan.
export function parsePlans(text) {
  let raw;
  try { raw = JSON.parse(String(text).replace(/^﻿/, '')); } catch { throw new Error('Das ist keine gültige Hallenplan-Datei (JSON).'); }
  if (raw?.app === 'KlassenKompass' && raw.kind && raw.kind !== PLANS_KIND) throw new Error(raw.kind === 'quiz-sets' ? 'Das ist eine Datei mit Fragensätzen – bitte im Quiz importieren.' : 'Das ist eine Sicherung der ganzen App – bitte über „Daten importieren“ einlesen.');
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.plans) ? raw.plans : raw && Array.isArray(raw.items) ? [raw] : null;
  if (!list || !list.length) throw new Error('In der Datei wurde kein Hallenplan gefunden.');
  return list.slice(0, 30).map((p, k) => {
    const title = str(p?.title, 80) || 'Importierter Hallenplan', where = n => `Plan ${k + 1} („${title}“), Element ${n + 1}`;
    if (!Array.isArray(p?.items)) throw new Error(`Plan ${k + 1} („${title}“) hat keine Liste „items“.`);
    if (p.floor !== undefined && !['halle', 'linien', 'leer'].includes(p.floor)) throw new Error(`Plan ${k + 1} („${title}“): „floor“ muss halle, linien oder leer sein.`);
    const unknown = (Array.isArray(p.lines) ? p.lines : []).filter(m => !MARKS.some(x => x.id === m));
    if (unknown.length) throw new Error(`Plan ${k + 1} („${title}“): Spielfeldlinien „${unknown.join(', ')}“ gibt es nicht (möglich: ${MARKS.map(m => m.id).join(', ')}).`);
    return { id: uid(), title, demo: false, floor: p.floor || 'halle', v: 3, lines: MARKS.map(m => m.id).filter(m => Array.isArray(p.lines) && p.lines.includes(m)), items: p.items.slice(0, 400).map((i, n) => readItem(i, where(n))) };
  });
}
export function exportPlans(plans) {
  return JSON.stringify({ app: 'KlassenKompass', kind: PLANS_KIND, v: 1, plans: plans.map(p => ({ title: p.title, floor: p.floor, lines: p.lines || [],
    items: p.items.map(({ id, ...i }) => i) })) }, null, 2);
}

// Bilder der Arbeitsformen (seit 2.26.0): kleine Szenen im Bilderbuch-Stil – Kinder mit verschiedenen Haut- und
// Haarfarben an Tischen, Sprechblasen in der Farbe der Arbeitsform. Eigene Zeichnungen, keine bekannten Figuren.
// scene(k) liefert die große Szene (viewBox 160 × 120), glyph(k) ein schlichtes Symbol für die kleinen Knöpfe (24 × 24).
// Farben der Arbeitsform kommen aus CSS-Variablen (--md), alles andere ist fest.

const SKIN = ['#f5cba7', '#d99a6c', '#a56a43', '#f1d2bb', '#7c4a2d'];
const SKIN_SH = ['#e7b28c', '#c4845a', '#8e5836', '#e2bba1', '#663b22'];
const HAIR = ['#3a2a22', '#8a4b26', '#1e1a19', '#d39a45', '#5b3a29'];
const SHIRT = ['#4f8fd6', '#f2b134', '#e8665a', '#4fb38a', '#9b7be0', '#ef8fb0'];
const n = v => Math.round(v * 10) / 10;

// Kind hinter einem Tisch (Oberkörper), von vorn oder von hinten
function kid(x, y, s, { skin = 0, hair = 0, style = 'short', shirt = 0, look = 0, mood = 'smile', back = false, eyes = 'open' } = {}) {
  const sk = SKIN[skin], sh = SKIN_SH[skin], hc = HAIR[hair], top = SHIRT[shirt];
  const P = (dx, dy) => `${n(x + dx * s)} ${n(y + dy * s)}`;
  let out = '';
  // lange Haare hinter dem Kopf
  if (style === 'long') out += `<path fill="${hc}" d="M${P(-11.5, -1)}C${P(-12.5, 12)} ${P(-13, 20)} ${P(-10, 22)}H${n(x + 10 * s)}C${P(13, 20)} ${P(12.5, 12)} ${P(11.5, -1)}Z"/>`;
  if (style === 'pony') out += `<path fill="${hc}" d="M${P(8, -6)}C${P(17, -6)} ${P(18, 6)} ${P(13, 14)}C${P(13, 7)} ${P(12, 1)} ${P(8, -1)}Z"/>`;
  // Oberkörper mit runden Schultern
  out += `<path fill="${top}" d="M${P(-18, 46)}V${n(y + 27 * s)}Q${P(-18, 15)} ${P(-6, 14)}H${n(x + 6 * s)}Q${P(18, 15)} ${P(18, 27)}V${n(y + 46 * s)}Z"/>`;
  // Halsausschnitt
  out += back ? '' : `<path fill="${sh}" d="M${P(-4.5, 13.6)}Q${P(0, 20)} ${P(4.5, 13.6)}Z"/>`;
  // Hals und Ohren
  out += `<rect fill="${sh}" x="${n(x - 3.6 * s)}" y="${n(y + 6 * s)}" width="${n(7.2 * s)}" height="${n(8.5 * s)}" rx="${n(2 * s)}"/>`;
  out += `<circle fill="${sh}" cx="${n(x - 10.2 * s)}" cy="${n(y + 1.5 * s)}" r="${n(2.7 * s)}"/><circle fill="${sh}" cx="${n(x + 10.2 * s)}" cy="${n(y + 1.5 * s)}" r="${n(2.7 * s)}"/>`;
  // Kopf
  out += `<circle fill="${sk}" cx="${n(x)}" cy="${n(y)}" r="${n(10.5 * s)}"/>`;
  if (back) {
    // Hinterkopf: Haare decken den Kopf fast ganz
    out += `<path fill="${hc}" d="M${P(-11, 4)}C${P(-13, -16.5)} ${P(13, -16.5)} ${P(11, 4)}C${P(9, 9)} ${P(-9, 9)} ${P(-10.8, 4)}Z"/>`;
    if (style === 'long') out += `<path fill="${hc}" d="M${P(-10.8, 2)}C${P(-11, 14)} ${P(-9, 20)} ${P(-6, 21)}H${n(x + 6 * s)}C${P(9, 20)} ${P(11, 14)} ${P(10.8, 2)}Z"/>`;
    if (style === 'bun') out += `<circle fill="${hc}" cx="${n(x)}" cy="${n(y - 11 * s)}" r="${n(4.6 * s)}"/>`;
    return out;
  }
  // Frisur vorn
  const L = look * 1.6;
  if (style === 'curly') out += [[-9, -3, 4.2], [-6, -8, 4.6], [0, -10, 5], [6, -8, 4.6], [9, -3, 4.2]].map(([dx, dy, r]) => `<circle fill="${hc}" cx="${n(x + dx * s)}" cy="${n(y + dy * s)}" r="${n(r * s)}"/>`).join('');
  else out += `<path fill="${hc}" d="M${P(-11.2, 2)}C${P(-13, -16.5)} ${P(13, -16.5)} ${P(11.2, 2)}C${P(8.5, -3.5)} ${P(2 + L, -4.5)} ${P(-2 + L, -5.5)}C${P(-5 + L, -2)} ${P(-8, -1)} ${P(-11, 2)}Z"/>`;
  if (style === 'bun') out += `<circle fill="${hc}" cx="${n(x)}" cy="${n(y - 12 * s)}" r="${n(4.8 * s)}"/>`;
  // Gesicht
  const ex = look * 1.4, eyeY = y + 1.4 * s;
  out += eyes === 'down'
    ? `<circle fill="#2b2321" cx="${n(x + (-3.6 + ex) * s)}" cy="${n(eyeY + 1.2 * s)}" r="${n(1.3 * s)}"/><circle fill="#2b2321" cx="${n(x + (3.6 + ex) * s)}" cy="${n(eyeY + 1.2 * s)}" r="${n(1.3 * s)}"/>`
    : `<circle fill="#2b2321" cx="${n(x + (-3.6 + ex) * s)}" cy="${n(eyeY)}" r="${n(1.45 * s)}"/><circle fill="#2b2321" cx="${n(x + (3.6 + ex) * s)}" cy="${n(eyeY)}" r="${n(1.45 * s)}"/>`
      + `<circle fill="#fff" cx="${n(x + (-3.1 + ex) * s)}" cy="${n(eyeY - 0.5 * s)}" r="${n(0.45 * s)}"/><circle fill="#fff" cx="${n(x + (4.1 + ex) * s)}" cy="${n(eyeY - 0.5 * s)}" r="${n(0.45 * s)}"/>`;
  out += `<circle fill="#f0806e" opacity=".35" cx="${n(x + (-6.2 + ex) * s)}" cy="${n(y + 5 * s)}" r="${n(2.1 * s)}"/><circle fill="#f0806e" opacity=".35" cx="${n(x + (6.2 + ex) * s)}" cy="${n(y + 5 * s)}" r="${n(2.1 * s)}"/>`;
  const mx = x + ex * s;
  if (mood === 'smile') out += `<path fill="none" stroke="#7a3b2e" stroke-width="${n(1.2 * s)}" stroke-linecap="round" d="M${n(mx - 2.4 * s)} ${n(y + 5.6 * s)}q${n(2.4 * s)} ${n(2.2 * s)} ${n(4.8 * s)} 0"/>`;
  if (mood === 'talk') out += `<ellipse fill="#7a3b2e" cx="${n(mx)}" cy="${n(y + 6.4 * s)}" rx="${n(2 * s)}" ry="${n(1.5 * s)}"/>`;
  if (mood === 'o') out += `<ellipse fill="#7a3b2e" cx="${n(mx)}" cy="${n(y + 6.2 * s)}" rx="${n(1.1 * s)}" ry="${n(1.2 * s)}"/>`;
  if (mood === 'calm') out += `<path fill="none" stroke="#7a3b2e" stroke-width="${n(1.1 * s)}" stroke-linecap="round" d="M${n(mx - 1.8 * s)} ${n(y + 6 * s)}h${n(3.6 * s)}"/>`;
  return out;
}
// Hand (kleines Oval in Hautfarbe)
const hand = (x, y, s, skin, rot = 0) => `<g transform="rotate(${rot} ${n(x)} ${n(y)})"><ellipse fill="${SKIN_SH[skin]}" cx="${n(x)}" cy="${n(y + 0.8 * s)}" rx="${n(3.9 * s)}" ry="${n(3 * s)}"/><ellipse fill="${SKIN[skin]}" cx="${n(x)}" cy="${n(y)}" rx="${n(3.7 * s)}" ry="${n(2.8 * s)}"/></g>`;
// Unterarme auf dem Tisch: Ärmel vom Körper zur Hand, dann die Hand
const rest = (x1, x2, y, s, skin, shirt, hx1, hx2) => `${arm(x1, y, hx1, y + 2 * s, s, shirt)}${arm(x2, y, hx2, y + 2 * s, s, shirt)}${hand(hx1, y + 2.4 * s, s, skin)}${hand(hx2, y + 2.4 * s, s, skin)}`;
// Arm vom Körper zur Hand
const arm = (x1, y1, x2, y2, s, shirt) => `<path fill="none" stroke="${SHIRT[shirt]}" stroke-width="${n(6.5 * s)}" stroke-linecap="round" d="M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}"/>`;
// Tisch (von vorn, leicht von oben)
const desk = (x, y, w, h = 30) => `<rect fill="#e9c08a" x="${x}" y="${y}" width="${w}" height="8" rx="3"/><rect fill="#d4a46a" x="${x + 2}" y="${y + 6}" width="${w - 4}" height="${h}" rx="2"/><rect fill="#c49158" x="${x + 2}" y="${y + 6}" width="${w - 4}" height="3"/>`;
// aufgeschlagenes Heft / Buch auf dem Tisch
const book = (x, y, w = 22, c = 'var(--md)') => `<path fill="${c}" d="M${x - w / 2 - 1.5} ${y + 1}l${w / 2 + 1.5} 2.6l${w / 2 + 1.5}-2.6v4.4h${-w - 3}z" opacity=".85"/><path fill="#fff" d="M${x - w / 2} ${y - 2}q${w / 4} -2 ${w / 2} 1.2q${w / 4} -3.2 ${w / 2} -1.2v4.6q${-w / 4} -2 ${-w / 2} 1.2q${-w / 4} -3.2 ${-w / 2} -1.2z"/><path stroke="#c9ced8" stroke-width=".7" d="M${x - w / 2 + 2.5} ${y - .3}h${w / 2 - 5}M${x + 2.5} ${y - .3}h${w / 2 - 5}"/>`;
// Sprechblase (weiß) mit Inhalt
const bubble = (x, y, w, h, tail = 'bl', inner = '') => {
  const tx = tail === 'br' ? x + w - 12 : x + 12, tip = tail === 'br' ? tx + 5 : tx - 5, yb = y + h - 1.5;
  return `<g class="ma-bubble"><rect fill="#fff" x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/><path fill="#fff" d="M${tx - 4.5} ${yb}L${tip} ${y + h + 7}L${tx + 4.5} ${yb}Z"/>${inner}</g>`;
};
const dots = (cx, cy, gap = 5.5, r = 1.7) => [-1, 0, 1].map(i => `<circle fill="var(--md)" cx="${cx + i * gap}" cy="${cy}" r="${r}"/>`).join('');
// Hintergrund: Wand in hellem Ton der Arbeitsform, Boden etwas dunkler
const room = id => `<defs><linearGradient id="ma-wall-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ma-w1"/><stop offset="1" class="ma-w2"/></linearGradient><clipPath id="ma-clip-${id}"><rect width="160" height="120" rx="20"/></clipPath></defs>
  <rect class="ma-wall" width="160" height="120" rx="20" fill="url(#ma-wall-${id})"/>`;

let uidN = 0;
export function scene(k) {
  const id = 'm' + (++uidN);
  let body = '';
  switch (k) {
    case 'stille':
      // ein Kind schreibt konzentriert ins Heft
      body = `${kid(80, 46, 1.55, { skin: 0, hair: 1, style: 'long', shirt: 0, eyes: 'down', mood: 'smile' })}
        ${desk(30, 88, 100)}${book(80, 92, 46)}
        ${rest(60, 100, 91, 1.3, 0, 0, 62, 98)}
        <g transform="translate(5 2) rotate(25 92 84)"><rect fill="#f2b134" x="90.5" y="72" width="4" height="14" rx="1"/><path fill="#f6d7a7" d="M90.5 86h4l-2 4z"/><path fill="#3a2a22" d="M91.8 88.6h1.4l-.7 1.4z"/><rect fill="#e8665a" x="90.5" y="70" width="4" height="3" rx="1"/></g>
                ${bubble(110, 14, 36, 20, 'bl', `<text x="128" y="28.2" text-anchor="middle" class="ma-tx">Pst</text>`)}`;
      break;
    case 'fluestern':
      body = `${kid(58, 50, 1.35, { skin: 2, hair: 2, style: 'curly', shirt: 3, look: 1, mood: 'o' })}
        ${kid(104, 50, 1.35, { skin: 3, hair: 3, style: 'pony', shirt: 5, look: -0.8, mood: 'smile' })}
        ${arm(72, 84, 72, 64, 1.2, 3)}${hand(71.5, 59.5, 1.15, 2, 75)}
        <path fill="none" stroke="var(--md)" stroke-width="2.2" stroke-linecap="round" d="M81 54q2.6 2.6 0 5.2M85 51.5q5 5 0 10.2" opacity=".8"/>
        ${desk(18, 92, 124)}${book(54, 96, 28)}${book(106, 96, 28, '#f2b134')}
        ${arm(42, 94, 48, 96, 1.3, 3)}${hand(48, 96.6, 1.3, 2)}
        ${rest(90, 118, 94, 1.3, 3, 5, 98, 112)}
        ${bubble(22, 12, 32, 17, 'br', `<text x="38" y="24" text-anchor="middle" class="ma-tx sm">psst</text>`)}`;
      break;
    case 'partner':
      body = `${kid(48, 48, 1.4, { skin: 1, hair: 0, style: 'short', shirt: 1, look: 1, mood: 'talk' })}
        ${kid(112, 48, 1.4, { skin: 4, hair: 2, style: 'bun', shirt: 2, look: -1, mood: 'smile' })}
        ${desk(16, 90, 128)}
        <g transform="rotate(-3 80 94)"><rect fill="#fff" x="63" y="88" width="34" height="11" rx="1.5"/><path stroke="var(--md)" stroke-width="1.3" stroke-linecap="round" d="M67 91.5h16M67 95h22" opacity=".7"/></g>
        ${rest(32, 64, 92, 1.35, 1, 1, 40, 66)}${rest(96, 128, 92, 1.35, 4, 2, 94, 120)}
        ${bubble(56, 8, 48, 22, 'bl', dots(80, 19, 7.5, 2.4))}
        <g transform="translate(126 16)"><path stroke="#ffd34d" stroke-width="1.8" stroke-linecap="round" d="M0-13v3M-10-9l2 2M10-9l-2 2M-13 0h3M13 0h-3"/><circle fill="#ffd34d" r="7.5"/><rect fill="#c9a14a" x="-3.6" y="6" width="7.2" height="4.6" rx="1.3"/><path fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" d="M-2.2-1l2.2 3 2.2-3"/></g>`;
      break;
    case 'gruppe':
      body = `${kid(62, 40, 1.05, { skin: 3, hair: 4, style: 'long', shirt: 4, mood: 'smile' })}
        ${kid(98, 40, 1.05, { skin: 1, hair: 2, style: 'curly', shirt: 3, mood: 'talk' })}
        ${kid(34, 58, 1.25, { skin: 2, hair: 0, style: 'short', shirt: 1, look: 1, mood: 'smile' })}
        ${kid(126, 58, 1.25, { skin: 0, hair: 3, style: 'pony', shirt: 2, look: -1, mood: 'o' })}
        <ellipse fill="#c49158" cx="80" cy="98" rx="60" ry="17"/><ellipse fill="#e9c08a" cx="80" cy="94" rx="60" ry="16"/>
        <g transform="rotate(-8 67 93)"><rect fill="#fff" x="56" y="86" width="22" height="14" rx="1.5"/><path stroke="var(--md)" stroke-width="1.2" stroke-linecap="round" d="M60 90h12M60 93.5h14" opacity=".7"/></g>
        <g transform="rotate(6 93 94)"><rect fill="#fff" x="82" y="87" width="22" height="14" rx="1.5"/><path stroke="var(--md)" stroke-width="1.2" stroke-linecap="round" d="M86 91h12M86 94.5h9" opacity=".7"/></g>
        ${arm(42, 86, 50, 90, 1.2, 1)}${hand(52, 90.6, 1.2, 2)}${arm(118, 86, 110, 90, 1.2, 2)}${hand(108, 90.6, 1.2, 0)}
        ${bubble(66, 6, 28, 15, 'br', dots(80, 13.5, 5, 1.7))}`;
      break;
    case 'plenum':
      // Lehrkraft an der Tafel, Kinder von hinten
      body = `<rect fill="var(--md)" x="16" y="12" width="90" height="52" rx="5"/><rect fill="#fff" x="20" y="16" width="82" height="44" rx="3"/>
        <path stroke="var(--md)" stroke-width="3" stroke-linecap="round" d="M29 27h30M29 36h44M29 45h22" opacity=".75"/>
        <circle fill="none" stroke="#f2b134" stroke-width="2.6" cx="84" cy="44" r="8"/>
        <rect fill="${SHIRT[4]}" x="105.1" y="80" width="37.8" height="40"/>
        ${kid(124, 38, 1.05, { skin: 3, hair: 1, style: 'bun', shirt: 4, look: -1, mood: 'talk' })}
        ${arm(113, 58, 102, 48, 1.05, 4)}${hand(99.5, 46.5, 1.05, 3, -40)}
        ${kid(36, 92, 1.3, { skin: 1, hair: 0, style: 'short', shirt: 0, back: true })}
        ${kid(80, 94, 1.35, { skin: 0, hair: 3, style: 'long', shirt: 2, back: true })}
        ${kid(124, 92, 1.3, { skin: 4, hair: 2, style: 'curly', shirt: 3, back: true })}`;
      break;
  }
  // var(--md) geht in SVG-Attributen nicht – als Stil setzen
  body = body.replace(/(fill|stroke)="(var\([^"]+\))"/g, 'style="$1:$2"');
  return `<svg class="md-scene" viewBox="0 0 160 120" aria-hidden="true">${room(id)}<g clip-path="url(#ma-clip-${id})">${body}</g></svg>`;
}

// Kleine, klare Symbole für die Auswahlknöpfe (Farbe: currentColor)
const G = {
  stille: '<circle cx="12" cy="8.6" r="6.2"/><path d="M4.5 23a7.5 6 0 0 1 15 0z"/><rect class="fing" x="10.5" y="9.6" width="3" height="7.6" rx="1.5"/>',
  fluestern: '<circle cx="8" cy="9" r="4.4"/><path d="M1 22a7 6 0 0 1 14 0z"/><path class="ln" d="M15.2 7.3q1.7 1.7 0 3.4M18.2 5.2q3.6 3.8 0 7.6"/>',
  partner: '<circle cx="7" cy="9" r="4"/><circle cx="17" cy="9" r="4"/><path d="M.5 22a6.5 6 0 0 1 13 0zM10.5 22a6.5 6 0 0 1 13 0z"/>',
  gruppe: '<circle cx="5" cy="9" r="3.1"/><circle cx="19" cy="9" r="3.1"/><path d="M0 19.5a5 4.6 0 0 1 10 0zM14 19.5a5 4.6 0 0 1 10 0z"/><circle class="fing" cx="12" cy="10" r="4"/><path class="fing" d="M5.5 23a6.5 6 0 0 1 13 0z"/>',
  plenum: '<rect x="3" y="2" width="18" height="11.5" rx="1.8"/><path class="cut" d="M6.5 6h8M6.5 9.5h5"/><circle cx="5.5" cy="18.5" r="2.7"/><circle cx="12" cy="18.5" r="2.7"/><circle cx="18.5" cy="18.5" r="2.7"/>',
};
export const glyph = k => `<svg class="md-glyph" viewBox="0 0 24 24" aria-hidden="true">${G[k] || ''}</svg>`;

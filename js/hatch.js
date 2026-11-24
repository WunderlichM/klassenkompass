// Ei-Timer: Was schlüpft aus dem Ei? Eigene Zeichnungen (echte und erfundene Tiere).
// Jedes Tier ist ein Kopf, der aus der unteren Eihälfte schaut: Mitte (60, 56), Radius 20, sichtbar bis etwa y = 68.
// Welches Tier schlüpft, hängt fest an Timer und Startzeit (petIndex): gleich auf allen Geräten und beim Neuzeichnen,
// bei jedem neuen Start ein anderes.
// Seit 2.19.2 schöner gezeichnet: weiche Konturen in einer dunkleren Stufe der Fellfarbe, sanfte Schattierung (Licht von
// links oben), Glanzpunkte in den Augen und ein Schatten, wo das Tier in der Schale sitzt.
const INK = '#3b3226';

// Farben mischen: dk = dunklere Stufe (Kontur), lt = hellere Stufe
const rgb = c => { const h = c.length === 4 ? c.replace(/\w/g, x => x + x) : c; return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); };
const mix = (a, b, t) => { const B = rgb(b); return '#' + rgb(a).map((v, k) => Math.round(v + (B[k] - v) * t).toString(16).padStart(2, '0')).join(''); };
const dk = (c, t = 0.38) => mix(c, '#2b1d14', t);
const lt = (c, t = 0.45) => mix(c, '#ffffff', t);

// Verläufe je Zeichnung mit eigener Nummer, damit mehrere Eier auf dem Bildschirm sich nicht in die Quere kommen
let U = 0;
const GLOSS = () => `url(#kkg${U})`, SHELL = () => `url(#kks${U})`;
const defs = () => `<defs><radialGradient id="kkg${U}" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".32" stop-color="#fff" stop-opacity="0"/><stop offset=".72" stop-color="#2b1d14" stop-opacity="0"/><stop offset="1" stop-color="#2b1d14" stop-opacity=".24"/></radialGradient>`
  + `<linearGradient id="kks${U}" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stop-color="#4a2f14" stop-opacity="0"/><stop offset=".92" stop-color="#4a2f14" stop-opacity=".32"/></linearGradient></defs>`;

// Formen: liefern das Element ohne Füllung, shape() setzt Füllung, Kontur, Schattierung und auf Wunsch den Schalenschatten
const C = (cx, cy, r) => a => `<circle cx="${cx}" cy="${cy}" r="${r}" ${a}/>`;
const E = (cx, cy, rx, ry, rot = 0) => a => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ''} ${a}/>`;
const P = d => a => `<path d="${d}" ${a}/>`;
const R = (x, y, w, h, rx) => a => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ${a}/>`;
const shape = (sh, fill, { line = true, gloss = true, shell = false, lw = 1.5 } = {}) =>
  sh(`fill="${fill}"${line ? ` stroke="${dk(fill)}" stroke-width="${lw}" stroke-linejoin="round"` : ''}`)
  + (gloss ? sh(`fill="${GLOSS()}"`) : '') + (shell ? sh(`fill="${SHELL()}"`) : '');
const flat = (sh, fill) => shape(sh, fill, { line: false, gloss: false });

const both = f => f(1) + f(-1); // Teil links und rechts gespiegelt zeichnen
const glint = (x, y, r) => `<circle cx="${(x + r * 0.34).toFixed(2)}" cy="${(y - r * 0.38).toFixed(2)}" r="${(r * 0.4).toFixed(2)}" fill="#fff"/><circle cx="${(x - r * 0.34).toFixed(2)}" cy="${(y + r * 0.36).toFixed(2)}" r="${(r * 0.17).toFixed(2)}" fill="#fff" opacity=".85"/>`;
const eye = (x, y, r = 2.4, c = INK) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>` + glint(x, y, r);
const head = (fill, r = 20) => shape(C(60, 56, r), fill, { shell: true });
const eyes = (dx = 7, y = 52, r = 2.4, c = INK) => both(s => eye(60 - s * dx, y, r, c));
const bigEye = (x, y, r, c = INK) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${INK}" stroke-opacity=".3" stroke-width="1"/><circle cx="${x}" cy="${y + 0.6}" r="${(r * 0.58).toFixed(2)}" fill="${c}"/>`
  + (c !== INK ? `<circle cx="${x}" cy="${y + 0.6}" r="${(r * 0.3).toFixed(2)}" fill="${INK}"/>` : '') + glint(x, y + 0.6, r * 0.58);
const bigEyes = (dx = 8, y = 51, r = 5.2, c = INK) => both(s => bigEye(60 + s * dx, y, r, c));
const closedEyes = (dx = 10, y = 52) => both(s => { const x = 60 - s * dx; return `<path d="M${x - 3} ${y}q3-3.4 6 0" fill="none" stroke="${INK}" stroke-width="1.7" stroke-linecap="round"/><path d="M${x - s * 3} ${y}l${-s * 1.6}-1.3M${x - s * 1.8} ${y - 2}l${-s * 1}-1.6" stroke="${INK}" stroke-width="1" stroke-linecap="round"/>`; });
const cheeks = (c = '#f4a9a0', y = 59, dx = 13) => both(s => `<ellipse cx="${60 - s * dx}" cy="${y}" rx="3.4" ry="2.3" fill="${c}" opacity=".6"/>`);
const beak = (c = '#e8913a', y = 59) => shape(P(`M55.2 ${y}q4.8-1.8 9.6 0l-4.8 4.8z`), c, { lw: 1.1 }) + `<path d="M57 ${y + 0.4}q3-.9 6 0" stroke="${lt(c, 0.5)}" stroke-width=".9" fill="none" stroke-linecap="round"/>`;
const smile = (y = 61, w = 4, c = INK) => `<path d="M${60 - w} ${y}q${w} ${w * 0.9} ${w * 2} 0" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`;
const nose = (y = 61, c = INK, rx = 2.6, ry = 1.9) => `<ellipse cx="60" cy="${y}" rx="${rx}" ry="${ry}" fill="${c}"/><ellipse cx="${60 - rx * 0.3}" cy="${y - ry * 0.4}" rx="${rx * 0.35}" ry="${ry * 0.28}" fill="#fff" opacity=".7"/>`;
const pinkNose = (y = 58, c = '#f08fa5') => shape(P(`M57.6 ${y}h4.8q-.4 2-2.4 2.8q-2-.8-2.4-2.8z`), c, { lw: 0.9, gloss: false });
const earsPointy = (fill, inner) => both(s => shape(P(`M${60 - s * 17} 46l${-s * 2}-18 ${s * 14} 9z`), fill) + (inner ? flat(P(`M${60 - s * 16} 42l${-s * 1}-9 ${s * 7} 5z`), inner) : ''));
const earsRound = (fill, inner, r = 7.5) => both(s => shape(C(60 - s * 15, 39, r), fill) + (inner ? flat(C(60 - s * 15, 39, r * 0.55), inner) : ''));
const earsLong = (fill, inner) => both(s => shape(E(60 - s * 8, 29, 5, 13, -s * 8), fill) + flat(E(60 - s * 8, 30, 2.4, 9, -s * 8), inner));
const horns = (c = '#f3ead2') => both(s => shape(P(`M${60 - s * 12} 40q${-s * 6}-6 ${-s * 3}-14q${s * 7} 4 ${s * 9} 11z`), c, { lw: 1.2 }));
const antennae = (c, ball) => both(s => `<path d="M${60 - s * 7} 38q${-s * 3}-9 ${-s * 9}-12" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/>` + shape(C(60 - s * 16, 26, 3), ball, { lw: 1 }));
const tuft = (c, d = 'M58 36q2-6 6-4') => `<path d="${d}" stroke="${dk(c, 0.25)}" stroke-width="3.6" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${c}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
const spikes = (c, n = 5) => Array.from({ length: n }, (_, i) => { const a = (-60 + i * (120 / (n - 1))) * Math.PI / 180, x = 60 + 19 * Math.sin(a), y = 56 - 19 * Math.cos(a); return shape(P(`M${(x - 4 * Math.cos(a)).toFixed(1)} ${(y - 4 * Math.sin(a)).toFixed(1)}L${(60 + 28 * Math.sin(a)).toFixed(1)} ${(56 - 28 * Math.cos(a)).toFixed(1)}L${(x + 4 * Math.cos(a)).toFixed(1)} ${(y + 4 * Math.sin(a)).toFixed(1)}z`), c, { lw: 1.2 }); }).join('');
const whiskers = (c = INK) => both(s => `<path d="M${60 - s * 9} 60l${-s * 9}-2M${60 - s * 9} 62.5l${-s * 9} 1.5" stroke="${c}" stroke-width="1" stroke-linecap="round" opacity=".7"/>`);
const star = (x, y, r, c) => shape(P(`M${x} ${y - r}l${r * 0.3} ${r * 0.7} ${r * 0.7} ${r * 0.3}-${r * 0.7} ${r * 0.3}-${r * 0.3} ${r * 0.7}-${r * 0.3}-${r * 0.7}-${r * 0.7}-${r * 0.3} ${r * 0.7}-${r * 0.3}z`), c, { lw: 0.6, gloss: false });
// Mehrere Formen als eine Fläche mit gemeinsamer Außenkontur (z. B. Wolkenfell)
const blob = (parts, fill) => parts.map(sh => sh(`fill="${dk(fill)}" stroke="${dk(fill)}" stroke-width="3"`)).join('') + parts.map(sh => sh(`fill="${fill}"`)).join('') + parts.map(sh => sh(`fill="${GLOSS()}"`)).join('');

// art: Name mit Artikel für die Meldung „… ist geschlüpft!“
export const PETS = [
  { art: 'Ein Küken', svg: () => tuft('#efc244') + head('#f7d659') + eyes() + beak() + cheeks() },
  { art: 'Ein Entchen', svg: () => tuft('#e6c44f', 'M57 37q-1-6 3-7M61 37q2-5 6-4') + head('#fbe58a') + eyes(7, 51) + shape(E(60, 60.5, 8.5, 4.2), '#f09a3e', { lw: 1.1 }) + `<path d="M52.5 60.5h15" stroke="#c9742a" stroke-width="1" stroke-linecap="round"/><path d="M55 58.6q5-1.6 10 0" stroke="#ffd0a0" stroke-width="1" fill="none" stroke-linecap="round"/>` + cheeks('#f7b8a8', 58, 14) },
  { art: 'Eine Eule', svg: () => earsPointy('#8a6a4b', '#6e5239') + head('#a07c58') + flat(P('M46 62a14 12 0 0 0 28 0z'), '#e9d9bd') + `<path d="M52 65.5l2 1.6 2-1.6M58 67l2 1.6 2-1.6M64 65.5l2 1.6 2-1.6" fill="none" stroke="#b99c78" stroke-width="1.1" stroke-linecap="round"/>` + both(s => flat(C(60 + s * 8, 51, 8), '#c49c72')) + bigEyes(8, 51, 6.2, '#e39b2d') + beak('#e8a23a', 56) },
  { art: 'Ein Pinguin', svg: () => head('#3a4558') + shape(P('M60 42c-9 0-13 7-13 14 0 8 6 14 13 14s13-6 13-14c0-7-4-14-13-14z'), '#fdfdfb', { line: false }) + eyes(6, 52) + beak('#f0a030', 57) + cheeks('#f7b3a8', 60, 10) },
  { art: 'Eine Schildkröte', svg: () => head('#8fcf7a') + both(s => flat(C(60 - s * 11, 42, 2.4), '#7cbd67')) + flat(C(60, 40, 2), '#7cbd67') + eyes(8, 51, 2.6) + smile(60, 5) + cheeks('#f2a59a', 58, 14) },
  { art: 'Ein Krokodil', svg: () => both(s => shape(C(60 - s * 9, 40, 6.2), '#6fb35a')) + head('#7cc266') + shape(E(60, 62, 15, 7.5), '#93d37b', { lw: 1.2 }) + both(s => `<circle cx="${60 - s * 9}" cy="41" r="3.6" fill="#fff"/>` + eye(60 - s * 9, 41.5, 1.9) + `<circle cx="${60 - s * 4}" cy="58.5" r="1" fill="#4f8a3f"/>`) + `<path d="M48 64q12 5 24 0" fill="none" stroke="#4f8a3f" stroke-width="1.4" stroke-linecap="round"/><path d="M52 65.5l1.8 2.4 1.8-2M64.4 66l1.8 2.3 1.8-2.7" fill="#fff" stroke="#c9d6c2" stroke-width=".5" stroke-linejoin="round"/>` + both(s => flat(C(60 - s * 6, 48, 1.3), '#6cb058')) },
  { art: 'Ein Dino', svg: () => spikes('#f08a4b') + head('#58b89a') + both(s => flat(C(60 - s * 14, 46, 2.2), '#4ea88b')) + bigEyes(8, 51, 4.6) + `<circle cx="57" cy="60" r=".9" fill="#2f7a63"/><circle cx="63" cy="60" r=".9" fill="#2f7a63"/>` + smile(62.5, 5, '#2f7a63') + cheeks('#f6b09e', 58, 15) },
  { art: 'Ein Frosch', svg: () => head('#7ccb5c') + both(s => shape(C(60 - s * 10, 41, 7.5), '#7ccb5c') + `<circle cx="${60 - s * 10}" cy="41" r="4.6" fill="#fff"/>` + eye(60 - s * 10, 41.6, 2.4)) + `<path d="M48 59q12 9 24 0" fill="none" stroke="#3f7f33" stroke-width="1.8" stroke-linecap="round"/><circle cx="57.5" cy="54" r=".9" fill="#3f7f33"/><circle cx="62.5" cy="54" r=".9" fill="#3f7f33"/>` + cheeks('#f5a99b', 58, 15) },
  { art: 'Ein Papagei', svg: () => tuft('#e8483f', 'M56 38q-4-10 2-14M61 37q0-9 6-12M65 39q4-7 9-7') + head('#3fb56b') + shape(P('M44 52a16 16 0 0 1 32 0z'), '#e8483f', { lw: 1.2 }) + both(s => `<circle cx="${60 - s * 8}" cy="52" r="4.6" fill="#fff" stroke="${INK}" stroke-opacity=".25"/>` + eye(60 - s * 8, 52.4, 2.1)) + shape(P('M55 56q5-3 10 0q-1 9-5 10q-4-1-5-10z'), '#f2c230', { lw: 1.1 }) + `<path d="M57 61q3 1.4 6 0" stroke="#b98a12" stroke-width="1" fill="none"/>` },
  { art: 'Ein Schnabeltier', svg: () => head('#9a7558') + eyes(8, 50, 2.3) + shape(P('M46 59q14-6 28 0q2 8-14 9q-16-1-14-9z'), '#4a5560', { lw: 1.2 }) + `<circle cx="56" cy="60.5" r=".9" fill="#222"/><circle cx="64" cy="60.5" r=".9" fill="#222"/>` + cheeks('#e9a08f', 55, 16) },
  { art: 'Ein Oktopus', svg: () => head('#e879a8') + shape(P('M42 62q3 8 6 0q3 8 6 0q3 8 6 0q3 8 6 0q3 8 6 0q3 8 6 0z'), '#e879a8', { lw: 1.2 }) + bigEyes(7.5, 51, 5) + `<ellipse cx="60" cy="60" rx="2.2" ry="1.6" fill="#b84a7a"/>` + both(s => flat(C(60 - s * 14, 44, 1.6), '#f6b3cf') + flat(C(60 - s * 9, 40, 1.1), '#f6b3cf')) },
  { art: 'Ein Marienkäfer', svg: () => antennae(INK, INK) + head('#e23d3d') + `<path d="M60 49v27" stroke="${INK}" stroke-width="1.6"/>` + shape(P('M41.5 50a20 20 0 0 1 37 0q-18.5-8-37 0z'), INK, { line: false }) + both(s => `<circle cx="${60 - s * 7}" cy="45" r="2.6" fill="#fff"/>` + eye(60 - s * 7, 45.4, 1.2) + `<circle cx="${60 - s * 10}" cy="58" r="3" fill="${INK}"/><circle cx="${60 - s * 5}" cy="66" r="2.4" fill="${INK}"/>`) },
  { art: 'Ein Fuchs', svg: () => earsPointy('#e8792f', '#3b3226') + head('#f08a3c') + flat(P('M41 58q9 2 19 6q10-4 19-6a20 20 0 0 1-38 0z'), '#fff5e6') + eyes(8, 51) + nose(61) },
  { art: 'Ein Häschen', svg: () => earsLong('#ece6e0', '#f4b6c2') + head('#f3eee9') + eyes(7, 51) + pinkNose(57.5) + `<path d="M60 60.300v2.100M56.5 64q3.5 2 7 0" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/><rect x="57.6" y="64.6" width="4.8" height="3.6" rx="1" fill="#fff" stroke="#d8d0c8" stroke-width=".6"/>` + cheeks('#f7b9c4', 58, 13) + whiskers('#9a8f86') },
  { art: 'Ein Kätzchen', svg: () => earsPointy('#8b8f9c', '#f2a7b5') + head('#a4a8b5') + `<path d="M60 37.500v5M55.5 38.500l1 4M64.5 38.500l-1 4" stroke="#7f8391" stroke-width="1.6" stroke-linecap="round"/>` + bigEyes(8, 51, 4.8, '#3f8a5f') + pinkNose(58) + `<path d="M56.5 62.500q1.8 1.6 3.5 0q1.8 1.6 3.5 0" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>` + whiskers() },
  { art: 'Ein Pandabär', svg: () => earsRound('#2e3138', null, 7) + head('#fbfaf6') + both(s => flat(E(60 - s * 8, 52, 5.2, 6, s * 18), '#2e3138') + `<circle cx="${60 - s * 8}" cy="52" r="2.2" fill="#fff"/>` + eye(60 - s * 8 + 0.4, 52.3, 1.2)) + nose(59.5, '#2e3138', 2.8, 2) + smile(62.5, 3.5) },
  // ----- erfundene Tiere -----
  { art: 'Ein Drache', svg: () => horns('#f6e7b5') + spikes('#e8663c', 3) + both(s => shape(P(`M${60 - s * 19} 58q${-s * 12}-8 ${-s * 9}-18q${s * 5} 4 ${s * 12} 6z`), '#3f9a55', { lw: 1.2 })) + head('#5bbf6d') + bigEyes(8, 51, 4.8, '#c2421f') + shape(E(60, 62, 10, 5.5), '#7fd68d', { lw: 1.1 }) + `<circle cx="56.5" cy="61" r="1.1" fill="#2f7a41"/><circle cx="63.5" cy="61" r="1.1" fill="#2f7a41"/>` + shape(P('M68 62q5-4 9 0q-4 1-5 5q-1-4-4-5z'), '#ffb347', { lw: 0.8, gloss: false }) + `<path d="M70 62q3-2 5 0q-2 1-3 3z" fill="#ffe27a"/>` },
  { art: 'Ein Einhorn', svg: () => shape(P('M60 16l-4.5 22h9z'), '#f6c94e', { lw: 1.1 }) + `<path d="M57.6 27l5.2 2M56.6 32l7 2.6" stroke="#d9a528" stroke-width="1.2"/>` + earsPointy('#ffffff', '#f7c1d4') + head('#ffffff') + shape(P('M43 46q-6 8-2 18q4-10 8-14z'), '#f08fc0', { lw: 1 }) + shape(P('M46 41q-8 3-8 12q6-6 12-8z'), '#9b7fe0', { lw: 1 }) + shape(P('M50 37q-8-1-11 6q7-3 13-2z'), '#5fc3e8', { lw: 1 }) + closedEyes(11, 52) + shape(E(60, 62, 8, 5), '#fbe3ec', { lw: 0.9, gloss: false }) + `<circle cx="57" cy="62" r="1" fill="#d58aa5"/><circle cx="63" cy="62" r="1" fill="#d58aa5"/>` + cheeks('#f7b3c8', 57, 15) },
  { art: 'Ein Phönix', svg: () => shape(P('M60 14q7 9 2 20q9-6 7-17q8 12 0 25h-18q-8-13 0-25q-2 11 7 17q-5-11 2-20z'), '#f2792b', { lw: 1.1 }) + flat(P('M60 24q4 6 1 12q5-3 5-9q3 8-1 14h-10q-4-6-1-14q0 6 5 9q-3-6 1-12z'), '#ffd34d') + both(s => shape(P(`M${60 - s * 19} 60q${-s * 11}-3 ${-s * 12}-13q${s * 6} 2 ${s * 14} 5z`), '#f2792b', { lw: 1.1 })) + head('#f04e37') + flat(P('M46 62a14 12 0 0 0 28 0z'), '#ffb347') + eyes(7, 51, 2.6) + beak('#ffd34d', 57) },
  { art: 'Ein Alien', svg: () => antennae('#58b88f', '#f2d24b') + shape(E(60, 56, 22, 19), '#7fdcae', { shell: true }) + both(s => flat(E(60 - s * 9, 52, 6, 8, s * 22), '#1f2b3a') + `<circle cx="${60 - s * 9 + 1.6}" cy="48.6" r="1.8" fill="#fff"/><circle cx="${60 - s * 9 - 1.4}" cy="55" r=".8" fill="#fff" opacity=".8"/>`) + smile(63, 3.5, '#2f7a5c') },
  { art: 'Ein Zyklop-Monsterchen', svg: () => horns('#fff3d6') + head('#9b7fe0') + bigEye(60, 51, 8.5, '#2f8fbf') + shape(P('M50 62q10 7 20 0z'), '#5a3f9e', { lw: 1, gloss: false }) + `<path d="M53.5 62l2 3 2-3M62.5 62l2 3 2-3" fill="#fff"/>` + both(s => flat(C(60 - s * 15, 60, 1.5), '#7a5fc8') + flat(C(60 - s * 12, 42, 1.2), '#7a5fc8')) },
  { art: 'Ein Roboter-Küken', svg: () => `<path d="M60 38v-9" stroke="#6b7784" stroke-width="2"/>` + shape(C(60, 27, 3.2), '#f25c54', { lw: 1 }) + both(s => shape(R(s > 0 ? 36 : 79, 50, 5, 9, 2), '#7b8794', { lw: 1 })) + shape(R(41, 38, 38, 36, 9), '#b9c4cf', { shell: true }) + shape(R(46, 44, 28, 14, 5), '#26323f', { lw: 1, gloss: false }) + both(s => `<circle cx="${60 - s * 7}" cy="51" r="4.4" fill="#5fe3f0" opacity=".25"/><circle cx="${60 - s * 7}" cy="51" r="3.2" fill="#5fe3f0"/><circle cx="${60 - s * 7 + 1}" cy="50" r="1.1" fill="#fff"/>`) + `<path d="M48.500 45.500h8" stroke="#fff" stroke-opacity=".25" stroke-width="1.4" stroke-linecap="round"/>` + shape(P('M56 62l4 3.5 4-3.500z'), '#f0a030', { lw: 0.9, gloss: false }) + `<circle cx="48" cy="63" r="1.2" fill="#7b8794"/><circle cx="72" cy="63" r="1.2" fill="#7b8794"/>` },
  { art: 'Ein Geisterchen', svg: () => shape(P('M40 76v-22a20 20 0 0 1 40 0v22z'), '#f4f6fb', { shell: true, lw: 1.3 }) + both(s => `<ellipse cx="${60 - s * 7}" cy="52" rx="3" ry="4.2" fill="${INK}"/>` + glint(60 - s * 7, 52, 2.8)) + `<ellipse cx="60" cy="61.5" rx="3" ry="3.6" fill="${INK}"/>` + cheeks('#f7b9c4', 58, 14) },
  { art: 'Ein Yeti', svg: () => horns('#bfe3f2') + shape(P('M60 33l3 4 5-3 1 5 6-1-1 6 5 2-3 5 4 4-5 3 2 6-34 0 2-6-5-3 4-4-3-5 5-2-1-6 6 1 1-5 5 3z'), '#eef6fb', { shell: true, lw: 1.2 }) + shape(E(60, 56, 12, 11), '#9fd0e6', { lw: 1 }) + eyes(5.5, 53, 2.2) + shape(P('M54 61q6 5 12 0z'), '#3a5a6b', { line: false, gloss: false }) + `<path d="M56 61l1.5 2.2 1.5-2.200M61 61l1.5 2.2 1.5-2.2" fill="#fff"/>` },
  { art: 'Ein Flammenfuchs', svg: () => shape(P('M60 20q5 7 1 14q7-4 6-11q6 9 1 17h-16q-5-8 1-17q-1 7 6 11q-4-7 1-14z'), '#ffb347', { lw: 1 }) + earsPointy('#d9432f', '#ffd34d') + head('#f2622e') + flat(P('M41 58q9 2 19 6q10-4 19-6a20 20 0 0 1-38 0z'), '#ffe9b8') + bigEyes(8, 51, 4.4, '#b3371f') + nose(61) },
  { art: 'Ein Wolkenschaf', svg: () => blob([[47, 44], [56, 38], [66, 38], [74, 45], [42, 54], [78, 55]].map(([x, y]) => C(x, y, 8)), '#ffffff') + both(s => shape(E(60 - s * 15, 55, 5, 2.8, -s * 25), '#3f4656', { lw: 1 })) + shape(E(60, 57, 13, 13), '#3f4656', { shell: true, lw: 1.2 }) + bigEyes(5.5, 54, 3.8) + `<path d="M58 61.500l2 1.8 2-1.8" fill="none" stroke="#f4a9b5" stroke-width="1.4" stroke-linecap="round"/>` + [[52, 41], [68, 43]].map(([x, y]) => shape(C(x, y, 5), '#ffffff', { line: false })).join('') },
  { art: 'Eine Sternenkatze', svg: () => earsPointy('#2f3a6b', '#f2d24b') + head('#3b4a8a') + star(49, 43, 3, '#f2d24b') + star(72, 46, 2.2, '#ffffff') + star(64, 40, 1.6, '#ffffff') + bigEyes(8, 52, 4.8, '#e8c23a') + pinkNose(59, '#f2a7c0') + `<path d="M56.5 63q1.8 1.6 3.5 0q1.8 1.6 3.5 0" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>` + whiskers('#fff') },
  { art: 'Ein Kaktus-Igel', svg: () => spikes('#4f9a52', 7) + head('#7ccb7a') + flat(P('M46 58a14 13 0 0 0 28 0q-14-8-28 0z'), '#f6e3c5') + eyes(6.5, 53, 2.3) + nose(58.5, INK, 2.3, 1.7) + smile(61.5, 3) + cheeks('#f5a99b', 60, 11) + shape(C(66, 35, 3.4), '#f08fc0', { lw: 0.9 }) + `<circle cx="66" cy="35" r="1.3" fill="#ffd34d"/>` },
  { art: 'Ein Regenbogen-Drachenküken', svg: () => [['#e8483f', 23], ['#f2a03d', 21.3], ['#f2d24b', 19.6], ['#58b86a', 17.9], ['#4a90d9', 16.2]].map(([c, r], k) => k ? `<circle cx="60" cy="54" r="${r + 4}" fill="${c}"/>` : shape(C(60, 54, r + 4), c, { gloss: false, lw: 1.2 })).join('') + head('#f7f2ff', 18) + horns('#f2d24b') + bigEyes(7, 52, 4.4, '#7a4fd0') + beak('#f2a03d', 59) + cheeks('#f7b3c8', 60, 12) },
  { art: 'Ein Mondhase', svg: () => earsLong('#cfd6ea', '#9aa6cc') + head('#dfe4f3') + flat(C(50, 46, 2.6), '#c3cbe3') + flat(C(71, 60, 2), '#c3cbe3') + flat(C(66, 43, 1.5), '#c3cbe3') + closedEyes(10, 52) + pinkNose(57.5, '#8f9bd0') + smile(61.5, 3) + star(80, 34, 3, '#f2d24b') },
];

// Fester Zufall aus Timer-Kennung und Startzeit (FNV-1a)
function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const lastOf = new Map(), picked = new Map();
// Tier für diesen Lauf: nie dasselbe zweimal hintereinander im selben Timer
export function petIndex(id, run) {
  const key = id + ':' + run;
  if (picked.has(key)) return picked.get(key);
  let i = hash(key) % PETS.length;
  if (lastOf.get(id) === i) i = (i + 1 + hash(key + '!') % (PETS.length - 1)) % PETS.length;
  lastOf.set(id, i); picked.set(key, i);
  if (picked.size > 200) picked.delete(picked.keys().next().value);
  return i;
}
// Zeichnung mit eigenen Verläufen (neue Nummer je Aufruf)
export const petSvg = i => { U = (U + 1) % 1e6; return defs() + PETS[i].svg(); };
export const petText = i => PETS[i].art + ' ist geschlüpft!';

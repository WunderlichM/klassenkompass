// Feste Tiernamen und Tiersymbole für das Kartenquiz.
// Karte 1 ist immer der Adler, Karte 2 immer der Biber usw. – in jeder Klasse gleich, damit ein gedruckter
// Kartensatz für alle Klassen passt. Reihenfolge und Namen nie ändern (gedruckte Karten und Zuordnungsblätter).
// Die Symbole sind eigene, einfache Zeichnungen (viewBox 64 × 64).
export const ANIMALS = ['Adler', 'Biber', 'Dachs', 'Delfin', 'Eule', 'Falke', 'Fuchs', 'Gecko', 'Hase', 'Igel', 'Jaguar', 'Koala', 'Lama', 'Luchs', 'Marder', 'Möwe', 'Nashorn', 'Otter', 'Panda', 'Pinguin',
  'Qualle', 'Rabe', 'Robbe', 'Specht', 'Storch', 'Tiger', 'Uhu', 'Wal', 'Wolf', 'Zebra', 'Ameise', 'Bär', 'Elch', 'Fasan', 'Giraffe', 'Hamster', 'Kiwi', 'Lemur', 'Milan', 'Puma'];
export const animalName = card => ANIMALS[card - 1] || `Karte ${card}`;

const K = '#2b2b2b';
const o = `stroke="${K}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;
const ln = (d, w = 2, c = K) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const eye = (x, y, r = 2.6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${K}"/><circle cx="${x + r * 0.32}" cy="${y - r * 0.32}" r="${r * 0.32}" fill="#fff"/>`;
const eyes = (x1, x2, y, r) => eye(x1, y, r) + eye(x2, y, r);
const whisk = (y, w = 1.2) => ln(`M20 ${y}l-12 -2M20 ${y + 3}l-12 2M44 ${y}l12 -2M44 ${y + 3}l12 2`, w);

const DRAW = {
  Adler: `<path d="M8 62C10 46 18 40 28 40L44 62Z" fill="#7a4b2a" ${o}/>
    <circle cx="28" cy="28" r="15" fill="#f6f3ec" ${o}/>
    <path d="M38 19C50 18 58 26 56 37C54 33 50 32 46 34L40 31Z" fill="#f2b632" ${o}/>${eye(33, 24, 2.4)}${ln('M28 20l9 1')}`,
  Biber: `<circle cx="17" cy="17" r="6" fill="#6f4426" ${o}/><circle cx="47" cy="17" r="6" fill="#6f4426" ${o}/>
    <ellipse cx="32" cy="33" rx="21" ry="19" fill="#8a5a35" ${o}/><ellipse cx="32" cy="42" rx="12" ry="8.5" fill="#c99a6b" ${o}/>
    ${eyes(24, 40, 28, 2.6)}<ellipse cx="32" cy="37" rx="4.2" ry="3" fill="${K}"/><path d="M27.5 45h9v9h-9Z" fill="#f4e3a8" ${o}/>${ln('M32 45v9', 1.5)}`,
  Dachs: `<circle cx="16" cy="14" r="5" fill="#9b9b9b" ${o}/><circle cx="48" cy="14" r="5" fill="#9b9b9b" ${o}/>
    <path d="M32 8C46 8 52 18 50 30C48 44 40 58 32 58C24 58 16 44 14 30C12 18 18 8 32 8Z" fill="#f2f2f2" ${o}/>
    <path d="M24 10C28 20 29 34 29 48L26 48C22 36 18 22 18 13Z" fill="#222"/><path d="M40 10C36 20 35 34 35 48L38 48C42 36 46 22 46 13Z" fill="#222"/>
    <circle cx="24" cy="29" r="1.8" fill="#fff"/><circle cx="40" cy="29" r="1.8" fill="#fff"/><ellipse cx="32" cy="54" rx="4.5" ry="3.2" fill="${K}"/>`,
  Delfin: `<path d="M4 40C10 28 26 20 42 22C48 22.6 52 25 54 28L62 30L54 33C48 38 40 41 32 41L34 50L26 42C18 42 12 42 8 43Z" fill="#6aa6c9" ${o}/>
    <path d="M28 22L32 12L38 22Z" fill="#6aa6c9" ${o}/><path d="M8 43L2 50L4 40Z" fill="#6aa6c9" ${o}/>
    <path d="M14 39C24 38 36 38 48 33" fill="none" stroke="#d8ecf6" stroke-width="3" stroke-linecap="round"/>${eye(46, 27, 1.8)}`,
  Eule: `<ellipse cx="32" cy="35" rx="22" ry="25" fill="#9b6b43" ${o}/>
    <circle cx="23" cy="28" r="10" fill="#ead6b4" ${o}/><circle cx="41" cy="28" r="10" fill="#ead6b4" ${o}/>
    <circle cx="23" cy="28" r="5" fill="#f2c230" ${o}/><circle cx="41" cy="28" r="5" fill="#f2c230" ${o}/>${eyes(23, 41, 28, 2.4)}
    <path d="M29 36L35 36L32 42Z" fill="#e08a2e" ${o}/>${ln('M22 48l3 3l3 -3M36 48l3 3l3 -3', 1.6)}`,
  Falke: `<path d="M10 62C10 48 16 42 26 42L42 62Z" fill="#5b6c86" ${o}/>
    <circle cx="28" cy="28" r="15" fill="#7f90aa" ${o}/><path d="M22 32C26 36 32 40 40 40C36 46 26 46 20 42Z" fill="#f4efe4"/>
    <path d="M30 26C30 32 28 36 26 40" fill="none" stroke="#2f3b4f" stroke-width="4" stroke-linecap="round"/>
    <path d="M41 22C47 22 50 26 49 31C47 29 45 29 43 30L41 28Z" fill="#f2c230" ${o}/><path d="M45 27L49 31" stroke="#3b3b3b" stroke-width="2.5" stroke-linecap="round"/><circle cx="34" cy="23" r="4" fill="#f2c230"/>${eye(34, 23, 2.2)}`,
  Fuchs: `<path d="M10 6L26 20L14 30Z" fill="#e0742c" ${o}/><path d="M54 6L38 20L50 30Z" fill="#e0742c" ${o}/>
    <path d="M8 22C14 16 50 16 56 22L32 58Z" fill="#e0742c" ${o}/><path d="M8 22L22 34L32 58Z" fill="#fbf4ea" ${o}/><path d="M56 22L42 34L32 58Z" fill="#fbf4ea" ${o}/>
    ${eyes(24, 40, 30, 2.4)}<ellipse cx="32" cy="54" rx="3.6" ry="2.8" fill="${K}"/>`,
  Gecko: `<path d="M32 34C34 46 28 54 18 56C14 57 12 54 15 52C22 50 26 45 26 36Z" fill="#6cbf4a" ${o}/>
    <ellipse cx="30" cy="28" rx="7" ry="11" fill="#6cbf4a" ${o}/><ellipse cx="31" cy="12" rx="7" ry="6" fill="#6cbf4a" ${o}/>
    ${ln('M24 22l-10 -6M36 22l10 -6M25 34l-10 6M35 34l10 6', 3, '#4c9a32')}
    <circle cx="13" cy="15" r="2" fill="#4c9a32"/><circle cx="47" cy="15" r="2" fill="#4c9a32"/><circle cx="14" cy="41" r="2" fill="#4c9a32"/><circle cx="46" cy="41" r="2" fill="#4c9a32"/>
    ${eyes(28, 34, 10, 1.5)}<circle cx="30" cy="26" r="1.6" fill="#f2d24a"/><circle cx="31" cy="32" r="1.6" fill="#f2d24a"/>`,
  Hase: `<ellipse cx="23" cy="16" rx="5.5" ry="15" fill="#b8a99a" ${o}/><ellipse cx="41" cy="16" rx="5.5" ry="15" fill="#b8a99a" ${o}/>
    <ellipse cx="23" cy="17" rx="2.4" ry="10" fill="#f1b9c2"/><ellipse cx="41" cy="17" rx="2.4" ry="10" fill="#f1b9c2"/>
    <ellipse cx="32" cy="42" rx="18" ry="17" fill="#c9bcaf" ${o}/>${eyes(25, 39, 38, 2.4)}<path d="M29.5 45h5L32 48Z" fill="#e88a9a" ${o}/>${whisk(48)}`,
  Igel: `<path d="M6 46L8 38L4 34L10 30L8 22L15 22L16 14L22 18L26 10L30 16L36 10L38 17L45 13L45 21L52 20L50 27L58 30L52 46Z" fill="#7a5a3c" ${o}/>
    <path d="M38 46C40 36 48 32 56 36L62 44C58 46 50 48 38 46Z" fill="#e3c9a3" ${o}/><circle cx="62" cy="44" r="2.2" fill="${K}"/>${eye(50, 38, 1.8)}
    ${ln('M14 48v6M28 48v6M44 47v6', 3)}`,
  Jaguar: `<circle cx="16" cy="16" r="7" fill="#e3a63c" ${o}/><circle cx="48" cy="16" r="7" fill="#e3a63c" ${o}/>
    <ellipse cx="32" cy="34" rx="22" ry="20" fill="#e3a63c" ${o}/><ellipse cx="32" cy="45" rx="11" ry="8" fill="#f8ecd4" ${o}/>
    <g fill="none" stroke="#3a2a1a" stroke-width="1.8"><circle cx="20" cy="24" r="3"/><circle cx="44" cy="24" r="3"/><circle cx="32" cy="20" r="2.6"/><circle cx="14" cy="36" r="2.6"/><circle cx="50" cy="36" r="2.6"/></g>
    ${eyes(25, 39, 33, 2.4)}<path d="M28.5 40h7L32 44Z" fill="${K}"/>`,
  Koala: `<circle cx="13" cy="22" r="11" fill="#9aa3ab" ${o}/><circle cx="51" cy="22" r="11" fill="#9aa3ab" ${o}/><circle cx="13" cy="23" r="6" fill="#eceff1"/><circle cx="51" cy="23" r="6" fill="#eceff1"/>
    <ellipse cx="32" cy="36" rx="19" ry="18" fill="#9aa3ab" ${o}/>${eyes(24, 40, 32, 2.2)}<ellipse cx="32" cy="41" rx="5.5" ry="7.5" fill="${K}"/>`,
  Lama: `<path d="M20 4C16 10 18 18 22 20L26 16C26 10 24 6 20 4Z" fill="#efe2c8" ${o}/><path d="M44 4C48 10 46 18 42 20L38 16C38 10 40 6 44 4Z" fill="#efe2c8" ${o}/>
    <path d="M20 18C22 12 42 12 44 18L46 40C46 52 40 60 32 60C24 60 18 52 18 40Z" fill="#efe2c8" ${o}/>
    <path d="M22 16C26 10 38 10 42 16C38 20 26 20 22 16Z" fill="#d8c4a0"/>${eyes(25, 39, 30, 2.4)}<ellipse cx="32" cy="50" rx="7" ry="5.5" fill="#d8c4a0" ${o}/>${ln('M29 50l3 2l3 -2')}`,
  Luchs: `<path d="M12 4L14 22L24 16Z" fill="#c9a06a" ${o}/><path d="M52 4L50 22L40 16Z" fill="#c9a06a" ${o}/>${ln('M12 4l-1 -3M52 4l1 -3', 3)}
    <path d="M10 26C10 16 54 16 54 26L58 44L48 40L44 54C38 58 26 58 20 54L16 40L6 44Z" fill="#c9a06a" ${o}/>
    <ellipse cx="32" cy="44" rx="10" ry="8" fill="#f4e9d6" ${o}/>${eyes(24, 40, 32, 2.4)}<path d="M28.5 40h7L32 44Z" fill="${K}"/>
    <circle cx="22" cy="24" r="1.4" fill="#5a4026"/><circle cx="42" cy="24" r="1.4" fill="#5a4026"/><circle cx="32" cy="22" r="1.4" fill="#5a4026"/>`,
  Marder: `<circle cx="18" cy="16" r="6" fill="#6b4529" ${o}/><circle cx="46" cy="16" r="6" fill="#6b4529" ${o}/>
    <path d="M14 26C14 14 50 14 50 26C50 40 42 50 32 52C22 50 14 40 14 26Z" fill="#6b4529" ${o}/>
    <path d="M18 46C22 52 28 54 32 54C36 54 42 52 46 46L44 62H20Z" fill="#f2dfa8" ${o}/>${eyes(25, 39, 30, 2.4)}<ellipse cx="32" cy="42" rx="3.6" ry="2.6" fill="${K}"/>`,
  Möwe: `<path d="M10 44C10 32 20 26 30 28L48 40C40 50 22 52 10 44Z" fill="#f7f7f7" ${o}/>
    <path d="M18 38C28 34 40 36 50 42L60 38C54 48 34 50 18 44Z" fill="#a9b4bf" ${o}/>
    <circle cx="30" cy="22" r="10" fill="#f7f7f7" ${o}/><path d="M39 20L52 22L40 26Z" fill="#f2c230" ${o}/><circle cx="47" cy="23" r="1.3" fill="#d6402e"/>${eye(32, 19, 1.8)}
    ${ln('M24 50v8M30 50v8', 2, '#e0a030')}`,
  Nashorn: `<path d="M6 30C8 18 22 12 34 14L48 22C54 26 58 32 58 40C58 48 50 52 42 52H20C12 52 6 44 6 30Z" fill="#9aa0a6" ${o}/>
    <path d="M46 22L58 4L54 26Z" fill="#e9e2cf" ${o}/><path d="M38 18L44 10L44 21Z" fill="#e9e2cf" ${o}/><path d="M12 18L8 8L18 14Z" fill="#9aa0a6" ${o}/>
    ${eye(36, 30, 2)}${ln('M48 44c3 2 6 2 8 0', 1.6)}`,
  Otter: `<circle cx="15" cy="20" r="5" fill="#7b5534" ${o}/><circle cx="49" cy="20" r="5" fill="#7b5534" ${o}/>
    <ellipse cx="32" cy="34" rx="20" ry="18" fill="#7b5534" ${o}/><ellipse cx="32" cy="42" rx="13" ry="9" fill="#e7cfaa" ${o}/>
    ${eyes(24, 40, 30, 2.4)}<ellipse cx="32" cy="38" rx="4" ry="2.8" fill="${K}"/>${whisk(42)}`,
  Panda: `<circle cx="14" cy="16" r="8" fill="#222" ${o}/><circle cx="50" cy="16" r="8" fill="#222" ${o}/><ellipse cx="32" cy="35" rx="22" ry="20" fill="#fff" ${o}/>
    <ellipse cx="22" cy="32" rx="6" ry="8" fill="#222" transform="rotate(30 22 32)"/><ellipse cx="42" cy="32" rx="6" ry="8" fill="#222" transform="rotate(-30 42 32)"/>
    <circle cx="23" cy="31" r="2" fill="#fff"/><circle cx="41" cy="31" r="2" fill="#fff"/><ellipse cx="32" cy="42" rx="4" ry="3" fill="${K}"/>${ln('M28 47c2 2 6 2 8 0', 1.6)}`,
  Pinguin: `<path d="M32 4C46 4 52 18 52 34C52 50 44 60 32 60C20 60 12 50 12 34C12 18 18 4 32 4Z" fill="#222" ${o}/>
    <path d="M32 16C42 16 46 26 46 38C46 50 40 56 32 56C24 56 18 50 18 38C18 26 22 16 32 16Z" fill="#fff"/>
    ${eyes(26, 38, 20, 2)}<path d="M28 25h8L32 31Z" fill="#f29a2e" ${o}/><path d="M20 58h9l-2 4h-7ZM35 58h9l-0 4h-7Z" fill="#f29a2e" ${o}/>`,
  Qualle: `<path d="M8 32C8 16 20 6 32 6C44 6 56 16 56 32C50 36 44 32 40 36C36 32 28 32 24 36C20 32 14 36 8 32Z" fill="#e88ac1" ${o}/>
    ${ln('M16 34c-3 6 3 10 0 16s3 8 0 12M28 35c-3 6 3 10 0 16s3 8 0 10M38 35c3 6 -3 10 0 16s-3 8 0 10M50 34c3 6 -3 10 0 16s-3 8 0 12', 2, '#c45a98')}
    ${eyes(25, 39, 22, 2.2)}${ln('M28 27c2 2 6 2 8 0', 1.6)}`,
  Rabe: `<path d="M8 46C10 32 20 26 30 28L50 42L60 52C48 54 22 56 8 46Z" fill="#26262e" ${o}/>
    <circle cx="28" cy="22" r="11" fill="#26262e" ${o}/><path d="M37 18L56 24L38 28Z" fill="#3a3a44" ${o}/>${eye(30, 19, 2)}<circle cx="30" cy="19" r="2.6" fill="none" stroke="#8a8a96" stroke-width="1"/>
    ${ln('M22 52v8M30 52v8', 2)}`,
  Robbe: `<ellipse cx="32" cy="34" rx="22" ry="21" fill="#8e9aa6" ${o}/><ellipse cx="32" cy="43" rx="12" ry="8" fill="#b9c3cc" ${o}/>
    ${eyes(23, 41, 30, 3.6)}<path d="M28.5 38h7L32 42Z" fill="${K}"/>${whisk(43, 1.2)}<circle cx="27" cy="45" r=".8" fill="${K}"/><circle cx="37" cy="45" r=".8" fill="${K}"/>`,
  Specht: `<path d="M18 62C14 48 16 32 26 28L38 34C40 44 38 54 34 62Z" fill="#222" ${o}/><path d="M22 40h12M22 46h12M22 52h11" stroke="#fff" stroke-width="2.4"/>
    <circle cx="30" cy="22" r="11" fill="#f5f5f5" ${o}/><path d="M20 18C20 10 34 8 40 16C34 14 26 16 20 18Z" fill="#d6402e" ${o}/>
    <path d="M40 20L60 23L40 26Z" fill="#555" ${o}/>${ln('M22 26l14 0', 3)}${eye(33, 20, 2)}`,
  Storch: `<path d="M6 34C10 24 24 22 34 26L46 30C40 40 18 42 6 34Z" fill="#fff" ${o}/><path d="M14 36C22 32 34 32 44 32L40 40C30 42 20 40 14 36Z" fill="#222"/>
    <path d="M36 28C38 20 40 14 42 10" fill="none" stroke="${K}" stroke-width="7" stroke-linecap="round"/><path d="M36 28C38 20 40 14 42 10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    <circle cx="43" cy="9" r="5.5" fill="#fff" ${o}/><path d="M47 7L63 13L47 11Z" fill="#e0462e" ${o}/>${eye(44, 8, 1.4)}
    ${ln('M22 40v22M28 40v22', 2.4, '#e0462e')}`,
  Tiger: `<circle cx="15" cy="15" r="7" fill="#ee8a2a" ${o}/><circle cx="49" cy="15" r="7" fill="#ee8a2a" ${o}/>
    <ellipse cx="32" cy="34" rx="22" ry="21" fill="#ee8a2a" ${o}/><ellipse cx="32" cy="45" rx="12" ry="9" fill="#fbf4ea" ${o}/>
    ${ln('M32 13v8M26 14l2 6M38 14l-2 6M10 30h8M10 37l7 -2M54 30h-8M54 37l-7 -2', 3)}${eyes(24, 40, 31, 2.4)}<path d="M28.5 39h7L32 43Z" fill="${K}"/>`,
  Uhu: `<path d="M14 4L24 16L14 20Z" fill="#7a5233" ${o}/><path d="M50 4L40 16L50 20Z" fill="#7a5233" ${o}/>
    <ellipse cx="32" cy="36" rx="22" ry="24" fill="#8e6340" ${o}/><circle cx="23" cy="29" r="9.5" fill="#d9bf95" ${o}/><circle cx="41" cy="29" r="9.5" fill="#d9bf95" ${o}/>
    <circle cx="23" cy="29" r="5.2" fill="#ef7f1a" ${o}/><circle cx="41" cy="29" r="5.2" fill="#ef7f1a" ${o}/>${eyes(23, 41, 29, 2.6)}
    <path d="M29 37L35 37L32 43Z" fill="#3a2a1a" ${o}/>${ln('M24 48l2 3l2 -3M30 50l2 3l2 -3M36 48l2 3l2 -3', 1.4)}`,
  Wal: `<path d="M4 40C4 28 18 24 32 26C44 28 50 34 52 40L60 32L62 46L54 46C48 52 36 54 24 54C12 54 4 50 4 40Z" fill="#3f78b5" ${o}/>
    <path d="M8 46C16 50 34 50 46 46" fill="none" stroke="#bcd6ee" stroke-width="3" stroke-linecap="round"/>${eye(16, 38, 2)}
    ${ln('M26 22c0 -6 0 -10 0 -14M26 12c-4 -4 -8 -4 -10 -2M26 12c4 -4 8 -4 10 -2', 2.2, '#5aa2dd')}`,
  Wolf: `<path d="M12 4L24 18L10 26Z" fill="#7d8590" ${o}/><path d="M52 4L40 18L54 26Z" fill="#7d8590" ${o}/>
    <path d="M10 24C14 14 50 14 54 24L50 40L40 56H24L14 40Z" fill="#7d8590" ${o}/><path d="M22 40C26 34 38 34 42 40L38 56H26Z" fill="#e6e9ec" ${o}/>
    ${eyes(24, 40, 30, 2.4)}<ellipse cx="32" cy="50" rx="3.6" ry="2.8" fill="${K}"/>`,
  Zebra: `<path d="M18 6L24 20L16 22Z" fill="#fff" ${o}/><path d="M46 6L40 20L48 22Z" fill="#fff" ${o}/><path d="M26 8C28 2 36 2 38 8L36 16H28Z" fill="#222" ${o}/>
    <path d="M18 20C20 12 44 12 46 20L44 42C44 54 40 60 32 60C24 60 20 54 20 42Z" fill="#fff" ${o}/>
    ${ln('M20 24l7 2M44 24l-7 2M20 31l8 1M44 31l-8 1M21 38l7 0M43 38l-7 0M30 16v8M34 16v8', 3)}${eyes(26, 38, 28, 2.2)}
    <path d="M22 46C24 42 40 42 42 46C42 54 38 60 32 60C26 60 22 54 22 46Z" fill="#333" ${o}/><circle cx="28" cy="50" r="1.5" fill="#888"/><circle cx="36" cy="50" r="1.5" fill="#888"/>`,
  Ameise: `${ln('M24 14L18 4M30 14L36 4M22 34L8 28M22 38L8 44M24 40L14 56M40 34L54 28M40 38L54 44M38 40L48 56', 2.4)}
    <circle cx="27" cy="18" r="7" fill="#3a2a22" ${o}/><ellipse cx="32" cy="36" rx="7" ry="8" fill="#3a2a22" ${o}/><ellipse cx="38" cy="52" rx="10" ry="9" fill="#3a2a22" ${o}/>
    <circle cx="25" cy="16" r="1.6" fill="#fff"/>`,
  Bär: `<circle cx="14" cy="16" r="8" fill="#7b4f2c" ${o}/><circle cx="50" cy="16" r="8" fill="#7b4f2c" ${o}/><circle cx="14" cy="16" r="4" fill="#c9966a"/><circle cx="50" cy="16" r="4" fill="#c9966a"/>
    <ellipse cx="32" cy="35" rx="22" ry="21" fill="#7b4f2c" ${o}/><ellipse cx="32" cy="44" rx="11" ry="8.5" fill="#c9966a" ${o}/>${eyes(24, 40, 31, 2.4)}<ellipse cx="32" cy="40" rx="4.2" ry="3" fill="${K}"/>${ln('M29 46c2 2 4 2 6 0', 1.6)}`,
  Elch: `<path d="M24 20C16 20 6 16 4 6L10 10L12 4L16 10L20 4L22 12L26 12Z" fill="#c9a874" ${o}/><path d="M40 20C48 20 58 16 60 6L54 10L52 4L48 10L44 4L42 12L38 12Z" fill="#c9a874" ${o}/>
    <path d="M22 22C22 16 42 16 42 22L44 40C46 50 42 60 32 60C22 60 18 50 20 40Z" fill="#6e4a2e" ${o}/>${eyes(26, 38, 28, 2.2)}
    <ellipse cx="32" cy="50" rx="9" ry="7" fill="#8a6142" ${o}/><circle cx="28.5" cy="51" r="1.4" fill="${K}"/><circle cx="35.5" cy="51" r="1.4" fill="${K}"/>`,
  Fasan: `<path d="M30 44L4 56L6 52L28 40Z" fill="#a5642e" ${o}/>
    <path d="M10 40C14 30 26 28 36 32L44 38C38 48 18 50 10 40Z" fill="#b8742f" ${o}/>${ln('M18 40l6 -2M22 44l6 -2M30 42l6 -2', 1.8, '#5a3414')}
    <path d="M36 34C36 26 38 20 42 16L48 18C46 24 44 30 42 36Z" fill="#2f7a6a" ${o}/><circle cx="46" cy="14" r="7" fill="#2f6a8a" ${o}/>
    <path d="M44 10C46 8 50 8 51 12C51 16 48 18 45 16Z" fill="#d6402e"/><path d="M52 13L58 15L52 17Z" fill="#e8d28a" ${o}/>${eye(48, 12, 1.4)}
    ${ln('M36 38h8', 2.4, '#fff')}`,
  Giraffe: `<path d="M18 62L26 26L38 26L36 62Z" fill="#f0c45a" ${o}/>
    <path d="M24 30C20 26 18 20 22 14C26 8 40 8 46 14L56 22C58 26 56 30 52 30L38 32Z" fill="#f0c45a" ${o}/>
    ${ln('M28 12l-2 -8M36 11l2 -8', 2.4)}<circle cx="26" cy="4" r="2.4" fill="#7a4f2c"/><circle cx="38" cy="3" r="2.4" fill="#7a4f2c"/>
    <g fill="#b06a2c"><rect x="24" y="36" width="6" height="6" rx="2"/><rect x="30" y="46" width="5" height="6" rx="2"/><rect x="23" y="52" width="5" height="5" rx="2"/><rect x="32" y="34" width="4" height="5" rx="2"/><rect x="30" y="18" width="5" height="4" rx="2"/></g>
    ${eye(40, 18, 2)}<circle cx="53" cy="25" r="1.2" fill="${K}"/>`,
  Hamster: `<circle cx="16" cy="16" r="6" fill="#e3a65a" ${o}/><circle cx="48" cy="16" r="6" fill="#e3a65a" ${o}/><circle cx="16" cy="16" r="3" fill="#f1b9c2"/><circle cx="48" cy="16" r="3" fill="#f1b9c2"/>
    <ellipse cx="32" cy="36" rx="24" ry="21" fill="#e3a65a" ${o}/><ellipse cx="17" cy="43" rx="9" ry="8" fill="#fbf1e2"/><ellipse cx="47" cy="43" rx="9" ry="8" fill="#fbf1e2"/><ellipse cx="32" cy="46" rx="7" ry="6" fill="#fbf1e2"/>
    ${eyes(24, 40, 32, 2.4)}<path d="M30 39h4L32 41.5Z" fill="#e88a9a" ${o}/>`,
  Kiwi: `<ellipse cx="28" cy="36" rx="22" ry="17" fill="#8a6a45" ${o}/>${ln('M14 30l4 3M20 26l4 3M14 40l4 3M24 36l4 3M30 28l4 3', 1.6, '#5e4426')}
    <circle cx="44" cy="28" r="9" fill="#8a6a45" ${o}/><path d="M51 30L63 46" fill="none" stroke="${K}" stroke-width="4" stroke-linecap="round"/><path d="M51 30L63 46" fill="none" stroke="#e8d7a8" stroke-width="2" stroke-linecap="round"/>
    ${eye(46, 25, 1.6)}${ln('M22 52v8l-4 2M22 60l3 2M32 52v8l-4 2M32 60l3 2', 2.2, '#c9a35a')}`,
  Lemur: `<path d="M44 58C58 58 62 44 56 34C52 28 46 30 46 36" fill="none" stroke="${K}" stroke-width="9" stroke-linecap="round"/>
    <path d="M44 58C58 58 62 44 56 34C52 28 46 30 46 36" fill="none" stroke="#f2f2f2" stroke-width="6" stroke-linecap="round" stroke-dasharray="4 4"/>
    <path d="M44 58C58 58 62 44 56 34C52 28 46 30 46 36" fill="none" stroke="#222" stroke-width="6" stroke-linecap="butt" stroke-dasharray="4 4" stroke-dashoffset="4"/>
    <path d="M10 10L20 18L12 24Z" fill="#9aa0a6" ${o}/><path d="M42 10L32 18L40 24Z" fill="#9aa0a6" ${o}/>
    <path d="M8 22C10 14 42 14 44 22L38 42L26 54L14 42Z" fill="#c7cbcf" ${o}/><path d="M14 26C18 22 22 26 22 30C20 34 16 32 14 26ZM38 26C34 22 30 26 30 30C32 34 36 32 38 26Z" fill="#222"/>
    <circle cx="19" cy="29" r="3" fill="#f2a23a"/><circle cx="33" cy="29" r="3" fill="#f2a23a"/><circle cx="19" cy="29" r="1.4" fill="${K}"/><circle cx="33" cy="29" r="1.4" fill="${K}"/>
    <path d="M22 38L30 38L26 54Z" fill="#222"/>`,
  Milan: `<path d="M32 22C26 22 22 26 22 30L4 22C2 26 6 34 20 38L24 40L18 56L26 50L32 54L38 50L46 56L40 40L44 38C58 34 62 26 60 22L42 30C42 26 38 22 32 22Z" fill="#b5532a" ${o}/>
    ${ln('M8 26l12 8M56 26l-12 8', 1.6, '#5a2410')}<circle cx="32" cy="18" r="6" fill="#d8d0c4" ${o}/><path d="M30 22L34 22L32 26Z" fill="#f2c230" ${o}/>${eyes(29.5, 34.5, 17, 1.2)}`,
  Puma: `<circle cx="16" cy="16" r="6.5" fill="#c49a6c" ${o}/><circle cx="48" cy="16" r="6.5" fill="#c49a6c" ${o}/><circle cx="16" cy="16" r="3" fill="#5a4026"/><circle cx="48" cy="16" r="3" fill="#5a4026"/>
    <ellipse cx="32" cy="34" rx="21" ry="21" fill="#c49a6c" ${o}/><ellipse cx="32" cy="45" rx="11" ry="9" fill="#f6eee2" ${o}/>
    ${ln('M23 42c-2 6 -6 8 -10 8M41 42c2 6 6 8 10 8', 2, '#5a4026')}${eyes(24, 40, 31, 2.4)}<path d="M28.5 39h7L32 43Z" fill="#c26a6a" ${o}/>${ln('M32 43v3', 1.6)}`,
};

// Symbol als SVG-Text; size z. B. '1.4em' oder '100%'
export function animalSvg(card, { size = '1.3em', title = true } = {}) {
  const name = ANIMALS[card - 1]; if (!name) return '';
  return `<svg class="animal" viewBox="0 0 64 64" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="${title ? 'false' : 'true'}" role="img">${title ? `<title>${name}</title>` : ''}${DRAW[name]}</svg>`;
}

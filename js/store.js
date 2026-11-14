// Datenhaltung: alles bleibt im Browser dieses Geräts (localStorage) – mit App-Sperre nur verschlüsselt.
import { uid } from './engine.js';
import { GEAR, gearSize, scaleOf } from './hallgear.js';
import { MARKS, fromOldFloor } from './hallfloor.js';
import { animalName } from './animals.js';
import { FORM_IDS, bandOf } from './hallplan.js';

const KEY = 'klassenkompass.v1', ENC_KEY = 'klassenkompass.v1.enc';
export const SCHEMA = 3;   // 2 = Lerngruppen, Fach, Themen und Phasen der Hallenpläne (2.0.0); 3 = eigene Themenliste der Hallenpläne (2.1.0)
export const SCREEN_W = 1280, SCREEN_H = 720, SCREEN_W_WIDE = 1680;
// Bühnenbreite je Format: 16:9 (1280 × 720) oder 21:9 für Ultrawide-Bildschirme (1680 × 720)
export const stageW = s => (s?.format === 'wide' ? SCREEN_W_WIDE : SCREEN_W);

const DEMO_NAMES = ['Amelie', 'Ben', 'Clara', 'David', 'Emma', 'Felix', 'Greta', 'Hannah', 'Ida', 'Jonas', 'Lina', 'Luis', 'Mila', 'Noah', 'Paul', 'Sofia'];
const DEMO_SPORT = ['Anton', 'Bela', 'Carla', 'Dana', 'Elias', 'Frida', 'Gabriel', 'Hanna', 'Ilias', 'Jana', 'Kian', 'Lea', 'Mats', 'Nele', 'Oskar', 'Pia', 'Quentin', 'Romy', 'Samu', 'Tilda'];

export function demoClass() {
  return { id: uid(), name: 'Demoklasse', subject: 'Technik', demo: true, students: DEMO_NAMES.map(name => ({ id: uid(), name })),
    settings: { layout: 'omnibus', tables: 8, groups: 4 }, rules: [], plan: null };
}
export function demoSportGroup() {
  return { id: uid(), name: 'Demogruppe Sport', subject: 'Sport', demo: true, teamCount: 4, rules: [], teams: [], tournaments: [], series: [],
    students: DEMO_SPORT.map((name, i) => ({ id: uid(), name, className: i % 2 ? '6b' : '6a' })) };
}
// Hallenplan: Beispiel mit drei Bereichen hintereinander (schematisch, ohne Maße)
export function demoHall() {
  const it = (kind, x, y, w, h, extra = {}) => ({ id: uid(), kind, x, y, w, h, rot: 0, ...extra });
  const zones = [['Gruppe 1', '#2e7d4f', 150], ['Gruppe 2', '#d9a521', 560], ['Gruppe 3', '#c94040', 970]];
  const items = [];
  zones.forEach(([t, color, x], i) => {
    items.push(it('zone', x, 150, 420, 600, { color, text: t }));
    items.push(it('cone', x + 230, 300, 70, 70, { color, text: 'H' + (i * 3 + 1) }));
    items.push(it('cone', x - 40, 660, 70, 70, { color, text: 'H' + (i * 3 + 2) }));
    items.push(it('cone', x + 250, 660, 70, 70, { color, text: 'H' + (i * 3 + 3) }));
    items.push(it('arrow', x + 50, 672, 190, 44, { color: '#2f5e8e' }));
  });
  items.push(it('path', 90, 820, 1100, 34, { color: '#b0602a' }));
  items.push(it('tag', 1180, 880, 90, 64, { text: 'S' }));
  items.push(it('tag', 1300, 880, 110, 64, { text: 'LK' }));
  return { id: uid(), title: 'Beispiel: drei Bereiche', topic: 'Beispiele', demo: true, floor: 'halle', v: 3, lines: [], items: items.map(fromOldFloor) };
}
export function defaultScreen() {
  return { background: 'mint', zoom: 'auto', format: 'std', widgets: [
    { id: uid(), type: 'timer', style: 'digital', label: 'Arbeitsphase', x: 52, y: 90, width: 390, height: 230, durationMs: 600000, remainingMs: 600000, endsAt: null, sound: true },
    { id: uid(), type: 'timer', style: 'circle', label: 'Noch Zeit für Fragen', x: 493, y: 56, width: 280, height: 364, durationMs: 300000, remainingMs: 300000, endsAt: null, sound: true },
    { id: uid(), type: 'qr', label: 'Unterrichtsmaterial', x: 834, y: 114, width: 278, height: 354, content: '' },
  ] };
}
// Quiz-Klasse: nur Name und Kinderzahl. Die Kinder sind Karte 1 … n mit festem Tier (Karte 1 = Adler …).
// Vorhandene Kennungen je Karte bleiben erhalten (Antworten früherer Quiz hängen daran).
export function quizStudents(classId, count, old = []) {
  const byCard = new Map(old.map(s => [s.card, s.id]));
  return Array.from({ length: count }, (_, i) => ({ id: byCard.get(i + 1) || `${classId}-${i + 1}`, name: animalName(i + 1), card: i + 1 }));
}
export function demoQuiz() {
  const id = uid();
  const cls = { id, name: 'Demoklasse', demo: true, count: 16, resetAt: 0, students: quizStudents(id, 16) };
  const q = (text, options, correct) => ({ id: uid(), text, options, correct });
  const set = { id: uid(), title: 'Demo: Werkzeugkunde', demo: true, classId: id, questions: [
    q('Mit welchem Werkzeug sägt man Holz quer zur Faser?', ['Feinsäge', 'Feile', 'Raspel', 'Schraubzwinge'], 0),
    q('Wozu dient eine Schraubzwinge?', ['Bohren', 'Werkstück festhalten', 'Messen', 'Schleifen'], 1),
    q('Beim Bohren an der Ständerbohrmaschine trägt man eine Schutzbrille.', ['Richtig', 'Falsch'], 0)] };
  return { classes: [cls], sets: [set], sessions: [], activeClassId: cls.id, activeSetId: set.id, autoReveal: true };
}
export function freshState() {
  const c = demoClass(), g = demoSportGroup();
  const h = demoHall();
  return { schema: SCHEMA, active: c.id, technik: { classes: [c], activeId: c.id }, sport: { groups: [g], activeId: g.id, halls: [h], activeHall: h.id, hallLib: [], hallTopics: normTopics(undefined, [h]) }, quiz: demoQuiz(), screen: defaultScreen(), welcomed: false };
}

let state;
const listeners = new Set();
// Schutz (seit 2.0.0): Stammen die Daten von einer neueren App-Fassung, speichert diese Fassung nichts – sonst gingen
// Felder verloren, die sie nicht kennt. Die App bittet dann, die neue Version zu laden.
let newer = false;
export const outdated = () => newer;
export function checkNewer(raw) { if (Number(raw?.schema) > SCHEMA) { newer = true; lastError = NEWER_MSG; } return newer; }
const NEWER_MSG = 'Diese Daten stammen von einer neueren App-Fassung. Bitte die App neu laden („Neue Version“), damit nichts verloren geht.';
let saveTimer = null, lastError = null;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : null; checkNewer(data);
    state = data ? normalize(data) : freshState();
  } catch { state = freshState(); }
  return state;
}
// ---------- Verschlüsselte Ablage (App-Sperre, js/lock.js) ----------
// Ist eine Verschlüsselung gesetzt, liegt der Zustand nur verschlüsselt unter ENC_KEY; der Klartext-Schlüssel KEY wird entfernt.
let cipher = null, saving = Promise.resolve(), pending = false;
export const encrypted = () => !!cipher;
// Nach dem Entsperren: verschlüsselten Stand laden. Ein Klartext-Stand (z. B. von einer älteren App-Fassung geschrieben) hat Vorrang.
export async function loadEncrypted(c) {
  cipher = c;
  const plain = localStorage.getItem(KEY), enc = localStorage.getItem(ENC_KEY);
  try {
    const data = plain ? JSON.parse(plain) : enc ? JSON.parse(await c.decrypt(JSON.parse(enc))) : null;
    checkNewer(data);
    if (data) state = normalize(data);
    else state = freshState();
  } catch (e) { if (e?.decrypt) throw e; state = freshState(); }
  if (plain || !enc) await flush();
  return state;
}
// Verschlüsselung ein- (Objekt mit encrypt/decrypt) oder ausschalten (null); schreibt den Stand sofort im neuen Format
export async function setCipher(c) {
  await saving;
  cipher = c;
  if (c) await flush();
  else { saveNow(); if (!lastError) localStorage.removeItem(ENC_KEY); }
}
export const get = () => state;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function storageError() { return lastError; }

// Änderung durchführen, speichern und Ansicht benachrichtigen
export function update(mutator, { silent = false } = {}) {
  mutator(state);
  scheduleSave();
  if (!silent) listeners.forEach(fn => fn(state));
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 150);
}
export function saveNow() {
  clearTimeout(saveTimer);
  if (newer) { lastError = NEWER_MSG; return; }
  if (cipher) { flush(); return; }
  try { localStorage.setItem(KEY, JSON.stringify(state)); lastError = null; }
  catch (e) { lastError = 'Speichern nicht möglich (Speicher voll oder privates Fenster). Sichere deine Daten über „Daten exportieren“.'; }
}
// Verschlüsselt speichern; mehrere Aufrufe kurz hintereinander werden zu einem zusammengefasst
export function flush() {
  clearTimeout(saveTimer);
  if (!cipher || newer) { saveNow(); return Promise.resolve(); }
  if (pending) return saving;
  pending = true;
  saving = saving.then(async () => {
    pending = false;
    if (!cipher) return;
    try {
      const box = await cipher.encrypt(JSON.stringify(state));
      localStorage.setItem(ENC_KEY, JSON.stringify(box)); localStorage.removeItem(KEY); lastError = null;
    } catch (e) { lastError = 'Speichern nicht möglich (Speicher voll oder privates Fenster). Sichere deine Daten über „Daten exportieren“.'; }
  });
  return saving;
}
addEventListener('pagehide', saveNow);
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
// Andere geöffnete Tabs desselben Geräts übernehmen Änderungen
addEventListener('storage', async e => {
  if (!e.newValue) return;
  try {
    let data;
    if (cipher && e.key === ENC_KEY) data = JSON.parse(await cipher.decrypt(JSON.parse(e.newValue)));
    else if (!cipher && e.key === KEY) data = JSON.parse(e.newValue);
    else return;
    if (checkNewer(data)) return;
    state = normalize(data);
    listeners.forEach(fn => fn(state));
  } catch {}
});

export function replaceState(next) { state = normalize(next); saveNow(); listeners.forEach(fn => fn(state)); }

// ---------- Prüfen und Vereinheitlichen ----------
const str = (v, max = 80) => String(v ?? '').trim().slice(0, max);
const int = (v, min, max, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
// Fach einer Lerngruppe (seit 2.0.0); ältere Klassen aus „Technik“ bekommen es aus dem Namen, sonst Technik
export const SUBJECTS = ['Technik', 'Sport', 'Informatik'];
function guessSubject(name, d) { const n = String(name || '').toLocaleLowerCase('de'); return SUBJECTS.find(x => n.includes(x.toLocaleLowerCase('de'))) || d; }
const LAYOUTS = ['omnibus', 'gruppen', 'sitzkreis', 'stehkreis', 'uform', 'arena'];

function normClass(c) {
  const students = (Array.isArray(c?.students) ? c.students : []).filter(s => s && s.id && str(s.name)).slice(0, 80).map(s => ({ id: String(s.id), name: str(s.name, 40) }));
  const ids = new Set(students.map(s => s.id));
  const st = c?.settings || {};
  const plan = c?.plan && Array.isArray(c.plan.groups) ? { groups: c.plan.groups.map(g => (g || []).filter(id => ids.has(id))), createdAt: c.plan.createdAt || '' } : null;
  return { id: String(c?.id || uid()), name: str(c?.name, 60) || 'Klasse', subject: str(c?.subject, 30) || guessSubject(c?.name, 'Technik'), demo: !!c?.demo, students,
    settings: { layout: LAYOUTS.includes(st.layout) ? st.layout : 'omnibus', tables: int(st.tables, 1, 40, 8), groups: int(st.groups, 1, 20, 4) },
    rules: (Array.isArray(c?.rules) ? c.rules : []).filter(r => Array.isArray(r) && ids.has(r[0]) && ids.has(r[1]) && r[0] !== r[1]).map(r => [r[0], r[1]]), plan };
}
function normSport(g) {
  const students = (Array.isArray(g?.students) ? g.students : []).filter(s => s && s.id && str(s.name)).slice(0, 120).map(s => ({ id: String(s.id), name: str(s.name, 40), className: str(s.className, 20) }));
  const ids = new Set(students.map(s => s.id));
  const num = v => (v === null || v === '' || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  const tournaments = (Array.isArray(g?.tournaments) ? g.tournaments : []).map(t => ({
    id: String(t.id || uid()), title: str(t.title, 80) || 'Turnier', sport: str(t.sport, 40) || 'Sport', date: str(t.date, 10),
    participants: (t.participants || []).map(p => ({ id: String(p.id), name: str(p.name, 40), className: str(p.className, 20) })),
    teams: (t.teams || []).map(x => ({ id: String(x.id), name: str(x.name, 40), members: (x.members || []).map(String) })),
    matches: (t.matches || []).map(m => ({ id: String(m.id || uid()), round: int(m.round, 1, 99, 1), a: String(m.a), b: String(m.b), scoreA: num(m.scoreA), scoreB: num(m.scoreB),
      winner: m.winner === 'A' || m.winner === 'B' ? m.winner : null, court: int(m.court, 1, 999, 1), pos: int(m.pos, 0, 999, 0) })),
    win: Number(t.win ?? 3), draw: Number(t.draw ?? 1), loss: Number(t.loss ?? 0),
    format: ['ko', 'kotc'].includes(t.format) ? t.format : 'rr', order: (Array.isArray(t.order) ? t.order : []).map(String),
    placement: t.placement === 'top' ? 'top' : 'all', rounds: int(t.rounds, 1, 30, 6),
    courtPoints: (Array.isArray(t.courtPoints) ? t.courtPoints : []).slice(0, 20).map(v => (Number.isFinite(Number(v)) ? Number(v) : 0)) }));
  const series = (Array.isArray(g?.series) ? g.series : []).map(s => ({
    id: String(s.id || uid()), title: str(s.title, 80) || 'Rangliste', sport: str(s.sport, 40) || 'Sport',
    participants: (s.participants || []).map(p => ({ id: String(p.id), name: str(p.name, 40), className: str(p.className, 20) })),
    sessions: (s.sessions || []).map(x => ({ id: String(x.id || uid()), date: str(x.date, 10), title: str(x.title, 80), tournamentId: x.tournamentId || null,
      points: Object.fromEntries(Object.entries(x.points || {}).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])) })) }));
  return { id: String(g?.id || uid()), name: str(g?.name, 60) || 'Sportgruppe', subject: str(g?.subject, 30) || 'Sport', demo: !!g?.demo, students, teamCount: int(g?.teamCount, 2, 20, 4),
    rules: (Array.isArray(g?.rules) ? g.rules : []).filter(r => Array.isArray(r) && ids.has(r[0]) && ids.has(r[1])).map(r => [r[0], r[1]]),
    teams: (Array.isArray(g?.teams) ? g.teams : []).map(t => ({ id: String(t.id || uid()), name: str(t.name, 40), members: (t.members || []).filter(id => ids.has(id)) })),
    tournaments, series };
}
function normScreen(s) {
  if (!s || !Array.isArray(s.widgets)) return defaultScreen();
  const widgets = s.widgets.filter(w => w && ['timer', 'qr', 'stopwatch', 'interval', 'hall'].includes(w.type)).slice(0, 30).map(w => ({ ...w, id: String(w.id || uid()),
    x: int(w.x, 0, SCREEN_W_WIDE - 60, 40), y: int(w.y, 0, SCREEN_H - 60, 40), width: int(w.width, 120, SCREEN_W_WIDE, 300), height: int(w.height, 120, SCREEN_H, 260), label: str(w.label, 60) }));
  return { background: ['mint', 'paper', 'night'].includes(s.background) ? s.background : 'mint', zoom: s.zoom || 'auto', format: s.format === 'wide' ? 'wide' : 'std', widgets };
}
// ---------- Hallenpläne ----------
export const HALL_MAX = 120;
export const HALL_KINDS = ['zone', 'cone', 'kid', 'teacher', 'ball', 'arrow', 'path', 'cross', 'tag', 'text', 'gear', 'img'];
// Einfache Geräte bis 1.12 → Geräte aus dem Katalog (Kennung, Ansicht, damalige Standardbreite)
const OLD_GEAR = { bench: ['bank_lang', 'quer', 340], mat: ['turnmatte', 'quer', 230], softmat: ['weichboden', 'quer', 290], box: ['kasten4', 'quer', 120], goal: ['tor', 'frontal', 200] };
const COLOR_RE = /^#[0-9a-f]{6}$/i, GEAR_RE = /^[a-z0-9_]{1,30}$/, VIEW_RE = /^[a-z]{1,20}$/;
function oldGear(i) {
  const o = OLD_GEAR[i?.kind]; if (!o) return i;
  // gleiche Breite wie bisher, Höhe aus dem neuen Gerät
  const [gear, view, w0] = o, s = gearSize(gear, view), f = Math.max(0.1, (Number(i.w) || w0) / s.w), w = Math.round(s.w * f), h = Math.round(s.h * f);
  const cx = (Number(i.x) || 0) + (Number(i.w) || w0) / 2, cy = (Number(i.y) || 0) + (Number(i.h) || 0) / 2;
  return { id: i.id, kind: 'gear', gear, view, x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h, rot: i.rot };
}
// Geräte in Standardgröße (bis 1.15 etwa doppelt so groß wie maßstäblich) auf den Maßstab der Halle verkleinern; bereits verkleinerte bleiben
function toScale(i) {
  if (i.kind !== 'gear' || !GEAR[i.gear]) return i;
  const d = gearSize(i.gear, GEAR[i.gear].views.includes(i.view) ? i.view : GEAR[i.gear].views[0]), w = Number(i.w) || d.w, h = Number(i.h) || d.h;
  if (h / d.h < 0.85) return i;
  const f = scaleOf(i.gear), nw = Math.round(w * f), nh = Math.round(h * f);
  return { ...i, x: Math.round((Number(i.x) || 0) + (w - nw) / 2), y: Math.round((Number(i.y) || 0) + (h - nh) * 0.8), w: nw, h: nh };
}
function normHalls(list) {
  return (Array.isArray(list) ? list : []).slice(0, HALL_MAX).map(p => ({ id: String(p?.id || uid()), title: str(p?.title, 80) || 'Hallenplan', demo: !!p?.demo,
    // Thema, Stunde und Phase (seit 2.0.0): ordnen die Sammlung; Phase 0 = keine Phase
    topic: str(p?.topic, 60), lesson: str(p?.lesson, 80), phase: p?.lesson ? int(p?.phase, 1, 20, 1) : 0,
    floor: ['halle', 'linien', 'leer'].includes(p?.floor) ? p.floor : 'halle',
    // v 2 = Halle 27 m × 15 m (seit 1.15), v 3 = Geräte maßstäblich (seit 1.16); ältere Pläne werden einmal umgerechnet
    v: 3, lines: MARKS.map(m => m.id).filter(m => Array.isArray(p?.lines) && p.lines.includes(m)),
    items: (Array.isArray(p?.items) ? p.items : []).map(oldGear).map(i => (i && !(p.v >= 2) ? fromOldFloor(i) : i)).map(i => (i && !(p.v >= 3) ? toScale(i) : i)).filter(i => i && HALL_KINDS.includes(i.kind) && (i.kind !== 'img' || IMG_RE.test(i.img)) && (i.kind !== 'gear' || GEAR_RE.test(i.gear))).slice(0, 400).map(i => ({
      id: String(i.id || uid()), kind: i.kind, x: int(i.x, -400, 2000, 100), y: int(i.y, -400, 1400, 100), w: int(i.w, 8, 2000, 80), h: int(i.h, 8, 1400, 80),
      rot: int(i.rot, -360, 360, 0), ...(COLOR_RE.test(i.color) ? { color: i.color } : {}),
      ...(i.kind === 'zone' && FORM_IDS.includes(i.form) && i.form !== 'rect' ? { form: i.form, tx: bandOf(Number(i.tx)), ty: bandOf(Number(i.ty)) } : {}), ...(i.text ? { text: str(i.text, 60) } : {}), ...(i.kind === 'img' ? { img: i.img } : {}),
      ...(i.kind === 'gear' ? { gear: i.gear, view: VIEW_RE.test(i.view) && (!GEAR[i.gear] || GEAR[i.gear].views.includes(i.view)) ? i.view : (GEAR[i.gear]?.views[0] || 'quer') } : {}) })) }));
}
function normHallLib(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter(e => e && IMG_RE.test(e.id) && !seen.has(e.id) && seen.add(e.id)).slice(0, 600).map(e => ({
    id: e.id, name: str(e.name, 80) || 'Bild', view: str(e.view, 40), key: str(e.key, 120) || e.id, cat: str(e.cat, 60) || 'Eigene Bilder', code: str(e.code, 20), w: int(e.w, 1, 5000, 200), h: int(e.h, 1, 5000, 200) }));
}
const CARD_MAX = 40;
const IMG_RE = /^img_[0-9a-f]{20}$/;
function normQuiz(q) {
  if (!q || typeof q !== 'object') return demoQuiz();
  // Seit 1.17.0 nur noch Tiernamen: Klassen bestehen aus Name und Kinderzahl. Ältere Klassen mit Vornamen werden
  // umgestellt – jedes Kind behält seine Kartennummer und heißt nun wie das Tier dieser Karte.
  const classes = (Array.isArray(q.classes) ? q.classes : []).map(c => {
    const id = String(c?.id || uid());
    const old = (Array.isArray(c?.students) ? c.students : []).filter(s => s && s.id).map(s => ({ id: String(s.id), card: int(s.card, 1, CARD_MAX, 0) })).filter(s => s.card);
    const count = int(c?.count, 1, CARD_MAX, 0) || Math.max(0, ...old.map(s => s.card)) || 16;
    const resetAt = Number.isFinite(Number(c?.resetAt)) && Number(c.resetAt) > 0 ? Number(c.resetAt) : 0;
    return { id, name: str(c?.name, 60) || 'Klasse', demo: !!c?.demo, count, resetAt, students: quizStudents(id, count, old) };
  });
  // Frühere „Decknamen“-Ansicht (1.14–1.16): ihre Ergebnisse bekommen eine eigene Klasse „Lerngruppe“
  if (Array.isArray(q.sessions) && q.sessions.some(x => x?.classId === 'alias') && !classes.some(c => c.id === 'alias')) {
    const count = int(q.alias?.count, 1, CARD_MAX, 16);
    classes.push({ id: 'alias', name: 'Lerngruppe', demo: false, count, resetAt: 0, students: quizStudents('alias', count) });
  }
  const normQ = x => {
    const options = (Array.isArray(x?.options) ? x.options : []).map(o => str(o, 120)).slice(0, 4);
    while (options.length < 2) options.push('');
    const correct = Number.isInteger(x?.correct) && x.correct >= 0 && x.correct < options.length ? x.correct : null;
    // Bilder: nur Kennungen (die Bilder selbst liegen in IndexedDB, siehe images.js)
    const imgId = v => (typeof v === 'string' && IMG_RE.test(v) ? v : '');
    const img = imgId(x?.img), optImgs = options.map((_, i) => imgId(x?.optImgs?.[i]));
    return { id: String(x?.id || uid()), text: str(x?.text, 400), options, correct, ...(img ? { img } : {}), ...(optImgs.some(Boolean) ? { optImgs } : {}) };
  };
  // Seit 1.20.0 gehört jeder Fragensatz zu einer Klasse (classId), bewusst zu allen ('*') oder – ältere Sätze und Sätze
  // gelöschter Klassen – noch zu keiner (''). Sätze ohne Klasse lassen sich erst nach dem Zuordnen starten.
  const setClass = v => (v === '*' ? '*' : classes.some(c => c.id === v) ? String(v) : '');
  const sets = (Array.isArray(q.sets) ? q.sets : []).map(t => ({ id: String(t?.id || uid()), title: str(t?.title, 80) || 'Fragensatz', demo: !!t?.demo, classId: setClass(t?.classId),
    questions: (Array.isArray(t?.questions) ? t.questions : []).slice(0, 100).map(normQ) }));
  const sessions = (Array.isArray(q.sessions) ? q.sessions : []).slice(-200).map(x => ({ id: String(x?.id || uid()), device: str(x?.device, 40), classId: String(x?.classId || ''), className: str(x?.className, 60),
    setId: String(x?.setId || ''), title: str(x?.title, 80), date: str(x?.date, 10), index: int(x?.index, 0, 99, 0), reveal: !!x?.reveal, done: !!x?.done,
    at: Number.isFinite(Number(x?.at)) && Number(x.at) > 0 ? Number(x.at) : 0,
    students: (Array.isArray(x?.students) ? x.students : []).map(s => { const card = int(s?.card, 1, CARD_MAX, 0); return { id: String(s?.id), name: card ? animalName(card) : str(s?.name, 40), card }; }),
    absent: (Array.isArray(x?.absent) ? x.absent : []).map(String),
    questions: (Array.isArray(x?.questions) ? x.questions : []).map(y => ({ ...normQ(y),
      answers: Object.fromEntries(Object.entries(y?.answers || {}).filter(([, v]) => Number.isInteger(v) && v >= 0 && v < 4)) })) }));
  return { classes, sets, sessions, autoReveal: q.autoReveal !== false,
    activeClassId: classes.some(c => c.id === q.activeClassId) ? q.activeClassId : classes[0]?.id ?? null,
    activeSetId: sets.some(t => t.id === q.activeSetId) ? q.activeSetId : sets[0]?.id ?? null };
}
// Themen der Hallenpläne (seit 2.1.0): eigene, geordnete Liste – auch Themen ohne Plan bleiben stehen. Themen, die in
// Plänen vorkommen, aber (noch) fehlen, werden hinten ergänzt. Ohne gespeicherte Liste gibt es Vorschläge.
export const TOPIC_DEFAULTS = ['Aufwärmen', 'Fußball', 'Volleyball', 'Völkerball', 'Basketball', 'Handball', 'Turnen'];
export const TOPIC_MAX = 80;
export function normTopics(list, halls = []) {
  const out = [], seen = new Set();
  const add = t => { const v = str(t, 60); const k = v.toLocaleLowerCase('de'); if (v && !seen.has(k) && out.length < TOPIC_MAX) { seen.add(k); out.push(v); } };
  (Array.isArray(list) ? list : TOPIC_DEFAULTS).forEach(add);
  halls.forEach(h => add(h.topic));
  return out;
}
function hallPart(sp) {
  // Ältere Stände ohne Hallenpläne bekommen das Beispiel
  const halls = Array.isArray(sp?.halls) ? normHalls(sp.halls) : [demoHall()];
  return { halls, activeHall: halls.some(h => h.id === sp?.activeHall) ? sp.activeHall : halls[0]?.id ?? null, hallLib: normHallLib(sp?.hallLib), hallTopics: normTopics(sp?.hallTopics, halls) };
}
export function normalize(raw) {
  const fresh = freshState();
  if (!raw || typeof raw !== 'object') return fresh;
  const classes = (raw.technik?.classes || []).map(normClass);
  const groups = (raw.sport?.groups || []).map(normSport);
  const known = id => classes.some(c => c.id === id) || groups.some(g => g.id === id);
  const active = known(raw.active) ? raw.active : known(raw.technik?.activeId) ? raw.technik.activeId : classes[0]?.id ?? groups[0]?.id ?? null;
  return { schema: SCHEMA, active,
    technik: { classes, activeId: classes.some(c => c.id === raw.technik?.activeId) ? raw.technik.activeId : classes[0]?.id ?? null },
    sport: { groups, activeId: groups.some(g => g.id === raw.sport?.activeId) ? raw.sport.activeId : groups[0]?.id ?? null, ...hallPart(raw.sport) },
    quiz: normQuiz(raw.quiz), screen: normScreen(raw.screen), welcomed: !!raw.welcomed };
}

// ---------- Export / Import ----------
export function exportJson() {
  return JSON.stringify({ app: 'KlassenKompass', schema: SCHEMA, exportedAt: new Date().toISOString(), data: state }, null, 1);
}

// Liest eigene Sicherungen und das Format der früheren ChatGPT-App
export function parseImport(text) {
  const raw = JSON.parse(text);
  if (raw?.app === 'KlassenKompass' && Number(raw.data?.schema ?? raw.schema) > SCHEMA) throw new Error('Diese Sicherung stammt von einer neueren App-Fassung. Bitte zuerst die App neu laden („Neue Version“).');
  if (raw?.app === 'KlassenKompass' && raw.data) return normalize({ quiz: { classes: [], sets: [] }, ...raw.data });
  const legacyClasses = raw?.classes ?? raw?.technik;
  const legacyGroups = raw?.groups ?? raw?.sport;
  if (Array.isArray(legacyClasses) || Array.isArray(legacyGroups) || raw?.screen) {
    const classes = (Array.isArray(legacyClasses) ? legacyClasses : []).map(r => r?.data ?? r);
    const groups = (Array.isArray(legacyGroups) ? legacyGroups : []).map(r => r?.data ?? r);
    const screen = raw?.screen?.data ?? raw?.screen;
    const result = normalize({ technik: { classes }, sport: { groups }, quiz: { classes: [], sets: [] }, screen, welcomed: true });
    if (!screen) result.screen.widgets = [];
    return result;
  }
  throw new Error('Diese Datei enthält keine KlassenKompass-Daten.');
}

// Zusammenführen: gleiche IDs werden ersetzt, neue ergänzt
export function mergeInto(current, incoming, { replaceScreen }) {
  const merge = (a, b) => { const map = new Map(a.map(x => [x.id, x])); b.forEach(x => map.set(x.id, x)); return [...map.values()]; };
  const next = structuredClone(current);
  next.technik.classes = merge(next.technik.classes, incoming.technik.classes);
  next.sport.groups = merge(next.sport.groups, incoming.sport.groups);
  if (incoming.technik.classes.length) next.technik.activeId = incoming.technik.classes[0].id;
  if (incoming.sport.groups.length) next.sport.activeId = incoming.sport.groups[0].id;
  next.active = incoming.technik.classes[0]?.id ?? incoming.sport.groups[0]?.id ?? next.active;
  next.sport.halls = merge(next.sport.halls, incoming.sport.halls.filter(h => !h.demo));
  next.sport.hallLib = merge(next.sport.hallLib, incoming.sport.hallLib);
  next.sport.hallTopics = normTopics([...(next.sport.hallTopics || []), ...(incoming.sport.hallTopics || [])], next.sport.halls);
  const iq = incoming.quiz, nq = next.quiz;
  nq.classes = merge(nq.classes, iq.classes); nq.sets = merge(nq.sets, iq.sets); nq.sessions = merge(nq.sessions, iq.sessions);
  if (!nq.classes.some(c => c.id === nq.activeClassId)) nq.activeClassId = nq.classes[0]?.id ?? null;
  if (!nq.sets.some(t => t.id === nq.activeSetId)) nq.activeSetId = nq.sets[0]?.id ?? null;
  if (replaceScreen) next.screen = incoming.screen;
  next.welcomed = true;
  return next;
}

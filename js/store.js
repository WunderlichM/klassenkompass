// Datenhaltung: alles bleibt im Browser dieses Geräts (localStorage).
import { uid } from './engine.js';

const KEY = 'klassenkompass.v1';
export const SCHEMA = 1;
export const SCREEN_W = 1280, SCREEN_H = 720, SCREEN_W_WIDE = 1680;
// Bühnenbreite je Format: 16:9 (1280 × 720) oder 21:9 für Ultrawide-Bildschirme (1680 × 720)
export const stageW = s => (s?.format === 'wide' ? SCREEN_W_WIDE : SCREEN_W);

const DEMO_NAMES = ['Amelie', 'Ben', 'Clara', 'David', 'Emma', 'Felix', 'Greta', 'Hannah', 'Ida', 'Jonas', 'Lina', 'Luis', 'Mila', 'Noah', 'Paul', 'Sofia'];
const DEMO_SPORT = ['Anton', 'Bela', 'Carla', 'Dana', 'Elias', 'Frida', 'Gabriel', 'Hanna', 'Ilias', 'Jana', 'Kian', 'Lea', 'Mats', 'Nele', 'Oskar', 'Pia', 'Quentin', 'Romy', 'Samu', 'Tilda'];

export function demoClass() {
  return { id: uid(), name: 'Demoklasse', demo: true, students: DEMO_NAMES.map(name => ({ id: uid(), name })),
    settings: { layout: 'omnibus', tables: 8, groups: 4 }, rules: [], plan: null };
}
export function demoSportGroup() {
  return { id: uid(), name: 'Demogruppe Sport', demo: true, teamCount: 4, rules: [], teams: [], tournaments: [], series: [],
    students: DEMO_SPORT.map((name, i) => ({ id: uid(), name, className: i % 2 ? '6b' : '6a' })) };
}
export function defaultScreen() {
  return { background: 'mint', zoom: 'auto', format: 'std', widgets: [
    { id: uid(), type: 'timer', style: 'digital', label: 'Arbeitsphase', x: 52, y: 90, width: 390, height: 230, durationMs: 600000, remainingMs: 600000, endsAt: null, sound: true },
    { id: uid(), type: 'timer', style: 'circle', label: 'Noch Zeit für Fragen', x: 493, y: 56, width: 280, height: 364, durationMs: 300000, remainingMs: 300000, endsAt: null, sound: true },
    { id: uid(), type: 'qr', label: 'Unterrichtsmaterial', x: 834, y: 114, width: 278, height: 354, content: '' },
  ] };
}
export function freshState() {
  const c = demoClass(), g = demoSportGroup();
  return { schema: SCHEMA, technik: { classes: [c], activeId: c.id }, sport: { groups: [g], activeId: g.id }, screen: defaultScreen(), welcomed: false };
}

let state;
const listeners = new Set();
let saveTimer = null, lastError = null;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? normalize(JSON.parse(raw)) : freshState();
  } catch { state = freshState(); }
  return state;
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
  try { localStorage.setItem(KEY, JSON.stringify(state)); lastError = null; }
  catch (e) { lastError = 'Speichern nicht möglich (Speicher voll oder privates Fenster). Sichere deine Daten über „Daten exportieren“.'; }
}
addEventListener('pagehide', saveNow);
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
// Andere geöffnete Tabs desselben Geräts übernehmen Änderungen
addEventListener('storage', e => {
  if (e.key !== KEY || !e.newValue) return;
  try { state = normalize(JSON.parse(e.newValue)); listeners.forEach(fn => fn(state)); } catch {}
});

export function replaceState(next) { state = normalize(next); saveNow(); listeners.forEach(fn => fn(state)); }

// ---------- Prüfen und Vereinheitlichen ----------
const str = (v, max = 80) => String(v ?? '').trim().slice(0, max);
const int = (v, min, max, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const LAYOUTS = ['omnibus', 'gruppen', 'sitzkreis', 'stehkreis', 'uform', 'arena'];

function normClass(c) {
  const students = (Array.isArray(c?.students) ? c.students : []).filter(s => s && s.id && str(s.name)).slice(0, 80).map(s => ({ id: String(s.id), name: str(s.name, 40) }));
  const ids = new Set(students.map(s => s.id));
  const st = c?.settings || {};
  const plan = c?.plan && Array.isArray(c.plan.groups) ? { groups: c.plan.groups.map(g => (g || []).filter(id => ids.has(id))), createdAt: c.plan.createdAt || '' } : null;
  return { id: String(c?.id || uid()), name: str(c?.name, 60) || 'Klasse', demo: !!c?.demo, students,
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
    matches: (t.matches || []).map(m => ({ id: String(m.id || uid()), round: int(m.round, 1, 99, 1), a: String(m.a), b: String(m.b), scoreA: num(m.scoreA), scoreB: num(m.scoreB) })),
    win: Number(t.win ?? 3), draw: Number(t.draw ?? 1), loss: Number(t.loss ?? 0) }));
  const series = (Array.isArray(g?.series) ? g.series : []).map(s => ({
    id: String(s.id || uid()), title: str(s.title, 80) || 'Rangliste', sport: str(s.sport, 40) || 'Sport',
    participants: (s.participants || []).map(p => ({ id: String(p.id), name: str(p.name, 40), className: str(p.className, 20) })),
    sessions: (s.sessions || []).map(x => ({ id: String(x.id || uid()), date: str(x.date, 10), title: str(x.title, 80), tournamentId: x.tournamentId || null,
      points: Object.fromEntries(Object.entries(x.points || {}).filter(([, v]) => Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)])) })) }));
  return { id: String(g?.id || uid()), name: str(g?.name, 60) || 'Sportgruppe', demo: !!g?.demo, students, teamCount: int(g?.teamCount, 2, 20, 4),
    rules: (Array.isArray(g?.rules) ? g.rules : []).filter(r => Array.isArray(r) && ids.has(r[0]) && ids.has(r[1])).map(r => [r[0], r[1]]),
    teams: (Array.isArray(g?.teams) ? g.teams : []).map(t => ({ id: String(t.id || uid()), name: str(t.name, 40), members: (t.members || []).filter(id => ids.has(id)) })),
    tournaments, series };
}
function normScreen(s) {
  if (!s || !Array.isArray(s.widgets)) return defaultScreen();
  const widgets = s.widgets.filter(w => w && ['timer', 'qr', 'stopwatch', 'interval'].includes(w.type)).slice(0, 30).map(w => ({ ...w, id: String(w.id || uid()),
    x: int(w.x, 0, SCREEN_W_WIDE - 60, 40), y: int(w.y, 0, SCREEN_H - 60, 40), width: int(w.width, 120, SCREEN_W_WIDE, 300), height: int(w.height, 120, SCREEN_H, 260), label: str(w.label, 60) }));
  return { background: ['mint', 'paper', 'night'].includes(s.background) ? s.background : 'mint', zoom: s.zoom || 'auto', format: s.format === 'wide' ? 'wide' : 'std', widgets };
}
export function normalize(raw) {
  const fresh = freshState();
  if (!raw || typeof raw !== 'object') return fresh;
  const classes = (raw.technik?.classes || []).map(normClass);
  const groups = (raw.sport?.groups || []).map(normSport);
  return { schema: SCHEMA,
    technik: { classes, activeId: classes.some(c => c.id === raw.technik?.activeId) ? raw.technik.activeId : classes[0]?.id ?? null },
    sport: { groups, activeId: groups.some(g => g.id === raw.sport?.activeId) ? raw.sport.activeId : groups[0]?.id ?? null },
    screen: normScreen(raw.screen), welcomed: !!raw.welcomed };
}

// ---------- Export / Import ----------
export function exportJson() {
  return JSON.stringify({ app: 'KlassenKompass', schema: SCHEMA, exportedAt: new Date().toISOString(), data: state }, null, 1);
}

// Liest eigene Sicherungen und das Format der früheren ChatGPT-App
export function parseImport(text) {
  const raw = JSON.parse(text);
  if (raw?.app === 'KlassenKompass' && raw.data) return normalize(raw.data);
  const legacyClasses = raw?.classes ?? raw?.technik;
  const legacyGroups = raw?.groups ?? raw?.sport;
  if (Array.isArray(legacyClasses) || Array.isArray(legacyGroups) || raw?.screen) {
    const classes = (Array.isArray(legacyClasses) ? legacyClasses : []).map(r => r?.data ?? r);
    const groups = (Array.isArray(legacyGroups) ? legacyGroups : []).map(r => r?.data ?? r);
    const screen = raw?.screen?.data ?? raw?.screen;
    const result = normalize({ technik: { classes }, sport: { groups }, screen, welcomed: true });
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
  if (replaceScreen) next.screen = incoming.screen;
  next.welcomed = true;
  return next;
}

// Verteilungslogik für Gruppen, Teams, Turniere und Ranglisten
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

export function shuffle(items, rng = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const TABLE_LAYOUTS = ['omnibus', 'gruppen', 'uform'];

export function minimumTables(students, groups) {
  if (!students || !groups) return 0;
  const base = Math.floor(students / groups), extra = students % groups;
  return extra * Math.ceil((base + 1) / 2) + (groups - extra) * Math.ceil(base / 2);
}

// Verteilt Personen in möglichst gleich große Gruppen und hält Trennungsregeln ein.
export function mixGroups({ students, rules, groupCount, layout = 'stehkreis', tables = 999 }, absent = new Set(), rng = Math.random) {
  const present = students.filter(s => !absent.has(s.id));
  const n = present.length, count = groupCount;
  if (!n) return { ok: false, message: 'Heute ist niemand anwesend. Markiere mindestens eine Person als anwesend.' };
  if (count > n) return { ok: false, message: `Für ${n} Anwesende sind höchstens ${n} Gruppen möglich. Verringere die Gruppenanzahl.` };
  const base = Math.floor(n / count), extra = n % count;
  const caps = shuffle(Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0)), rng);
  const needed = caps.reduce((s, c) => s + Math.ceil(c / 2), 0);
  if (TABLE_LAYOUTS.includes(layout) && tables < needed)
    return { ok: false, message: `Für diese Gruppen brauchst du mindestens ${needed} Zweiertische. Erhöhe die Tischanzahl oder ändere die Gruppenanzahl.` };
  const index = new Map(present.map((s, i) => [s.id, i]));
  const edges = present.map(() => new Set());
  for (const [a, b] of rules || []) {
    const x = index.get(a), y = index.get(b);
    if (x !== undefined && y !== undefined && x !== y) { edges[x].add(y); edges[y].add(x); }
  }
  if (!edges.some(e => e.size)) {
    const pool = shuffle(present, rng), groups = [];
    let start = 0;
    for (const c of caps) { groups.push(pool.slice(start, start + c).map(s => s.id)); start += c; }
    return { ok: true, groups };
  }
  const assigned = Array(n).fill(-1), buckets = caps.map(() => []), tie = present.map(() => rng());
  let steps = 0, exhausted = false;
  const deadline = performance.now() + 1400;
  const fits = (p, g) => buckets[g].length < caps[g] && !buckets[g].some(q => edges[p].has(q));
  function visit(remaining) {
    if (!remaining) return true;
    if (++steps > 200000 || (steps % 128 === 0 && performance.now() > deadline)) { exhausted = true; return false; }
    let chosen = -1, bestSat = -1, bestDeg = -1;
    for (let i = 0; i < n; i++) {
      if (assigned[i] !== -1) continue;
      const sat = new Set([...edges[i]].map(x => assigned[x]).filter(x => x !== -1)).size;
      if (sat > bestSat || (sat === bestSat && (edges[i].size > bestDeg || (edges[i].size === bestDeg && (chosen < 0 || tie[i] > tie[chosen]))))) {
        chosen = i; bestSat = sat; bestDeg = edges[i].size;
      }
    }
    const candidates = shuffle(buckets.map((_, i) => i).filter(g => fits(chosen, g)), rng), emptyCaps = new Set();
    for (const g of candidates) {
      if (!buckets[g].length) { if (emptyCaps.has(caps[g])) continue; emptyCaps.add(caps[g]); }
      assigned[chosen] = g; buckets[g].push(chosen);
      let viable = true;
      for (let i = 0; i < n && viable; i++) if (assigned[i] === -1 && !buckets.some((_, h) => fits(i, h))) viable = false;
      if (viable && visit(remaining - 1)) return true;
      assigned[chosen] = -1; buckets[g].pop();
      if (exhausted) return false;
    }
    return false;
  }
  if (!visit(n)) return { ok: false, message: exhausted
    ? 'Die Suche hat noch keine passende Verteilung gefunden. Versuche es erneut, erhöhe die Gruppenanzahl oder prüfe „Einteilung anpassen“.'
    : 'Mit den aktuellen Einstellungen sind gleich große Gruppen nicht möglich. Erhöhe die Gruppenanzahl oder ändere „Einteilung anpassen“.' };
  return { ok: true, groups: buckets.map(g => shuffle(g.map(i => present[i].id), rng)) };
}

export function planIsCurrent(cls, absent) {
  const plan = cls.plan;
  if (!plan || plan.groups.length !== cls.settings.groups) return false;
  const active = cls.students.filter(s => !absent.has(s.id)).map(s => s.id), actual = plan.groups.flat();
  if (actual.length !== active.length || new Set(actual).size !== actual.length || active.some(id => !actual.includes(id))) return false;
  const g = new Map(plan.groups.flatMap((grp, i) => grp.map(id => [id, i])));
  if (cls.rules.some(([a, b]) => g.has(a) && g.get(a) === g.get(b))) return false;
  return !TABLE_LAYOUTS.includes(cls.settings.layout) || plan.groups.reduce((s, grp) => s + Math.ceil(grp.length / 2), 0) <= cls.settings.tables;
}

export function teamsAreCurrent(group, absent) {
  if (!group.teams?.length || group.teams.length !== group.teamCount) return false;
  const active = group.students.filter(s => !absent.has(s.id)).map(s => s.id), actual = group.teams.flatMap(t => t.members);
  return actual.length === active.length && active.every(id => actual.includes(id));
}

// Jeder gegen jeden (Kreismethode)
export function roundRobin(teams) {
  if (teams.length < 2) return [];
  const rot = teams.map(t => t.id);
  if (rot.length % 2) rot.push(null);
  const res = [];
  for (let round = 1; round < rot.length; round++) {
    for (let i = 0; i < rot.length / 2; i++) {
      const a = rot[i], b = rot[rot.length - 1 - i];
      if (a && b) res.push({ id: uid(), round, a, b, scoreA: null, scoreB: null });
    }
    rot.splice(1, 0, rot.pop());
  }
  return res;
}

export const FORMATS = { rr: 'Jeder gegen jeden', ko: 'K.-o. mit Platzierung', kotc: 'King of the Court' };
export const formatOf = t => (t.format === 'ko' || t.format === 'kotc' ? t.format : 'rr');

// Sieger eines Spiels: nach Ergebnis, bei Gleichstand nach Auswahl (nur K.-o. und King of the Court)
export function matchWinner(m) {
  if (m.scoreA === null || m.scoreB === null) return null;
  if (m.scoreA > m.scoreB) return 'A';
  if (m.scoreB > m.scoreA) return 'B';
  return m.winner === 'A' || m.winner === 'B' ? m.winner : null;
}

function reuse(old, round, court, pos, a, b) {
  const m = old.find(x => x.round === round && x.court === court && (x.pos ?? 0) === pos && x.a === a && x.b === b);
  return m || { id: uid(), round, court, pos, a, b, scoreA: null, scoreB: null, winner: null };
}
const teamOrder = t => { const ids = t.teams.map(x => x.id), o = (t.order || []).filter(id => ids.includes(id)); return [...o, ...ids.filter(id => !o.includes(id))]; };
export const kotcCourts = n => Math.max(1, Math.floor(n / 2));
export const koSize = n => { let s = 1; while (s < n) s *= 2; return Math.max(2, s); };
export const defaultCourtPoints = c => Array.from({ length: c }, (_, i) => c - i);

// K.-o. mit Platzierungsspielen. Verlierer scheiden nicht aus, sondern spielen um die hinteren Plätze.
// placement 'all': alle Plätze ausspielen · 'top': nur Finale und Spiel um Platz 3, übrige teilen sich den Platz.
export function koPlan(t) {
  const n = t.teams.length, size = koSize(n), byes = size - n, order = teamOrder(t), slots = [];
  for (let p = 0; p < size / 2; p++) { slots.push(order.shift() ?? null); slots.push(p < size / 2 - byes ? order.shift() ?? null : null); }
  const old = t.matches || [], matches = [], place = new Map(), free = {};
  let groups = [{ lo: 1, members: slots }], round = 1, pending = false;
  while (groups.length && !pending) {
    const next = [];
    free[round] = [];
    for (const g of groups) {
      const real = g.members.filter(Boolean);
      if (!real.length) continue;
      const keep = g.members.length > 1 && (t.placement !== 'top' || g.lo === 1 || (g.lo === 3 && g.members.length === 2));
      if (!keep) { real.forEach(id => place.set(id, g.lo)); continue; }
      const win = [], lose = [];
      for (let i = 0; i < g.members.length / 2; i++) {
        const a = g.members[2 * i], b = g.members[2 * i + 1];
        if (a && b) {
          const m = reuse(old, round, g.lo, i, a, b); matches.push(m);
          const w = matchWinner(m); if (!w) pending = true;
          win.push(w === 'B' ? b : a); lose.push(w === 'B' ? a : b);
        } else { if (a || b) free[round].push(a || b); win.push(a || b); lose.push(null); }
      }
      const half = g.members.length / 2;
      next.push({ lo: g.lo, members: win }, { lo: g.lo + half, members: lose });
    }
    groups = next; round++;
  }
  return { size, matches, place, free, done: !pending && place.size === n };
}
export function koLabel(t, m) {
  const n = t.teams.length, s = koSize(n) / 2 ** (m.round - 1), lo = m.court, hi = Math.min(n, lo + s - 1);
  if (lo === 1) return s === 2 ? 'Finale' : s === 4 ? 'Halbfinale' : s === 8 ? 'Viertelfinale' : s === 16 ? 'Achtelfinale' : 'Hauptrunde';
  return hi - lo <= 1 ? `Spiel um Platz ${lo}` : `Platz ${lo}–${hi}`;
}

// King of the Court: Feld 1 ist das Königsfeld. Sieger steigen ein Feld auf, Verlierer ein Feld ab; alle spielen gleichzeitig.
// Bei ungerader Teamzahl setzt je Runde ein Team aus und steigt im nächsten Durchgang auf dem untersten Feld ein.
export function kotcPlan(t) {
  const n = t.teams.length, c = kotcCourts(n), order = teamOrder(t), rounds = Math.max(1, t.rounds || 1);
  let courts = Array.from({ length: c }, (_, i) => [order[2 * i], order[2 * i + 1]]), bench = n % 2 ? order[n - 1] : null;
  const old = t.matches || [], matches = [], free = {};
  let done = true, r = 1;
  for (; r <= rounds; r++) {
    free[r] = bench ? [bench] : [];
    const ms = courts.map(([a, b], i) => reuse(old, r, i + 1, 0, a, b));
    matches.push(...ms);
    const res = ms.map(m => { const w = matchWinner(m); return w ? (w === 'A' ? [m.a, m.b] : [m.b, m.a]) : null; });
    if (res.some(x => !x)) { done = false; break; }
    const W = res.map(x => x[0]), L = res.map(x => x[1]), nx = [];
    if (c === 1) { nx.push([W[0], bench ?? L[0]]); bench = bench ? L[0] : null; }
    else {
      nx.push([W[0], W[1]]);
      for (let i = 1; i < c - 1; i++) nx.push([L[i - 1], W[i + 1]]);
      nx.push([L[c - 2], bench ?? L[c - 1]]); bench = bench ? L[c - 1] : null;
    }
    courts = nx;
  }
  // Endstand: Position in der nächsten Aufstellung (Feld 1 zuerst, aussetzendes Team zuletzt)
  const position = new Map(); courts.forEach(([a, b], i) => { position.set(a, i + 1); position.set(b, i + 1); }); if (bench) position.set(bench, c + 1);
  return { courts: c, matches, free, done, position };
}

// Spielplan von K.-o. und King of the Court nach jeder Eingabe fortschreiben; geänderte Paarungen ersetzen spätere Spiele.
export function syncTournament(t) {
  const f = formatOf(t);
  if (f === 'ko') t.matches = koPlan(t).matches;
  else if (f === 'kotc') t.matches = kotcPlan(t).matches;
  return t;
}
export function tournamentDone(t) {
  const f = formatOf(t);
  if (f === 'ko') return koPlan(t).done;
  if (f === 'kotc') return kotcPlan(t).done;
  return t.matches.length > 0 && t.matches.every(m => m.scoreA !== null && m.scoreB !== null);
}
export function createTournament(base, format, opts = {}, rng = Math.random) {
  const t = { ...base, format, matches: [] };
  if (format === 'rr') { t.matches = roundRobin(t.teams); return t; }
  t.order = shuffle(t.teams.map(x => x.id), rng);
  if (format === 'ko') t.placement = opts.placement === 'top' ? 'top' : 'all';
  else { t.rounds = opts.rounds || 6; t.courtPoints = opts.courtPoints || defaultCourtPoints(kotcCourts(t.teams.length)); }
  return syncTournament(t);
}

function baseRows(t) {
  const rows = t.teams.map(team => ({ id: team.id, name: team.name, played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0, difference: 0, points: 0, rank: 0, place: null, court: null }));
  const by = new Map(rows.map(r => [r.id, r]));
  return { rows, by };
}
function countMatch(a, b, m) { a.played++; b.played++; a.scored += m.scoreA; a.conceded += m.scoreB; b.scored += m.scoreB; b.conceded += m.scoreA; }

export function tournamentTable(t) {
  const f = formatOf(t);
  if (f === 'ko') return koTable(t);
  if (f === 'kotc') return kotcTable(t);
  const { rows, by } = baseRows(t);
  for (const m of t.matches) {
    if (m.scoreA === null || m.scoreB === null) continue;
    const a = by.get(m.a), b = by.get(m.b);
    if (!a || !b) continue;
    countMatch(a, b, m);
    if (m.scoreA === m.scoreB) { a.draws++; b.draws++; a.points += t.draw; b.points += t.draw; }
    else { const w = m.scoreA > m.scoreB ? a : b, l = w === a ? b : a; w.wins++; l.losses++; w.points += t.win; l.points += t.loss; }
  }
  rows.forEach(r => { r.difference = r.scored - r.conceded; });
  rows.sort((a, b) => b.points - a.points || b.difference - a.difference || b.scored - a.scored || a.name.localeCompare(b.name, 'de'));
  rows.forEach((r, i) => { const p = rows[i - 1]; r.rank = p && p.points === r.points && p.difference === r.difference && p.scored === r.scored ? p.rank : i + 1; });
  return rows;
}
function tallyDecided(t, by, onWin) {
  for (const m of t.matches) {
    const w = matchWinner(m), a = by.get(m.a), b = by.get(m.b);
    if (!w || !a || !b) continue;
    countMatch(a, b, m);
    const win = w === 'A' ? a : b, lose = win === a ? b : a; win.wins++; lose.losses++;
    onWin?.(win, m);
  }
}
function koTable(t) {
  const { rows, by } = baseRows(t), plan = koPlan(t), n = t.teams.length;
  tallyDecided(t, by);
  rows.forEach(r => { r.difference = r.scored - r.conceded; r.place = plan.place.get(r.id) ?? null; });
  rows.forEach(r => { if (r.place !== null) r.rank = 1 + rows.filter(x => x.place !== null && x.place < r.place).length; });
  rows.forEach(r => { r.points = r.rank ? n - r.rank + 1 : 0; });
  rows.sort((a, b) => (a.rank || 999) - (b.rank || 999) || b.wins - a.wins || b.difference - a.difference || a.name.localeCompare(b.name, 'de'));
  return rows;
}
function kotcTable(t) {
  const { rows, by } = baseRows(t), plan = kotcPlan(t), pts = t.courtPoints || [];
  tallyDecided(t, by, (win, m) => { win.points += Number(pts[m.court - 1]) || 0; });
  rows.forEach(r => { r.difference = r.scored - r.conceded; r.court = plan.position.get(r.id) ?? null; });
  rows.sort((a, b) => b.points - a.points || (a.court ?? 99) - (b.court ?? 99) || b.wins - a.wins || b.difference - a.difference || a.name.localeCompare(b.name, 'de'));
  rows.forEach((r, i) => { const p = rows[i - 1]; r.rank = p && p.points === r.points && p.court === r.court ? p.rank : i + 1; });
  return rows;
}

// Punkte für die Einzelrangliste: Jeder gegen jeden und King of the Court nach Turnierpunkten, K.-o. nach Platz (Platz 1 = Teamzahl).
export function tournamentPoints(t) {
  const pts = {}, f = formatOf(t);
  for (const row of tournamentTable(t)) {
    if (f === 'ko' ? !row.rank : !row.played) continue;
    for (const id of t.teams.find(x => x.id === row.id).members) pts[id] = row.points;
  }
  return pts;
}

export function individualTable(series) {
  const rows = series.participants.map(p => {
    const entries = series.sessions.filter(s => Object.prototype.hasOwnProperty.call(s.points, p.id));
    return { ...p, points: entries.reduce((sum, s) => sum + s.points[p.id], 0), sessions: entries.length, rank: 0 };
  }).filter(r => r.sessions > 0).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'de'));
  rows.forEach((r, i) => { r.rank = i > 0 && r.points === rows[i - 1].points ? rows[i - 1].rank : i + 1; });
  return rows;
}

export function reconcileSeries(group) {
  for (const series of group.series) for (const s of series.sessions) {
    if (!s.tournamentId) continue;
    const t = group.tournaments.find(x => x.id === s.tournamentId);
    if (t) Object.assign(s, { title: t.title, date: t.date, points: tournamentPoints(t) });
  }
}

export function linkTournament(group, tournamentId, seriesId) {
  const t = group.tournaments.find(x => x.id === tournamentId), series = group.series.find(s => s.id === seriesId);
  if (!t || !series || t.sport.toLocaleLowerCase('de') !== series.sport.toLocaleLowerCase('de')) throw new Error('Wähle eine Rangliste derselben Sportart.');
  if (!tournamentDone(t)) throw new Error('Trage zuerst alle Turnierergebnisse ein.');
  const known = new Set(series.participants.map(p => p.id));
  series.participants.push(...t.participants.filter(p => !known.has(p.id)));
  const existing = series.sessions.find(s => s.tournamentId === tournamentId);
  const session = { id: existing?.id ?? uid(), date: t.date, title: t.title, points: tournamentPoints(t), tournamentId };
  if (existing) Object.assign(existing, session); else series.sessions.push(session);
}

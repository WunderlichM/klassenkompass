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
    ? 'Die Suche hat noch keine passende Verteilung gefunden. Versuche es erneut, erhöhe die Gruppenanzahl oder prüfe die Trennungsregeln.'
    : 'Mit diesen Trennungsregeln sind gleichmäßig große Gruppen nicht möglich. Erhöhe die Gruppenanzahl oder ändere eine Regel.' };
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

export function tournamentTable(t) {
  const rows = t.teams.map(team => ({ id: team.id, name: team.name, played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0, difference: 0, points: 0, rank: 0 }));
  const by = new Map(rows.map(r => [r.id, r]));
  for (const m of t.matches) {
    if (m.scoreA === null || m.scoreB === null) continue;
    const a = by.get(m.a), b = by.get(m.b);
    if (!a || !b) continue;
    a.played++; b.played++; a.scored += m.scoreA; a.conceded += m.scoreB; b.scored += m.scoreB; b.conceded += m.scoreA;
    if (m.scoreA === m.scoreB) { a.draws++; b.draws++; a.points += t.draw; b.points += t.draw; }
    else { const w = m.scoreA > m.scoreB ? a : b, l = w === a ? b : a; w.wins++; l.losses++; w.points += t.win; l.points += t.loss; }
  }
  rows.forEach(r => { r.difference = r.scored - r.conceded; });
  rows.sort((a, b) => b.points - a.points || b.difference - a.difference || b.scored - a.scored || a.name.localeCompare(b.name, 'de'));
  rows.forEach((r, i) => { const p = rows[i - 1]; r.rank = p && p.points === r.points && p.difference === r.difference && p.scored === r.scored ? p.rank : i + 1; });
  return rows;
}

export function tournamentPoints(t) {
  const pts = {};
  for (const row of tournamentTable(t)) {
    if (!row.played) continue;
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
  if (!t.matches.length || t.matches.some(m => m.scoreA === null || m.scoreB === null)) throw new Error('Trage zuerst alle Turnierergebnisse ein.');
  const known = new Set(series.participants.map(p => p.id));
  series.participants.push(...t.participants.filter(p => !known.has(p.id)));
  const existing = series.sessions.find(s => s.tournamentId === tournamentId);
  const session = { id: existing?.id ?? uid(), date: t.date, title: t.title, points: tournamentPoints(t), tournamentId };
  if (existing) Object.assign(existing, session); else series.sessions.push(session);
}

// Lerngruppen (seit 2.0.0): eine gemeinsame Liste für Gruppen (Sitzordnung und Teams), Turniere und Quiz.
// Gespeichert wird weiter wie bisher: der Sitzordnungsteil in technik.classes, der Sportteil (Teams, Turniere,
// Ranglisten) in sport.groups – beide Teile einer Lerngruppe tragen dieselbe Kennung und dieselben Kinder.
// So bleiben ältere App-Fassungen lesbar. Ein fehlender Teil entsteht erst, wenn er zum ersten Mal geändert wird.
import * as store from './store.js';
import { uid, mixGroups, rebalance, rulesKept, TABLE_LAYOUTS } from './engine.js';
import { esc, icon, dialog, confirmDialog, toast } from './ui.js';

export const SUBJECTS = store.SUBJECTS;
const absentById = new Map(); // „Heute nicht da“: gilt bis zum nächsten Öffnen, gemeinsam für alle Bereiche
export const viewOf = new Map(); // Ansicht in Gruppen je Lerngruppe: 'sitz' oder 'teams' (gilt bis zur nächsten Auswahl der Lerngruppe)
// Sport-Lerngruppe: nach dem Fach, unter dem sie in der Auswahl steht (Groß-/Kleinschreibung egal). Nicht nach dem Sportteil:
// Den haben auch Technik-Gruppen, und ältere Sportteile ohne Fach bekommen beim Laden „Sport“.
export const isSport = g => String(g?.subject || '').trim().toLocaleLowerCase('de') === 'sport';

// ---------- Lesen ----------
const seatOf = (s, id) => s.technik.classes.find(c => c.id === id) || null;
const sportOf = (s, id) => s.sport.groups.find(g => g.id === id) || null;
function people(seat, sport) {
  // Reihenfolge des zuerst vorhandenen Teils; die Klasse (Sport) wird übernommen
  const byId = new Map((sport?.students || []).map(p => [p.id, p]));
  const base = seat ? seat.students : sport.students, seen = new Set();
  const list = base.map(p => { seen.add(p.id); return { id: p.id, name: p.name, className: byId.get(p.id)?.className || '' }; });
  if (seat && sport) sport.students.forEach(p => { if (!seen.has(p.id)) list.push({ id: p.id, name: p.name, className: p.className || '' }); });
  return list;
}
function build(s, id) {
  const seat = seatOf(s, id), sport = sportOf(s, id); if (!seat && !sport) return null;
  const main = seat || sport;
  return { id, name: main.name, subject: main.subject || (seat ? 'Technik' : 'Sport'), demo: !!main.demo, students: people(seat, sport), seat, sport };
}
export function list(s = store.get()) {
  const ids = [...s.technik.classes.map(c => c.id), ...s.sport.groups.map(g => g.id)];
  return [...new Set(ids)].map(id => build(s, id));
}
export const byId = (id, s = store.get()) => build(s, id);
export function active(s = store.get()) {
  return build(s, s.active) || build(s, s.technik.activeId) || build(s, s.sport.activeId) || list(s)[0] || null;
}
export function absent(id) { if (!absentById.has(id)) absentById.set(id, new Set()); return absentById.get(id); }
export const presentCount = g => g.students.filter(p => !absent(g.id).has(p.id)).length;

// Standardwerte, solange ein Teil noch nicht gespeichert ist (nur lesen, nichts anlegen)
export const seatView = g => g.seat || { id: g.id, name: g.name, students: g.students.map(p => ({ id: p.id, name: p.name })), settings: { layout: 'omnibus', tables: Math.max(8, Math.ceil(g.students.length / 2)), groups: 4 }, rules: [], plan: null };
export const sportView = g => g.sport || { id: g.id, name: g.name, students: g.students.map(p => ({ ...p })), teamCount: 4, rules: [], teams: [], tournaments: [], series: [] };

// ---------- Einteilung immer aktuell halten (seit 2.1.0) ----------
// Gibt es noch keine Einteilung oder passt die Anzahl nicht, wird gemischt. Fehlt ein Kind (abwesend, entfernt) oder kommt
// eines dazu, bleiben die übrigen in ihrer Gruppe: Das Kind wird herausgenommen bzw. eingesetzt, und die Größen werden
// durch einzelne Wechsel ausgeglichen. Ergebnis: { changed: 'mix' | 'balance', moved } oder { error } oder {}.
const failed = new Map(); // Schlüssel → Meldung: dieselbe aussichtslose Lage nicht bei jedem Neuzeichnen erneut durchsuchen
const sameMembers = (groups, ids) => { const flat = groups.flat(); return flat.length === ids.length && new Set(flat).size === flat.length && ids.every(id => flat.includes(id)); };
const tablesFor = groups => groups.reduce((n, g) => n + Math.ceil(g.length / 2), 0);
function ensure(key, run) {
  if (failed.has(key)) return { error: failed.get(key) };
  const r = run();
  if (r.error) failed.set(key, r.error);
  return r;
}
export function ensureTeams(g) {
  const k = sportView(g), off = absent(g.id), ids = k.students.filter(p => !off.has(p.id)).map(p => p.id);
  const cur = k.teams.map(t => t.members);
  if (k.teams.length === k.teamCount && sameMembers(cur, ids) && rulesKept(cur, k.rules)) return {};
  return ensure(['t', g.id, k.teamCount, ids.join(), JSON.stringify(k.rules), cur.length].join('|'), () => {
    if (!ids.length) return { error: 'Heute ist niemand anwesend.' };
    if (k.teams.length === k.teamCount && rulesKept(cur, k.rules)) {
      const r = rebalance(cur, ids, k.rules);
      if (r) { store.update(s => { const p = sportPart(s, g.id); p.teams = p.teams.map((t, i) => ({ ...t, members: r.groups[i] })); }); return { changed: 'balance', moved: r.moved }; }
    }
    const res = mixGroups({ students: k.students, rules: k.rules, groupCount: k.teamCount }, off);
    if (!res.ok) return { error: res.message };
    store.update(s => { sportPart(s, g.id).teams = res.groups.map((members, i) => ({ id: uid(), name: 'Team ' + (i + 1), members })); });
    return { changed: 'mix' };
  });
}
export function ensureSeat(g) {
  const c = seatView(g), off = absent(g.id), ids = c.students.filter(p => !off.has(p.id)).map(p => p.id), st = c.settings;
  const cur = c.plan?.groups || [], tables = TABLE_LAYOUTS.includes(st.layout);
  const ok = c.plan && cur.length === st.groups && sameMembers(cur, ids) && rulesKept(cur, c.rules);
  // Reichen die Tische nicht, wird die Tischzahl auf das Nötige erhöht
  const fit = (s, groups) => { const p = seatPart(s, g.id); if (tables) p.settings.tables = Math.min(40, Math.max(p.settings.tables, tablesFor(groups))); };
  if (ok) {
    if (tables && tablesFor(cur) > st.tables) { store.update(s => fit(s, cur)); return { changed: 'tables' }; }
    return {};
  }
  return ensure(['s', g.id, st.groups, ids.join(), JSON.stringify(c.rules), cur.length].join('|'), () => {
    if (!ids.length) return { error: 'Heute ist niemand anwesend.' };
    if (c.plan && cur.length === st.groups && rulesKept(cur, c.rules)) {
      const r = rebalance(cur, ids, c.rules);
      if (r) { store.update(s => { seatPart(s, g.id).plan.groups = r.groups; fit(s, r.groups); }); return { changed: 'balance', moved: r.moved }; }
    }
    const res = mixGroups({ students: c.students, rules: c.rules, groupCount: st.groups }, off);
    if (!res.ok) return { error: res.message };
    store.update(s => { seatPart(s, g.id).plan = { groups: res.groups, createdAt: new Date().toISOString() }; fit(s, res.groups); });
    return { changed: 'mix' };
  });
}

// ---------- Ändern ----------
// Teil für Änderungen holen (fehlenden Teil mit denselben Kindern anlegen); nur innerhalb von store.update aufrufen
export function seatPart(s, id) {
  let c = seatOf(s, id); if (c) return c;
  const g = build(s, id); if (!g) return null;
  c = { ...seatView(g), subject: g.subject, demo: g.demo }; s.technik.classes.push(c); return c;
}
export function sportPart(s, id) {
  let k = sportOf(s, id); if (k) return k;
  const g = build(s, id); if (!g) return null;
  k = { ...sportView(g), subject: g.subject, demo: g.demo }; s.sport.groups.push(k); return k;
}
const parts = (s, id) => [seatOf(s, id), sportOf(s, id)].filter(Boolean);
export function setActive(id) {
  viewOf.delete(id);   // beim Auswählen wieder die Standardansicht (Sport: Teams, sonst Sitzordnung), nicht die zuletzt gewählte
  store.update(s => {
    s.active = id;
    if (seatOf(s, id)) s.technik.activeId = id;
    if (sportOf(s, id)) s.sport.activeId = id;
    // Quiz: verknüpfte Quiz-Klasse (gleiche Kennung oder gleicher Name) mitwählen
    const g = build(s, id), q = g && s.quiz.classes.find(c => c.id === id || c.name === g.name);
    if (q) s.quiz.activeClassId = q.id;
  });
}
// Quiz-Klasse, die zu einer Lerngruppe gehört (gleiche Kennung oder gleicher Name)
export const quizClassOf = (g, s = store.get()) => (g ? s.quiz.classes.find(c => c.id === g.id) || s.quiz.classes.find(c => c.name === g.name) || null : null);
export const groupOfQuiz = (c, s = store.get()) => (c ? build(s, c.id) || list(s).find(g => g.name === c.name) || null : null);

function addPeople(id, ppl) {
  store.update(s => parts(s, id).forEach(k => k.students.push(...ppl.map(p => (k === sportOf(s, id) ? { ...p } : { id: p.id, name: p.name })))));
}
function removePerson(id, pid) {
  store.update(s => {
    const c = seatOf(s, id), k = sportOf(s, id);
    if (c) { c.students = c.students.filter(x => x.id !== pid); c.rules = c.rules.filter(r => !r.includes(pid)); if (c.plan) c.plan.groups = c.plan.groups.map(gr => gr.filter(x => x !== pid)); }
    if (k) { k.students = k.students.filter(x => x.id !== pid); k.rules = k.rules.filter(r => !r.includes(pid)); k.teams = k.teams.map(t => ({ ...t, members: t.members.filter(x => x !== pid) })); }
  });
}
function editPerson(id, pid, name, className) {
  store.update(s => {
    if (className) sportPart(s, id);
    const c = seatOf(s, id)?.students.find(x => x.id === pid); if (c) c.name = name;
    const k = sportOf(s, id)?.students.find(x => x.id === pid); if (k) { k.name = name; k.className = className; }
  });
}

// Zeilen „Vorname, Klasse“, „Vorname (Klasse)“ oder nur „Vorname“
export function parsePeople(text) {
  return String(text).split(/\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(.+?)\s*[,;(\t]\s*([^)]*)\)?$/);
    return { id: uid(), name: (m ? m[1] : l).trim().slice(0, 40), className: (m ? m[2] : '').trim().slice(0, 20) };
  }).filter(p => p.name);
}
const MAX = 80;

// Lerngruppen aus dem gemeinsamen Import (js/importformat.js): Gibt es eine Lerngruppe mit gleichem Namen, kommen nur
// fehlende Kinder dazu (nichts wird gelöscht); sonst entsteht eine neue. quiz: Quiz-Klasse mit gleicher Kennung und Kinderzahl.
export function importGroups(incoming, { quiz = false } = {}) {
  const res = { created: 0, updated: 0, added: 0, firstId: null };
  for (const g of incoming) {
    const old = list().find(x => x.name.toLowerCase() === g.name.toLowerCase());
    let id = old?.id;
    if (old) {
      const key = p => (p.name + '|' + (p.className || '')).toLowerCase(), have = new Set(old.students.map(key));
      const fresh = g.students.filter(p => !have.has(key(p)) && !(!p.className && old.students.some(o => o.name.toLowerCase() === p.name.toLowerCase())))
        .slice(0, Math.max(0, MAX - old.students.length)).map(p => ({ id: uid(), ...p }));
      if (fresh.length) { if (fresh.some(p => p.className)) store.update(s => { sportPart(s, id); }); addPeople(id, fresh); res.added += fresh.length; }
      res.updated++;
    } else {
      id = uid();
      const ppl = g.students.slice(0, MAX).map(p => ({ id: uid(), ...p })), subject = g.subject || 'Technik', name = g.name;
      const sport = () => ({ id, name, subject, students: ppl.map(p => ({ ...p })), teamCount: 4, rules: [], teams: [], tournaments: [], series: [] });
      store.update(s => {
        if (subject === 'Sport') s.sport.groups.push(sport());
        else s.technik.classes.push({ id, name, subject, students: ppl.map(p => ({ id: p.id, name: p.name })), settings: { layout: 'omnibus', tables: Math.max(8, Math.ceil(ppl.length / 2)), groups: 4 }, rules: [], plan: null });
        if (subject !== 'Sport' && ppl.some(p => p.className)) s.sport.groups.push(sport());
      });
      res.created++;
    }
    res.firstId ??= id;
    if (quiz || g.quiz) store.update(s => {
      const n = Math.min(40, build(s, id).students.length), c = s.quiz.classes.find(x => x.id === id) || s.quiz.classes.find(x => x.name.toLowerCase() === g.name.toLowerCase());
      if (c) { if (c.count < n) { c.count = n; c.students = store.quizStudents(c.id, n, c.students); } }
      else s.quiz.classes.push({ id, name: g.name, demo: false, count: n, resetAt: 0, students: store.quizStudents(id, n) });
    });
  }
  if (res.firstId) setActive(res.firstId);
  return res;
}

// ---------- Oberfläche ----------
// Auswahl der Lerngruppe im Kopf der Bereiche Gruppen und Turniere, nach Fach gegliedert
export function pickerHtml(g, label = 'Deine Lerngruppe') {
  const all = list(), subjects = [...new Set([...SUBJECTS, ...all.map(x => x.subject)])].filter(su => all.some(x => x.subject === su));
  const opt = x => `<option value="${esc(x.id)}" ${x.id === g?.id ? 'selected' : ''}>${esc(x.name)}</option>`;
  return `<div class="picker">
    <label class="eyebrow" for="lg-select">${esc(label)}</label>
    <div class="picker-row">
      <select id="lg-select" class="select" data-lg="select">${subjects.map(su => `<optgroup label="${esc(su)}">${all.filter(x => x.subject === su).map(opt).join('')}</optgroup>`).join('')}${all.length ? '' : '<option>Noch keine Lerngruppe</option>'}</select>
      <button class="icon-btn" data-lg="manage" title="Lerngruppen verwalten" aria-label="Lerngruppen verwalten">${icon('sliders')}</button>
    </div>
  </div>`;
}
export const emptyHtml = () => `<div class="card empty"><p>Lege deine erste Lerngruppe an – eine Klasse oder Sportgruppe. Gespeichert werden nur Vornamen (bei Bedarf mit Klasse).</p><button class="btn primary" data-lg="new">${icon('plus')} Neue Lerngruppe</button></div>`;

// Kinderliste mit „Heute nicht da“ (Seitenleiste in Gruppen)
export function peopleCardHtml(g, search = '') {
  const n = presentCount(g);
  return `<div class="card">
    <div class="card-head small"><h3>${icon('users', 16)} Kinder <span class="badge">${n}/${g.students.length}</span></h3>
      <button class="icon-btn sm" data-lg="add" title="Kinder hinzufügen" aria-label="Kinder hinzufügen">${icon('plus', 16)}</button></div>
    <input id="lg-search" class="input" type="search" placeholder="Vorname oder Klasse …" value="${esc(search)}" autocomplete="off">
    <ul class="student-list" id="lg-people">${peopleItems(g, search)}</ul>
    <p class="muted small-text">„Heute nicht da“ gilt bis zum nächsten Öffnen – in Sitzordnung, Teams und Turnieren.</p>
  </div>`;
}
export function peopleItems(g, search = '', colorOf = () => '') {
  const off = absent(g.id), q = search.trim().toLocaleLowerCase('de');
  return g.students.filter(p => !q || (p.name + ' ' + p.className).toLocaleLowerCase('de').includes(q)).map(p => {
    const a = off.has(p.id), st = colorOf(p.id);
    return `<li class="${a ? 'off' : ''}"><span class="avatar" style="${st}">${esc(p.name.trim().charAt(0).toLocaleUpperCase('de'))}</span>
      <button class="link name" data-lg="edit" data-id="${esc(p.id)}" title="Bearbeiten">${esc(p.name)}</button>${p.className ? `<small class="cls">${esc(p.className)}</small>` : ''}
      <button class="icon-btn xs ${a ? 'active' : ''}" data-lg="absent" data-id="${esc(p.id)}" title="${a ? 'Wieder da' : 'Heute nicht da'}" aria-pressed="${a}">${icon(a ? 'sick' : 'user', 15)}</button>
      <button class="icon-btn xs" data-lg="remove" data-id="${esc(p.id)}" title="Aus der Lerngruppe entfernen" aria-label="Entfernen">${icon('x', 14)}</button></li>`;
  }).join('') || '<li class="muted small-text">Keine Treffer.</li>';
}

// Gemeinsame Bedienung: liefert true, wenn die Aktion hier erledigt wurde. redraw() zeichnet die Seite neu (Anwesenheit).
export async function handle(el, redraw) {
  const act = el.dataset.lg, g = active();
  if (act === 'new') { newDialog(); return true; }
  if (act === 'manage') { manageDialog(); return true; }
  if (!g) return !!act;
  switch (act) {
    case 'add': addDialog(g); return true;
    case 'edit': personDialog(g, el.dataset.id); return true;
    case 'absent': { const a = absent(g.id), id = el.dataset.id; a.has(id) ? a.delete(id) : a.add(id); redraw(); return true; }
    case 'remove': {
      const p = g.students.find(x => x.id === el.dataset.id);
      if (p && await confirmDialog('Kind entfernen', `${p.name} aus „${g.name}“ entfernen? Trennungsregeln mit diesem Kind werden gelöscht; Turniere und Ranglisten behalten den Namen.`, 'Entfernen')) removePerson(g.id, p.id);
      return true;
    }
  }
  return false;
}

const subjectField = (cur = 'Technik') => `<label class="field">Fach<input name="subject" class="input" list="lg-subjects" maxlength="30" value="${esc(cur)}" required><datalist id="lg-subjects">${SUBJECTS.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>`;
export function newDialog() {
  dialog({ title: 'Neue Lerngruppe', submit: 'Anlegen',
    body: `<div class="two"><label class="field">Name<input name="name" class="input" maxlength="60" placeholder="z. B. 7ab · Technik" required></label>${subjectField(active()?.subject || 'Technik')}</div>
      <label class="field">Kinder <small class="muted">– eine Person pro Zeile, optional mit Klasse: „Anna, 6a“</small><textarea name="names" class="input" rows="9" placeholder="Anna&#10;Ben, 6b&#10;…"></textarea></label>
      <p class="muted small-text">Bitte nur Vornamen eintragen. Sitzordnung, Teams, Turniere und Quiz nutzen dieselbe Liste.</p>`,
    onSubmit: fd => {
      const name = String(fd.get('name')).trim(), subject = String(fd.get('subject')).trim() || 'Technik';
      if (!name) throw new Error('Bitte einen Namen eingeben.');
      const ppl = parsePeople(fd.get('names')).slice(0, MAX), id = uid();
      store.update(s => {
        if (subject === 'Sport') s.sport.groups.push({ id, name, subject, students: ppl, teamCount: 4, rules: [], teams: [], tournaments: [], series: [] });
        else s.technik.classes.push({ id, name, subject, students: ppl.map(p => ({ id: p.id, name: p.name })), settings: { layout: 'omnibus', tables: Math.max(8, Math.ceil(ppl.length / 2)), groups: 4 }, rules: [], plan: null });
        if (subject !== 'Sport' && ppl.some(p => p.className)) s.sport.groups.push({ id, name, subject, students: ppl, teamCount: 4, rules: [], teams: [], tournaments: [], series: [] });
      });
      setActive(id);
    } });
}
export function manageDialog() {
  const all = list();
  dialog({ title: 'Lerngruppen verwalten', submit: null, cancel: 'Fertig', wide: true,
    body: `<ul class="manage-list lg-manage">${all.map(g => `<li><input class="input" data-rename="${esc(g.id)}" value="${esc(g.name)}" maxlength="60" aria-label="Name">
        <input class="input sm lg-subj" data-subject="${esc(g.id)}" value="${esc(g.subject)}" list="lg-subjects" maxlength="30" aria-label="Fach">
        <span class="muted small-text">${g.students.length} Kinder</span>
        <button type="button" class="icon-btn" data-copy="${esc(g.id)}" title="Kopie anlegen (ohne Turniere und Ranglisten)">${icon('plus')}</button>
        <button type="button" class="icon-btn" data-delete="${esc(g.id)}" title="Lerngruppe löschen">${icon('trash')}</button></li>`).join('') || '<li class="muted">Noch keine Lerngruppe.</li>'}</ul>
      <datalist id="lg-subjects">${SUBJECTS.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      <button type="button" class="btn primary" data-new>${icon('plus')} Neue Lerngruppe</button>
      <p class="muted small-text">Eine Lerngruppe gilt für Sitzordnung, Teams, Turniere und Ranglisten. Quiz-Klassen kennen keine Namen, nur die Kinderzahl; sie werden im Quiz verwaltet.</p>`,
    onOpen: (el, close) => {
      el.querySelector('[data-new]').onclick = () => { close(); newDialog(); };
      el.querySelectorAll('[data-rename]').forEach(inp => inp.onchange = () => { const v = inp.value.trim(); if (v) store.update(s => parts(s, inp.dataset.rename).forEach(k => { k.name = v; })); });
      el.querySelectorAll('[data-subject]').forEach(inp => inp.onchange = () => { const v = inp.value.trim(); if (v) store.update(s => parts(s, inp.dataset.subject).forEach(k => { k.subject = v; })); });
      el.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => {
        const g = byId(b.dataset.copy), id = uid(); close();
        store.update(s => {
          const c = seatOf(s, g.id), k = sportOf(s, g.id);
          if (c) s.technik.classes.push({ ...structuredClone(c), id, name: (g.name + ' (Kopie)').slice(0, 60), plan: null, demo: false });
          if (k) s.sport.groups.push({ ...structuredClone(k), id, name: (g.name + ' (Kopie)').slice(0, 60), teams: [], tournaments: [], series: [], demo: false });
        });
        setActive(id); toast('Kopie angelegt (ohne Turniere und Ranglisten).');
      });
      el.querySelectorAll('[data-delete]').forEach(b => b.onclick = async () => {
        const g = byId(b.dataset.delete); close();
        if (!(await confirmDialog('Lerngruppe löschen', `„${g.name}“ mit allen Kindern, Sitzplan, Teams, Turnieren und Ranglisten löschen?`))) return manageDialog();
        const backup = { c: structuredClone(g.seat), k: structuredClone(g.sport) };
        store.update(s => {
          s.technik.classes = s.technik.classes.filter(x => x.id !== g.id); s.sport.groups = s.sport.groups.filter(x => x.id !== g.id);
          if (s.active === g.id) s.active = s.technik.classes[0]?.id ?? s.sport.groups[0]?.id ?? null;
          if (s.technik.activeId === g.id) s.technik.activeId = s.technik.classes[0]?.id ?? null;
          if (s.sport.activeId === g.id) s.sport.activeId = s.sport.groups[0]?.id ?? null;
        });
        toast(`„${g.name}“ gelöscht.`, { action: 'Rückgängig', onAction: () => { store.update(s => { if (backup.c) s.technik.classes.push(backup.c); if (backup.k) s.sport.groups.push(backup.k); }); setActive(g.id); } });
      });
    } });
}
function addDialog(g) {
  dialog({ title: `Kinder zu „${g.name}“ hinzufügen`, submit: 'Hinzufügen',
    body: `<label class="field">Eine Person pro Zeile, optional mit Klasse: „Anna, 6a“<textarea name="names" class="input" rows="6"></textarea></label>`,
    onSubmit: fd => {
      const ppl = parsePeople(fd.get('names'));
      if (!ppl.length) throw new Error('Bitte mindestens einen Vornamen eintragen.');
      if (g.students.length + ppl.length > MAX) throw new Error(`Eine Lerngruppe kann höchstens ${MAX} Kinder haben.`);
      addPeople(g.id, ppl);
      toast(`${ppl.length} hinzugefügt und eingeteilt.`);
    } });
}
function personDialog(g, pid) {
  const p = g.students.find(x => x.id === pid); if (!p) return;
  dialog({ title: 'Kind bearbeiten', body: `<div class="two"><label class="field">Vorname<input name="name" class="input" value="${esc(p.name)}" maxlength="40"></label><label class="field">Klasse <small class="muted">(optional)</small><input name="cls" class="input" value="${esc(p.className)}" maxlength="20"></label></div>`,
    onSubmit: fd => { const n = String(fd.get('name')).trim(); if (!n) throw new Error('Der Name darf nicht leer sein.'); editPerson(g.id, pid, n, String(fd.get('cls')).trim()); } });
}

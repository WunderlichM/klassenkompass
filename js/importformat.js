// Austauschformat für Inhalte (ohne Browser-Abhängigkeit, auch von tools/import-check.mjs genutzt):
// Fragensätze, Hallenpläne und Lerngruppen – einzeln oder gemeinsam in einer Datei („bundle“).
// Beschreibung mit Beispielen: docs/IMPORT.md. Die Sicherung der ganzen App liest weiterhin store.parseImport.
import { uid } from './engine.js';
import { parsePlans } from './hallplan.js';

const LETTERS = 'ABCD';
const txt = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// Nachsichtiges JSON: BOM, Markdown-Codeblock (```json … ```), Text vor/nach dem JSON und Kommas vor } oder ] stören nicht.
export function looseJson(text) {
  const src = String(text).replace(/^﻿/, '').trim();
  const tries = [src];
  const fence = src.match(/```[a-zA-Z]*\s*\n([\s\S]*?)```/); if (fence) tries.push(fence[1].trim());
  const a = src.search(/[{[]/), b = Math.max(src.lastIndexOf('}'), src.lastIndexOf(']'));
  if (a >= 0 && b > a) tries.push(src.slice(a, b + 1));
  let first = null;
  for (const t of tries) for (const v of [t, t.replace(/,(\s*[}\]])/g, '$1')]) {
    try { return JSON.parse(v); } catch (e) { first ??= e; }
  }
  throw first;
}

// ---------- Fragensätze ----------
// Erlaubt: { sets: [...] }, eine Liste von Sätzen oder ein einzelner Satz.
// Frage: text (auch q, question), options (auch answers), correct = Buchstabe A–D, Zahl ab 0, der Antworttext,
// true/false (bei Richtig/Falsch) oder null (Umfrage). Ohne options und mit correct true/false entsteht Richtig/Falsch.
// Satz: title, optional "class" (Name der Quiz-Klasse) oder "allClasses": true.
export function normSets(list) {
  if (!Array.isArray(list) || !list.length) throw new Error('Es wurde kein Fragensatz gefunden.');
  return list.slice(0, 50).map((t, k) => {
    const title = txt(t?.title ?? t?.name, 80) || 'Importierter Fragensatz', where = i => `Fragensatz ${k + 1} („${title}“), Frage ${i + 1}`;
    // Antworten und richtige Antwort einer Fassung lesen (Frage selbst oder ihre G-Fassung)
    const answers = (x, at) => {
      let c = x?.correct ?? x?.answer;
      let options = (Array.isArray(x?.options) ? x.options : Array.isArray(x?.answers) ? x.answers : []).map(o => txt(o, 120)).filter(Boolean).slice(0, 4);
      if (!options.length && typeof c === 'boolean') options = ['Richtig', 'Falsch'];
      if (options.length < 2) throw new Error(`${at}: Es braucht 2 bis 4 Antworten in „options“.`);
      if (typeof c === 'boolean') c = c ? 0 : 1;
      else if (typeof c === 'string') {
        const s = c.trim(), byText = options.findIndex(o => o.toLowerCase() === s.toLowerCase());
        c = s === '' ? null : byText >= 0 ? byText : s.length === 1 ? LETTERS.indexOf(s.toUpperCase()) : -1;
      }
      if (c !== null && c !== undefined && !(Number.isInteger(c) && c >= 0 && c < options.length)) throw new Error(`${at}: „correct“ passt nicht zu den Antworten (erlaubt: A–${LETTERS[options.length - 1]}, der Antworttext oder null für eine Umfrage).`);
      return { options, correct: c ?? null };
    };
    const questions = (Array.isArray(t?.questions) ? t.questions : []).slice(0, 100).map((x, i) => {
      const { options, correct } = answers(x, where(i));
      const text = txt(x?.text ?? x?.q ?? x?.question, 400);
      if (!text) throw new Error(`${where(i)}: Der Fragetext („text“) fehlt.`);
      const q = { id: uid(), text, options, correct };
      // Differenzierung (seit 2.5.0, alles optional): bonus = Sternchenfrage, tag = Thema, hint = Tipp, g = G-Fassung
      if (x?.bonus === true) { if (correct === null) throw new Error(`${where(i)}: „bonus“ geht nur bei Fragen mit richtiger Antwort.`); q.bonus = true; }
      const tag = txt(x?.tag ?? x?.topic ?? x?.thema, 40), hint = txt(x?.hint ?? x?.tipp, 160);
      if (tag) q.tag = tag; if (hint) q.hint = hint;
      const gv = x?.g ?? x?.G;
      if (gv !== undefined && gv !== null) {
        if (typeof gv !== 'object') throw new Error(`${where(i)}: „g“ muss eine Fassung mit „options“ und „correct“ sein.`);
        const g = answers(gv, `${where(i)}, G-Fassung`);
        if (correct === null || g.correct === null) throw new Error(`${where(i)}: Eine G-Fassung braucht in beiden Fassungen eine richtige Antwort.`);
        if (g.options.length > options.length) throw new Error(`${where(i)}: Die G-Fassung darf höchstens so viele Antworten haben wie die Frage (${options.length}).`);
        q.g = { text: txt(gv.text ?? gv.q ?? gv.question, 400), ...g };
      }
      return q;
    });
    if (!questions.length) throw new Error(`Fragensatz ${k + 1} („${title}“) enthält keine Fragen.`);
    return { id: uid(), title, questions, className: t?.allClasses === true ? '*' : txt(t?.class ?? t?.className, 60) };
  });
}
// Bisherige Schnittstelle: Text → Fragensätze (ohne Klassenangabe)
export function parseSets(text) {
  let raw;
  try { raw = looseJson(text); } catch { throw new Error('Das ist keine gültige Fragensatz-Datei (JSON).'); }
  const p = split(raw);
  if (!p.sets.length) throw new Error('In der Datei wurde kein Fragensatz gefunden.');
  return normSets(p.sets).map(({ className, ...t }) => t);
}

// ---------- Lerngruppen ----------
// { name, subject?, students: ["Anna", "Ben, 6b", { name: "Cem", class: "6a" }], quiz?: true }
export function personOf(v) {
  if (v && typeof v === 'object') return { name: txt(v.name ?? v.vorname, 40), className: txt(v.class ?? v.className ?? v.klasse, 20) };
  const l = txt(v, 80), m = l.match(/^(.+?)\s*[,;(\t]\s*([^)]*)\)?$/);
  return { name: txt(m ? m[1] : l, 40), className: txt(m ? m[2] : '', 20) };
}
export function normGroups(list) {
  if (!Array.isArray(list) || !list.length) throw new Error('Es wurde keine Lerngruppe gefunden.');
  return list.slice(0, 30).map((g, k) => {
    const name = txt(g?.name ?? g?.title, 60);
    const src = g?.students ?? g?.kinder ?? g?.names;
    if (!Array.isArray(src)) throw new Error(`Lerngruppe ${k + 1}${name ? ` („${name}“)` : ''}: Die Liste „students“ fehlt.`);
    const students = src.map(personOf).filter(p => p.name).slice(0, 80);
    if (!students.length) throw new Error(`Lerngruppe ${k + 1}${name ? ` („${name}“)` : ''} enthält keine Namen.`);
    return { name, subject: txt(g?.subject ?? g?.fach, 30), students, quiz: g?.quiz === true };
  });
}

// ---------- Erkennen, was in einer Datei steckt ----------
const isBackup = raw => raw && !Array.isArray(raw) && (raw.kind === 'backup-encrypted' || (raw.data && typeof raw.data === 'object') || raw.technik || raw.classes || raw.screen
  || (Array.isArray(raw.groups) && raw.groups.some(g => g && typeof g === 'object' && g.id) && !raw.kind));
function split(raw) {
  const p = { sets: [], plans: [], groups: [] };
  const put = v => {
    if (!v || typeof v !== 'object') return false;
    if (Array.isArray(v.questions)) p.sets.push(v); else if (Array.isArray(v.items)) p.plans.push(v);
    else if (Array.isArray(v.students) || Array.isArray(v.kinder) || Array.isArray(v.names)) p.groups.push(v); else return false;
    return true;
  };
  if (Array.isArray(raw)) {
    if (raw.length && raw.every(v => typeof v === 'string')) p.groups.push({ name: '', students: raw });
    else raw.forEach(put);
  } else if (raw && typeof raw === 'object') {
    for (const [key, to] of [['sets', p.sets], ['plans', p.plans], ['groups', p.groups]]) if (Array.isArray(raw[key])) to.push(...raw[key].filter(v => v && typeof v === 'object'));
    if (!p.sets.length && !p.plans.length && !p.groups.length) put(raw);
  }
  return p;
}

// Text (Datei oder eingefügt) → { backup: Objekt } oder { sets, plans, groups } (roh, noch ungeprüft).
// Kein JSON, aber mehrere Zeilen ohne Klammern: Namensliste für eine Lerngruppe.
export function rawParts(text) {
  const src = String(text ?? '').replace(/^﻿/, '').trim();
  if (!src) throw new Error('Bitte eine Datei wählen oder den Inhalt einfügen.');
  let raw;
  try { raw = looseJson(src); } catch (e) {
    if (/[{}[\]]/.test(src)) throw new Error('Der Inhalt ist kein gültiges JSON: ' + e.message);
    const names = src.split(/\n/).map(l => l.trim()).filter(Boolean);
    if (names.length < 2) throw new Error('Das ist weder eine KlassenKompass-Datei noch eine Namensliste.');
    return { sets: [], plans: [], groups: [{ name: '', students: names }] };
  }
  if (isBackup(raw)) return { backup: raw };
  const p = split(raw);
  if (!p.sets.length && !p.plans.length && !p.groups.length) throw new Error('Darin wurden keine Fragensätze („sets“), Hallenpläne („plans“) oder Lerngruppen („groups“) gefunden.');
  return p;
}
export const bundleText = parts => JSON.stringify({ app: 'KlassenKompass', kind: 'bundle', v: 1, ...Object.fromEntries(Object.entries(parts).filter(([, v]) => v.length)) }, null, 1);

// Rohteile prüfen und in die Form der App bringen; Fehlermeldungen nennen Satz/Plan/Gruppe und Stelle.
export function readImport(text) {
  const p = rawParts(text);
  if (p.backup) return { backup: p.backup };
  return { sets: p.sets.length ? normSets(p.sets) : [], plans: p.plans.length ? parsePlans(JSON.stringify(p.plans)) : [], groups: p.groups.length ? normGroups(p.groups) : [] };
}
export const nq = sets => { const n = sets.reduce((a, t) => a + t.questions.length, 0); return n + (n === 1 ? ' Frage' : ' Fragen'); };
// Kurze Zusammenfassung in Zeilen, z. B. für die Vorschau
export function summary(c) {
  const out = [];
  if (c.groups.length) out.push(`${c.groups.length} Lerngruppe${c.groups.length === 1 ? '' : 'n'}: ` + c.groups.map(g => `${g.name || 'ohne Namen'} (${g.students.length} Kinder)`).join(', '));
  if (c.sets.length) out.push(`${c.sets.length} Fragens${c.sets.length === 1 ? 'atz' : 'ätze'} mit ${nq(c.sets)}: ` + c.sets.map(t => t.title + (t.className && t.className !== '*' ? ` → ${t.className}` : '')).join(', '));
  if (c.plans.length) out.push(`${c.plans.length} Hallenpl${c.plans.length === 1 ? 'an' : 'äne'}: ` + c.plans.map(x => x.title).join(', '));
  return out;
}

// Kurzbeschreibung zum Kopieren (z. B. als Auftrag an eine KI)
export const FORMAT_HELP = `KlassenKompass-Import (eine JSON-Datei, alle Teile optional):
{
  "app": "KlassenKompass", "kind": "bundle", "v": 1,
  "groups": [ { "name": "7ab Technik", "subject": "Technik", "quiz": true,
                "students": ["Anna", "Ben, 7b", "Cem"] } ],
  "sets": [ { "title": "Werkzeugkunde", "class": "7ab Technik",
              "questions": [
                { "text": "Womit sägt man Holz quer zur Faser?", "options": ["Feinsäge", "Feile", "Raspel", "Zange"], "correct": "A",
                  "tag": "Werkzeuge", "hint": "Sie hat feine Zähne.", "g": { "options": ["Feinsäge", "Hammer"], "correct": "A" } },
                { "text": "Beim Bohren trägt man eine Schutzbrille.", "correct": true },
                { "text": "Was hat dir heute geholfen?", "options": ["Video", "Hilfeheft", "Partner"], "correct": null } ] } ],
  "plans": [ { "title": "Völkerball", "topic": "Völkerball", "lesson": "2026.11.18 · Klasse 6 · Werfen", "phase": 1,
               "lines": ["volleyball"],
               "items": [ { "kind": "zone", "m": [1, 13, 1, 14], "color": "#2e7d4f", "text": "Feld A" },
                          { "kind": "gear", "gear": "bank_lang", "view": "laengs", "at": [13.5, 7.5] },
                          { "kind": "kid", "at": [5, 6], "color": "#c94040" } ],
               "rules": { "title": "Völkerball", "items": ["Nur unterhalb der Schulter treffen."], "print": true } } ]
}
Regeln:
- groups: nur Vornamen; "Vorname, Klasse" ist möglich; "quiz": true legt eine Quiz-Klasse mit gleicher Kinderzahl an. Gibt es die Lerngruppe schon (gleicher Name), kommen nur fehlende Kinder dazu.
- sets: 2 bis 4 Antworten je Frage, höchstens 100 Fragen; "correct" = Buchstabe A–D, der Antworttext, true/false (Richtig/Falsch) oder null (Umfrage). "class" = Name der Quiz-Klasse, "allClasses": true = für alle Klassen.
- sets, Differenzierung (alles optional): "bonus": true = Sternchenfrage (zählt nur, wenn sie richtig ist); "tag" = Thema für die Auswertung; "hint" = Tipp zum Einblenden; "g" = leichtere G-Fassung derselben Frage mit eigenen "options" (höchstens so viele wie die Frage), eigenem "correct" und optional eigenem "text".
- plans: Maße in Metern auf dem Hallenboden (x 0–27 von links, y 0–15 von vorn nach hinten); kind = zone, gear, cone, kid, teacher, ball, cross, tag, text, arrow, path; lines = basketball, handball, volleyball, badminton, fussball. Alle Geräte: node tools/hallplan.mjs --list
- Prüfen vor dem Import: node tools/import-check.mjs datei.json`;

// Gemeinsamer Import (seit 2.4.0): ein Dialog für alles, was in die App soll – Fragensätze, Hallenpläne, Lerngruppen
// (einzeln oder gemeinsam in einer Datei) und die Sicherung der ganzen App. Datei wählen, hineinziehen, Text einfügen
// oder Zwischenablage; die Vorschau zeigt sofort, was erkannt wurde oder wo der Fehler liegt. Format: js/importformat.js, docs/IMPORT.md.
import * as store from './store.js';
import * as groups from './groups.js';
import * as hall from './hall.js';
import { applySets } from './quiz.js';
import { esc, icon, dialog, toast } from './ui.js';
import { readImport, rawParts, bundleText, summary, nq, FORMAT_HELP } from './importformat.js';

const MAX_SIZE = 60 * 1024 * 1024;
const isText = f => /\.(json|txt|md)$/i.test(f.name) || /json|text/.test(f.type);

// Mehrere Dateien werden zu einer gemeinsamen Datei zusammengefasst; eine Sicherung bleibt allein.
async function textOf(files) {
  const list = [...files].filter(isText);
  if (!list.length) throw new Error('Bitte eine .json- oder .txt-Datei wählen.');
  if (list.some(f => f.size > MAX_SIZE)) throw new Error('Die Datei ist zu groß.');
  const texts = await Promise.all(list.map(f => f.text()));
  if (texts.length === 1) return texts[0];
  const all = { groups: [], sets: [], plans: [] };
  texts.forEach((t, i) => {
    let p; try { p = rawParts(t); } catch (e) { throw new Error(`${list[i].name}: ${e.message}`); }
    if (p.backup) throw new Error(`${list[i].name} ist eine Sicherung der ganzen App – bitte einzeln importieren.`);
    for (const k of Object.keys(all)) all[k].push(...p[k]);
  });
  return bundleText(all);
}

// onBackup(text): Sicherung der ganzen App an app.js übergeben (Passwort, Zusammenführen/Ersetzen)
export function open({ text = '', files = null, onBackup } = {}) {
  if (document.querySelector('dialog.import-dlg')) return;
  let found = null;
  const d = dialog({ title: 'Importieren', submit: 'Importieren', wide: true, body: `
    <div class="imp-drop" data-drop>
      <label class="btn ghost">${icon('upload', 16)} Datei wählen<input type="file" accept=".json,.txt,.md,application/json,text/plain" multiple hidden data-file></label>
      <button type="button" class="btn ghost" data-clip>${icon('cards', 16)} Aus Zwischenablage</button>
      <span class="muted small-text imp-hint">oder Datei hierher ziehen</span>
    </div>
    <label class="field">Inhalt <small class="muted">– Fragensätze, Hallenpläne, Lerngruppen (auch gemeinsam), eine Namensliste oder eine Sicherung</small><textarea name="json" class="input imp-text" rows="6" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder='{ "sets": [ … ], "plans": [ … ], "groups": [ … ] }'></textarea></label>
    <div class="imp-preview" data-preview aria-live="polite"></div>
    <div data-opts></div>
    <details class="imp-help"><summary>Format und Beispiel</summary><pre>${esc(FORMAT_HELP)}</pre><button type="button" class="btn ghost sm" data-copy>${icon('download', 15)} Format kopieren (z. B. für eine KI)</button></details>`,
    onOpen: el => {
      el.classList.add('import-dlg');
      const ta = el.querySelector('[name=json]'), prev = el.querySelector('[data-preview]'), opts = el.querySelector('[data-opts]'), sub = el.querySelector('button[type=submit]');
      const show = () => {
        found = null; opts.innerHTML = '';
        if (!ta.value.trim()) { prev.innerHTML = ''; sub.disabled = true; return; }
        try { found = readImport(ta.value); } catch (e) { prev.innerHTML = `<p class="imp-err">${icon('x', 15)} ${esc(e.message)}</p>`; sub.disabled = true; return; }
        sub.disabled = false;
        if (found.backup) { prev.innerHTML = `<p class="imp-ok">${icon('check', 15)} Sicherung der ganzen App${found.backup.kind === 'backup-encrypted' ? ' (verschlüsselt)' : ''} – weiter mit „Importieren“.</p>`; return; }
        prev.innerHTML = summary(found).map(l => `<p class="imp-ok">${icon('check', 15)} ${esc(l)}</p>`).join('');
        opts.innerHTML = optionsHtml(found);
      };
      let timer = 0;
      ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(show, 250); });
      const take = async fl => { try { ta.value = await textOf(fl); } catch (e) { ta.value = ''; show(); prev.innerHTML = `<p class="imp-err">${icon('x', 15)} ${esc(e.message)}</p>`; return; } show(); };
      el.querySelector('[data-file]').onchange = e => { if (e.target.files.length) take(e.target.files); e.target.value = ''; };
      const clip = el.querySelector('[data-clip]');
      if (!navigator.clipboard?.readText) clip.hidden = true;
      clip.onclick = async () => { try { ta.value = await navigator.clipboard.readText(); show(); } catch { toast('Der Browser gibt die Zwischenablage nicht frei – bitte mit Strg+V bzw. „Einfügen“ ins Feld einfügen.', { kind: 'warn' }); ta.focus(); } };
      el.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(FORMAT_HELP); toast('Format kopiert.'); } catch { toast('Kopieren nicht möglich – bitte den Text markieren.', { kind: 'warn' }); } };
      const drop = el.querySelector('form');
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
      drop.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('drag'); if (e.dataTransfer?.files?.length) take(e.dataTransfer.files); });
      if (files) take(files); else { ta.value = text; show(); }
    },
    onSubmit: fd => {
      found = readImport(String(fd.get('json') || ''));   // Fehler erscheinen im Dialog
      if (found.backup) { const t = JSON.stringify(found.backup); setTimeout(() => onBackup?.(t)); return; }
      apply(found, fd);
    } });
  return d;
}

function optionsHtml(c) {
  const q = store.get().quiz, noName = c.groups.some(g => !g.name), free = c.sets.some(t => !t.className);
  let h = '';
  if (noName) h += `<div class="two"><label class="field">Name der Lerngruppe<input name="gname" class="input" maxlength="60" placeholder="z. B. 7ab · Technik" required></label><label class="field">Fach<input name="gsubject" class="input" maxlength="30" list="imp-subjects" value="${esc(groups.active()?.subject || 'Technik')}"><datalist id="imp-subjects">${groups.SUBJECTS.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label></div>`;
  if (c.groups.length) h += `<label class="check"><input type="checkbox" name="gquiz"> Für jede Lerngruppe auch eine Quiz-Klasse mit gleicher Kinderzahl anlegen</label><p class="muted small-text">Gibt es eine Lerngruppe mit gleichem Namen schon, kommen nur fehlende Kinder dazu. Bitte nur Vornamen.</p>`;
  if (free) h += `<label class="field">Fragensätze gehören zu<select name="qclass" class="select">${q.classes.map(x => `<option value="${esc(x.id)}" ${x.id === q.activeClassId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="*">Alle Klassen (bewusst freigeben)</option>${c.groups.length ? '<option value="@group">Quiz-Klasse der importierten Lerngruppe</option>' : ''}</select></label>`;
  if (c.sets.length) h += `<p class="muted small-text">Fragensätze kommen dazu, nichts wird überschrieben${c.sets.some(t => t.className && t.className !== '*') ? '; Sätze mit „class“ kommen zu der genannten Quiz-Klasse (fehlt sie, zur gewählten)' : ''}. Bilder sind nicht enthalten.</p>`;
  if (c.plans.length) h += `<div class="two"><label class="field">Thema <small class="muted">– für Pläne ohne Thema in der Datei</small><input name="topic" class="input" maxlength="60" list="imp-topics"><datalist id="imp-topics">${hall.topicList().map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
    <label class="check imp-check"><input type="checkbox" name="replace"> Vorhandene Pläne mit gleichem Namen ersetzen</label></div>`;
  return h;
}

function apply(c, fd) {
  const done = [];
  if (c.groups.length) {
    const gname = String(fd.get('gname') || '').trim();
    c.groups.forEach(g => { if (!g.name) { if (!gname) throw new Error('Bitte einen Namen für die Lerngruppe eingeben.'); g.name = gname.slice(0, 60); g.subject = String(fd.get('gsubject') || '').trim().slice(0, 30); } });
    const pick = fd.get('qclass') === '@group';
    const r = groups.importGroups(c.groups, { quiz: fd.get('gquiz') === 'on' || pick || c.sets.some(t => c.groups.some(g => g.name.toLowerCase() === t.className?.toLowerCase())) });
    done.push([r.created && `${r.created} Lerngruppe${r.created === 1 ? '' : 'n'} angelegt`, r.added && `${r.added} Kind${r.added === 1 ? '' : 'er'} ergänzt`, !r.created && !r.added && 'Lerngruppe unverändert'].filter(Boolean).join(', '));
  }
  if (c.sets.length) {
    let classId = String(fd.get('qclass') ?? store.get().quiz.activeClassId ?? '');
    if (classId === '@group') classId = store.get().quiz.classes.find(x => x.name.toLowerCase() === c.groups[0].name.toLowerCase())?.id ?? '';
    const out = applySets(c.sets, classId);
    done.push(`${out.length} Fragens${out.length === 1 ? 'atz' : 'ätze'} mit ${nq(out)}`);
  }
  if (c.plans.length) {
    const replaced = hall.applyPlans(c.plans, { replace: fd.get('replace') === 'on', topic: String(fd.get('topic') || '') });
    done.push(`${c.plans.length} Hallenpl${c.plans.length === 1 ? 'an' : 'äne'}${replaced ? ` (${replaced} ersetzt)` : ''}`);
  }
  toast('Importiert: ' + done.join(' · ') + '.');
}

// Datei ins Fenster ziehen oder JSON mit Strg+V einfügen (wenn gerade kein Feld und kein Dialog offen ist)
export function listen(onBackup) {
  const busy = () => !!document.querySelector('dialog[open]') || document.body.classList.contains('presenting') || !!document.querySelector('.lock-screen');
  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  addEventListener('dragover', e => { if (hasFiles(e) && !busy() && !e.target.closest?.('.hall-host')) e.preventDefault(); });
  addEventListener('drop', e => {
    if (!hasFiles(e) || busy() || e.target.closest?.('.hall-host')) return;
    const fl = [...e.dataTransfer.files].filter(isText); if (!fl.length) return;
    e.preventDefault(); open({ files: fl, onBackup });
  });
  document.addEventListener('paste', e => {
    if (busy() || e.target.closest?.('input,textarea,select,[contenteditable]')) return;
    const t = e.clipboardData?.getData('text') || '';
    if (!/^\s*(```|[{[])/.test(t) || !/"(sets|plans|groups|questions|items|students|app)"/.test(t)) return;
    e.preventDefault(); open({ text: t, onBackup });
  });
}

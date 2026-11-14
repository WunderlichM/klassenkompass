// App-Rahmen: Navigation, Datenmenü, Installation, Offline-Betrieb
import * as store from './store.js';
import { esc, icon, logo, dialog, confirmDialog, toast, downloadFile } from './ui.js';
import * as gruppen from './gruppen.js';
import * as turniere from './turniere.js';
import * as hallen from './hallen.js';
import * as screen from './screen.js';
import * as quiz from './quiz.js';
import * as backup from './backup.js';
import * as account from './account.js';
import * as cloudimages from './cloudimages.js';
import * as images from './images.js';
import * as theme from './theme.js';
import * as lock from './lock.js';
import { MUSIC_MODES, musicMode, musicSupported, setMusicMode, testMusic } from './sound.js';

export const VERSION = '2.0.0';
// Bereiche (seit 2.0.0 nach Werkzeugen statt nach Fächern)
const ROUTES = { '': { mod: gruppen, title: 'Gruppen', theme: '#7055a5', cls: 't-technik' },
  turniere: { mod: turniere, title: 'Turniere & Ranglisten', theme: '#2f6b55', cls: 't-sport' },
  hallenplaene: { mod: hallen, title: 'Hallenpläne', theme: '#2d6f7d', cls: 't-hall' },
  quiz: { mod: quiz, title: 'Kartenquiz', theme: '#a65a2a', cls: 't-quiz' },
  bildschirm: { mod: screen, title: 'Unterrichtsbildschirm', theme: '#3d5a99', cls: 't-screen' } };
// Frühere Adressen: #/sport öffnet Gruppen → Teams, #/gruppen ist dasselbe wie #/
const ALIASES = { gruppen: '', sport: '', technik: '', hallenplan: 'hallenplaene' };

let unmount = null, installEvent = null;
await lock.gate();   // mit App-Sperre: erst nach dem Passwort weiter

function routeKey() { const k = location.hash.replace(/^#\/?/, '').split('?')[0]; return ROUTES[k] ? k : ALIASES[k] ?? ''; }
// Alte Adresse aufgerufen: passende Ansicht wählen und die Adresse ersetzen (ohne neuen Verlaufseintrag)
function resolveAlias() {
  const k = location.hash.replace(/^#\/?/, '').split('?')[0];
  if (!(k in ALIASES)) return;
  if (k === 'sport') gruppen.showTeams();
  history.replaceState(null, '', '#/' + ALIASES[k]);
}

function shell() {
  document.getElementById('app').innerHTML = `
  <header class="topbar no-present">
    <a class="brand" href="#/"><span class="logo">${logo(26)}</span><span><b>KlassenKompass</b><small>Dein Unterricht. Gut organisiert.</small></span></a>
    <nav class="nav" aria-label="Bereiche">
      <a href="#/" data-route="">${icon('users', 16)}<span>Gruppen</span></a>
      <a href="#/turniere" data-route="turniere">${icon('trophy', 16)}<span>Turniere</span></a>
      <a href="#/hallenplaene" data-route="hallenplaene">${icon('hall', 16)}<span>Hallenpläne</span></a>
      <a href="#/quiz" data-route="quiz">${icon('cards', 16)}<span>Quiz</span></a>
      <a href="#/bildschirm" data-route="bildschirm">${icon('screen', 16)}<span>Bildschirm</span></a>
    </nav>
    <div class="top-tools">
      <button type="button" class="status" id="status" title="Alle Daten bleiben auf diesem Gerät">${icon('check', 14)} Auf diesem Gerät gespeichert</button>
      <button class="btn ghost sm" id="install-btn" ${isInstalled() ? 'hidden' : ''} title="Als App installieren">${icon('install', 16)}<span class="lbl">Installieren</span></button>
      <button class="icon-btn" id="lock-btn" ${lock.enabled() ? '' : 'hidden'} aria-label="Jetzt sperren" title="Jetzt sperren – Daten verschlüsselt, Passwort zum Öffnen">${icon('lock')}</button>
      <button class="icon-btn" id="menu-btn" aria-label="Daten und Hilfe" title="Daten und Hilfe">${icon('gear')}</button>
    </div>
  </header>
  <main id="view" tabindex="-1"></main>
  <footer class="foot no-present no-print">KlassenKompass ${VERSION} · <span id="foot-store">${footStore()}</span> · <button class="link" id="foot-help">Hilfe &amp; Datenschutz</button></footer>`;
  document.getElementById('menu-btn').onclick = menuDialog;
  document.getElementById('lock-btn').onclick = () => lock.lockNow();
  document.getElementById('foot-help').onclick = helpDialog;
  document.getElementById('install-btn').onclick = install;
}

function navigate() {
  resolveAlias();
  const key = routeKey(), r = ROUTES[key];
  unmount?.();
  document.body.classList.remove('presenting');
  document.body.className = document.body.className.replace(/\bt-\w+\b/g, '').trim() + ' ' + r.cls;
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.route === key));
  document.title = `KlassenKompass · ${r.title}`;
  setThemeColor();
  const view = document.getElementById('view');
  unmount = r.mod.mount(view);
  view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter');   // kurzer Einblend-Effekt beim Bereichswechsel
  clearTimeout(navigate.t); navigate.t = setTimeout(() => view.classList.remove('enter'), 450);                    // danach weg, sonst spielt er bei jedem Neuzeichnen
  view.focus({ preventScroll: true });
  scrollTo(0, 0);
}

// Farbe der Statusleiste (Handy, installierte App): Bereichsfarbe, im Dark Mode dunkel
function setThemeColor() {
  document.querySelector('meta[name=theme-color]').setAttribute('content', theme.isDark() ? '#1c1e25' : ROUTES[routeKey()].theme);
}

// ---------- Datenmenü ----------
function menuDialog() {
  const s = store.get(), size = new Blob([JSON.stringify(s)]).size;
  dialog({ title: 'Daten und Hilfe', submit: null, cancel: 'Schließen', body: `
    <p class="muted">Alle Lerngruppen, Hallenpläne, Quizfragen und der Bildschirm sind nur in diesem Browser auf diesem Gerät gespeichert (${(size / 1024).toFixed(0)} KB${lock.enabled() ? ', verschlüsselt' : ''}). ${account.enabled ? 'Mit einem Konto werden sie zusätzlich verschlüsselt auf dem Server abgelegt.' : 'Es gibt keinen Server und keine Anmeldung.'}</p>
    <div class="menu-grid">
      ${account.enabled ? `<button type="button" class="menu-item" data-m="account">${icon('user')}<span><b>${account.status().state === 'off' ? 'Konto &amp; Synchronisierung' : 'Konto · ' + esc(account.status().email)}</b><small>${account.status().state === 'off' ? 'Anmelden, um deine Daten verschlüsselt auf allen Geräten gleich zu halten – auch Handy und Tablet.' : 'Angemeldet – Daten werden verschlüsselt abgeglichen. Abmelden, Passwort ändern, Konto löschen.'}</small></span></button>` : ''}
      <button type="button" class="menu-item${lock.enabled() ? '' : ' recommend'}" data-m="lock">${icon('lock')}<span><b>${lock.enabled() ? 'App-Sperre · an' : 'App-Sperre einrichten (empfohlen)'}</b><small>${lock.enabled() ? esc(lock.describe()) : 'Daten auf diesem Gerät mit einem Passwort verschlüsseln. Nach einer Zeit ohne Bedienung sperrt sich die App.'}</small></span></button>
      <div class="menu-item theme-item">${icon('moon')}<span><b>Design</b><small>Automatisch folgt der Einstellung des Geräts. Gilt nur für dieses Gerät.</small></span>
        <div class="seg" role="group" aria-label="Design">${[['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, l]) => `<button type="button" data-theme-opt="${v}" class="${theme.get() === v ? 'on' : ''}" aria-pressed="${theme.get() === v}">${l}</button>`).join('')}</div></div>
      <button type="button" class="menu-item" data-m="music">${icon('volume')}<span><b>Musik bei Signalen · ${esc(MUSIC_MODES[musicMode()].name)}</b><small>Läuft auf diesem Gerät Musik (z. B. Spotify, YouTube), kann die App sie bei Timer-Signalen leiser stellen oder kurz anhalten. Testen und auswählen.</small></span></button>
      <button type="button" class="menu-item" data-m="export">${icon('download')}<span><b>Daten exportieren</b><small>Mit Passwort verschlüsselte Sicherungsdatei herunterladen – für ein anderes Gerät oder als Backup.</small></span></button>
      <button type="button" class="menu-item" data-m="import">${icon('upload')}<span><b>Daten importieren</b><small>Sicherung oder Export der früheren KlassenKompass-App einlesen.</small></span></button>
      <button type="button" class="menu-item" data-m="help">${icon('help')}<span><b>Hilfe &amp; Datenschutz</b><small>Kurzanleitung und Hinweise zur Datenspeicherung.</small></span></button>
      <button type="button" class="menu-item danger" data-m="reset">${icon('trash')}<span><b>Alles zurücksetzen</b><small>Alle Daten auf diesem Gerät löschen und mit der Demo neu beginnen.</small></span></button>
    </div>
    <input type="file" id="import-file" accept="application/json,.json" hidden>`,
    onOpen: (el, close) => {
      el.querySelector('[data-m=export]').onclick = () => { close(); exportDialog(); };
      el.querySelectorAll('[data-theme-opt]').forEach(b => b.onclick = () => {
        theme.set(b.dataset.themeOpt);
        el.querySelectorAll('[data-theme-opt]').forEach(o => { const on = o === b; o.classList.toggle('on', on); o.setAttribute('aria-pressed', on); });
      });
      el.querySelector('[data-m=help]').onclick = () => { close(); helpDialog(); };
      el.querySelector('[data-m=lock]').onclick = () => { close(); lockDialog(); };
      el.querySelector('[data-m=music]').onclick = () => { close(); musicDialog(); };
      const ab = el.querySelector('[data-m=account]'); if (ab) ab.onclick = () => { close(); accountDialog(); };
      const file = el.querySelector('#import-file');
      el.querySelector('[data-m=import]').onclick = () => file.click();
      file.onchange = async () => { const f = file.files[0]; if (!f) return; close(); importFile(f); };
      el.querySelector('[data-m=reset]').onclick = async () => {
        close();
        if (!(await confirmDialog('Alles zurücksetzen', 'Alle Lerngruppen, Turniere, Ranglisten, Hallenpläne, Quizfragen und -ergebnisse und der Bildschirm werden auf diesem Gerät gelöscht. Exportiere vorher eine Sicherung, wenn du die Daten noch brauchst.', 'Alles löschen'))) return;
        store.replaceState(store.freshState()); navigate(); toast('Zurückgesetzt.');
      };
    } });
}

// App-Sperre: Daten auf diesem Gerät mit eigenem Passwort verschlüsseln (js/lock.js)
const minuteSelect = cur => `<label class="field">Automatisch sperren nach<select name="min" class="select">${lock.MINUTES.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
  <p class="muted small-text">ohne Bedienung. Solange ein Timer, eine Stoppuhr, ein Intervalltimer oder ein Quiz läuft, sperrt sich die App nicht.</p>`;
function lockDialog() {
  const refresh = () => { const b = document.getElementById('lock-btn'); if (b) b.hidden = !lock.enabled(); };
  if (!lock.enabled()) {
    dialog({ title: 'App-Sperre einrichten', submit: 'Verschlüsseln', body: `
      <p>Die Daten auf diesem Gerät (Namen, Gruppen, Ergebnisse …) werden mit diesem Passwort verschlüsselt. Beim Öffnen der App und nach der eingestellten Zeit ohne Bedienung fragt die App danach.</p>
      <label class="field">Passwort der App-Sperre<input name="pw" type="password" class="input" autocomplete="new-password" minlength="8" required></label>
      <label class="field">Passwort wiederholen<input name="pw2" type="password" class="input" autocomplete="new-password" minlength="8" required></label>
      ${minuteSelect(15)}
      <div class="notice"><b>Wichtig:</b> Passwort vergessen = Daten auf diesem Gerät verloren. Mit Konto holst du sie durch Anmelden zurück, sonst nur aus einer Sicherung („Daten exportieren“). Die Sperre gilt nur für dieses Gerät – auf anderen Geräten einzeln einrichten.</div>`,
      onSubmit: async (fd, form) => {
        const sub = form.querySelector('button[type=submit]'); sub.disabled = true; sub.textContent = 'Wird verschlüsselt …';
        try { await lock.setup(String(fd.get('pw') || ''), String(fd.get('pw2') || ''), Number(fd.get('min'))); }
        finally { sub.disabled = false; sub.textContent = 'Verschlüsseln'; }
        refresh(); toast('App-Sperre eingerichtet. Die Daten auf diesem Gerät sind jetzt verschlüsselt.');
      } });
    return;
  }
  dialog({ title: 'App-Sperre', submit: null, cancel: 'Schließen', body: `
    <p>${esc(lock.describe())}</p>
    ${minuteSelect(lock.minutes())}
    <div class="menu-grid">
      <button type="button" class="menu-item" data-l="now">${icon('lock')}<span><b>Jetzt sperren</b><small>Auch über das Schloss oben rechts.</small></span></button>
      <button type="button" class="menu-item" data-l="pw">${icon('edit')}<span><b>Passwort ändern</b></span></button>
      <button type="button" class="menu-item danger" data-l="off">${icon('x')}<span><b>App-Sperre ausschalten</b><small>Die Daten liegen danach wieder unverschlüsselt im Browser.</small></span></button>
    </div>`,
    onOpen: (el, close) => {
      el.querySelector('[name=min]').onchange = e => { lock.setMinutes(Number(e.target.value)); toast('Gespeichert.'); };
      el.querySelector('[data-l=now]').onclick = () => { close(); lock.lockNow(); };
      el.querySelector('[data-l=pw]').onclick = () => { close(); dialog({ title: 'Passwort der App-Sperre ändern', submit: 'Ändern', body: `<label class="field">Bisheriges Passwort<input name="old" type="password" class="input" autocomplete="current-password" required></label><label class="field">Neues Passwort<input name="n1" type="password" class="input" autocomplete="new-password" minlength="8" required></label><label class="field">Neues Passwort wiederholen<input name="n2" type="password" class="input" autocomplete="new-password" required></label>`,
        onSubmit: async fd => { await lock.changePassword(String(fd.get('old') || ''), String(fd.get('n1') || ''), String(fd.get('n2') || '')); toast('Passwort der App-Sperre geändert.'); } }); };
      el.querySelector('[data-l=off]').onclick = () => { close(); dialog({ title: 'App-Sperre ausschalten', submit: 'Ausschalten', danger: true, body: `<p>Die Daten auf diesem Gerät werden entschlüsselt und liegen danach wieder lesbar im Browser. Für Schülerdaten auf privaten Geräten nicht empfohlen.</p><label class="field">Passwort der App-Sperre<input name="pw" type="password" class="input" autocomplete="current-password" required></label>`,
        onSubmit: async fd => { await lock.disable(String(fd.get('pw') || '')); refresh(); toast('App-Sperre ausgeschaltet.'); } }); };
    } });
}
// Musik bei Signalen: Varianten am Gerät ausprobieren; die zuletzt getestete bleibt eingestellt (gilt nur für dieses Gerät)
function musicDialog() {
  const row = ([id, m]) => `<div class="music-row ${musicMode() === id ? 'on' : ''}" data-mode="${id}">
    <span class="music-txt"><b>${esc(m.name)}</b><small>${esc(m.hint)}</small></span>
    <span class="music-btns"><button type="button" class="btn ghost sm" data-test="0">${icon('play', 14)} Jetzt</button><button type="button" class="btn ghost sm" data-test="5">${icon('clock', 14)} In 5 s</button></span></div>`;
  dialog({ title: 'Musik bei Signalen', submit: null, cancel: 'Fertig', wide: true, body: `
    ${musicSupported() ? '' : '<p class="notice">Dieser Browser kann andere Musik nicht beeinflussen. Das geht nur auf iPad und iPhone ab iOS 16.4 (Safari oder installierte App). Die Signale laufen hier wie bisher über die Musik.</p>'}
    <ol class="help-list steps">
      <li>Musik auf <b>diesem Gerät</b> starten (Spotify, YouTube …, gern über die Bluetooth-Box).</li>
      <li>Zurück in KlassenKompass: bei einer Variante „Jetzt“ antippen. Wird die Musik leiser oder pausiert sie – und läuft sie danach wieder normal?</li>
      <li>Dann „In 5 s“ antippen und nichts berühren. So klingt es später beim Timer, der von selbst endet.</li>
    </ol>
    <div class="music-list">${Object.entries(MUSIC_MODES).map(row).join('')}</div>
    <p class="muted small-text">Die zuletzt getestete Variante bleibt eingestellt (markiert) und gilt für alle Timer, Stoppuhren und den Intervalltimer – nur auf diesem Gerät. Zurück zum bisherigen Verhalten: bei „Nicht beeinflussen“ testen.</p>
    <p class="muted small-text" data-music-state aria-live="polite"></p>`,
    onOpen: el => {
      const state = el.querySelector('[data-music-state]');
      el.querySelectorAll('[data-test]').forEach(b => b.onclick = () => {
        const r = b.closest('[data-mode]'), d = Number(b.dataset.test);
        testMusic(r.dataset.mode, d);
        el.querySelectorAll('.music-row').forEach(x => x.classList.toggle('on', x === r));
        state.textContent = d ? `Signal kommt in ${d} Sekunden – bitte nichts berühren.` : 'Signal läuft.';
        setTimeout(() => { state.textContent = `Eingestellt: ${MUSIC_MODES[musicMode()].name}.`; }, (d + 3) * 1000);
      });
    } });
}

// Sicherung immer mit Passwort verschlüsselt (Quiz-Bilder dieses Geräts kommen mit hinein)
function exportDialog() {
  dialog({ title: 'Daten exportieren', submit: 'Sicherung herunterladen', body: `
    <p>Die Sicherung wird mit einem Passwort verschlüsselt. Ohne dieses Passwort lässt sie sich nicht mehr öffnen – auch nicht vom Betreiber.</p>
    <label class="field">Passwort für die Sicherung<input name="pw" type="password" class="input" autocomplete="new-password" minlength="8" required></label>
    <label class="field">Passwort wiederholen<input name="pw2" type="password" class="input" autocomplete="new-password" minlength="8" required></label>
    <p class="muted small-text">Mindestens 8 Zeichen. Für Schülerdaten die Datei nicht in Cloud-Ordnern (z. B. Google Drive, OneDrive, Dropbox) ablegen, sondern auf dem eigenen Gerät oder einem verschlüsselten USB-Stick.</p>`,
    onSubmit: async (fd, form) => {
      const pw = String(fd.get('pw') || '');
      if (pw.length < 8) throw new Error('Das Passwort muss mindestens 8 Zeichen lang sein.');
      if (pw !== String(fd.get('pw2') || '')) throw new Error('Die Passwörter stimmen nicht überein.');
      const sub = form.querySelector('button[type=submit]'); sub.disabled = true; sub.textContent = 'Wird verschlüsselt …';
      try {
        let text = store.exportJson();
        try { const pics = await images.pack(images.usedIds(store.get())); if (Object.keys(pics).length) { const o = JSON.parse(text); o.images = pics; text = JSON.stringify(o); } } catch {}
        downloadFile(`KlassenKompass-Sicherung-${new Date().toISOString().slice(0, 10)}.json`, await backup.encrypt(text, pw));
      } finally { sub.disabled = false; sub.textContent = 'Sicherung herunterladen'; }
      toast('Verschlüsselte Sicherung heruntergeladen.');
    } });
}

// Fragt das Passwort einer verschlüsselten Sicherung ab; liefert den entschlüsselten Text oder null (abgebrochen)
function askBackupPassword(raw) {
  return new Promise(resolve => {
    let done = false;
    const d = dialog({ title: 'Sicherung öffnen', submit: 'Öffnen', body: `
      <p>Diese Sicherung ist verschlüsselt${raw.exportedAt ? ` (erstellt ${esc(fmt(raw.exportedAt))})` : ''}.</p>
      <label class="field">Passwort der Sicherung<input name="pw" type="password" class="input" autocomplete="current-password" required></label>`,
      onSubmit: async (fd, form) => {
        const sub = form.querySelector('button[type=submit]'); sub.disabled = true; sub.textContent = 'Wird entschlüsselt …';
        try { const text = await backup.decrypt(raw, String(fd.get('pw') || '')); done = true; resolve(text); }
        finally { sub.disabled = false; sub.textContent = 'Öffnen'; }
      } });
    d.el.addEventListener('close', () => { if (!done) resolve(null); });
  });
}

async function importFile(f) {
  let incoming;
  try {
    if (f.size > 60 * 1024 * 1024) throw new Error('Die Datei ist zu groß.');
    let text = await f.text();
    const raw = JSON.parse(text);
    if (backup.isEncrypted(raw)) { text = await askBackupPassword(raw); if (text == null) return; }
    incoming = store.parseImport(text);
    try { const n = await images.unpack(JSON.parse(text).images); if (n) { toast(`${n} Bild(er) übernommen.`); dispatchEvent(new Event('kk-images')); } } catch {}
  } catch (e) { return toast('Import nicht möglich: ' + (e instanceof SyntaxError ? 'Die Datei ist keine gültige JSON-Datei.' : e.message), { kind: 'warn' }); }
  const nW = incoming.screen.widgets.length;
  const hasDemoOnly = store.get().technik.classes.every(c => c.demo) && store.get().sport.groups.every(g => g.demo) && store.get().quiz.sets.every(t => t.demo) && store.get().quiz.classes.every(c => c.demo);
  dialog({ title: 'Daten importieren', submit: 'Importieren', body: `
    <p>Gefunden: <b>${lgCount(incoming)}</b> Lerngruppe(n), <b>${incoming.sport.halls.filter(h => !h.demo).length}</b> Hallenplan/-pläne${incoming.quiz.sets.length ? `, ${incoming.quiz.sets.length} Fragensatz/-sätze` : ''}${nW ? `, Bildschirm mit ${nW} Objekt(en)` : ''}.</p>
    <label class="check"><input type="radio" name="mode" value="merge" ${hasDemoOnly ? '' : 'checked'}> Zu den vorhandenen Daten hinzufügen <small class="muted">(gleiche Einträge werden aktualisiert)</small></label>
    <label class="check"><input type="radio" name="mode" value="replace" ${hasDemoOnly ? 'checked' : ''}> Vorhandene Daten ersetzen</label>
    ${nW ? '<label class="check"><input type="checkbox" name="screen" checked> Bildschirm übernehmen</label>' : ''}`,
    onSubmit: fd => {
      const replace = fd.get('mode') === 'replace', withScreen = fd.get('screen') === 'on';
      const base = replace ? { ...store.freshState(), technik: { classes: [], activeId: null }, sport: { groups: [], activeId: null, halls: [], activeHall: null, hallLib: [] }, quiz: { classes: [], sets: [], sessions: [], activeClassId: null, activeSetId: null } } : store.get();
      const next = store.mergeInto(base, incoming, { replaceScreen: withScreen });
      if (replace && !withScreen) next.screen = store.get().screen;
      store.replaceState(next); navigate(); toast('Import abgeschlossen.');
    } });
}

function helpDialog() {
  dialog({ title: 'KlassenKompass – Hilfe & Datenschutz', submit: null, cancel: 'Schließen', wide: true,
    onOpen: (el, close) => { el.querySelector('[data-h=tour]').onclick = () => { close(); tour({ force: true }); }; el.querySelector('[data-h=install]').onclick = () => { close(); installGuide(); }; },
    body: `
    <p class="help-actions"><button type="button" class="btn ghost sm" data-h="tour">${icon('help', 16)} Einführung ansehen</button> <button type="button" class="btn ghost sm" data-h="install">${icon('install', 16)} App installieren – Anleitung</button></p>
    <h3>So funktioniert es</h3>
    <ul class="help-list">
      <li><b>Lerngruppen:</b> Eine Lerngruppe (Klasse oder Sportgruppe) hat ein Fach und eine Liste mit Vornamen, optional mit Klasse. Sie gilt für Gruppen, Turniere und Ranglisten; die Auswahl oben wechselt überall mit. Verwalten über das Regler-Symbol neben der Auswahl. „Heute nicht da“ gilt bis zum nächsten Öffnen.</li>
      <li><b>Gruppen:</b> zwei Ansichten derselben Lerngruppe. <b>Sitzordnung:</b> Organisationsform, Tische und Gruppen wählen und „Neu mischen“. <b>Teams:</b> Anzahl Teams wählen und mischen. Unter „Einteilung anpassen“ festlegen, wer nicht in dieselbe Gruppe bzw. dasselbe Team soll (nur im Fenster sichtbar).</li>
      <li><b>Turniere:</b> aus den Teams ein Turnier erstellen – „Jeder gegen jeden“, „K.-o. mit Platzierung“ (niemand scheidet aus) oder „King of the Court“ (Auf- und Abstieg über mehrere Felder) – und Ergebnisse eintragen. Einzelranglisten addieren Punkte über mehrere Spieltage; ein fertiges Turnier lässt sich übernehmen.</li>
      <li><b>Hallenpläne:</b> eigene Sammlung, nach Themen geordnet und durchsuchbar; Pläne einer Stunde lassen sich als Phasen hintereinander anlegen. Bereiche, Hütchen, Kinder, Lehrkraft und über 50 Geräte aus der Leiste in die schräg gezeichnete Halle (27 m × 15 m, Spielfeldlinien zuschaltbar) ziehen, verschieben, drehen und in der Größe ändern; mit Umschalt-Klick mehrere Elemente wählen, „Kinder einsetzen“ füllt einen Bereich, „Raster“ richtet beim Verschieben aus. Groß zeigen oder als Schüleransicht (A4 quer) drucken. Optional eigene Bilder – sie bleiben auf deinen Geräten bzw. verschlüsselt in deinem Konto.</li>
      <li><b>Quiz:</b> Kartenquiz – die Kinder antworten mit gedruckten Karten, ohne eigenes Gerät. Im Quiz gibt es keine Namen, nur Tiere: Karte 1 ist immer der Adler, Karte 2 der Biber … – in jeder Klasse gleich, ein Kartensatz reicht für alle Klassen. Quiz-Klasse mit Name und Kinderzahl anlegen (bei weniger Kindern fallen die letzten Tiere weg), Karten und das Zuordnungsblatt drucken (die Kinder schreiben ihren Namen neben ihr Tier; das Blatt bleibt bei dir), Fragensatz anlegen (Fragen und Antworten auch mit Bild), fehlende Kinder als „Fehlt heute“ markieren, „Quiz starten“ und am Beamer zeigen. Das Quiz läuft dort als Bühne mit Tönen und Denkmusik (Lautsprecher-Knopf: an/aus, Lautstärke, Probehören); nach dem Auflösen zeigt „Zwischenstand“ die besten fünf Tiere. Die Kinder halten ihre Karte mit der gewählten Antwort nach oben; das Handy scannt die ganze Klasse auf einmal. Jede Klasse hat eine Rangliste über alle Quiz (sortiert nach Anteil richtiger Antworten), die sich zeigen, als CSV speichern und neu beginnen lässt. Mit Konto: Quiz am PC starten, auf dem Handy (gleiches Konto) Quiz → „Karten scannen“. Ohne Konto: Quiz auf dem Gerät mit Kamera starten und „Hier scannen“. Bilder im Quiz: Mit Konto sind sie auf allen deinen Geräten da (einmal geladen, danach auch offline). Ohne Konto bleiben sie auf dem Gerät, auf dem sie eingefügt wurden, und kommen über „Daten exportieren/importieren“ auf andere Geräte.</li>
      <li><b>Bildschirm:</b> Timer, Stoppuhren, Intervalltimer, QR-Codes und Hallenpläne frei anordnen und groß zeigen. Läuft auf dem Gerät Musik, kann die App sie bei Signalen leiser stellen oder kurz anhalten (Zahnrad → „Musik bei Signalen“).</li>
      <li><b>Dark Mode:</b> Zahnrad → „Design“: Automatisch (wie das Gerät), Hell oder Dunkel. Gilt nur für das jeweilige Gerät; Ausdrucke und Antwortkarten bleiben immer hell.</li>
      <li><b>Drucken:</b> Sitzplan, Teams, Turnier und Ranglisten über „Drucken / PDF“ ausdrucken oder als PDF speichern.</li>
      <li><b>Konto (alle Geräte):</b> Zahnrad → „Konto &amp; Synchronisierung“. Mit E-Mail und Passwort anmelden; die Daten werden auf dem Gerät verschlüsselt und auf allen angemeldeten Geräten gleich gehalten. Passwort vergessen = Daten im Konto verloren.</li>
      <li><b>Ohne Konto, mehrere Geräte:</b> Zahnrad → „Daten exportieren“ (mit Passwort verschlüsselt) und auf dem anderen Gerät „Daten importieren“.</li>
      <li><b>Als App nutzen:</b> Oben rechts auf ${icon('install', 14)} tippen – dort steht die Anleitung für iPhone, Android und PC. Danach funktioniert KlassenKompass auch ohne Internet.</li>
    </ul>
    <h3>Datenschutz</h3>
    <ul class="help-list">
      <li><b>Ohne Konto</b> bleiben alle Eingaben ausschließlich im Speicher dieses Browsers auf diesem Gerät.</li>
      <li><b>App-Sperre</b> (Zahnrad → „App-Sperre einrichten“): Die Daten auf dem Gerät werden mit einem eigenen Passwort verschlüsselt (AES-256). Die App fragt beim Öffnen und nach einer einstellbaren Zeit ohne Bedienung danach; das Schloss oben rechts sperrt sofort. Für Schülerdaten auf privaten Geräten einschalten. Passwort vergessen = Daten auf dem Gerät verloren (mit Konto durch Anmelden zurückholen).</li>
      <li><b>Mit Konto</b> werden die Daten vor dem Hochladen auf dem Gerät mit deinem Passwort verschlüsselt (AES-256). Auf dem Server (Supabase, Rechenzentrum Frankfurt) liegt nur ein unlesbarer Datenblock und deine E-Mail-Adresse. Neue Konten sind nur mit einer Schul-E-Mail-Adresse (@${esc(account.ALLOWED_DOMAIN)}) möglich. Weder der Betreiber noch Supabase können die Namen lesen.</li>
      <li>Keine Werbung, keine Analyse, keine externen Skripte.</li>
      <li>Bitte nur Vornamen (und bei Bedarf die Klasse) eintragen. Krankmeldungen werden nicht gespeichert.</li>
      <li><b>Kartenquiz:</b> Das Quiz kennt keine Namen, nur Kartennummern und Tiere; die Zuordnung Tier ↔ Kind steht nur auf deinem Papierblatt. Die Kamera wird nur während des Scannens benutzt; die Bilder werden direkt auf dem Gerät ausgewertet und weder gespeichert noch übertragen. Gespeichert werden nur die Antworten (Buchstaben) je Karte. Das sind Leistungsdaten – Ergebnisse, die du nicht mehr brauchst, unter „Ergebnisse“ löschen. „Fehlt heute“ wird im Ergebnis nur als „fehlte“ vermerkt, ohne Grund. Bilder zu Quizfragen werden im Browser des Geräts gespeichert; mit Konto zusätzlich auf dem Gerät verschlüsselt im Dateispeicher von Supabase. Bilder, die in keiner Frage und keinem Ergebnis mehr vorkommen, löscht die App dort nach einigen Tagen automatisch. Lade keine Fotos von Kindern hoch.</li>
      <li>Ohne Konto sehen andere Geräte deine Daten nicht. Zum Übertragen „Daten exportieren“ und auf dem anderen Gerät „Daten importieren“ nutzen. Die Sicherungsdatei ist mit einem eigenen Passwort verschlüsselt (AES-256); ohne Passwort lässt sie sich nicht öffnen. Für Schülerdaten nicht in Cloud-Ordnern wie Google Drive ablegen.</li>
      <li>Wenn der Browserverlauf bzw. die Websitedaten gelöscht werden, sind auch die Daten weg. Exportiere daher regelmäßig eine Sicherung.</li>
    </ul>
    <h3>Datenschutzhinweise im Einzelnen</h3>
    <ul class="help-list">
      <li><b>Welche Daten:</b> Vornamen, optional Klasse, Namen und Fach der Lerngruppen, Sitzpläne, Teams, Ergebnisse, Quizfragen und Quizantworten je Kind sowie Einstellungen. Mit Konto zusätzlich die E-Mail-Adresse.</li>
      <li><b>Live-Quiz mit Konto:</b> Während ein Quiz läuft, tauschen Beamer-Gerät und Handy über Supabase die aktuelle Frage, die Kartennummern und die gescannten Antwortbuchstaben aus – ebenfalls auf dem Gerät verschlüsselt, ohne Schülernamen. Beim Beenden wird dieser Zwischenstand gelöscht, spätestens nach einem Tag.</li>
      <li><b>Wozu:</b> ausschließlich zur Unterrichtsorganisation der angemeldeten Lehrkraft.</li>
      <li><b>Wo:</b> im Browser (Websitedaten) des Geräts. Mit Konto zusätzlich verschlüsselt bei Supabase (Rechenzentrum Frankfurt) als Auftragsverarbeiter.</li>
      <li><b>Abruf der App:</b> Die App wird über GitHub Pages ausgeliefert. Dabei verarbeitet GitHub technisch notwendig die IP-Adresse und Browserangaben, um die Seite auszuliefern und abzusichern. Die App selbst setzt keine Cookies und lädt nichts von fremden Servern nach.</li>
      <li><b>Löschen:</b> Zahnrad → „Konto &amp; Synchronisierung“ → „Konto löschen“ entfernt Konto und gespeicherten Datenblock sofort. Ohne Konto genügt es, die Websitedaten im Browser zu löschen.</li>
      <li><b>Deine Rechte:</b> Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit (über „Daten exportieren“) und Beschwerde bei einer Datenschutzaufsichtsbehörde, in Baden-Württemberg beim LfDI.</li>
      <li><b>Für Lehrkräfte:</b> Wer Schülerdaten auf privaten Geräten oder mit eigenen Programmen verarbeitet, klärt das vorher mit der Schulleitung bzw. der oder dem Datenschutzbeauftragten der Schule (in Baden-Württemberg: VwV „Datenschutz an öffentlichen Schulen“).</li>
    </ul>` });
}

// ---------- Installation ----------
function isInstalled() { return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true; }
function platform() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}
async function install() {
  if (installEvent) {
    installEvent.prompt();
    const choice = await installEvent.userChoice.catch(() => null); installEvent = null;
    if (choice?.outcome === 'accepted') { document.getElementById('install-btn').hidden = true; return; }
  }
  installGuide();
}
const GUIDES = {
  ios: { title: 'iPhone und iPad', steps: [
    'Die Seite in <b>Safari</b> öffnen (in Chrome geht es genauso).',
    'Unten (iPad: oben rechts) auf das <b>Teilen-Symbol</b> tippen – das Quadrat mit dem Pfeil nach oben.',
    'Nach unten wischen und <b>„Zum Home-Bildschirm“</b> wählen. Steht es nicht in der Liste: ganz unten „Aktionen bearbeiten“ und dort hinzufügen.',
    'Falls angezeigt, „Als Web-App öffnen“ eingeschaltet lassen. Dann oben rechts auf <b>„Hinzufügen“</b> tippen.',
    'KlassenKompass liegt jetzt als Symbol auf dem Home-Bildschirm.'] },
  android: { title: 'Android', steps: [
    'Die Seite in <b>Chrome</b> öffnen.',
    'Oben rechts auf <b>⋮</b> (drei Punkte) tippen.',
    '<b>„App installieren“</b> bzw. <b>„Zum Startbildschirm hinzufügen“</b> wählen und mit <b>„Installieren“</b> bestätigen.',
    'KlassenKompass erscheint auf dem Startbildschirm und in der App-Übersicht.',
    '<span class="muted">Samsung Internet: Menü ☰ → „Seite hinzufügen zu“ → „Startbildschirm“.</span>'] },
  desktop: { title: 'PC und Mac', steps: [
    '<b>Chrome oder Edge:</b> rechts in der Adressleiste auf das Installieren-Symbol (Bildschirm mit Pfeil) klicken und bestätigen.',
    'Kein Symbol zu sehen? <b>Chrome:</b> ⋮ → „Streamen, speichern und teilen“ → „Seite als App installieren“. <b>Edge:</b> ··· → „Apps“ → „Diese Seite als App installieren“.',
    '<b>Safari am Mac:</b> Menü „Ablage“ → „Zum Dock hinzufügen“.',
    'Firefox kann keine Apps installieren – dort einfach ein Lesezeichen setzen.'] },
};
function installGuide() {
  const p = platform(), g = GUIDES[p], others = Object.entries(GUIDES).filter(([k]) => k !== p);
  dialog({ title: 'KlassenKompass als App installieren', submit: null, cancel: 'Schließen', body: `
    <p class="muted">Als App startet KlassenKompass vom Home-Bildschirm wie jede andere App, im eigenen Fenster und auch ohne Internet.</p>
    <h3>${esc(g.title)}</h3><ol class="help-list steps">${g.steps.map(t => `<li>${t}</li>`).join('')}</ol>
    ${others.map(([, o]) => `<details class="guide-more"><summary>Anleitung für ${esc(o.title)}</summary><ol class="help-list steps">${o.steps.map(t => `<li>${t}</li>`).join('')}</ol></details>`).join('')}` });
}

// ---------- Einführung beim ersten Start ----------
function footStore() { return account.status().state !== 'off' ? 'Mit Konto verschlüsselt synchronisiert' : 'Daten liegen in diesem Browser auf diesem Gerät'; }
function tour({ force = false } = {}) {
  if (!force && store.get().welcomed) return;
  const steps = [
    { ic: logo(34), title: 'Willkommen bei KlassenKompass', html: `<p>Deine Helfer für den Unterricht an einem Ort:</p>
      <ul class="tour-list"><li>${icon('users')}<span><b>Gruppen</b> – Lerngruppen anlegen, Sitzordnung oder Teams per Zufall verteilen.</span></li>
      <li>${icon('trophy')}<span><b>Turniere</b> – jeder gegen jeden, K.-o. und King of the Court ohne Ausscheiden, dazu Einzelranglisten.</span></li>
      <li>${icon('hall')}<span><b>Hallenpläne</b> – Hallen schräg von oben zeichnen, nach Themen ordnen und als Schüleransicht drucken.</span></li>
      <li>${icon('cards')}<span><b>Quiz</b> – Kartenquiz: Kinder heben Antwortkarten, das Handy scannt die ganze Klasse.</span></li>
      <li>${icon('screen')}<span><b>Bildschirm</b> – Timer, Stoppuhren, Intervalltimer und QR-Codes groß zeigen.</span></li></ul>
      <p class="muted small-text">Zum Ausprobieren sind zwei Demo-Lerngruppen mit erfundenen Namen angelegt. Du kannst sie jederzeit löschen.</p>` },
    { ic: icon('check', 30), title: 'Deine Daten', html: `<ul class="help-list">
      <li>Bitte <b>nur Vornamen</b> eintragen (optional die Klasse).</li>
      <li>Ohne Konto bleibt alles <b>nur in diesem Browser auf diesem Gerät</b>. Werden die Browserdaten gelöscht, sind auch deine Klassen weg.</li>
      <li>Über das Zahnrad oben rechts kannst du jederzeit eine Sicherung exportieren und wieder importieren.</li></ul>` },
    ...(account.enabled ? [{ ic: icon('user', 30), title: 'Konto erstellen – empfohlen', html: `<p>Mit einem kostenlosen Konto sind deine Daten <b>gesichert</b> und auf <b>allen deinen Geräten gleich</b> – PC in der Schule, Laptop zu Hause, Tablet und Handy.</p>
      <ul class="help-list"><li>Die Daten werden auf deinem Gerät mit deinem Passwort <b>verschlüsselt</b>. Niemand sonst kann die Namen lesen.</li>
      <li>Darum gilt: <b>Passwort gut merken</b> – vergessen heißt, die Daten im Konto sind verloren.</li></ul>
      <p><button type="button" class="btn primary" data-t="account">${icon('user', 16)} Jetzt Konto erstellen</button> <button type="button" class="btn ghost" data-t="login">Ich habe schon ein Konto</button></p>
      <p class="muted small-text">Du kannst das auch später über das Zahnrad → „Konto &amp; Synchronisierung“ machen.</p>` }] : []),
    ...(isInstalled() ? [] : [{ ic: icon('install', 30), title: 'Als App installieren', html: `<p>Installiert startet KlassenKompass vom Home-Bildschirm bzw. Desktop wie eine normale App und funktioniert auch ohne Internet.</p>
      <p><button type="button" class="btn primary" data-t="install">${icon('install', 16)} So geht’s</button></p>
      <p class="muted small-text">Später jederzeit über den Knopf ${icon('install', 14)} oben rechts.</p>` }]),
  ];
  let i = 0;
  const body = () => { const st = steps[i]; return `
    <div class="tour-step"><div class="tour-ic">${st.ic}</div><h3>${esc(st.title)}</h3>${st.html}</div>
    <div class="tour-nav"><span class="tour-dots">${steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</span>
      ${i ? '<button type="button" class="btn ghost sm" data-t="back">Zurück</button>' : '<button type="button" class="btn ghost sm" data-t="skip">Überspringen</button>'}
      <button type="button" class="btn primary sm" data-t="next">${i === steps.length - 1 ? 'Los geht’s' : 'Weiter'}</button></div>`; };
  dialog({ title: 'Kurze Einführung', submit: null, cancel: null, body: `<div data-tour>${body()}</div>`,
    onOpen: (el, close) => {
      el.addEventListener('close', () => store.update(s => { s.welcomed = true; }, { silent: true }));
      el.classList.add('tour');
      const wrap = el.querySelector('[data-tour]');
      wrap.onclick = e => {
        const t = e.target.closest('[data-t]')?.dataset.t; if (!t) return;
        if (t === 'next') { if (i === steps.length - 1) return close(); i++; }
        else if (t === 'back') i--;
        else if (t === 'skip') return close();
        else if (t === 'account' || t === 'login') { close(); return accountDialog(t === 'account' ? 'register' : 'login'); }
        else if (t === 'install') { close(); return install(); }
        wrap.innerHTML = body();
      };
    } });
}

// ---------- Start ----------
shell();
theme.init(() => { if (document.querySelector('meta[name=theme-color]')) setThemeColor(); });
addEventListener('hashchange', navigate);
navigate();
tour();
lock.startAutoLock(() => screen.busy() || quiz.busy());
// Daten einer neueren App-Fassung: nichts speichern, neu laden lassen (store.outdated)
if (store.outdated()) toast('Diese Daten stammen von einer neueren App-Fassung. Änderungen werden nicht gespeichert – bitte neu laden.', { kind: 'warn', action: 'Neu laden', onAction: () => location.reload() });
// Hinweis auf die App-Sperre, solange eigene Daten unverschlüsselt auf dem Gerät liegen (höchstens einmal pro Woche)
(() => {
  if (lock.enabled()) return;
  const s = store.get(), own = s.technik.classes.some(c => !c.demo) || s.sport.groups.some(g => !g.demo) || s.quiz.classes.some(c => !c.demo);
  const k = 'klassenkompass.lockHint', last = Number(localStorage.getItem(k) || 0);
  if (!own || Date.now() - last < 7 * 864e5) return;
  try { localStorage.setItem(k, String(Date.now())); } catch {}
  setTimeout(() => toast('Schülernamen liegen auf diesem Gerät unverschlüsselt. Mit der App-Sperre werden sie mit einem Passwort verschlüsselt.', { action: 'Einrichten', onAction: lockDialog }), 2500);
})();
function renderStatus() {
  const el = document.getElementById('status'); if (!el) return;
  const err = store.storageError(), ac = account.status(), st = ac.state !== 'off' ? { ...ac, fileName: ac.email } : { state: 'off' };
  const time = st.lastSync ? new Date(st.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
  let cls = '', html, title;
  if (err) { cls = 'warn attn'; html = `${icon('x', 14)} Nicht gespeichert`; title = err; }
  else if (st.state === 'error') { cls = 'warn attn'; html = `${icon('x', 14)} Sync-Fehler`; title = st.error + ' – Hier klicken für die Kontoeinstellungen.'; }
  else if (st.state === 'login') { cls = 'warn attn'; html = `${icon('user', 14)} Anmelden`; title = st.error || 'Bitte erneut anmelden.'; }
  else if (st.state === 'offline') { html = `${icon('repeat', 14)} Offline – wird später abgeglichen`; title = 'Änderungen bleiben auf diesem Gerät und werden abgeglichen, sobald wieder Internet da ist.'; }
  else if (st.state === 'ok') { html = `${icon('repeat', 14)} ${st.dirty ? 'Wird abgeglichen …' : 'Synchronisiert' + (time ? ' · ' + time : '')}`; title = 'Konto: ' + st.fileName; }
  else { html = `${icon('check', 14)} Auf diesem Gerät gespeichert`; title = 'Alle Daten bleiben auf diesem Gerät'; }
  el.className = 'status ' + cls; el.innerHTML = html; el.title = title;
  const fs = document.getElementById('foot-store'); if (fs && fs.textContent !== footStore()) fs.textContent = footStore();
}
setInterval(renderStatus, 2000);
document.getElementById('status').onclick = async () => {
  const ast = account.status().state;
  if (ast !== 'off') { if (ast === 'conflict') account.retryConflict(); else accountDialog(); return; }
  if (account.enabled) accountDialog();
};

// ---------- Hilfsfunktionen für Konto und Sicherung ----------
const fmt = iso => iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–';
const lgCount = data => new Set([...(data?.technik?.classes || []), ...(data?.sport?.groups || [])].map(x => x.id)).size;
const summary = data => `${lgCount(data)} Lerngruppe(n), ${data?.sport?.halls?.length ?? 0} Hallenplan/-pläne, ${data?.quiz?.sets?.length ?? 0} Fragensatz/-sätze`;

// ---------- Konto ----------
function remoteChoice(remote, { title, intro }) {
  return new Promise(resolve => {
    let done = false;
    const d = dialog({ title, submit: null, cancel: 'Abbrechen', body: `<p>${intro}</p>
      <div class="menu-grid">
        <button type="button" class="menu-item" data-c="remote">${icon('download')}<span><b>Stand aus dem Konto übernehmen</b><small>${esc(summary(remote))}. Ersetzt die Daten auf diesem Gerät.</small></span></button>
        <button type="button" class="menu-item" data-c="local">${icon('upload')}<span><b>Stand dieses Geräts behalten</b><small>${esc(summary(store.get()))}. Überschreibt den Stand im Konto.</small></span></button>
      </div>`,
      onOpen: (el, close) => el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { done = true; close(); resolve(b.dataset.c); }) });
    d.el.addEventListener('close', () => { if (!done) resolve(null); });
  });
}

function accountDialog(startMode = 'login') {
  const st = account.status();
  if (st.state === 'off' || st.state === 'login') {
    let mode = st.email ? 'login' : startMode;
    const body = () => `
      <div class="seg wide-seg" role="tablist"><button type="button" data-mode="login" class="${mode === 'login' ? 'on' : ''}">Anmelden</button><button type="button" data-mode="register" class="${mode === 'register' ? 'on' : ''}">Neues Konto</button></div>
      ${st.error && st.state === 'login' ? `<p class="notice">${esc(st.error)}</p>` : ''}
      <label class="field">E-Mail<input name="email" type="email" class="input" autocomplete="username" value="${esc(st.email)}" required></label>
      <label class="field">Passwort<input name="pw" type="password" class="input" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" minlength="8" required></label>
      ${mode === 'register' ? `<label class="field">Passwort wiederholen<input name="pw2" type="password" class="input" autocomplete="new-password" minlength="8"></label>
      <p class="muted small-text">Neue Konten nur mit einer E-Mail-Adresse <b>@${esc(account.ALLOWED_DOMAIN)}</b>.</p>
      <div class="notice"><b>Wichtig:</b> Deine Daten werden mit diesem Passwort auf dem Gerät verschlüsselt. Niemand – auch nicht der Betreiber – kann sie lesen oder das Passwort zurücksetzen. <b>Passwort vergessen = Daten im Konto verloren.</b> Notiere es sicher und exportiere ab und zu eine Sicherung.</div>
      <label class="check"><input type="checkbox" name="ok" required> Verstanden</label>` : `<p class="muted small-text">Nach der Anmeldung bleiben deine Daten auf allen Geräten gleich. Auf gemeinsam genutzten Schul-PCs nach der Stunde abmelden.</p>`}`;
    dialog({ title: 'Konto & Synchronisierung', submit: 'Weiter', body: `<div data-acc>${body()}</div>`,
      onOpen: el => {
        const wrap = el.querySelector('[data-acc]'), sub = el.querySelector('button[type=submit]');
        const bind = () => { sub.textContent = mode === 'register' ? 'Konto anlegen' : 'Anmelden'; wrap.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { const em = wrap.querySelector('[name=email]').value; mode = b.dataset.mode; wrap.innerHTML = body(); wrap.querySelector('[name=email]').value = em; bind(); }); };
        bind();
      },
      onSubmit: async (fd, form) => {
        const register = !!form.querySelector('[name=pw2]');
        const email = String(fd.get('email') || ''), pw = String(fd.get('pw') || '');
        if (register && pw !== String(fd.get('pw2'))) throw new Error('Die Passwörter stimmen nicht überein.');
        if (register && fd.get('ok') !== 'on') throw new Error('Bitte den Hinweis zum Passwort bestätigen.');
        const sub = form.querySelector('button[type=submit]'); sub.disabled = true; sub.textContent = 'Bitte warten …';
        try {
          await account.login(email, pw, { register, decide: remote => remoteChoice(remote, { title: 'Welcher Stand soll gelten?', intro: 'In deinem Konto und auf diesem Gerät sind schon Daten.' }) });
        } finally { sub.disabled = false; sub.textContent = register ? 'Konto anlegen' : 'Anmelden'; }
        navigate(); renderStatus();
        toast(register ? 'Konto angelegt. Melde dich auf deinen anderen Geräten mit denselben Daten an.' : 'Angemeldet.');
      } });
    return;
  }
  dialog({ title: 'Konto & Synchronisierung', submit: null, cancel: 'Schließen', body: `
    <p>Angemeldet als <b>${esc(st.email)}</b>${st.lastSync ? ` · zuletzt abgeglichen ${esc(fmt(st.lastSync))}` : ''}.</p>
    ${st.state === 'error' ? `<p class="notice">${esc(st.error)}</p>` : ''}
    <p class="muted small-text">Deine Daten werden auf dem Gerät verschlüsselt und so im Konto gespeichert. Änderungen werden nach wenigen Sekunden übertragen; andere Geräte holen sie beim Öffnen und alle 20 Sekunden.</p>
    <div class="menu-grid">
      <button type="button" class="menu-item" data-a="now">${icon('repeat')}<span><b>Jetzt abgleichen</b></span></button>
      <button type="button" class="menu-item" data-a="logout">${icon('x')}<span><b>Abmelden</b><small>Auf gemeinsam genutzten Geräten nach der Stunde abmelden.</small></span></button>
      <button type="button" class="menu-item" data-a="pw">${icon('edit')}<span><b>Passwort ändern</b></span></button>
      <button type="button" class="menu-item danger" data-a="delete">${icon('trash')}<span><b>Konto löschen</b><small>Löscht das Konto und die Daten auf dem Server (auch die Quiz-Bilder). Die Daten auf diesem Gerät bleiben.</small></span></button>
    </div>`,
    onOpen: (el, close) => {
      const on = (k, fn) => el.querySelector(`[data-a=${k}]`).onclick = async () => { close(); try { await fn(); } catch (e) { toast(e.message, { kind: 'warn' }); } renderStatus(); };
      on('now', async () => { await account.syncNow(); toast(account.status().state === 'ok' ? 'Abgeglichen.' : account.status().error || 'Abgleich nicht möglich.'); });
      on('logout', () => new Promise(res => dialog({ title: 'Abmelden', submit: 'Abmelden', body: `<label class="check"><input type="checkbox" name="wipe" checked> Daten von diesem Gerät entfernen <small class="muted">(empfohlen auf fremden oder gemeinsam genutzten Geräten)</small></label>`,
        onSubmit: async fd => { await account.logout({ wipe: fd.get('wipe') === 'on' }); navigate(); toast('Abgemeldet.'); res(); } }).el.addEventListener('close', res)));
      on('pw', () => new Promise(res => dialog({ title: 'Passwort ändern', submit: 'Ändern', body: `<label class="field">Bisheriges Passwort<input name="old" type="password" class="input" autocomplete="current-password"></label><label class="field">Neues Passwort<input name="n1" type="password" class="input" autocomplete="new-password" minlength="8"></label><label class="field">Neues Passwort wiederholen<input name="n2" type="password" class="input" autocomplete="new-password"></label>`,
        onSubmit: async fd => { if (fd.get('n1') !== fd.get('n2')) throw new Error('Die neuen Passwörter stimmen nicht überein.'); await account.changePassword(String(fd.get('old')), String(fd.get('n1'))); toast('Passwort geändert. Auf anderen Geräten neu anmelden.'); res(); } }).el.addEventListener('close', res)));
      on('delete', async () => { if (!(await confirmDialog('Konto löschen', `Das Konto ${st.email} und alle Daten auf dem Server endgültig löschen? Die Daten auf diesem Gerät bleiben erhalten.`, 'Konto löschen'))) return; await account.deleteAccount(); toast('Konto gelöscht.'); });
    } });
}

account.init({
  changed: renderStatus,
  conflict: remote => remoteChoice(remote, { title: 'Sync-Konflikt', intro: 'Auf einem anderen Gerät und auf diesem Gerät wurde seit dem letzten Abgleich etwas geändert. Welcher Stand soll gelten?' }).then(c => { if (c === 'remote') setTimeout(navigate); return c; }),
});

cloudimages.init();

// Die frühere Sync-Datei wird nicht mehr unterstützt: gespeicherten Dateizugriff entfernen, einmal Hinweis zeigen
try {
  const old = JSON.parse(localStorage.getItem('klassenkompass.sync') || 'null');
  if (old) {
    localStorage.removeItem('klassenkompass.sync'); indexedDB.deleteDatabase('klassenkompass-sync');
    if (old.fileName) setTimeout(() => toast(`Die Sync-Datei wird nicht mehr unterstützt; die Daten auf diesem Gerät bleiben erhalten. Für mehrere Geräte das Konto oder „Daten exportieren“ nutzen. Die alte Datei „${old.fileName}“ enthält Namen im Klartext – bitte löschen.`, { kind: 'warn', action: 'OK' }), 1500);
  }
} catch {}

addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; const b = document.getElementById('install-btn'); if (b) b.hidden = isInstalled(); });
addEventListener('appinstalled', () => { const b = document.getElementById('install-btn'); if (b) b.hidden = true; toast('KlassenKompass wurde installiert.'); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Eine neue Version ist bereit.', { action: 'Neu laden', onAction: () => { nw.postMessage('skipWaiting'); } });
      });
    });
  }).catch(() => {});
  // Nur bei einem Update neu laden – nicht beim allerersten Besuch (sonst verschwindet z. B. die Einführung)
  let reloaded = false; const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; store.saveNow(); location.reload(); } });
}
navigator.storage?.persist?.().catch(() => {});

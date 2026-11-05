// App-Rahmen: Navigation, Datenmenü, Installation, Offline-Betrieb
import * as store from './store.js';
import { esc, icon, dialog, confirmDialog, toast, downloadFile } from './ui.js';
import * as technik from './technik.js';
import * as sport from './sport.js';
import * as screen from './screen.js';

export const VERSION = '1.0.0';
const ROUTES = { '': { mod: technik, title: 'Sitzplan & Gruppen', theme: '#7055a5', cls: 't-technik' },
  sport: { mod: sport, title: 'Teams & Ranglisten', theme: '#2f6b55', cls: 't-sport' },
  bildschirm: { mod: screen, title: 'Unterrichtsbildschirm', theme: '#3d5a99', cls: 't-screen' } };

let unmount = null, installEvent = null;
store.load();

function routeKey() { const k = location.hash.replace(/^#\/?/, '').split('?')[0]; return ROUTES[k] ? k : ''; }

function shell() {
  document.getElementById('app').innerHTML = `
  <header class="topbar no-present">
    <a class="brand" href="#/"><span class="logo">${icon('grid', 20)}</span><span><b>KlassenKompass</b><small>Dein Unterricht. Gut organisiert.</small></span></a>
    <nav class="nav" aria-label="Bereiche">
      <a href="#/" data-route="">${icon('technik', 16)}<span>Technik</span></a>
      <a href="#/sport" data-route="sport">${icon('sport', 16)}<span>Sport</span></a>
      <a href="#/bildschirm" data-route="bildschirm">${icon('screen', 16)}<span>Bildschirm</span></a>
    </nav>
    <div class="top-tools">
      <span class="status" id="status" title="Alle Daten bleiben auf diesem Gerät">${icon('check', 14)} Auf diesem Gerät gespeichert</span>
      <button class="btn ghost sm" id="install-btn" hidden title="Als App installieren">${icon('install', 16)}<span class="lbl">Installieren</span></button>
      <button class="icon-btn" id="menu-btn" aria-label="Daten und Hilfe" title="Daten und Hilfe">${icon('gear')}</button>
    </div>
  </header>
  <main id="view" tabindex="-1"></main>
  <footer class="foot no-present no-print">KlassenKompass ${VERSION} · Alle Daten bleiben in diesem Browser auf diesem Gerät · <button class="link" id="foot-help">Hilfe &amp; Datenschutz</button></footer>`;
  document.getElementById('menu-btn').onclick = menuDialog;
  document.getElementById('foot-help').onclick = helpDialog;
  document.getElementById('install-btn').onclick = async () => {
    if (!installEvent) return;
    installEvent.prompt(); await installEvent.userChoice.catch(() => {}); installEvent = null;
    document.getElementById('install-btn').hidden = true;
  };
}

function navigate() {
  const key = routeKey(), r = ROUTES[key];
  unmount?.();
  document.body.classList.remove('presenting');
  document.body.className = document.body.className.replace(/\bt-\w+\b/g, '').trim() + ' ' + r.cls;
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.route === key));
  document.title = `KlassenKompass · ${r.title}`;
  document.querySelector('meta[name=theme-color]').setAttribute('content', r.theme);
  const view = document.getElementById('view');
  unmount = r.mod.mount(view);
  view.focus({ preventScroll: true });
  scrollTo(0, 0);
}

// ---------- Datenmenü ----------
function menuDialog() {
  const s = store.get(), size = new Blob([JSON.stringify(s)]).size;
  dialog({ title: 'Daten und Hilfe', submit: null, cancel: 'Schließen', body: `
    <p class="muted">Alle Klassen, Sportgruppen und der Bildschirm sind nur in diesem Browser auf diesem Gerät gespeichert (${(size / 1024).toFixed(0)} KB). Es gibt keinen Server und keine Anmeldung.</p>
    <div class="menu-grid">
      <button type="button" class="menu-item" data-m="export">${icon('download')}<span><b>Daten exportieren</b><small>Sicherungsdatei herunterladen – für ein anderes Gerät oder als Backup.</small></span></button>
      <button type="button" class="menu-item" data-m="import">${icon('upload')}<span><b>Daten importieren</b><small>Sicherung oder Export der früheren KlassenKompass-App einlesen.</small></span></button>
      <button type="button" class="menu-item" data-m="help">${icon('help')}<span><b>Hilfe &amp; Datenschutz</b><small>Kurzanleitung und Hinweise zur Datenspeicherung.</small></span></button>
      <button type="button" class="menu-item danger" data-m="reset">${icon('trash')}<span><b>Alles zurücksetzen</b><small>Alle Daten auf diesem Gerät löschen und mit der Demo neu beginnen.</small></span></button>
    </div>
    <input type="file" id="import-file" accept="application/json,.json" hidden>`,
    onOpen: (el, close) => {
      el.querySelector('[data-m=export]').onclick = () => { downloadFile(`KlassenKompass-Sicherung-${new Date().toISOString().slice(0, 10)}.json`, store.exportJson()); toast('Sicherung heruntergeladen.'); };
      el.querySelector('[data-m=help]').onclick = () => { close(); helpDialog(); };
      const file = el.querySelector('#import-file');
      el.querySelector('[data-m=import]').onclick = () => file.click();
      file.onchange = async () => { const f = file.files[0]; if (!f) return; close(); importFile(f); };
      el.querySelector('[data-m=reset]').onclick = async () => {
        close();
        if (!(await confirmDialog('Alles zurücksetzen', 'Alle Klassen, Sportgruppen, Turniere, Ranglisten und der Bildschirm werden auf diesem Gerät gelöscht. Exportiere vorher eine Sicherung, wenn du die Daten noch brauchst.', 'Alles löschen'))) return;
        store.replaceState(store.freshState()); navigate(); toast('Zurückgesetzt.');
      };
    } });
}

async function importFile(f) {
  let incoming;
  try {
    if (f.size > 8 * 1024 * 1024) throw new Error('Die Datei ist zu groß.');
    incoming = store.parseImport(await f.text());
  } catch (e) { return toast('Import nicht möglich: ' + (e instanceof SyntaxError ? 'Die Datei ist keine gültige JSON-Datei.' : e.message), { kind: 'warn' }); }
  const nC = incoming.technik.classes.length, nG = incoming.sport.groups.length, nW = incoming.screen.widgets.length;
  const hasDemoOnly = store.get().technik.classes.every(c => c.demo) && store.get().sport.groups.every(g => g.demo);
  dialog({ title: 'Daten importieren', submit: 'Importieren', body: `
    <p>Gefunden: <b>${nC}</b> Klasse(n), <b>${nG}</b> Sportgruppe(n)${nW ? `, Bildschirm mit ${nW} Objekt(en)` : ''}.</p>
    <label class="check"><input type="radio" name="mode" value="merge" ${hasDemoOnly ? '' : 'checked'}> Zu den vorhandenen Daten hinzufügen <small class="muted">(gleiche Einträge werden aktualisiert)</small></label>
    <label class="check"><input type="radio" name="mode" value="replace" ${hasDemoOnly ? 'checked' : ''}> Vorhandene Daten ersetzen</label>
    ${nW ? '<label class="check"><input type="checkbox" name="screen" checked> Bildschirm übernehmen</label>' : ''}`,
    onSubmit: fd => {
      const replace = fd.get('mode') === 'replace', withScreen = fd.get('screen') === 'on';
      const base = replace ? { ...store.freshState(), technik: { classes: [], activeId: null }, sport: { groups: [], activeId: null } } : store.get();
      const next = store.mergeInto(base, incoming, { replaceScreen: withScreen });
      if (replace && !withScreen) next.screen = store.get().screen;
      store.replaceState(next); navigate(); toast('Import abgeschlossen.');
    } });
}

function helpDialog() {
  dialog({ title: 'KlassenKompass – Hilfe & Datenschutz', submit: null, cancel: 'Schließen', wide: true, body: `
    <h3>So funktioniert es</h3>
    <ul class="help-list">
      <li><b>Technik:</b> Klasse anlegen (nur Vornamen), Organisationsform, Tische und Gruppen wählen, Trennungsregeln festlegen und „Zufällig verteilen“. „Heute krank“ gilt nur bis zum nächsten Öffnen.</li>
      <li><b>Sport:</b> Sportgruppe anlegen (Vorname, optional Klasse), Teams mischen, daraus ein Turnier „jeder gegen jeden“ erstellen und Ergebnisse eintragen. Einzelranglisten addieren Punkte über mehrere Spieltage; ein fertiges Turnier lässt sich übernehmen.</li>
      <li><b>Bildschirm:</b> Timer, Stoppuhren, Intervalltimer und QR-Codes frei anordnen und groß zeigen.</li>
      <li><b>Drucken:</b> Sitzplan, Teams, Turnier und Ranglisten über „Drucken / PDF“ ausdrucken oder als PDF speichern.</li>
      <li><b>Als App nutzen:</b> Im Browser „Installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen. Danach funktioniert KlassenKompass auch ohne Internet.</li>
    </ul>
    <h3>Datenschutz</h3>
    <ul class="help-list">
      <li>Alle Eingaben werden ausschließlich im Speicher dieses Browsers auf diesem Gerät abgelegt. Es gibt keinen Server, kein Konto, keine Werbung und keine Analyse.</li>
      <li>Bitte nur Vornamen (und bei Sport die Klasse) eintragen. Krankmeldungen werden nicht gespeichert.</li>
      <li>Andere Geräte sehen deine Daten nicht. Zum Übertragen „Daten exportieren“ und auf dem anderen Gerät „Daten importieren“ nutzen. Die Sicherungsdatei enthält die Vornamen – bitte entsprechend sorgfältig aufbewahren.</li>
      <li>Wenn der Browserverlauf bzw. die Websitedaten gelöscht werden, sind auch die Daten weg. Exportiere daher regelmäßig eine Sicherung.</li>
    </ul>` });
}

function welcome() {
  if (store.get().welcomed) return;
  dialog({ title: 'Willkommen bei KlassenKompass', submit: 'Los geht’s', cancel: null, body: `
    <p>Sitzpläne und Gruppen für Technik, Teams und Turniere für Sport sowie ein Unterrichtsbildschirm mit Timern – an einem Ort.</p>
    <ul class="help-list"><li>Zum Ausprobieren sind eine <b>Demoklasse</b> und eine <b>Demogruppe</b> mit erfundenen Namen angelegt. Du kannst sie jederzeit löschen.</li>
    <li>Deine Daten bleiben <b>nur auf diesem Gerät</b>. Kein Konto, kein Server.</li>
    <li>Über das Zahnrad oben rechts kannst du Daten <b>exportieren und importieren</b>.</li></ul>`,
    onOpen: () => store.update(s => { s.welcomed = true; }, { silent: true }) });
}

// ---------- Start ----------
shell();
addEventListener('hashchange', navigate);
navigate();
welcome();
setInterval(() => {
  const err = store.storageError(), el = document.getElementById('status');
  if (el) { el.classList.toggle('warn', !!err); el.innerHTML = err ? `${icon('x', 14)} Nicht gespeichert` : `${icon('check', 14)} Auf diesem Gerät gespeichert`; el.title = err || 'Alle Daten bleiben auf diesem Gerät'; }
}, 2000);

addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; const b = document.getElementById('install-btn'); if (b) b.hidden = false; });
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
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; store.saveNow(); location.reload(); } });
}
navigator.storage?.persist?.().catch(() => {});

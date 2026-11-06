// App-Rahmen: Navigation, Datenmenü, Installation, Offline-Betrieb
import * as store from './store.js';
import { esc, icon, dialog, confirmDialog, toast, downloadFile } from './ui.js';
import * as technik from './technik.js';
import * as sport from './sport.js';
import * as screen from './screen.js';
import * as sync from './sync.js';

export const VERSION = '1.1.0';
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
      <button type="button" class="status" id="status" title="Alle Daten bleiben auf diesem Gerät">${icon('check', 14)} Auf diesem Gerät gespeichert</button>
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
      ${sync.supported ? `<button type="button" class="menu-item" data-m="sync">${icon('repeat')}<span><b>Sync-Datei ${sync.status().state === 'off' ? 'einrichten' : '· ' + esc(sync.status().fileName)}</b><small>${sync.status().state === 'off' ? 'Daten über eine Datei im Google-Drive-Ordner zwischen deinen PCs abgleichen.' : 'Verbunden – Daten werden automatisch abgeglichen. Hier trennen oder neu wählen.'}</small></span></button>` : ''}
      <button type="button" class="menu-item" data-m="export">${icon('download')}<span><b>Daten exportieren</b><small>Sicherungsdatei herunterladen – für ein anderes Gerät oder als Backup.</small></span></button>
      <button type="button" class="menu-item" data-m="import">${icon('upload')}<span><b>Daten importieren</b><small>Sicherung oder Export der früheren KlassenKompass-App einlesen.</small></span></button>
      <button type="button" class="menu-item" data-m="help">${icon('help')}<span><b>Hilfe &amp; Datenschutz</b><small>Kurzanleitung und Hinweise zur Datenspeicherung.</small></span></button>
      <button type="button" class="menu-item danger" data-m="reset">${icon('trash')}<span><b>Alles zurücksetzen</b><small>Alle Daten auf diesem Gerät löschen und mit der Demo neu beginnen.</small></span></button>
    </div>
    <input type="file" id="import-file" accept="application/json,.json" hidden>`,
    onOpen: (el, close) => {
      el.querySelector('[data-m=export]').onclick = () => { downloadFile(`KlassenKompass-Sicherung-${new Date().toISOString().slice(0, 10)}.json`, store.exportJson()); toast('Sicherung heruntergeladen.'); };
      el.querySelector('[data-m=help]').onclick = () => { close(); helpDialog(); };
      const sb = el.querySelector('[data-m=sync]'); if (sb) sb.onclick = () => { close(); syncDialog(); };
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
      <li><b>Mehrere PCs:</b> Über Zahnrad → „Sync-Datei einrichten“ eine Datei im Google-Drive-Ordner anlegen und auf den anderen PCs dieselbe Datei wählen. Die App gleicht dann automatisch ab (Chrome/Edge).</li>
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
function renderStatus() {
  const el = document.getElementById('status'); if (!el) return;
  const err = store.storageError(), st = sync.status();
  const time = st.lastSync ? new Date(st.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
  let cls = '', html, title;
  if (err) { cls = 'warn attn'; html = `${icon('x', 14)} Nicht gespeichert`; title = err; }
  else if (st.state === 'permission') { cls = 'warn attn'; html = `${icon('repeat', 14)} Sync freigeben`; title = 'Der Browser braucht deine Freigabe, um die Sync-Datei zu lesen und zu schreiben. Hier klicken.'; }
  else if (st.state === 'conflict') { cls = 'warn attn'; html = `${icon('repeat', 14)} Sync-Konflikt`; title = 'Hier klicken, um zu entscheiden, welcher Stand gilt.'; }
  else if (st.state === 'error') { cls = 'warn attn'; html = `${icon('x', 14)} Sync-Fehler`; title = st.error + ' – Hier klicken für die Sync-Einstellungen.'; }
  else if (st.state === 'ok') { html = `${icon('repeat', 14)} ${st.dirty ? 'Wird abgeglichen …' : 'Synchronisiert' + (time ? ' · ' + time : '')}`; title = 'Sync-Datei: ' + st.fileName; }
  else { html = `${icon('check', 14)} Auf diesem Gerät gespeichert`; title = 'Alle Daten bleiben auf diesem Gerät'; }
  el.className = 'status ' + cls; el.innerHTML = html; el.title = title;
}
setInterval(renderStatus, 2000);
document.getElementById('status').onclick = async () => {
  const st = sync.status().state;
  if (st === 'permission') { if (await sync.grant()) toast('Sync-Datei freigegeben.'); }
  else if (st === 'conflict') sync.retryConflict();
  else if (sync.supported) syncDialog();
};

// ---------- Sync-Datei ----------
const fmt = iso => iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–';
const summary = data => `${data?.technik?.classes?.length ?? 0} Klasse(n), ${data?.sport?.groups?.length ?? 0} Sportgruppe(n)`;

function chooseVersion(raw, { title, intro }) {
  return new Promise(resolve => {
    let done = false;
    const d = dialog({ title, submit: null, cancel: 'Abbrechen', body: `<p>${intro}</p>
      <div class="menu-grid">
        <button type="button" class="menu-item" data-c="file">${icon('download')}<span><b>Stand aus der Sync-Datei übernehmen</b><small>Gespeichert ${esc(fmt(raw.savedAt))} · ${esc(summary(raw.data))}. Ersetzt die Daten auf diesem Gerät.</small></span></button>
        <button type="button" class="menu-item" data-c="local">${icon('upload')}<span><b>Stand dieses Geräts behalten</b><small>${esc(summary(store.get()))}. Überschreibt die Sync-Datei.</small></span></button>
      </div>`,
      onOpen: (el, close) => el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { done = true; close(); resolve(b.dataset.c); }) });
    d.el.addEventListener('close', () => { if (!done) resolve(null); });
  });
}

function syncDialog() {
  const st = sync.status(), on = st.state !== 'off';
  dialog({ title: 'Sync-Datei', submit: null, cancel: 'Schließen', body: on ? `
    <p>Verbunden mit <b>${esc(st.fileName)}</b>${st.lastSync ? ` · zuletzt abgeglichen ${esc(fmt(st.lastSync))}` : ''}.</p>
    ${st.state === 'error' ? `<p class="notice">${esc(st.error)}</p>` : ''}
    <p class="muted small-text">Änderungen werden automatisch in die Datei geschrieben. Beim Öffnen und alle 20 Sekunden prüft die App, ob ein anderer PC etwas geändert hat. Google Drive für Desktop überträgt die Datei zwischen deinen PCs.</p>
    <div class="menu-grid">
      <button type="button" class="menu-item" data-s="now">${icon('repeat')}<span><b>Jetzt abgleichen</b></span></button>
      <button type="button" class="menu-item" data-s="open">${icon('upload')}<span><b>Andere Sync-Datei wählen</b></span></button>
      <button type="button" class="menu-item danger" data-s="off">${icon('x')}<span><b>Verbindung trennen</b><small>Die Daten bleiben auf diesem Gerät und in der Datei erhalten.</small></span></button>
    </div>` : `
    <p>Mit einer Sync-Datei bleiben deine Daten auf allen PCs gleich – ohne Konto und ohne Server.</p>
    <ol class="help-list">
      <li><b>Auf dem ersten PC:</b> „Neue Sync-Datei anlegen“ und sie in einem Ordner speichern, den Google Drive für Desktop abgleicht, z. B. <code>KWS/1. Schule Allgemein/09 Organisation</code>.</li>
      <li><b>Auf jedem weiteren PC:</b> KlassenKompass öffnen, „Vorhandene Sync-Datei wählen“ und dieselbe Datei auswählen.</li>
      <li>Nach einem Neustart fragt der Browser manchmal noch einmal nach Erlaubnis – dann oben auf „Sync freigeben“ klicken.</li>
    </ol>
    <div class="menu-grid">
      <button type="button" class="menu-item" data-s="new">${icon('plus')}<span><b>Neue Sync-Datei anlegen</b><small>Speichert die Daten dieses Geräts in eine neue Datei.</small></span></button>
      <button type="button" class="menu-item" data-s="open">${icon('upload')}<span><b>Vorhandene Sync-Datei wählen</b><small>Für jeden weiteren PC.</small></span></button>
    </div>
    <p class="muted small-text">Funktioniert in Chrome und Edge am PC. Handy und Tablet nutzen weiter Export und Import.</p>`,
    onOpen: (el, close) => {
      const on = (k, fn) => { const b = el.querySelector(`[data-s=${k}]`); if (b) b.onclick = async () => { close(); try { await fn(); } catch (e) { if (e?.name !== 'AbortError') toast('Sync: ' + e.message, { kind: 'warn' }); } renderStatus(); }; };
      on('new', async () => { await sync.createFile(); toast('Sync-Datei angelegt. Wähle sie auf deinen anderen PCs über „Vorhandene Sync-Datei wählen“.'); });
      on('open', async () => { if (await sync.openFile(raw => chooseVersion(raw, { title: 'Welcher Stand soll gelten?', intro: 'Die gewählte Datei enthält bereits Daten.' }))) { navigate(); toast('Mit der Sync-Datei verbunden.'); } });
      on('now', async () => { await sync.syncNow(); toast('Abgeglichen.'); });
      on('off', async () => { await sync.disconnect(); toast('Sync-Datei getrennt.'); });
    } });
}

sync.init({
  changed: renderStatus,
  conflict: raw => chooseVersion(raw, { title: 'Sync-Konflikt', intro: 'Auf einem anderen PC und auf diesem Gerät wurde seit dem letzten Abgleich etwas geändert. Welcher Stand soll gelten?' }).then(c => { if (c === 'file') setTimeout(navigate); return c; }),
});

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

// App-Rahmen: Navigation, Datenmenü, Installation, Offline-Betrieb
import * as store from './store.js';
import { esc, icon, logo, dialog, confirmDialog, toast, downloadFile } from './ui.js';
import * as technik from './technik.js';
import * as sport from './sport.js';
import * as screen from './screen.js';
import * as quiz from './quiz.js';
import * as sync from './sync.js';
import * as account from './account.js';
import * as cloudimages from './cloudimages.js';
import * as images from './images.js';
import * as theme from './theme.js';

export const VERSION = '1.10.0';
const ROUTES = { '': { mod: technik, title: 'Sitzplan & Gruppen', theme: '#7055a5', cls: 't-technik' },
  sport: { mod: sport, title: 'Teams & Ranglisten', theme: '#2f6b55', cls: 't-sport' },
  quiz: { mod: quiz, title: 'Kartenquiz', theme: '#a65a2a', cls: 't-quiz' },
  bildschirm: { mod: screen, title: 'Unterrichtsbildschirm', theme: '#3d5a99', cls: 't-screen' } };

let unmount = null, installEvent = null;
store.load();

function routeKey() { const k = location.hash.replace(/^#\/?/, '').split('?')[0]; return ROUTES[k] ? k : ''; }

function shell() {
  document.getElementById('app').innerHTML = `
  <header class="topbar no-present">
    <a class="brand" href="#/"><span class="logo">${logo(26)}</span><span><b>KlassenKompass</b><small>Dein Unterricht. Gut organisiert.</small></span></a>
    <nav class="nav" aria-label="Bereiche">
      <a href="#/" data-route="">${icon('technik', 16)}<span>Technik</span></a>
      <a href="#/sport" data-route="sport">${icon('sport', 16)}<span>Sport</span></a>
      <a href="#/quiz" data-route="quiz">${icon('cards', 16)}<span>Quiz</span></a>
      <a href="#/bildschirm" data-route="bildschirm">${icon('screen', 16)}<span>Bildschirm</span></a>
    </nav>
    <div class="top-tools">
      <button type="button" class="status" id="status" title="Alle Daten bleiben auf diesem Gerät">${icon('check', 14)} Auf diesem Gerät gespeichert</button>
      <button class="btn ghost sm" id="install-btn" ${isInstalled() ? 'hidden' : ''} title="Als App installieren">${icon('install', 16)}<span class="lbl">Installieren</span></button>
      <button class="icon-btn" id="menu-btn" aria-label="Daten und Hilfe" title="Daten und Hilfe">${icon('gear')}</button>
    </div>
  </header>
  <main id="view" tabindex="-1"></main>
  <footer class="foot no-present no-print">KlassenKompass ${VERSION} · <span id="foot-store">${footStore()}</span> · <button class="link" id="foot-help">Hilfe &amp; Datenschutz</button></footer>`;
  document.getElementById('menu-btn').onclick = menuDialog;
  document.getElementById('foot-help').onclick = helpDialog;
  document.getElementById('install-btn').onclick = install;
}

function navigate() {
  const key = routeKey(), r = ROUTES[key];
  unmount?.();
  document.body.classList.remove('presenting');
  document.body.className = document.body.className.replace(/\bt-\w+\b/g, '').trim() + ' ' + r.cls;
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.route === key));
  document.title = `KlassenKompass · ${r.title}`;
  setThemeColor();
  const view = document.getElementById('view');
  unmount = r.mod.mount(view);
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
    <p class="muted">Alle Klassen, Sportgruppen, Quizfragen und der Bildschirm sind nur in diesem Browser auf diesem Gerät gespeichert (${(size / 1024).toFixed(0)} KB). ${account.enabled ? 'Mit einem Konto werden sie zusätzlich verschlüsselt auf dem Server abgelegt.' : 'Es gibt keinen Server und keine Anmeldung.'}</p>
    <div class="menu-grid">
      ${account.enabled ? `<button type="button" class="menu-item" data-m="account">${icon('user')}<span><b>${account.status().state === 'off' ? 'Konto &amp; Synchronisierung' : 'Konto · ' + esc(account.status().email)}</b><small>${account.status().state === 'off' ? 'Anmelden, um deine Daten verschlüsselt auf allen Geräten gleich zu halten – auch Handy und Tablet.' : 'Angemeldet – Daten werden verschlüsselt abgeglichen. Abmelden, Passwort ändern, Konto löschen.'}</small></span></button>` : ''}
      ${sync.supported && account.status().state === 'off' ? `<button type="button" class="menu-item" data-m="sync">${icon('repeat')}<span><b>Sync-Datei ${sync.status().state === 'off' ? 'einrichten' : '· ' + esc(sync.status().fileName)}</b><small>${sync.status().state === 'off' ? 'Daten über eine Datei im Google-Drive-Ordner zwischen deinen PCs abgleichen.' : 'Verbunden – Daten werden automatisch abgeglichen. Hier trennen oder neu wählen.'}</small></span></button>` : ''}
      <div class="menu-item theme-item">${icon('moon')}<span><b>Design</b><small>Automatisch folgt der Einstellung des Geräts. Gilt nur für dieses Gerät.</small></span>
        <div class="seg" role="group" aria-label="Design">${[['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, l]) => `<button type="button" data-theme-opt="${v}" class="${theme.get() === v ? 'on' : ''}" aria-pressed="${theme.get() === v}">${l}</button>`).join('')}</div></div>
      <button type="button" class="menu-item" data-m="export">${icon('download')}<span><b>Daten exportieren</b><small>Sicherungsdatei herunterladen – für ein anderes Gerät oder als Backup.</small></span></button>
      <button type="button" class="menu-item" data-m="import">${icon('upload')}<span><b>Daten importieren</b><small>Sicherung oder Export der früheren KlassenKompass-App einlesen.</small></span></button>
      <button type="button" class="menu-item" data-m="help">${icon('help')}<span><b>Hilfe &amp; Datenschutz</b><small>Kurzanleitung und Hinweise zur Datenspeicherung.</small></span></button>
      <button type="button" class="menu-item danger" data-m="reset">${icon('trash')}<span><b>Alles zurücksetzen</b><small>Alle Daten auf diesem Gerät löschen und mit der Demo neu beginnen.</small></span></button>
    </div>
    <input type="file" id="import-file" accept="application/json,.json" hidden>`,
    onOpen: (el, close) => {
      el.querySelector('[data-m=export]').onclick = async () => {
        // Quiz-Bilder liegen nur auf diesem Gerät und kommen deshalb mit in die Sicherung
        let text = store.exportJson();
        try { const pics = await images.pack(images.idsIn(store.get().quiz)); if (Object.keys(pics).length) { const o = JSON.parse(text); o.images = pics; text = JSON.stringify(o, null, 1); } } catch {}
        downloadFile(`KlassenKompass-Sicherung-${new Date().toISOString().slice(0, 10)}.json`, text); toast('Sicherung heruntergeladen.');
      };
      el.querySelectorAll('[data-theme-opt]').forEach(b => b.onclick = () => {
        theme.set(b.dataset.themeOpt);
        el.querySelectorAll('[data-theme-opt]').forEach(o => { const on = o === b; o.classList.toggle('on', on); o.setAttribute('aria-pressed', on); });
      });
      el.querySelector('[data-m=help]').onclick = () => { close(); helpDialog(); };
      const ab = el.querySelector('[data-m=account]'); if (ab) ab.onclick = () => { close(); accountDialog(); };
      const sb = el.querySelector('[data-m=sync]'); if (sb) sb.onclick = () => { close(); syncDialog(); };
      const file = el.querySelector('#import-file');
      el.querySelector('[data-m=import]').onclick = () => file.click();
      file.onchange = async () => { const f = file.files[0]; if (!f) return; close(); importFile(f); };
      el.querySelector('[data-m=reset]').onclick = async () => {
        close();
        if (!(await confirmDialog('Alles zurücksetzen', 'Alle Klassen, Sportgruppen, Turniere, Ranglisten, Quizfragen und -ergebnisse und der Bildschirm werden auf diesem Gerät gelöscht. Exportiere vorher eine Sicherung, wenn du die Daten noch brauchst.', 'Alles löschen'))) return;
        store.replaceState(store.freshState()); navigate(); toast('Zurückgesetzt.');
      };
    } });
}

async function importFile(f) {
  let incoming;
  try {
    if (f.size > 60 * 1024 * 1024) throw new Error('Die Datei ist zu groß.');
    const text = await f.text();
    incoming = store.parseImport(text);
    try { const n = await images.unpack(JSON.parse(text).images); if (n) { toast(`${n} Quiz-Bild(er) übernommen.`); dispatchEvent(new Event('kk-images')); } } catch {}
  } catch (e) { return toast('Import nicht möglich: ' + (e instanceof SyntaxError ? 'Die Datei ist keine gültige JSON-Datei.' : e.message), { kind: 'warn' }); }
  const nC = incoming.technik.classes.length, nG = incoming.sport.groups.length, nW = incoming.screen.widgets.length;
  const hasDemoOnly = store.get().technik.classes.every(c => c.demo) && store.get().sport.groups.every(g => g.demo) && store.get().quiz.sets.every(t => t.demo) && store.get().quiz.classes.every(c => c.demo);
  dialog({ title: 'Daten importieren', submit: 'Importieren', body: `
    <p>Gefunden: <b>${nC}</b> Klasse(n), <b>${nG}</b> Sportgruppe(n)${incoming.quiz.sets.length ? `, ${incoming.quiz.sets.length} Fragensatz/-sätze` : ''}${nW ? `, Bildschirm mit ${nW} Objekt(en)` : ''}.</p>
    <label class="check"><input type="radio" name="mode" value="merge" ${hasDemoOnly ? '' : 'checked'}> Zu den vorhandenen Daten hinzufügen <small class="muted">(gleiche Einträge werden aktualisiert)</small></label>
    <label class="check"><input type="radio" name="mode" value="replace" ${hasDemoOnly ? 'checked' : ''}> Vorhandene Daten ersetzen</label>
    ${nW ? '<label class="check"><input type="checkbox" name="screen" checked> Bildschirm übernehmen</label>' : ''}`,
    onSubmit: fd => {
      const replace = fd.get('mode') === 'replace', withScreen = fd.get('screen') === 'on';
      const base = replace ? { ...store.freshState(), technik: { classes: [], activeId: null }, sport: { groups: [], activeId: null }, quiz: { classes: [], sets: [], sessions: [], activeClassId: null, activeSetId: null } } : store.get();
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
      <li><b>Technik:</b> Klasse anlegen (nur Vornamen), Organisationsform, Tische und Gruppen wählen, unter „Einteilung anpassen“ festlegen, wer nicht in dieselbe Gruppe soll (nur im Fenster sichtbar, nicht auf der Hauptseite), und oben „Neu mischen“. „Heute krank“ gilt nur bis zum nächsten Öffnen.</li>
      <li><b>Sport:</b> Sportgruppe anlegen (Vorname, optional Klasse), Teams mischen, daraus ein Turnier erstellen – „Jeder gegen jeden“, „K.-o. mit Platzierung“ (niemand scheidet aus) oder „King of the Court“ (Auf- und Abstieg über mehrere Felder) – und Ergebnisse eintragen. Einzelranglisten addieren Punkte über mehrere Spieltage; ein fertiges Turnier lässt sich übernehmen.</li>
      <li><b>Quiz:</b> Kartenquiz – die Kinder antworten mit gedruckten Karten, ohne eigenes Gerät. Quiz-Klasse anlegen oder Namen aus Technik/Sport übernehmen, Antwortkarten der Klasse drucken (mit Nummer und Vorname zum Austeilen), Fragensatz anlegen (Fragen und Antworten auch mit Bild), fehlende Kinder als „Fehlt heute“ markieren, „Quiz starten“ und am Beamer zeigen. Die Kinder halten ihre Karte mit der gewählten Antwort nach oben; das Handy scannt die ganze Klasse auf einmal. Mit Konto: Quiz am PC starten, auf dem Handy (gleiches Konto) Quiz → „Karten scannen“. Ohne Konto: Quiz auf dem Gerät mit Kamera starten und „Hier scannen“. Bilder im Quiz: Mit Konto sind sie auf allen deinen Geräten da (einmal geladen, danach auch offline). Ohne Konto bleiben sie auf dem Gerät, auf dem sie eingefügt wurden, und kommen über „Daten exportieren/importieren“ oder die Sync-Datei auf andere Geräte.</li>
      <li><b>Bildschirm:</b> Timer, Stoppuhren, Intervalltimer und QR-Codes frei anordnen und groß zeigen.</li>
      <li><b>Dark Mode:</b> Zahnrad → „Design“: Automatisch (wie das Gerät), Hell oder Dunkel. Gilt nur für das jeweilige Gerät; Ausdrucke und Antwortkarten bleiben immer hell.</li>
      <li><b>Drucken:</b> Sitzplan, Teams, Turnier und Ranglisten über „Drucken / PDF“ ausdrucken oder als PDF speichern.</li>
      <li><b>Konto (alle Geräte):</b> Zahnrad → „Konto &amp; Synchronisierung“. Mit E-Mail und Passwort anmelden; die Daten werden auf dem Gerät verschlüsselt und auf allen angemeldeten Geräten gleich gehalten. Passwort vergessen = Daten im Konto verloren.</li>
      <li><b>Ohne Konto, mehrere PCs:</b> Über Zahnrad → „Sync-Datei einrichten“ eine Datei im Google-Drive-Ordner anlegen und auf den anderen PCs dieselbe Datei wählen. Die App gleicht dann automatisch ab (Chrome/Edge).</li>
      <li><b>Als App nutzen:</b> Oben rechts auf ${icon('install', 14)} tippen – dort steht die Anleitung für iPhone, Android und PC. Danach funktioniert KlassenKompass auch ohne Internet.</li>
    </ul>
    <h3>Datenschutz</h3>
    <ul class="help-list">
      <li><b>Ohne Konto</b> bleiben alle Eingaben ausschließlich im Speicher dieses Browsers auf diesem Gerät.</li>
      <li><b>Mit Konto</b> werden die Daten vor dem Hochladen auf dem Gerät mit deinem Passwort verschlüsselt (AES-256). Auf dem Server (Supabase, Rechenzentrum Frankfurt) liegt nur ein unlesbarer Datenblock und deine E-Mail-Adresse. Weder der Betreiber noch Supabase können die Namen lesen.</li>
      <li>Keine Werbung, keine Analyse, keine externen Skripte.</li>
      <li>Bitte nur Vornamen (und bei Sport die Klasse) eintragen. Krankmeldungen werden nicht gespeichert.</li>
      <li><b>Kartenquiz:</b> Die Kamera wird nur während des Scannens benutzt; die Bilder werden direkt auf dem Gerät ausgewertet und weder gespeichert noch übertragen. Gespeichert werden nur die Antworten (Buchstaben) je Kind. Das sind Leistungsdaten – Ergebnisse, die du nicht mehr brauchst, unter „Ergebnisse“ löschen. „Fehlt heute“ wird im Ergebnis nur als „fehlte“ vermerkt, ohne Grund. Bilder zu Quizfragen werden im Browser des Geräts gespeichert; mit Konto zusätzlich auf dem Gerät verschlüsselt im Dateispeicher von Supabase. Bilder, die in keiner Frage und keinem Ergebnis mehr vorkommen, löscht die App dort nach einigen Tagen automatisch. Lade keine Fotos von Kindern hoch.</li>
      <li>Ohne Konto sehen andere Geräte deine Daten nicht. Zum Übertragen „Daten exportieren“ und auf dem anderen Gerät „Daten importieren“ nutzen. Die Sicherungsdatei enthält die Vornamen – bitte entsprechend sorgfältig aufbewahren.</li>
      <li>Wenn der Browserverlauf bzw. die Websitedaten gelöscht werden, sind auch die Daten weg. Exportiere daher regelmäßig eine Sicherung.</li>
    </ul>
    <h3>Datenschutzhinweise im Einzelnen</h3>
    <ul class="help-list">
      <li><b>Welche Daten:</b> Vornamen, optional Klasse (Sport), Klassen- und Gruppennamen, Sitzpläne, Teams, Ergebnisse, Quizfragen und Quizantworten je Kind sowie Einstellungen. Mit Konto zusätzlich die E-Mail-Adresse.</li>
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
      <ul class="tour-list"><li>${icon('technik')}<span><b>Technik</b> – Klassen anlegen, Sitzplan und Gruppen per Zufall verteilen.</span></li>
      <li>${icon('sport')}<span><b>Sport</b> – Teams mischen, Turniere (jeder gegen jeden, K.-o., King of the Court) und Ranglisten.</span></li>
      <li>${icon('cards')}<span><b>Quiz</b> – Kartenquiz: Kinder heben Antwortkarten, das Handy scannt die ganze Klasse.</span></li>
      <li>${icon('screen')}<span><b>Bildschirm</b> – Timer, Stoppuhren, Intervalltimer und QR-Codes groß zeigen.</span></li></ul>
      <p class="muted small-text">Zum Ausprobieren sind eine Demoklasse und eine Demogruppe mit erfundenen Namen angelegt. Du kannst sie jederzeit löschen.</p>` },
    { ic: icon('check', 30), title: 'Deine Daten', html: `<ul class="help-list">
      <li>Bitte <b>nur Vornamen</b> eintragen (bei Sport optional die Klasse).</li>
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
function renderStatus() {
  const el = document.getElementById('status'); if (!el) return;
  const err = store.storageError(), ac = account.status(), st = ac.state !== 'off' ? { ...ac, fileName: ac.email } : sync.status();
  const time = st.lastSync ? new Date(st.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
  let cls = '', html, title;
  if (err) { cls = 'warn attn'; html = `${icon('x', 14)} Nicht gespeichert`; title = err; }
  else if (st.state === 'permission') { cls = 'warn attn'; html = `${icon('repeat', 14)} Sync freigeben`; title = 'Der Browser braucht deine Freigabe, um die Sync-Datei zu lesen und zu schreiben. Hier klicken.'; }
  else if (st.state === 'conflict') { cls = 'warn attn'; html = `${icon('repeat', 14)} Sync-Konflikt`; title = 'Hier klicken, um zu entscheiden, welcher Stand gilt.'; }
  else if (st.state === 'error') { cls = 'warn attn'; html = `${icon('x', 14)} Sync-Fehler`; title = st.error + ' – Hier klicken für die Sync-Einstellungen.'; }
  else if (st.state === 'login') { cls = 'warn attn'; html = `${icon('user', 14)} Anmelden`; title = st.error || 'Bitte erneut anmelden.'; }
  else if (st.state === 'offline') { html = `${icon('repeat', 14)} Offline – wird später abgeglichen`; title = 'Änderungen bleiben auf diesem Gerät und werden abgeglichen, sobald wieder Internet da ist.'; }
  else if (st.state === 'ok') { html = `${icon('repeat', 14)} ${st.dirty ? 'Wird abgeglichen …' : 'Synchronisiert' + (time ? ' · ' + time : '')}`; title = (ac.state !== 'off' ? 'Konto: ' : 'Sync-Datei: ') + st.fileName; }
  else { html = `${icon('check', 14)} Auf diesem Gerät gespeichert`; title = 'Alle Daten bleiben auf diesem Gerät'; }
  el.className = 'status ' + cls; el.innerHTML = html; el.title = title;
  const fs = document.getElementById('foot-store'); if (fs && fs.textContent !== footStore()) fs.textContent = footStore();
}
setInterval(renderStatus, 2000);
document.getElementById('status').onclick = async () => {
  const ast = account.status().state;
  if (ast !== 'off') { if (ast === 'conflict') account.retryConflict(); else accountDialog(); return; }
  const st = sync.status().state;
  if (st === 'permission') { if (await sync.grant()) toast('Sync-Datei freigegeben.'); }
  else if (st === 'conflict') sync.retryConflict();
  else if (account.enabled) accountDialog();
  else if (sync.supported) syncDialog();
};

// ---------- Sync-Datei ----------
const fmt = iso => iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–';
const summary = data => `${data?.technik?.classes?.length ?? 0} Klasse(n), ${data?.sport?.groups?.length ?? 0} Sportgruppe(n), ${data?.quiz?.sets?.length ?? 0} Fragensatz/-sätze`;

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
          if (sync.status().state !== 'off') await sync.disconnect();
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

sync.init({
  changed: renderStatus,
  conflict: raw => chooseVersion(raw, { title: 'Sync-Konflikt', intro: 'Auf einem anderen PC und auf diesem Gerät wurde seit dem letzten Abgleich etwas geändert. Welcher Stand soll gelten?' }).then(c => { if (c === 'file') setTimeout(navigate); return c; }),
});

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

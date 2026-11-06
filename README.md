# KlassenKompass

Web-App (PWA) für den Unterricht: **Sitzplan & Gruppen** (Technik), **Teams, Turniere & Ranglisten** (Sport) und ein **Unterrichtsbildschirm** mit Timern, Stoppuhren, Intervalltimer und QR-Codes.

- Läuft im Browser auf PC, Tablet und Handy und lässt sich als App installieren.
- Handy und Tablett: große Tippflächen, kein Zoom beim Antippen von Feldern, Dialoge von unten. Im Bildschirm stehen die Objekte auf dem Handy untereinander („Ansicht: Alles anzeigen“ zeigt die freie Anordnung); am Tablett lassen sie sich mit dem Finger an der Kopfzeile verschieben.
- Funktioniert nach dem ersten Öffnen auch ohne Internet.
- **Ohne Konto:** Alle Daten bleiben im Browser des jeweiligen Geräts. Übertragen und Sichern über „Daten exportieren / importieren“ (Zahnrad oben rechts).
- **Mit Konto (optional):** Zahnrad → „Konto & Synchronisierung“. Die Daten werden auf dem Gerät mit dem eigenen Passwort verschlüsselt (AES-256-GCM, Schlüssel per PBKDF2 aus dem Passwort) und in Supabase (Frankfurt) gespeichert. Der Server sieht weder Passwort noch Namen. Passwort vergessen = Daten im Konto verloren.
- Keine externen Bibliotheken, keine Analyse, keine Werbung. QR-Codes werden direkt im Browser erzeugt.
- Breitbild: Ab etwa 1800 px Breite nutzt die App mehr Platz, ab 2600 px (z. B. 3440 × 1440) werden Schrift und Sitzplätze größer. Im Bildschirm lässt sich das Format 21:9 wählen.
- Sitzplan: Jeder Tisch trägt Farbe und Nummer seiner Gruppe (G1, G2 …), darüber steht eine Legende.

## Nutzen

Adresse: **https://wunderlichm.github.io/klassenkompass/**

Einfach den Link öffnen. Beim ersten Start erklärt eine kurze Einführung die App (später wieder über „Hilfe“). Der Knopf „Installieren“ oben rechts zeigt die Anleitung für iPhone/iPad, Android und PC bzw. startet die Installation direkt. Solange ein Timer, eine Stoppuhr oder ein Intervalltimer läuft, bleibt der Bildschirm des Geräts an.

## Technik der Konten

- `js/config.js`: Supabase-URL und öffentlicher Publishable Key.
- `supabase/setup.sql`: Tabelle `vaults` (ein verschlüsselter Block je Konto, Row Level Security), Funktion `save_vault` mit Versionsprüfung, `delete_my_account`, `ping`.
- In Supabase ist „Confirm email“ ausgeschaltet (der kostenlose Mailversand erreicht keine fremden Adressen).
- `.github/workflows/keepalive.yml` ruft alle drei Tage `ping` auf, damit das kostenlose Projekt nicht pausiert.

## Mehrere PCs abgleichen ohne Konto (Sync-Datei)

Zahnrad → „Sync-Datei einrichten“ → „Neue Sync-Datei anlegen“ und die Datei in einem Ordner speichern, den Google Drive für Desktop (oder OneDrive/Dropbox) abgleicht. Auf jedem weiteren PC „Vorhandene Sync-Datei wählen“. Änderungen werden automatisch geschrieben; beim Öffnen und alle 20 Sekunden prüft die App, ob ein anderer PC etwas geändert hat. Haben zwei PCs gleichzeitig geändert, fragt die App, welcher Stand gilt. Funktioniert in Chrome und Edge am PC; Handy und Tablet nutzen Export/Import.

## Veröffentlichen mit GitHub Pages

1. Neues öffentliches Repository anlegen, z. B. `klassenkompass`.
2. Alle Dateien dieses Ordners hochladen (`index.html`, `styles.css`, `sw.js`, `manifest.webmanifest`, `.nojekyll`, Ordner `js` und `icons`).
3. *Settings → Pages → Build and deployment → Source: Deploy from a branch*, Branch `main`, Ordner `/ (root)` → *Save*.
4. Nach etwa einer Minute ist die App unter `https://<benutzername>.github.io/klassenkompass/` erreichbar.

## Aktualisieren

Geänderte Dateien hochladen und in `sw.js` die Zeile `const VERSION = 'kk-…'` hochzählen. Geöffnete Apps zeigen dann „Eine neue Version ist bereit“.

## Datenschutz

Die ausführlichen Datenschutzhinweise stehen in der App unter „Hilfe & Datenschutz“. Für die Nutzung mit Schülerdaten vorher Schulleitung bzw. Datenschutzbeauftragte der Schule einbeziehen (BW: VwV Datenschutz an öffentlichen Schulen). Mit Supabase den Vertrag zur Auftragsverarbeitung (DPA) abschließen.


Bitte nur Vornamen (und bei Sport die Klasse) eintragen. Krankmeldungen werden nicht gespeichert. Die Sicherungsdatei enthält die Vornamen und sollte entsprechend sorgfältig aufbewahrt werden.

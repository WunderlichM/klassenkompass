# KlassenKompass

Web-App (PWA) für den Unterricht: **Sitzplan & Gruppen** (Technik), **Teams, Turniere & Ranglisten** (Sport) und ein **Unterrichtsbildschirm** mit Timern, Stoppuhren, Intervalltimer und QR-Codes.

- Läuft im Browser auf PC, Tablet und Handy und lässt sich als App installieren.
- Funktioniert nach dem ersten Öffnen auch ohne Internet.
- **Keine Anmeldung, kein Server:** Alle Daten bleiben im Browser des jeweiligen Geräts. Übertragen und Sichern über „Daten exportieren / importieren“ (Zahnrad oben rechts).
- Keine externen Bibliotheken, keine Analyse, keine Werbung. QR-Codes werden direkt im Browser erzeugt.

## Nutzen

Einfach den Link öffnen. Im Browser über „Installieren“ (Chrome/Edge) bzw. „Zum Home-Bildschirm“ (Safari) als App hinzufügen.

## Veröffentlichen mit GitHub Pages

1. Neues öffentliches Repository anlegen, z. B. `klassenkompass`.
2. Alle Dateien dieses Ordners hochladen (`index.html`, `styles.css`, `sw.js`, `manifest.webmanifest`, `.nojekyll`, Ordner `js` und `icons`).
3. *Settings → Pages → Build and deployment → Source: Deploy from a branch*, Branch `main`, Ordner `/ (root)` → *Save*.
4. Nach etwa einer Minute ist die App unter `https://<benutzername>.github.io/klassenkompass/` erreichbar.

## Aktualisieren

Geänderte Dateien hochladen und in `sw.js` die Zeile `const VERSION = 'kk-…'` hochzählen. Geöffnete Apps zeigen dann „Eine neue Version ist bereit“.

## Datenschutz

Bitte nur Vornamen (und bei Sport die Klasse) eintragen. Krankmeldungen werden nicht gespeichert. Die Sicherungsdatei enthält die Vornamen und sollte entsprechend sorgfältig aufbewahrt werden.

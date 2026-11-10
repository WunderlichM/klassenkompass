# KlassenKompass

Web-App (PWA) für den Unterricht: **Sitzplan & Gruppen** (Technik), **Teams, Turniere, Ranglisten & Hallenpläne** (Sport), ein **Kartenquiz** (Quiz) und ein **Unterrichtsbildschirm** mit Timern, Stoppuhren, Intervalltimer, QR-Codes und Hallenplänen.

- Läuft im Browser auf PC, Tablet und Handy und lässt sich als App installieren.
- Handy und Tablett: große Tippflächen, kein Zoom beim Antippen von Feldern, Dialoge von unten. Im Bildschirm stehen die Objekte auf dem Handy immer groß untereinander (unabhängig von der Ansicht-Einstellung des PCs); „Große Ansicht“ füllt im Hochformat den Bildschirm (ein Objekt ganz, mehrere je mindestens halbe Höhe), im Querformat stehen sie nebeneinander. Am Tablett lassen sie sich mit dem Finger an der Kopfzeile verschieben.
- Funktioniert nach dem ersten Öffnen auch ohne Internet.
- **Ohne Konto:** Alle Daten bleiben im Browser des jeweiligen Geräts. Übertragen und Sichern über „Daten exportieren / importieren“ (Zahnrad oben rechts). Die Sicherungsdatei ist immer mit einem eigenen Passwort verschlüsselt (AES-256-GCM, PBKDF2 mit 600 000 Durchläufen, `js/backup.js`); ältere unverschlüsselte Sicherungen lassen sich weiterhin importieren.
- **Mit Konto (optional):** Zahnrad → „Konto & Synchronisierung“. Die Daten werden auf dem Gerät mit dem eigenen Passwort verschlüsselt (AES-256-GCM, Schlüssel per PBKDF2 aus dem Passwort) und in Supabase (Frankfurt) gespeichert. Der Server sieht weder Passwort noch Namen. Passwort vergessen = Daten im Konto verloren.
- Keine externen Bibliotheken, keine Analyse, keine Werbung. QR-Codes werden direkt im Browser erzeugt.
- Breitbild: Ab etwa 1800 px Breite nutzt die App mehr Platz, ab 2600 px (z. B. 3440 × 1440) werden Schrift und Sitzplätze größer. Im Bildschirm stellt sich das Format selbst ein: 16:9, an Bildschirmen ab etwa 2:1 (z. B. 3440 × 1440) 21:9. Objekte, die an einem Breitbildschirm weiter rechts stehen, bleiben auch an 16:9-Geräten sichtbar (die Bühne wird dann breiter).
- Bildschirm „Ansicht“ (Automatisch, Alles anzeigen, 50–150 %) gilt nur für das jeweilige Gerät (localStorage `klassenkompass.screenZoom`) und wird nicht abgeglichen; Standard ist „Automatisch“.
- Objekte im Bildschirm passen ihren Inhalt (Ziffern, Kreis, Ei, QR-Code) an die verfügbare Höhe an – auch mit den größeren Tippflächen am Tablett. Am Tablett hochkant stehen die Objekte in der großen Ansicht groß untereinander; quer wird der Sicherheitsabstand (Home-Balken) berücksichtigt.
- **Musik bei Signalen** (Zahnrad, gilt je Gerät, `klassenkompass.musicMode`): Läuft auf demselben Gerät Musik (Spotify, YouTube, auch über Bluetooth), kann die App sie bei Signalen leiser stellen (`navigator.audioSession.type = 'transient'`) oder kurz anhalten (`'transient-solo'`). Nach dem letzten Ton (1,3 s Nachlauf, damit 3-2-1 und Phasenton im Intervalltimer ein Block sind) wird der Audio-Kontext angehalten und die Musik freigegeben. Timer-Endsignale werden in diesem Modus erst kurz vor dem Ende eingeschaltet (nicht im Voraus auf der Audio-Uhr). Funktioniert nur, wo der Browser die Audio-Sitzung kennt (Safari/iPadOS ab 16.4); im Dialog lassen sich die Varianten „Jetzt“ und „In 5 s“ testen. Die zuletzt getestete Variante bleibt eingestellt.
- Dark Mode: Zahnrad → „Design“ → Automatisch (folgt dem Gerät), Hell oder Dunkel. Die Wahl gilt nur für das jeweilige Gerät (`js/theme.js`, localStorage) und wird nicht abgeglichen. Druck, Antwortkarten und QR-Codes bleiben immer hell.
- Sitzplan: Jeder Tisch trägt Farbe und Nummer seiner Gruppe (G1, G2 …), darüber steht eine Legende.

## Nutzen

Adresse: **https://wunderlichm.github.io/klassenkompass/**

Einfach den Link öffnen. Beim ersten Start erklärt eine kurze Einführung die App (später wieder über „Hilfe“). Der Knopf „Installieren“ oben rechts zeigt die Anleitung für iPhone/iPad, Android und PC bzw. startet die Installation direkt. Solange ein Timer, eine Stoppuhr oder ein Intervalltimer läuft oder ein Kartenquiz (inkl. Podium) angezeigt wird, bleibt der Bildschirm des Geräts an.

## Kartenquiz

- Antwortkarten unter Quiz → „Karten drucken“ (1, 2 oder 4 pro A4-Seite). Voreingestellt sind nur die Karten der gewählten Klasse, mit Nummer und Vorname oben links zum Austeilen; leere Karten (alle 40 oder ein Bereich) unter „Weitere“. Jede Karte trägt ein eigenes 7 × 7-Muster; die Kante, die oben ist, ist die Antwort (A–D).
- Beamer-Ansicht: Jede Antwort hat eine eigene Farbe (A rot, B blau, C gelb, D lila – auch in der Fragenliste). Ein Ring zeigt, wie viele Kinder geantwortet haben; Punkte oben zeigen den Fortschritt im Fragensatz. Beim Auflösen füllt sich jede Antwort mit ihrem Anteil (Anzahl und Prozent), die richtige wird grün umrandet und abgehakt. Neu erfasste Karten „springen“ kurz in der Namensliste; nach dem Podium fällt Konfetti. Bei „Bewegung reduzieren“ im Betriebssystem entfallen die Animationen.
- „Fehlt heute“: vor dem Start bei „Klasse & Karten“ (Personensymbol) oder im Quiz am Namen. Fehlende Kinder brauchen keine Antwort fürs automatische Auflösen; im Ergebnis und in der CSV steht „fehlte“ (ohne Grund). Die Auswahl vor dem Start gilt bis zum nächsten Öffnen der App.
- Bilder zu Fragen und Antworten (Datei, Kamera oder Strg+V). Sie werden auf höchstens 1280 px verkleinert (WebP/JPEG) und in IndexedDB des Geräts gespeichert (`js/images.js`); Fragen enthalten nur die Kennung `img_…` (Prüfsumme des Bildes). Mit Konto werden sie zusätzlich verschlüsselt im Supabase-Dateispeicher (Bucket `quiz-images`, je Konto ein Ordner) abgelegt; fehlt ein Bild auf einem Gerät, holt die App es von dort und speichert es lokal (`js/cloudimages.js`). Bilder, die in keiner Frage und keinem Ergebnis mehr vorkommen, löscht die App dort automatisch (höchstens einmal am Tag, nur direkt nach einem vollständigen Abgleich, frühestens 2 Tage nach dem Hochladen). Ohne Konto kommen Bilder über „Daten exportieren“ auf andere Geräte. Fehlt ein Bild, erscheint ein Platzhalter.
- Die Erkennung (`js/detect.js`) läuft vollständig im Browser, ohne Bibliothek: örtlicher Schwellwert, zusammenhängende Flächen, Viereck, Raster abtasten, Code mit Prüfabstand (`js/cards.js`, mindestens 7 Felder Unterschied auch gedreht). Kamerabilder werden nicht gespeichert.
- Ohne Konto: Quiz auf dem Gerät mit Kamera starten und „Hier scannen“.
- Mit Konto: Quiz am PC starten (Beamer), auf dem Handy mit demselben Konto Quiz → „Karten scannen“. Beide Geräte tauschen verschlüsselt Frage, Kartennummern und Antwortbuchstaben über die Tabelle `live_quiz` aus (Abfrage etwa jede Sekunde).
- **Fragensätze importieren / exportieren (seit 1.14.0):** Pfeil-Symbol neben „Neuer Fragensatz“ liest eine `.json`-Datei oder eingefügten Text; „Exportieren“ beim Bearbeiten eines Fragensatzes schreibt eine solche Datei. Format: `{ "app": "KlassenKompass", "kind": "quiz-sets", "v": 1, "sets": [ { "title": "…", "questions": [ { "text": "…", "options": ["…", "…"], "correct": "A" } ] } ] }` – `correct` ist ein Buchstabe A–D, eine Zahl ab 0 oder `null` (Umfrage). Importierte Sätze kommen dazu, nichts wird überschrieben; Bilder sind nicht enthalten.
- **Decknamen (seit 1.14.0):** Unter „So geht’s“ öffnet der unauffällige Link „Ansicht“ die Einstellung „Decknamen verwenden“. Dann zeigt das Quiz keine Klassenlisten: Es gibt nur die Anzahl der Kinder, jede Karte trägt einen festen Fantasienamen (Adler, Biber, …) – auf der gedruckten Karte, im Quiz, im Ergebnis und in der CSV. Klassen und frühere Ergebnisse bleiben gespeichert und sind ausgeblendet, bis der Haken wieder entfernt wird (`quiz.alias`). Technik und Sport sind davon nicht betroffen.

## Hallenplan (Sport)

- Sport → „Hallenplan“: schräg von oben gezeichnete Halle (Schrägansicht, schematisch ohne Maße), mehrere Pläne (Neu mit Vorlage „drei/zwei Bereiche“ oder leer, Umbenennen, Kopie, Löschen), Untergrund mit/ohne Mittellinie oder ohne Fläche.
- Elemente aus der Leiste in die Halle ziehen oder antippen (dann in die Mitte): Bereich (mit Gruppenname und Farbe), Hütchen (Nummer), Kind, Ball, Laufweg (blau), Weg nach Freigabe (orange gestrichelt), Sperrfläche X, Schild (S, LK), Text. Ausgewählte Elemente: verschieben, Größe am Griff unten rechts, drehen am Griff oben, Beschriftung, Farbe, Kopie, vorn/hinten, löschen; Rückgängig/Wiederholen (Strg+Z/Strg+Y), Pfeiltasten, Entf.
- **Geräte (seit 1.13.0)**: eigene, in der App gezeichnete Symbole (`js/hallgear.js`), ohne Bilder-Hinzufügen auf jedem Gerät sofort da, aufklappbar nach Gruppen: *Matten, Kästen, Bänke* (Turnmatte, Matte stehend, Weichboden, Mattenwagen, Kasten 2–6 Teile, Kleinkasten, Kastenteil, Bank kurz/lang, Bank umgedreht), *Sprossenwand, Barren, Reck* (Sprossenwand 1/2 Felder, Leiter, Barren, Stufenbarren, Reck, Reckpfosten), *Hängen, Springen* (Basketballkorb, Kletterseile, Turnringe, Sprungbrett, Minitrampolin, Turnbock, Sprungpferd, Hochsprungständer mit Latte, Hürde), *Balken, Netze, Tore* (Schwebebalken, Balken niedrig, Netz mit Pfosten, Tor, Kleintor), *Kleingeräte* (Hütchen, Markierteller, Reifen, Slalomstange, Gymnastikball mit wählbarer Farbe; Springseil, Schläger, Ballwagen, Fuß-, Basket-, Volley- und Tennisball) und *Raum* (Tischtennisplatte, Bande, Polsterrolle, Trennwand, Tür, Lautsprecher, Tafel). „Ansicht wechseln“ schaltet quer/längs bzw. frontal/seitlich (stehend/liegend). Jedes Gerät ist aus einfachen Körpern in Metern beschrieben und wird in derselben Schräge wie die Hallenfläche gezeichnet (Tiefe nach hinten mit Versatz K = 0,31, sichtbare Vorder- und rechte Seite); dadurch stimmen die Größenverhältnisse (Bank lang ≈ 340, Turnmatte ≈ 245 × 80, Kasten ≈ 130, Hütchen ≈ 50). Bank, Matten, Balken, Netz, Bande und Trennwand lassen sich quer am Griff verlängern. Im Plan steht `{ kind: 'gear', gear, view }`; die einfachen Geräte bis 1.12 (`bench`, `mat`, `softmat`, `box`, `goal`) werden beim Laden auf Bank lang, Turnmatte, Weichboden, Kasten 4 Teile und Tor abgebildet. Ältere App-Fassungen kennen `gear` nicht – nach dem Update alle Geräte einmal öffnen und „Neue Version“ übernehmen.
- **Eigene Bilder** (optional, „Eigene Bilder hinzufügen“, mehrere Dateien auf einmal): Dateinamen wie `V02-035 - Bank lang - quer.png` werden gelesen (Gruppe nach Kennung, Name, Ansicht); Ansichten desselben Geräts (quer/längs/…) wechselt „Ansicht wechseln“. Kleine PNG/WebP werden unverändert gespeichert (Transparenz bleibt), größere verkleinert. Die Bilder liegen wie die Quiz-Bilder in IndexedDB und – mit Konto – verschlüsselt im Dateispeicher des Kontos (`js/images.js`, `js/cloudimages.js`); im Zustand stehen nur Kennungen (`sport.hallLib`, `sport.halls[].items[].img`). **Fremde Grafiken (z. B. Vlamingo/WIMASU) gehören nicht in dieses öffentliche Repository** (Vervielfältigung und Veröffentlichung vorbehalten); die Gerätesymbole der App sind eigene Zeichnungen.
- „Ansicht vergrößern“ zeigt nur die Zeichnung, „Drucken / PDF“ druckt A4 quer mit Titel und dem Hinweis „Schematisch · Abstände und nutzbaren Raum vor Ort prüfen“.
- Im Bildschirm gibt es das Objekt „Hallenplan“ (Plan am Zahnrad wählen), z. B. neben dem Intervalltimer.
- Das automatische Aufräumen der Bilder im Konto berücksichtigt Quiz und Hallenpläne (`images.usedIds`). Ältere App-Fassungen kennen die Hallenpläne nicht: Nach dem Update alle Geräte einmal öffnen und „Neue Version“ übernehmen.

## Turniere (Sport)

- **Jeder gegen jeden:** Spielplan nach der Kreismethode, Punkte für Sieg/Unentschieden/Niederlage einstellbar.
- **K.-o. mit Platzierung:** Die erste Runde wird ausgelost, die nächste Runde entsteht, sobald alle Ergebnisse eingetragen sind. Niemand scheidet aus: Verlierer spielen um die hinteren Plätze. Einstellbar: alle Plätze ausspielen oder nur Finale und Spiel um Platz 3 (die übrigen Teams teilen sich ihren Platz). Bei Gleichstand wird der Sieger ausgewählt; ungerade Teamzahlen erhalten Freilose. Für die Einzelrangliste erhält Platz 1 so viele Punkte, wie Teams teilnehmen, jeder weitere Platz einen weniger.
- **King of the Court:** Alle Teams spielen gleichzeitig auf Teamzahl ÷ 2 Feldern; Feld 1 ist das Königsfeld. Sieger steigen ein Feld auf, Verlierer ein Feld ab; bei ungerader Teamzahl setzt je Runde ein Team aus. Punkte je Sieg hängen vom Feld ab (voreingestellt Feld 1 = höchste Punktzahl), Rundenzahl einstellbar. Bei Punktgleichheit zählt das bessere Feld.
- Wird ein früheres Ergebnis geändert, passt die App die folgenden Paarungen an und fragt vorher, falls dadurch eingetragene Ergebnisse wegfallen.

## Technik der Konten

- `js/config.js`: Supabase-URL und öffentlicher Publishable Key.
- Bucket `quiz-images` enthält seit 1.12.0 auch die Hallenplan-Bilder (Name bleibt, damit nichts umgezogen werden muss).
- `supabase/setup.sql`: Tabelle `vaults` (ein verschlüsselter Block je Konto, Row Level Security), Funktion `save_vault` mit Versionsprüfung, `delete_my_account`, `ping`; ab 1.6.0 zusätzlich Tabelle `live_quiz` mit `set_live_quiz` und `clear_live_quiz` für das Live-Quiz; ab 1.8.0 der private Bucket `quiz-images` (höchstens 3 MB je Datei, nur verschlüsselte Daten) mit Zugriff nur auf den eigenen Ordner und die Tabelle `image_keys` (Bilder-Schlüssel je Konto, mit dem Passwort-Schlüssel verschlüsselt, damit ein Passwortwechsel die Bilder nicht neu verschlüsseln muss). Das Skript kann gefahrlos erneut ausgeführt werden.
- In Supabase ist „Confirm email“ ausgeschaltet (der kostenlose Mailversand erreicht keine fremden Adressen).
- `.github/workflows/keepalive.yml` ruft alle drei Tage `ping` auf, damit das kostenlose Projekt nicht pausiert.

## Keine Sync-Datei mehr (ab 1.11.0)

Der frühere Abgleich über eine Sync-Datei im Google-Drive-Ordner ist entfernt: Die Datei enthielt die Namen im Klartext in einem Cloud-Ordner, was für Schülerdaten (in BW laut Kultusministerium) nicht zulässig ist. Mehrere Geräte gleichen sich über das Konto ab oder über die verschlüsselte Sicherung („Daten exportieren / importieren“). Die App entfernt den gespeicherten Dateizugriff beim ersten Start und weist einmal darauf hin; die alte Sync-Datei selbst sollte von Hand gelöscht werden.

## Veröffentlichen mit GitHub Pages

1. Neues öffentliches Repository anlegen, z. B. `klassenkompass`.
2. Alle Dateien dieses Ordners hochladen (`index.html`, `styles.css`, `sw.js`, `manifest.webmanifest`, `.nojekyll`, Ordner `js` und `icons`).
3. *Settings → Pages → Build and deployment → Source: Deploy from a branch*, Branch `main`, Ordner `/ (root)` → *Save*.
4. Nach etwa einer Minute ist die App unter `https://<benutzername>.github.io/klassenkompass/` erreichbar.

## Aktualisieren

Geänderte Dateien hochladen und in `sw.js` die Zeile `const VERSION = 'kk-…'` hochzählen. Geöffnete Apps zeigen dann „Eine neue Version ist bereit“.

## Datenschutz

Die ausführlichen Datenschutzhinweise stehen in der App unter „Hilfe & Datenschutz“. Für die Nutzung mit Schülerdaten vorher Schulleitung bzw. Datenschutzbeauftragte der Schule einbeziehen (BW: VwV Datenschutz an öffentlichen Schulen). Mit Supabase den Vertrag zur Auftragsverarbeitung (DPA) abschließen.


Bitte nur Vornamen (und bei Sport die Klasse) eintragen. Krankmeldungen werden nicht gespeichert. Die Sicherungsdatei ist verschlüsselt; für Schülerdaten trotzdem nicht in Cloud-Ordnern (Google Drive, OneDrive, Dropbox) ablegen, sondern auf dem eigenen Gerät oder einem verschlüsselten USB-Stick.

# Import-Format (seit 2.4.0)

Eine JSON-Datei (oder eingefügter Text) kann **Lerngruppen**, **Fragensätze** und **Hallenpläne** enthalten – einzeln oder gemeinsam. Alles wird in der App über **Zahnrad → Importieren** eingelesen (auch: Pfeil im Quiz / in den Hallenplänen, Datei ins Fenster ziehen, Strg+V). Vor dem Übernehmen zeigt die Vorschau, was erkannt wurde.

Prüfen ohne App: `node tools/import-check.mjs datei.json` (gleiche Regeln wie die App, Node ab 18).

## Gemeinsame Datei

```json
{
  "app": "KlassenKompass", "kind": "bundle", "v": 1,
  "groups": [ … ],
  "sets":   [ … ],
  "plans":  [ … ]
}
```

Alle drei Listen sind optional. Ebenfalls erlaubt: nur `{ "sets": [ … ] }`, nur `{ "plans": [ … ] }`, nur `{ "groups": [ … ] }`, eine nackte Liste oder ein einzelnes Objekt (erkannt an `questions`, `items` bzw. `students`). `app`, `kind` und `v` dürfen fehlen. Ein Markdown-Codeblock um das JSON, Text davor oder danach und überzählige Kommas vor `}` oder `]` stören nicht.

Reihenfolge beim Import: erst Lerngruppen, dann Fragensätze, dann Hallenpläne – ein Fragensatz kann sich deshalb auf die Quiz-Klasse einer Lerngruppe aus derselben Datei beziehen.

## Lerngruppen (`groups`)

```json
{ "name": "7ab Technik", "subject": "Technik", "quiz": true,
  "students": ["Anna", "Ben, 7b", { "name": "Cem", "class": "7a" }] }
```

| Feld | Bedeutung |
|---|---|
| `name` | Name der Lerngruppe (bis 60 Zeichen). Fehlt er, fragt der Dialog danach. |
| `subject` | Fach, z. B. `Technik`, `Sport`, `Informatik` (Standard: Technik). `Sport` öffnet mit Teams, alles andere mit der Sitzordnung. |
| `students` | Liste, höchstens 80. Je Kind ein Text (`"Anna"`, `"Ben, 7b"`, `"Ben (7b)"`) oder `{ "name", "class" }`. **Nur Vornamen.** |
| `quiz` | `true`: Quiz-Klasse mit gleicher Kennung und Kinderzahl (höchstens 40 Karten) anlegen. |

- Gibt es eine Lerngruppe mit gleichem Namen (Groß-/Kleinschreibung egal), kommen nur **fehlende Kinder** dazu. Nichts wird gelöscht oder umbenannt.
- Reiner Text ohne JSON mit mindestens zwei Zeilen gilt als Namensliste für eine Lerngruppe (eine Person je Zeile).
- Dateien mit Namen nicht in Cloud-Ordnern ablegen (siehe Datenschutz in der README).

## Fragensätze (`sets`)

```json
{ "title": "Werkzeugkunde", "class": "7ab Technik",
  "questions": [
    { "text": "Womit sägt man Holz quer zur Faser?", "options": ["Feinsäge", "Feile", "Raspel", "Zange"], "correct": "A" },
    { "text": "Beim Bohren trägt man eine Schutzbrille.", "correct": true },
    { "text": "Was hat dir heute geholfen?", "options": ["Video", "Hilfeheft", "Partner"], "correct": null }
  ] }
```

| Feld | Bedeutung |
|---|---|
| `title` | Titel (bis 80 Zeichen). Gibt es ihn schon, hängt die App „(2)“ an – nichts wird überschrieben. |
| `class` | Name der Quiz-Klasse. Fehlt die Klasse (oder das Feld), gilt die Auswahl im Dialog. |
| `allClasses` | `true`: bewusst für alle Klassen freigeben. |
| `questions` | 1 bis 100 Fragen. |
| `questions[].text` | Fragetext (bis 400 Zeichen). |
| `questions[].options` | 2 bis 4 Antworten (je bis 120 Zeichen). Fehlen sie und ist `correct` `true`/`false`, entsteht Richtig/Falsch. |
| `questions[].correct` | Buchstabe `"A"`–`"D"`, Zahl ab 0, der genaue Antworttext, `true`/`false` oder `null` (Umfrage ohne richtige Antwort). |

Bilder sind nicht Teil der Datei. Für gute Fragen gelten die Quizregeln aus `KWS/AGENTS.md` Abschnitt 10 (wenige Fragen, genau eine eindeutig richtige Antwort).

## Hallenpläne (`plans`)

```json
{ "title": "Völkerball", "topic": "Völkerball", "lesson": "2026.11.18 · Klasse 6 · Werfen", "phase": 1,
  "floor": "halle", "lines": ["volleyball"],
  "items": [
    { "kind": "zone", "m": [1, 13, 1, 14], "color": "#2e7d4f", "text": "Feld A" },
    { "kind": "zone", "m": [13.5, 26.2, 1.5, 13.5], "form": "u-l", "band": [3.6, 1.5] },
    { "kind": "gear", "gear": "bank_lang", "view": "laengs", "at": [13.5, 7.5], "L": 3.4 },
    { "kind": "kid", "at": [5, 6], "color": "#c94040" },
    { "kind": "teacher", "at": [13.5, 1] },
    { "kind": "cone", "at": [3, 3], "text": "1" },
    { "kind": "arrow", "from": [5, 6], "to": [10, 6] }
  ],
  "rules": { "title": "Völkerball", "items": ["Nur unterhalb der Schulter treffen."], "print": true } }
```

- Maße in **Metern** auf dem Hallenboden: x von links 0–27, y von vorn nach hinten 0–15.
- `kind`: `zone` (Bereich, `m: [x0, x1, y0, y1]`, optional `form` und `band`), `gear` (Gerät aus dem Katalog, optional Länge `L` in m), `cone`, `kid`, `teacher`, `ball`, `cross`, `tag`, `text` (jeweils `at: [x, y]`), `arrow` (Laufweg) und `path` (Weg nach Freigabe) mit `from`/`to`.
- `floor`: `halle`, `linien` oder `leer`. `lines`: `basketball`, `handball`, `volleyball`, `badminton`, `fussball`.
- `lesson` (mit Datum beginnen) und `phase` (1–20) ordnen den Plan in die Stunden-Ansicht ein; `topic` in die Themen.
- Alle Geräte mit ihren Ansichten: `node tools/hallplan.mjs --list`. Vorschau als PDF/PNG: `node tools/hallplan.mjs plan.json --out <Ordner>`.
- „Vorhandene Pläne mit gleichem Namen ersetzen“ im Dialog überschreibt gleichnamige Pläne (Kennung, Thema und Stunde bleiben, wenn die Datei keine nennt).

## Sicherung der ganzen App

Die verschlüsselte Sicherung („Daten exportieren“) und ältere unverschlüsselte Sicherungen werden im selben Dialog erkannt; danach folgen wie bisher Passwort und die Wahl „hinzufügen“ oder „ersetzen“.

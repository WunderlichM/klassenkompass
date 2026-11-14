#!/usr/bin/env node
// Prüft eine Import-Datei für KlassenKompass (Fragensätze, Hallenpläne, Lerngruppen – einzeln oder gemeinsam)
// mit denselben Regeln wie die App und nennt, was beim Import entstehen würde.
// Aufruf:  node tools/import-check.mjs <datei.json> [weitere Dateien]     (Node ab 18)
// Format: docs/IMPORT.md. Der Ordner tools gehört nicht zur App.
import { readFileSync } from 'node:fs';
import { readImport, summary } from '../js/importformat.js';

const files = process.argv.slice(2);
if (!files.length) { console.error('Aufruf: node tools/import-check.mjs <datei.json> [weitere Dateien]'); process.exit(2); }
let bad = 0;
for (const f of files) {
  try {
    const c = readImport(readFileSync(f, 'utf8'));
    if (c.backup) console.log(`✓ ${f}: Sicherung der ganzen App (wird in der App geprüft)`);
    else { console.log(`✓ ${f}`); summary(c).forEach(l => console.log('   ' + l)); }
  } catch (e) { bad++; console.error(`✗ ${f}: ${e.message}`); }
}
process.exit(bad ? 1 : 0);

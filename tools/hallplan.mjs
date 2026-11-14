#!/usr/bin/env node
// Hallenplan-Werkzeug: prüft eine Plan-Datei und erzeugt mit der Zeichnung der App je Plan
//   „Hallenplan - <Titel> - Schüleransicht.pdf“ (A4 quer, zum Zeigen oder Drucken),
//   „Hallenplan - <Titel>.png“ (nur die Zeichnung, für den Verlaufsplan) und
//   „Hallenplan - <Titel>.json“ (zum Importieren in KlassenKompass → Hallenpläne → Sammlung → Importieren).
//
// Aufruf:  node tools/hallplan.mjs <plan.json> [--out <Ordner>] [--check] [--list]
//   --check  nur prüfen, nichts schreiben        --list  Geräte mit Ansichten ausgeben
// Braucht Node ab 18 und für PDF/PNG einen Chrome/Chromium/Edge (Pfad notfalls in der Umgebungsvariable CHROME).
// Das Dateiformat (auch Angaben in Metern) steht in js/hallplan.js und in der README.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { parsePlans, exportPlans, boardSvg, contentBox } from '../js/hallplan.js';
import { gearList, viewLabel } from '../js/hallgear.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), flag = n => args.includes(n);
const outAt = args.indexOf('--out'), out = outAt >= 0 ? args[outAt + 1] : null;
const input = args.find((a, i) => !a.startsWith('--') && !(outAt >= 0 && i === outAt + 1));

if (flag('--list')) {
  for (const g of gearList()) console.log(`${g.id.padEnd(22)} ${g.name.padEnd(28)} ${g.views.map(v => `${v} (${viewLabel(v)})`).join(', ')}${g.stretch ? '  · Länge L in m' : ''}`);
  process.exit(0);
}
if (!input) { console.error('Aufruf: node tools/hallplan.mjs <plan.json> [--out <Ordner>] [--check] [--list]'); process.exit(2); }

let plans;
try { plans = parsePlans(readFileSync(input, 'utf8')); } catch (e) { console.error('Fehler: ' + e.message); process.exit(1); }
// Elemente weit außerhalb der Hallenfläche sind fast immer ein Tippfehler in den Metern
for (const p of plans) for (const [n, i] of p.items.entries()) {
  const cx = i.x + i.w / 2, cy = i.y + i.h / 2;
  if (cx < -40 || cx > 1640 || cy < 60 || cy > 760) console.warn(`Hinweis: „${p.title}“, Element ${n + 1} (${i.kind}${i.gear ? ' ' + i.gear : ''}) liegt außerhalb der Halle.`);
}
console.log(plans.map(p => `„${p.title}“: ${p.items.length} Elemente${p.lines.length ? ', Linien ' + p.lines.join(', ') : ''}`).join('\n'));
if (flag('--check')) process.exit(0);

const chrome = [process.env.CHROME, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'].find(p => p && existsSync(p));
if (!chrome) { console.error('Kein Chrome/Chromium/Edge gefunden. Pfad in der Umgebungsvariable CHROME angeben.'); process.exit(1); }

const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fileName = t => String(t).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70) || 'Hallenplan';
const css = pathToFileURL(join(root, 'styles.css')).href;
const page = (body, style) => `<!doctype html><html lang="de" data-theme="light"><head><meta charset="utf-8"><link rel="stylesheet" href="${css}">
<style>html, body { margin: 0; background: #fff; } body::before, body::after { display: none; } ${style}</style></head><body>${body}</body></html>`;
const dir = resolve(out || dirname(input)); mkdirSync(dir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'hallplan-'));
const run = (html, extra) => {
  const f = join(tmp, 'seite.html'); writeFileSync(f, html);
  execFileSync(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--user-data-dir=${join(tmp, 'profil')}`, ...extra, pathToFileURL(f).href], { stdio: 'ignore' });
};
try {
  for (const p of plans) {
    const base = join(dir, 'Hallenplan - ' + fileName(p.title));
    // Schüleransicht: A4 quer, Titel, Zeichnung, Hinweis – wie „Drucken / PDF“ in der App
    run(page(`<main><h1>${esc(p.title)}</h1>${boardSvg(p, { crop: true })}<p>Schematisch · Abstände und nutzbaren Raum vor Ort prüfen</p></main>`,
      `@page { size: A4 landscape; margin: 10mm; } main { height: 189mm; display: flex; flex-direction: column; font-family: "Segoe UI", Arial, sans-serif; color: #1f2a3c; }
       h1 { font-size: 20pt; margin: 0 0 4mm; } p { font-size: 9pt; color: #6b6d78; margin: 2mm 0 0; } svg { flex: 1; min-height: 0; width: 100%; }`),
    [`--print-to-pdf=${base} - Schüleransicht.pdf`, '--no-pdf-header-footer']);
    // PNG: nur die Zeichnung, 2000 px breit
    const [, , vw, vh] = contentBox(p).split(' ').map(Number), W = 2000, H = Math.round(W * vh / vw);
    run(page(boardSvg(p, { crop: true }), `svg { display: block; width: ${W}px; height: ${H}px; }`), [`--screenshot=${base}.png`, `--window-size=${W},${H}`]);
    writeFileSync(base + '.json', exportPlans([p]) + '\n');
    console.log(`geschrieben: ${base} - Schüleransicht.pdf, .png, .json`);
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }

// App-Sperre: Die Daten auf diesem Gerät werden mit einem eigenen Passwort verschlüsselt (AES-256-GCM,
// Schlüssel per PBKDF2-SHA-256 mit 600 000 Durchläufen). Der Schlüssel liegt nur im Arbeitsspeicher;
// nach dem Neuladen oder der automatischen Sperre muss das Passwort erneut eingegeben werden.
import * as store from './store.js';
import { esc, icon, logo } from './ui.js';

const CFG = 'klassenkompass.lock', ITER = 600000, CHECK = 'klassenkompass-lock-ok';
export const MINUTES = [[5, '5 Minuten'], [10, '10 Minuten'], [15, '15 Minuten'], [30, '30 Minuten'], [60, '1 Stunde'], [0, 'Nie (nur „Jetzt sperren“)']];

const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

const readCfg = () => { try { const c = JSON.parse(localStorage.getItem(CFG)); return c && c.v === 1 && c.salt && c.check ? c : null; } catch { return null; } };
export const enabled = () => !!readCfg();
export const minutes = () => readCfg()?.minutes ?? 15;

async function derive(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function cipherFor(key) {
  return {
    async encrypt(text) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      return { iv: b64(iv), data: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text))) };
    },
    async decrypt(box) {
      try { return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data))); }
      catch { throw Object.assign(new Error('Die Daten lassen sich mit diesem Passwort nicht entschlüsseln.'), { decrypt: true }); }
    },
  };
}
// Passwort prüfen; liefert den Verschlüsseler oder wirft „Passwort stimmt nicht“
async function open(password, cfg = readCfg()) {
  const c = cipherFor(await derive(password, unb64(cfg.salt), cfg.iter));
  try { if (await c.decrypt(cfg.check) === CHECK) return c; } catch {}
  throw new Error('Das Passwort stimmt nicht.');
}
async function newCfg(password, mins) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const c = cipherFor(await derive(password, salt, ITER));
  return { cfg: { v: 1, salt: b64(salt), iter: ITER, minutes: mins, check: await c.encrypt(CHECK) }, c };
}
const checkPw = (pw, pw2) => {
  if (pw.length < 8) throw new Error('Das Passwort muss mindestens 8 Zeichen lang sein.');
  if (pw !== pw2) throw new Error('Die Passwörter stimmen nicht überein.');
};

// ---------- Einrichten, ändern, ausschalten ----------
export async function setup(password, password2, mins) {
  checkPw(password, password2);
  const { cfg, c } = await newCfg(password, mins);
  localStorage.setItem(CFG, JSON.stringify(cfg));   // zuerst die Einstellung: bricht etwas ab, findet der nächste Start den Klartext und verschlüsselt ihn
  await store.setCipher(c);
  if (store.storageError()) throw new Error(store.storageError());
  startAutoLock();
}
export async function changePassword(oldPw, newPw, newPw2) {
  checkPw(newPw, newPw2);
  const old = readCfg(); await open(oldPw, old);
  const { cfg, c } = await newCfg(newPw, old.minutes);
  await store.setCipher(c);
  localStorage.setItem(CFG, JSON.stringify(cfg));
}
export function setMinutes(mins) { const c = readCfg(); if (!c) return; c.minutes = mins; localStorage.setItem(CFG, JSON.stringify(c)); }
export async function disable(password) {
  await open(password);
  await store.setCipher(null);
  if (store.storageError()) throw new Error(store.storageError());
  localStorage.removeItem(CFG);
  clearInterval(autoTimer);
}
// Sperren = speichern und neu laden; danach ist nichts mehr im Arbeitsspeicher
export async function lockNow() {
  if (!enabled()) return;
  await store.flush();
  location.reload();
}

// ---------- Automatische Sperre ----------
// Nach der eingestellten Zeit ohne Bedienung – aber nicht, solange etwas läuft (Timer, Quiz), damit der Unterricht nicht unterbrochen wird.
let lastInput = Date.now(), autoTimer = null, isBusy = () => false;
export function startAutoLock(busy) {
  if (busy) isBusy = busy;
  if (autoTimer || !enabled()) return;
  const touch = () => { lastInput = Date.now(); };
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(t => addEventListener(t, touch, { passive: true, capture: true }));
  const check = () => {
    const m = minutes();
    if (!enabled() || !m) return;
    if (isBusy()) { lastInput = Date.now(); return; }
    if (Date.now() - lastInput >= m * 60000) lockNow();
  };
  autoTimer = setInterval(check, 15000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}

// ---------- Sperrbildschirm beim Start ----------
// Ohne App-Sperre: Daten wie bisher laden. Mit App-Sperre: erst nach richtigem Passwort.
export function gate() {
  const cfg = readCfg();
  if (!cfg) { store.load(); return Promise.resolve(); }
  return new Promise(resolve => {
    const app = document.getElementById('app');
    app.innerHTML = `<div class="lock-screen"><form class="lock-card" novalidate>
      <span class="logo">${logo(34)}</span>
      <h1>KlassenKompass</h1>
      <p class="muted">Die Daten auf diesem Gerät sind verschlüsselt. Gib dein Passwort der App-Sperre ein.</p>
      <label class="field">Passwort<input name="pw" type="password" class="input" autocomplete="current-password" required autofocus></label>
      <p class="form-error" hidden></p>
      <button type="submit" class="btn primary">${icon('lock', 16)} Entsperren</button>
      <button type="button" class="link lock-forgot">Passwort vergessen?</button>
    </form></div>`;
    const form = app.querySelector('form'), err = app.querySelector('.form-error'), btn = form.querySelector('[type=submit]');
    const show = m => { err.textContent = m; err.hidden = !m; };
    form.onsubmit = async e => {
      e.preventDefault(); show('');
      btn.disabled = true; btn.textContent = 'Wird entsperrt …';
      try {
        const c = await open(String(new FormData(form).get('pw') || ''), cfg);
        await store.loadEncrypted(c);
        resolve();
      } catch (ex) { show(ex.message); btn.disabled = false; btn.innerHTML = `${icon('lock', 16)} Entsperren`; form.pw.select(); }
    };
    app.querySelector('.lock-forgot').onclick = () => {
      show('');
      const box = document.createElement('div'); box.className = 'notice lock-reset';
      box.innerHTML = `<p>Ohne das Passwort lassen sich die Daten auf diesem Gerät nicht mehr öffnen – auch nicht vom Betreiber. Du kannst sie löschen und neu beginnen. Mit Konto holst du deine Daten danach durch Anmelden zurück, sonst über „Daten importieren“ aus einer Sicherung.</p>
        <button type="button" class="btn danger sm">Daten auf diesem Gerät löschen</button>`;
      app.querySelector('.lock-forgot').replaceWith(box);
      box.querySelector('button').onclick = () => {
        if (!confirm('Alle KlassenKompass-Daten auf diesem Gerät endgültig löschen?')) return;
        ['klassenkompass.v1', 'klassenkompass.v1.enc', CFG].forEach(k => localStorage.removeItem(k));
        location.reload();
      };
    };
    form.pw.focus();
  });
}
export const describe = () => `Die Daten auf diesem Gerät sind mit deinem Passwort verschlüsselt${minutes() ? ` und sperren sich nach ${esc(MINUTES.find(m => m[0] === minutes())?.[1] || minutes() + ' Minuten')} ohne Bedienung` : ''}.`;

// Design hell/dunkel. Die Wahl gilt nur für dieses Gerät (localStorage) und wird nicht über das Konto abgeglichen.
// Die gleiche Auswertung steht als kleines Skript in index.html, damit beim Start nichts hell aufblitzt.
const KEY = 'klassenkompass.theme';
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : { matches: false };
let onChange = () => {};

export function get() {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'auto'; } catch { return 'auto'; }
}
export const isDark = () => document.documentElement.dataset.theme === 'dark';

export function apply() {
  const t = get(), dark = t === 'dark' || (t === 'auto' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  onChange(dark);
}

export function set(v) {
  try { if (v === 'light' || v === 'dark') localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch {}
  apply();
}

export function init(cb) {
  if (cb) onChange = cb;
  mq.addEventListener?.('change', () => { if (get() === 'auto') apply(); });
  apply();
}

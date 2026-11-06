// Kleine Hilfen für Oberfläche und Dialoge
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICONS = {
  technik: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/>',
  sport: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  sick: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/><path d="M3 3l18 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  shrink: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  pause: '<path d="M7 4h4v16H7zM13 4h4v16h-4z"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  volume: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  egg: '<path d="M12 3c4 0 7 6.5 7 11a7 7 0 0 1-14 0c0-4.5 3-11 7-11z"/>',
  qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM18 18h3v3h-3zM14 20h2M20 14v2"/>',
  stopwatch: '<circle cx="12" cy="14" r="7"/><path d="M12 10v4M10 2h4M18 6l1.5-1.5"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
  install: '<path d="M12 3v12M7 10l5 5 5-5"/><rect x="3" y="17" width="18" height="4" rx="1"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  forward: '<path d="M9 5l7 7-7 7"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  cards: '<rect x="3" y="6" width="12" height="15" rx="2"/><path d="M8 3h11a2 2 0 0 1 2 2v13"/><path d="M7 10h4v4H7z"/>',
};
// Logo: Kompass (Ring, Nadel mit goldener Nordspitze); Hintergrund kommt aus der Bereichsfarbe
export const logo = (size = 24) => `<svg width="${size}" height="${size}" viewBox="8 8 48 48" aria-hidden="true"><circle cx="32" cy="32" r="20" fill="none" stroke="#fff" stroke-width="3.5"/><path d="M32 15.5 37.5 32 32 48.5 26.5 32z" fill="#fff"/><path d="M32 15.5 37.5 32h-11z" fill="#f2b84b"/><circle cx="32" cy="32" r="2.4" fill="var(--accent)"/></svg>`;
export const icon = (name, size = 18) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

let toastTimer;
export function toast(message, { action, onAction, kind = '' } = {}) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.className = 'toast show ' + kind;
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('show'); onAction?.(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 7000 : 3200);
}

// Modaler Dialog; body ist HTML, onSubmit erhält FormData, Rückgabe false hält den Dialog offen
export function dialog({ title, body, submit = 'Speichern', cancel = 'Abbrechen', danger = false, wide = false, onSubmit, onOpen }) {
  const d = document.createElement('dialog');
  d.className = 'modal' + (wide ? ' wide' : '');
  d.innerHTML = `<form method="dialog" novalidate>
    <header><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Schließen">${icon('x')}</button></header>
    <div class="modal-body">${body}</div>
    <p class="form-error" hidden></p>
    <footer>${cancel ? `<button type="button" class="btn ghost" data-close>${esc(cancel)}</button>` : ''}${submit ? `<button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${esc(submit)}</button>` : ''}</footer>
  </form>`;
  document.body.append(d);
  const form = d.querySelector('form'), err = d.querySelector('.form-error');
  const close = () => { d.close(); d.remove(); };
  d.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
  d.addEventListener('cancel', e => { e.preventDefault(); close(); });
  form.onsubmit = async e => {
    e.preventDefault();
    try {
      const res = await onSubmit?.(new FormData(form), form);
      if (res === false) return;
      close();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  };
  d.showModal();
  onOpen?.(d, close);
  const first = d.querySelector('input:not([type=hidden]),textarea,select');
  if (first) first.focus();
  return { close, el: d };
}

// Trennungsregeln nur in einem Fenster zeigen, damit die Namen nicht dauerhaft (z. B. am Beamer) sichtbar sind.
export function rulesDialog({ title, people, getRules, onAdd, onDelete, note = '' }) {
  const label = id => people.find(p => p.id === id)?.label ?? '?';
  const opts = [...people].sort((a, b) => a.label.localeCompare(b.label, 'de')).map(p => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('');
  return dialog({ title, submit: null, cancel: 'Fertig',
    body: `<p class="muted small-text">Diese Personen kommen nie in dieselbe Gruppe. Die Liste ist nur hier sichtbar – am besten bearbeiten, wenn der Beamer aus ist.</p>
      <ul class="rules" data-list></ul>
      <div class="two"><label class="field">Person 1<select class="select" data-a>${opts}</select></label><label class="field">Person 2<select class="select" data-b>${opts}</select></label></div>
      ${note ? `<p class="muted small-text">${esc(note)}</p>` : ''}
      <button type="button" class="btn ghost full" data-add ${people.length < 2 ? 'disabled' : ''}>${icon('plus', 16)} Regel hinzufügen</button>`,
    onOpen: el => {
      const list = el.querySelector('[data-list]'), err = el.querySelector('.form-error');
      const showError = m => { err.textContent = m; err.hidden = !m; };
      const draw = () => {
        const rules = getRules();
        list.innerHTML = rules.length ? rules.map(([a, b], i) => `<li><span>${esc(label(a))}</span><span class="muted">↔</span><span>${esc(label(b))}</span><button type="button" class="icon-btn xs" data-del="${i}" aria-label="Regel entfernen">${icon('x', 14)}</button></li>`).join('')
          : '<li class="muted small-text">Noch keine Regeln.</li>';
        list.querySelectorAll('[data-del]').forEach(btn => btn.onclick = () => { onDelete(Number(btn.dataset.del)); showError(''); draw(); });
      };
      el.querySelector('[data-add]').onclick = () => {
        const a = el.querySelector('[data-a]').value, b = el.querySelector('[data-b]').value;
        if (a === b) return showError('Bitte zwei verschiedene Personen wählen.');
        if (getRules().some(r => r.includes(a) && r.includes(b))) return showError('Diese Regel gibt es schon.');
        onAdd([a, b]); showError(''); draw();
      };
      draw();
    } });
}

export function confirmDialog(title, text, submit = 'Löschen') {
  return new Promise(resolve => {
    let done = false;
    const dlg = dialog({ title, body: `<p>${esc(text)}</p>`, submit, danger: true, onSubmit: () => { done = true; resolve(true); } });
    dlg.el.addEventListener('close', () => { if (!done) resolve(false); });
  });
}

export function namesFromText(text) {
  // gleiche Vornamen sind erlaubt (verschiedene Personen)
  return text.split(/[\n,;]+/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean).map(s => s.slice(0, 40));
}

export function downloadFile(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function initials(name) { return (name || '?').trim().charAt(0).toLocaleUpperCase('de'); }

export const PALETTE = [
  { bg: '#eee7fa', border: '#c9b3eb', ink: '#5e428c', dot: '#9a78c8' },
  { bg: '#e3efe6', border: '#a8cbb1', ink: '#3e6748', dot: '#78a584' },
  { bg: '#faebdd', border: '#e3bea0', ink: '#85512d', dot: '#d2a078' },
  { bg: '#e3edf7', border: '#a7c4de', ink: '#3b607e', dot: '#7fa8cb' },
  { bg: '#f5e4e9', border: '#ddaab9', ink: '#854656', dot: '#c68499' },
  { bg: '#f3efd6', border: '#d8cd8b', ink: '#766524', dot: '#bdaf63' },
  { bg: '#dff1f0', border: '#9fd0cc', ink: '#2f6a66', dot: '#5fb0aa' },
  { bg: '#f8e1df', border: '#e4a9a3', ink: '#8f3a32', dot: '#d4746b' },
  { bg: '#e5e6f8', border: '#b0b4e6', ink: '#3f4590', dot: '#7d84d0' },
  { bg: '#ebf3d9', border: '#c2d896', ink: '#55692a', dot: '#98b75a' },
  { bg: '#efe6dc', border: '#cdb8a0', ink: '#6b5038', dot: '#a88a6a' },
  { bg: '#e8eaed', border: '#bcc2ca', ink: '#444c57', dot: '#8a939f' },
];
export const pal = i => PALETTE[i % PALETTE.length];
export const palStyle = i => { const p = pal(i); return `--g-bg:${p.bg};--g-border:${p.border};--g-ink:${p.ink};--g-dot:${p.dot}`; };

export function todayISO() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return ['year', 'month', 'day'].map(t => parts.find(p => p.type === t).value).join('-');
}
export function displayDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return v || '';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(v + 'T12:00:00Z'));
}

export function toggleFullscreen(el, cls = 'presenting') {
  const on = !document.body.classList.contains(cls);
  document.body.classList.toggle(cls, on);
  if (on) document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  return on;
}
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) document.body.classList.remove('presenting');
  window.dispatchEvent(new Event('resize'));
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('presenting') && !document.querySelector('dialog[open]')) {
    document.body.classList.remove('presenting');
    window.dispatchEvent(new Event('resize'));
  }
});

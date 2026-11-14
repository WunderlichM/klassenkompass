// Ziehen und Ablegen mit Maus, Finger und Stift (seit 2.1.0), ohne HTML5-Drag-and-Drop (geht auf Tablets nicht zuverlässig).
// Maus: Ziehen beginnt nach wenigen Pixeln Bewegung. Finger/Stift: kurz gedrückt halten (Seite scrollt sonst normal).
// enableDrag(root, { item, target, onDrop(itemEl, targetEl), canDrop?(itemEl, targetEl) }) → Funktion zum Abmelden
const HOLD = 350, MOVE = 6;
let dragging = false;
// Während des Ziehens mit dem Finger darf die Seite nicht scrollen (Listener muss „nicht passiv“ sein)
document.addEventListener('touchmove', e => { if (dragging) e.preventDefault(); }, { passive: false });

export function enableDrag(root, { item, target, onDrop, canDrop = () => true }) {
  let st = null;
  const clear = () => {
    if (!st) return;
    clearTimeout(st.timer);
    st.ghost?.remove(); st.el.classList.remove('dragging'); st.over?.classList.remove('drop-over');
    document.body.classList.remove('is-dragging');
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel);
    dragging = false; st = null;
  };
  const begin = () => {
    st.active = dragging = true;
    const r = st.el.getBoundingClientRect(), g = st.el.cloneNode(true);
    g.className += ' drag-ghost'; g.removeAttribute('id');
    Object.assign(g.style, { width: r.width + 'px', height: r.height + 'px', left: '0', top: '0' });
    st.dx = st.x - r.left; st.dy = st.y - r.top; st.ghost = g;
    document.body.append(g); st.el.classList.add('dragging'); document.body.classList.add('is-dragging');
    place(st.x, st.y);
    navigator.vibrate?.(15);
  };
  const place = (x, y) => { st.ghost.style.transform = `translate(${x - st.dx}px, ${y - st.dy}px)`; };
  const targetAt = (x, y) => {
    const t = document.elementFromPoint(x, y)?.closest(target);
    return t && root.contains(t) && t !== st.el && canDrop(st.el, t) ? t : null;
  };
  function move(e) {
    if (!st || e.pointerId !== st.id) return;
    const d = Math.hypot(e.clientX - st.x, e.clientY - st.y);
    if (!st.active) {
      if (st.touch) { if (d > MOVE * 2) clear(); return; }   // Finger bewegt sich vor dem Halten: normal scrollen
      if (d < MOVE) return;
      begin();
    }
    e.preventDefault();
    place(e.clientX, e.clientY);
    const t = targetAt(e.clientX, e.clientY);
    if (t !== st.over) { st.over?.classList.remove('drop-over'); t?.classList.add('drop-over'); st.over = t; }
  }
  function up(e) {
    if (!st || e.pointerId !== st.id) return;
    const { active, el } = st, t = active ? targetAt(e.clientX, e.clientY) : null;
    clear();
    if (!active) return;
    // den Klick, der auf das Loslassen folgt, verschlucken (sonst öffnet z. B. ein Hallenplan)
    const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
    addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener('click', swallow, true), 60);
    if (t) onDrop(el, t);
  }
  function cancel() { clear(); }
  function down(e) {
    if (e.button > 0 || st) return;
    const el = e.target.closest(item);
    if (!el || !root.contains(el) || e.target.closest('input,select,textarea,[data-nodrag]')) return;
    st = { el, id: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse', active: false };
    if (st.touch) st.timer = setTimeout(() => { if (st && !st.active) begin(); }, HOLD);
    addEventListener('pointermove', move, { passive: false }); addEventListener('pointerup', up); addEventListener('pointercancel', cancel);
  }
  // Langes Drücken soll kein Kontextmenü (Android) und keine Textauswahl öffnen
  const ctx = e => { if (e.target.closest(item) && root.contains(e.target)) e.preventDefault(); };
  root.addEventListener('pointerdown', down);
  root.addEventListener('contextmenu', ctx);
  return () => { clear(); root.removeEventListener('pointerdown', down); root.removeEventListener('pointercancel', cancel); root.removeEventListener('contextmenu', ctx); };
}

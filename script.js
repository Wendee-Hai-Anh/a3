const infoBtn = document.querySelector('.information');
function toggleInfo() { infoBtn.classList.toggle('open'); }
infoBtn.setAttribute('role', 'button');
infoBtn.setAttribute('aria-label', 'Show information');
infoBtn.tabIndex = 0;
infoBtn.addEventListener('click', toggleInfo);
function tapHitsUI(target) {
  return !!target.closest(
    '.info-panel, .overlay, .theme-toggle, .information, .mode-bubble'
  );
}

// Your global tap-to-step handler: MOBILE ONLY
function handleScreenTapNav(e) {
  if (!isMobile()) return;                         // ← desktop: do nothing
  if (overlay.classList.contains('open')) return;  // ignore when menu open
  if (e.target.closest('.info-panel, .overlay, .theme-toggle, .information')) return;
  if (typeof transitionActive !== 'undefined' && transitionActive) return;

  const x = e.clientX / window.innerWidth;
  if (x <= 0.45) navigateInCurrentMode('prev');
  else if (x >= 0.55) navigateInCurrentMode('next');
}
window.addEventListener('pointerup', handleScreenTapNav, { passive: true });
// Track whether the gesture became a drag
const tapNav = { downX: null, downY: null, moved: false };

window.addEventListener('pointerdown', (e) => {
  if (!isMobile()) return;
  if (overlay.classList.contains('open')) return;
  if (tapHitsUI(e.target)) return;
  tapNav.downX = e.clientX; tapNav.downY = e.clientY; tapNav.moved = false;
}, { passive: true });

window.addEventListener('pointermove', (e) => {
  if (!isMobile()) return;
  if (tapNav.downX == null) return;
  const dx = e.clientX - tapNav.downX, dy = e.clientY - tapNav.downY;
  if (Math.hypot(dx, dy) > 12) tapNav.moved = true;   // treat as drag
}, { passive: true });

// ----- Theme toggle with localStorage -----
const root = document.documentElement;
const toggle = document.querySelector('.theme-toggle');

// Initialize theme: saved -> system -> light
const saved = localStorage.getItem('theme');
if (saved) {
  root.setAttribute('data-theme', saved);
} else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
  root.setAttribute('data-theme', 'dark');
} // else keep light default

function applyToggleLabel() {
  const mode = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = mode === 'dark' ? 'light' : 'dark';
  toggle.setAttribute('aria-pressed', mode === 'dark');
  toggle.setAttribute('aria-label', `Switch to ${next} mode`);
  toggle.textContent = mode === 'dark' ? '◑' : '◐';
}
applyToggleLabel();

toggle.addEventListener('click', () => {
  const isDark = root.getAttribute('data-theme') === 'dark';
  const next = isDark ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  applyToggleLabel();

  // NEW: sync p5 background
  if (window.setLightMode) window.setLightMode(next === 'light');
});

/* Data */
/* ===== Data ===== */
const HOUSES = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th"];
const ZODIACS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

/* ===== Elements ===== */
const overlay = document.getElementById('menuOverlay');
// Mobile detector used to gate touch behaviors
const isMobile = () =>
  window.matchMedia('(max-width: 480px), (hover: none) and (pointer: coarse)').matches;
const menuBtn = document.getElementById('menuBtn');
const housePath = document.getElementById('housePath');
const zodPath = document.getElementById('zodPath');
const houseGroup = document.getElementById('houseGroup');
const zodGroup = document.getElementById('zodGroup');
const isOpen = () => overlay.classList.contains('open');

/* ===== Rails builder (brings columns closer to center) ===== */
function buildRails() {
  const VB = 1000, CENTER = 500;
  const GAP = 120;     // smaller → closer columns
  const BEND = 90;
  const yTop = 40, yBot = 960, c1 = 260, c2 = 740;

  const xL = CENTER - GAP / 2;
  const xR = CENTER + GAP / 2;

  housePath.setAttribute('d', `M ${xL},${yTop} C ${xL + BEND},${c1} ${xL + BEND},${c2} ${xL},${yBot}`);
  zodPath.setAttribute('d', `M ${xR},${yTop} C ${xR - BEND},${c1} ${xR - BEND},${c2} ${xR},${yBot}`);

  // relayout after changing rails
  if (left) left.layout(left.offset);
  if (right) right.layout(right.offset);

  scheduleLayout();
}

/* ===== One function to build a scrolling list on a path ===== */
function makeList(group, path, items, side/*'L'|'R'*/) {
  const VB = 1000, L = path.getTotalLength();
  const spacing = L / (items.length + 1);
  const nodes = items.map((label, i) => {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.classList.add('chip');
    t.textContent = label;
    group.appendChild(t);
    return { el: t, base: spacing * (i + 1) };
  });

  const state = { offset: 0, focused: 0 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const center = L / 2;

  state.layout = (offset) => {
    state.offset = offset;
    let best = { score: -1, idx: 0 };

    for (let i = 0; i < nodes.length; i++) {
      const { el, base } = nodes[i];
      let off = ((base + offset) % L + L) % L;
      const p = path.getPointAtLength(off);

      // emphasis near center (smoothstep)
      const dist = Math.abs(off - center);
      const span = L * 0.18;
      let e = Math.max(0, 1 - dist / span);
      e = e * e * (3 - 2 * e);

      if (e > best.score) { best.score = e; best.idx = i; }

      const scale = 0.85 + 1.15 * e;       // far→near size
      const pop = 36 * e;                 // push toward middle
      const inward = (side === 'L') ? -26 : 26;

      let x = p.x + inward + (side === 'L' ? pop : -pop);
      let y = p.y;
      x = clamp(x, 60, VB - 60);
      y = clamp(y, 40, VB - 40);

      el.setAttribute('x', x);
      el.setAttribute('y', y);
      const s = (i === best.idx) ? scale * 1.18 : scale; // pop the focused chip
      el.setAttribute('transform', `scale(${s})`);


      const lvl = dist > span * 1.8 ? 3 : dist > span * 1.25 ? 2 : dist > span * 0.6 ? 1 : 0;
      if (lvl) el.dataset.level = String(lvl); else el.removeAttribute('data-level');
    }
    state.focused = best.idx;

    // Mark focused item for CSS & a11y
    nodes.forEach((n, ii) => {
      if (ii === best.idx) {
        n.el.dataset.focused = 'true';
        n.el.setAttribute('aria-selected', 'true');
      } else {
        n.el.removeAttribute('data-focused');
        n.el.removeAttribute('aria-selected');
      }
    });
  };

  return state;
}

/* ===== Open / Close ===== */
function openOverlay() {
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  scheduleLayout();                 // paint once after opening
}

function closeOverlay() {
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

window.addEventListener('resize', () => {
  buildRails();
  left.layout(left.offset);
  right.layout(right.offset);
});

// Toggle the app's mode before opening a panel.
function ensureMode(mode) {
  // If you keep a global labelMode, use it; otherwise just call the switchers.
  if (typeof labelMode !== 'undefined') {
    if (labelMode === mode) return;
  }
  if (mode === 'house' && typeof switchToHouseMode === 'function') switchToHouseMode();
  if (mode === 'zodiac' && typeof switchToZodiacMode === 'function') switchToZodiacMode();
}

menuBtn.addEventListener('click', openOverlay);
overlay.addEventListener('click', (e) => {
  const clickedBackdrop = (e.target === overlay);
  const wantsClose = clickedBackdrop || e.target.closest('[data-close]');
  if (wantsClose) closeOverlay();
});
overlay.setAttribute('data-close', '');
window.addEventListener('keydown', (e) => {
  if (!overlay.classList.contains('open')) return;

  const col = (hoveredSide === 'L') ? left : right;
  if (e.key === 'Escape') { e.preventDefault(); closeOverlay(); return; }
  if (!col) return;

  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); col.offset -= 80; scheduleLayout(); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); col.offset += 80; scheduleLayout(); }
  else if (e.key === 'Enter') { e.preventDefault(); commitSelection(); }
});
/* ==================== Layout scheduler ==================== */
let left, right;
let rafId = 0;
function scheduleLayout() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    if (left) left.layout(left.offset || 0);
    if (right) right.layout(right.offset || 0);
  });
}

/* ==================== Controls (bind after init) ==================== */
// ====== Input: wheel / keys (single, non-duplicated handlers) ======
let hoveredSide = 'L';
overlay.addEventListener('pointermove', e => {
  hoveredSide = (e.clientX < window.innerWidth / 2) ? 'L' : 'R';
});
overlay.addEventListener('wheel', e => {
  if (!isOpen()) return;
  e.preventDefault();
  const unit = (e.deltaMode === 1) ? 16 : (e.deltaMode === 2 ? window.innerHeight : 1);
  const dy = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * unit;
  const col = (hoveredSide === 'L') ? left : right;
  if (!col) return;
  col.offset += dy;
  scheduleLayout();
  e.preventDefault();
  e.stopPropagation();
}, { passive: false });
window.addEventListener('keydown', e => {
  if (!isOpen()) return;
  const col = (hoveredSide === 'L') ? left : right;
  if (!col) return;

  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); col.offset -= 80; scheduleLayout(); }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); col.offset += 80; scheduleLayout(); }
  else if (e.key === 'Enter') { e.preventDefault(); commitSelection(); }
});
// ====== Touch drag (MOBILE ONLY) + GO button ======
let drag = { active: false, col: null, lastY: 0 };

if (isMobile()) {
  overlay.addEventListener('pointerdown', (e) => {
    if (!overlay.classList.contains('open')) return;
    drag.active = true;
    drag.lastY = e.clientY;
    drag.col = (e.clientX < window.innerWidth / 2) ? left : right; // left vs right list
    overlay.setPointerCapture?.(e.pointerId);
  }, { passive: true });

  overlay.addEventListener('pointermove', (e) => {
    if (!drag.active || !drag.col) return;
    const dy = e.clientY - drag.lastY;
    drag.lastY = e.clientY;
    drag.col.offset += dy * 2;   // tweak sensitivity if you like
    scheduleLayout();
  }, { passive: true });

  function endDrag() { drag.active = false; drag.col = null; }
  overlay.addEventListener('pointerup', endDrag, { passive: true });
  overlay.addEventListener('pointercancel', endDrag, { passive: true });
}

// GO button commits the focused pair (button lives inside #menuOverlay)
document.querySelector('.overlay__go')?.addEventListener('click', () => {
  commitSelection();
});


/* ==================== Open / Close ==================== */
function openOverlay() {
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  scheduleLayout();                // paint once after opening
}

function closeOverlay() {
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
}

/* keep rails + layout in sync on resize (single handler) */
window.addEventListener('resize', () => {
  buildRails();
  scheduleLayout();
});

/* ==================== Commit selection ==================== */
function ensureMode(mode) {
  if (typeof labelMode !== 'undefined' && labelMode === mode) return;
  if (mode === 'house' && typeof switchToHouseMode === 'function') switchToHouseMode();
  if (mode === 'zodiac' && typeof switchToZodiacMode === 'function') switchToZodiacMode();
}

// ====== Panel queue (house then zodiac, synced to your flash) ======
// ====== Panel queue (house then zodiac, synced to the flash) ======
const panelQueue = [];

function runNextPanel() {
  if (!panelQueue.length) return;
  const [mode, idx] = panelQueue.shift();

  if (window.startWalkerTransition) {
    // schedule this panel to open at the flash sync point
    panelOpenQueued = true;
    queuedMode = mode;
    queuedIndex = idx;
    startWalkerTransition();
  } else {
    if (mode === 'house') { ensureMode('house'); showHouseInfo(idx); }
    else { ensureMode('zodiac'); showZodiacInfo(idx); }
    runNextPanel();
  }
}

// sketch.js calls this when a panel actually opens (right after the flash)
window.afterFlash = runNextPanel;

function commitSelection() {
  // use the focused indices the list computed
  const h = (left && typeof left.focused === 'number') ? left.focused : 0;
  const z = (right && typeof right.focused === 'number') ? right.focused : 0;

  closeOverlay();

  // Open both at once, synced to the flash
  window.queuedZodiacIndex = z;
  panelOpenQueued = true;
  queuedMode = 'both';
  queuedIndex = h; // house index
  if (window.startWalkerTransition) {
    startWalkerTransition();
  } else {
    // Fallback: just open both directly
    if (typeof ensureMode === 'function') ensureMode('house');
    if (typeof showHouseInfo === 'function') showHouseInfo(h);
    if (typeof showZodiacInfo === 'function') showZodiacInfo(z);
  }

}

/* ==================== One-time init ==================== */
function bindOverlayControls() { }
window.addEventListener('DOMContentLoaded', () => {
  buildRails();
  left = makeList(houseGroup, housePath, HOUSES, 'L');
  right = makeList(zodGroup, zodPath, ZODIACS, 'R');

  // IMPORTANT: inside your makeList.layout, set list.focused to the index
  // with the highest emphasis so Enter knows which one to open.

  scheduleLayout();
  bindOverlayControls();
});

window.addEventListener('keydown', (e) => {
  if (!overlay.classList.contains('open')) return;

  // arrow scroll the last hovered side
  const col = (hoveredSide === 'L') ? left : right;
  if (!col) return;

  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    e.preventDefault(); col.offset -= 80; scheduleLayout();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    e.preventDefault(); col.offset += 80; scheduleLayout();
  } else if (e.key === 'Enter') {
    e.preventDefault(); commitSelection();
  }
});

document.querySelector('.bubble-h')?.addEventListener('click', () => {
  if (typeof switchToHouseMode === 'function') switchToHouseMode();
});
document.querySelector('.bubble-z')?.addEventListener('click', () => {
  if (typeof switchToZodiacMode === 'function') switchToZodiacMode();
});
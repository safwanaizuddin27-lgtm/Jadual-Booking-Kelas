/* Small motion helpers: numbers that count up on arrival, and a soft light that
   follows the pointer across glass tiles (desktop only). */

import { prefersReducedMotion } from '../ui/dom.js';
import { rafThrottle } from '../core/util.js';

export function countUp(scope) {
  if (prefersReducedMotion()) return;
  (scope || document).querySelectorAll('[data-count]').forEach(el => {
    const target = parseInt(el.getAttribute('data-count'), 10);
    if (!target || isNaN(target)) return;
    const dur = 900, t0 = performance.now();
    const step = t => {
      const k = Math.min(1, (t - t0) / dur);
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  });
}

export function initSpotlight() {
  if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches || prefersReducedMotion()) return;
  let lastTile = null;
  const move = rafThrottle(e => {
    const t = e.target && e.target.closest ? e.target.closest('.tile, .glass-hover') : null;
    if (lastTile && lastTile !== t) lastTile.classList.remove('is-lit');
    lastTile = t;
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    t.style.setProperty('--my', (e.clientY - r.top) + 'px');
    t.classList.add('is-lit');
  });
  document.addEventListener('pointermove', move, { passive: true });
  document.addEventListener('pointerleave', () => { if (lastTile) lastTile.classList.remove('is-lit'); });
}

/* The app's own "Kurangkan animasi" switch (Tetapan), on top of the system setting. */
const MOTION_KEY = 'langit5s-motion';
const motionSubs = new Set();
export function onMotionChange(fn) { motionSubs.add(fn); return () => motionSubs.delete(fn); }
export function motionReduced() { return document.documentElement.dataset.motion === 'reduce'; }
export function setReducedMotion(on) {
  if (on) document.documentElement.dataset.motion = 'reduce'; else delete document.documentElement.dataset.motion;
  try { if (on) localStorage.setItem(MOTION_KEY, 'reduce'); else localStorage.removeItem(MOTION_KEY); } catch (e) { /* per-viewer nicety */ }
  motionSubs.forEach(fn => fn(!!on));
}
export function initMotion() {
  let v = null;
  try { v = localStorage.getItem(MOTION_KEY); } catch (e) { v = null; }
  if (v === 'reduce') document.documentElement.dataset.motion = 'reduce';
}

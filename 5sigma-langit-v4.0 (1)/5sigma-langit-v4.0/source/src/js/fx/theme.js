/* Night (default) and dawn. The switch opens a circle of the new sky from the
   button that was pressed (View Transitions API), or swaps instantly. */

import { THEME_KEY } from '../core/data.js';
import { prefersReducedMotion } from '../ui/dom.js';

const subs = new Set();
export function onTheme(fn) { subs.add(fn); return () => subs.delete(fn); }
export function getTheme() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }

function apply(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', mode === 'light' ? '#EEEBF8' : '#050714');
  subs.forEach(fn => fn(mode));
}

export function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
  // The viewer's own explicit choice (claude.ai sets data-theme) counts when the app has none saved.
  const host = document.documentElement.getAttribute('data-theme');
  apply(saved === 'light' || saved === 'dark' ? saved : (host === 'light' ? 'light' : 'dark'));
}

export function setTheme(mode, fromEl) {
  if (mode === getTheme()) return;
  try { localStorage.setItem(THEME_KEY, mode); } catch (e) { /* memory only */ }
  if (!document.startViewTransition || prefersReducedMotion()) { apply(mode); return; }
  const r = fromEl && fromEl.getBoundingClientRect ? fromEl.getBoundingClientRect() : { left: innerWidth / 2, top: 0, width: 0, height: 0 };
  document.documentElement.style.setProperty('--rx', (r.left + r.width / 2) + 'px');
  document.documentElement.style.setProperty('--ry', (r.top + r.height / 2) + 'px');
  document.documentElement.classList.add('vt-theme');
  const t = document.startViewTransition(() => apply(mode));
  t.finished.finally(() => document.documentElement.classList.remove('vt-theme'));
}
export function toggleTheme(fromEl) { setTheme(getTheme() === 'dark' ? 'light' : 'dark', fromEl); }

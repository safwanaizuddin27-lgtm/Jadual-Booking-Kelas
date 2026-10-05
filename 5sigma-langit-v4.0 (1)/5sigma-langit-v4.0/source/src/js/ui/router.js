/* Views and navigation. Each view renders into its own <section>; the hash keeps
   the current page (#utama, #jadual, …) so back/forward and reloads work.
   Page changes use the View Transitions API where the browser has it. */

import { create } from './dom.js';
import { prefersReducedMotion } from './dom.js';

const views = {};
const listeners = new Set();
let current = null;
let host = null;
let guard = () => true;

export function registerView(v) { views[v.id] = v; }
export function getView(id) { return views[id]; }
export function currentView() { return current; }
export function onNavigate(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setGuard(fn) { guard = fn; }

function sectionFor(id) {
  let el = host.querySelector('[data-view="' + id + '"]');
  if (!el) {
    el = create('section', { class: 'view view-' + id, 'data-view': id, tabindex: '-1' });
    host.appendChild(el);
  }
  return el;
}

function show(id, params, opts) {
  const v = views[id];
  if (!v) return;
  const prev = current;
  const swap = () => {
    if (prev && prev !== id && views[prev] && views[prev].leave) views[prev].leave();
    host.querySelectorAll('.view.is-active').forEach(s => { if (s.dataset.view !== id) s.classList.remove('is-active'); });
    const el = sectionFor(id);
    el.classList.add('is-active');
    current = id;
    document.documentElement.dataset.page = id;
    v.render(el, params || {}, { entering: prev !== id });
    if (!opts || !opts.keepScroll) window.scrollTo(0, 0);
    listeners.forEach(fn => fn(id, prev));
  };
  if (prev && prev !== id && document.startViewTransition && !prefersReducedMotion() && !(opts && opts.instant)) {
    document.documentElement.classList.add('vt-page');
    const t = document.startViewTransition(swap);
    t.finished.finally(() => document.documentElement.classList.remove('vt-page'));
  } else {
    swap();
  }
}

export function navigate(id, params, opts) {
  if (!views[id]) id = 'utama';
  if (!guard(id)) id = 'utama';
  pendingParams = params || null;
  const target = '#' + id;
  if (location.hash !== target) {
    location.hash = target;          // hashchange will render
  } else {
    show(id, pendingParams, opts);
    pendingParams = null;
  }
}
let pendingParams = null;

export function rerender(reason) {
  if (!current || !views[current]) return;
  const v = views[current];
  if (v.update) v.update(reason);
  else v.render(sectionFor(current), {}, { entering: false, reason });
}

export function initRouter(container) {
  host = container;
  window.addEventListener('hashchange', () => {
    let id = (location.hash || '').replace('#', '') || 'utama';
    if (!views[id] || !guard(id)) id = 'utama';
    show(id, pendingParams);
    pendingParams = null;
  });
}
export function startRouter(defaultId) {
  let id = (location.hash || '').replace('#', '') || defaultId || 'utama';
  if (!views[id] || !guard(id)) id = defaultId || 'utama';
  show(id, null, { instant: true });
}

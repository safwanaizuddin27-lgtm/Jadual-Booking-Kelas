/* Tiny DOM helpers. `html` is a tagged template that escapes every interpolated
   value unless it was built by `html`/`raw` itself, so data from the store can
   never inject markup. */

import { esc } from '../core/util.js';

export class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export function raw(s) { return new Raw(s == null ? '' : String(s)); }

function render(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(String(v));
}
export function html(strings, ...vals) {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < vals.length) out += render(vals[i]);
  }
  return new Raw(out);
}

export function $(sel, root) { return (root || document).querySelector(sel); }
export function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
export function setHTML(el, content) { if (el) el.innerHTML = content instanceof Raw ? content.s : render(content); }

// Event delegation: on(root, 'click', '[data-x]', (e, el) => ...)
export function on(root, type, selector, fn, opts) {
  root.addEventListener(type, e => {
    const el = e.target && e.target.closest ? e.target.closest(selector) : null;
    if (el && root.contains(el)) fn(e, el);
  }, opts);
}

export function create(tag, attrs, content) {
  const el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(k => {
    if (k === 'class') el.className = attrs[k];
    else if (k === 'dataset') Object.assign(el.dataset, attrs[k]);
    else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
  });
  if (content != null) setHTML(el, content);
  return el;
}

export function prefersReducedMotion() {
  return document.documentElement.dataset.motion === 'reduce' || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
export function isCoarse() {
  return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

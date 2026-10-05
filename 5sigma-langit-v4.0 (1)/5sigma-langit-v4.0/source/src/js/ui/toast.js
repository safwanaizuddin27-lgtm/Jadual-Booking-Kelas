/* Toasts: short confirmations at the top of the screen. An action (such as
   "Buat asal") keeps the toast up longer and shows a countdown line.
   The host is a manual popover where the browser supports it, so a toast is
   never hidden behind an open sheet (both live in the top layer; the one shown
   last is on top). */

import { create } from './dom.js';
import { html } from './dom.js';
import { icon } from './icons.js';

const ICONS = { success: 'check', info: 'spark', warning: 'warn', error: 'x', star: 'star' };
let behindSheet = false;
document.addEventListener('sheet:open', () => { behindSheet = true; });

function raise(host) {
  if (typeof host.showPopover !== 'function') return;
  try {
    if (!host.hasAttribute('popover')) host.setAttribute('popover', 'manual');
    const open = host.matches(':popover-open');
    if (open && behindSheet && document.querySelector('dialog[open]')) { host.hidePopover(); host.showPopover(); }
    else if (!open) host.showPopover();
    behindSheet = false;
  } catch (e) { /* plain fixed element is fine */ }
}

export function toast(message, opts) {
  opts = typeof opts === 'string' ? { type: opts } : (opts || {});
  const type = opts.type || 'info';
  const host = document.getElementById('toasts');
  if (!host) return;
  raise(host);
  const ms = opts.duration || (opts.action ? 6000 : 3400);
  const el = create('div', { class: 'toast t-' + type, role: 'status', style: '--ms:' + ms + 'ms' },
    html`<span class="toast-ic">${icon(ICONS[type] || 'spark', 16)}</span><span class="toast-msg">${message}</span>${opts.action ? html`<button type="button" class="toast-act">${opts.action.label}</button>` : ''}<i class="toast-bar"></i>`);
  host.appendChild(el);
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 240);
  };
  if (opts.action) {
    el.querySelector('.toast-act').addEventListener('click', () => { close(); opts.action.run(); });
  }
  setTimeout(close, ms);
  // Older toasts make room: never more than three on screen.
  const all = host.querySelectorAll('.toast:not(.is-out)');
  if (all.length > 3) { all[0].classList.add('is-out'); setTimeout(() => all[0].remove(), 240); }
  return { close };
}

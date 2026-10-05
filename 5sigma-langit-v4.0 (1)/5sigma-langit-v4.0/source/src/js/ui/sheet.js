/* Sheets: native <dialog> panels (bottom sheet on phones, centred on larger
   screens). Native dialogs give focus trapping and Esc for free. Also the
   in-page confirm/prompt/choose dialogs — the claude.ai viewer never shows the
   browser's own alert/confirm/prompt. */

import { create } from './dom.js';
import { html } from './dom.js';
import { raw } from './dom.js';
import { setHTML } from './dom.js';
import { icon } from './icons.js';

const stack = [];

export function openSheet(o) {
  const prevFocus = document.activeElement;
  const dlg = create('dialog', { class: 'sheet' + (o.wide ? ' is-wide' : '') + (o.cls ? ' ' + o.cls : ''), 'aria-label': o.title || 'Dialog' });
  setHTML(dlg, html`
    <div class="sheet-grip" aria-hidden="true"></div>
    ${o.title ? html`<header class="sheet-head">${o.icon || ''}<div class="sheet-titles"><h2>${o.title}</h2>${o.sub ? html`<p class="sheet-sub">${o.sub}</p>` : ''}</div>
      <button type="button" class="icon-btn sheet-x" aria-label="Tutup">${icon('x', 18)}</button></header>` : ''}
    <div class="sheet-body"></div>`);
  const body = dlg.querySelector('.sheet-body');
  if (o.content != null) setHTML(body, o.content);
  document.body.appendChild(dlg);
  let closed = false;
  const api = {
    el: dlg, body,
    setContent(c) { setHTML(body, c); },
    close(value) {
      if (closed) return; closed = true;
      dlg.classList.add('is-closing');
      const i = stack.indexOf(api); if (i > -1) stack.splice(i, 1);
      setTimeout(() => {
        try { dlg.close(); } catch (e) { /* already closed */ }
        dlg.remove();
        if (prevFocus && prevFocus.focus && document.contains(prevFocus)) { try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
        if (o.onClose) o.onClose(value);
      }, 200);
    }
  };
  dlg.addEventListener('cancel', e => { e.preventDefault(); api.close(); });
  dlg.addEventListener('mousedown', e => { api._downOnBackdrop = e.target === dlg; });
  dlg.addEventListener('click', e => { if (e.target === dlg && api._downOnBackdrop) api.close(); });
  const x = dlg.querySelector('.sheet-x');
  if (x) x.addEventListener('click', () => api.close());
  try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
  document.dispatchEvent(new Event('sheet:open'));
  stack.push(api);
  if (o.onMount) o.onMount(api);
  if (!o.keepFocus) {
    const first = body.querySelector('[autofocus], input:not([type=hidden]), select, textarea, button.primary');
    if (first && !(window.matchMedia && window.matchMedia('(pointer: coarse)').matches && first.tagName === 'INPUT')) { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  return api;
}
export function closeAllSheets() { stack.slice().forEach(s => s.close()); }

export function confirmDialog(o) {
  return new Promise(resolve => {
    let answered = false;
    const s = openSheet({
      title: o.title || 'Teruskan?', cls: 'is-dialog',
      content: html`${o.message ? html`<p class="dialog-msg">${o.message}</p>` : ''}${o.detail ? raw(o.detail) : ''}
        <div class="sheet-actions"><button type="button" class="btn ghost" data-a="no">${o.cancelLabel || 'Batal'}</button>
        <button type="button" class="btn ${o.tone === 'danger' ? 'danger' : 'primary'}" data-a="yes">${o.confirmLabel || 'Ya'}</button></div>`,
      keepFocus: true,
      onMount(api) {
        api.body.querySelector('[data-a="no"]').addEventListener('click', () => { answered = true; resolve(false); api.close(); });
        const yes = api.body.querySelector('[data-a="yes"]');
        yes.addEventListener('click', () => { answered = true; resolve(true); api.close(); });
        yes.focus();
      },
      onClose() { if (!answered) resolve(false); }
    });
    return s;
  });
}

export function promptDialog(o) {
  return new Promise(resolve => {
    let answered = false;
    openSheet({
      title: o.title || '', cls: 'is-dialog',
      content: html`<form class="dialog-form" novalidate>
        <label class="field"><span class="field-label">${o.label || ''}</span>
        <input id="dialog-input" class="input" type="text" autocomplete="off" value="${o.value || ''}" placeholder="${o.placeholder || ''}"></label>
        <div class="sheet-actions"><button type="button" class="btn ghost" data-a="no">Batal</button><button type="submit" class="btn primary">${o.confirmLabel || 'Simpan'}</button></div></form>`,
      keepFocus: true,
      onMount(api) {
        const input = api.body.querySelector('input');
        input.focus(); input.select();
        api.body.querySelector('[data-a="no"]').addEventListener('click', () => { answered = true; resolve(null); api.close(); });
        api.body.querySelector('form').addEventListener('submit', e => { e.preventDefault(); answered = true; resolve(input.value); api.close(); });
      },
      onClose() { if (!answered) resolve(null); }
    });
  });
}

export function chooseDialog(o) {
  return new Promise(resolve => {
    let answered = false;
    openSheet({
      title: o.title || 'Pilih', cls: 'is-dialog',
      content: html`<div class="choice-grid">${o.options.map(op => html`<button type="button" class="choice${op.value === o.value ? ' is-on' : ''}" data-v="${op.value}"><b>${op.label}</b>${op.hint ? html`<span>${op.hint}</span>` : ''}</button>`)}</div>`,
      keepFocus: true,
      onMount(api) {
        api.body.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { answered = true; resolve(b.getAttribute('data-v')); api.close(); }));
        const f = api.body.querySelector('.is-on') || api.body.querySelector('[data-v]');
        if (f) f.focus();
      },
      onClose() { if (!answered) resolve(null); }
    });
  });
}

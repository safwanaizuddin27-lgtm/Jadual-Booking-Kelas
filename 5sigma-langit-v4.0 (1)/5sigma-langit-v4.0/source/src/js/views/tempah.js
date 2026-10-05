/* Tempah: the booking page. The same form as the booking sheet, with room for
   the live preview beside it. Prefill comes from Tanya Sigma or the week grid.
   Data changes (another tab books, the minute ticks) only refresh the preview,
   so nothing the user has typed is lost. */

import { html } from '../ui/dom.js';
import { setHTML } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { navigate } from '../ui/router.js';
import { renderBookingForm } from './booking.js';

let form = null;

export const tempahView = {
  id: 'tempah',
  render(el, params) {
    params = params || {};
    const editing = !!params.editId;
    setHTML(el, html`<div class="page-head"><div><h2 class="page-title">${editing ? (params.silent ? 'Edit kelas (senyap)' : 'Edit tempahan') : 'Tempah kelas tambahan'}</h2>
      <p class="page-sub">${editing ? 'Ubah butiran kelas. Pertembungan disemak serta-merta.' : 'Pilih subjek dan masa. Pertembungan disemak serta-merta, dan Sigma cadangkan masa terbaik.'}</p></div>
      ${editing ? '' : html`<div class="page-tools"><button type="button" class="btn ghost" data-ask-tempah>${icon('spark', 18)}<span>Tempah dengan ayat</span></button></div>`}</div>
      <div class="tile tile-form" data-form></div>`);
    form = renderBookingForm(el.querySelector('[data-form]'), {
      prefill: params, editId: params.editId, silent: params.silent,
      onDone: () => navigate(params.silent ? 'kelas' : 'jadual')
    });
    const ask = el.querySelector('[data-ask-tempah]');
    if (ask) ask.addEventListener('click', () => { if (tempahView.ask) tempahView.ask('tempah '); });
  },
  update() { if (form) form.refresh(); },
  ask: null
};

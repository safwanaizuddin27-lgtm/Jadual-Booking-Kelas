/* The booking form, used on the Tempah page and in a sheet (from the week grid,
   the class sheet, Tanya Sigma). It previews the class on the day's timeline as
   you type, flags clashes immediately, and suggests the best free times. */

import { state } from '../core/store.js';
import { createBooking } from '../core/store.js';
import { updateBooking } from '../core/store.js';
import { findBooking } from '../core/store.js';
import { now } from '../core/clock.js';
import { isoDate } from '../core/util.js';
import { addDays } from '../core/util.js';
import { toMinutes } from '../core/util.js';
import { minutesToTime } from '../core/util.js';
import { timesOverlap } from '../core/util.js';
import { at } from '../core/util.js';
import { SUBJECTS } from '../core/data.js';
import { SCHOOL_HOURS } from '../core/data.js';
import { JS_DAYS } from '../core/data.js';
import { subjectColor } from '../core/data.js';
import { findClashes } from '../core/domain.js';
import { defaultTeacherFor } from '../core/domain.js';
import { sameTeacher } from '../core/domain.js';
import { findSlots } from '../features/slots.js';
import { html } from '../ui/dom.js';
import { setHTML } from '../ui/dom.js';
import { on } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { subjectIcon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDialog } from '../ui/sheet.js';
import { dayLabel } from '../ui/format.js';
import { dayPhrase } from '../ui/format.js';
import { dateLong } from '../ui/format.js';
import { durationText } from '../ui/format.js';

// The day strip in the preview shows 07:00–22:30, widened when a class sits outside it.
const SPAN_FROM = 7 * 60, SPAN_TO = 22 * 60 + 30;
function hourTag(m) { return String(Math.floor(m / 60)).padStart(2, '0'); }

function teacherOptions(subject, selected, manualName) {
  const cfg = state.config;
  const primary = defaultTeacherFor(cfg, subject) || '—';
  const ws = (cfg.workshopTeachers && cfg.workshopTeachers[subject]) || [];
  return html`<optgroup label="Guru subjek ini"><option value="primary"${selected === 'primary' ? ' selected' : ''}>${primary}</option></optgroup>
    ${ws.length ? html`<optgroup label="Guru bengkel">${ws.map(n => html`<option value="${'workshop:' + n}"${selected === 'workshop:' + n ? ' selected' : ''}>${n}</option>`)}</optgroup>` : ''}
    <optgroup label="Lain-lain"><option value="manual"${selected === 'manual' ? ' selected' : ''}>Guru lain…</option></optgroup>`;
}

export function renderBookingForm(root, opts) {
  opts = opts || {};
  const editing = opts.editId ? findBooking(opts.editId) : null;
  const n = now();
  const p = Object.assign({}, opts.prefill || {});
  if (editing) Object.assign(p, { subject: editing.subject, date: editing.date, from: editing.from, to: editing.to, notes: editing.notes || '', teacher: editing.teacher });
  const f = {
    subject: p.subject || '',
    date: p.date || '',
    from: p.from || '',
    to: p.to || '',
    notes: p.notes || '',
    teacherSel: 'primary',
    manual: ''
  };
  if (p.teacher && f.subject) {
    const primary = defaultTeacherFor(state.config, f.subject);
    const ws = (state.config.workshopTeachers[f.subject] || []);
    const w = ws.find(x => sameTeacher(x, p.teacher));
    if (sameTeacher(p.teacher, primary)) f.teacherSel = 'primary';
    else if (w) f.teacherSel = 'workshop:' + w;
    else { f.teacherSel = 'manual'; f.manual = p.teacher; }
  }
  // record: an admin adding a class that was missed (Edit Kelas): any date, quiet, attendance after.
  const record = !!opts.record && !editing;
  const uid = 'bf' + Math.random().toString(36).slice(2, 7);

  setHTML(root, html`
    <form class="booking" novalidate>
      <div class="booking-fields">
        <fieldset class="field">
          <legend class="field-label">Subjek</legend>
          <div class="subject-picker" role="radiogroup" aria-label="Subjek">
            ${SUBJECTS.map(s => html`<button type="button" role="radio" class="subj-chip${f.subject === s.name ? ' is-on' : ''}" aria-checked="${f.subject === s.name ? 'true' : 'false'}" data-subject="${s.name}" style="--c:${s.color}">${subjectIcon(s.name, 17, 'subj-ic')}${s.name}</button>`)}
          </div>
        </fieldset>
        <div class="field-row">
          <label class="field"><span class="field-label">Guru</span>
            <select id="${uid}-teacher" class="input" ${f.subject ? '' : 'disabled'}>${f.subject ? teacherOptions(f.subject, f.teacherSel) : html`<option>Pilih subjek dahulu</option>`}</select>
          </label>
          <label class="field" ${f.teacherSel === 'manual' ? '' : 'hidden'} data-manual><span class="field-label">Nama guru</span>
            <input id="${uid}-manual" class="input" type="text" autocomplete="off" placeholder="Contoh: Cikgu Rahim" value="${f.manual}">
          </label>
        </div>
        <div class="field">
          <span class="field-label" id="${uid}-dl">Tarikh</span>
          <div class="date-row">
            <input id="${uid}-date" class="input" type="date" aria-labelledby="${uid}-dl" value="${f.date}">
            <div class="quick">${(record ? [-2, -1, 0] : [0, 1, 2]).map(i => { const d = isoDate(addDays(n, i)); return html`<button type="button" class="chip${f.date === d ? ' is-on' : ''}" data-date="${d}">${i === 0 ? 'Hari ini' : i === 1 ? 'Esok' : i === 2 ? 'Lusa' : i === -1 ? 'Semalam' : 'Kelmarin'}</button>`; })}</div>
          </div>
        </div>
        <div class="field">
          <span class="field-label">Masa</span>
          <div class="time-row">
            <label class="time-box"><span>Mula</span><input id="${uid}-from" class="input" type="time" step="300" value="${f.from}"></label>
            <span class="time-sep" aria-hidden="true">${icon('arrow', 16)}</span>
            <label class="time-box"><span>Tamat</span><input id="${uid}-to" class="input" type="time" step="300" value="${f.to}"></label>
          </div>
          <div class="quick dur">${[[60, '1 jam'], [90, '1j 30m'], [120, '2 jam']].map(([m, l]) => html`<button type="button" class="chip" data-dur="${m}">${l}</button>`)}</div>
        </div>
        <label class="field"><span class="field-label">Catatan (pilihan)</span>
          <textarea id="${uid}-notes" class="input" rows="2" placeholder="Contoh: Latih tubi Kertas 2">${f.notes}</textarea>
        </label>
        ${record ? html`<label class="check-row" data-attwrap><input type="checkbox" data-att-after checked><span><b>Tanda kehadiran selepas simpan</b><small>Untuk kelas yang sudah berlangsung.</small></span></label>` : ''}
        <p class="form-error" role="alert" hidden></p>
        <div class="form-actions">
          ${opts.inSheet ? html`<button type="button" class="btn ghost" data-cancel>Batal</button>` : ''}
          <button type="submit" class="btn primary btn-lg">${icon(editing ? 'check' : 'plus', 18)}<span>${editing ? 'Kemaskini tempahan' : record ? 'Tambah kelas' : 'Simpan tempahan'}</span></button>
        </div>
      </div>
      <aside class="booking-preview" aria-live="polite">
        <div class="preview-card"></div>
        <div class="preview-day"></div>
        <div class="preview-status"></div>
        <div class="preview-suggest"></div>
      </aside>
    </form>`);

  const form = root.querySelector('form');
  const $id = s => root.querySelector('#' + uid + '-' + s);
  const tSel = $id('teacher'), manualWrap = root.querySelector('[data-manual]'), manualIn = $id('manual');
  const dateIn = $id('date'), fromIn = $id('from'), toIn = $id('to'), notesIn = $id('notes');
  const errEl = root.querySelector('.form-error');

  function teacherName() {
    if (!f.subject) return '';
    if (f.teacherSel === 'primary') return defaultTeacherFor(state.config, f.subject);
    if (f.teacherSel === 'manual') return (manualIn.value || '').trim();
    return f.teacherSel.slice(9);
  }

  function preview() {
    const tn = teacherName();
    const color = f.subject ? subjectColor(f.subject) : '#8D93C2';
    const valid = f.date && f.from && f.to && toMinutes(f.to) > toMinutes(f.from);
    setHTML(root.querySelector('.preview-card'), html`<div class="pv-card${f.subject ? '' : ' is-empty'}" style="--c:${color}">
        <span class="pv-mark" aria-hidden="true">${f.subject ? subjectIcon(f.subject, 132) : html`<b>Σ</b>`}</span>
        <span class="pv-eyebrow">${editing ? 'Selepas dikemaskini' : record ? 'Rekod kelas' : 'Pratonton kelas'}</span>
        <b class="pv-subject">${f.subject || 'Pilih subjek'}</b>
        <span class="pv-teacher">${tn || 'Guru dipilih secara automatik'}</span>
        <span class="pv-when">${f.date ? dateLong(f.date) : 'Pilih tarikh'}${valid ? html` · <b>${f.from}–${f.to}</b> <span class="pv-dur">(${durationText(f.from, f.to)})</span>` : ''}</span>
      </div>`);
    // Day timeline
    const day = f.date ? state.bookings.filter(b => !b.cancelledAt && b.date === f.date && (!editing || b.id !== editing.id)) : [];
    const edges = day.map(b => [toMinutes(b.from), toMinutes(b.to)]).concat(valid ? [[toMinutes(f.from), toMinutes(f.to)]] : []);
    const lo = Math.min(SPAN_FROM, ...edges.map(e => Math.floor(e[0] / 60) * 60));
    const hi = Math.max(SPAN_TO, ...edges.map(e => Math.ceil(e[1] / 60) * 60));
    const pct = m => ((Math.min(Math.max(m, lo), hi) - lo) / (hi - lo) * 100).toFixed(2) + '%';
    const ticks = [];
    for (let m = Math.ceil(lo / 180) * 180; m < hi; m += 180) ticks.push(m);
    const sh = f.date ? SCHOOL_HOURS[JS_DAYS[new Date(f.date + 'T00:00:00').getDay()]] : null;
    const clashes = valid ? findClashes(state.bookings, f.subject, f.date, f.from, f.to, editing ? editing.id : null) : [];
    setHTML(root.querySelector('.preview-day'), f.date ? html`
      <div class="pd-head"><span>${dayLabel(f.date, n)}</span><span>${day.length} kelas lain</span></div>
      <div class="pd-track">
        ${sh ? html`<i class="pd-school" style="left:${pct(toMinutes(sh.from))};width:calc(${pct(toMinutes(sh.to))} - ${pct(toMinutes(sh.from))})" title="Waktu persekolahan"></i>` : ''}
        ${day.map(b => html`<i class="pd-ev" style="left:${pct(toMinutes(b.from))};width:calc(${pct(toMinutes(b.to))} - ${pct(toMinutes(b.from))});--c:${subjectColor(b.subject)}" title="${b.subject} ${b.from}–${b.to}"></i>`)}
        ${valid ? html`<i class="pd-new${clashes.length ? ' is-clash' : ''}" style="left:${pct(toMinutes(f.from))};width:calc(${pct(toMinutes(f.to))} - ${pct(toMinutes(f.from))})"></i>` : ''}
      </div>
      <div class="pd-scale">${ticks.map(m => html`<span style="left:${pct(m)}">${hourTag(m)}</span>`)}</div>` : html`<p class="pd-empty">${icon('jadual', 16)} Pilih tarikh untuk melihat hari itu.</p>`);
    // Status
    let status = '';
    if (valid) {
      const past = at(f.date, f.from) < n && !editing;
      const school = sh && timesOverlap(f.from, f.to, sh.from, sh.to);
      if (record && past) status = clashes.length
        ? html`<p class="pv-status is-clash">${icon('warn', 16)} Bertindih dengan <b>${clashes[0].subject}</b> (${clashes[0].from}–${clashes[0].to}) yang sudah direkod.</p>`
        : html`<p class="pv-status is-ok">${icon('check', 16)} Kelas lepas: direkod sebagai ${at(f.date, f.to) <= n ? 'selesai' : 'sedang berlangsung'}, tanpa notifikasi.</p>`;
      else if (past) status = html`<p class="pv-status is-warn">${icon('warn', 16)} Masa ini sudah lepas.</p>`;
      else if (clashes.length) status = html`<p class="pv-status is-clash">${icon('warn', 16)} Bertindih dengan <b>${clashes[0].subject}</b> (${clashes[0].from}–${clashes[0].to}).</p>`;
      else if (school) status = html`<p class="pv-status is-warn">${icon('info', 16)} Masa ini dalam waktu persekolahan biasa.</p>`;
      else status = html`<p class="pv-status is-ok">${icon('check', 16)} Slot ini kosong. Tiada pertembungan.</p>`;
    } else if (f.from && f.to) status = html`<p class="pv-status is-warn">${icon('warn', 16)} Masa tamat mesti selepas masa mula.</p>`;
    setHTML(root.querySelector('.preview-status'), status);
    // Attendance after saving only makes sense once the class has started.
    const attWrap = root.querySelector('[data-attwrap]');
    if (attWrap) attWrap.hidden = !(valid && at(f.date, f.from) <= n);
    // Suggestions (not for a record of a class that already happened)
    if (record && f.date && f.date <= isoDate(n)) setHTML(root.querySelector('.preview-suggest'), '');
    else if (f.subject) {
      const dates = f.date ? [f.date] : [0, 1, 2, 3].map(i => isoDate(addDays(n, i)));
      const len = valid ? toMinutes(f.to) - toMinutes(f.from) : 60;
      const slots = findSlots(state.bookings.filter(b => !editing || b.id !== editing.id), { dates, subject: f.subject, length: len, now: n, max: 3, teacher: teacherName() });
      setHTML(root.querySelector('.preview-suggest'), slots.length ? html`<div class="ps-head">${icon('wand', 15)} Masa terbaik ${f.date ? (/^[a-z]/.test(dayPhrase(f.date, n)) ? dayPhrase(f.date, n) : 'pada ' + dayPhrase(f.date, n)) : 'dalam 4 hari'}</div>
        <div class="ps-list">${slots.map(s => html`<button type="button" class="ps-slot" data-slot="${s.date}|${s.from}|${s.to}"><b>${f.date ? '' : dayLabel(s.date, n) + ', '}${s.from}–${s.to}</b><span>${s.why.slice(0, 2).join(', ')}</span></button>`)}</div>` : html`<p class="ps-none">Tiada masa kosong yang sesuai ${f.date ? 'pada hari ini' : 'dalam 4 hari'}.</p>`);
    } else setHTML(root.querySelector('.preview-suggest'), '');
  }

  function setSubject(name) {
    f.subject = name;
    f.teacherSel = 'primary';
    root.querySelectorAll('.subj-chip').forEach(c => { const on = c.dataset.subject === name; c.classList.toggle('is-on', on); c.setAttribute('aria-checked', on ? 'true' : 'false'); });
    tSel.disabled = false;
    setHTML(tSel, teacherOptions(name, 'primary'));
    manualWrap.hidden = true;
    preview();
  }
  function setDate(d) {
    f.date = d; dateIn.value = d;
    root.querySelectorAll('[data-date]').forEach(c => c.classList.toggle('is-on', c.dataset.date === d));
    preview();
  }

  on(root, 'click', '.subj-chip', (e, el) => setSubject(el.dataset.subject));
  on(root, 'click', '[data-date]', (e, el) => setDate(el.dataset.date));
  on(root, 'click', '[data-dur]', (e, el) => {
    if (!f.from) { f.from = '14:30'; fromIn.value = f.from; }
    f.to = minutesToTime(Math.min(toMinutes(f.from) + (+el.dataset.dur), 23 * 60 + 55)); toIn.value = f.to;
    preview();
  });
  on(root, 'click', '[data-slot]', (e, el) => {
    const [d, a, b] = el.dataset.slot.split('|');
    f.from = a; f.to = b; fromIn.value = a; toIn.value = b;
    setDate(d);
  });
  tSel.addEventListener('change', () => { f.teacherSel = tSel.value; manualWrap.hidden = f.teacherSel !== 'manual'; if (!manualWrap.hidden) manualIn.focus(); preview(); });
  manualIn.addEventListener('input', preview);
  dateIn.addEventListener('change', () => setDate(dateIn.value));
  dateIn.addEventListener('input', () => { if (dateIn.value) setDate(dateIn.value); });
  fromIn.addEventListener('input', () => {
    const prevLen = f.from && f.to ? toMinutes(f.to) - toMinutes(f.from) : 60;
    f.from = fromIn.value;
    if (f.from && (!f.to || toMinutes(f.to) <= toMinutes(f.from))) { f.to = minutesToTime(Math.min(toMinutes(f.from) + Math.max(30, prevLen), 23 * 60 + 55)); toIn.value = f.to; }
    preview();
  });
  toIn.addEventListener('input', () => { f.to = toIn.value; preview(); });
  notesIn.addEventListener('input', () => { f.notes = notesIn.value; });
  const cancel = root.querySelector('[data-cancel]');
  if (cancel && opts.onCancel) cancel.addEventListener('click', opts.onCancel);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errEl.hidden = true;
    const fields = { subject: f.subject, teacher: teacherName(), date: f.date, day: f.date ? JS_DAYS[new Date(f.date + 'T00:00:00').getDay()] : '', from: f.from, to: f.to, notes: (notesIn.value || '').trim() };
    const fail = m => { errEl.textContent = m; errEl.hidden = false; };
    if (!fields.subject) return fail('Pilih subjek dahulu.');
    if (!fields.teacher) return fail(f.teacherSel === 'manual' ? 'Tulis nama guru.' : 'Subjek ini belum ada guru utama. Pilih "Guru lain".');
    if (!fields.date || !fields.from || !fields.to) return fail('Pilih tarikh, masa mula dan masa tamat.');
    if (toMinutes(fields.to) <= toMinutes(fields.from)) return fail('Masa tamat mesti selepas masa mula.');
    const clashes = findClashes(state.bookings, fields.subject, fields.date, fields.from, fields.to, editing ? editing.id : null);
    if (clashes.length) {
      const go = await confirmDialog({ title: 'Slot ini bertindih', message: clashes[0].subject + ' (' + clashes[0].teacher + ') sudah ditempah ' + clashes[0].from + '–' + clashes[0].to + ' pada hari yang sama. Simpan juga?', confirmLabel: 'Simpan juga' });
      if (!go) return;
    }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    const res = editing ? await updateBooking(editing.id, fields, { silent: !!opts.silent })
      : await createBooking(fields, { silent: !!opts.silent || record, record });
    btn.disabled = false;
    if (!res.ok) return fail(res.message || 'Tempahan gagal disimpan.');
    const attBox = root.querySelector('[data-att-after]'), attWrap2 = root.querySelector('[data-attwrap]');
    const markAfter = !!(record && attBox && attBox.checked && attWrap2 && !attWrap2.hidden);
    toast(editing ? 'Tempahan dikemaskini' : record ? 'Kelas ' + fields.subject + ' ditambah (' + dayPhrase(fields.date, now()) + ', ' + fields.from + ')' : 'Tempahan berjaya! ' + fields.subject + ', ' + dayPhrase(fields.date, now()) + ' ' + fields.from, editing ? 'info' : 'success');
    if (opts.onDone) opts.onDone(editing ? findBooking(editing.id) : res.booking, { markAttendance: markAfter });
  });

  preview();
  return { refresh: preview };
}

export function openBookingSheet(o) {
  o = o || {};
  const s = openSheet({
    title: o.editId ? (o.silent ? 'Edit kelas (senyap)' : 'Edit tempahan') : o.record ? 'Tambah kelas' : 'Tempah kelas', wide: true, cls: 'sheet-booking',
    sub: o.editId ? (o.silent ? 'Perubahan dari Edit Kelas tidak menghantar notifikasi.' : 'Perubahan dihantar kepada kelas sebagai notifikasi.')
      : o.record ? 'Untuk kelas yang terlupa dimasukkan, termasuk yang sudah berlangsung. Disimpan senyap, tanpa notifikasi.'
      : 'Pratonton dan semakan pertembungan muncul semasa anda mengisi.',
    keepFocus: true
  });
  renderBookingForm(s.body, Object.assign({}, o, { inSheet: true, onCancel: () => s.close(), onDone: (b, extra) => { s.close(); if (o.onDone) setTimeout(() => o.onDone(b, extra || {}), 230); } }));
  return s;
}

/* Jadual: the timetable as a week grid (default on wide screens), a day grid
   (default on phones), a month overview and an agenda list.

   On the grids:
   - drag on empty space to book that time, or click/tap it for a one-hour slot;
   - drag a class to move it (another time, or another day in the week view);
   - drag its lower edge to change when it ends.
   Every drag snaps to 15 minutes, shows clashes while you move, asks before
   saving onto a clash, and can be undone from the toast. On touch screens,
   press and hold a class to pick it up (a quick swipe still scrolls).

   Slot Pintar marks the best free times for a subject right on the grid. */

import { state } from '../core/store.js';
import { updateBooking } from '../core/store.js';
import { revertBooking } from '../core/store.js';
import { findBooking } from '../core/store.js';
import { now } from '../core/clock.js';
import { isoDate } from '../core/util.js';
import { parseISO } from '../core/util.js';
import { addDays } from '../core/util.js';
import { startOfWeek } from '../core/util.js';
import { startOfMonth } from '../core/util.js';
import { daysBetween } from '../core/util.js';
import { toMinutes } from '../core/util.js';
import { minutesToTime } from '../core/util.js';
import { timesOverlap } from '../core/util.js';
import { clamp } from '../core/util.js';
import { pad2 } from '../core/util.js';
import { normalize } from '../core/util.js';
import { debounce } from '../core/util.js';
import { SUBJECTS } from '../core/data.js';
import { subjectColor } from '../core/data.js';
import { subjectShort } from '../core/data.js';
import { SCHOOL_HOURS } from '../core/data.js';
import { FRIDAY_PRAYER } from '../core/data.js';
import { JS_DAYS } from '../core/data.js';
import { MONTHS_MY } from '../core/data.js';
import { GRID_FROM } from '../core/data.js';
import { GRID_TO } from '../core/data.js';
import { CLASS_PAPERS } from '../core/data.js';
import { computeStatus } from '../core/domain.js';
import { onTimeNames } from '../core/domain.js';
import { findClashes } from '../core/domain.js';
import { sortByTime } from '../core/domain.js';
import { findSlots } from '../features/slots.js';
import { html } from '../ui/dom.js';
import { setHTML } from '../ui/dom.js';
import { on } from '../ui/dom.js';
import { create } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { subjectIcon } from '../ui/icons.js';
import { subjectBadge } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDialog } from '../ui/sheet.js';
import { dayLabel } from '../ui/format.js';
import { dayPhrase } from '../ui/format.js';
import { dateShort } from '../ui/format.js';
import { dateLong } from '../ui/format.js';
import { dayShort } from '../ui/format.js';
import { durationText } from '../ui/format.js';
import { statusPill } from './actions.js';
import { openClassSheet } from './actions.js';
import { openShareSheet } from './actions.js';
import { openBookingSheet } from './booking.js';

// The grid covers the whole day, 00:00 to 24:00, like the original app's timetable.
const F = GRID_FROM, T = GRID_TO, SPAN = T - F, SNAP = 15;
const MODE_KEY = 'langit5s-jadual-mode';
const MODES = [
  { id: 'day', label: 'Hari', icon: 'list' },
  { id: 'week', label: 'Minggu', icon: 'jadual' },
  { id: 'month', label: 'Bulan', icon: 'grid' },
  { id: 'list', label: 'Senarai', icon: 'filter' }
];
const WD = ['Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab', 'Aha'];

const v = { mode: null, anchor: null, q: '', qRaw: '', subjects: new Set(), cancelled: false, slot: null, scrolledFor: '' };
let root = null, drag = null, suppressUntil = 0, pendingPaint = false;
const suppressed = () => Date.now() < suppressUntil;

/* ---------------------------------------------------------------- helpers */
const pct = m => ((m - F) / SPAN * 100).toFixed(3) + '%';
const pctLen = m => (m / SPAN * 100).toFixed(3) + '%';
const snapM = m => Math.round(m / SNAP) * SNAP;

function defaultMode() {
  let m = null;
  try { m = localStorage.getItem(MODE_KEY); } catch (e) { m = null; }
  if (MODES.some(x => x.id === m)) return m;
  return window.matchMedia && window.matchMedia('(max-width: 767px)').matches ? 'day' : 'week';
}
function saveMode() { try { localStorage.setItem(MODE_KEY, v.mode); } catch (e) { /* per-viewer nicety only */ } }

function matches(b) {
  if (b.cancelledAt && !v.cancelled) return false;
  if (v.subjects.size && !v.subjects.has(b.subject)) return false;
  if (v.q) {
    const hay = normalize([b.subject, b.teacher, b.notes || '', b.createdBy || ''].join(' '));
    if (!v.q.split(/\s+/).every(w => hay.includes(w))) return false;
  }
  return true;
}
function bookingsOn(iso) { return sortByTime(state.bookings.filter(b => b.date === iso && matches(b))); }

function range() {
  const a = parseISO(v.anchor);
  if (v.mode === 'day') return { from: v.anchor, to: v.anchor, days: [v.anchor] };
  if (v.mode === 'week') {
    const ws = startOfWeek(a);
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => isoDate(addDays(ws, i)));
    return { from: days[0], to: days[6], days };
  }
  if (v.mode === 'month') {
    const ms = startOfMonth(a), me = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    return { from: isoDate(ms), to: isoDate(me), days: [] };
  }
  return { from: v.anchor, to: isoDate(addDays(a, 27)), days: [] };
}
function rangeTitle(r) {
  if (v.mode === 'day') return dateLong(v.anchor);
  if (v.mode === 'month') { const a = parseISO(v.anchor); return MONTHS_MY[a.getMonth()] + ' ' + a.getFullYear(); }
  return dateShort(r.from) + ' – ' + dateShort(r.to) + ' ' + parseISO(r.to).getFullYear();
}
function step(dir) {
  const a = parseISO(v.anchor);
  if (v.mode === 'day') v.anchor = isoDate(addDays(a, dir));
  else if (v.mode === 'week') v.anchor = isoDate(addDays(a, 7 * dir));
  else if (v.mode === 'month') v.anchor = isoDate(new Date(a.getFullYear(), a.getMonth() + dir, 1));
  else v.anchor = isoDate(addDays(a, 28 * dir));
}
function inRange(r) { return state.bookings.filter(b => b.date >= r.from && b.date <= r.to && matches(b)); }

// Side-by-side lanes for classes that overlap (the Islam/Moral pair, or a clash).
function layout(list, n) {
  const today = isoDate(n), nowMin = n.getHours() * 60 + n.getMinutes();
  const items = list.map(b => {
    const st = computeStatus(b, n);
    let e = Math.max(toMinutes(b.to), toMinutes(b.from) + 15);
    // An open-ended extension grows with the clock until someone stops it.
    if (st === 'extending' && b.date === today) e = Math.max(e, Math.min(T, nowMin));
    return { b, st, s: toMinutes(b.from), e, lane: 0, lanes: 1 };
  });
  let cluster = [], end = -1;
  const flush = () => { const n2 = Math.max(...cluster.map(x => x.lane)) + 1; cluster.forEach(x => { x.lanes = n2; }); cluster = []; end = -1; };
  items.forEach(it => {
    if (cluster.length && it.s >= end) flush();
    const used = cluster.filter(x => x.e > it.s).map(x => x.lane);
    let lane = 0;
    while (used.includes(lane)) lane++;
    it.lane = lane;
    cluster.push(it);
    end = Math.max(end, it.e);
  });
  if (cluster.length) flush();
  return items;
}

function canMove(b, st) { return !!state.user && st === 'upcoming'; }

/* ---------------------------------------------------------------- markup */
function pageHTML() {
  return html`
    <div class="page-head jd-head">
      <div><h2 class="page-title">Jadual</h2><p class="page-sub" data-range>&nbsp;</p></div>
      <div class="seg seg-lg jd-modes" role="tablist" aria-label="Paparan jadual">${MODES.map(m => html`<button type="button" role="tab" data-mode="${m.id}">${icon(m.icon, 16)}<span>${m.label}</span></button>`)}</div>
    </div>
    <div class="jd-bar">
      <div class="jd-nav">
        <button type="button" class="icon-btn" data-step="-1" aria-label="Sebelum">${icon('left', 20)}</button>
        <button type="button" class="chip" data-today>Hari ini</button>
        <button type="button" class="icon-btn" data-step="1" aria-label="Seterusnya">${icon('right', 20)}</button>
      </div>
      <label class="search-box jd-search">${icon('search', 16)}<input class="input" type="search" placeholder="Cari subjek, guru atau catatan" aria-label="Cari kelas" value="${v.qRaw}"></label>
      <div class="jd-actions">
        <button type="button" class="btn ghost sm" data-slots>${icon('wand', 16)}<span>Slot Pintar</span></button>
        <button type="button" class="btn ghost sm" data-share>${icon('share', 16)}<span>Kongsi</span></button>
        <button type="button" class="btn primary sm" data-new>${icon('plus', 16)}<span>Tempah</span></button>
      </div>
    </div>
    <div class="jd-subjects" role="group" aria-label="Tapis mengikut subjek">
      <button type="button" class="chip" data-subj="">Semua</button>
      ${SUBJECTS.map(s => html`<button type="button" class="chip chip-subj" data-subj="${s.name}" title="${s.name}" style="--c:${s.color}">${subjectIcon(s.name, 15)}${s.short}</button>`)}
      <button type="button" class="chip" data-cancelled>${icon('trash', 14)}<span>Dibatalkan</span></button>
    </div>
    <div class="jd-slotbar" hidden></div>
    <div class="jd-body"></div>
    <p class="jd-hint" data-hint></p>`;
}

function syncBar(r, count) {
  const set = (sel, fn) => root.querySelectorAll(sel).forEach(fn);
  set('[data-mode]', b => { const on_ = b.dataset.mode === v.mode; b.classList.toggle('is-on', on_); b.setAttribute('aria-selected', on_ ? 'true' : 'false'); });
  set('[data-subj]', b => b.classList.toggle('is-on', b.dataset.subj ? v.subjects.has(b.dataset.subj) : !v.subjects.size));
  set('[data-cancelled]', b => b.classList.toggle('is-on', v.cancelled));
  set('[data-slots]', b => b.classList.toggle('is-on', !!v.slot));
  const rt = root.querySelector('[data-range]');
  if (rt) rt.textContent = rangeTitle(r) + ' · ' + count + ' kelas';
  const hint = root.querySelector('[data-hint]');
  if (hint) hint.textContent = (v.mode === 'week' || v.mode === 'day')
    ? (window.matchMedia && window.matchMedia('(pointer: coarse)').matches
      ? 'Tekan ruang kosong untuk menempah. Tekan lama pada kelas untuk mengalihnya.'
      : 'Klik atau seret pada ruang kosong untuk menempah. Seret kelas untuk mengalih, atau tarik hujung bawahnya untuk ubah masa tamat.')
    : '';
}

function stripHTML(n) {
  const ws = startOfWeek(parseISO(v.anchor)), today = isoDate(n);
  return html`<div class="cal-strip" role="group" aria-label="Pilih hari">${[0, 1, 2, 3, 4, 5, 6].map(i => {
    const iso = isoDate(addDays(ws, i)), list = bookingsOn(iso);
    return html`<button type="button" class="strip-d${iso === v.anchor ? ' is-on' : ''}${iso === today ? ' is-today' : ''}" data-goday="${iso}" aria-label="${dateLong(iso)}, ${list.length} kelas">
      <span>${WD[i]}</span><b>${parseISO(iso).getDate()}</b><i>${list.slice(0, 4).map(b => html`<em style="--c:${subjectColor(b.subject)}"></em>`)}</i></button>`;
  })}</div>`;
}

function evHTML(it, n) {
  const b = it.b, st = it.st, dur = it.e - it.s;
  const can = canMove(b, st);
  const ci = onTimeNames(b).length;   // bintang skibidi earned in this class
  const style = 'top:' + pct(it.s) + ';height:' + pctLen(it.e - it.s) + ';left:calc(' + it.lane + ' * 100% / ' + it.lanes + ');width:calc(100% / ' + it.lanes + ');--c:' + subjectColor(b.subject);
  const live = st === 'ongoing' || st === 'extending';
  return html`<button type="button" class="ev st-${st}${dur < 50 ? ' is-short' : ''}${dur >= 100 ? ' is-tall' : ''}${can ? ' can-move' : ''}${it.lanes > 1 ? ' is-split' : ''}" data-id="${b.id}" style="${style}" aria-label="${b.subject}, ${dayLabel(b.date, n)} ${b.from} hingga ${b.to}, ${b.teacher}">
    <span class="ev-in">
      <b class="ev-s">${subjectIcon(b.subject, 14, 'ev-ic')}<span class="ev-full">${b.subject}</span><span class="ev-short">${subjectShort(b.subject)}</span></b>
      <span class="ev-t">${b.from}–${st === 'extending' ? 'extend' : b.to}</span>
      <span class="ev-who">${b.teacher}</span>
      ${b.notes ? html`<span class="ev-note">${b.notes}</span>` : ''}
    </span>
    ${live ? html`<span class="ev-live"><i class="pulse"></i></span>` : ''}
    ${ci ? html`<span class="ev-ci" title="${ci} bintang skibidi (hadir tepat masa)">${icon('star', 10)}${ci}</span>` : ''}
    ${can ? html`<span class="ev-grip" data-resize aria-hidden="true"></span>` : ''}
  </button>`;
}

function colHTML(iso, n, slots) {
  const dn = JS_DAYS[parseISO(iso).getDay()];
  const sh = SCHOOL_HOURS[dn];
  const today = isoDate(n), nowMin = n.getHours() * 60 + n.getMinutes();
  const items = layout(bookingsOn(iso), n);
  const band = (from, to, cls, label) => html`<i class="${cls}" style="top:${pct(toMinutes(from))};height:${pctLen(toMinutes(to) - toMinutes(from))}"><span>${label}</span></i>`;
  return html`<div class="cal-col${iso === today ? ' is-today' : ''}${iso < today ? ' is-past' : ''}" data-date="${iso}">
    ${sh ? band(sh.from, sh.to, 'cal-school', 'Waktu sekolah') : ''}
    ${dn === 'Friday' ? band(FRIDAY_PRAYER.from, FRIDAY_PRAYER.to, 'cal-prayer', 'Solat Jumaat') : ''}
    ${slots.filter(s => s.date === iso).map((s, i) => html`<button type="button" class="cal-slot" data-slot="${s.date}|${s.from}|${s.to}" style="top:${pct(toMinutes(s.from))};height:${pctLen(toMinutes(s.to) - toMinutes(s.from))};--d:${i * 90}ms" title="${s.why.join(', ')}">
      <span>${icon('spark', 13)}<b>${s.from}–${s.to}</b></span><small>${s.why[0] || 'masa sesuai'}</small></button>`)}
    ${items.map(it => evHTML(it, n))}
    ${iso === today && nowMin >= F && nowMin <= T ? html`<i class="cal-now" style="top:${pct(nowMin)}"></i>` : ''}
  </div>`;
}

function gridHTML(r, n) {
  const today = isoDate(n), nowMin = n.getHours() * 60 + n.getMinutes();
  const slots = v.slot ? slotSuggestions(r, n) : [];
  const hours = [];
  for (let h = Math.ceil(F / 60); h < T / 60; h++) hours.push(h);
  return html`<div class="cal cal-${v.mode}" style="--cols:${r.days.length};--hours:${SPAN / 60}">
    ${v.mode === 'day' ? stripHTML(n) : html`<div class="cal-head">
      <div class="cal-corner"></div>
      ${r.days.map(iso => { const c = bookingsOn(iso).length; return html`<button type="button" class="cal-dh${iso === today ? ' is-today' : ''}${iso < today ? ' is-past' : ''}" data-goday="${iso}" aria-label="Buka ${dateLong(iso)}">
        <span>${dayShort(iso)}</span><b>${parseISO(iso).getDate()}</b><i>${c ? c + ' kelas' : ''}</i></button>`; })}
    </div>`}
    <div class="cal-scroll">
      <div class="cal-grid">
        <div class="cal-times" aria-hidden="true">${hours.map(h => html`<span style="top:${pct(h * 60)}">${pad2(h)}:00</span>`)}
          ${r.days.includes(today) && nowMin >= F && nowMin <= T ? html`<b class="cal-nowlabel" style="top:${pct(nowMin)}">${pad2(n.getHours())}:${pad2(n.getMinutes())}</b>` : ''}</div>
        <div class="cal-days">${r.days.map(iso => colHTML(iso, n, slots))}</div>
      </div>
    </div>
  </div>`;
}

// SPM on this day for this class: "Bertutur BM", "Amali FIZ", "SPM BIO", "SPM PI/PM".
function spmTag(iso) {
  const list = CLASS_PAPERS.filter(p => iso >= p.date && iso <= p.dateTo);
  if (!list.length) return '';
  const kind = list[0].kind;
  const pre = kind === 'lisan' ? 'Bertutur ' : kind === 'amali' ? 'Amali ' : 'SPM ';
  return pre + Array.from(new Set(list.map(p => subjectShort(p.subject)))).join('/');
}
function monthHTML(n) {
  const a = parseISO(v.anchor), ms = startOfMonth(a), gs = startOfWeek(ms);
  const me = new Date(a.getFullYear(), a.getMonth() + 1, 0);
  const weeks = Math.ceil((daysBetween(isoDate(gs), isoDate(me)) + 1) / 7);
  const today = isoDate(n);
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(gs, i), iso = isoDate(d), list = bookingsOn(iso), tag = spmTag(iso);
    cells.push(html`<button type="button" class="mon-cell${d.getMonth() !== a.getMonth() ? ' is-other' : ''}${iso === today ? ' is-today' : ''}${iso < today ? ' is-past' : ''}${tag ? ' has-tag' : ''}" data-goday="${iso}" style="--n:${Math.min(list.length, 4)}" aria-label="${dateLong(iso)}: ${list.length} kelas${tag ? ', ' + tag : ''}">
      <span class="mon-top"><span class="mon-n">${d.getDate()}</span>${tag ? html`<span class="mon-tag">${tag}</span>` : ''}</span>
      <span class="mon-evs">${list.slice(0, 3).map(b => html`<span class="mon-ev st-${computeStatus(b, n)}" style="--c:${subjectColor(b.subject)}">${subjectIcon(b.subject, 12)}<span class="mon-time">${b.from}</span><span class="mon-sub">${subjectShort(b.subject)}</span></span>`)}${list.length > 3 ? html`<em>+${list.length - 3} lagi</em>` : ''}</span>
      <span class="mon-dots">${list.slice(0, 5).map(b => html`<i style="--c:${subjectColor(b.subject)}"></i>`)}</span>
    </button>`);
  }
  return html`<div class="mon"><div class="mon-head">${WD.map(d => html`<span>${d}</span>`)}</div><div class="mon-grid" style="--weeks:${weeks}">${cells}</div></div>`;
}

function listHTML(r, n) {
  const today = isoDate(n), groups = [];
  for (let d = parseISO(r.from); isoDate(d) <= r.to; d = addDays(d, 1)) {
    const iso = isoDate(d), list = bookingsOn(iso);
    if (list.length) groups.push({ iso, list });
  }
  if (!groups.length) return html`<div class="empty jd-empty"><b>Tiada kelas dalam julat ini</b><p>${v.q || v.subjects.size ? 'Cuba buang carian atau penapis subjek.' : 'Tempah kelas baharu atau lihat minggu lain.'}</p></div>`;
  return html`<div class="agenda">${groups.map(g => html`<section class="ag-day${g.iso === today ? ' is-today' : ''}${g.iso < today ? ' is-past' : ''}">
    <h3 class="ag-date"><b>${dayLabel(g.iso, n)}</b><span>${dateLong(g.iso)}</span><i>${g.list.length} kelas</i></h3>
    <div class="ag-list">${g.list.map(b => { const st = computeStatus(b, n); return html`<button type="button" class="ag-row st-${st}" data-open="${b.id}" style="--c:${subjectColor(b.subject)}">
      <span class="ag-time"><b>${b.from}</b><span>${b.to}</span></span>${subjectBadge(b.subject, 'md')}
      <span class="ag-main"><b>${b.subject}</b><span>${b.teacher} · ${durationText(b.from, b.to)}${b.notes ? ' · ' + b.notes : ''}</span></span>
      ${statusPill(st)}</button>`; })}</div></section>`)}</div>`;
}

/* ---------------------------------------------------------------- Slot Pintar */
function slotSuggestions(r, n) {
  const today = isoDate(n);
  const dates = r.days.filter(d => d >= today);
  if (!dates.length || !v.slot) return [];
  return findSlots(state.bookings, { dates, subject: v.slot.subject, length: v.slot.len, now: n, max: v.mode === 'day' ? 3 : 6 });
}
function slotBar(r, n) {
  const bar = root.querySelector('.jd-slotbar');
  if (!bar) return;
  if (!v.slot || (v.mode !== 'week' && v.mode !== 'day')) { bar.hidden = true; return; }
  const slots = slotSuggestions(r, n);
  bar.hidden = false;
  setHTML(bar, html`<span class="slotbar-ic">${icon('wand', 18)}</span>
    <span class="slotbar-text"><b>Slot Pintar: ${v.slot.subject}, ${v.slot.len === 60 ? '1 jam' : v.slot.len === 90 ? '1 jam 30 minit' : '2 jam'}.</b>
      ${slots.length ? html`${slots.length} masa terbaik ditanda emas. Tekan satu untuk menempah.` : html`Tiada masa sesuai ${v.mode === 'day' ? 'pada hari ini' : 'minggu ini'}. Cuba ${v.mode === 'day' ? 'hari' : 'minggu'} seterusnya.`}</span>
    <button type="button" class="btn ghost sm" data-slots>Tukar</button>
    <button type="button" class="icon-btn" data-slotoff aria-label="Tutup Slot Pintar">${icon('x', 16)}</button>`);
}
function openSlotPicker() {
  let subj = v.slot ? v.slot.subject : (v.subjects.size === 1 ? Array.from(v.subjects)[0] : null);
  let len = v.slot ? v.slot.len : 60;
  const s = openSheet({ title: 'Slot Pintar', sub: 'Sigma menimbang waktu sekolah, solat Jumaat, maghrib, kelas lain dan tarikh SPM, lalu menandakan masa terbaik pada jadual.', cls: 'is-dialog sheet-slots', keepFocus: true,
    content: html`<div class="field"><span class="field-label">Subjek</span><div class="subject-picker">${SUBJECTS.map(x => html`<button type="button" class="subj-chip${subj === x.name ? ' is-on' : ''}" data-s="${x.name}" style="--c:${x.color}">${subjectIcon(x.name, 17, 'subj-ic')}${x.name}</button>`)}</div></div>
      <div class="field slot-len"><span class="field-label">Tempoh</span><div class="quick">${[[60, '1 jam'], [90, '1j 30m'], [120, '2 jam']].map(([m, l]) => html`<button type="button" class="chip${len === m ? ' is-on' : ''}" data-len="${m}">${l}</button>`)}</div></div>
      <div class="sheet-actions">${v.slot ? html`<button type="button" class="btn ghost" data-off>Matikan</button>` : ''}<button type="button" class="btn primary" data-go>${icon('wand', 18)}<span>Tunjuk masa terbaik</span></button></div>` });
  on(s.body, 'click', '[data-s]', (e, el) => { subj = el.dataset.s; s.body.querySelectorAll('[data-s]').forEach(x => x.classList.toggle('is-on', x === el)); });
  on(s.body, 'click', '[data-len]', (e, el) => { len = +el.dataset.len; s.body.querySelectorAll('[data-len]').forEach(x => x.classList.toggle('is-on', x === el)); });
  on(s.body, 'click', '[data-off]', () => { v.slot = null; s.close(); paintBody(true); });
  on(s.body, 'click', '[data-go]', () => {
    if (!subj) { toast('Pilih subjek dahulu.', 'error'); return; }
    v.slot = { subject: subj, len };
    if (v.mode !== 'week' && v.mode !== 'day') v.mode = 'week';
    const today = isoDate(now());
    if (range().to < today) v.anchor = today;
    s.close();
    v.scrolledFor = '';
    paintBody();
  });
}

/* ---------------------------------------------------------------- paint */
function paintBody(keepScroll) {
  if (!root) return;
  if (drag && drag.active) { pendingPaint = true; return; }
  const body = root.querySelector('.jd-body');
  if (!body) return;
  const sc = body.querySelector('.cal-scroll');
  const prevTop = sc ? sc.scrollTop : 0;
  const n = now();
  const r = range();
  body.classList.toggle('no-anim', !!keepScroll);
  syncBar(r, inRange(r).filter(b => !b.cancelledAt).length);
  slotBar(r, n);
  if (!state.ready.bookings) { setHTML(body, html`<div class="tile skel jd-skel"><i></i><i></i><i></i></div>`); return; }
  if (v.mode === 'week' || v.mode === 'day') setHTML(body, gridHTML(r, n));
  else if (v.mode === 'month') setHTML(body, monthHTML(n));
  else setHTML(body, listHTML(r, n));
  const sc2 = body.querySelector('.cal-scroll');
  if (sc2) {
    const key = v.mode + '|' + r.from;
    if (keepScroll && v.scrolledFor === key) sc2.scrollTop = prevTop;
    else {
      // Open at "now" on a range with today, else at the first class, else after school.
      const today = isoDate(n);
      let m = 13 * 60;
      if (r.days.includes(today)) m = n.getHours() * 60 + n.getMinutes() - 75;
      else { const first = inRange(r).map(b => toMinutes(b.from)).sort((a, b) => a - b)[0]; if (first != null) m = first - 45; }
      const grid = sc2.querySelector('.cal-grid');
      sc2.scrollTop = Math.max(0, (clamp(m, F, T) - F) / SPAN * grid.offsetHeight);
      v.scrolledFor = key;
    }
  }
}

function share() {
  const n = now(), r = range();
  const list = sortByTime(inRange(r).filter(b => !b.cancelledAt && computeStatus(b, n) !== 'ended'));
  if (!list.length) { toast('Tiada kelas akan datang dalam julat ini untuk dikongsi.', 'info'); return; }
  openShareSheet(list, 'Jadual 5 Sigma, ' + rangeTitle(r));
}

/* ---------------------------------------------------------------- drag & drop */
function gridEl() { return root.querySelector('.cal-grid'); }
function minuteAt(y) {
  const g = gridEl();
  if (!g) return F;
  const r = g.getBoundingClientRect();
  return F + (y - r.top) / r.height * SPAN;
}
function colAt(x) {
  const cols = Array.from(root.querySelectorAll('.cal-col'));
  if (!cols.length) return null;
  for (const c of cols) { const r = c.getBoundingClientRect(); if (x >= r.left && x < r.right) return c; }
  return x < cols[0].getBoundingClientRect().left ? cols[0] : cols[cols.length - 1];
}

function onDown(e) {
  if (drag) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const col = e.target.closest('.cal-col');
  if (!col || e.target.closest('.cal-slot')) return;
  const evEl = e.target.closest('.ev');
  let kind = 'create', b = null;
  if (evEl) {
    if (!evEl.classList.contains('can-move')) return;           // a plain click opens it
    b = findBooking(evEl.dataset.id);
    if (!b) return;
    kind = e.target.closest('[data-resize]') ? 'resize' : 'move';
  } else if (!state.user) return;
  const touch = e.pointerType !== 'mouse';
  if (!touch) e.preventDefault();                               // no text selection while dragging
  drag = { kind, b, el: evEl, col, pointerId: e.pointerId, touch, active: false, x0: e.clientX, y0: e.clientY, cx: e.clientX, cy: e.clientY, startMin: minuteAt(e.clientY) };
  if (b) drag.grab = drag.startMin - toMinutes(b.from);
  if (touch) drag.timer = setTimeout(() => { if (drag && !drag.active) activate(); }, 420);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
}

function onMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  drag.cx = e.clientX; drag.cy = e.clientY;
  const dist = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
  if (!drag.active) {
    if (drag.touch) { if (dist > 10) finish(); return; }          // a swipe: let the page scroll
    if (dist < 5) return;
    activate();
  }
  e.preventDefault();
  place();
  autoScroll(e.clientY);
}

function activate() {
  const d = drag;
  d.active = true;
  clearTimeout(d.timer);
  if (d.touch && navigator.vibrate) { try { navigator.vibrate(12); } catch (err) { /* ignore */ } }
  document.body.classList.add('is-dragging');
  if (d.el) {
    d.el.classList.add('is-source');
    d.ghost = d.el.cloneNode(true);
    d.ghost.classList.remove('is-source', 'is-split');
    d.ghost.removeAttribute('data-id');
    d.ghost.setAttribute('aria-hidden', 'true');
    d.ghost.style.left = '0';
    d.ghost.style.width = '100%';
  } else {
    d.ghost = create('div', { class: 'ev ev-new', 'aria-hidden': 'true' });
  }
  d.ghost.classList.add('ev-ghost');
  d.label = create('span', { class: 'ghost-label' });
  d.ghost.appendChild(d.label);
  place();
}

function place() {
  const d = drag;
  if (!d || !d.active) return;
  const m = minuteAt(d.cy);
  let col = d.col, from, to;
  if (d.kind === 'move') {
    if (v.mode === 'week') col = colAt(d.cx) || d.col;
    const len = toMinutes(d.b.to) - toMinutes(d.b.from);
    from = clamp(snapM(m - d.grab), F, T - len);
    to = from + len;
  } else if (d.kind === 'resize') {
    from = toMinutes(d.b.from);
    to = clamp(snapM(m), from + SNAP, T);
  } else {
    const a = Math.floor(d.startMin / SNAP) * SNAP, c = snapM(m);
    from = clamp(Math.min(a, c), F, T - 30);
    to = clamp(Math.max(a, c), from + 30, T);
  }
  if (d.ghost.parentNode !== col) col.appendChild(d.ghost);
  const date = col.dataset.date;
  d.res = { date, from: minutesToTime(from), to: minutesToTime(to) };
  d.ghost.style.top = pct(from);
  d.ghost.style.height = pctLen(to - from);
  const clashes = findClashes(state.bookings, d.b ? d.b.subject : '', date, d.res.from, d.res.to, d.b ? d.b.id : null);
  const sh = SCHOOL_HOURS[JS_DAYS[parseISO(date).getDay()]];
  const school = !!sh && timesOverlap(d.res.from, d.res.to, sh.from, sh.to);
  const past = date + 'T' + d.res.from < isoDate(now()) + 'T' + pad2(now().getHours()) + ':' + pad2(now().getMinutes());
  const t = d.ghost.querySelector('.ev-t');
  if (t) t.textContent = d.res.from + '–' + d.res.to;
  d.ghost.classList.toggle('is-clash', clashes.length > 0);
  d.ghost.classList.toggle('is-warn', !clashes.length && (school || past));
  const moved = d.b && date !== d.b.date ? dayShort(date) + ', ' : '';
  d.label.textContent = moved + d.res.from + '–' + d.res.to + (clashes.length ? ' · bertindih ' + clashes[0].subject : past ? ' · masa sudah lepas' : school ? ' · waktu sekolah' : '');
}

function autoScroll(y) {
  const sc = root.querySelector('.cal-scroll');
  if (!sc || !drag) return;
  const r = sc.getBoundingClientRect(), edge = 56;
  let dy = 0;
  if (y < r.top + edge) dy = -Math.ceil((r.top + edge - y) / 5);
  else if (y > r.bottom - edge) dy = Math.ceil((y - (r.bottom - edge)) / 5);
  drag.scrollV = clamp(dy, -16, 16);
  if (drag.scrollV && !drag.raf) {
    const loop = () => {
      if (!drag || !drag.active || !drag.scrollV) { if (drag) drag.raf = 0; return; }
      sc.scrollTop += drag.scrollV;
      place();
      drag.raf = requestAnimationFrame(loop);
    };
    drag.raf = requestAnimationFrame(loop);
  }
}

function finish() {
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onCancel);
  if (!drag) return null;
  const d = drag;
  clearTimeout(d.timer);
  if (d.raf) cancelAnimationFrame(d.raf);
  if (d.ghost && d.ghost.parentNode) d.ghost.remove();
  if (d.el) d.el.classList.remove('is-source');
  document.body.classList.remove('is-dragging');
  drag = null;
  if (pendingPaint) { pendingPaint = false; paintBody(true); }
  return d;
}
function onCancel(e) { if (drag && e.pointerId === drag.pointerId) finish(); }

async function onUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const wasActive = drag.active;
  const d = finish();
  if (!wasActive || !d || !d.res) return;                       // a click: the click handlers take it
  suppressUntil = Date.now() + 500;                             // the click that follows a drop is not a click
  const res = d.res;
  if (d.kind === 'create') {
    openBookingSheet({ prefill: { date: res.date, from: res.from, to: res.to, subject: v.slot ? v.slot.subject : (v.subjects.size === 1 ? Array.from(v.subjects)[0] : '') } });
    return;
  }
  const b = findBooking(d.b.id);
  if (!b || (res.date === b.date && res.from === b.from && res.to === b.to)) return;
  const clashes = findClashes(state.bookings, b.subject, res.date, res.from, res.to, b.id);
  if (clashes.length) {
    const go = await confirmDialog({ title: 'Masa ini bertindih', message: clashes[0].subject + ' (' + clashes[0].teacher + ') sudah ditempah ' + clashes[0].from + '–' + clashes[0].to + '. ' + (d.kind === 'resize' ? 'Ubah masa tamat juga?' : 'Pindahkan juga?'), confirmLabel: d.kind === 'resize' ? 'Ubah juga' : 'Pindah juga' });
    if (!go) { paintBody(true); return; }
  }
  const before = Object.assign({}, b);
  const r = await updateBooking(b.id, { date: res.date, day: JS_DAYS[parseISO(res.date).getDay()], from: res.from, to: res.to }, { deferNotify: true });
  if (!r.ok) { toast(r.message || 'Tidak dapat menyimpan perubahan.', 'error'); paintBody(true); return; }
  const msg = d.kind === 'resize' ? b.subject + ' kini tamat ' + res.to : b.subject + ' dialih ke ' + dayPhrase(res.date, now()) + ', ' + res.from + '–' + res.to;
  toast(msg, { type: 'success', action: { label: 'Buat asal', run: async () => {
    const x = await revertBooking(before);
    toast(x.ok ? b.subject + ' kembali ke ' + before.from + '–' + before.to : 'Gagal mengembalikan kelas.', x.ok ? 'info' : 'error');
  } } });
}

function quickCreate(date, m) {
  if (!state.user) return;
  const s = clamp(Math.floor(m / 30) * 30, F, T - 60);
  openBookingSheet({ prefill: { date, from: minutesToTime(s), to: minutesToTime(s + 60), subject: v.slot ? v.slot.subject : (v.subjects.size === 1 ? Array.from(v.subjects)[0] : '') } });
}

/* ---------------------------------------------------------------- view */
function wire(el) {
  on(el, 'click', '[data-mode]', (e, b) => { v.mode = b.dataset.mode; saveMode(); paintBody(); });
  on(el, 'click', '[data-step]', (e, b) => { step(+b.dataset.step); paintBody(); });
  on(el, 'click', '[data-today]', () => { v.anchor = isoDate(now()); v.scrolledFor = ''; paintBody(); });
  on(el, 'click', '[data-goday]', (e, b) => {
    if (v.mode === 'day' && v.anchor === b.dataset.goday) return;
    v.anchor = b.dataset.goday; v.mode = 'day'; paintBody();
  });
  on(el, 'click', '[data-subj]', (e, b) => {
    const s = b.dataset.subj;
    if (!s) v.subjects.clear();
    else if (v.subjects.has(s)) v.subjects.delete(s); else v.subjects.add(s);
    paintBody(true);
  });
  on(el, 'click', '[data-cancelled]', () => { v.cancelled = !v.cancelled; paintBody(true); });
  const search = debounce(val => { v.qRaw = val; v.q = normalize(val.trim()); paintBody(true); }, 160);
  on(el, 'input', '.jd-search input', (e, inp) => search(inp.value));
  on(el, 'click', '[data-new]', () => { const t = isoDate(now()); openBookingSheet({ prefill: { date: v.anchor >= t ? v.anchor : t } }); });
  on(el, 'click', '[data-share]', share);
  on(el, 'click', '[data-slots]', openSlotPicker);
  on(el, 'click', '[data-slotoff]', () => { v.slot = null; paintBody(true); });
  on(el, 'click', '.cal-slot', (e, b) => { const [d, f, t] = b.dataset.slot.split('|'); openBookingSheet({ prefill: { subject: v.slot ? v.slot.subject : '', date: d, from: f, to: t } }); });
  on(el, 'click', '.ev', (e, b) => { if (!suppressed() && b.dataset.id) openClassSheet(b.dataset.id); });
  on(el, 'click', '[data-open]', (e, b) => openClassSheet(b.dataset.open));
  on(el, 'click', '.cal-col', (e, col) => { if (suppressed() || e.target.closest('.ev, .cal-slot')) return; quickCreate(col.dataset.date, minuteAt(e.clientY)); });
  el.addEventListener('pointerdown', onDown);
  // Once a class is picked up on a touch screen, the finger moves it instead of the page.
  el.addEventListener('touchmove', e => { if (drag && drag.active) e.preventDefault(); }, { passive: false });
  el.addEventListener('contextmenu', e => { if (drag && drag.touch) e.preventDefault(); });
  el.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowLeft' && e.altKey) { step(-1); paintBody(); }
    else if (e.key === 'ArrowRight' && e.altKey) { step(1); paintBody(); }
  });
}

export const jadualView = {
  id: 'jadual',
  render(el, params) {
    root = el;
    if (!v.mode) v.mode = defaultMode();
    if (!v.anchor) v.anchor = isoDate(now());
    if (params && params.date) { v.anchor = params.date; v.scrolledFor = ''; }
    if (params && params.mode && MODES.some(m => m.id === params.mode)) v.mode = params.mode;
    if (params && params.slot) v.slot = params.slot;
    if (params && params.subject) { v.subjects.clear(); v.subjects.add(params.subject); }
    setHTML(el, pageHTML());
    if (!el.dataset.wired) { el.dataset.wired = '1'; wire(el); }
    v.scrolledFor = '';
    paintBody();
  },
  update() { paintBody(true); },
  leave() { if (drag) finish(); }
};

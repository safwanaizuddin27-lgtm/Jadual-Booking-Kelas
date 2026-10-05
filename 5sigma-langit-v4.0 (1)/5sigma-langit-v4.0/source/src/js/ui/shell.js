/* The frame around every page: the glass rail (laptop/tablet), the top bar with
   Tanya Sigma and the live-class pill, and the tab bar on phones. */

import { state } from '../core/store.js';
import { now } from '../core/clock.js';
import { onSecond } from '../core/clock.js';
import { at } from '../core/util.js';
import { subjectColor } from '../core/data.js';
import { computeStatus } from '../core/domain.js';
import { sortByTime } from '../core/domain.js';
import { html } from './dom.js';
import { setHTML } from './dom.js';
import { on } from './dom.js';
import { icon } from './icons.js';
import { navigate } from './router.js';
import { currentView } from './router.js';
import { onNavigate } from './router.js';
import { openSheet } from './sheet.js';
import { initials } from '../core/util.js';
import { minutesText } from './format.js';
import { personName } from './format.js';
import { dateLong } from './format.js';
import { dateMedium } from './format.js';
import { prefersReducedMotion } from './dom.js';
import { isoDate } from '../core/util.js';
import { rafThrottle } from '../core/util.js';

export const NAV = [
  { id: 'utama', label: 'Utama', icon: 'utama' },
  { id: 'jadual', label: 'Jadual', icon: 'jadual' },
  { id: 'tempah', label: 'Tempah', icon: 'tempah' },
  { id: 'statistik', label: 'Analitik', icon: 'statistik' },
  { id: 'guru', label: 'Guru', icon: 'guru' },
  { id: 'subjek', label: 'Subjek', icon: 'subjek' },
  { id: 'spm', label: 'SPM', icon: 'spm' },
  { id: 'pengguna', label: 'Rakan', icon: 'pengguna' },
  { id: 'kelas', label: 'Edit Kelas', icon: 'kelas', admin: true },
  { id: 'tetap', label: 'Jadual Tetap', icon: 'tetap', admin: true },
  { id: 'tetapan', label: 'Tetapan', icon: 'tetapan' }
];
export const TITLES = { utama: 'Utama', jadual: 'Jadual', tempah: 'Tempah slot', statistik: 'Analitik', guru: 'Guru', subjek: 'Subjek', spm: 'Jadual SPM', pengguna: 'Rakan sekelas', kelas: 'Edit kelas', tetap: 'Jadual tetap', tetapan: 'Tetapan', paparan: 'Paparan kelas' };

let hooks = {};
export function initShell(h) {
  hooks = h;
  renderShell();
  onNavigate(id => { markActive(id); setTitle(id); });
  onSecond(updateLive);
  // Phones: the page's own big title scrolls away, then the top bar takes it over.
  const onScroll = rafThrottle(() => document.documentElement.classList.toggle('is-scrolled', window.scrollY > 56));
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', rafThrottle(fitDate));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitDate);
  const top = document.getElementById('topbar');
  on(document.getElementById('app'), 'click', '[data-go]', (e, el) => { e.preventDefault(); navigate(el.dataset.go); });
  on(top, 'click', '[data-act]', (e, el) => act(el.dataset.act, el));
  on(document.getElementById('rail'), 'click', '[data-act]', (e, el) => act(el.dataset.act, el));
  on(document.getElementById('tabbar'), 'click', '[data-act]', (e, el) => act(el.dataset.act, el));
}
function act(a, el) {
  if (a === 'ask') hooks.ask();
  else if (a === 'notif') hooks.notifications();
  else if (a === 'profile') hooks.profile();
  else if (a === 'theme') hooks.theme(el);
  else if (a === 'more') openMore();
  else if (a === 'live') hooks.openClass(el.dataset.id);
  else if (a === 'display') navigate('paparan');
  else if (a === 'sandbox' && state.isAdmin) hooks.sandbox();
}

function items() { return NAV.filter(n => !n.admin || state.isAdmin); }

export function renderShell() {
  const u = state.user;
  const rail = document.getElementById('rail');
  setHTML(rail, html`
    <a class="rail-mark" href="#utama" data-go="utama" aria-label="Utama"><span class="mark">5<i>Σ</i></span></a>
    <div class="rail-nav">${items().map(n => html`<a href="#${n.id}" class="rail-item" data-go="${n.id}" data-nav="${n.id}" aria-label="${n.label}">${icon(n.icon, 21)}<span>${n.label}</span></a>`)}</div>
    <div class="rail-foot">
      <button type="button" class="rail-item" data-act="theme" aria-label="Tukar tema">${icon(document.documentElement.getAttribute('data-theme') === 'light' ? 'moon' : 'sun', 20)}<span>Tema</span></button>
      <button type="button" class="avatar-btn" data-act="profile" aria-label="Profil ${u ? u.name : ''}"><span class="avatar">${u ? initials(u.name) : '?'}</span></button>
    </div>`);
  const top = document.getElementById('topbar');
  setHTML(top, html`
    <div class="tb-left">
      <a class="tb-mark" href="#utama" data-go="utama" aria-label="Utama"><span class="mark">5<i>Σ</i></span></a>
      <div class="tb-title"><h1 id="page-title">Utama</h1><span id="page-date" class="tb-date"><span class="tb-date-in">${dateLong(isoDate(now()))}</span></span></div>
    </div>
    <button type="button" class="ask-pill" data-act="ask" aria-label="Tanya Sigma">
      <span class="ask-orb" aria-hidden="true">Σ</span><span class="ask-text">Tanya Sigma: "slot kosong esok untuk Fizik"</span><kbd>Ctrl K</kbd>
    </button>
    <div class="tb-right">
      <button type="button" class="live-pill" id="live-pill" data-act="live" hidden></button>
      <button type="button" class="icon-btn hide-sm" data-act="display" aria-label="Paparan kelas" title="Paparan kelas">${icon('display', 20)}</button>
      ${state.isAdmin ? html`<button type="button" class="sandbox-chip hide-sm" data-act="sandbox" title="Sumber data, jam aplikasi dan sandaran">Data</button>` : ''}
      <button type="button" class="icon-btn bell" data-act="notif" aria-label="Notifikasi">${icon('bell', 20)}<span class="badge" id="notif-badge" hidden>0</span></button>
      <button type="button" class="avatar-btn show-sm" data-act="profile" aria-label="Profil"><span class="avatar">${u ? initials(u.name) : '?'}</span></button>
    </div>`);
  const tab = document.getElementById('tabbar');
  setHTML(tab, html`
    <a href="#utama" class="tab" data-go="utama" data-nav="utama">${icon('utama', 22)}<span>Utama</span></a>
    <a href="#jadual" class="tab" data-go="jadual" data-nav="jadual">${icon('jadual', 22)}<span>Jadual</span></a>
    <a href="#tempah" class="tab tab-main" data-go="tempah" data-nav="tempah" aria-label="Tempah kelas"><span class="tab-plus">${icon('plus', 26)}</span><span>Tempah</span></a>
    <button type="button" class="tab" data-act="ask">${icon('spark', 22)}<span>Tanya</span></button>
    <button type="button" class="tab" data-act="more" data-nav-more>${icon('grid', 22)}<span>Lagi</span></button>`);
  markActive(currentView());
  setTitle(currentView());
  updateBadge();
  updateLive();
  fitDate();
}

/* The date under the title. On a narrow phone it can be wider than its space:
   then it glides to its end and back, so the whole date can be read. With
   reduced motion it switches to the shorter form instead. */
let dateShown = '', dateFitted = false;
export function fitDate() {
  const box = document.getElementById('page-date');
  if (!box) return;
  const inner = box.firstElementChild;
  const iso = isoDate(now());
  box.classList.remove('is-marquee');
  inner.textContent = dateLong(iso);
  dateShown = iso;
  // Not laid out yet (the app is still hidden behind the sign-in): try again on the next tick.
  dateFitted = !!box.clientWidth;
  if (!dateFitted) return;
  const over = inner.scrollWidth - box.clientWidth;
  if (over <= 1) return;
  if (prefersReducedMotion()) { inner.textContent = dateMedium(iso); return; }
  box.style.setProperty('--shift', -(over + 8) + 'px');
  box.style.setProperty('--dur', (5 + over / 14).toFixed(1) + 's');
  box.classList.add('is-marquee');
}

function markActive(id) {
  document.querySelectorAll('[data-nav]').forEach(el => {
    const on_ = el.dataset.nav === id;
    el.classList.toggle('is-active', on_);
    if (on_) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
  });
  const more = document.querySelector('[data-nav-more]');
  if (more) more.classList.toggle('is-active', !['utama', 'jadual', 'tempah'].includes(id));
}
function setTitle(id) {
  const t = document.getElementById('page-title');
  if (t) t.textContent = TITLES[id] || 'Utama';
  document.title = (id && id !== 'utama' ? (TITLES[id] || '') + ' · ' : '') + '5 Sigma Class Hub';
}

export function updateBadge() {
  const unread = state.notifications.filter(n => !n.read).length;
  const b = document.getElementById('notif-badge');
  if (!b) return;
  b.hidden = !unread;
  b.textContent = unread > 9 ? '9+' : String(unread);
}

function updateLive() {
  const pill = document.getElementById('live-pill');
  if (!pill || !state.user) return;
  const n = now();
  const wasHidden = pill.hidden, wasText = pill.textContent;
  paintLive(pill, n);
  // The pill takes room from the date beside it; midnight changes the date itself.
  if (!dateFitted || pill.hidden !== wasHidden || pill.textContent.length !== wasText.length || isoDate(n) !== dateShown) fitDate();
}
function paintLive(pill, n) {
  const act = sortByTime(state.bookings.filter(b => !b.cancelledAt && b.date === isoDate(n)));
  const live = act.find(b => { const s = computeStatus(b, n); return s === 'ongoing' || s === 'extending'; });
  if (live) {
    const left = Math.max(0, Math.round((at(live.date, live.to) - n) / 60000));
    pill.hidden = false;
    pill.dataset.id = live.id;
    pill.className = 'live-pill is-live' + (live.extensionActive ? ' is-ext' : '');
    pill.style.setProperty('--c', subjectColor(live.subject));
    const txt = live.subject + ' · ' + (live.extensionActive ? 'extend' : minutesText(left).replace(' minit', ' min'));
    if (pill.textContent !== txt) setHTML(pill, html`<i class="pulse"></i><span>${live.subject}</span><b>${live.extensionActive ? 'extend' : minutesText(left).replace(' minit', ' min')}</b>`);
    return;
  }
  const next = act.find(b => computeStatus(b, n) === 'upcoming' && at(b.date, b.from) - n < 3 * 3600000);
  if (next) {
    pill.hidden = false;
    pill.dataset.id = next.id;
    pill.className = 'live-pill is-next';
    pill.style.setProperty('--c', subjectColor(next.subject));
    const mins = Math.max(0, Math.round((at(next.date, next.from) - n) / 60000));
    setHTML(pill, html`<span>${next.subject}</span><b>${mins < 60 ? mins + ' min lagi' : next.from}</b>`);
  } else pill.hidden = true;
}

function openMore() {
  const s = openSheet({ title: 'Menu', cls: 'sheet-more', keepFocus: true,
    content: html`<div class="more-grid">${items().filter(n => !['utama', 'jadual', 'tempah'].includes(n.id)).map(n => html`<button type="button" class="more-item" data-to="${n.id}">${icon(n.icon, 24)}<span>${n.label}</span></button>`)}
      <button type="button" class="more-item" data-to="paparan">${icon('display', 24)}<span>Paparan kelas</span></button></div>
      <div class="menu-list">
        <button type="button" data-x="profile">${icon('user', 18)}<span>${state.user ? personName(state.user.name) : 'Profil'}</span></button>
        <button type="button" data-x="theme">${icon(document.documentElement.getAttribute('data-theme') === 'light' ? 'moon' : 'sun', 18)}<span>Tukar tema</span></button>
        ${state.isAdmin ? html`<button type="button" data-x="sandbox">${icon('database', 18)}<span>Data dan jam aplikasi</span></button>` : ''}
      </div>` });
  on(s.body, 'click', '[data-to]', (e, el) => { s.close(); navigate(el.dataset.to); });
  on(s.body, 'click', '[data-x]', (e, el) => { const x = el.dataset.x; s.close(); setTimeout(() => act(x === 'profile' ? 'profile' : x, el), 220); });
}

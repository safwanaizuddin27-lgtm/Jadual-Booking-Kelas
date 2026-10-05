/* Paparan Kelas: the classroom screen. Put it on the projector or TV at the
   front of the class. It shows the class that is on now, what is left of
   today, and the class constellation: a student's star lights up when the
   admin marks them present on time (one bintang skibidi). There is no
   self check-in: some students stay in the hostel without their phones.
   With no class on, it counts down to the next one.

   The screen stays awake while it is open (Screen Wake Lock, where supported). */

import { state } from '../core/store.js';
import { now } from '../core/clock.js';
import { onSecond } from '../core/clock.js';
import { isoDate } from '../core/util.js';
import { at } from '../core/util.js';
import { pad2 } from '../core/util.js';
import { subjectColor } from '../core/data.js';
import { STUDENT_NAMES } from '../core/data.js';
import { SPM } from '../core/data.js';
import { computeStatus } from '../core/domain.js';
import { sortByTime } from '../core/domain.js';
import { rosterFor } from '../core/domain.js';
import { onTimeNames } from '../core/domain.js';
import { html } from '../ui/dom.js';
import { setHTML } from '../ui/dom.js';
import { on } from '../ui/dom.js';
import { create } from '../ui/dom.js';
import { prefersReducedMotion } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { subjectBadge } from '../ui/icons.js';
import { subjectIcon } from '../ui/icons.js';
import { navigate } from '../ui/router.js';
import { dayLabel } from '../ui/format.js';
import { dateLong } from '../ui/format.js';
import { minutesText } from '../ui/format.js';
import { personName } from '../ui/format.js';
import { durationText } from '../ui/format.js';
import { constellationHTML } from './login.js';
import { toggleTheme } from '../fx/theme.js';
import { getTheme } from '../fx/theme.js';

let root = null, stopTick = null, wake = null;
let shownKey = '', seen = null;

function focusClass(n) {
  const today = isoDate(n);
  const list = sortByTime(state.bookings.filter(b => !b.cancelledAt && b.date === today));
  const live = list.find(b => { const s = computeStatus(b, n); return s === 'ongoing' || s === 'extending'; });
  if (live) return { b: live, live: true };
  // The screen turns to a class 15 minutes before it starts.
  const soon = list.find(b => computeStatus(b, n) === 'upcoming' && at(b.date, b.from) - n <= 15 * 60000);
  return soon ? { b: soon, live: false } : null;
}

function clockHTML(n) { return html`${pad2(n.getHours())}:${pad2(n.getMinutes())}<small>:${pad2(n.getSeconds())}</small>`; }

function liveHTML(f, n) {
  const b = f.b;
  const roster = rosterFor(b.subject);
  const starred = onTimeNames(b).filter(x => roster.includes(x));
  const marked = b.attendance && Object.keys(b.attendance).length > 0;
  const lit = {};
  starred.forEach(x => { lit[x] = true; });
  const start = at(b.date, b.from).getTime(), end = at(b.date, b.to).getTime();
  const rest = sortByTime(state.bookings.filter(x => !x.cancelledAt && x.id !== b.id && x.date === b.date && computeStatus(x, n) === 'upcoming'));
  return html`
    <main class="disp-main">
      <section class="disp-class">
        <div class="disp-head">${subjectBadge(b.subject, 'xl', 'is-solid')}<span class="disp-eyebrow${f.live ? ' is-live' : ''}">${f.live ? html`<i class="pulse"></i>${b.extensionActive ? 'Sedang extend' : 'Sedang berlangsung'}` : html`${icon('clock', 18)}<span data-starts>Bermula dalam ${Math.max(1, Math.ceil((start - n) / 60000))} minit</span>`}</span></div>
        <h1 class="disp-subject">${b.subject}</h1>
        <p class="disp-teacher">${b.teacher}${b.notes ? html`<span> · ${b.notes}</span>` : ''}</p>
        <div class="disp-time"><b>${b.from}</b><span>–</span><b>${b.to}</b><em>${durationText(b.from, b.to)}</em></div>
        <div class="disp-progress" aria-hidden="true"><i data-progress style="width:${f.live ? Math.min(100, Math.max(0, (n - start) / (end - start) * 100)).toFixed(2) : 0}%"></i></div>
        <p class="disp-left" data-left>${f.live ? leftText(b, n) : 'Bermula pukul ' + b.from}</p>
      </section>
      <section class="disp-code disp-agenda">
        <span class="disp-code-label">${icon('jadual', 18)} Selepas ini hari ini</span>
        ${rest.length ? html`<ul class="disp-list">${rest.map(x => html`<li style="--c:${subjectColor(x.subject)}">${subjectIcon(x.subject, 20, 'dl-ic')}<b>${x.from}</b><span>${x.subject}</span><em>${x.teacher}</em></li>`)}</ul>` : html`<p class="disp-none">Tiada lagi kelas selepas ini.</p>`}
        <p class="disp-rule">${icon('star', 18)}<span>Hadir tepat masa = <b>1 bintang skibidi</b>. Lewat tidak dapat bintang.</span></p>
      </section>
    </main>
    <footer class="disp-foot">
      <div class="disp-sky">${constellationHTML({ static: true, names: roster, lit, cls: 'is-display', label: 'Bintang skibidi ' + b.subject })}</div>
      <div class="disp-tally">
        <p class="tally-big"><b>${starred.length}</b><span>/${roster.length}</span></p>
        <p class="tally-cap">${marked ? html`bintang skibidi${starred.length === roster.length ? html` · <span class="gold">semua tepat masa!</span>` : ''}` : 'Kehadiran belum ditanda'}</p>
      </div>
    </footer>`;
}

function leftText(b, n) {
  const end = at(b.date, b.to).getTime();
  const ms = end - n.getTime();
  if (ms < 0) return '+' + Math.floor(-ms / 60000) + ' minit lebih masa (extend)';
  const m = Math.ceil(ms / 60000);
  return minutesText(m) + ' lagi';
}

function idleHTML(n) {
  const today = isoDate(n);
  const next = sortByTime(state.bookings.filter(b => !b.cancelledAt && computeStatus(b, n) === 'upcoming'))[0];
  const rest = sortByTime(state.bookings.filter(b => !b.cancelledAt && b.date === today && computeStatus(b, n) === 'upcoming'));
  const online = STUDENT_NAMES.filter(x => state.users[x] && state.users[x].lastSeen && Date.now() - state.users[x].lastSeen.getTime() < 5 * 60000);
  const spmDays = Math.max(0, Math.round((new Date(SPM.writtenStart + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000));
  return html`
    <main class="disp-main is-idle">
      <section class="disp-class">
        <span class="disp-eyebrow">${icon('orbit', 18)} Tiada kelas sedang berlangsung</span>
        ${next ? html`<div class="disp-head" style="--c:${subjectColor(next.subject)}">${subjectBadge(next.subject, 'xl')}</div><h1 class="disp-subject" style="--c:${subjectColor(next.subject)}">${next.subject}</h1>
          <p class="disp-teacher">Kelas seterusnya · ${dayLabel(next.date, n)}, ${next.from}–${next.to} · ${next.teacher}</p>
          <div class="disp-count" data-next="${at(next.date, next.from).getTime()}">${countText(at(next.date, next.from) - n)}</div>
          <p class="disp-left">${at(next.date, next.from) - n < 86400000 ? 'jam : minit : saat' : 'hari lagi'}</p>`
          : html`<h1 class="disp-subject">Langit lapang</h1><p class="disp-teacher">Belum ada kelas akan datang dalam jadual.</p>`}
      </section>
      <section class="disp-code disp-agenda">
        <span class="disp-code-label">${icon('jadual', 18)} Baki kelas hari ini</span>
        ${rest.length ? html`<ul class="disp-list">${rest.map(b => html`<li style="--c:${subjectColor(b.subject)}">${subjectIcon(b.subject, 20, 'dl-ic')}<b>${b.from}</b><span>${b.subject}</span><em>${b.teacher}</em></li>`)}</ul>` : html`<p class="disp-none">Tiada lagi kelas hari ini.</p>`}
        <div class="disp-spm"><b>${spmDays}</b><span>hari lagi ke SPM bertulis</span></div>
      </section>
    </main>
    <footer class="disp-foot">
      <div class="disp-sky">${constellationHTML({ static: true, online, cls: 'is-display', label: 'Rakan sekelas' })}</div>
      <div class="disp-tally"><p class="tally-big"><b>${online.length}</b><span>/${STUDENT_NAMES.length}</span></p><p class="tally-cap">rakan sedang aktif dalam aplikasi</p></div>
    </footer>`;
}

function countText(ms) {
  if (ms >= 86400000) return String(Math.ceil(ms / 86400000));
  const s = Math.max(0, Math.floor(ms / 1000));
  return pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor((s % 3600) / 60)) + ':' + pad2(s % 60);
}

function paint() {
  if (!root) return;
  const n = now();
  const f = focusClass(n);
  const key = f ? f.b.id + (f.live ? ':live' : ':soon') : 'idle';
  const fresh = [];
  if (f) {
    const names = onTimeNames(f.b);
    if (seen && shownKey === key) names.forEach(x => { if (!seen.has(x)) fresh.push(x); });
    seen = new Set(names);
  } else seen = null;
  shownKey = key;
  let host = root.querySelector('.disp-host');
  if (!host) {
    setHTML(root, html`<div class="disp-host"></div><div class="disp-flash" aria-live="polite"></div>`);
    host = root.querySelector('.disp-host');
  }
  const same = host.firstElementChild && host.firstElementChild.dataset.key === key;
  setHTML(host, html`<div class="disp${f ? ' has-class' : ''}${same ? ' is-static' : ''}" data-key="${key}" style="--c:${f ? subjectColor(f.b.subject) : 'var(--gold)'}">
    <header class="disp-top">
      <div class="disp-brand"><span class="disp-mark"><span class="mark">5<i>Σ</i></span></span><div><b>Paparan Kelas</b><span>5 Sigma · ${dateLong(isoDate(n))}</span></div></div>
      <div class="disp-clock" data-clock>${clockHTML(n)}</div>
      <div class="disp-tools">
        ${document.fullscreenEnabled ? html`<button type="button" class="icon-btn" data-fs aria-label="Skrin penuh" title="Skrin penuh">${icon('expand', 20)}</button>` : ''}
        <button type="button" class="icon-btn" data-theme aria-label="Tukar tema" title="Tukar tema">${icon(getTheme() === 'dark' ? 'sun' : 'moon', 20)}</button>
        <button type="button" class="btn ghost sm" data-exit>${icon('x', 16)}<span>Tutup</span></button>
      </div>
    </header>
    ${f ? liveHTML(f, n) : idleHTML(n)}
  </div>`);
  // A whole class marked at once gets one banner, not thirteen.
  if (fresh.length > 3) celebrate(fresh, fresh.length + ' bintang skibidi', 'baru ditanda');
  else fresh.forEach((x, i) => setTimeout(() => celebrate([x], personName(x), '+1 bintang skibidi'), i * 450));
}

// The admin just marked someone present on time: their star flares and a banner crosses the screen.
function celebrate(names, title, sub) {
  if (!root) return;
  names.forEach(name => {
    const star = root.querySelector('.disp-sky [data-star="' + name + '"]');
    if (star) { star.classList.remove('is-new'); void star.offsetWidth; star.classList.add('is-new'); }
  });
  const flash = root.querySelector('.disp-flash');
  if (!flash) return;
  const el = create('div', { class: 'flash-item' }, html`${icon('star', 22)}<b>${title}</b><span>${sub}</span>`);
  flash.appendChild(el);
  setTimeout(() => el.remove(), prefersReducedMotion() ? 1500 : 3200);
}

function tick(n) {
  if (!root || !root.isConnected) return;
  const f = focusClass(n);
  const key = f ? f.b.id + (f.live ? ':live' : ':soon') : 'idle';
  if (key !== shownKey) { paint(); return; }
  const clock = root.querySelector('[data-clock]');
  if (clock) setHTML(clock, clockHTML(n));
  if (f) {
    const start = at(f.b.date, f.b.from).getTime(), end = at(f.b.date, f.b.to).getTime();
    const bar = root.querySelector('[data-progress]');
    if (bar && f.live) bar.style.width = Math.min(100, Math.max(0, (n - start) / (end - start) * 100)).toFixed(2) + '%';
    const lt = root.querySelector('[data-left]');
    if (lt && f.live) lt.textContent = leftText(f.b, n);
    const st = root.querySelector('[data-starts]');
    if (st) st.textContent = 'Bermula dalam ' + Math.max(1, Math.ceil((start - n) / 60000)) + ' minit';
  } else {
    const c = root.querySelector('[data-next]');
    if (c) { const ms = +c.dataset.next - n.getTime(); if (ms <= 0) { paint(); return; } c.textContent = countText(ms); }
  }
}

async function keepAwake() {
  try {
    if (!('wakeLock' in navigator) || (wake && !wake.released)) return;
    wake = await navigator.wakeLock.request('screen');
  } catch (e) { wake = null; }
}
function onVisible() { if (!document.hidden && root && root.isConnected && document.documentElement.dataset.page === 'paparan') keepAwake(); }

export const paparanView = {
  id: 'paparan',
  render(el) {
    root = el;
    shownKey = ''; seen = null;
    setHTML(el, '');
    paint();
    if (!stopTick) stopTick = onSecond(tick);
    keepAwake();
    if (!el.dataset.wired) {
      el.dataset.wired = '1';
      on(el, 'click', '[data-exit]', () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); navigate('utama'); });
      on(el, 'click', '[data-fs]', () => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      });
      on(el, 'click', '[data-theme]', (e, b) => { toggleTheme(b); setTimeout(paint, 60); });
      document.addEventListener('visibilitychange', onVisible);
    }
  },
  update(reason) {
    // The screen shows classes and attendance; the activity feed and notifications don't change it.
    if (reason === 'activity' || reason === 'notifications') return;
    if (reason === 'users' && shownKey !== 'idle') return;
    paint();
  },
  leave() {
    if (stopTick) { stopTick(); stopTick = null; }
    if (wake) { try { wake.release(); } catch (e) { /* ignore */ } wake = null; }
    root = null;
  }
};

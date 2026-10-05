/* Utama: the bento dashboard. The class that is live right now leads (orbit ring
   countdown, bintang skibidi so far, actions); the next class counts down on a
   rolling clock; SPM, bintang skibidi, today's timeline, the week at a glance,
   who is online, and Tanya Sigma sit around it. */

import { state } from '../core/store.js';
import { isStudent } from '../core/store.js';
import { now } from '../core/clock.js';
import { onSecond } from '../core/clock.js';
import { isoDate } from '../core/util.js';
import { addDays } from '../core/util.js';
import { startOfWeek } from '../core/util.js';
import { toMinutes } from '../core/util.js';
import { at } from '../core/util.js';
import { pad2 } from '../core/util.js';
import { subjectColor } from '../core/data.js';
import { SPM } from '../core/data.js';
import { SCHOOL_HOURS } from '../core/data.js';
import { JS_DAYS } from '../core/data.js';
import { STUDENT_NAMES } from '../core/data.js';
import { computeStatus } from '../core/domain.js';
import { sortByTime } from '../core/domain.js';
import { rosterFor } from '../core/domain.js';
import { attendanceFor } from '../core/domain.js';
import { attendanceOverall } from '../core/domain.js';
import { streakFor } from '../core/domain.js';
import { starsFrom } from '../core/domain.js';
import { onTimeNames } from '../core/domain.js';
import { atRiskStudents } from '../core/domain.js';
import { html } from '../ui/dom.js';
import { setHTML } from '../ui/dom.js';
import { on } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { subjectBadge } from '../ui/icons.js';
import { subjectIcon } from '../ui/icons.js';
import { navigate } from '../ui/router.js';
import { dayLabel } from '../ui/format.js';
import { dayPhrase } from '../ui/format.js';
import { dateShort } from '../ui/format.js';
import { rangeShort } from '../ui/format.js';
import { minutesText } from '../ui/format.js';
import { greeting } from '../ui/format.js';
import { firstName } from '../ui/format.js';
import { personName } from '../ui/format.js';
import { timeAgo } from '../ui/format.js';
import { dateLong } from '../ui/format.js';
import { openClassSheet } from './actions.js';
import { openAttendanceSheet } from './actions.js';
import { openExtendSheet } from './actions.js';
import { openStopExtendSheet } from './actions.js';
import { constellationHTML } from './login.js';
import { classPapers } from './spm.js';
import { nextPaper } from './spm.js';
import { countUp } from '../fx/motion.js';

let root = null, stopTick = null, ask = () => {};
export function setDashboardAsk(fn) { ask = fn; }

const ACT_IC = { LOGIN: 'user', LOGOUT: 'logout', CREATE_BOOKING: 'tempah', UPDATE_BOOKING: 'kelas', DELETE_BOOKING: 'trash', UPDATE_TEACHER: 'tetapan' };

function daysTo(iso, today) { return Math.round((new Date(iso + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000); }

function skeleton() {
  return html`<div class="bento is-loading" aria-busy="true">${['t-hero', 't-now', 't-next', 't-spm', 't-stars', 't-today', 't-week', 't-up'].map(c => html`<div class="tile skel ${c}"><i></i><i></i><i></i></div>`)}</div>`;
}

/* ---------- tiles ---------- */
function heroTile(n) {
  const u = state.user;
  const today = isoDate(n);
  const todays = state.bookings.filter(b => !b.cancelledAt && b.date === today);
  const left = todays.filter(b => computeStatus(b, n) !== 'ended').length;
  return html`<h2 class="hero-hi">${greeting(n.getHours())}, <span>${u ? firstName(u.name) : ''}</span></h2>
    <p class="hero-sub">${todays.length ? html`${todays.length} kelas hari ini${left && left < todays.length ? html`, ${left} lagi belum tamat` : ''}.` : 'Tiada kelas tambahan hari ini.'} <span class="muted">${dateLong(today)}</span></p>`;
}

function orbitInfo(b, n) {
  const start = at(b.date, b.from).getTime(), end = at(b.date, b.to).getTime(), t = n.getTime();
  const over = t > end;   // an open-ended extension running past the planned end
  return {
    p: over ? 1 : Math.min(1, Math.max(0, (t - start) / (end - start))),
    over,
    mins: over ? Math.floor((t - end) / 60000) : Math.max(0, Math.round((end - t) / 60000)),
    cap: over ? 'minit lebih masa' : (b.extensionActive ? 'minit (extend)' : 'minit lagi')
  };
}
function orbit(b, n) {
  const o = orbitInfo(b, n);
  return html`<div class="orbit-wrap${o.over ? ' is-over' : ''}" style="--p:${o.p.toFixed(4)}">
    <svg class="orbit" viewBox="0 0 120 120" aria-hidden="true">
      <circle class="orbit-track" cx="60" cy="60" r="52"/>
      <circle class="orbit-fill" cx="60" cy="60" r="52" pathLength="100"/>
      <g class="orbit-dot"><circle cx="60" cy="8" r="5.5"/></g>
    </svg>
    <div class="orbit-center"><b data-live-left>${o.over ? '+' + o.mins : o.mins}</b><span data-live-cap>${o.cap}</span></div>
  </div>`;
}
function liveNow(n) {
  return sortByTime(state.bookings.filter(b => !b.cancelledAt && b.date === isoDate(n))).find(b => { const s = computeStatus(b, n); return s === 'ongoing' || s === 'extending'; });
}

function nowTile(n) {
  const live = liveNow(n);
  const u = state.user;
  if (!live) {
    const nx = sortByTime(state.bookings.filter(b => !b.cancelledAt && computeStatus(b, n) === 'upcoming'))[0];
    return html`<div class="now-empty">
      <span class="eyebrow">${icon('orbit', 16)} Sekarang</span>
      <h3>Tiada kelas sedang berlangsung</h3>
      <p class="muted">${nx ? html`Kelas seterusnya: <b>${nx.subject}</b>, ${dayPhrase(nx.date, n)} ${nx.from}.` : 'Belum ada kelas akan datang dalam jadual.'}</p>
      <div class="tile-actions"><a href="#tempah" class="btn primary" data-go="tempah">${icon('plus', 18)}<span>Tempah kelas</span></a>
        <button type="button" class="btn ghost" data-ask="slot kosong esok">${icon('wand', 18)}<span>Cari slot kosong</span></button></div>
    </div>`;
  }
  const roster = rosterFor(live.subject);
  const att = live.attendance || {};
  const marked = Object.keys(att).length > 0;
  const starred = roster.filter(x => att[x] === 'hadir').length;
  const mine = u && att[u.name];
  return html`<div class="now-live" data-id="${live.id}" style="--c:${subjectColor(live.subject)}">
    <div class="now-main">
      <span class="eyebrow live">${html`<i class="pulse"></i>`}${live.extensionActive ? 'Sedang extend' : 'Sedang berlangsung'}</span>
      <h3 class="now-subject">${subjectBadge(live.subject, 'lg', 'is-solid')}<span>${live.subject}</span></h3>
      <p class="now-teacher">${live.teacher}${live.notes ? html` · <span class="muted">${live.notes}</span>` : ''}</p>
      <p class="now-time">${live.from}<span>–</span>${live.to}</p>
      <div class="now-checkins"><div class="mini-stars" aria-hidden="true">${roster.map(x => html`<i class="${att[x] === 'hadir' ? 'on' : ''}"></i>`)}</div><span>${marked ? html`<b>${starred}/${roster.length}</b> bintang skibidi${mine === 'hadir' ? html` · <span class="ok">termasuk anda</span>` : mine === 'lewat' ? html` · <span class="muted">anda lewat</span>` : ''}` : html`Kehadiran belum ditanda`}</span></div>
      <div class="tile-actions">
        ${state.isAdmin ? html`<button type="button" class="btn primary" data-att="${live.id}">${icon('check', 18)}<span>Tanda kehadiran</span></button>` : ''}
        ${live.extensionActive ? html`<button type="button" class="btn danger" data-stopext="${live.id}">${icon('clock', 18)}<span>Hentikan extend</span></button>`
          : html`<button type="button" class="btn ghost" data-extend="${live.id}">${icon('clock', 18)}<span>Extend</span></button>`}
        <a href="#paparan" class="btn ghost" data-go="paparan">${icon('display', 18)}<span>Paparan kelas</span></a>
      </div>
    </div>
    ${orbit(live, n)}
  </div>`;
}

function odo(value) {
  // Rolling digits: each digit is a strip 0-9 moved into place.
  return html`<span class="odo" aria-hidden="true">${String(value).split('').map(ch => /\d/.test(ch) ? html`<span class="odo-d" style="--v:${ch}"><span>0123456789</span></span>` : html`<span class="odo-sep">${ch}</span>`)}</span>`;
}
function countdownParts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor((s % 3600) / 60)) + ':' + pad2(s % 60);
}
function nextTile(n) {
  const nx = sortByTime(state.bookings.filter(b => !b.cancelledAt && computeStatus(b, n) === 'upcoming'))[0];
  if (!nx) return html`<span class="eyebrow">${icon('clock', 16)} Seterusnya</span><h3>Tiada kelas akan datang</h3><p class="muted">Tempah satu, atau minta Tanya Sigma cari masa terbaik.</p>`;
  const ms = at(nx.date, nx.from) - n;
  const within = ms < 24 * 3600000;
  return html`<button type="button" class="tile-link" data-open="${nx.id}" style="--c:${subjectColor(nx.subject)}">
    <span class="eyebrow">${icon('clock', 16)} Seterusnya</span>
    <span class="next-subject">${subjectBadge(nx.subject, 'sm')}${nx.subject}</span>
    <span class="next-when">${dayLabel(nx.date, n)}, ${nx.from}–${nx.to} · ${nx.teacher}</span>
    ${within ? html`<span class="next-count" data-next-at="${at(nx.date, nx.from).getTime()}" aria-label="Bermula dalam ${minutesText(Math.round(ms / 60000))}">${odo(countdownParts(ms))}</span><span class="next-cap">jam : minit : saat</span>`
      : html`<span class="next-days"><b>${Math.ceil(ms / 86400000)}</b> hari lagi</span>`}
  </button>`;
}

function spmTile(n) {
  const today = isoDate(n);
  const d = daysTo(SPM.writtenStart, today);
  const nx = nextPaper(classPapers(), n);
  // The run-up: ten weeks before the written papers to the last paper.
  const from = isoDate(addDays(new Date(SPM.writtenStart + 'T00:00:00'), -70));
  const span = daysTo(from, SPM.writtenEnd);
  const pct = x => Math.max(0, Math.min(100, daysTo(from, x) / span * 100));
  const ws = pct(SPM.writtenStart);
  // The three science practicals are a day apart: one marker, each date in its label.
  const labs = SPM.milestones.filter(m => m.id.indexOf('amali') === 0);
  const marks = SPM.milestones.filter(m => m.id === 'bm-oral' || m.id === 'bi-oral')
    .concat(labs.length ? [{ from: labs[0].from, to: labs[labs.length - 1].to, label: 'Ujian Amali: ' + labs.map(m => m.subjects[0] + ' ' + dateShort(m.from)).join(', ') }] : []);
  const when = p => rangeShort(p.date, p.dateTo) + (p.from ? ', ' + p.from : '');
  const dn = nx ? daysTo(nx.date, today) : 0;
  return html`<div class="tile-head"><span class="eyebrow">${icon('spm', 16)} SPM 2026</span><a href="#spm" class="link-btn" data-go="spm">Jadual penuh ${icon('right', 14)}</a></div>
    <div class="spm-big"><b data-count="${Math.max(0, d)}">${Math.max(0, d)}</b><span>hari lagi ke<br>peperiksaan bertulis</span></div>
    <div class="spm-track" role="img" aria-label="Garis masa SPM: ${Math.max(0, d)} hari lagi ke peperiksaan bertulis">
      <span class="spm-written" style="left:${ws.toFixed(1)}%;width:${(100 - ws).toFixed(1)}%"><em>Bertulis</em></span>
      <i style="width:${pct(today).toFixed(1)}%"></i>
      ${marks.map(m => html`<b class="${m.to < today ? 'done' : ''}" style="left:${pct(m.from).toFixed(1)}%" title="${m.label}, ${dateShort(m.from)}"></b>`)}
    </div>
    ${nx ? html`<a href="#spm" class="spm-nextpaper" data-go="spm" style="--c:${subjectColor(nx.subject)}">${subjectBadge(nx.subject, 'sm')}
      <span><small>Kertas seterusnya${dn > 0 ? ' · ' + dn + ' hari lagi' : ' · hari ini'}</small><b>${nx.name}, ${nx.paper.replace('Kertas 3 · ', '').replace('Kertas 4 · ', '')}</b><em>${when(nx)}</em></span>${icon('right', 16)}</a>` : ''}`;
}

function ring(pct, label) {
  const p = pct == null ? 0 : pct;
  return html`<div class="ring" style="--p:${p}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-track" cx="50" cy="50" r="42"/><circle class="ring-fill" cx="50" cy="50" r="42" pathLength="100"/></svg><div class="ring-c"><b>${pct == null ? '—' : pct + '%'}</b><span>${label}</span></div></div>`;
}
function starsTile(n) {
  const u = state.user;
  if (isStudent()) {
    const a = attendanceFor(state.bookings, u.name);
    const stars = starsFrom(a.counts);
    const streak = streakFor(state.bookings, u.name, n);
    return html`<span class="eyebrow">${icon('star', 16)} Bintang skibidi anda</span>
      <div class="stars-row">${ring(a.rate, 'hadir')}<div class="stars-facts">
        <p><b class="gold" data-count="${stars}">${stars}</b> bintang skibidi</p>
        <p><b data-count="${streak}">${streak}</b> streak tepat masa ${icon('flame', 15, 'flame')}</p>
        <p class="muted">${a.counts.lewat} lewat (tiada bintang), ${a.counts.tidak} tidak hadir</p></div></div>`;
  }
  const all = attendanceOverall(state.bookings);
  const risk = atRiskStudents(state.bookings, 80);
  return html`<span class="eyebrow">${icon('star', 16)} Kehadiran kelas</span>
    <div class="stars-row">${ring(all.rate, 'purata')}<div class="stars-facts">
      <p><b data-count="${all.classes}">${all.classes}</b> kelas ditanda</p>
      ${risk.length ? html`<p class="warn-text">${risk.length} pelajar bawah 80%</p><p class="muted">${risk.slice(0, 3).map(r => personName(r.name) + ' ' + r.rate + '%').join(', ')}</p>` : html`<p class="ok">Semua pelajar 80% ke atas</p>`}
      <a href="#statistik" class="link-btn" data-go="statistik">Lihat analitik ${icon('right', 14)}</a></div></div>`;
}

function crewTile(n) {
  const t = Date.now();
  const online = STUDENT_NAMES.filter(x => state.users[x] && state.users[x].lastSeen && t - state.users[x].lastSeen.getTime() < 5 * 60000);
  const live = liveNow(n);
  const lit = {};
  onTimeNames(live).forEach(x => { lit[x] = true; });
  return html`<span class="eyebrow">${icon('pengguna', 16)} Langit kelas</span>
    ${constellationHTML({ static: true, online, lit, cls: 'is-mini', label: 'Rakan sekelas' })}
    <p class="crew-cap"><span><i class="dot-live"></i>${online.length} aktif</span>${live ? html`<span><i class="dot-gold"></i>${Object.keys(lit).length} bintang skibidi</span>` : ''}</p>`;
}

function todayTile(n) {
  const today = isoDate(n);
  const list = sortByTime(state.bookings.filter(b => !b.cancelledAt && b.date === today));
  const head = html`<div class="tile-head"><span class="eyebrow">${icon('jadual', 16)} Jadual hari ini</span><a href="#jadual" class="link-btn" data-go="jadual">Semua ${icon('right', 14)}</a></div>`;
  if (!list.length) return html`${head}<div class="empty"><b>Hari ini lapang</b><p>Tiada kelas tambahan. Masa yang baik untuk ulang kaji sendiri.</p></div>`;
  const nowMin = n.getHours() * 60 + n.getMinutes();
  let placed = false;
  const rows = [];
  list.forEach(b => {
    if (!placed && nowMin < toMinutes(b.from)) { rows.push(html`<div class="tl-now"><span>${pad2(n.getHours())}:${pad2(n.getMinutes())}</span><i></i></div>`); placed = true; }
    const st = computeStatus(b, n);
    rows.push(html`<button type="button" class="tl-row st-${st}" data-open="${b.id}" style="--c:${subjectColor(b.subject)}">
      <span class="tl-t">${b.from}</span><span class="tl-node"></span>
      <span class="tl-body"><b>${subjectIcon(b.subject, 15, 'tl-ic')}${b.subject}</b><span>${b.teacher} · ${b.from}–${b.to}</span>${st === 'ongoing' || st === 'extending' ? html`<em>${st === 'extending' ? 'sedang extend' : minutesText(Math.round((at(b.date, b.to) - n) / 60000)) + ' lagi'}</em>` : ''}</span></button>`);
  });
  if (!placed) rows.push(html`<div class="tl-now"><span>${pad2(n.getHours())}:${pad2(n.getMinutes())}</span><i></i></div>`);
  return html`${head}<div class="tl">${rows}</div>`;
}

// "7 pg", "3 ptg", "10.30 mlm": a time of day the way people say it.
function hourWord(m) {
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  const t = (x) => x + (mm ? '.' + String(mm).padStart(2, '0') : '');
  if (h === 0) return t(12) + ' mlm';
  if (h < 12) return t(h) + ' pg';
  if (h === 12) return t(12) + ' tgh';
  return t(h - 12) + (h < 19 ? ' ptg' : ' mlm');
}
function weekTile(n) {
  const ws = startOfWeek(n);
  // 7 am to 10.30 pm, widened when a class this week starts earlier or ends later.
  const wkList = state.bookings.filter(b => !b.cancelledAt && b.date >= isoDate(ws) && b.date <= isoDate(addDays(ws, 6)));
  const F = Math.min(7 * 60, ...wkList.map(b => Math.floor(toMinutes(b.from) / 60) * 60));
  const T = Math.max(22 * 60 + 30, ...wkList.map(b => Math.ceil(toMinutes(b.to) / 60) * 60));
  const pct = m => ((Math.min(Math.max(m, F), T) - F) / (T - F) * 100).toFixed(2) + '%';
  const today = isoDate(n);
  const rows = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i), iso = isoDate(d);
    const sh = SCHOOL_HOURS[JS_DAYS[d.getDay()]];
    const list = state.bookings.filter(b => !b.cancelledAt && b.date === iso);
    rows.push(html`<button type="button" class="wk-row${iso === today ? ' is-today' : ''}${iso < today ? ' is-past' : ''}" data-day="${iso}" aria-label="${dayLabel(iso, n)}: ${list.length} kelas">
      <span class="wk-day">${['Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab', 'Aha'][i]}<small>${d.getDate()}</small></span>
      <span class="wk-track">${sh ? html`<i class="wk-school" style="left:${pct(toMinutes(sh.from))};width:calc(${pct(toMinutes(sh.to))} - ${pct(toMinutes(sh.from))})"></i>` : ''}
        ${list.map(b => html`<i class="wk-ev" style="left:${pct(toMinutes(b.from))};width:calc(${pct(toMinutes(b.to))} - ${pct(toMinutes(b.from))});--c:${subjectColor(b.subject)}" title="${b.subject} ${b.from}–${b.to}"></i>`)}
        ${iso === today ? html`<i class="wk-now" style="left:${pct(n.getHours() * 60 + n.getMinutes())}"></i>` : ''}</span>
      <span class="wk-n">${list.length || ''}</span></button>`);
  }
  const mid = Math.round((F + T) / 2 / 60) * 60;
  return html`<div class="tile-head"><span class="eyebrow">${icon('grid', 16)} Minggu ini</span><span class="wk-scale"><span>${hourWord(F)}</span><span>${hourWord(mid)}</span><span>${hourWord(Math.min(T, 23 * 60 + 59))}</span></span></div><div class="wk">${rows}</div>`;
}

function upcomingTile(n) {
  const list = sortByTime(state.bookings.filter(b => !b.cancelledAt && computeStatus(b, n) === 'upcoming')).slice(0, 5);
  const head = html`<div class="tile-head"><span class="eyebrow">${icon('tempah', 16)} Akan datang</span><a href="#jadual" class="link-btn" data-go="jadual">Jadual ${icon('right', 14)}</a></div>`;
  if (!list.length) return html`${head}<div class="empty"><b>Belum ada tempahan</b><p>Kelas yang ditempah akan muncul di sini.</p><a href="#tempah" class="btn primary sm" data-go="tempah">Tempah kelas</a></div>`;
  return html`${head}<div class="up-list">${list.map(b => html`<button type="button" class="up-row" data-open="${b.id}" style="--c:${subjectColor(b.subject)}">${subjectBadge(b.subject, 'md')}<span class="up-main"><b>${b.subject}</b><span>${b.teacher}</span></span><span class="up-when"><b>${dayLabel(b.date, n)}</b><span>${b.from}–${b.to}</span></span></button>`)}</div>`;
}

function activityTile(n) {
  const list = state.activity.slice(0, 6);
  return html`<div class="tile-head"><span class="eyebrow">${icon('spark', 16)} Aktiviti terkini</span></div>
    ${list.length ? html`<ul class="act-list">${list.map(a => html`<li><span class="act-ic">${icon(ACT_IC[a.action] || 'clock', 15)}</span><span class="act-text">${a.description || a.userName}</span><time>${timeAgo(a.clientTime, n.getTime())}</time></li>`)}</ul>` : html`<div class="empty"><b>Tiada aktiviti lagi</b></div>`}`;
}

function askTile() {
  return html`<span class="eyebrow">${icon('spark', 16)} Tanya Sigma</span>
    <form class="ask-form" data-ask-form><input id="dash-ask" class="input" type="text" autocomplete="off" placeholder="Contoh: tempah Fizik esok 3 petang" aria-label="Tanya Sigma"><button type="submit" class="btn primary icon-only" aria-label="Tanya">${icon('send', 18)}</button></form>
    <div class="ask-chips">${['Kelas apa sekarang?', 'Slot kosong esok', 'Kehadiran saya', 'Bila SPM Fizik?'].map(c => html`<button type="button" class="chip" data-ask="${c}">${c}</button>`)}</div>`;
}

const TILES = [
  ['t-hero', heroTile], ['t-now', nowTile], ['t-next', nextTile], ['t-spm', spmTile], ['t-stars', starsTile],
  ['t-crew', crewTile], ['t-today', todayTile], ['t-week', weekTile], ['t-up', upcomingTile], ['t-act', activityTile]
];

function paint(entering) {
  if (!root) return;
  if (!state.ready.bookings) { setHTML(root, skeleton()); return; }
  const n = now();
  if (!root.querySelector('.bento:not(.is-loading)')) {
    setHTML(root, html`<div class="bento${entering ? ' is-entering' : ''}">${TILES.map(([c]) => html`<section class="tile ${c}" data-tile="${c}"></section>`)}<section class="tile t-ask" data-tile="t-ask">${askTile()}</section></div>`);
    entering = true;
    const bento = root.querySelector('.bento');
    setTimeout(() => { if (bento.isConnected) bento.classList.add('is-settled'); }, 2600);
  }
  TILES.forEach(([c, fn]) => setHTML(root.querySelector('[data-tile="' + c + '"]'), fn(n)));
  const nowTileEl = root.querySelector('[data-tile="t-now"]'), liveEl = nowTileEl && nowTileEl.querySelector('.now-live');
  if (nowTileEl) { if (liveEl) nowTileEl.style.setProperty('--c', liveEl.style.getPropertyValue('--c')); else nowTileEl.style.removeProperty('--c'); }
  if (entering) countUp(root);
}

function tick(n) {
  if (!root || !root.isConnected) return;
  // Orbit ring and minutes left
  const live = root.querySelector('.now-live');
  const b = liveNow(n);
  if (!!live !== !!b || (live && b && live.dataset.id !== b.id)) { paint(false); return; }
  if (live) {
    const o = orbitInfo(b, n);
    const wrap = root.querySelector('.orbit-wrap');
    if (wrap) { wrap.style.setProperty('--p', o.p.toFixed(4)); wrap.classList.toggle('is-over', o.over); }
    const left = root.querySelector('[data-live-left]');
    if (left) left.textContent = o.over ? '+' + o.mins : String(o.mins);
    const cap = root.querySelector('[data-live-cap]');
    if (cap && cap.textContent !== o.cap) cap.textContent = o.cap;
  }
  // Rolling countdown
  const nc = root.querySelector('[data-next-at]');
  if (nc) {
    const ms = +nc.dataset.nextAt - n.getTime();
    if (ms <= 0) { paint(false); return; }
    const digits = countdownParts(ms).replace(/:/g, '');
    nc.querySelectorAll('.odo-d').forEach((el, i) => el.style.setProperty('--v', digits[i]));
  }
}

export const dashboardView = {
  id: 'utama',
  render(el, params, ctx) {
    root = el;
    paint(ctx && ctx.entering);
    if (!stopTick) stopTick = onSecond(tick);
    if (!el.dataset.wired) {
      el.dataset.wired = '1';
      on(el, 'click', '[data-open]', (e, b) => openClassSheet(b.dataset.open));
      on(el, 'click', '[data-att]', (e, b) => openAttendanceSheet(b.dataset.att));
      on(el, 'click', '[data-extend]', (e, b) => openExtendSheet(b.dataset.extend));
      on(el, 'click', '[data-stopext]', (e, b) => openStopExtendSheet(b.dataset.stopext));
      on(el, 'click', '[data-day]', (e, b) => navigate('jadual', { date: b.dataset.day, mode: 'day' }));
      on(el, 'click', '[data-ask]', (e, b) => ask(b.dataset.ask));
      on(el, 'submit', '[data-ask-form]', e => { e.preventDefault(); const i = el.querySelector('#dash-ask'); const q = i.value.trim(); if (q) { i.value = ''; ask(q); } });
    }
  },
  update() { paint(false); },
  leave() { if (stopTick) { stopTick(); stopTick = null; } }
};

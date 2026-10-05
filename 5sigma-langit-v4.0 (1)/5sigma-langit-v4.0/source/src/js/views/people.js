/* Guru, Subjek and Rakan: who teaches what, how each subject is going before
   SPM, and who in the class is around. Each list opens a detail view in place
   (with its own address, e.g. #guru, so Back returns to the list). */

import { state } from '../core/store.js';
import { now } from '../core/clock.js';
import { toMinutes } from '../core/util.js';
import { isoDate } from '../core/util.js';
import { addDays } from '../core/util.js';
import { startOfWeek } from '../core/util.js';
import { normalize } from '../core/util.js';
import { SUBJECTS } from '../core/data.js';
import { SUBJECT_ROSTERS } from '../core/data.js';
import { STUDENT_NAMES } from '../core/data.js';
import { papersOf } from '../core/data.js';
import { subjectColor } from '../core/data.js';
import { computeStatus } from '../core/domain.js';
import { sortByTime } from '../core/domain.js';
import { allKnownTeachers } from '../core/domain.js';
import { mostCommonSubjectFor } from '../core/domain.js';
import { defaultTeacherFor } from '../core/domain.js';
import { sameTeacher } from '../core/domain.js';
import { rosterFor } from '../core/domain.js';
import { attendanceFor } from '../core/domain.js';
import { attendanceOverall } from '../core/domain.js';
import { rateFrom } from '../core/domain.js';
import { emptyTally } from '../core/domain.js';
import { html } from '../ui/dom.js';
import { setHTML } from '../ui/dom.js';
import { on } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { subjectIcon } from '../ui/icons.js';
import { navigate } from '../ui/router.js';
import { dayLabel } from '../ui/format.js';
import { dateShort } from '../ui/format.js';
import { rangeShort } from '../ui/format.js';
import { minutesText } from '../ui/format.js';
import { durationText } from '../ui/format.js';
import { timeAgo } from '../ui/format.js';
import { personName } from '../ui/format.js';
import { statusPill } from './actions.js';
import { openClassSheet } from './actions.js';
import { openBookingSheet } from './booking.js';
import { constellationHTML } from './login.js';
import { classRows } from './common.js';
import { table } from './common.js';
import { avatar } from './common.js';
import { kpi } from './common.js';
import { countUp } from '../fx/motion.js';

const hours = list => list.reduce((s, b) => s + Math.max(0, toMinutes(b.to) - toMinutes(b.from)), 0);
const fmtDate = iso => iso.split('-').reverse().join('/');

// Classes per week for the last 8 weeks (oldest first), for the little bar strip.
function weekly(list, n) {
  const ws = startOfWeek(n), out = [];
  for (let i = 7; i >= 0; i--) {
    const a = isoDate(addDays(ws, -7 * i)), b = isoDate(addDays(ws, -7 * i + 6));
    out.push(list.filter(x => x.date >= a && x.date <= b).length);
  }
  return out;
}
function weekStrip(series, color) {
  const max = Math.max(1, ...series);
  return html`<span class="wstrip" style="--c:${color}" aria-hidden="true">${series.map(v => html`<i style="--h:${Math.max(8, v / max * 100).toFixed(0)}%" class="${v ? '' : 'z'}"></i>`)}</span>`;
}
function backBar(label, to) {
  return html`<button type="button" class="btn ghost sm back-btn" data-back="${to}">${icon('left', 16)}<span>${label}</span></button>`;
}
function wire(el, extra) {
  if (el.dataset.wired) return;
  el.dataset.wired = '1';
  on(el, 'click', '[data-open]', (e, b) => openClassSheet(b.dataset.open));
  if (extra) extra(el);
}

/* ===================================================================== Guru */
let guruQ = '', guruSel = null;

function guruList(el) {
  const n = now();
  const teachers = allKnownTeachers(state.config, state.bookings).filter(t => !guruQ || normalize(t).includes(guruQ));
  setHTML(el, html`
    <div class="page-head"><div><h2 class="page-title">Guru</h2><p class="page-sub">${allKnownTeachers(state.config, state.bookings).length} guru. Siapa mengajar apa, dan kelas mereka seterusnya.</p></div>
      <label class="search-box people-search">${icon('search', 16)}<input class="input" type="search" placeholder="Cari guru" aria-label="Cari guru" value="${guruQ}" data-guru-q></label></div>
    ${teachers.length ? html`<div class="pgrid">${teachers.map((t, i) => {
      const list = state.bookings.filter(b => sameTeacher(b.teacher, t) && !b.cancelledAt);
      const subj = mostCommonSubjectFor(state.bookings, state.config, t);
      const color = subjectColor(subj);
      const subjects = Array.from(new Set(list.map(b => b.subject).concat(Object.keys(state.config.subjectTeachers).filter(s => sameTeacher(state.config.subjectTeachers[s], t)))));
      const next = sortByTime(list.filter(b => computeStatus(b, n) === 'upcoming'))[0];
      return html`<button type="button" class="tile pcard" data-guru="${t}" style="--c:${color};--i:${i}">
        <span class="pcard-top">${avatar(t, color, 48)}${weekStrip(weekly(list, n), color)}</span>
        <b class="pcard-name">${t}</b>
        <span class="pcard-tags">${subjects.slice(0, 3).map(s => html`<em style="--c:${subjectColor(s)}">${subjectIcon(s, 12)}${s}</em>`)}${subjects.length > 3 ? html`<em>+${subjects.length - 3}</em>` : ''}</span>
        <span class="pcard-stats"><span><b>${list.length}</b> sesi</span><span><b>${Math.round(hours(list) / 60)}</b> jam</span></span>
        <span class="pcard-next">${icon('clock', 14)}${next ? html`<span>${dayLabel(next.date, n)}, ${next.from} · ${next.subject}</span>` : html`<span class="muted">Tiada kelas akan datang</span>`}</span>
      </button>`;
    })}</div>` : html`<div class="empty"><b>Tiada guru dijumpai</b><p>Cuba nama lain.</p></div>`}`);
}

function guruDetail(el, name) {
  const n = now();
  const all = sortByTime(state.bookings.filter(b => sameTeacher(b.teacher, name)));
  const act = all.filter(b => !b.cancelledAt);
  const up = act.filter(b => computeStatus(b, n) === 'upcoming');
  const done = act.filter(b => computeStatus(b, n) === 'ended');
  const subj = mostCommonSubjectFor(state.bookings, state.config, name);
  const color = subjectColor(subj);
  const subjects = Array.from(new Set(act.map(b => b.subject)));
  const g = state.config.teacherGenders[name];
  setHTML(el, html`
    ${backBar('Semua guru', 'guru')}
    <section class="tile detail-hero" style="--c:${color}">
      ${avatar(name, color, 76)}
      <div class="dh-main"><h2>${name}</h2><p>${subjects.length ? 'Mengajar ' + subjects.join(', ') : 'Belum ada kelas'}${g ? ' · ' + (g === 'F' ? 'Perempuan' : 'Lelaki') : ''}</p>
        <div class="dh-actions">${subj ? html`<button type="button" class="btn primary sm" data-book="${subj}" data-teacher="${name}">${icon('plus', 16)}<span>Tempah kelas ${subj}</span></button>` : ''}</div></div>
      <div class="dh-kpis">${kpi('Sesi aktif', act.length)}${kpi('Akan datang', up.length)}${kpi('Selesai', done.length)}${kpi('Jam mengajar', Math.round(hours(done) / 60))}</div>
    </section>
    <div class="section-label"><h3>Kelas akan datang</h3></div>
    ${classRows(up, n, { empty: 'Tiada kelas akan datang', emptyHint: 'Tempah satu menggunakan butang di atas.' })}
    <div class="section-label"><h3>Sejarah kelas</h3><span class="muted">${all.length} rekod</span></div>
    ${table(all.slice().reverse(), [
      { label: 'Tarikh', get: b => fmtDate(b.date) },
      { label: 'Masa', get: b => b.from + '–' + b.to },
      { label: 'Subjek', get: b => html`<span class="dotname" style="--c:${subjectColor(b.subject)}">${b.subject}</span>` },
      { label: 'Status', get: b => statusPill(computeStatus(b, n)) }
    ])}`);
  countUp(el);
}

export const guruView = {
  id: 'guru',
  render(el, params, ctx) {
    if (params && params.name) guruSel = params.name;
    else if (ctx && ctx.entering) guruSel = null;
    wire(el, root => {
      on(root, 'click', '[data-guru]', (e, b) => { guruSel = b.dataset.guru; guruView.render(root, {}, {}); window.scrollTo(0, 0); });
      on(root, 'click', '[data-back]', () => { guruSel = null; guruView.render(root, {}, {}); });
      on(root, 'input', '[data-guru-q]', (e, inp) => { guruQ = normalize(inp.value.trim()); const pos = inp.selectionStart; guruList(root); const ni = root.querySelector('[data-guru-q]'); ni.focus(); try { ni.setSelectionRange(pos, pos); } catch (err) { /* ignore */ } });
      on(root, 'click', '[data-book]', (e, b) => openBookingSheet({ prefill: { subject: b.dataset.book, teacher: b.dataset.teacher, date: isoDate(addDays(now(), 1)) } }));
    });
    if (guruSel) guruDetail(el, guruSel); else guruList(el);
  },
  update() { const el = document.querySelector('[data-view="guru"]'); if (!el || el.contains(document.activeElement) && document.activeElement.matches('input')) return; if (guruSel) guruDetail(el, guruSel); else guruList(el); }
};

/* =================================================================== Subjek */
let subjSel = null;
// The subject's next SPM paper: its own oral or practical day first, then the written papers.
function spmFor(subject, today) {
  const p = papersOf(subject).find(x => x.dateTo >= today);
  if (!p) return null;
  const tag = p.kind === 'amali' ? 'Amali' : p.kind === 'lisan' ? 'Bertutur' : 'SPM';
  return { short: tag, from: p.date, to: p.dateTo, label: p.name + ' ' + p.paper, paper: p };
}
function spmDates(p) { return rangeShort(p.date, p.dateTo); }
function subjekList(el) {
  const n = now(), today = isoDate(n);
  const cards = SUBJECTS.map(s => {
    const list = state.bookings.filter(b => b.subject === s.name && !b.cancelledAt);
    return { s, list, mins: hours(list.filter(b => computeStatus(b, n) === 'ended')), next: sortByTime(list.filter(b => computeStatus(b, n) === 'upcoming'))[0] };
  });
  const maxMins = Math.max(1, ...cards.map(c => c.mins));
  setHTML(el, html`
    <div class="page-head"><div><h2 class="page-title">Subjek</h2><p class="page-sub">${SUBJECTS.length} subjek SPM kelas ini. Cincin menunjukkan jam kelas tambahan yang selesai berbanding subjek paling banyak.</p></div></div>
    <div class="pgrid sgrid">${cards.map((c, i) => {
      const ms = spmFor(c.s.name, today);
      const pct = Math.round(c.mins / maxMins * 100);
      return html`<button type="button" class="tile pcard scard" data-subjek="${c.s.name}" style="--c:${c.s.color};--i:${i}">
        <span class="scard-top"><span class="sglyph" style="--p:${pct}" title="${c.s.short}"><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19" class="sg-track"/><circle cx="22" cy="22" r="19" class="sg-fill" pathLength="100"/></svg>${subjectIcon(c.s.name, 26, 'sg-ic')}</span>
          ${ms ? html`<span class="pill gold" title="${ms.label}">${ms.short} ${spmDates(ms.paper)}</span>` : ''}</span>
        <b class="pcard-name">${c.s.name}</b>
        <span class="scard-teacher">${defaultTeacherFor(state.config, c.s.name) || 'Belum ditetapkan'}</span>
        <span class="pcard-stats"><span><b>${c.list.length}</b> sesi</span><span><b>${(c.mins / 60).toFixed(c.mins % 60 ? 1 : 0)}</b> jam selesai</span></span>
        <span class="pcard-next">${icon('clock', 14)}${c.next ? html`<span>${dayLabel(c.next.date, n)}, ${c.next.from}</span>` : html`<span class="muted">Tiada kelas akan datang</span>`}</span>
      </button>`;
    })}</div>`);
}
function subjekDetail(el, name) {
  const n = now(), today = isoDate(n);
  const s = SUBJECTS.find(x => x.name === name);
  if (!s) { subjSel = null; subjekList(el); return; }
  const all = sortByTime(state.bookings.filter(b => b.subject === name));
  const act = all.filter(b => !b.cancelledAt);
  const up = act.filter(b => computeStatus(b, n) === 'upcoming');
  const done = act.filter(b => computeStatus(b, n) === 'ended');
  const ws = state.config.workshopTeachers[name] || [];
  const roster = rosterFor(name);
  const ms = spmFor(name, today);
  const att = attendanceOverall(state.bookings).perSubject[name];
  const rate = att ? rateFrom(att) : null;
  setHTML(el, html`
    ${backBar('Semua subjek', 'subjek')}
    <section class="tile detail-hero" style="--c:${s.color}">
      <span class="sglyph big" style="--p:100"><svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="19" class="sg-track"/><circle cx="22" cy="22" r="19" class="sg-fill" pathLength="100"/></svg>${subjectIcon(name, 38, 'sg-ic')}</span>
      <div class="dh-main"><h2>${name}</h2>
        <p>Guru utama: <b>${defaultTeacherFor(state.config, name) || '—'}</b>${ws.length ? ' · Guru bengkel: ' + ws.join(', ') : ''}</p>
        <p class="muted">${SUBJECT_ROSTERS[name] ? roster.length + ' pelajar (' + roster.map(personName).join(', ') + ')' : 'Seluruh kelas (' + roster.length + ' pelajar)'}${ms ? ' · SPM seterusnya: ' + ms.paper.paper.replace(/ · .*/, '') + ', ' + spmDates(ms.paper) : ''}</p>
        <div class="dh-actions">
          <button type="button" class="btn primary sm" data-book="${name}">${icon('plus', 16)}<span>Tempah ${name}</span></button>
          <button type="button" class="btn ghost sm" data-slotfor="${name}">${icon('wand', 16)}<span>Slot Pintar</span></button>
          <button type="button" class="btn ghost sm" data-jadualfor="${name}">${icon('jadual', 16)}<span>Lihat dalam Jadual</span></button></div></div>
      <div class="dh-kpis">${kpi('Sesi aktif', act.length)}${kpi('Akan datang', up.length)}${kpi('Jam selesai', Math.round(hours(done) / 60))}${kpi('Kehadiran', rate == null ? '—' : rate + '%')}</div>
    </section>
    <div class="section-label"><h3>Kertas SPM ${name}</h3><a href="#spm" class="link-btn" data-spmfor="${name}">Jadual SPM penuh ${icon('right', 14)}</a></div>
    <div class="spm-mini">${papersOf(name).map(p => {
      const past = p.dateTo < today;
      return html`<div class="spm-row${past ? ' is-done' : ''}" style="--c:${s.color}">
        <span class="spm-when"><b>${spmDates(p)}</b><span>${p.from ? p.from + '–' + p.to : 'ikut jadual sekolah'}</span></span>
        <span class="spm-main"><b>${p.paper}</b><span>${p.kind === 'amali' ? 'Ujian amali di makmal sekolah' : p.kind === 'lisan' ? 'Ujian lisan di sekolah' : p.kind === 'mendengar' ? 'Ujian mendengar' : 'Kertas bertulis'}${p.from ? ' · ' + durationText(p.from, p.to) : ''}</span></span>
        <span class="spm-meta">${past ? html`<span class="pill st-ended">Selesai</span>` : ''}<code>${p.code}</code></span></div>`;
    })}</div>
    <div class="section-label"><h3>Kelas akan datang</h3></div>
    ${classRows(up, n, { empty: 'Tiada kelas ' + name + ' akan datang', emptyHint: 'Slot Pintar boleh mencadangkan masa terbaik.' })}
    <div class="section-label"><h3>Sejarah kelas</h3><span class="muted">${all.length} rekod</span></div>
    ${table(all.slice().reverse(), [
      { label: 'Tarikh', get: b => fmtDate(b.date) },
      { label: 'Masa', get: b => b.from + '–' + b.to },
      { label: 'Guru', get: b => b.teacher },
      { label: 'Status', get: b => statusPill(computeStatus(b, n)) }
    ])}`);
  countUp(el);
}
export const subjekView = {
  id: 'subjek',
  render(el, params, ctx) {
    if (params && params.name) subjSel = params.name;
    else if (ctx && ctx.entering) subjSel = null;
    wire(el, root => {
      on(root, 'click', '[data-subjek]', (e, b) => { subjSel = b.dataset.subjek; subjekView.render(root, {}, {}); window.scrollTo(0, 0); });
      on(root, 'click', '[data-back]', () => { subjSel = null; subjekView.render(root, {}, {}); });
      on(root, 'click', '[data-book]', (e, b) => openBookingSheet({ prefill: { subject: b.dataset.book, date: isoDate(addDays(now(), 1)) } }));
      on(root, 'click', '[data-slotfor]', (e, b) => navigate('jadual', { mode: 'week', date: isoDate(now()), slot: { subject: b.dataset.slotfor, len: 60 } }));
      on(root, 'click', '[data-jadualfor]', (e, b) => navigate('jadual', { mode: 'list', date: isoDate(now()), subject: b.dataset.jadualfor }));
      on(root, 'click', '[data-spmfor]', (e, b) => { e.preventDefault(); navigate('spm', { subject: b.dataset.spmfor }); });
    });
    if (subjSel) subjekDetail(el, subjSel); else subjekList(el);
  },
  update() { const el = document.querySelector('[data-view="subjek"]'); if (!el) return; if (subjSel) subjekDetail(el, subjSel); else subjekList(el); }
};

/* ==================================================================== Rakan */
function statusOf(rec, t) {
  if (!rec) return { cls: 'never', label: 'Belum pernah log masuk' };
  if (rec.lastSeen && t - rec.lastSeen.getTime() < 5 * 60000) return { cls: 'on', label: 'Aktif sekarang' };
  return { cls: 'off', label: rec.lastSeen ? 'Aktif ' + timeAgo(rec.lastSeen.getTime(), t) : 'Tidak aktif' };
}
function penggunaRender(el) {
  const t = Date.now(), n = now();
  const online = STUDENT_NAMES.filter(x => state.users[x] && state.users[x].lastSeen && t - state.users[x].lastSeen.getTime() < 5 * 60000);
  const teachers = Object.keys(state.users).filter(x => state.users[x].type === 'Cikgu').sort();
  const logins = state.activity.filter(a => a.action === 'LOGIN').slice(0, 15);
  const overall = state.isAdmin ? attendanceOverall(state.bookings) : null;
  const me = state.user ? state.user.name : '';
  setHTML(el, html`
    <div class="page-head"><div><h2 class="page-title">Rakan sekelas</h2><p class="page-sub">13 pelajar 5 Sigma dan guru yang menggunakan aplikasi. ${online.length} sedang aktif sekarang.</p></div></div>
    <section class="tile crew-hero">
      ${constellationHTML({ static: true, online, label: 'Langit 5 Sigma', cls: 'is-crew' })}
      <div class="crew-legend"><span><i class="dot-live"></i>Aktif sekarang</span><span><i class="dot-star"></i>Pelajar</span></div>
    </section>
    <div class="section-label"><h3>Pelajar</h3><span class="muted">${STUDENT_NAMES.filter(x => state.users[x]).length}/13 pernah log masuk</span></div>
    <div class="ugrid">${STUDENT_NAMES.map((name, i) => {
      const rec = state.users[name], st = statusOf(rec, t);
      const r = overall ? rateFrom(overall.perStudent[name] || emptyTally()) : (name === me ? attendanceFor(state.bookings, name).rate : null);
      return html`<div class="tile ucard s-${st.cls}${name === me ? ' is-me' : ''}" style="--i:${i}">
        ${avatar(name, name === me ? 'var(--gold)' : '#8C7CFF', 46)}
        <b>${personName(name)}${name === me ? html` <em>(anda)</em>` : ''}</b>
        <span class="u-status"><i></i>${st.label}</span>
        ${rec && rec.loginCount ? html`<span class="u-meta">${rec.loginCount} kali log masuk</span>` : ''}
        ${r != null ? html`<span class="u-rate${r < 80 ? ' is-low' : ''}">${icon('star', 12)} ${r}% kehadiran</span>` : ''}
      </div>`;
    })}</div>
    <div class="section-label"><h3>Guru</h3></div>
    ${teachers.length ? html`<div class="ugrid">${teachers.map(name => { const st = statusOf(state.users[name], t); return html`<div class="tile ucard s-${st.cls}">${avatar(name, subjectColor(mostCommonSubjectFor(state.bookings, state.config, name)), 46)}<b>${name}</b><span class="u-status"><i></i>${st.label}</span></div>`; })}</div>`
      : html`<div class="empty"><b>Belum ada guru log masuk</b></div>`}
    <div class="section-label"><h3>Sejarah log masuk</h3></div>
    <div class="tile log-tile">${logins.length ? html`<ul class="act-list">${logins.map(a => html`<li><span class="act-ic">${icon('user', 15)}</span><span class="act-text">${a.description || a.userName}</span><time>${timeAgo(a.clientTime, n.getTime())}</time></li>`)}</ul>` : html`<div class="empty"><b>Tiada rekod log masuk lagi</b></div>`}</div>`);
}
export const penggunaView = {
  id: 'pengguna',
  render(el) { penggunaRender(el); },
  update(reason) { if (reason === 'notifications') return; const el = document.querySelector('[data-view="pengguna"]'); if (el) penggunaRender(el); }
};

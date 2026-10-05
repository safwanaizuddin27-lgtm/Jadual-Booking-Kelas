/* Analitik: the numbers behind the timetable. Headline counts with 14/30-day
   trends, a radar of how evenly the 15 subjects are covered before SPM, a
   12-week heatmap, the busiest days and hours, teacher load, attendance (the
   whole class for the admin, only your own record for a student) and the full
   history, with CSV export for teachers. */

import { state } from '../core/store.js';
import { now } from '../core/clock.js';
import { isoDate } from '../core/util.js';
import { parseISO } from '../core/util.js';
import { addDays } from '../core/util.js';
import { startOfWeek } from '../core/util.js';
import { toMinutes } from '../core/util.js';
import { normalize } from '../core/util.js';
import { SUBJECTS } from '../core/data.js';
import { STUDENT_NAMES } from '../core/data.js';
import { WEEK_ORDER } from '../core/data.js';
import { DAY_MY } from '../core/data.js';
import { ATT_STATUSES } from '../core/data.js';
import { SPM } from '../core/data.js';
import { subjectColor } from '../core/data.js';
import { computeStats } from '../core/domain.js';
import { computeStatus } from '../core/domain.js';
import { statusLabel } from '../core/domain.js';
import { dayNameOf } from '../core/domain.js';
import { dailySeries } from '../core/domain.js';
import { percentChange } from '../core/domain.js';
import { countsByDate } from '../core/domain.js';
import { sortByTime } from '../core/domain.js';
import { attendanceOverall } from '../core/domain.js';
import { attendanceFor } from '../core/domain.js';
import { streakFor } from '../core/domain.js';
import { starsFrom } from '../core/domain.js';
import { rateFrom } from '../core/domain.js';
import { emptyTally } from '../core/domain.js';
import { isMarked } from '../core/domain.js';
import { isStudent } from '../core/store.js';
import { csv } from '../features/share.js';
import { saveFile } from '../features/host.js';
import { html } from '../ui/dom.js';
import { setHTML } from '../ui/dom.js';
import { on } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { subjectIcon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { navigate } from '../ui/router.js';
import { dateLong } from '../ui/format.js';
import { dateShort } from '../ui/format.js';
import { personName } from '../ui/format.js';
import { statusPill } from './actions.js';
import { openAttendanceSheet } from './actions.js';
import { openClassSheet } from './actions.js';
import { kpi } from './common.js';
import { bars } from './common.js';
import { table } from './common.js';
import { countUp } from '../fx/motion.js';

const fmtDate = iso => iso.split('-').reverse().join('/');
let histQ = '', histN = 25, root = null;

/* ---------------------------------------------------------------- charts */
function radar(entries) {
  // entries: [{label, value, color}] around a circle; value is normalised to the largest.
  const N = entries.length, R = 112, max = Math.max(1, ...entries.map(e => e.value));
  const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return [Math.cos(a) * r, Math.sin(a) * r]; };
  const ring = f => entries.map((e, i) => pt(i, R * f).map(v => v.toFixed(1)).join(',')).join(' ');
  const shape = entries.map((e, i) => pt(i, R * Math.max(0.04, e.value / max)).map(v => v.toFixed(1)).join(',')).join(' ');
  return html`<svg class="radar" viewBox="-160 -150 320 300" role="img" aria-label="Keseimbangan jam kelas tambahan mengikut subjek">
    ${[0.25, 0.5, 0.75, 1].map(f => html`<polygon class="rd-ring" points="${ring(f)}"/>`)}
    ${entries.map((e, i) => { const [x, y] = pt(i, R); return html`<line class="rd-axis" x1="0" y1="0" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; })}
    <polygon class="rd-shape" points="${shape}"/>
    ${entries.map((e, i) => { const [x, y] = pt(i, R * Math.max(0.04, e.value / max)); return html`<circle class="rd-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" style="--c:${e.color}"><title>${e.full}: ${Math.round(e.value / 60 * 10) / 10} jam</title></circle>`; })}
    ${entries.map((e, i) => { const [x, y] = pt(i, R + 20); return html`<text class="rd-label" x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" style="--c:${e.color}">${e.label}</text>`; })}
  </svg>`;
}

function heatmap(n) {
  // 12 weeks back and 2 ahead, one column per week, Monday at the top.
  const W = 14, ws = startOfWeek(n), start = addDays(ws, -7 * 11), end = addDays(start, 7 * W - 1);
  const counts = countsByDate(state.bookings, isoDate(start), isoDate(end));
  const today = isoDate(n), cells = [html`<span></span>`];
  for (let w = 0; w < W; w++) {
    const first = addDays(start, w * 7);
    const m = [0, 1, 2, 3, 4, 5, 6].map(d => addDays(first, d)).find(d => d.getDate() === 1);
    cells.push(html`<span class="hm-m">${m || w === 0 ? dateShort(isoDate(m || first)).split(' ')[1] : ''}</span>`);
  }
  ['Isn', '', 'Rab', '', 'Jum', '', 'Aha'].forEach((label, d) => {
    cells.push(html`<span class="hm-dl">${label}</span>`);
    for (let w = 0; w < W; w++) {
      const iso = isoDate(addDays(start, w * 7 + d)), c = counts[iso] || 0;
      cells.push(html`<i class="hm-c l${Math.min(c, 4)}${iso === today ? ' is-today' : ''}${iso > today ? ' is-future' : ''}" style="--i:${w}" title="${dateLong(iso)}: ${c} kelas"></i>`);
    }
  });
  return html`<div class="hm" style="--weeks:${W}">${cells}</div>
    <div class="hm-legend"><span>Kurang</span>${[0, 1, 2, 3, 4].map(l => html`<i class="hm-c l${l}"></i>`)}<span>Lebih</span><span class="hm-fut"><i class="hm-c l2 is-future"></i>Akan datang</span></div>`;
}

function columns(entries, opts) {
  opts = opts || {};
  const max = Math.max(1, ...entries.map(e => e.value));
  return html`<div class="vbars${opts.cls ? ' ' + opts.cls : ''}">${entries.map((e, i) => html`<div class="vbar${e.mark ? ' is-mark' : ''}" style="--h:${(e.value / max * 100).toFixed(1)}%;--i:${i}" title="${e.title || e.label}: ${e.value}">
    <span class="vbar-v">${e.value || ''}</span><span class="vbar-col"><i></i></span><span class="vbar-l">${e.label}</span></div>`)}</div>`;
}

function stacked(c) {
  const total = c.hadir + c.lewat + c.dikecualikan + c.tidak;
  if (!total) return '';
  return html`<div class="att-bar">${ATT_STATUSES.map(st => c[st.id] ? html`<i class="t-${st.id}" style="width:${(c[st.id] / total * 100).toFixed(2)}%" title="${st.label}: ${c[st.id]}"></i>` : '')}</div>
    <div class="att-tally">${ATT_STATUSES.map(st => html`<span class="tally t-${st.id}"><i></i>${st.label} <b>${c[st.id]}</b></span>`)}</div>`;
}
function bigRing(pct, label) {
  return html`<div class="ring ring-xl" style="--p:${pct == null ? 0 : pct}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-track" cx="50" cy="50" r="42"/><circle class="ring-fill" cx="50" cy="50" r="42" pathLength="100"/></svg><div class="ring-c"><b>${pct == null ? '—' : pct + '%'}</b><span>${label}</span></div></div>`;
}

/* ---------------------------------------------------------------- sections */
function kpis(s, n) {
  const d14 = dailySeries(state.bookings, 14, n), d30 = dailySeries(state.bookings, 30, n);
  const prev7 = dailySeries(state.bookings, 14, n).slice(0, 7).reduce((a, b) => a + b, 0);
  const last7 = d14.slice(7).reduce((a, b) => a + b, 0);
  const ch = percentChange(last7, prev7);
  return html`<div class="kpis">
    ${kpi('Jumlah sesi', s.total, { icon: icon('subjek', 14), series: d14, color: 'var(--gold)', sub: '14 hari terakhir' })}
    ${kpi('Selesai', s.completed, { icon: icon('check', 14), tone: 'live' })}
    ${kpi('Akan datang', s.upcoming, { icon: icon('clock', 14), tone: 'info' })}
    ${kpi('Sedang berlangsung', s.ongoing, { icon: icon('spark', 14) })}
    ${kpi('Dibatalkan', s.cancelled, { icon: icon('trash', 14), tone: 'danger' })}
    ${kpi('Jumlah extend', s.extensions, { icon: icon('clock', 14), tone: 'warn' })}
    ${kpi('Bulan ini', s.thisMonth, { icon: icon('jadual', 14), series: d30, color: '#3EC8FF', sub: '30 hari terakhir' })}
    ${kpi('7 hari terakhir', last7, { icon: icon('statistik', 14), sub: (ch >= 0 ? '+' : '') + ch + '% berbanding minggu sebelumnya' })}
  </div>`;
}

function coverage(n) {
  // Hours per subject over the last 8 weeks plus what is already booked ahead.
  const from = isoDate(addDays(n, -56));
  const mins = {};
  state.bookings.forEach(b => { if (!b.cancelledAt && b.date >= from) mins[b.subject] = (mins[b.subject] || 0) + Math.max(0, toMinutes(b.to) - toMinutes(b.from)); });
  const entries = SUBJECTS.map(s => ({ label: s.short, full: s.name, value: mins[s.name] || 0, color: s.color }));
  const sorted = entries.slice().sort((a, b) => a.value - b.value);
  const low = sorted.filter(e => e.value < (sorted[sorted.length - 1].value || 1) * 0.35).slice(0, 3);
  const spmDays = Math.max(0, Math.round((parseISO(SPM.writtenStart) - parseISO(isoDate(n))) / 86400000));
  return html`<section class="tile an-radar">
    <div class="tile-head"><span class="eyebrow">${icon('orbit', 16)} Keseimbangan subjek</span><span class="muted">8 minggu + akan datang</span></div>
    <div class="radar-wrap">${radar(entries)}
      <div class="radar-side">
        <p class="radar-insight">${low.length ? html`Paling kurang jam kelas tambahan: ${low.map((e, i) => html`${i ? ', ' : ''}<b style="color:${e.color}">${e.full}</b> (${Math.round(e.value / 60 * 10) / 10} j)`)}. Dengan ${spmDays} hari lagi ke SPM, pertimbang tambah satu kelas.` : 'Jam kelas tambahan agak seimbang antara subjek.'}</p>
        ${low.length ? html`<div class="chip-row">${low.map(e => html`<button type="button" class="chip" data-slotfor="${e.full}" style="--c:${e.color}"><i class="dot"></i>Slot Pintar: ${e.label}</button>`)}</div>` : ''}
      </div></div>
  </section>`;
}

function attendanceSection(n) {
  const u = state.user;
  const all = attendanceOverall(state.bookings);
  if (!all.classes) return html`<div class="empty"><b>Belum ada kehadiran ditanda</b><p>${state.isAdmin ? 'Tanda kehadiran melalui kad kelas. Hadir tepat masa = 1 bintang skibidi.' : 'Kehadiran akan dipapar di sini setelah ditanda oleh admin.'}</p></div>`;
  if (state.isAdmin) {
    const rows = STUDENT_NAMES.map(nm => { const c = all.perStudent[nm] || emptyTally(); return { nm, c, total: c.hadir + c.lewat + c.dikecualikan + c.tidak, rate: rateFrom(c) }; })
      .filter(r => r.total).sort((a, b) => (a.rate == null ? 101 : a.rate) - (b.rate == null ? 101 : b.rate));
    let worst = null;
    Object.keys(all.perSubject).forEach(sub => { const c = all.perSubject[sub], r = rateFrom(c); if (r == null || c.hadir + c.lewat + c.tidak < 2) return; if (!worst || r < worst.rate) worst = { sub, rate: r }; });
    const below = rows.filter(r => r.rate != null && r.rate < 75).length;
    return html`<div class="an-att">
      <section class="tile att-overall">${bigRing(all.rate, 'kehadiran')}<div class="att-ov-main">
        <p class="att-insight">Kehadiran keseluruhan <b>${all.rate}%</b> daripada <b>${all.classes}</b> kelas yang ditanda.${worst ? html` Kadar paling rendah pada <b style="color:${subjectColor(worst.sub)}">${worst.sub}</b> (${worst.rate}%).` : ''}${below ? html` <span class="warn-text">${below} pelajar di bawah 75%.</span>` : ''} Setiap <b>Hadir</b> (tepat masa) ialah 1 bintang skibidi.</p>
        ${stacked(all.counts)}
        <div class="tile-actions"><button type="button" class="btn ghost sm" data-export="att">${icon('download', 15)}<span>Eksport kehadiran (CSV)</span></button></div></div></section>
      <section class="tile att-table">${table(rows, [
        { label: 'Pelajar', get: r => personName(r.nm) },
        { label: 'Hadir', get: r => r.c.hadir, cls: 'num' }, { label: 'Lewat', get: r => r.c.lewat, cls: 'num' },
        { label: 'Dikecualikan', get: r => r.c.dikecualikan, cls: 'num' }, { label: 'Tidak', get: r => r.c.tidak, cls: 'num' },
        { label: 'Kadar', get: r => r.rate == null ? '—' : html`<span class="pill ${r.rate >= 90 ? 'st-ongoing' : r.rate >= 75 ? 'st-upcoming' : 'st-extending'}">${r.rate}%</span>`, cls: 'num' }
      ])}</section></div>`;
  }
  if (isStudent()) {
    const mine = attendanceFor(state.bookings, u.name);
    if (!mine.total) return html`<div class="empty"><b>Belum ada rekod untuk anda</b><p>Hadir tepat masa untuk mengumpul bintang skibidi. Kehadiran ditanda oleh admin.</p></div>`;
    const bySub = {};
    state.bookings.forEach(b => { if (b.cancelledAt || !isMarked(b) || !b.attendance[u.name]) return; const c = bySub[b.subject] || (bySub[b.subject] = emptyTally()); if (b.attendance[u.name] in c) c[b.attendance[u.name]]++; });
    return html`<div class="an-att">
      <section class="tile att-overall">${bigRing(mine.rate, 'kehadiran anda')}<div class="att-ov-main">
        <p class="att-insight">Kehadiran anda <b>${mine.rate}%</b> daripada <b>${mine.total}</b> kelas, <b class="gold">${starsFrom(mine.counts)} bintang skibidi</b> dan <b>${streakFor(state.bookings, u.name, n)}</b> kelas tepat masa berturut-turut.${mine.counts.lewat ? ' Lewat ' + mine.counts.lewat + ' kali (dikira hadir, tetapi tiada bintang).' : ''}</p>
        ${stacked(mine.counts)}</div></section>
      <section class="tile"><div class="tile-head"><span class="eyebrow">${icon('subjek', 16)} Mengikut subjek</span></div>
        ${bars(Object.keys(bySub).map(sub => ({ label: sub, value: rateFrom(bySub[sub]) || 0, color: subjectColor(sub) })).sort((a, b) => a.value - b.value), { format: v => v + '%' })}</section></div>`;
  }
  return html`<div class="an-att"><section class="tile att-overall">${bigRing(all.rate, 'kehadiran kelas')}<div class="att-ov-main">
    <p class="att-insight">Kehadiran keseluruhan kelas <b>${all.rate}%</b> daripada <b>${all.classes}</b> kelas yang ditanda. Rekod setiap pelajar hanya dilihat oleh admin kelas.</p>${stacked(all.counts)}</div></section></div>`;
}

function historySection(n) {
  const q = normalize(histQ.trim());
  const list = sortByTime(state.bookings).reverse().filter(b => !q || normalize([b.subject, b.teacher, b.date, fmtDate(b.date), b.notes || ''].join(' ')).includes(q));
  const cols = [
    { label: 'Tarikh', get: b => fmtDate(b.date) },
    { label: 'Subjek', get: b => html`<button type="button" class="link-plain dotname" data-open="${b.id}" style="--c:${subjectColor(b.subject)}">${b.subject}</button>` },
    { label: 'Guru', get: b => b.teacher },
    { label: 'Masa', get: b => b.from + '–' + b.to },
    { label: 'Status', get: b => statusPill(computeStatus(b, n)) }
  ];
  if (state.isAdmin) cols.push({ label: 'Kehadiran', get: b => b.cancelledAt ? html`<span class="muted">—</span>` : html`<button type="button" class="btn ghost sm" data-att="${b.id}">${isMarked(b) ? 'Lihat' : 'Tanda'}</button>` });
  return html`<div class="hist-tools"><label class="search-box">${icon('search', 16)}<input class="input" type="search" placeholder="Cari subjek, guru atau tarikh" aria-label="Cari sejarah" value="${histQ}" data-hist-q></label>
      <span class="muted">${list.length} kelas</span>
      <button type="button" class="btn ghost sm" data-export="hist">${icon('download', 15)}<span>Eksport CSV</span></button></div>
    ${table(list.slice(0, histN), cols, { empty: q ? 'Tiada kelas sepadan' : 'Tiada sejarah lagi' })}
    ${list.length > histN ? html`<div class="more-row"><button type="button" class="btn ghost" data-more>Tunjuk ${Math.min(25, list.length - histN)} lagi</button></div>` : ''}`;
}

function paint(entering) {
  if (!root) return;
  const n = now();
  if (!state.ready.bookings) { setHTML(root, html`<div class="tile skel"><i></i><i></i><i></i></div>`); return; }
  const s = computeStats(state.bookings, n, state.config);
  const byDay = WEEK_ORDER.map(d => ({ label: DAY_MY[d].slice(0, 3), title: DAY_MY[d], value: s.byDay[d] || 0 }));
  // 7 am to 9 pm, widened when a class starts outside those hours (the timetable now covers the whole day).
  const starts = Object.keys(s.byHour).filter(k => s.byHour[k]).map(k => parseInt(k, 10));
  const h0 = Math.min(7, ...starts), h1 = Math.max(21, ...starts);
  const hoursE = [];
  for (let h = h0; h <= h1; h++) { const k = (h < 10 ? '0' : '') + h + ':00'; hoursE.push({ label: String(h), title: k, value: s.byHour[k] || 0, mark: h >= 7 && h < 13 }); }
  const bySubject = Object.keys(s.bySubject).map(k => ({ label: k, value: s.bySubject[k], color: subjectColor(k), icon: subjectIcon(k, 14) })).sort((a, b) => b.value - a.value);
  const byTeacher = Object.keys(s.byTeacher).map(k => ({ label: k, value: s.byTeacher[k], color: '#8C7CFF' })).sort((a, b) => b.value - a.value).slice(0, 10);
  const scrollY = window.scrollY;
  setHTML(root, html`
    <div class="page-head"><div><h2 class="page-title">Analitik</h2><p class="page-sub">Data sebenar daripada setiap tempahan, extend dan kehadiran 5 Sigma.</p></div></div>
    ${kpis(s, n)}
    <div class="an-grid">
      ${coverage(n)}
      <section class="tile an-heat"><div class="tile-head"><span class="eyebrow">${icon('grid', 16)} Peta haba kelas</span><span class="muted">12 minggu lepas + 2 minggu depan</span></div>${heatmap(n)}</section>
      <section class="tile an-days"><div class="tile-head"><span class="eyebrow">${icon('jadual', 16)} Mengikut hari</span></div>${columns(byDay)}</section>
      <section class="tile an-hours"><div class="tile-head"><span class="eyebrow">${icon('clock', 16)} Waktu mula paling popular</span><span class="muted">berjalur: waktu sekolah</span></div>${columns(hoursE, { cls: 'is-hours' })}</section>
      <section class="tile an-subj"><div class="tile-head"><span class="eyebrow">${icon('subjek', 16)} Sesi mengikut subjek</span></div>${bars(bySubject)}</section>
      <section class="tile an-teach"><div class="tile-head"><span class="eyebrow">${icon('guru', 16)} Penggunaan guru</span></div>${bars(byTeacher)}</section>
    </div>
    <div class="section-label"><h3>Kehadiran</h3></div>
    ${attendanceSection(n)}
    <div class="section-label"><h3>Sejarah kelas</h3></div>
    <section class="tile hist-tile" data-hist>${historySection(n)}</section>`);
  if (entering) countUp(root); else window.scrollTo(0, scrollY);
}

async function exportCSV(kind) {
  const n = now();
  let rows, name;
  if (kind === 'att') {
    const all = attendanceOverall(state.bookings);
    rows = [['Pelajar', 'Hadir', 'Lewat', 'Dikecualikan', 'Tidak hadir', 'Kadar (%)']].concat(STUDENT_NAMES.map(nm => { const c = all.perStudent[nm] || emptyTally(); const r = rateFrom(c); return [personName(nm), c.hadir, c.lewat, c.dikecualikan, c.tidak, r == null ? '' : r]; }));
    name = 'kehadiran-5sigma-' + isoDate(n) + '.csv';
  } else {
    rows = [['Tarikh', 'Hari', 'Mula', 'Tamat', 'Subjek', 'Guru', 'Status', 'Catatan', 'Ditempah oleh', 'Hadir']].concat(sortByTime(state.bookings).map(b => {
      const att = b.attendance || {};
      const present = Object.keys(att).filter(k => att[k] === 'hadir' || att[k] === 'lewat').length;
      return [b.date, DAY_MY[dayNameOf(b.date)] || '', b.from, b.to, b.subject, b.teacher, statusLabel(computeStatus(b, n)), b.notes || '', b.autoGenerated ? 'Jadual tetap' : (b.createdBy || ''), isMarked(b) ? present : ''];
    }));
    name = 'jadual-5sigma-' + isoDate(n) + '.csv';
  }
  const r = await saveFile(name, '\uFEFF' + csv(rows), 'text/csv');
  if (r.ok) toast('Fail ' + name + ' sedia', 'success'); else toast(r.message, 'error');
}

export const statistikView = {
  id: 'statistik',
  render(el, params, ctx) {
    root = el;
    histN = 25;
    paint(ctx && ctx.entering);
    if (!el.dataset.wired) {
      el.dataset.wired = '1';
      on(el, 'click', '[data-open]', (e, b) => openClassSheet(b.dataset.open));
      on(el, 'click', '[data-att]', (e, b) => openAttendanceSheet(b.dataset.att));
      on(el, 'click', '[data-more]', () => { histN += 25; setHTML(el.querySelector('[data-hist]'), historySection(now())); });
      on(el, 'click', '[data-export]', (e, b) => exportCSV(b.dataset.export));
      on(el, 'click', '[data-slotfor]', (e, b) => navigate('jadual', { mode: 'week', date: isoDate(now()), slot: { subject: b.dataset.slotfor, len: 60 } }));
      on(el, 'input', '[data-hist-q]', (e, inp) => {
        histQ = inp.value; histN = 25;
        const pos = inp.selectionStart;
        setHTML(el.querySelector('[data-hist]'), historySection(now()));
        const ni = el.querySelector('[data-hist-q]'); ni.focus(); try { ni.setSelectionRange(pos, pos); } catch (err) { /* ignore */ }
      });
    }
  },
  update(reason) {
    if (reason === 'notifications' || reason === 'users' || reason === 'activity') return;
    if (root && root.contains(document.activeElement) && document.activeElement.matches('input')) return;
    paint(false);
  }
};

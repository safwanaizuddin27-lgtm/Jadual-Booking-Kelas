/* Tanya Sigma: the class's assistant, a panel that slides in over any page.

   It understands everyday Malay on the device (nlu.js, offline, instant) and
   answers from the live timetable: what is on now, what is next, a day's or a
   week's classes, free slots (the Slot Pintar ranking), attendance, teachers
   and SPM dates. It books and cancels classes too, always after showing a
   confirmation card. On claude.ai, questions it cannot answer by itself (a
   Physics concept, study advice) go to Claude through the page's `sample`
   capability, with the timetable as context; the viewer is asked first. */

import { state } from '../core/store.js';
import { createBooking } from '../core/store.js';
import { isStudent } from '../core/store.js';
import { findBooking } from '../core/store.js';
import { now } from '../core/clock.js';
import { isoDate } from '../core/util.js';
import { addDays } from '../core/util.js';
import { at } from '../core/util.js';
import { timesOverlap } from '../core/util.js';
import { toMinutes } from '../core/util.js';
import { SUBJECTS } from '../core/data.js';
import { SPM } from '../core/data.js';
import { CLASS_PAPERS } from '../core/data.js';
import { papersOf } from '../core/data.js';
import { SCHOOL_HOURS } from '../core/data.js';
import { JS_DAYS } from '../core/data.js';
import { subjectColor } from '../core/data.js';
import { computeStatus } from '../core/domain.js';
import { sortByTime } from '../core/domain.js';
import { findClashes } from '../core/domain.js';
import { defaultTeacherFor } from '../core/domain.js';
import { attendanceFor } from '../core/domain.js';
import { attendanceOverall } from '../core/domain.js';
import { atRiskStudents } from '../core/domain.js';
import { streakFor } from '../core/domain.js';
import { starsFrom } from '../core/domain.js';
import { onTimeNames } from '../core/domain.js';
import { rosterFor } from '../core/domain.js';
import { findSlots } from './slots.js';
import { parse } from './nlu.js';
import { addMinutesTo } from './nlu.js';
import { getSample } from './host.js';
import { onClaude } from './host.js';
import { html } from '../ui/dom.js';
import { raw } from '../ui/dom.js';
import { setHTML } from '../ui/dom.js';
import { on } from '../ui/dom.js';
import { create } from '../ui/dom.js';
import { esc } from '../core/util.js';
import { icon } from '../ui/icons.js';
import { subjectBadge } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { navigate } from '../ui/router.js';
import { dayLabel } from '../ui/format.js';
import { dayPhrase } from '../ui/format.js';
import { dateShort } from '../ui/format.js';
import { rangeShort } from '../ui/format.js';
import { personName } from '../ui/format.js';
import { firstName } from '../ui/format.js';
import { greeting } from '../ui/format.js';
import { minutesText } from '../ui/format.js';
import { durationText } from '../ui/format.js';
import { statusPill } from '../views/actions.js';
import { openClassSheet } from '../views/actions.js';
import { startCancel } from '../views/actions.js';
import { openBookingSheet } from '../views/booking.js';
import { classPapers } from '../views/spm.js';
import { toggleTheme } from '../fx/theme.js';

const SUGGESTIONS = ['Kelas apa sekarang?', 'Jadual esok', 'Slot kosong esok untuk Fizik', 'Tempah Kimia lusa 3 petang', 'Kehadiran saya', 'Bila SPM Fizik?'];
let panel = null, list = null, input = null, sendBtn = null, scrim = null;
let sample = null, history = [], ctl = null, voice = false;
const pending = new Map();   // confirm-card id -> booking fields
let seq = 0;

/* ---------------------------------------------------------------- helpers */
const active = () => state.bookings.filter(b => !b.cancelledAt);
function whenText(b, n) {
  const mins = Math.round((at(b.date, b.from) - n) / 60000);
  if (mins < 60) return mins + ' minit lagi';
  if (mins < 1440) return Math.floor(mins / 60) + ' jam ' + (mins % 60 ? (mins % 60) + ' minit ' : '') + 'lagi';
  return Math.round(mins / 1440) + ' hari lagi';
}
function card(b, n) {
  const st = computeStatus(b, n);
  return html`<button type="button" class="ai-card st-${st}" data-open="${b.id}" style="--c:${subjectColor(b.subject)}">
    ${subjectBadge(b.subject, 'sm')}<span class="ai-card-main"><b>${b.subject}</b><span>${b.teacher}${b.notes ? ' · ' + b.notes : ''}</span></span>
    <span class="ai-card-side"><b>${dayLabel(b.date, n)}</b><span>${b.from}–${b.to}</span>${st === 'ongoing' || st === 'extending' || st === 'cancelled' ? statusPill(st) : ''}</span></button>`;
}
function chips(arr) { return html`<div class="ai-chips">${arr.map(t => html`<button type="button" class="chip" data-q="${t}">${t}</button>`)}</div>`; }

/* ---------------------------------------------------------------- answers */
function answer(q) {
  const n = now();
  const p = parse(q, n);
  const u = state.user;
  const all = active();
  switch (p.intent) {
    case 'greet':
      return { html: html`<p>${greeting(n.getHours())}${u ? ', ' + firstName(u.name) : ''}! Saya Sigma. Tanya saya tentang jadual, slot kosong, kehadiran atau SPM, atau suruh saya tempah kelas.</p>${chips(SUGGESTIONS.slice(0, 4))}` };
    case 'thanks':
      return { html: html`<p>Sama-sama! Semoga kelas seterusnya berjalan lancar.</p>` };
    case 'help':
      return { html: html`<p>Ini antara yang saya boleh buat:</p><ul class="ai-ul">
        <li><b>Jadual:</b> "kelas esok", "jadual Rabu", "kelas apa sekarang"</li>
        <li><b>Slot kosong:</b> "slot kosong esok untuk Fizik 2 jam"</li>
        <li><b>Tempah:</b> "tempah Kimia Khamis 3-5 petang"</li>
        <li><b>Batal:</b> "batal kelas Biologi esok"</li>
        <li><b>Guru:</b> "siapa cikgu Biologi"</li>
        <li><b>Kehadiran:</b> "kehadiran saya", "bintang skibidi saya"</li>
        <li><b>SPM:</b> "berapa hari lagi SPM", "bila SPM Fizik", "jadual SPM"</li></ul>
        ${sample ? html`<p class="ai-sub">Soalan lain, contohnya tentang pelajaran, saya hantar kepada Claude.</p>` : ''}${chips(SUGGESTIONS)}` };
    case 'theme':
      setTimeout(() => toggleTheme(panel.querySelector('.ai-orb')), 120);
      return { html: html`<p>Tema ditukar.</p>` };
    case 'navigate':
      setTimeout(() => { if (p.view !== 'utama') closeAssistant(); navigate(p.view); }, 250);
      return { html: html`<p>Membuka halaman <b>${p.view}</b>.</p>` };
    case 'spm': return spmAnswer(n, p.subject);
    case 'now': {
      const live = sortByTime(all).filter(b => { const s = computeStatus(b, n); return s === 'ongoing' || s === 'extending'; });
      if (!live.length) {
        const nx = sortByTime(all).find(b => computeStatus(b, n) === 'upcoming');
        return { html: html`<p>Tiada kelas sedang berlangsung sekarang.</p>${nx ? html`<p>Seterusnya, <b>${whenText(nx, n)}</b>:</p>${card(nx, n)}` : ''}${chips(['Slot kosong esok', 'Jadual esok'])}` };
      }
      return { html: html`${live.map(b => {
        const left = Math.max(0, Math.round((at(b.date, b.to) - n) / 60000));
        const roster = rosterFor(b.subject), marked = b.attendance && Object.keys(b.attendance).length > 0;
        const stars = onTimeNames(b).filter(x => roster.includes(x)).length;
        return html`${card(b, n)}<p class="ai-sub">${b.extensionActive ? 'Sedang extend.' : 'Tinggal ' + minutesText(left) + '.'} ${marked ? stars + '/' + roster.length + ' bintang skibidi setakat ini.' : 'Kehadiran belum ditanda.'}</p>`;
      })}` };
    }
    case 'next': {
      const up = sortByTime(all).filter(b => computeStatus(b, n) === 'upcoming' && (!p.subject || b.subject === p.subject));
      if (!up.length) return { html: html`<p>Tiada kelas ${p.subject ? p.subject + ' ' : ''}akan datang dalam jadual.</p>${chips([p.subject ? 'Slot kosong minggu ini untuk ' + p.subject : 'Slot kosong esok'])}` };
      const b = up[0];
      return { html: html`<p>Kelas ${p.subject ? p.subject + ' ' : ''}seterusnya bermula <b>${whenText(b, n)}</b>:</p>${card(b, n)}${up.length > 1 ? html`<p class="ai-sub">Selepas itu: ${up.slice(1, 3).map(x => x.subject + ' (' + dayPhrase(x.date, n) + ' ' + x.from + ')').join(', ')}.</p>` : ''}` };
    }
    case 'teacher': {
      const cfg = state.config;
      if (!p.subject) return { html: html`<p>Guru utama setiap subjek:</p><ul class="ai-ul ai-teachers">${SUBJECTS.map(s => html`<li><i class="dot" style="--c:${s.color}"></i>${s.name}: <b>${defaultTeacherFor(cfg, s.name) || '—'}</b></li>`)}</ul>` };
      const ws = (cfg.workshopTeachers && cfg.workshopTeachers[p.subject]) || [];
      return { html: html`<p>Guru utama ${p.subject} ialah <b>${defaultTeacherFor(cfg, p.subject) || 'belum ditetapkan'}</b>.${ws.length ? ' Guru bengkel: ' + ws.join(', ') + '.' : ''}</p>` };
    }
    case 'attendance': return attendanceAnswer(n);
    case 'checkin': return checkinAnswer();
    case 'count': {
      const range = p.dates ? p.dates.dates : null;
      const cnt = all.filter(b => (!range || range.includes(b.date)) && (!p.subject || b.subject === p.subject)).length;
      return { html: html`<p>${range ? 'Ada' : 'Jumlah'} <b>${cnt}</b> kelas${p.subject ? ' ' + p.subject : ''}${range ? ' ' + (p.dates.label || 'pada tarikh itu') : ' direkodkan setakat ini'}.</p>` };
    }
    case 'free': return freeAnswer(p, n);
    case 'book': return bookAnswer(p, n);
    case 'cancel': return cancelAnswer(p, n);
    case 'list': {
      const days = p.dates ? p.dates.dates : [isoDate(n)];
      const rows = sortByTime(all).filter(b => days.includes(b.date) && (!p.subject || b.subject === p.subject));
      const label = p.dates ? (p.dates.label || dayPhrase(days[0], n)) : 'hari ini';
      if (!rows.length) return { html: html`<p>Tiada kelas ${label}${p.subject ? ' untuk ' + p.subject : ''}.</p>${chips(['Slot kosong ' + label])}` };
      return { html: html`<p><b>${rows.length}</b> kelas ${label}:</p><div class="ai-cards">${rows.map(b => card(b, n))}</div>${days.length === 1 ? html`<div class="ai-actions"><button type="button" class="btn ghost sm" data-goto="jadual" data-date="${days[0]}">${icon('jadual', 15)}<span>Buka dalam Jadual</span></button></div>` : ''}` };
    }
    default: return null;
  }
}

function spmAnswer(n, subject) {
  const today = isoDate(n);
  const days = iso => Math.round((new Date(iso + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
  const when = p => rangeShort(p.date, p.dateTo) + (p.from ? ', ' + p.from + '–' + p.to : '');
  const left = p => { const x = days(p.date); return p.dateTo < today ? 'selesai' : x > 0 ? x + ' hari lagi' : 'hari ini'; };
  const goto = html`<div class="ai-actions"><button type="button" class="btn ghost sm" data-goto="spm"${subject ? html` data-subject="${subject}"` : ''}>${icon('spm', 15)}<span>Jadual SPM penuh</span></button></div>`;
  if (subject) {
    const list = papersOf(subject);
    return { html: html`<p>Kertas SPM 2026 untuk <b>${subject}</b>:</p>
      <ul class="ai-ul">${list.map(p => html`<li><b>${p.paper}</b> (${p.code}): ${when(p)} <span class="ai-sub">· ${left(p)}</span></li>`)}</ul>${goto}` };
  }
  const d = days(SPM.writtenStart);
  const mine = classPapers().filter(p => p.dateTo >= today).slice(0, 4);
  return { html: html`<p>Peperiksaan bertulis SPM 2026 bermula <b>${d > 0 ? d + ' hari lagi' : 'sekarang'}</b>, pada ${dateShort(SPM.writtenStart)} (hingga ${dateShort(SPM.writtenEnd)}).</p>
    ${mine.length ? html`<p>Kertas seterusnya:</p><ul class="ai-ul">${mine.map(p => html`<li><b>${p.name}</b>, ${p.paper}: ${when(p)} <span class="ai-sub">· ${left(p)}</span></li>`)}</ul>` : ''}
    <p class="ai-sub">Setiap amali sains ada harinya sendiri: Fizik 16 Nov, Kimia 17 Nov, Biologi 18 Nov. Sumber: Lembaga Peperiksaan, KPM.</p>${goto}${chips(['Bila SPM Matematik Tambahan?', 'Slot kosong minggu ini untuk Bahasa Melayu'])}` };
}

function attendanceAnswer(n) {
  const u = state.user;
  if (state.isAdmin || (u && u.type === 'Cikgu')) {
    const all = attendanceOverall(state.bookings);
    const low = atRiskStudents(state.bookings, 80);
    return { html: html`<p>Kehadiran keseluruhan kelas: <b>${all.rate === null ? '—' : all.rate + '%'}</b> daripada ${all.classes} kelas yang ditanda.</p>
      ${low.length ? html`<p>Perlu perhatian (bawah 80%):</p><ul class="ai-ul">${low.map(x => html`<li>${personName(x.name)}: <b>${x.rate}%</b></li>`)}</ul>` : html`<p>Tiada pelajar di bawah 80%.</p>`}
      <div class="ai-actions"><button type="button" class="btn ghost sm" data-goto="statistik">${icon('statistik', 15)}<span>Buka Analitik</span></button></div>` };
  }
  if (!isStudent()) return { html: html`<p>Kehadiran direkodkan untuk pelajar sahaja.</p>` };
  const a = attendanceFor(state.bookings, u.name);
  if (!a.total) return { html: html`<p>Belum ada rekod kehadiran untuk anda.</p>` };
  const stars = starsFrom(a.counts);
  return { html: html`<p>Kehadiran anda <b>${a.rate}%</b> daripada ${a.total} kelas. Anda sudah kumpul <b>${stars} bintang skibidi</b>, dengan <b>${streakFor(state.bookings, u.name, n)}</b> kelas tepat masa berturut-turut.</p>
    <p class="ai-sub">Hadir tepat masa ${a.counts.hadir}, lewat ${a.counts.lewat} (tiada bintang), dikecualikan ${a.counts.dikecualikan}, tidak hadir ${a.counts.tidak}.</p>` };
}

// Self check-in was removed (students in the hostel have no phones in class); explain the new rule instead.
function checkinAnswer() {
  return { html: html`<p>Tiada lagi daftar masuk sendiri. Kehadiran ditanda oleh admin.</p>
    <p class="ai-sub">Hadir tepat masa = 1 bintang skibidi. Lewat tidak dapat bintang.</p>${chips(['Kehadiran saya'])}` };
}

function slotList(slots, subject, n) {
  return html`<div class="ai-slots">${slots.map((s, i) => html`<button type="button" class="ai-slot" data-slot="${s.date}|${s.from}|${s.to}|${subject || ''}">
    <span class="ai-slot-rank">${i + 1}</span><span class="ai-slot-main"><b>${dayLabel(s.date, n)}, ${s.from}–${s.to}</b><span>${s.why.slice(0, 2).join(', ') || 'tiada pertembungan'}</span></span><span class="ai-slot-go">Tempah ${icon('right', 14)}</span></button>`)}</div>`;
}
function freeAnswer(p, n) {
  const dates = p.dates ? p.dates.dates : [0, 1, 2].map(i => isoDate(addDays(n, i)));
  const len = p.duration || 60;
  const slots = findSlots(state.bookings, { dates, subject: p.subject, length: len, now: n, max: 3 });
  const where = p.dates ? (p.dates.label || dayPhrase(dates[0], n)) : 'dalam 3 hari ini';
  if (!slots.length) return { html: html`<p>Tiada slot ${durationText('00:00', addMinutesTo('00:00', len))} yang sesuai ${where}. Cuba hari lain atau tempoh lebih pendek.</p>${chips(['Slot kosong minggu depan' + (p.subject ? ' untuk ' + p.subject : '')])}` };
  return { html: html`<p>Masa terbaik untuk <b>${p.subject || 'kelas'}</b> (${durationText('00:00', addMinutesTo('00:00', len))}) ${where}, disusun mengikut kesesuaian:</p>${slotList(slots, p.subject, n)}<p class="ai-sub">Waktu sekolah, solat Jumaat, maghrib dan pertembungan dielakkan.</p>` };
}

function bookAnswer(p, n) {
  if (!state.user) return { html: html`<p>Log masuk dahulu untuk menempah kelas.</p>` };
  if (!p.subject) return { html: html`<p>Subjek apa yang anda mahu tempah?</p>${chips(SUBJECTS.slice(0, 6).map(s => 'Tempah ' + s.name + ' ' + (p.dates ? (p.dates.label || dayPhrase(p.dates.dates[0], n)) : 'esok') + (p.times ? ' ' + p.times.from : ' 3 petang')))}` };
  const date = p.dates ? p.dates.dates[0] : isoDate(addDays(n, 1));
  if (!p.times) return freeAnswer(Object.assign({}, p, { dates: { dates: [date], label: dayPhrase(date, n) } }), n);
  const from = p.times.from;
  const to = p.times.to || addMinutesTo(from, p.duration || 60);
  return { html: confirmCard({ subject: p.subject, date, from, to }, n) };
}

function confirmCard(f, n) {
  const teacher = defaultTeacherFor(state.config, f.subject) || '';
  const clashes = findClashes(state.bookings, f.subject, f.date, f.from, f.to, null);
  const past = at(f.date, f.from) < n;
  const sh = SCHOOL_HOURS[JS_DAYS[new Date(f.date + 'T00:00:00').getDay()]];
  const school = sh && timesOverlap(f.from, f.to, sh.from, sh.to);
  const id = 'c' + (++seq);
  pending.set(id, Object.assign({ teacher }, f));
  const warn = past ? html`<p class="ai-warn">${icon('warn', 15)} Masa ini sudah lepas.</p>`
    : clashes.length ? html`<p class="ai-warn">${icon('warn', 15)} Bertindih dengan ${clashes[0].subject} (${clashes[0].from}–${clashes[0].to}).</p>`
    : school ? html`<p class="ai-warn">${icon('info', 15)} Masa ini dalam waktu persekolahan.</p>`
    : html`<p class="ai-ok">${icon('check', 15)} Tiada pertembungan. Slot ini kosong.</p>`;
  return html`<p>Semak tempahan ini:</p>
    <div class="ai-confirm" style="--c:${subjectColor(f.subject)}">${subjectBadge(f.subject, 'md', 'is-solid')}
      <div><b>${f.subject}</b><span>${teacher || 'Guru belum ditetapkan'}</span><span class="ai-confirm-when">${dayLabel(f.date, n)} · ${f.from}–${f.to} (${durationText(f.from, f.to)})</span></div></div>
    ${warn}
    <div class="ai-actions"><button type="button" class="btn primary sm" data-confirm="${id}" ${past || !teacher ? 'disabled' : ''}>${icon('check', 15)}<span>${clashes.length ? 'Tempah juga' : 'Sahkan tempahan'}</span></button>
      <button type="button" class="btn ghost sm" data-form="${id}">${icon('kelas', 15)}<span>Ubah dalam borang</span></button></div>`;
}

function cancelAnswer(p, n) {
  if (!state.user) return { html: html`<p>Log masuk dahulu.</p>` };
  const days = p.dates ? p.dates.dates : null;
  const rows = sortByTime(active()).filter(b => computeStatus(b, n) === 'upcoming' && (!p.subject || b.subject === p.subject) && (!days || days.includes(b.date))).slice(0, 4);
  if (!rows.length) return { html: html`<p>Tiada kelas akan datang yang sepadan${p.subject ? ' untuk ' + p.subject : ''}${days ? ' ' + (p.dates.label || dayPhrase(days[0], n)) : ''}.</p>` };
  return { html: html`<p>${rows.length === 1 ? 'Kelas ini akan dibatalkan. Teruskan?' : 'Pilih kelas yang hendak dibatalkan:'}</p>
    ${rows.map(b => html`${card(b, n)}<div class="ai-actions"><button type="button" class="btn ghost sm danger-text" data-cancel="${b.id}">${icon('trash', 15)}<span>Batalkan ${b.subject}, ${dayPhrase(b.date, n)} ${b.from}</span></button></div>`)}` };
}

/* ---------------------------------------------------------------- Claude */
function context(n) {
  const from = isoDate(addDays(n, -2)), to = isoDate(addDays(n, 7));
  const rows = sortByTime(active()).filter(b => b.date >= from && b.date <= to).map(b => b.date + ' ' + b.from + '-' + b.to + ' ' + b.subject + ' (' + b.teacher + ')' + (b.notes ? ' — ' + b.notes : '')).join('\n');
  const u = state.user;
  return 'Sekarang: ' + isoDate(n) + ' ' + String(n.toTimeString()).slice(0, 5) + ' (waktu Malaysia).\n' +
    'Pengguna: ' + (u ? personName(u.name) + ' (' + (state.isAdmin ? 'pelajar, admin kelas' : u.type) + ')' : 'tidak diketahui') + '.\n' +
    'Kelas 5 Sigma: Tingkatan 5, 13 pelajar. SPM 2026: bertulis ' + SPM.writtenStart + ' hingga ' + SPM.writtenEnd + '; ' + SPM.milestones.filter(m => m.id !== 'written').map(m => m.label + ' ' + m.from + (m.to !== m.from ? ' hingga ' + m.to : '')).join('; ') + '.\n' +
    'Kertas bertulis kelas ini: ' + CLASS_PAPERS.filter(p => p.kind === 'bertulis').map(p => p.name + ' ' + p.paper + ' ' + p.date + ' ' + p.from + '-' + p.to).join('; ') + '.\n' +
    'Guru subjek: ' + SUBJECTS.map(s => s.name + ' = ' + (defaultTeacherFor(state.config, s.name) || '-')).join('; ') + '.\n' +
    'Kelas tambahan (2 hari lepas hingga 7 hari akan datang):\n' + (rows || '(tiada)');
}
const RULES = 'Anda Sigma, pembantu dalam aplikasi 5 Sigma Class Hub, untuk kelas Tingkatan 5 di Malaysia yang menduduki SPM 2026. ' +
  'Jawab dalam Bahasa Melayu yang mesra dan ringkas: paling banyak 120 patah perkataan, perenggan pendek, senarai bertitik jika sesuai. ' +
  'Untuk soalan pelajaran, terangkan dengan jelas mengikut sukatan KSSM dan beri satu contoh. ' +
  'Untuk jadual, guna data di bawah sahaja dan jangan reka kelas. ' +
  'Bintang skibidi: satu bintang untuk setiap kelas yang dihadiri tepat masa (status Hadir); lewat tidak dapat bintang. Tiada daftar masuk sendiri: kehadiran ditanda oleh admin. ' +
  'Anda tidak boleh menempah atau membatalkan kelas sendiri: jika diminta, suruh pengguna taip ayat seperti "tempah Fizik esok 3 petang" atau "batal kelas Fizik esok".\n\n';

function md(text) {
  // Small, safe Markdown: escape first, then bold, italics and bullet lists.
  const lines = esc(text).split(/\n/);
  let out = '', inList = false;
  lines.forEach(l => {
    const li = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) { if (!inList) { out += '<ul class="ai-ul">'; inList = true; } out += '<li>' + li[1] + '</li>'; return; }
    if (inList) { out += '</ul>'; inList = false; }
    if (l.trim()) out += '<p>' + l + '</p>';
  });
  if (inList) out += '</ul>';
  return out.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<i>$2</i>');
}

async function askClaude(q, bubble) {
  const n = now();
  const turns = [{ role: 'user', content: RULES + context(n) }].concat(history.slice(-6)).concat([{ role: 'user', content: q }]);
  ctl = new AbortController();
  busy(true);
  setHTML(bubble, html`<p class="ai-typing" aria-label="Sigma sedang berfikir"><span></span><span></span><span></span></p>`);
  try {
    const res = await sample(turns, { cache: false, modelTier: 'quick', signal: ctl.signal, onText: ({ text }) => { setHTML(bubble, raw(md(text))); scrollEnd(); } });
    setHTML(bubble, raw(md(res.text) + '<p class="ai-by">' + icon('spark', 12).s + ' Dijawab oleh Claude' + (res.truncated ? ' (terpotong)' : '') + '</p>'));
    history.push({ role: 'user', content: q }, { role: 'assistant', content: res.text });
  } catch (e) {
    const code = e && e.code;
    if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) { sample = null; panel.classList.remove('has-claude'); }
    if (code === 'cancelled') { setHTML(bubble, raw(md(e.text || '') + '<p class="ai-by">Dihentikan</p>')); }
    else if (code === 'refused') setHTML(bubble, html`<p>Maaf, saya tidak dapat menjawab soalan itu.</p>`);
    else if (code === 'rate_limited') setHTML(bubble, html`<p>Terlalu banyak soalan dalam masa singkat. Cuba lagi sebentar lagi.</p>`);
    else setHTML(bubble, raw((e && e.text ? md(e.text) : '') + '<p>Maaf, saya belum dapat menjawab soalan itu sekarang. Cuba tanya tentang jadual, slot kosong, kehadiran atau SPM.</p>'));
  } finally { busy(false); ctl = null; scrollEnd(); }
}

/* ---------------------------------------------------------------- panel */
function busy(on_) {
  panel.classList.toggle('is-busy', on_);
  setHTML(sendBtn, on_ ? icon('x', 18) : icon('send', 18));
  sendBtn.setAttribute('aria-label', on_ ? 'Hentikan' : 'Hantar');
}
function scrollEnd() { list.scrollTop = list.scrollHeight; }
function push(role, content) {
  const el = create('div', { class: 'ai-msg is-' + role });
  if (role === 'ai') el.appendChild(create('span', { class: 'ai-orb sm', 'aria-hidden': 'true' }, 'Σ'));
  const bubble = create('div', { class: 'ai-bubble' }, content);
  el.appendChild(bubble);
  list.appendChild(el);
  scrollEnd();
  return bubble;
}

function send(q) {
  q = String(q || '').trim();
  if (!q) return;
  if (ctl) return;
  push('me', html`<p>${q}</p>`);
  input.value = '';
  const res = answer(q);
  const bubble = push('ai', html`<p class="ai-typing"><span></span><span></span><span></span></p>`);
  if (res) { setTimeout(() => { setHTML(bubble, res.html); scrollEnd(); }, 320); return; }
  if (sample) { askClaude(q, bubble); return; }
  setTimeout(() => {
    setHTML(bubble, html`<p>Saya belum faham soalan itu. Cuba salah satu ini:</p>${chips(SUGGESTIONS.slice(0, 4))}${onClaude ? '' : html`<p class="ai-sub">Di claude.ai, soalan bebas seperti ini dijawab oleh Claude.</p>`}`);
    scrollEnd();
  }, 300);
}

function welcome() {
  const u = state.user;
  push('ai', html`<p>Hai${u ? ' ' + firstName(u.name) : ''}! Saya <b>Sigma</b>. Tanya apa-apa tentang jadual 5 Sigma, atau suruh saya cari slot dan tempah kelas.</p>${chips(SUGGESTIONS)}`);
}

export function openAssistant(q) {
  if (!panel || !state.user) return;
  const wasOpen = !panel.hidden;
  if (!wasOpen) {
    panel.hidden = false; scrim.hidden = false;
    requestAnimationFrame(() => { panel.classList.add('is-open'); scrim.classList.add('is-open'); });
    document.documentElement.classList.add('ai-open');
  }
  if (!list.children.length) welcome();
  if (q && /\s$/.test(q)) { input.value = q; setTimeout(() => input.focus(), 80); }
  else if (q) send(q);
  else setTimeout(() => input.focus(), 80);
}
export function closeAssistant() {
  if (!panel || panel.hidden) return;
  panel.classList.remove('is-open'); scrim.classList.remove('is-open');
  document.documentElement.classList.remove('ai-open');
  setTimeout(() => { if (!panel.classList.contains('is-open')) { panel.hidden = true; scrim.hidden = true; } }, 280);
}
export function resetAssistant() {
  if (ctl) ctl.abort();
  history = []; pending.clear();
  if (list) setHTML(list, '');
  closeAssistant();
}

export function initAssistant() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  voice = !!SR && !onClaude;     // claude.ai pages have no microphone
  scrim = create('div', { class: 'ai-scrim', hidden: true });
  panel = create('aside', { class: 'ai', id: 'ai', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Tanya Sigma', hidden: true }, html`
    <div class="sheet-grip" aria-hidden="true"></div>
    <header class="ai-head">
      <span class="ai-orb" aria-hidden="true">Σ</span>
      <div class="ai-title"><b>Tanya Sigma</b><span>Pembantu jadual 5 Sigma<span class="ai-claude"> · dengan Claude</span></span></div>
      <button type="button" class="icon-btn" data-ai-clear aria-label="Mula perbualan baharu" title="Mula semula">${icon('undo', 18)}</button>
      <button type="button" class="icon-btn" data-ai-close aria-label="Tutup">${icon('x', 18)}</button>
    </header>
    <div class="ai-list" aria-live="polite"></div>
    <form class="ai-form" novalidate>
      <input class="input" type="text" autocomplete="off" enterkeyhint="send" placeholder="Contoh: tempah Fizik esok 3 petang" aria-label="Tanya Sigma">
      ${voice ? html`<button type="button" class="icon-btn ai-mic" data-mic aria-label="Cakap">${icon('mic', 18)}</button>` : ''}
      <button type="submit" class="btn primary icon-only ai-send" aria-label="Hantar">${icon('send', 18)}</button>
    </form>`);
  document.body.appendChild(scrim);
  document.body.appendChild(panel);
  list = panel.querySelector('.ai-list');
  input = panel.querySelector('.ai-form input');
  sendBtn = panel.querySelector('.ai-send');

  scrim.addEventListener('click', closeAssistant);
  panel.querySelector('[data-ai-close]').addEventListener('click', closeAssistant);
  panel.querySelector('[data-ai-clear]').addEventListener('click', () => { if (ctl) ctl.abort(); history = []; pending.clear(); setHTML(list, ''); welcome(); input.focus(); });
  panel.querySelector('.ai-form').addEventListener('submit', e => { e.preventDefault(); if (ctl) { ctl.abort(); return; } send(input.value); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panel && !panel.hidden && !document.querySelector('dialog[open]')) { e.preventDefault(); closeAssistant(); }
  });

  on(list, 'click', '[data-q]', (e, b) => send(b.dataset.q));
  on(list, 'click', '[data-open]', (e, b) => openClassSheet(b.dataset.open));
  on(list, 'click', '[data-slot]', (e, b) => {
    const [date, from, to, subject] = b.dataset.slot.split('|');
    if (!subject) { openBookingSheet({ prefill: { date, from, to } }); return; }
    push('ai', confirmCard({ subject, date, from, to }, now()));
  });
  on(list, 'click', '[data-form]', (e, b) => { const f = pending.get(b.dataset.form); if (f) openBookingSheet({ prefill: f }); });
  on(list, 'click', '[data-confirm]', async (e, b) => {
    const f = pending.get(b.dataset.confirm);
    if (!f) return;
    b.disabled = true;
    setHTML(b, html`${icon('clock', 15)}<span>Menempah…</span>`);
    const res = await createBooking({ subject: f.subject, teacher: f.teacher, date: f.date, day: JS_DAYS[new Date(f.date + 'T00:00:00').getDay()], from: f.from, to: f.to, notes: '' });
    if (res.ok) {
      b.closest('.ai-bubble').querySelectorAll('button').forEach(x => { x.disabled = true; });
      setHTML(b, html`${icon('check', 15)}<span>Ditempah</span>`);
      pending.delete(b.dataset.confirm);
      push('ai', html`<p>Siap! <b>${f.subject}</b> ditempah untuk ${dayPhrase(f.date, now())}, ${f.from}–${f.to}. Rakan sekelas akan menerima notifikasi.</p>
        <div class="ai-actions"><button type="button" class="btn ghost sm" data-goto="jadual" data-date="${f.date}">${icon('jadual', 15)}<span>Lihat dalam Jadual</span></button></div>`);
      toast('Tempahan berjaya! ' + f.subject + ', ' + dayPhrase(f.date, now()) + ' ' + f.from, 'success');
    } else {
      b.disabled = false;
      setHTML(b, html`${icon('undo', 15)}<span>Cuba lagi</span>`);
      push('ai', html`<p class="ai-warn">${res.message || 'Tempahan gagal.'}</p>`);
    }
  });
  on(list, 'click', '[data-cancel]', (e, b) => { if (findBooking(b.dataset.cancel)) startCancel(b.dataset.cancel); });
  on(list, 'click', '[data-goto]', (e, b) => {
    closeAssistant();
    navigate(b.dataset.goto, b.dataset.date ? { date: b.dataset.date, mode: 'day' } : b.dataset.subject ? { subject: b.dataset.subject } : null);
  });

  if (voice) {
    const mic = panel.querySelector('[data-mic]');
    mic.addEventListener('click', () => {
      let rec;
      try { rec = new SR(); } catch (err) { toast('Input suara tidak disokong di sini.', 'error'); return; }
      rec.lang = 'ms-MY'; rec.interimResults = true; rec.maxAlternatives = 1;
      mic.classList.add('is-on');
      rec.onresult = ev => { const r = ev.results[ev.results.length - 1]; input.value = r[0].transcript; if (r.isFinal) send(input.value); };
      rec.onerror = () => toast('Mikrofon tidak dapat digunakan. Taip soalan anda.', 'warning');
      rec.onend = () => mic.classList.remove('is-on');
      try { rec.start(); } catch (err) { mic.classList.remove('is-on'); }
    });
  }

  getSample().then(s => { sample = s; if (s) panel.classList.add('has-claude'); });
}

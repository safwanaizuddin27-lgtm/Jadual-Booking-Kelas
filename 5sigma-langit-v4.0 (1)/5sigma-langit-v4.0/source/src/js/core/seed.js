/* The two datasets the sandbox can start from.

   - Data sebenar (default): the original site's Firestore data, copied on
     5 Oct 2026 (snapshot.js). Real bookings, attendance, logins and activity.
   - Data demo: ten weeks of generated, real-looking history, a class that is
     live right now and the coming fortnight. Built around the current time on
     every reset, and deterministic (seeded PRNG) so every judge sees the same story. */

import { prng } from './util.js';
import { isoDate } from './util.js';
import { addDays } from './util.js';
import { startOfWeek } from './util.js';
import { toMinutes } from './util.js';
import { minutesToTime } from './util.js';
import { timesOverlap } from './util.js';
import { at } from './util.js';
import { STUDENT_NAMES } from './data.js';
import { DEFAULT_SUBJECT_TEACHERS } from './data.js';
import { SUBJECT_ROSTERS } from './data.js';
import { JS_DAYS } from './data.js';
import { WEEK_ORDER } from './data.js';
import { SCHOOL_HOURS } from './data.js';
import { EXEMPT_PAIRS } from './data.js';
import { REAL_SNAPSHOT } from './snapshot.js';

// How reliably each student turns up; two are deliberately at risk so the
// analytics have something real to flag.
const RELIABILITY = {
  ADRIN: 0.93, ALEEYSHA: 0.95, DEA: 0.92, HUSNA: 0.98, IVY: 0.94, KAETLYNN: 0.86, KHAERA: 0.95,
  AKIM: 0.9, YASIN: 0.91, SAFWAN: 0.97, NATHANEIL: 0.78, HAZARINNA: 0.94, OCFREATY: 0.7
};
const LATE_RATE = { AKIM: 0.25, YASIN: 0.2, KAETLYNN: 0.18 };

// Weekly habits of the class (JS weekday numbers: 1 = Monday).
const PATTERNS = [
  { day: 1, subject: 'Matematik', from: '14:00', to: '15:30', p: 0.82 },
  { day: 1, subject: 'Matematik Tambahan', from: '20:30', to: '22:00', p: 0.28 },
  { day: 2, subject: 'Fizik', from: '14:30', to: '16:00', p: 0.78 },
  { day: 3, subject: 'Bahasa Melayu', from: '14:00', to: '15:00', p: 0.66 },
  { day: 3, subject: 'Kimia', from: '15:30', to: '17:00', p: 0.72 },
  { day: 3, subject: 'Fizik', from: '20:30', to: '22:00', p: 0.2 },
  { day: 4, subject: 'Matematik Tambahan', from: '14:30', to: '16:00', p: 0.76 },
  { day: 4, subject: 'Pendidikan Islam', from: '16:15', to: '17:15', p: 0.34, pair: 'Pendidikan Moral' },
  { day: 5, subject: 'Biologi', from: '14:30', to: '16:00', p: 0.62 },
  { day: 6, subject: 'Sejarah', from: '09:00', to: '11:00', p: 0.46 },
  { day: 6, subject: 'English', from: '11:15', to: '12:30', p: 0.42 }
];
const TEACHERS_WHO_LOG_IN = ['Cikgu Azurah', 'Cikgu Norhani', 'Cikgu Tiong', 'Madam Patricia', 'Miss Dayang'];

export function buildSeed(nowDate, source) {
  return source === 'demo' ? buildDemoSeed(nowDate) : buildRealSeed(nowDate);
}

// The original site's data, exactly as copied (a fresh deep copy on every reset).
export function buildRealSeed(nowDate) {
  const snap = JSON.parse(JSON.stringify(REAL_SNAPSHOT));
  return { docs: snap.docs, cols: snap.cols, seededAt: nowDate.getTime(), source: 'real', takenAt: snap.takenAt };
}

export function buildDemoSeed(nowDate) {
  const rand = prng(5);
  const now = new Date(nowDate.getTime());
  const todayISO = isoDate(now);
  const nowMs = now.getTime();
  const bookings = [];
  let seq = 0;
  const nextId = () => 'd' + String(++seq).padStart(4, '0');
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const ts = ms => ({ __ts: Math.round(ms) });

  const exempt = (a, b) => a !== b && EXEMPT_PAIRS.some(p => p.includes(a) && p.includes(b));
  function free(date, subject, from, to) {
    return !bookings.some(b => !b.cancelledAt && b.date === date && timesOverlap(b.from, b.to, from, to) && !exempt(b.subject, subject));
  }
  function base(o) {
    const author = o.author || (rand() < 0.38 ? pick(TEACHERS_WHO_LOG_IN) : pick(STUDENT_NAMES));
    const created = at(o.date, o.from).getTime() - (2 + Math.floor(rand() * 5)) * 86400000;
    return Object.assign({
      id: nextId(), notes: '', teacher: DEFAULT_SUBJECT_TEACHERS[o.subject],
      createdBy: author, createdByType: TEACHERS_WHO_LOG_IN.includes(author) ? 'Cikgu' : 'Pelajar',
      createdAt: created, originalTo: o.to, extensionActive: false, extensionHistory: []
    }, o, { author: undefined });
  }
  function rosterOf(subject) { return SUBJECT_ROSTERS[subject] ? SUBJECT_ROSTERS[subject].slice() : STUDENT_NAMES.slice(); }

  function markAttendance(b) {
    const att = {};
    const night = toMinutes(b.from) >= 19 * 60;
    rosterOf(b.subject).forEach(name => {
      const rel = (RELIABILITY[name] || 0.92) - (night ? 0.06 : 0);
      if (rand() < rel) {
        const late = rand() < (LATE_RATE[name] || 0.08);
        att[name] = late ? 'lewat' : 'hadir';
      } else {
        att[name] = rand() < 0.25 ? 'dikecualikan' : 'tidak';
      }
    });
    b.attendance = att;
    b.attendanceBy = 'SAFWAN';
    b.attendanceAt = at(b.date, b.to).getTime() + 15 * 60000;
  }

  /* ---------- recurring templates, on two days that are not today or tomorrow ---------- */
  const avoid = [JS_DAYS[now.getDay()], JS_DAYS[addDays(now, 1).getDay()]];
  const templateDays = ['Tuesday', 'Thursday', 'Monday', 'Wednesday', 'Friday'].filter(d => !avoid.includes(d)).slice(0, 2);
  const templates = [
    { id: 'rt-fizik', subject: 'Fizik', teacher: 'Cikgu Norhani', day: templateDays[0], from: '14:30', to: '16:00' },
    { id: 'rt-addmath', subject: 'Matematik Tambahan', teacher: 'Miss Dayang', day: templateDays[1], from: '14:30', to: '16:00' }
  ].map(t => Object.assign(t, { createdBy: 'SAFWAN', createdAt: nowMs - 22 * 86400000 }));

  /* ---------- ten weeks of history ---------- */
  const thisWeek = startOfWeek(now);
  for (let w = -10; w <= 0; w++) {
    const ws = addDays(thisWeek, w * 7);
    PATTERNS.forEach(p => {
      const d = addDays(ws, p.day - 1);
      const date = isoDate(d);
      if (date >= todayISO) return;                       // history only; today is built by hand
      if (rand() > p.p) return;
      let from = p.from, to = p.to;
      if (rand() < 0.18) { const shift = rand() < 0.5 ? -30 : 30; from = minutesToTime(toMinutes(from) + shift); to = minutesToTime(toMinutes(to) + shift); }
      const sh = SCHOOL_HOURS[JS_DAYS[d.getDay()]];
      if (sh && timesOverlap(from, to, sh.from, sh.to)) return;
      if (!free(date, p.subject, from, to)) return;
      const teacher = (p.subject === 'Matematik' && rand() < 0.12) ? 'CIKGU BENGKEL A' : DEFAULT_SUBJECT_TEACHERS[p.subject];
      const b = base({ subject: p.subject, teacher, date, from, to });
      // The last three weeks of the templated classes were generated by Jadual Tetap.
      const tpl = templates.find(t => t.subject === p.subject && t.day === JS_DAYS[d.getDay()]);
      if (tpl && w >= -3) { Object.assign(b, { autoGenerated: true, templateId: tpl.id, createdBy: 'JADUAL TETAP', createdByType: 'Sistem', from: tpl.from, to: tpl.to, originalTo: tpl.to, teacher: tpl.teacher }); }
      if (rand() < 0.06) {
        b.cancelledAt = at(date, from).getTime() - 3600000 * (2 + Math.floor(rand() * 20));
        b.cancelledBy = pick(STUDENT_NAMES); b.cancelledByType = 'Pelajar';
      } else {
        if (rand() < 0.1) {
          const extra = rand() < 0.5 ? 15 : 30;
          const newTo = minutesToTime(toMinutes(b.to) + extra);
          const startedAt = at(date, b.to).getTime() - 5 * 60000;
          b.extensionHistory = [{ id: 'x' + b.id, startedBy: pick(STUDENT_NAMES), startedAt, extendedUntil: newTo, stoppedBy: b.teacher, stoppedAt: at(date, newTo).getTime() }];
          b.originalTo = b.to; b.to = newTo;
        }
        if (rand() < 0.9) markAttendance(b);
      }
      bookings.push(b);
      if (p.pair && !b.cancelledAt) {
        const twin = base({ subject: p.pair, date, from: b.from, to: b.to });
        if (rand() < 0.9) markAttendance(twin);
        bookings.push(twin);
      }
    });
  }

  /* ---------- today: a class that is live right now ---------- */
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const liveFrom = Math.max(0, Math.floor((nowMin - 25) / 5) * 5);
  const liveTo = Math.min(23 * 60 + 55, liveFrom + 60);
  const live = base({ subject: 'Matematik', teacher: 'Cikgu Azurah', date: todayISO, from: minutesToTime(liveFrom), to: minutesToTime(liveTo), author: 'SAFWAN', notes: 'Latih tubi Kertas 2: fungsi kuadratik' });
  live.createdAt = nowMs - 2 * 86400000;
  // The admin has started marking the live class: six on time (a bintang skibidi each), two late.
  const att = {};
  ['HUSNA', 'IVY', 'AKIM', 'YASIN', 'DEA', 'KHAERA', 'ALEEYSHA', 'HAZARINNA'].forEach((name, i) => { att[name] = i < 6 ? 'hadir' : 'lewat'; });
  live.attendance = att; live.attendanceBy = 'SAFWAN'; live.attendanceAt = nowMs - 60000;
  bookings.push(live);

  // Earlier today, if the day had room for it.
  if (liveFrom >= 14 * 60 + 30 && JS_DAYS[now.getDay()] !== 'Sunday') {
    const e = base({ subject: 'English', teacher: 'Teacher Hasyimah', date: todayISO, from: minutesToTime(liveFrom - 105), to: minutesToTime(liveFrom - 45), notes: 'Directed writing' });
    if (!(SCHOOL_HOURS[JS_DAYS[now.getDay()]] && timesOverlap(e.from, e.to, SCHOOL_HOURS[JS_DAYS[now.getDay()]].from, SCHOOL_HOURS[JS_DAYS[now.getDay()]].to))) {
      markAttendance(e);
      bookings.push(e);
    }
  }

  /* ---------- the coming fortnight ---------- */
  const tplOn = (date) => templates.filter(t => t.day === JS_DAYS[new Date(date + 'T00:00:00').getDay()]);
  function place(dayOffset, subject, from, len, extra) {
    const d = addDays(now, dayOffset);
    const date = isoDate(d);
    const dayName = JS_DAYS[d.getDay()];
    const weekend = dayName === 'Saturday' || dayName === 'Sunday';
    let start = weekend && toMinutes(from) > 13 * 60 ? 9 * 60 + 30 : toMinutes(from);
    const sh = SCHOOL_HOURS[dayName];
    if (sh && start < toMinutes(sh.to)) start = toMinutes(sh.to) + 60;
    for (let tries = 0; tries < 16; tries++) {
      const f = minutesToTime(start), t = minutesToTime(start + len);
      const tplClash = tplOn(date).some(tp => timesOverlap(tp.from, tp.to, f, t));
      const pastNow = dayOffset === 0 && start < nowMin + 20;
      if (!tplClash && !pastNow && start + len <= 22 * 60 + 30 && free(date, subject, f, t)) {
        const b = base(Object.assign({ subject, date, from: f, to: t }, extra || {}));
        bookings.push(b);
        return b;
      }
      start += 30;
    }
    return null;
  }
  place(0, 'Fizik', minutesToTime(liveTo + 30), 75, { teacher: 'Cikgu Norhani', notes: 'Bab 2: daya dan gerakan', author: 'AKIM' });
  place(1, 'Bahasa Melayu', '14:00', 90, { notes: 'Persediaan Ujian Bertutur', author: 'HUSNA' });
  place(1, 'Kimia', '15:45', 75, { author: 'IVY' });
  place(2, 'English', '14:30', 60, { notes: 'Speaking practice: describing a picture', author: 'ALEEYSHA' });
  place(2, 'Matematik', '20:30', 90, { notes: 'Kelas malam', author: 'Cikgu Azurah' });
  place(3, 'Biologi', '14:30', 90, { notes: 'Amali: osmosis', author: 'DEA' });
  place(4, 'Sejarah', '15:00', 90, { author: 'YASIN' });
  place(5, 'Bahasa Melayu', '10:00', 60, { notes: 'Rakaman lisan', author: 'KHAERA' });
  place(7, 'Matematik', '14:00', 90, { author: 'SAFWAN' });
  place(8, 'Kimia', '15:30', 90, { notes: 'Amali: pentitratan', author: 'IVY' });
  place(9, 'English', '14:30', 60, { author: 'HAZARINNA' });
  place(10, 'Fizik', '16:00', 90, { notes: 'Amali: hukum Hooke', author: 'Cikgu Norhani' });
  place(11, 'Biologi', '14:30', 75, { author: 'DEA' });
  place(12, 'Sejarah', '09:30', 120, { notes: 'Esei Kertas 2', author: 'YASIN' });

  bookings.sort((a, b) => (a.date + a.from < b.date + b.from ? -1 : 1));
  bookings.forEach(b => { delete b.author; });

  /* ---------- people, activity, notifications ---------- */
  const users = {};
  STUDENT_NAMES.forEach((name, i) => {
    const online = ['HUSNA', 'IVY', 'AKIM', 'YASIN', 'DEA'].includes(name);
    const lastSeen = online ? nowMs - (20 + i * 17) * 1000 : nowMs - (2 + i * 5) * 3600000;
    users[name] = { name, type: 'Pelajar', lastSeen: ts(lastSeen), lastLoginAt: ts(lastSeen - 40 * 60000), firstLoginAt: ts(nowMs - (64 + i) * 86400000), loginCount: 18 + Math.floor(rand() * 40) };
  });
  TEACHERS_WHO_LOG_IN.forEach((name, i) => {
    const online = name === 'Cikgu Azurah';
    const lastSeen = online ? nowMs - 50 * 1000 : nowMs - (5 + i * 9) * 3600000;
    users[name] = { name, type: 'Cikgu', lastSeen: ts(lastSeen), lastLoginAt: ts(lastSeen - 30 * 60000), firstLoginAt: ts(nowMs - (60 - i) * 86400000), loginCount: 6 + Math.floor(rand() * 20) };
  });

  const activity = {};
  let actSeq = 0;
  function act(minsAgo, userName, userType, action, description, targetId) {
    const t = nowMs - minsAgo * 60000;
    activity['a' + String(++actSeq).padStart(3, '0')] = { userName, userType, action, targetType: targetId ? 'booking' : null, targetId: targetId || null, description, clientTime: t, timestamp: ts(t) };
  }
  const upcoming = bookings.filter(b => b.date > todayISO || (b.date === todayISO && b.from > live.from));
  const fmt = iso => iso.split('-').reverse().join('/');
  act(1, 'HUSNA', 'Pelajar', 'LOGIN', 'HUSNA log masuk sebagai Pelajar');
  act(3, 'AKIM', 'Pelajar', 'LOGIN', 'AKIM log masuk sebagai Pelajar');
  act(6, 'Cikgu Azurah', 'Cikgu', 'LOGIN', 'CIKGU AZURAH log masuk sebagai Cikgu');
  act(9, 'IVY', 'Pelajar', 'LOGIN', 'IVY log masuk sebagai Pelajar');
  upcoming.slice(0, 6).forEach((b, i) => {
    act(40 + i * 95, b.createdBy || 'SAFWAN', b.createdByType || 'Pelajar', 'CREATE_BOOKING',
      (b.createdBy || 'SAFWAN').toUpperCase() + ' menempah ' + b.subject + ' dengan ' + b.teacher + ' pada ' + fmt(b.date), b.id);
  });
  act(180, 'SAFWAN', 'Pelajar', 'UPDATE_BOOKING', 'SAFWAN menanda kehadiran Kimia');
  act(260, 'YASIN', 'Pelajar', 'UPDATE_BOOKING', 'YASIN memulakan extend untuk Fizik');
  act(320, 'SAFWAN', 'Pelajar', 'UPDATE_TEACHER', 'SAFWAN menambah guru bengkel CIKGU BENGKEL A untuk Matematik');
  act(700, 'DEA', 'Pelajar', 'LOGOUT', 'DEA log keluar');
  act(1500, 'KHAERA', 'Pelajar', 'DELETE_BOOKING', 'KHAERA membatalkan Sejarah (Cikgu Loh)');

  const notifications = {};
  const n = (id, type, title, body, minsAgo, read) => { notifications[id] = { type, title, body, createdAt: nowMs - minsAgo * 60000, read }; };
  n('class-started-' + live.id, 'CLASS_STARTED', 'Matematik sedang berlangsung sekarang.', 'Cikgu Azurah, ' + live.from + '–' + live.to, Math.max(1, nowMin - liveFrom), false);
  if (upcoming[1]) n('booking-created-' + upcoming[1].id, 'BOOKING_CREATED', (upcoming[1].createdBy || 'HUSNA') + ' membuat tempahan ' + upcoming[1].subject + '.', fmt(upcoming[1].date) + ' • ' + upcoming[1].from + '–' + upcoming[1].to, 95, false);
  if (upcoming[2]) n('booking-created-' + upcoming[2].id, 'BOOKING_CREATED', (upcoming[2].createdBy || 'IVY') + ' membuat tempahan ' + upcoming[2].subject + '.', fmt(upcoming[2].date) + ' • ' + upcoming[2].from + '–' + upcoming[2].to, 190, false);
  n('extension-stopped-demo', 'EXTENSION_STOPPED', 'Extension Fizik telah dihentikan oleh Cikgu Norhani.', 'Extend sehingga 16:30', 1440, true);
  n('booking-cancelled-demo', 'BOOKING_CANCELLED', 'Tempahan Sejarah telah dibatalkan oleh KHAERA.', 'Dibatalkan kerana pertembungan dengan latihan rumah sukan', 1500, true);

  const config = {
    subjectTeachers: Object.assign({}, DEFAULT_SUBJECT_TEACHERS),
    workshopTeachers: { 'Matematik': ['CIKGU BENGKEL A'], 'Fizik': ['CIKGU ZAKI'] },
    teacherGenders: { 'Cikgu Azurah': 'F', 'Cikgu Norhani': 'F', 'Cikgu Tiong': 'M', 'Teacher Hasyimah': 'F', 'Ustazah Syarfanezha': 'F', 'Madam Patricia': 'F', 'Miss Dayang': 'F', 'Cikgu Dylan': 'M' },
    recurringTemplates: templates
  };

  return {
    docs: {
      'jadualKelas/bookings': { data: bookings, updatedAt: ts(nowMs) },
      'jadualKelas/config': config
    },
    cols: {
      'jadualKelas/meta/users': users,
      'jadualKelas/meta/activity': activity,
      'jadualKelas/meta/notifications': notifications,
      // One-time production data fixes in the original app are marked done, so they never touch demo data.
      'jadualKelas/meta/flags': { 'seed-2026-09-21-history-v3': { seededAt: nowMs }, 'cleanup-2026-09-21': { cleanedAt: nowMs } }
    },
    seededAt: nowMs,
    source: 'demo',
    weekOrder: WEEK_ORDER.length
  };
}

/* Business rules of 5 Sigma, as pure functions over plain data.
   Every rule here is carried over from the original app (statuses, clashes,
   school hours, rosters, attendance maths, recurring classes), plus the new
   measures the analytics use (streaks, at-risk students, coverage). */

import { isoDate } from './util.js';
import { parseISO } from './util.js';
import { addDays } from './util.js';
import { startOfWeek } from './util.js';
import { startOfMonth } from './util.js';
import { toMinutes } from './util.js';
import { minutesToTime } from './util.js';
import { timesOverlap } from './util.js';
import { at } from './util.js';
import { pad2 } from './util.js';
import { JS_DAYS } from './data.js';
import { WEEK_ORDER } from './data.js';
import { SCHOOL_HOURS } from './data.js';
import { ANALYSIS_END } from './data.js';
import { EXEMPT_PAIRS } from './data.js';
import { SUBJECT_ROSTERS } from './data.js';
import { STUDENT_NAMES } from './data.js';
import { STATUS_LABELS } from './data.js';
import { DEFAULT_SUBJECT_TEACHERS } from './data.js';

/* ---------- status ---------- */
export function computeStatus(b, now) {
  if (b.cancelledAt) return 'cancelled';
  const start = at(b.date, b.from), end = at(b.date, b.to);
  if (now < start) return 'upcoming';
  // An open-ended extension keeps the class running past its planned end until
  // someone stops it (the original stopped showing it at the planned end).
  if (b.extensionActive) return now < at(b.date, '23:59') ? 'extending' : 'ended';
  if (now >= end) return 'ended';
  return 'ongoing';
}
export function statusLabel(key) { return STATUS_LABELS[key] || key; }
export function isLive(b, now) { const s = computeStatus(b, now); return s === 'ongoing' || s === 'extending'; }

export function dayNameOf(iso) { return JS_DAYS[parseISO(iso).getDay()]; }

export function active(bookings) { return bookings.filter(b => !b.cancelledAt); }
export function sortByTime(list) {
  return list.slice().sort((a, b) => {
    const x = a.date + 'T' + a.from, y = b.date + 'T' + b.from;
    return x < y ? -1 : (x > y ? 1 : 0);
  });
}
export function liveClasses(bookings, now) { return sortByTime(active(bookings)).filter(b => isLive(b, now)); }
export function upcomingClasses(bookings, now) { return sortByTime(active(bookings)).filter(b => computeStatus(b, now) === 'upcoming'); }
export function classesOn(bookings, iso) { return sortByTime(active(bookings)).filter(b => b.date === iso); }
export function minutesUntil(b, now, edge) { return Math.round((at(b.date, edge === 'end' ? b.to : b.from) - now) / 60000); }

/* ---------- clashes ---------- */
export function isExemptClash(a, b) {
  if (a === b) return false;
  return EXEMPT_PAIRS.some(p => p.indexOf(a) !== -1 && p.indexOf(b) !== -1);
}
// The whole class attends every class, so any overlap on the same day is a clash
// (except the Islam/Moral pair, which split the class).
export function findClashes(bookings, subject, date, from, to, excludeId) {
  return bookings.filter(b => {
    if (excludeId && b.id === excludeId) return false;
    if (b.cancelledAt) return false;
    return b.date === date && timesOverlap(b.from, b.to, from, to) && !isExemptClash(b.subject, subject);
  });
}

/* ---------- school hours ---------- */
export function schoolHoursFor(dayName) { return SCHOOL_HOURS[dayName] || null; }
export function isSchoolHours(dayName, from, to) {
  const sh = SCHOOL_HOURS[dayName];
  return !!sh && timesOverlap(from, to, sh.from, sh.to);
}
export function analysisStart(dayName) {
  const sh = SCHOOL_HOURS[dayName];
  return sh ? toMinutes(sh.to) : 7 * 60;
}
// The original dashboard insight: first free hour on a day, school block excluded.
export function firstFreeSlot(dayName, dayBookings, lenMin) {
  const len = lenMin || 60, step = 30;
  const end = toMinutes(ANALYSIS_END);
  for (let m = analysisStart(dayName); m + len <= end; m += step) {
    const a = minutesToTime(m), b = minutesToTime(m + len);
    if (isSchoolHours(dayName, a, b)) continue;
    if (!dayBookings.some(x => timesOverlap(a, b, x.from, x.to))) return { from: a, to: b };
  }
  return null;
}

/* ---------- rosters ---------- */
export function rosterFor(subject) {
  const r = SUBJECT_ROSTERS[subject];
  return (r && r.length) ? r.slice() : STUDENT_NAMES.slice();
}
// Roster plus anyone already marked, so an old record stays visible and clearable.
export function rosterForBooking(b) {
  const names = rosterFor(b.subject);
  Object.keys(b.attendance || {}).forEach(n => { if (names.indexOf(n) === -1) names.push(n); });
  return names;
}

/* ---------- attendance ---------- */
export function isMarked(b) { return !!(b.attendance && Object.keys(b.attendance).length); }
export function markedClasses(bookings) { return bookings.filter(b => !b.cancelledAt && isMarked(b)); }
export function emptyTally() { return { hadir: 0, lewat: 0, dikecualikan: 0, tidak: 0 }; }
// Late still counts as attended; excused is left out of the denominator.
export function rateFrom(c) {
  const counted = c.hadir + c.lewat + c.tidak;
  return counted ? Math.round(((c.hadir + c.lewat) / counted) * 100) : null;
}
export function attendanceFor(bookings, name) {
  const c = emptyTally(); let total = 0;
  markedClasses(bookings).forEach(b => {
    const v = b.attendance[name];
    if (!v || !(v in c)) return;
    c[v]++; total++;
  });
  return { counts: c, total, rate: rateFrom(c) };
}
export function attendanceOverall(bookings) {
  const c = emptyTally(), perStudent = {}, perSubject = {};
  STUDENT_NAMES.forEach(n => { perStudent[n] = emptyTally(); });
  const marked = markedClasses(bookings);
  marked.forEach(b => {
    const sc = perSubject[b.subject] || (perSubject[b.subject] = emptyTally());
    Object.keys(b.attendance).forEach(n => {
      const v = b.attendance[n];
      if (!(v in c)) return;
      c[v]++; sc[v]++;
      if (!perStudent[n]) perStudent[n] = emptyTally();
      perStudent[n][v]++;
    });
  });
  return { counts: c, rate: rateFrom(c), perStudent, perSubject, classes: marked.length };
}
/* Bintang skibidi: one star for each class attended on time ('hadir').
   Late ('lewat'), excused and absent earn no star. Attendance is marked by
   the admin; there is no self check-in. */
export function starsFrom(counts) { return counts ? (counts.hadir || 0) : 0; }
export function starCount(bookings, name) { return starsFrom(attendanceFor(bookings, name).counts); }
export function onTimeNames(b) { return b && b.attendance ? Object.keys(b.attendance).filter(x => b.attendance[x] === 'hadir') : []; }
// Consecutive classes attended on time, most recent first. Excused is skipped; late or absent ends the run.
export function streakFor(bookings, name, now) {
  const past = sortByTime(markedClasses(bookings)).filter(b => at(b.date, b.from) <= now && b.attendance[name]).reverse();
  let n = 0;
  for (const b of past) {
    const v = b.attendance[name];
    if (v === 'dikecualikan') continue;
    if (v === 'hadir') n++; else break;
  }
  return n;
}
export function atRiskStudents(bookings, threshold) {
  const all = attendanceOverall(bookings), out = [];
  STUDENT_NAMES.forEach(n => {
    const r = rateFrom(all.perStudent[n] || emptyTally());
    if (r !== null && r < (threshold || 75)) out.push({ name: n, rate: r, counts: all.perStudent[n] });
  });
  return out.sort((a, b) => a.rate - b.rate);
}

/* ---------- teachers ----------
   Names are typed by hand, so "CIKGU AZURAH" and "Cikgu Azurah" are the same
   teacher: names are compared without case or extra spaces, and shown with the
   spelling set in Tetapan (or the first spelling seen). */
export function teacherKey(name) { return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
export function sameTeacher(a, b) { return teacherKey(a) === teacherKey(b); }
export function canonicalTeacher(config, name) {
  const k = teacherKey(name);
  const known = staffTeachers(config).find(t => teacherKey(t) === k);
  return known || name;
}
export function registeredTeachers(config) {
  const set = {};
  Object.keys(config.subjectTeachers || {}).forEach(s => { const n = config.subjectTeachers[s]; if (n && n !== '—') set[n] = true; });
  return Object.keys(set).sort();
}
export function staffTeachers(config) {
  const set = {};
  registeredTeachers(config).forEach(n => { set[n] = true; });
  Object.keys(config.workshopTeachers || {}).forEach(s => (config.workshopTeachers[s] || []).forEach(n => { if (n && n !== '—') set[n] = true; }));
  return Object.keys(set).sort();
}
export function allKnownTeachers(config, bookings) {
  const byKey = {};
  staffTeachers(config).forEach(n => { byKey[teacherKey(n)] = n; });
  bookings.forEach(b => { const k = teacherKey(b.teacher); if (k && !byKey[k]) byKey[k] = b.teacher; });
  return Object.values(byKey).sort((a, b) => a.localeCompare(b));
}
export function subjectsOfTeacher(config, teacher) {
  return Object.keys(config.subjectTeachers || {}).filter(s => sameTeacher(config.subjectTeachers[s], teacher));
}
export function mostCommonSubjectFor(bookings, config, teacher) {
  const counts = {};
  bookings.forEach(b => { if (sameTeacher(b.teacher, teacher)) counts[b.subject] = (counts[b.subject] || 0) + 1; });
  let best = null, bestN = 0;
  Object.keys(counts).forEach(s => { if (counts[s] > bestN) { bestN = counts[s]; best = s; } });
  return best || subjectsOfTeacher(config, teacher)[0] || null;
}
export function defaultTeacherFor(config, subject) {
  return (config.subjectTeachers && config.subjectTeachers[subject]) || DEFAULT_SUBJECT_TEACHERS[subject] || '';
}

/* ---------- statistics ---------- */
export function computeStats(bookings, now, config) {
  const todayISO = isoDate(now);
  const weekStart = isoDate(startOfWeek(now));
  const monthStart = isoDate(startOfMonth(now));
  const s = { total: 0, today: 0, thisWeek: 0, thisMonth: 0, bySubject: {}, byDay: {}, byHour: {}, byTeacher: {},
    completed: 0, cancelled: 0, ongoing: 0, upcoming: 0, extensions: 0, minutesBySubject: {} };
  WEEK_ORDER.forEach(d => { s.byDay[d] = 0; });
  bookings.forEach(b => {
    const st = computeStatus(b, now);
    if (st === 'cancelled') { s.cancelled++; return; }
    s.total++;
    if (st === 'ended') s.completed++;
    else if (st === 'ongoing' || st === 'extending') s.ongoing++;
    else if (st === 'upcoming') s.upcoming++;
    s.extensions += (b.extensionHistory ? b.extensionHistory.length : 0);
    if (b.date === todayISO) s.today++;
    if (b.date >= weekStart) s.thisWeek++;
    if (b.date >= monthStart) s.thisMonth++;
    s.bySubject[b.subject] = (s.bySubject[b.subject] || 0) + 1;
    s.minutesBySubject[b.subject] = (s.minutesBySubject[b.subject] || 0) + Math.max(0, toMinutes(b.to) - toMinutes(b.from));
    const d = dayNameOf(b.date);
    s.byDay[d] = (s.byDay[d] || 0) + 1;
    const hour = pad2(parseInt(b.from.split(':')[0], 10)) + ':00';
    s.byHour[hour] = (s.byHour[hour] || 0) + 1;
    const tn = config ? canonicalTeacher(config, b.teacher) : b.teacher;
    s.byTeacher[tn] = (s.byTeacher[tn] || 0) + 1;
  });
  return s;
}
export function dailySeries(bookings, n, now, filterFn) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const iso = isoDate(addDays(now, -i));
    out.push(bookings.filter(b => !b.cancelledAt && b.date === iso && (!filterFn || filterFn(b))).length);
  }
  return out;
}
export function percentChange(curr, prev) {
  if (!prev) return curr ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}
// Classes per day for a heatmap, keyed by ISO date.
export function countsByDate(bookings, fromISO, toISO) {
  const out = {};
  active(bookings).forEach(b => { if (b.date >= fromISO && b.date <= toISO) out[b.date] = (out[b.date] || 0) + 1; });
  return out;
}
export function busiestDay(bookings) {
  const byDay = {};
  active(bookings).forEach(b => { const d = dayNameOf(b.date); byDay[d] = (byDay[d] || 0) + 1; });
  let best = null, bestN = 0;
  WEEK_ORDER.forEach(d => { if ((byDay[d] || 0) > bestN) { bestN = byDay[d]; best = d; } });
  return best ? { day: best, count: bestN } : null;
}

/* ---------- recurring weekly classes (Jadual Tetap) ----------
   The current week is always materialised; on Sunday the next week unlocks too.
   Never back-fills days that have passed, and a cancelled instance still counts
   as present so it is not resurrected. */
export function recurringWanted(templates, now) {
  if (!templates || !templates.length) return [];
  const weekStarts = [startOfWeek(now)];
  if (now.getDay() === 0) weekStarts.push(startOfWeek(addDays(now, 1)));
  const todayISO = isoDate(now);
  const wanted = [];
  weekStarts.forEach(ws => templates.forEach(t => {
    const idx = WEEK_ORDER.indexOf(t.day);
    if (idx === -1) return;
    const date = isoDate(addDays(ws, idx));
    if (date < todayISO) return;
    wanted.push({ t, date });
  }));
  return wanted;
}
export function recurringMissing(base, wanted) {
  return wanted.filter(w => !base.some(b => b.templateId === w.t.id && b.date === w.date));
}

/* ---------- edits ---------- */
export function describeBookingDiff(oldB, fields) {
  const parts = [];
  const fmt = iso => iso.split('-').reverse().join('/');
  if (fields.teacher && fields.teacher !== oldB.teacher) parts.push('guru: ' + oldB.teacher + ' → ' + fields.teacher);
  if ((fields.date && fields.date !== oldB.date) || (fields.from && fields.from !== oldB.from) || (fields.to && fields.to !== oldB.to)) {
    parts.push('masa: ' + fmt(oldB.date) + ' ' + oldB.from + '–' + oldB.to + ' → ' + fmt(fields.date || oldB.date) + ' ' + (fields.from || oldB.from) + '–' + (fields.to || oldB.to));
  }
  return parts.length ? parts.join('; ') : 'butiran dikemaskini';
}

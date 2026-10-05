/* Pencari Slot Pintar: ranks free times for an extra class.

   Hard rules (a slot is never offered): the normal school timetable, Friday
   prayers, any class it would clash with, times already past, after 22:30.
   Soft rules (the score): right after school is best, then before maghrib;
   maghrib is avoided and so is finishing after 9.30 pm;
   a quiet day beats a busy one; a short break between classes beats
   back-to-back; the same subject twice in a day is avoided; the subject's
   teacher usually teaching that weekday helps; and a subject with an SPM
   speaking/practical test coming up gets a nudge before that date. */

import { isoDate } from '../core/util.js';
import { parseISO } from '../core/util.js';
import { toMinutes } from '../core/util.js';
import { minutesToTime } from '../core/util.js';
import { timesOverlap } from '../core/util.js';
import { JS_DAYS } from '../core/data.js';
import { SCHOOL_HOURS } from '../core/data.js';
import { FRIDAY_PRAYER } from '../core/data.js';
import { SPM } from '../core/data.js';
import { findClashes } from '../core/domain.js';
import { sameTeacher } from '../core/domain.js';

const LATEST = 22 * 60 + 30;

export function findSlots(bookings, opts) {
  const { dates, subject, now } = opts;
  const len = opts.length || 60;
  const max = opts.max || 3;
  const teacher = opts.teacher || null;
  const nowISO = isoDate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const habitDays = {};
  if (teacher || subject) {
    bookings.forEach(b => {
      if (b.cancelledAt) return;
      if ((teacher && sameTeacher(b.teacher, teacher)) || (!teacher && b.subject === subject)) {
        const d = JS_DAYS[parseISO(b.date).getDay()];
        habitDays[d] = (habitDays[d] || 0) + 1;
      }
    });
  }
  const all = [];
  dates.forEach(iso => {
    if (iso < nowISO) return;
    const d = parseISO(iso);
    const dayName = JS_DAYS[d.getDay()];
    const sh = SCHOOL_HOURS[dayName];
    let start = sh ? toMinutes(sh.to) : 8 * 60;
    if (iso === nowISO) start = Math.max(start, Math.ceil((nowMin + 20) / 15) * 15);
    const dayList = bookings.filter(b => !b.cancelledAt && b.date === iso);
    for (let m = start; m + len <= LATEST; m += 15) {
      const from = minutesToTime(m), to = minutesToTime(m + len);
      if (sh && timesOverlap(from, to, sh.from, sh.to)) continue;
      if (dayName === 'Friday' && timesOverlap(from, to, FRIDAY_PRAYER.from, FRIDAY_PRAYER.to)) continue;
      if (findClashes(bookings, subject || '', iso, from, to, null).length) continue;
      let score = 100;
      const why = [];
      if (m >= 14 * 60 && m + len <= 17 * 60 + 30) { score += 22; why.push(sh ? 'selepas sekolah' : 'petang hujung minggu'); }
      else if (m >= 17 * 60 && m + len <= 18 * 60 + 45) { score += 8; why.push('sebelum maghrib'); }
      if (timesOverlap(from, to, '18:45', '20:00')) score -= 35;
      if (m >= 20 * 60 && m + len <= 21 * 60 + 30) why.push('kelas malam');
      if (m + len > 21 * 60 + 30) score -= 15;
      if (!sh && m < 12 * 60 + 30) { score += 12; why.push('pagi hujung minggu'); }
      const gaps = dayList.map(b => Math.min(Math.abs(toMinutes(b.from) - (m + len)), Math.abs(m - toMinutes(b.to))));
      if (gaps.some(g => g < 15)) { score -= 12; why.push('sambung terus dengan kelas lain'); }
      else if (dayList.length) { score += 4; why.push('ada rehat antara kelas'); }
      if (!dayList.length) { score += 10; why.push('hari itu lapang'); }
      else if (dayList.length >= 2) score -= 10 * dayList.length;
      if (subject && dayList.some(b => b.subject === subject)) score -= 30;
      if (habitDays[dayName] >= 2) { score += 8; why.push('hari biasa ' + (teacher || 'guru subjek ini') + ' mengajar'); }
      const ms = subject && SPM.milestones.find(x => x.subjects.includes(subject) && iso < x.from);
      if (ms) { score += 6; why.push('sebelum ' + ms.short); }
      score -= Math.round((d - parseISO(nowISO)) / 86400000) * 2;
      all.push({ date: iso, from, to, score, why });
    }
  });
  all.sort((a, b) => b.score - a.score || (a.date + a.from < b.date + b.from ? -1 : 1));
  const picked = [];
  for (const s of all) {
    if (picked.some(p => p.date === s.date && Math.abs(toMinutes(p.from) - toMinutes(s.from)) < 90)) continue;
    if (picked.filter(p => p.date === s.date).length >= 2) continue;
    picked.push(s);
    if (picked.length >= max) break;
  }
  return picked;
}

// Free/busy for a whole day, for the slot heat strip: 30-minute cells from 13:00 to 22:30.
export function dayHeat(bookings, iso, subject, len) {
  const d = parseISO(iso);
  const dayName = JS_DAYS[d.getDay()];
  const sh = SCHOOL_HOURS[dayName];
  const cells = [];
  for (let m = 7 * 60; m < LATEST; m += 30) {
    const from = minutesToTime(m), to = minutesToTime(m + 30);
    let kind = 'free';
    if (sh && timesOverlap(from, to, sh.from, sh.to)) kind = 'school';
    else if (dayName === 'Friday' && timesOverlap(from, to, FRIDAY_PRAYER.from, FRIDAY_PRAYER.to)) kind = 'prayer';
    else if (findClashes(bookings, subject || '', iso, from, to, null).length) kind = 'busy';
    cells.push({ from, to, kind });
  }
  return cells;
}

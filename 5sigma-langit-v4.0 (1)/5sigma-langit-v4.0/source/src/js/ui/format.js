/* Malay wording for dates, times and durations, in one place. */

import { isoDate } from '../core/util.js';
import { addDays } from '../core/util.js';
import { parseISO } from '../core/util.js';
import { titleCaseName } from '../core/util.js';
import { MONTHS_MY } from '../core/data.js';

const DAYS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

export function dayShort(iso) { return DAYS[parseISO(iso).getDay()].slice(0, 3); }
export function dayName(iso) { return DAYS[parseISO(iso).getDay()]; }
export function dateShort(iso) { const d = parseISO(iso); return d.getDate() + ' ' + MONTHS_MY[d.getMonth()].slice(0, 3); }
export function dateLong(iso) { const d = parseISO(iso); return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS_MY[d.getMonth()] + ' ' + d.getFullYear(); }
// "26–29 Okt", "23 Nov – 17 Dis": a date range, the month written once when it is shared.
export function rangeShort(a, b) {
  if (!b || a === b) return dateShort(a);
  const x = parseISO(a), y = parseISO(b);
  return x.getMonth() === y.getMonth() ? x.getDate() + '–' + dateShort(b) : dateShort(a) + ' – ' + dateShort(b);
}
// "Selasa, 17 November": the long date without the year.
export function dateDayMonth(iso) { const d = parseISO(iso); return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS_MY[d.getMonth()]; }
// "Isn, 5 Okt 2026": the long date when space is short.
export function dateMedium(iso) { const d = parseISO(iso); return DAYS[d.getDay()].slice(0, 3) + ', ' + d.getDate() + ' ' + MONTHS_MY[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear(); }
export function dateNumeric(iso) { return String(iso).split('-').reverse().join('/'); }
// "Hari ini", "Esok", "Semalam", else "Rabu, 7 Okt"
export function dayLabel(iso, now) {
  if (iso === isoDate(now)) return 'Hari ini';
  if (iso === isoDate(addDays(now, 1))) return 'Esok';
  if (iso === isoDate(addDays(now, -1))) return 'Semalam';
  return dayName(iso) + ', ' + dateShort(iso);
}
// For use inside a sentence: "esok", "hari ini", but "Rabu, 7 Okt" keeps its capitals.
export function dayPhrase(iso, now) {
  const l = dayLabel(iso, now);
  return (l === 'Hari ini' || l === 'Esok' || l === 'Semalam') ? l.toLowerCase() : l;
}
export function timeRange(from, to) { return from + '–' + to; }
export function minutesText(m) {
  m = Math.max(0, Math.round(m));
  if (m < 1) return 'kurang seminit';
  if (m < 60) return m + ' minit';
  const h = Math.floor(m / 60), r = m % 60;
  return h + ' jam' + (r ? ' ' + r + ' minit' : '');
}
export function durationText(from, to) {
  const [a, b] = [from, to].map(t => { const p = t.split(':'); return +p[0] * 60 + +p[1]; });
  return minutesText(b - a);
}
export function timeAgo(ms, nowMs) {
  const diff = Math.floor(((nowMs || Date.now()) - ms) / 60000);
  if (diff < 1) return 'baru sahaja';
  if (diff < 60) return diff + ' minit lalu';
  const h = Math.floor(diff / 60);
  if (h < 24) return h + ' jam lalu';
  const d = Math.floor(h / 24);
  return d === 1 ? 'semalam' : d + ' hari lalu';
}
export function startsIn(mins) {
  if (mins <= 0) return 'bermula sekarang';
  if (mins < 60) return 'dalam ' + mins + ' minit';
  if (mins < 24 * 60) return 'dalam ' + minutesText(mins);
  const d = Math.round(mins / 1440);
  return 'dalam ' + d + ' hari';
}
export function greeting(h) {
  if (h < 12) return 'Selamat pagi';
  if (h < 15) return 'Selamat tengah hari';
  if (h < 19) return 'Selamat petang';
  return 'Selamat malam';
}
export function personName(name) { return titleCaseName(name); }
export function firstName(name) { return titleCaseName(String(name).replace(/^(Cikgu|Teacher|Madam|Miss|Ustazah|Ustaz|Puan|Encik)\s+/i, '').split(' ')[0]); }

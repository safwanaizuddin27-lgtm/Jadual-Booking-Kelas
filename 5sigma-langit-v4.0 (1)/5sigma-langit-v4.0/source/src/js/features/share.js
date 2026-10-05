/* Getting classes out of the app: Google Calendar links, .ics files, a WhatsApp
   message for the class group, and CSV for teachers. */

import { at } from '../core/util.js';
import { pad2 } from '../core/util.js';
import { dayLabel } from '../ui/format.js';
import { dateLong } from '../ui/format.js';

function stamp(d) {
  return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + 'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + '00Z';
}

export function googleCalendarUrl(b) {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: b.subject + ' (kelas tambahan 5 Sigma)',
    dates: stamp(at(b.date, b.from)) + '/' + stamp(at(b.date, b.to)),
    details: 'Guru: ' + b.teacher + (b.notes ? '\n' + b.notes : '') + '\nDari 5 Sigma Class Hub'
  });
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}

function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m); }
export function icsFor(list) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//5 Sigma Class Hub//Langit 5 Sigma//MS', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Kelas tambahan 5 Sigma'];
  const now = stamp(new Date());
  list.forEach(b => {
    lines.push('BEGIN:VEVENT', 'UID:' + b.id + '@5sigma', 'DTSTAMP:' + now,
      'DTSTART:' + stamp(at(b.date, b.from)), 'DTEND:' + stamp(at(b.date, b.to)),
      'SUMMARY:' + icsEscape(b.subject + ' (kelas tambahan)'),
      'DESCRIPTION:' + icsEscape('Guru: ' + b.teacher + (b.notes ? '\n' + b.notes : '')),
      'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(b.subject + ' bermula 15 minit lagi'), 'END:VALARM',
      'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function whatsappText(list, title, now) {
  const byDay = {};
  list.forEach(b => { (byDay[b.date] = byDay[b.date] || []).push(b); });
  const out = ['*' + title + '*', ''];
  Object.keys(byDay).sort().forEach(d => {
    out.push('*' + dayLabel(d, now) + '*' + (dayLabel(d, now).indexOf(',') === -1 ? ' (' + dateLong(d).split(', ')[1] + ')' : ''));
    byDay[d].sort((a, b) => a.from.localeCompare(b.from)).forEach(b => out.push('• ' + b.from + '–' + b.to + '  ' + b.subject + ' (' + b.teacher + ')' + (b.notes ? '\n   _' + b.notes + '_' : '')));
    out.push('');
  });
  out.push('Dikongsi dari 5 Sigma Class Hub');
  return out.join('\n');
}
export function whatsappUrl(text) { return 'https://wa.me/?text=' + encodeURIComponent(text); }

export function csv(rows) {
  return rows.map(r => r.map(v => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
}

// SPM papers for a calendar: timed papers as events, oral/practical days as all-day events.
export function icsForPapers(list) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//5 Sigma Class Hub//Jadual SPM 2026//MS', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:SPM 2026 5 Sigma'];
  const now = stamp(new Date());
  const day = iso => iso.replace(/-/g, '');
  const nextDay = iso => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + 1); return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()); };
  list.forEach(p => {
    lines.push('BEGIN:VEVENT', 'UID:spm2026-' + p.code.replace(/[^0-9a-z]/gi, '') + '@5sigma', 'DTSTAMP:' + now);
    if (p.from) lines.push('DTSTART:' + stamp(at(p.date, p.from)), 'DTEND:' + stamp(at(p.date, p.to)));
    else lines.push('DTSTART;VALUE=DATE:' + day(p.date), 'DTEND;VALUE=DATE:' + nextDay(p.dateTo));
    lines.push('SUMMARY:' + icsEscape('SPM ' + p.name + ', ' + p.paper + ' (' + p.code + ')'),
      'DESCRIPTION:' + icsEscape(p.from ? 'Hadir 20 minit sebelum kertas bermula. Bawa kad pengenalan dan kenyataan kemasukan.' : 'Masa ditetapkan oleh sekolah.'));
    if (p.from) lines.push('BEGIN:VALARM', 'TRIGGER:-PT12H', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape('Esok: SPM ' + p.name + ' ' + p.from), 'END:VALARM');
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

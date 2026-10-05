/* Tanya Sigma's understanding of everyday Malay (with the English the class mixes in).
   Intents: greet, thanks, help, theme, navigate, spm, cancel, checkin, book, free,
   attendance, teacher, now, next, count, list.
   Pure functions: text in, {intent, subject, date(s), time range, duration} out.
   Runs on the device, offline, in a few milliseconds. */

import { isoDate } from '../core/util.js';
import { addDays } from '../core/util.js';
import { startOfWeek } from '../core/util.js';
import { minutesToTime } from '../core/util.js';
import { pad2 } from '../core/util.js';
import { SUBJECTS } from '../core/data.js';

const SLANG = [
  [/\bharini\b|\bhr ni\b|\bhr ini\b|\bhari ni\b/g, 'hari ini'], [/\bbesok\b|\besk\b|\btmrw\b|\btomorrow\b/g, 'esok'],
  [/\btoday\b/g, 'hari ini'], [/\byesterday\b|\bkelmarin\b/g, 'semalam'], [/\bptg\b/g, 'petang'], [/\bmlm\b/g, 'malam'],
  [/\bpg\b/g, 'pagi'], [/\btgh hari\b|\btghari\b|\btengahari\b/g, 'tengah hari'], [/\bnk\b/g, 'nak'], [/\bx\b|\btk\b/g, 'tak'],
  [/\bbrp\b|\bbpe\b|\bberape\b/g, 'berapa'], [/\bsape\b|\bsiape\b/g, 'siapa'], [/\bcg\b|\bcikgu\b|\bteacher\b/g, 'cikgu'],
  [/\bmgu\b|\bminggu ni\b/g, 'minggu ini'], [/\bnext week\b/g, 'minggu depan'], [/\bthis week\b/g, 'minggu ini'],
  [/\bkls\b/g, 'kelas'], [/\bjdl\b/g, 'jadual'], [/\bsebelum ni\b/g, 'sebelum ini'], [/\bdgn\b/g, 'dengan'], [/\butk\b|\bunt\b/g, 'untuk']
];
const DAY_WORDS = { isnin: 1, monday: 1, selasa: 2, tuesday: 2, rabu: 3, wednesday: 3, khamis: 4, thursday: 4, jumaat: 5, jumat: 5, friday: 5, sabtu: 6, saturday: 6, ahad: 0, sunday: 0 };
const MONTH_WORDS = { jan: 0, januari: 0, january: 0, feb: 1, februari: 1, february: 1, mac: 2, march: 2, mar: 2, apr: 3, april: 3, mei: 4, may: 4, jun: 5, june: 5, jul: 6, julai: 6, july: 6, ogos: 7, ogo: 7, aug: 7, august: 7, sep: 8, sept: 8, september: 8, okt: 9, oct: 9, oktober: 9, october: 9, nov: 10, november: 10, dis: 11, dec: 11, disember: 11, december: 11 };

export function normalizeText(raw) {
  let s = ' ' + String(raw || '').toLowerCase().replace(/[\u201C\u201D"'`\u2019?!,;()]/g, ' ').replace(/\s+/g, ' ') + ' ';
  SLANG.forEach(([re, to]) => { s = s.replace(re, to); });
  return s.replace(/\s+/g, ' ').trim();
}

/* ---------- subject ---------- */
const ALIASES = [];
SUBJECTS.forEach(sub => sub.aliases.forEach(a => ALIASES.push({ a, name: sub.name })));
ALIASES.sort((x, y) => y.a.length - x.a.length);
export function findSubject(text) {
  const t = ' ' + text + ' ';
  for (const { a, name } of ALIASES) {
    const i = t.indexOf(' ' + a + ' ');
    if (i !== -1) return { name, at: i, alias: a };
  }
  return null;
}

/* ---------- time ---------- */
function hourWithContext(h, m, mer, weekend) {
  if (mer === 'pagi' || mer === 'am') return { h: h === 12 ? 0 : h, m };
  if (mer === 'petang' || mer === 'pm' || mer === 'tengah hari') return { h: h < 12 ? h + 12 : h, m };
  if (mer === 'malam') return { h: h < 12 ? h + 12 : h, m };
  if (h >= 13) return { h, m };
  // No am/pm: extra classes run after school, so 1-6 is the afternoon;
  // 7-10 is the evening on weekdays and the morning at the weekend.
  if (h <= 6) return { h: h + 12, m };
  if (h <= 10) return { h: weekend ? h : h + 12, m };
  return { h, m };
}
const MER = '(pagi|petang|malam|tengah hari|am|pm)';
const T = '(\\d{1,2})(?:[:.](\\d{2}))?\\s*(setengah)?';
export function findTimes(text, weekend) {
  // A range: "2-4 petang", "2 hingga 4", "dari 2 ke 4pm", "14:00 - 15:30"
  const range = new RegExp('(?:dari |pukul |jam |pkl )?' + T + '\\s*' + MER + '?\\s*(?:-|–|hingga|sampai|smpai|ke|to|until)\\s*(?:pukul |jam )?' + T + '\\s*' + MER + '?');
  let m = text.match(range);
  if (m) {
    const mer2 = m[8] || m[4];
    const mer1 = m[4] || m[8];
    let a = hourWithContext(+m[1], m[2] ? +m[2] : (m[3] ? 30 : 0), mer1, weekend);
    let b = hourWithContext(+m[5], m[6] ? +m[6] : (m[7] ? 30 : 0), mer2, weekend);
    if (b.h * 60 + b.m <= a.h * 60 + a.m && b.h < 12) b.h += 12;
    if (b.h * 60 + b.m > a.h * 60 + a.m && a.h < 12 && b.h >= 12 && !mer1) a = { h: a.h + 12 > b.h ? a.h : a.h + 12, m: a.m };
    return { from: pad2(a.h) + ':' + pad2(a.m), to: pad2(b.h) + ':' + pad2(b.m) };
  }
  // A single start: "pukul 3", "3 petang", "15:30", "3pm", "pukul 3 setengah"
  const single = new RegExp('(?:pukul |jam |pkl |at )' + T + '\\s*' + MER + '?|' + T + '\\s*' + MER + '|\\b(\\d{1,2})[:.](\\d{2})\\b|\\b(\\d{3,4})\\b(?! (?:jam|minit|hari|min))');
  m = text.match(single);
  if (m) {
    let h, mm, mer;
    if (m[1] !== undefined) { h = +m[1]; mm = m[2] ? +m[2] : (m[3] ? 30 : 0); mer = m[4]; }
    else if (m[5] !== undefined) { h = +m[5]; mm = m[6] ? +m[6] : (m[7] ? 30 : 0); mer = m[8]; }
    else if (m[9] !== undefined) { h = +m[9]; mm = +m[10]; }
    else { const v = m[11]; h = +v.slice(0, v.length - 2); mm = +v.slice(-2); if (h > 23 || mm > 59) return null; }
    if (h > 23 || mm > 59) return null;
    const r = hourWithContext(h, mm, mer, weekend);
    return { from: pad2(r.h) + ':' + pad2(r.m) };
  }
  return null;
}
export function findDuration(text) {
  let m = text.match(/(\d+(?:[.,]5)?)\s*jam(?:\s*setengah)?/);
  if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 60 + (/jam\s*setengah/.test(m[0]) ? 30 : 0));
  if (/\bsejam setengah\b/.test(text)) return 90;
  if (/\bsejam\b/.test(text)) return 60;
  if (/\bsetengah jam\b/.test(text)) return 30;
  m = text.match(/(\d+)\s*(minit|min|mins|minutes)\b/);
  if (m) return +m[1];
  return null;
}

/* ---------- date ---------- */
export function findDates(text, now) {
  const today = new Date(now.getTime()); today.setHours(0, 0, 0, 0);
  const one = (d, label) => ({ dates: [isoDate(d)], label });
  if (/\bminggu depan\b/.test(text)) {
    const ws = startOfWeek(addDays(today, 7));
    return { dates: Array.from({ length: 7 }, (_, i) => isoDate(addDays(ws, i))), label: 'minggu depan' };
  }
  if (/\bminggu ini\b|\bminggu ni\b/.test(text)) {
    const ws = startOfWeek(today);
    const all = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter(d => d >= today);
    return { dates: all.map(isoDate), label: 'minggu ini' };
  }
  if (/\blusa\b/.test(text)) return one(addDays(today, 2), 'lusa');
  if (/\besok\b/.test(text)) return one(addDays(today, 1), 'esok');
  if (/\bsemalam\b/.test(text)) return one(addDays(today, -1), 'semalam');
  if (/\bhari ini\b|\bsekarang\b|\btadi\b/.test(text)) return one(today, 'hari ini');
  let m = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (m) {
    const y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : today.getFullYear();
    const d = new Date(y, +m[2] - 1, +m[1]);
    if (!m[3] && d < addDays(today, -30)) d.setFullYear(y + 1);
    if (!isNaN(d)) return one(d, null);
  }
  m = text.match(/\b(\d{1,2})\s+([a-z]+)\b/);
  if (m && MONTH_WORDS[m[2]] !== undefined) {
    const d = new Date(today.getFullYear(), MONTH_WORDS[m[2]], +m[1]);
    if (d < addDays(today, -30)) d.setFullYear(d.getFullYear() + 1);
    return one(d, null);
  }
  for (const word of Object.keys(DAY_WORDS)) {
    if (new RegExp('\\b' + word + '\\b').test(text)) {
      const target = DAY_WORDS[word];
      let diff = (target - today.getDay() + 7) % 7;
      if (new RegExp('\\b' + word + ' depan\\b').test(text)) {
        if (diff === 0) diff = 7;
        if (addDays(today, diff) < addDays(startOfWeek(today), 7)) diff += 7;
      }
      return one(addDays(today, diff), null);
    }
  }
  return null;
}

/* ---------- intent ---------- */
const VIEWS = { 'jadual spm': 'spm', 'jadual peperiksaan': 'spm', 'paparan kelas': 'paparan', paparan: 'paparan', statistik: 'statistik', stats: 'statistik', analitik: 'statistik', jadual: 'jadual', kalendar: 'jadual', tetapan: 'tetapan', settings: 'tetapan', guru: 'guru', subjek: 'subjek', pengguna: 'pengguna', rakan: 'pengguna', 'tempah slot': 'tempah', borang: 'tempah', 'edit kelas': 'kelas', 'jadual tetap': 'tetap', dashboard: 'utama', utama: 'utama', home: 'utama' };

export function parse(raw, now) {
  const text = normalizeText(raw);
  const weekendGuess = (() => { const d = findDates(text, now); if (!d) return false; const wd = new Date(d.dates[0] + 'T00:00:00').getDay(); return wd === 0 || wd === 6; })();
  const subject = findSubject(text);
  const dates = findDates(text, now);
  const times = findTimes(text, weekendGuess);
  const duration = findDuration(text);
  const r = { text, subject: subject ? subject.name : null, dates, times, duration, intent: 'unknown' };
  const has = re => re.test(text);

  if (!text) return r;
  if (has(/^(hai|hi|hello|helo|hey|yo|assalamualaikum|salam|selamat (pagi|petang|malam|tengah hari))\b/) && text.split(' ').length <= 4) r.intent = 'greet';
  else if (has(/terima kasih|\bthanks?\b|thank you|\btq\b|tenkiu|\bterima kasih\b/)) r.intent = 'thanks';
  else if (has(/tolong|bantuan|\bhelp\b|boleh buat apa|apa (awak|kau|kamu|sigma) boleh|cara guna|macam mana guna/)) r.intent = 'help';
  else if (has(/\btema\b|mod gelap|mode gelap|dark mode|light mode|mod cerah|mode cerah|tukar tema/)) r.intent = 'theme';
  else if (has(/^(buka|pergi|tunjuk|go to|open|bawa saya ke)\b/) && !dates && !subject && Object.keys(VIEWS).some(v => text.includes(v))) {
    r.intent = 'navigate'; r.view = VIEWS[Object.keys(VIEWS).sort((a, b) => b.length - a.length).find(v => text.includes(v))];
  }
  else if (has(/\bspm\b|peperiksaan|\bexam\b|ujian bertutur|\bbertutur\b|\bamali\b|\blisan\b|\bperiksa\b/)) r.intent = 'spm';
  else if (has(/\bbatal(kan)?\b|\bcancel\b|\bbuang kelas\b/) && (subject || dates)) r.intent = 'cancel';
  else if (has(/daftar masuk|check ?in|\bkod kelas\b|\bkod daftar\b/)) r.intent = 'checkin';
  else if (has(/\btempah\b|\bbook\b|booking|buat kelas|nak kelas|set kelas|jadualkan|tambah kelas|\breserve\b|\bbuatkan\b/) && (subject || times)) r.intent = 'book';
  else if (has(/\bslot\b|kosong|lapang|\bfree\b|masa terluang|bila boleh|available|cari masa|masa sesuai/)) r.intent = 'free';
  else if (has(/kehadiran|\bhadir\b|attendance|ponteng|bintang (skibidi|emas)|skibidi|\bstreak\b/)) r.intent = 'attendance';
  else if (has(/siapa|\bwho\b/) && (has(/cikgu|guru|ajar|mengajar/) || subject)) r.intent = 'teacher';
  else if (has(/sekarang|\bnow\b|tengah berlangsung|sedang berlangsung|tengah ada/) && !dates?.dates?.[1]) r.intent = 'now';
  else if (has(/seterusnya|\bnext\b|lepas ni|lepas ini|selepas ini|berikutnya|akan datang/) || (has(/\bbila\b/) && subject)) r.intent = 'next';
  else if (has(/berapa|jumlah|\bcount\b/) && has(/kelas|sesi|class/)) r.intent = 'count';
  else if (dates || has(/jadual|\bkelas\b|\bclass\b|schedule|ada apa/)) r.intent = 'list';
  else if (subject) r.intent = 'next';
  return r;
}

export function timeLabel(from, to) { return to ? from + '–' + to : from; }
export function addMinutesTo(hhmm, mins) { const [h, m] = hhmm.split(':').map(Number); return minutesToTime(h * 60 + m + mins); }

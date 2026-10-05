/* Small, dependency-free helpers shared by every module. Pure functions only. */

export function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
export function pad2(n) { return (n < 10 ? '0' : '') + n; }
export function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

/* ---------- dates (local time, ISO "YYYY-MM-DD" strings for days) ---------- */
export function isoDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
export function parseISO(iso) { return new Date(iso + 'T00:00:00'); }
export function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
export function addMinutes(d, n) { return new Date(d.getTime() + n * 60000); }
export function startOfDay(d) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
// Weeks start on Monday, as on a Malaysian school timetable.
export function startOfWeek(d) {
  const r = startOfDay(d);
  const js = r.getDay();
  r.setDate(r.getDate() + (js === 0 ? -6 : 1 - js));
  return r;
}
export function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
export function sameDate(a, b) { return isoDate(a) === isoDate(b); }
export function daysBetween(aIso, bIso) { return Math.round((parseISO(bIso) - parseISO(aIso)) / 86400000); }

/* ---------- times ("HH:MM" strings) ---------- */
export function toMinutes(t) { const p = String(t).split(':'); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); }
export function minutesToTime(m) { m = clamp(Math.round(m), 0, 24 * 60 - 1); return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); }
export function timesOverlap(aFrom, aTo, bFrom, bTo) { return toMinutes(aFrom) < toMinutes(bTo) && toMinutes(bFrom) < toMinutes(aTo); }
export function at(dateISO, hhmm) { const d = parseISO(dateISO); const m = toMinutes(hhmm); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d; }
export function nowHHMM(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
export function snap(m, step) { return Math.round(m / step) * step; }

/* ---------- ids, hashing, randomness ---------- */
export function genId(prefix) {
  const c = globalThis.crypto;
  const rnd = (c && c.randomUUID) ? c.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));
  return (prefix || '') + rnd;
}
// FNV-1a, 32-bit string hash.
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
// Seeded PRNG (mulberry32) so demo data is the same on every reset.
export function prng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- functions ---------- */
export function debounce(fn, ms) {
  let t = null;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}
export function rafThrottle(fn) {
  let queued = false, lastArgs = null;
  return function (...args) {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn.apply(this, lastArgs); });
  };
}

/* ---------- colour ---------- */
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mixHex(a, b, t) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return '#' + x.map((v, i) => pad2Hex(Math.round(v + (y[i] - v) * t))).join('');
}
function pad2Hex(n) { const s = clamp(n, 0, 255).toString(16); return s.length < 2 ? '0' + s : s; }

/* ---------- text ---------- */
export function titleCaseName(name) {
  // "SAFWAN" → "Safwan"; keeps honorifics readable ("CIKGU BENGKEL A" → "Cikgu Bengkel A").
  return String(name).toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
}
export function initials(name) {
  const cleaned = String(name).replace(/^(Cikgu|Teacher|Madam|Miss|Mrs|Mr|Ustazah|Ustaz|Puan|Encik|Dr)\s+/i, '').trim();
  return (cleaned || String(name)).charAt(0).toUpperCase();
}
export function normalize(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/*! 5 Sigma Class Hub · Langit 5Σ */
(() => {
'use strict';
const __m2 = (() => {
const TS = '__sandbox_ts', INC = '__sandbox_inc', DEL = '__sandbox_del';
function safeStorage() {
const memory = {};
let ls = null;
try { ls = window.localStorage; ls.setItem('__probe', '1'); ls.removeItem('__probe'); } catch (e) { ls = null; }
return {
persistent: !!ls,
get(k) { try { return ls ? ls.getItem(k) : (k in memory ? memory[k] : null); } catch (e) { return memory[k] ?? null; } },
set(k, v) { memory[k] = v; try { if (ls) ls.setItem(k, v); } catch (e) { /* quota or blocked: memory copy stays */ } },
remove(k) { delete memory[k]; try { if (ls) ls.removeItem(k); } catch (e) { /* ignore */ } }
};
}
function clone(o) { return JSON.parse(JSON.stringify(o === undefined ? null : o)); }
function genDocId() { return 'sbx' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function applyWrite(target, patch) {
Object.keys(patch).forEach(k => {
const v = patch[k];
if (v && typeof v === 'object' && v.__sentinel === TS) { target[k] = { __ts: Date.now() }; return; }
if (v && typeof v === 'object' && v.__sentinel === INC) { target[k] = (typeof target[k] === 'number' ? target[k] : 0) + v.by; return; }
if (v && typeof v === 'object' && v.__sentinel === DEL) { delete target[k]; return; }
target[k] = v;
});
return target;
}
function hydrate(v) {
if (v === null || typeof v !== 'object') return v;
if (Array.isArray(v)) return v.map(hydrate);
if (typeof v.__ts === 'number') { const ms = v.__ts; return { toDate: () => new Date(ms), toMillis: () => ms }; }
const out = {};
Object.keys(v).forEach(k => { out[k] = hydrate(v[k]); });
return out;
}
function prepare(data) {
return clone(data);
}
function createFirestore({ key, seed, firstLoadDelay = 0 }) {
const storage = safeStorage();
let db = load() || freshSeed();
let listeners = [];               // {path, fire}
let firstLoadPending = firstLoadDelay > 0;
const bootAt = Date.now();
function load() {
try { const raw = storage.get(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function freshSeed() {
const s = seed();
storage.set(key, JSON.stringify(s));
return s;
}
function notify(path) {
setTimeout(() => {
listeners.slice().forEach(l => {
if (path && l.path !== path) return;
try { l.fire(); } catch (e) { console.error('[sandbox]', e); }
});
}, 0);
}
function persist(path) {
storage.set(key, JSON.stringify(db));
notify(path);
}
function listen(path, fire) {
const entry = { path, fire };
listeners.push(entry);
const wait = firstLoadPending ? Math.max(0, firstLoadDelay - (Date.now() - bootAt)) : 0;
setTimeout(() => { if (listeners.includes(entry)) { try { fire(); } catch (e) { console.error('[sandbox]', e); } } }, wait);
return () => { listeners = listeners.filter(x => x !== entry); };
}
setTimeout(() => { firstLoadPending = false; }, firstLoadDelay + 50);
window.addEventListener('storage', e => {
if (e.key !== key || !e.newValue) return;
try { db = JSON.parse(e.newValue); notify(null); } catch (err) { /* ignore a torn write */ }
});
function docSnap(id, raw, ref) {
const exists = raw !== undefined && raw !== null;
const data = exists ? hydrate(clone(raw)) : null;
return { id, ref, exists, data: () => data, get: k => (data ? data[k] : undefined) };
}
function querySnap(entries, prevIds, colPath) {
const arr = entries.map(e => docSnap(e[0], e[1], subDocRef(colPath, e[0])));
return {
forEach: fn => arr.forEach(fn),
docs: arr, size: arr.length, empty: arr.length === 0,
docChanges: () => arr.filter(d => !prevIds || prevIds.indexOf(d.id) === -1).map(d => ({ type: 'added', doc: d }))
};
}
function docRef(path) {
const ref = {
id: path.split('/').pop(), path,
collection: sub => colRef(path + '/' + sub),
set(data, opts) {
const base = (opts && opts.merge && db.docs[path]) ? db.docs[path] : {};
db.docs[path] = applyWrite(clone(base), prepare(data));
persist(path); return Promise.resolve();
},
update(data) {
db.docs[path] = applyWrite(clone(db.docs[path] || {}), prepare(data));
persist(path); return Promise.resolve();
},
delete() { delete db.docs[path]; persist(path); return Promise.resolve(); },
get() { return Promise.resolve(docSnap(ref.id, db.docs[path], ref)); },
onSnapshot(cb, errCb) {
return listen(path, () => { try { cb(docSnap(ref.id, db.docs[path], ref)); } catch (e) { if (errCb) errCb(e); else throw e; } });
}
};
return ref;
}
function colRef(path, q) {
q = q || {};
if (!db.cols[path]) db.cols[path] = {};
function rows() {
const bag = db.cols[path] || {};
let list = Object.keys(bag).map(k => [k, bag[k]]);
if (q.orderBy) {
const f = q.orderBy, dir = q.dir === 'desc' ? -1 : 1;
const val = x => (x && typeof x === 'object' && typeof x.__ts === 'number') ? x.__ts : x;
list.sort((a, b) => {
const x = val(a[1] && a[1][f]), y = val(b[1] && b[1][f]);
if (x === y) return 0;
if (x === undefined || x === null) return 1;
if (y === undefined || y === null) return -1;
return (x < y ? -1 : 1) * dir;
});
}
if (q.limit) list = list.slice(0, q.limit);
return list;
}
return {
path,
doc: id => subDocRef(path, id || genDocId()),
add(data) {
const id = genDocId();
db.cols[path][id] = applyWrite({}, prepare(data));
persist(path);
return Promise.resolve({ id });
},
orderBy: (f, dir) => colRef(path, Object.assign({}, q, { orderBy: f, dir })),
limit: n => colRef(path, Object.assign({}, q, { limit: n })),
where: () => colRef(path, q),
get: () => Promise.resolve(querySnap(rows(), null, path)),
onSnapshot(cb, errCb) {
let seen = null;
return listen(path, () => {
try { const snap = querySnap(rows(), seen, path); seen = snap.docs.map(d => d.id); cb(snap); }
catch (e) { if (errCb) errCb(e); else throw e; }
});
}
};
}
function subDocRef(colPath, id) {
if (!db.cols[colPath]) db.cols[colPath] = {};
const ref = {
id, path: colPath + '/' + id,
set(data, opts) {
const bag = db.cols[colPath] || (db.cols[colPath] = {});
const base = (opts && opts.merge && bag[id]) ? bag[id] : {};
bag[id] = applyWrite(clone(base), prepare(data));
persist(colPath); return Promise.resolve();
},
update(data) {
const bag = db.cols[colPath] || (db.cols[colPath] = {});
bag[id] = applyWrite(clone(bag[id] || {}), prepare(data));
persist(colPath); return Promise.resolve();
},
delete() { if (db.cols[colPath]) delete db.cols[colPath][id]; persist(colPath); return Promise.resolve(); },
get() { return Promise.resolve(docSnap(id, (db.cols[colPath] || {})[id], ref)); },
onSnapshot(cb) { return listen(colPath, () => cb(docSnap(id, (db.cols[colPath] || {})[id], ref))); }
};
return ref;
}
function rootCollection(name) {
return {
doc: id => docRef(name + '/' + id),
add: data => { const id = genDocId(); return docRef(name + '/' + id).set(data).then(() => ({ id })); }
};
}
function batch() {
const ops = [];
return {
set(ref, data, opts) { ops.push(() => ref.set(data, opts)); return this; },
update(ref, data) { ops.push(() => ref.update(data)); return this; },
delete(ref) { ops.push(() => ref.delete()); return this; },
commit() { return Promise.all(ops.map(op => op())).then(() => undefined); }
};
}
function runTransaction(fn) {
return Promise.resolve(fn({
get: ref => ref.get(),
set: (ref, data, opts) => ref.set(data, opts),
update: (ref, data) => ref.update(data),
delete: ref => ref.delete()
}));
}
return {
collection: rootCollection,
batch,
runTransaction,
FieldValue: {
serverTimestamp: () => ({ __sentinel: TS }),
increment: n => ({ __sentinel: INC, by: n }),
delete: () => ({ __sentinel: DEL })
},
sandbox: {
persistent: storage.persistent,
reset() { db = seed(); persist(null); },
info() { return { source: db.source || 'import', takenAt: db.takenAt || null, seededAt: db.seededAt || null }; },
exportJSON() { return JSON.stringify(db, null, 2); },
importJSON(text) {
const parsed = JSON.parse(text);
if (!parsed || typeof parsed !== 'object' || !parsed.docs || !parsed.cols) throw new Error('Fail sandaran tidak sah.');
if (!parsed.source) parsed.source = 'import';
db = parsed; persist(null);
}
}
};
}
return { createFirestore };
})();
const __m4 = (() => {
function esc(str) {
return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function isoDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function parseISO(iso) { return new Date(iso + 'T00:00:00'); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function addMinutes(d, n) { return new Date(d.getTime() + n * 60000); }
function startOfDay(d) { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function startOfWeek(d) {
const r = startOfDay(d);
const js = r.getDay();
r.setDate(r.getDate() + (js === 0 ? -6 : 1 - js));
return r;
}
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function sameDate(a, b) { return isoDate(a) === isoDate(b); }
function daysBetween(aIso, bIso) { return Math.round((parseISO(bIso) - parseISO(aIso)) / 86400000); }
function toMinutes(t) { const p = String(t).split(':'); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); }
function minutesToTime(m) { m = clamp(Math.round(m), 0, 24 * 60 - 1); return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); }
function timesOverlap(aFrom, aTo, bFrom, bTo) { return toMinutes(aFrom) < toMinutes(bTo) && toMinutes(bFrom) < toMinutes(aTo); }
function at(dateISO, hhmm) { const d = parseISO(dateISO); const m = toMinutes(hhmm); d.setHours(Math.floor(m / 60), m % 60, 0, 0); return d; }
function nowHHMM(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function snap(m, step) { return Math.round(m / step) * step; }
function genId(prefix) {
const c = globalThis.crypto;
const rnd = (c && c.randomUUID) ? c.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2));
return (prefix || '') + rnd;
}
function hash32(str) {
let h = 0x811c9dc5;
for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
return h >>> 0;
}
function prng(seed) {
let a = seed >>> 0;
return function () {
a |= 0; a = (a + 0x6D2B79F5) | 0;
let t = Math.imul(a ^ (a >>> 15), 1 | a);
t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
}
function debounce(fn, ms) {
let t = null;
return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}
function rafThrottle(fn) {
let queued = false, lastArgs = null;
return function (...args) {
lastArgs = args;
if (queued) return;
queued = true;
requestAnimationFrame(() => { queued = false; fn.apply(this, lastArgs); });
};
}
function hexToRgb(hex) {
const h = hex.replace('#', '');
const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixHex(a, b, t) {
const x = hexToRgb(a), y = hexToRgb(b);
return '#' + x.map((v, i) => pad2Hex(Math.round(v + (y[i] - v) * t))).join('');
}
function pad2Hex(n) { const s = clamp(n, 0, 255).toString(16); return s.length < 2 ? '0' + s : s; }
function titleCaseName(name) {
return String(name).toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
}
function initials(name) {
const cleaned = String(name).replace(/^(Cikgu|Teacher|Madam|Miss|Mrs|Mr|Ustazah|Ustaz|Puan|Encik|Dr)\s+/i, '').trim();
return (cleaned || String(name)).charAt(0).toUpperCase();
}
function normalize(s) {
return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
return { esc, pad2, clamp, isoDate, parseISO, addDays, addMinutes, startOfDay, startOfWeek, startOfMonth, sameDate, daysBetween, toMinutes, minutesToTime, timesOverlap, at, nowHHMM, snap, genId, hash32, prng, debounce, rafThrottle, hexToRgb, mixHex, titleCaseName, initials, normalize };
})();
const __m5 = (() => {
const APP_VERSION = 'v4.0';
const SUBJECTS = [
{ name: 'Bahasa Melayu',      short: 'BM',  icon: 'bm',  color: '#E11D48', aliases: ['bahasa melayu', 'b melayu', 'bm', 'melayu', 'malay', 'bahasa malaysia'] },
{ name: 'English',            short: 'BI',  icon: 'bi',  color: '#4F46E5', aliases: ['english', 'bahasa inggeris', 'bahasa inggris', 'inggeris', 'bi', 'eng'] },
{ name: 'Sejarah',            short: 'SEJ', icon: 'sej', color: '#B45309', aliases: ['sejarah', 'history', 'sej'] },
{ name: 'Matematik',          short: 'MAT', icon: 'mat', color: '#2563EB', aliases: ['matematik', 'mathematics', 'maths', 'math', 'mate', 'mat', 'mm'] },
{ name: 'Pendidikan Islam',   short: 'PI',  icon: 'pi',  color: '#0D9488', aliases: ['pendidikan islam', 'p islam', 'agama islam', 'agama', 'islam', 'pi'] },
{ name: 'Pendidikan Moral',   short: 'PM',  icon: 'pm',  color: '#C026D3', aliases: ['pendidikan moral', 'p moral', 'moral', 'pm'] },
{ name: 'Matematik Tambahan', short: 'AM',  icon: 'am',  color: '#0284C7', aliases: ['matematik tambahan', 'math tambahan', 'add maths', 'add math', 'addmaths', 'addmath', 'add mate', 'addmate', 'mate tambahan', 'mt', 'am'] },
{ name: 'Biologi',            short: 'BIO', icon: 'bio', color: '#EA580C', aliases: ['biologi', 'biology', 'bio'] },
{ name: 'Kimia',              short: 'KIM', icon: 'kim', color: '#16A34A', aliases: ['kimia', 'chemistry', 'chem', 'kim'] },
{ name: 'Fizik',              short: 'FIZ', icon: 'fiz', color: '#7C3AED', aliases: ['fizik', 'physics', 'fiz', 'phy', 'physic'] }
];
const SUBJECT = Object.fromEntries(SUBJECTS.map(s => [s.name, s]));
function subjectColor(name) { return (SUBJECT[name] && SUBJECT[name].color) || '#8C7CFF'; }
function subjectShort(name) { return (SUBJECT[name] && SUBJECT[name].short) || String(name).slice(0, 3).toUpperCase(); }
const DEFAULT_SUBJECT_TEACHERS = {
'Bahasa Melayu': 'Cikgu Tiong',
'English': 'Teacher Hasyimah',
'Matematik': 'Cikgu Azurah',
'Sejarah': 'Cikgu Loh',
'Pendidikan Islam': 'Ustazah Syarfanezha',
'Pendidikan Moral': 'Cikgu Dylan',
'Matematik Tambahan': 'Miss Dayang',
'Biologi': 'Madam Patricia',
'Fizik': 'Cikgu Norhani',
'Kimia': 'Cikgu Azurah'
};
const ADMIN_USER = 'SAFWAN';
const ADMIN_CODE = {
salt: '039576046f01b5f9f6a942193813a7ae',
rounds: 20000,
check: '14a27b1cabc58341663c87c1715604226410259a1de36af80db251e4f7312565'
};
const STUDENT_NAMES = ['ADRIN', 'ALEEYSHA', 'DEA', 'HUSNA', 'IVY', 'KAETLYNN', 'KHAERA', 'AKIM', 'YASIN', 'SAFWAN', 'NATHANEIL', 'HAZARINNA', 'OCFREATY'];
const SUBJECT_ROSTERS = {
'Pendidikan Islam': ['ALEEYSHA', 'DEA', 'HUSNA', 'KHAERA', 'AKIM', 'YASIN', 'SAFWAN', 'HAZARINNA'],
'Pendidikan Moral': ['ADRIN', 'IVY', 'KAETLYNN', 'NATHANEIL', 'OCFREATY']
};
const EXEMPT_PAIRS = [['Pendidikan Islam', 'Pendidikan Moral']];
const JS_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_MY = { Sunday: 'Ahad', Monday: 'Isnin', Tuesday: 'Selasa', Wednesday: 'Rabu', Thursday: 'Khamis', Friday: 'Jumaat', Saturday: 'Sabtu' };
const MONTHS_MY = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
const SCHOOL_HOURS = {
Monday: { from: '07:00', to: '13:00' },
Tuesday: { from: '07:00', to: '13:00' },
Wednesday: { from: '07:00', to: '13:00' },
Thursday: { from: '07:00', to: '13:00' },
Friday: { from: '07:00', to: '11:30' }
};
const FRIDAY_PRAYER = { from: '12:15', to: '14:15' };
const ANALYSIS_END = '18:00';     // the original insight rule: analyse availability up to 6 pm
const GRID_FROM = 0;
const GRID_TO = 24 * 60;
const PAPERS = [
['2026-10-26', '2026-10-29', '', '', '1103/3', 'Bahasa Melayu', 'Kertas 3 · Ujian Bertutur', 'Bahasa Melayu', 'lisan'],
['2026-11-02', '2026-11-05', '', '', '1119/3', 'Bahasa Inggeris', 'Kertas 3 · Ujian Bertutur', 'English', 'lisan'],
['2026-11-16', '', '', '', '4531/3', 'Fizik', 'Kertas 3 · Ujian Amali', 'Fizik', 'amali'],
['2026-11-17', '', '', '', '4541/3', 'Kimia', 'Kertas 3 · Ujian Amali', 'Kimia', 'amali'],
['2026-11-18', '', '', '', '4551/3', 'Biologi', 'Kertas 3 · Ujian Amali', 'Biologi', 'amali'],
['2026-11-18', '', '', '', '4561/3', 'Sains Tambahan', 'Kertas 3 · Ujian Amali', null, 'amali'],
['2026-11-23', '', '09:00', '09:30', '1103/4', 'Bahasa Melayu', 'Kertas 4 · Ujian Mendengar', 'Bahasa Melayu', 'mendengar'],
['2026-11-23', '', '10:45', '12:45', '1103/1', 'Bahasa Melayu', 'Kertas 1', 'Bahasa Melayu'],
['2026-11-23', '', '14:30', '17:00', '1103/2', 'Bahasa Melayu', 'Kertas 2', 'Bahasa Melayu'],
['2026-11-24', '', '09:00', '09:40', '1119/4', 'Bahasa Inggeris', 'Kertas 4 · Ujian Mendengar', 'English', 'mendengar'],
['2026-11-24', '', '11:00', '12:30', '1119/1', 'Bahasa Inggeris', 'Kertas 1', 'English'],
['2026-11-24', '', '14:30', '16:00', '1119/2', 'Bahasa Inggeris', 'Kertas 2', 'English'],
['2026-11-25', '', '08:15', '10:30', '5402/1', 'Al-Syariah', 'Kertas 1', null],
['2026-11-25', '', '08:15', '10:45', '1223/1', 'Pendidikan Islam', 'Kertas 1', 'Pendidikan Islam'],
['2026-11-25', '', '08:15', '10:45', '1225', 'Pendidikan Moral', 'Kertas tunggal', 'Pendidikan Moral'],
['2026-11-25', '', '08:15', '10:45', '5228', "Pendidikan Syari'ah Islamiah", 'Kertas tunggal', null],
['2026-11-25', '', '08:15', '10:45', '5304/1', 'Turath Dirasat Islamiah', 'Kertas 1', null],
['2026-11-25', '', '14:30', '16:00', '5302/2', 'Maharat Al-Quran', 'Kertas 2', null],
['2026-11-25', '', '14:30', '17:00', '3729/1', 'Pertanian', 'Kertas 1', null],
['2026-11-26', '', '08:15', '09:45', '1449/1', 'Matematik', 'Kertas 1', 'Matematik'],
['2026-11-26', '', '10:45', '13:15', '1449/2', 'Matematik', 'Kertas 2', 'Matematik'],
['2026-11-30', '', '08:15', '09:15', '1249/1', 'Sejarah', 'Kertas 1', 'Sejarah'],
['2026-11-30', '', '10:30', '13:00', '1249/2', 'Sejarah', 'Kertas 2', 'Sejarah'],
['2026-11-30', '', '14:30', '17:00', '5226', 'Tasawwur Islam', 'Kertas tunggal', null],
['2026-12-01', '', '08:15', '10:30', '5404/1', "Manahij al-'Ulum al-Islamiah", 'Kertas 1', null],
['2026-12-01', '', '08:15', '11:15', '2611/2', 'Pendidikan Seni Visual', 'Kertas 2 · Ujian Melukis', null],
['2026-12-01', '', '12:00', '13:00', '2611/1', 'Pendidikan Seni Visual', 'Kertas 1 · Teori Seni', null],
['2026-12-01', '', '14:30', '16:00', '2621/1', 'Pendidikan Muzik', 'Kertas 1', null],
['2026-12-01', '', '14:30', '17:00', '3763/1', 'Reka Cipta', 'Kertas 1', null],
['2026-12-02', '', '08:15', '09:30', '4551/1', 'Biologi', 'Kertas 1', 'Biologi'],
['2026-12-02', '', '08:15', '09:30', '3766/1', 'Perniagaan', 'Kertas 1', null],
['2026-12-02', '', '10:45', '13:15', '4551/2', 'Biologi', 'Kertas 2', 'Biologi'],
['2026-12-02', '', '10:45', '13:00', '3766/2', 'Perniagaan', 'Kertas 2', null],
['2026-12-02', '', '14:30', '17:00', '3766/4', 'Perniagaan', 'Kertas 4', null],
['2026-12-03', '', '08:15', '09:30', '4531/1', 'Fizik', 'Kertas 1', 'Fizik'],
['2026-12-03', '', '08:15', '09:30', '1511/1', 'Sains', 'Kertas 1', null],
['2026-12-03', '', '10:30', '13:00', '4531/2', 'Fizik', 'Kertas 2', 'Fizik'],
['2026-12-03', '', '10:30', '13:00', '1511/2', 'Sains', 'Kertas 2', null],
['2026-12-03', '', '14:30', '17:00', '3769/1', 'Sains Rumah Tangga', 'Kertas 1', null],
['2026-12-07', '', '08:15', '09:30', '3767/1', 'Ekonomi', 'Kertas 1', null],
['2026-12-07', '', '10:45', '13:00', '3767/2', 'Ekonomi', 'Kertas 2', null],
['2026-12-07', '', '14:30', '16:30', '7101/1–7110/1', 'Mata pelajaran vokasional (binaan, elektrik, mekanikal)', 'Kertas 1', null],
['2026-12-07', '', '14:30', '17:00', '7201/1–7407/1', 'Mata pelajaran vokasional (lain-lain)', 'Kertas 1', null],
['2026-12-07', '', '14:30', '17:00', '3759/1', 'Lukisan Kejuruteraan', 'Kertas 1', null],
['2026-12-07', '', '14:30', '17:00', '3771/1', 'Grafik Komunikasi Teknikal', 'Kertas 1', null],
['2026-12-08', '', '08:15', '10:00', '6351/1', 'Bahasa Cina', 'Kertas 1', null],
['2026-12-08', '', '08:15', '10:00', '6354/1', 'Bahasa Tamil', 'Kertas 1', null],
['2026-12-08', '', '08:15', '10:00', '6356/1', 'Bahasa Iban', 'Kertas 1', null],
['2026-12-08', '', '08:15', '10:00', '6357/1', 'Bahasa Kadazandusun', 'Kertas 1', null],
['2026-12-08', '', '08:15', '10:00', '6358', 'Bahasa Semai', 'Kertas tunggal', null],
['2026-12-08', '', '08:15', '10:45', '5403/1', "Al-Lughah al-'Arabiah", 'Kertas 1', null],
['2026-12-08', '', '08:15', '10:45', '2361/1', 'Bahasa Arab', 'Kertas 1', null],
['2026-12-08', '', '08:15', '10:45', '5305/1', 'Turath Bahasa Arab', 'Kertas 1', null],
['2026-12-08', '', '14:30', '16:45', '6351/2', 'Bahasa Cina', 'Kertas 2', null],
['2026-12-08', '', '14:30', '16:45', '6354/2', 'Bahasa Tamil', 'Kertas 2', null],
['2026-12-08', '', '14:30', '16:45', '6356/2', 'Bahasa Iban', 'Kertas 2', null],
['2026-12-08', '', '14:30', '16:45', '6357/2', 'Bahasa Kadazandusun', 'Kertas 2', null],
['2026-12-09', '', '08:15', '09:30', '4572/1', 'Sains Sukan', 'Kertas 1', null],
['2026-12-09', '', '08:15', '10:30', '5401/1', 'Usul al-Din', 'Kertas 1', null],
['2026-12-09', '', '10:30', '13:00', '4572/2', 'Sains Sukan', 'Kertas 2', null],
['2026-12-09', '', '14:30', '17:00', '3754/1', 'Keusahawanan', 'Kertas 1', null],
['2026-12-09', '', '14:30', '17:00', '3760/1', 'Kejuruteraan Mekanikal', 'Kertas 1', null],
['2026-12-09', '', '14:30', '17:00', '3761/1', 'Kejuruteraan Awam', 'Kertas 1', null],
['2026-12-09', '', '14:30', '17:00', '3762/1', 'Kejuruteraan Elektrik dan Elektronik', 'Kertas 1', null],
['2026-12-09', '', '14:30', '17:00', '3768/1', 'Asas Kelestarian', 'Kertas 1', null],
['2026-12-10', '', '08:15', '10:15', '9221', 'Bible Knowledge', 'Kertas tunggal', null],
['2026-12-10', '', '08:15', '10:15', '9378', 'Bahasa Punjabi', 'Kertas tunggal', null],
['2026-12-10', '', '08:15', '10:45', '5227/1', 'Pendidikan Al-Quran dan Al-Sunnah', 'Kertas 1', null],
['2026-12-10', '', '08:15', '10:45', '5303/1', 'Turath Al-Quran dan Al-Sunnah', 'Kertas 1', null],
['2026-12-10', '', '14:30', '17:00', '3770/1', 'Sains Komputer', 'Kertas 1', null],
['2026-12-14', '', '08:15', '09:30', '3756/1', 'Prinsip Perakaunan', 'Kertas 1', null],
['2026-12-14', '', '10:45', '13:15', '3756/2', 'Prinsip Perakaunan', 'Kertas 2', null],
['2026-12-14', '', '14:30', '16:45', '5405/1', 'Al-Adab wa al-Balaghah', 'Kertas 1', null],
['2026-12-14', '', '14:30', '17:00', '3756/4', 'Prinsip Perakaunan', 'Kertas 4', null],
['2026-12-15', '', '08:15', '09:30', '4541/1', 'Kimia', 'Kertas 1', 'Kimia'],
['2026-12-15', '', '08:15', '09:30', '4561/1', 'Sains Tambahan', 'Kertas 1', null],
['2026-12-15', '', '10:45', '13:15', '4541/2', 'Kimia', 'Kertas 2', 'Kimia'],
['2026-12-15', '', '10:45', '13:15', '4561/2', 'Sains Tambahan', 'Kertas 2', null],
['2026-12-16', '', '08:15', '10:45', '2206', 'Kesusasteraan Inggeris', 'Kertas tunggal', null],
['2026-12-16', '', '08:15', '10:45', '2216/1', 'Kesusasteraan Melayu Komunikatif', 'Kertas 1', null],
['2026-12-16', '', '08:15', '10:45', '9216', 'Kesusasteraan Cina', 'Kertas tunggal', null],
['2026-12-16', '', '08:15', '10:45', '9217', 'Kesusasteraan Tamil', 'Kertas tunggal', null],
['2026-12-16', '', '11:45', '13:00', '2280/1', 'Geografi', 'Kertas 1', null],
['2026-12-16', '', '14:30', '17:00', '2280/2', 'Geografi', 'Kertas 2', null],
['2026-12-17', '', '08:15', '10:15', '3472/1', 'Matematik Tambahan', 'Kertas 1', 'Matematik Tambahan'],
['2026-12-17', '', '14:30', '17:00', '3472/2', 'Matematik Tambahan', 'Kertas 2', 'Matematik Tambahan']
].map(([date, dateTo, from, to, code, name, paper, subject, kind]) => ({ date, dateTo: dateTo || date, from, to, code, name, paper, subject: subject || null, kind: kind || 'bertulis' }));
const SPM = {
year: 2026,
source: 'Jadual Waktu Peperiksaan SPM 2026, Lembaga Peperiksaan KPM (18 Ogos 2026)',
writtenStart: '2026-11-23',
writtenEnd: '2026-12-17',
papers: PAPERS,
milestones: [
{ id: 'bm-oral', label: 'Ujian Bertutur Bahasa Melayu', short: 'Bertutur BM', from: '2026-10-26', to: '2026-10-29', subjects: ['Bahasa Melayu'] },
{ id: 'bi-oral', label: 'Ujian Bertutur Bahasa Inggeris', short: 'Bertutur BI', from: '2026-11-02', to: '2026-11-05', subjects: ['English'] },
{ id: 'amali-fiz', label: 'Ujian Amali Fizik', short: 'Amali Fizik', from: '2026-11-16', to: '2026-11-16', subjects: ['Fizik'] },
{ id: 'amali-kim', label: 'Ujian Amali Kimia', short: 'Amali Kimia', from: '2026-11-17', to: '2026-11-17', subjects: ['Kimia'] },
{ id: 'amali-bio', label: 'Ujian Amali Biologi', short: 'Amali Biologi', from: '2026-11-18', to: '2026-11-18', subjects: ['Biologi'] },
{ id: 'written', label: 'Peperiksaan Bertulis SPM', short: 'SPM bertulis', from: '2026-11-23', to: '2026-12-17', subjects: [] }
]
};
const CLASS_PAPERS = PAPERS.filter(p => p.subject).sort((a, b) => (a.date + (a.from || '00:00')).localeCompare(b.date + (b.from || '00:00')));
function papersOf(subject) { return CLASS_PAPERS.filter(p => p.subject === subject); }
const ATT_STATUSES = [
{ id: 'hadir', label: 'Hadir', short: 'H', tone: 'live' },
{ id: 'lewat', label: 'Lewat', short: 'L', tone: 'warn' },
{ id: 'dikecualikan', label: 'Dikecualikan', short: 'D', tone: 'info' },
{ id: 'tidak', label: 'Tidak hadir', short: 'T', tone: 'danger' }
];
const ATT_LABEL = Object.fromEntries(ATT_STATUSES.map(s => [s.id, s.label]));
const STATUS_LABELS = {
upcoming: 'Akan datang',
ongoing: 'Sedang berlangsung',
extending: 'Sedang extend',
ended: 'Selesai',
cancelled: 'Dibatalkan'
};
const SESSION_KEY = 'jadual-sandbox-session';
const THEME_KEY = 'jadual-sandbox-theme';
const DB_KEY = 'langit5s-db-v2';
const OLD_DB_KEYS = ['langit5s-db-v1'];
const SOURCE_KEY = 'langit5s-source';
return { APP_VERSION, SUBJECTS, SUBJECT, subjectColor, subjectShort, DEFAULT_SUBJECT_TEACHERS, ADMIN_USER, ADMIN_CODE, STUDENT_NAMES, SUBJECT_ROSTERS, EXEMPT_PAIRS, JS_DAYS, WEEK_ORDER, DAY_MY, MONTHS_MY, SCHOOL_HOURS, FRIDAY_PRAYER, ANALYSIS_END, GRID_FROM, GRID_TO, SPM, CLASS_PAPERS, papersOf, ATT_STATUSES, ATT_LABEL, STATUS_LABELS, SESSION_KEY, THEME_KEY, DB_KEY, OLD_DB_KEYS, SOURCE_KEY };
})();
const __m6 = (() => {
const REAL_SNAPSHOT = {
"takenAt": "2026-10-05T09:00:00.000Z",
"source": "https://safwanaizuddin27-lgtm.github.io/Jadual-Booking-Kelas/",
"docs": {
"jadualKelas/bookings": {
"data": [
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "bafebfe9-01a8-4f31-8be2-88133a1ff47e",
"date": "2026-09-23",
"from": "15:30",
"to": "16:30",
"originalTo": "16:30",
"subject": "Matematik Tambahan",
"teacher": "Miss Dayang",
"createdBy": "SAFWAN",
"createdByType": "Pelajar",
"createdAt": 1789986095305,
"updatedBy": "SAFWAN",
"updatedByType": "Pelajar",
"updatedAt": 1790152921428,
"attendance": {
"ADRIN": "hadir",
"AKIM": "hadir",
"ALEEYSHA": "hadir",
"DEA": "hadir",
"HAZARINNA": "hadir",
"HUSNA": "hadir",
"IVY": "hadir",
"KAETLYNN": "hadir",
"KHAERA": "hadir",
"NATHANEIL": "hadir",
"OCFREATY": "hadir",
"SAFWAN": "hadir",
"YASIN": "hadir"
},
"attendanceBy": "SAFWAN",
"attendanceAt": 1790433948072,
"day": "Wednesday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "45f3b168-d609-4e8a-a7e6-a0c4fadcbf6b",
"date": "2026-09-23",
"from": "14:00",
"to": "15:30",
"originalTo": "15:30",
"subject": "Matematik",
"teacher": "Cikgu Azurah",
"createdBy": "SAFWAN",
"createdByType": "Pelajar",
"createdAt": 1789990701079,
"updatedBy": "SAFWAN",
"updatedByType": "Pelajar",
"updatedAt": 1790141315909,
"attendance": {
"ADRIN": "hadir",
"AKIM": "hadir",
"ALEEYSHA": "hadir",
"DEA": "hadir",
"HAZARINNA": "hadir",
"HUSNA": "hadir",
"IVY": "hadir",
"KAETLYNN": "hadir",
"KHAERA": "hadir",
"NATHANEIL": "hadir",
"OCFREATY": "hadir",
"SAFWAN": "lewat",
"YASIN": "hadir"
},
"attendanceBy": "SAFWAN",
"attendanceAt": 1790434102623,
"day": "Wednesday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "0bd53666-770f-4c50-b5bb-efd2393d5c25",
"date": "2026-09-26",
"from": "09:30",
"to": "11:30",
"originalTo": "11:30",
"subject": "Bahasa Melayu",
"teacher": "Cikgu Tiong",
"createdBy": "SAFWAN",
"createdByType": "Pelajar",
"createdAt": 1789994001083,
"cancelledBy": "SAFWAN",
"cancelledByType": "Pelajar",
"cancelledAt": 1790085541546,
"day": "Saturday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "81e617d1-b089-4eee-a8c6-e66643df1b31",
"date": "2026-09-26",
"from": "10:00",
"to": "12:00",
"originalTo": "12:00",
"subject": "Bahasa Melayu",
"teacher": "[Bengkel]",
"createdBy": "SAFWAN",
"createdByType": "Pelajar",
"createdAt": 1790177241779,
"attendance": {
"ADRIN": "hadir",
"AKIM": "hadir",
"ALEEYSHA": "hadir",
"DEA": "hadir",
"HAZARINNA": "hadir",
"HUSNA": "hadir",
"IVY": "hadir",
"KAETLYNN": "hadir",
"KHAERA": "tidak",
"NATHANEIL": "hadir",
"OCFREATY": "hadir",
"SAFWAN": "hadir",
"YASIN": "hadir"
},
"attendanceBy": "SAFWAN",
"attendanceAt": 1790417281755,
"day": "Saturday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "9b59ea01-b8ab-4e8f-bc97-4513f5c884e6",
"date": "2026-09-21",
"from": "13:30",
"to": "15:00",
"originalTo": "15:00",
"subject": "Sejarah",
"teacher": "Cikgu Loh",
"createdBy": "SISTEM",
"createdByType": "Cikgu",
"createdAt": 1790178658832,
"cancelledBy": "SISTEM",
"cancelledAt": 1790178658832,
"day": "Monday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "6f7008b8-2b7f-4425-b675-4aba44520d97",
"date": "2026-09-21",
"from": "13:45",
"to": "15:00",
"originalTo": "15:00",
"subject": "Biologi",
"teacher": "Madam Patricia",
"createdBy": "SISTEM",
"createdByType": "Cikgu",
"createdAt": 1790178658832,
"attendance": {
"ADRIN": "hadir",
"AKIM": "hadir",
"ALEEYSHA": "hadir",
"DEA": "hadir",
"HAZARINNA": "hadir",
"HUSNA": "hadir",
"IVY": "hadir",
"KAETLYNN": "hadir",
"KHAERA": "hadir",
"NATHANEIL": "hadir",
"OCFREATY": "hadir",
"SAFWAN": "lewat",
"YASIN": "hadir"
},
"attendanceBy": "SAFWAN",
"attendanceAt": 1790420047198,
"day": "Monday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "eadbfc0d-bfbb-43e9-800f-b3a085070eb5",
"date": "2026-09-21",
"from": "15:00",
"to": "16:00",
"originalTo": "16:00",
"subject": "Matematik",
"teacher": "Cikgu Azurah",
"createdBy": "SISTEM",
"createdByType": "Cikgu",
"createdAt": 1790178658832,
"attendance": {
"ADRIN": "hadir",
"AKIM": "hadir",
"ALEEYSHA": "hadir",
"DEA": "hadir",
"HAZARINNA": "hadir",
"HUSNA": "hadir",
"IVY": "hadir",
"KAETLYNN": "hadir",
"KHAERA": "hadir",
"NATHANEIL": "hadir",
"OCFREATY": "hadir",
"SAFWAN": "hadir",
"YASIN": "hadir"
},
"attendanceBy": "SAFWAN",
"attendanceAt": 1790420071067,
"day": "Monday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "8244fdb2-18cb-4136-80ab-5e3fa6173756",
"date": "2026-09-22",
"from": "13:00",
"to": "13:30",
"originalTo": "13:30",
"subject": "Pendidikan Islam",
"teacher": "Ustazah Syarfanezha",
"createdBy": "SISTEM",
"createdByType": "Cikgu",
"createdAt": 1790178658832,
"attendance": {
"AKIM": "hadir",
"ALEEYSHA": "hadir",
"DEA": "hadir",
"HAZARINNA": "hadir",
"HUSNA": "hadir",
"KHAERA": "hadir",
"SAFWAN": "hadir",
"YASIN": "hadir"
},
"attendanceBy": "SAFWAN",
"attendanceAt": 1790434047742,
"day": "Tuesday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "6e39e497-c70c-4208-8b8d-3a0eb0d0d19a",
"date": "2026-09-22",
"from": "14:30",
"to": "16:30",
"originalTo": "16:30",
"subject": "Kimia",
"teacher": "Cikgu Azurah",
"createdBy": "SISTEM",
"createdByType": "Cikgu",
"createdAt": 1790178658832,
"attendance": {
"ADRIN": "hadir",
"AKIM": "hadir",
"ALEEYSHA": "hadir",
"DEA": "hadir",
"HAZARINNA": "hadir",
"HUSNA": "hadir",
"IVY": "hadir",
"KAETLYNN": "hadir",
"KHAERA": "hadir",
"NATHANEIL": "hadir",
"OCFREATY": "hadir",
"SAFWAN": "hadir",
"YASIN": "hadir"
},
"attendanceBy": "SAFWAN",
"attendanceAt": 1790434071508,
"day": "Tuesday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "2c08051d-2417-4f66-8ce7-07259702453b",
"date": "2026-09-28",
"from": "14:30",
"to": "16:00",
"originalTo": "16:00",
"subject": "Fizik",
"teacher": "Cikgu Norhani",
"createdBy": "SAFWAN",
"createdByType": "Pelajar",
"createdAt": 1790182665653,
"attendance": {
"ADRIN": "hadir",
"AKIM": "hadir",
"ALEEYSHA": "hadir",
"DEA": "hadir",
"HAZARINNA": "hadir",
"HUSNA": "hadir",
"IVY": "hadir",
"KAETLYNN": "hadir",
"KHAERA": "hadir",
"NATHANEIL": "hadir",
"OCFREATY": "hadir",
"SAFWAN": "lewat",
"YASIN": "hadir"
},
"attendanceBy": "SAFWAN",
"attendanceAt": 1790583160977,
"day": "Monday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "7fae521e-d82e-4ec2-9013-5088efcd98de",
"date": "2026-09-29",
"from": "14:30",
"to": "16:00",
"originalTo": "16:00",
"subject": "Kimia",
"teacher": "Cikgu Azurah",
"createdBy": "SAFWAN",
"createdByType": "Pelajar",
"createdAt": 1790182725182,
"day": "Tuesday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "0d36dfc1-7ad1-4abf-b633-d77c8fbf5150",
"date": "2026-09-30",
"from": "12:30",
"to": "14:30",
"originalTo": "16:00",
"subject": "Biologi",
"teacher": "Madam Patricia",
"createdBy": "SAFWAN",
"createdByType": "Pelajar",
"createdAt": 1790182763949,
"updatedBy": "SAFWAN",
"updatedByType": "Pelajar",
"updatedAt": 1790751697732,
"attendance": {
"ADRIN": "hadir",
"AKIM": "hadir",
"ALEEYSHA": "hadir",
"DEA": "hadir",
"HAZARINNA": "hadir",
"HUSNA": "hadir",
"IVY": "hadir",
"KAETLYNN": "hadir",
"KHAERA": "hadir",
"NATHANEIL": "hadir",
"OCFREATY": "hadir",
"SAFWAN": "hadir",
"YASIN": "hadir"
},
"attendanceBy": "SAFWAN",
"attendanceAt": 1790751882338,
"day": "Wednesday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "7d5e026b-1ab6-4948-b379-f3f52cf15f0e",
"date": "2026-10-01",
"from": "14:00",
"to": "15:00",
"originalTo": "16:00",
"subject": "Fizik",
"teacher": "Cikgu Norhani",
"createdBy": "SAFWAN",
"createdByType": "Pelajar",
"createdAt": 1790182814778,
"updatedBy": "SAFWAN",
"updatedByType": "Pelajar",
"updatedAt": 1790914648148,
"day": "Thursday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "84f88a72-16cb-4a5d-bff1-fbcdc6e07561",
"date": "2026-09-25",
"from": "14:00",
"to": "16:00",
"originalTo": "16:00",
"subject": "Sejarah",
"teacher": "Cikgu Loh",
"createdBy": "SAFWAN",
"createdByType": "Pelajar",
"createdAt": 1790227627966,
"attendance": {
"ADRIN": "hadir",
"AKIM": "hadir",
"ALEEYSHA": "hadir",
"DEA": "tidak",
"HAZARINNA": "hadir",
"HUSNA": "hadir",
"IVY": "hadir",
"KAETLYNN": "hadir",
"KHAERA": "tidak",
"NATHANEIL": "hadir",
"OCFREATY": "hadir",
"SAFWAN": "hadir",
"YASIN": "hadir"
},
"attendanceBy": "SAFWAN",
"attendanceAt": 1790434728835,
"day": "Friday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "6293efe0-a978-4da1-98b4-8676d74473d2",
"date": "2026-09-26",
"from": "07:00",
"to": "10:00",
"originalTo": "09:45",
"subject": "Matematik Tambahan",
"teacher": "Miss Dayang",
"createdBy": "SAFWAN",
"createdByType": "Pelajar",
"createdAt": 1790227668128,
"updatedBy": "SAFWAN",
"updatedByType": "Pelajar",
"updatedAt": 1790246809901,
"attendance": {
"ADRIN": "hadir",
"AKIM": "hadir",
"ALEEYSHA": "lewat",
"DEA": "hadir",
"HAZARINNA": "hadir",
"HUSNA": "hadir",
"IVY": "lewat",
"KAETLYNN": "hadir",
"KHAERA": "tidak",
"NATHANEIL": "hadir",
"OCFREATY": "hadir",
"SAFWAN": "lewat",
"YASIN": "lewat"
},
"attendanceBy": "SAFWAN",
"attendanceAt": 1790417324929,
"day": "Saturday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "ae71c58c-82a0-4b53-92d4-7e1844076fa8",
"date": "2026-10-02",
"from": "14:30",
"to": "16:00",
"originalTo": "16:00",
"subject": "English",
"teacher": "TEACHER HASYIMAH",
"createdBy": "JADUAL TETAP",
"createdByType": "Sistem",
"createdAt": 1790494154085,
"cancelledBy": "SAFWAN",
"cancelledByType": "Pelajar",
"cancelledAt": 1790589552105,
"autoGenerated": true,
"templateId": "e5ec150e-12f8-45a7-a93c-2996a7402008",
"day": "Friday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "b213fd8b-8de5-4a7c-9815-1b2ebf83458a",
"date": "2026-09-28",
"from": "14:30",
"to": "16:00",
"originalTo": "16:00",
"subject": "Fizik",
"teacher": "Cikgu Norhani",
"createdBy": "JADUAL TETAP",
"createdByType": "Sistem",
"createdAt": 1790494154085,
"updatedBy": "SAFWAN",
"updatedByType": "Pelajar",
"updatedAt": 1790589599012,
"autoGenerated": true,
"templateId": "8e472c38-fe5e-47d0-b1cf-8aceb5cbc922",
"day": "Monday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "f5e24010-470c-46aa-b701-56030735acb0",
"date": "2026-09-29",
"from": "14:30",
"to": "16:00",
"originalTo": "16:00",
"subject": "Kimia",
"teacher": "CIKGU AZURAH",
"createdBy": "JADUAL TETAP",
"createdByType": "Sistem",
"createdAt": 1790494154085,
"cancelledBy": "SAFWAN",
"cancelledByType": "Pelajar",
"cancelledAt": 1790589547094,
"autoGenerated": true,
"templateId": "80300f84-41b6-4759-947f-8140c9cf628a",
"day": "Tuesday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "6df1d3aa-d91e-47e8-a9e7-b2eb5511746f",
"date": "2026-09-28",
"from": "19:00",
"to": "20:30",
"originalTo": "20:30",
"subject": "Bahasa Melayu",
"teacher": "Cikgu Tiong",
"createdBy": "SAFWAN",
"createdByType": "Pelajar",
"createdAt": 1790589506387,
"day": "Monday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "8144c864-426e-4cc8-913d-17918a577230",
"date": "2026-09-29",
"from": "19:00",
"to": "20:30",
"originalTo": "20:30",
"subject": "Sejarah",
"teacher": "Cikgu Loh",
"createdBy": "SAFWAN",
"createdByType": "Pelajar",
"createdAt": 1790720116803,
"day": "Tuesday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "4d9c2dd4-6d85-42f6-be5b-ece4ebefac87",
"date": "2026-10-03",
"from": "19:00",
"to": "20:30",
"originalTo": "20:30",
"subject": "Matematik",
"teacher": "Cikgu Azurah",
"createdBy": "SAFWAN",
"createdByType": "Pelajar",
"createdAt": 1790720205312,
"updatedBy": "SAFWAN",
"updatedByType": "Pelajar",
"updatedAt": 1790751725028,
"day": "Saturday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "7107b155-7837-4a4d-8abe-2a1e79109a76",
"date": "2026-10-02",
"from": "13:30",
"to": "16:00",
"originalTo": "16:00",
"subject": "Pendidikan Islam",
"teacher": "Ustazah Syarfanezha",
"createdBy": "SAFWAN",
"createdByType": "Pelajar",
"createdAt": 1790751751942,
"cancelledBy": "SAFWAN",
"cancelledByType": "Pelajar",
"cancelledAt": 1790914573129,
"day": "Friday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "48f0959f-941c-4aef-889e-3e288c8ce79b",
"date": "2026-10-04",
"from": "19:00",
"to": "20:30",
"originalTo": "20:30",
"subject": "Kimia",
"teacher": "Cikgu Azurah",
"createdBy": "SAFWAN",
"createdByType": "Pelajar",
"createdAt": 1790751799671,
"day": "Sunday"
},
{
"notes": "",
"extensionActive": false,
"extensionHistory": [],
"id": "df89569e-614e-44de-9a34-45175b5f2978",
"date": "2026-10-02",
"from": "14:30",
"to": "16:30",
"originalTo": "16:30",
"subject": "Matematik Tambahan",
"teacher": "Miss Dayang",
"createdBy": "SAFWAN",
"createdByType": "Pelajar",
"createdAt": 1790914609678,
"day": "Friday"
}
],
"updatedAt": {
"__ts": 1790914649484
}
},
"jadualKelas/config": {
"subjectTeachers": {
"Bahasa Melayu": "Cikgu Tiong",
"English": "Teacher Hasyimah",
"Sejarah": "Cikgu Loh",
"Matematik": "Cikgu Azurah",
"Pendidikan Islam": "Ustazah Syarfanezha",
"Pendidikan Moral": "Cikgu Dylan",
"Matematik Tambahan": "Miss Dayang",
"Biologi": "Madam Patricia",
"Kimia": "Cikgu Azurah",
"Fizik": "Cikgu Norhani"
},
"workshopTeachers": {},
"teacherGenders": {},
"recurringTemplates": []
}
},
"cols": {
"jadualKelas/meta/users": {
"ADRIN": {
"name": "ADRIN",
"type": "Pelajar",
"loginCount": 1,
"firstLoginAt": {
"__ts": 1789985460657
},
"lastLoginAt": {
"__ts": 1789985460657
},
"lastSeen": {
"__ts": 1790372003209
}
},
"AKIM": {
"name": "AKIM",
"type": "Pelajar",
"loginCount": 1,
"firstLoginAt": {
"__ts": 1789985867082
},
"lastLoginAt": {
"__ts": 1789985867082
},
"lastSeen": {
"__ts": 1789985927851
}
},
"ALEEYSHA": {
"name": "ALEEYSHA",
"type": "Pelajar",
"loginCount": 1,
"firstLoginAt": {
"__ts": 1790077701784
},
"lastLoginAt": {
"__ts": 1790077701784
},
"lastSeen": {
"__ts": 1790077906235
}
},
"DEA": {
"name": "DEA",
"type": "Pelajar",
"loginCount": 1,
"firstLoginAt": {
"__ts": 1789940740811
},
"lastLoginAt": {
"__ts": 1789940740811
},
"lastSeen": {
"__ts": 1790935902965
}
},
"HAZARINNA": {
"name": "HAZARINNA",
"type": "Pelajar",
"loginCount": 1,
"firstLoginAt": {
"__ts": 1789986408305
},
"lastLoginAt": {
"__ts": 1789986408305
},
"lastSeen": {
"__ts": 1790086501132
}
},
"IVY": {
"name": "IVY",
"type": "Pelajar",
"loginCount": 1,
"firstLoginAt": {
"__ts": 1789985922532
},
"lastLoginAt": {
"__ts": 1789985922532
},
"lastSeen": {
"__ts": 1789997882566
}
},
"SAFWAN": {
"name": "SAFWAN",
"type": "Pelajar",
"loginCount": 9,
"firstLoginAt": {
"__ts": 1789920025693
},
"lastLoginAt": {
"__ts": 1790583086524
},
"lastSeen": {
"__ts": 1791190277730
}
},
"YASIN": {
"name": "YASIN",
"type": "Pelajar",
"loginCount": 2,
"firstLoginAt": {
"__ts": 1790078196547
},
"lastLoginAt": {
"__ts": 1790322747225
},
"lastSeen": {
"__ts": 1790980683233
}
}
},
"jadualKelas/meta/activity": {
"wyOVVKcXEcYHT0i3bRya": {
"userName": "AKIM",
"userType": "Pelajar",
"action": "LOGIN",
"targetType": null,
"targetId": null,
"description": "AKIM log masuk sebagai Pelajar",
"clientTime": 1789985866437,
"timestamp": {
"__ts": 1789985867248
}
},
"6FpYM1xhUXygCJ5zZybw": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "53489323-5f5e-425e-9d45-68a017ef838d",
"description": "SAFWAN menempah Kimia dengan Cikgu Azurah pada 22/09/2026",
"clientTime": 1789985911481,
"timestamp": {
"__ts": 1789985911104
}
},
"rDjII88X6VK2acstbDXF": {
"userName": "IVY",
"userType": "Pelajar",
"action": "LOGIN",
"targetType": null,
"targetId": null,
"description": "IVY log masuk sebagai Pelajar",
"clientTime": 1789985922333,
"timestamp": {
"__ts": 1789985922673
}
},
"iFiSHhDRoc0sAbJLedGX": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "63ca767c-813e-4d38-9c10-752b1d457ee0",
"description": "SAFWAN menempah Pendidikan Islam dengan Ustazah Syarfanezha pada 22/09/2026",
"clientTime": 1789985966451,
"timestamp": {
"__ts": 1789985966449
}
},
"99Sr07k3oWh5J5XfPuk4": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "bafebfe9-01a8-4f31-8be2-88133a1ff47e",
"description": "SAFWAN menempah Matematik dengan Cikgu Azurah pada 23/09/2026",
"clientTime": 1789986095442,
"timestamp": {
"__ts": 1789986095052
}
},
"h12hg2GVhYeoOY0d71q0": {
"userName": "HAZARINNA",
"userType": "Pelajar",
"action": "LOGIN",
"targetType": null,
"targetId": null,
"description": "HAZARINNA log masuk sebagai Pelajar",
"clientTime": 1789986408391,
"timestamp": {
"__ts": 1789986408497
}
},
"FVRkkDHaxuHVB2JYhvtn": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "45f3b168-d609-4e8a-a7e6-a0c4fadcbf6b",
"description": "SAFWAN menempah Matematik Tambahan dengan Miss Dayang pada 23/09/2026",
"clientTime": 1789990701261,
"timestamp": {
"__ts": 1789990701190
}
},
"caxdoaO4lchoLEIZ15iB": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "0bd53666-770f-4c50-b5bb-efd2393d5c25",
"description": "SAFWAN menempah Bahasa Melayu dengan Cikgu Tiong pada 26/09/2026",
"clientTime": 1789994001283,
"timestamp": {
"__ts": 1789994001117
}
},
"UboDTbUZ2s8Gu4As3xCh": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "63ca767c-813e-4d38-9c10-752b1d457ee0",
"description": "SAFWAN mengemaskini Pendidikan Islam (masa: 22/09/2026 13:00–14:00 → 22/09/2026 13:00–13:30)",
"clientTime": 1790056588112,
"timestamp": {
"__ts": 1790056591861
}
},
"bJtdWIPmIRFPADesliKS": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_TEACHER",
"targetType": "subject",
"targetId": "Fizik",
"description": "SAFWAN menukar guru utama Fizik kepada Cikgu Norhani",
"clientTime": 1790072141795,
"timestamp": {
"__ts": 1790072143092
}
},
"BFd4ybShda2lPKuIzzVn": {
"userName": "ALEEYSHA",
"userType": "Pelajar",
"action": "LOGIN",
"targetType": null,
"targetId": null,
"description": "ALEEYSHA log masuk sebagai Pelajar",
"clientTime": 1790077701827,
"timestamp": {
"__ts": 1790077702014
}
},
"nAVbpxFh7Gd9w1jK7r9X": {
"userName": "YASIN",
"userType": "Pelajar",
"action": "LOGIN",
"targetType": null,
"targetId": null,
"description": "YASIN log masuk sebagai Pelajar",
"clientTime": 1790078208219,
"timestamp": {
"__ts": 1790078196927
}
},
"oMX1EHNagVWmqXQgo5D8": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "DELETE_BOOKING",
"targetType": "booking",
"targetId": "0bd53666-770f-4c50-b5bb-efd2393d5c25",
"description": "SAFWAN membatalkan Bahasa Melayu (Cikgu Tiong, 26/09/2026)",
"clientTime": 1790085541708,
"timestamp": {
"__ts": 1790085540705
}
},
"QPWRIP6cfri0siwpOXgW": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "45f3b168-d609-4e8a-a7e6-a0c4fadcbf6b",
"description": "SAFWAN mengemaskini Matematik (guru: Miss Dayang → Cikgu Azurah)",
"clientTime": 1790141316773,
"timestamp": {
"__ts": 1790141318452
}
},
"HcyvDkCNM26l8RoNtBJR": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "bafebfe9-01a8-4f31-8be2-88133a1ff47e",
"description": "SAFWAN mengemaskini Matematik Tambahan (guru: Cikgu Azurah → Miss Dayang; masa: 23/09/2026 15:30–16:30 → 23/09/2026 15:30–17:00)",
"clientTime": 1790141377686,
"timestamp": {
"__ts": 1790141379126
}
},
"IwO7lPQ87Jqk0ZvsP8Fn": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "bafebfe9-01a8-4f31-8be2-88133a1ff47e",
"description": "SAFWAN mengemaskini Matematik Tambahan (masa: 23/09/2026 15:30–17:00 → 23/09/2026 15:30–16:30)",
"clientTime": 1790152921747,
"timestamp": {
"__ts": 1790152923046
}
},
"MqFKEN3WB0kUOM699Jdx": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "81e617d1-b089-4eee-a8c6-e66643df1b31",
"description": "SAFWAN menempah Bahasa Melayu dengan [Bengkel] pada 26/09/2026",
"clientTime": 1790177242009,
"timestamp": {
"__ts": 1790177243443
}
},
"iEjNs6RiJV0ikQ6eNIlY": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "2c08051d-2417-4f66-8ce7-07259702453b",
"description": "SAFWAN menempah Fizik dengan Cikgu Norhani pada 28/09/2026",
"clientTime": 1790182674415,
"timestamp": {
"__ts": 1790182674470
}
},
"FnBimlTHWkjKxXIGdd1C": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "7fae521e-d82e-4ec2-9013-5088efcd98de",
"description": "SAFWAN menempah Kimia dengan Cikgu Azurah pada 29/09/2026",
"clientTime": 1790182725381,
"timestamp": {
"__ts": 1790182725441
}
},
"asatbHb9OuR2zTuGafNr": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "0d36dfc1-7ad1-4abf-b633-d77c8fbf5150",
"description": "SAFWAN menempah Biologi dengan Madam Patricia pada 30/09/2026",
"clientTime": 1790182764185,
"timestamp": {
"__ts": 1790182764267
}
},
"ZuOaDkBH0L35nPwEDrHf": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "7d5e026b-1ab6-4948-b379-f3f52cf15f0e",
"description": "SAFWAN menempah Matematik Tambahan dengan Miss Dayang pada 01/10/2026",
"clientTime": 1790182814994,
"timestamp": {
"__ts": 1790182815066
}
},
"siAFvfZvV0GWXmk75zvo": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "84f88a72-16cb-4a5d-bff1-fbcdc6e07561",
"description": "SAFWAN menempah Sejarah dengan Cikgu Loh pada 25/09/2026",
"clientTime": 1790227629738,
"timestamp": {
"__ts": 1790227631324
}
},
"Lh5njP22SBvyyy1BRG7X": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "6293efe0-a978-4da1-98b4-8676d74473d2",
"description": "SAFWAN menempah Matematik Tambahan dengan Miss Dayang pada 26/09/2026",
"clientTime": 1790227669004,
"timestamp": {
"__ts": 1790227670511
}
},
"3NdgWIK5ouMrdiexDybx": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "6293efe0-a978-4da1-98b4-8676d74473d2",
"description": "SAFWAN mengemaskini Matematik Tambahan (masa: 26/09/2026 7:00–9:45 → 26/09/2026 7:00–10:00)",
"clientTime": 1790246810333,
"timestamp": {
"__ts": 1790246811838
}
},
"KZwhIEr6TmSOwKR8kGOD": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "LOGOUT",
"targetType": null,
"targetId": null,
"description": "SAFWAN log keluar",
"clientTime": 1790263639609,
"timestamp": {
"__ts": 1790263638910
}
},
"BAKIsEMjiEho8XkmUUif": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "LOGIN",
"targetType": null,
"targetId": null,
"description": "SAFWAN log masuk sebagai Pelajar",
"clientTime": 1790263647279,
"timestamp": {
"__ts": 1790263646578
}
},
"zm3WXh6jXfDFUguiQnKZ": {
"userName": "YASIN",
"userType": "Pelajar",
"action": "LOGIN",
"targetType": null,
"targetId": null,
"description": "YASIN log masuk sebagai Pelajar",
"clientTime": 1790322747270,
"timestamp": {
"__ts": 1790322747312
}
},
"ksxJyNlbsTEE7itA7siq": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "LOGIN",
"targetType": null,
"targetId": null,
"description": "SAFWAN log masuk sebagai Pelajar",
"clientTime": 1790412942172,
"timestamp": {
"__ts": 1790412942417
}
},
"8xGoQSYzXTsuDrw9EpXR": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "LOGOUT",
"targetType": null,
"targetId": null,
"description": "SAFWAN log keluar",
"clientTime": 1790417203590,
"timestamp": {
"__ts": 1790417201437
}
},
"2pAAOQCLcxAdrcnmHpQI": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "LOGIN",
"targetType": null,
"targetId": null,
"description": "SAFWAN log masuk sebagai Pelajar",
"clientTime": 1790417211526,
"timestamp": {
"__ts": 1790417209331
}
},
"cLhABvFTVEXLtWIzL2zx": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_TEACHER",
"targetType": "subject",
"targetId": "Fizik",
"description": "SAFWAN menukar guru utama Fizik kepada Cikgu Norhani",
"clientTime": 1790417223578,
"timestamp": {
"__ts": 1790417221367
}
},
"JCyxFpCc0PiDlVyeHkxG": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "81e617d1-b089-4eee-a8c6-e66643df1b31",
"description": "SAFWAN menanda kehadiran Bahasa Melayu",
"clientTime": 1790417281991,
"timestamp": {
"__ts": 1790417279769
}
},
"9GWvJpySrSpReWl4eHfc": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "6293efe0-a978-4da1-98b4-8676d74473d2",
"description": "SAFWAN menanda kehadiran Matematik Tambahan",
"clientTime": 1790417325159,
"timestamp": {
"__ts": 1790417322972
}
},
"D8WpuZ19QIGOZCI8m81n": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "6f7008b8-2b7f-4425-b675-4aba44520d97",
"description": "SAFWAN menanda kehadiran Biologi",
"clientTime": 1790417460357,
"timestamp": {
"__ts": 1790417458151
}
},
"TqZEmqVr8p1S2KfK2PKC": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "6f7008b8-2b7f-4425-b675-4aba44520d97",
"description": "SAFWAN menanda kehadiran Biologi",
"clientTime": 1790420047420,
"timestamp": {
"__ts": 1790420045206
}
},
"mt2uLlaosNbTMwwBAMbH": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "eadbfc0d-bfbb-43e9-800f-b3a085070eb5",
"description": "SAFWAN menanda kehadiran Matematik",
"clientTime": 1790420071248,
"timestamp": {
"__ts": 1790420069023
}
},
"SaokQiYptlIO2MN8x5n9": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "bafebfe9-01a8-4f31-8be2-88133a1ff47e",
"description": "SAFWAN menanda kehadiran Matematik Tambahan",
"clientTime": 1790433948468,
"timestamp": {
"__ts": 1790433946875
}
},
"FJJeIH6a0NLr6BnoX4OT": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "84f88a72-16cb-4a5d-bff1-fbcdc6e07561",
"description": "SAFWAN menanda kehadiran Sejarah",
"clientTime": 1790433979498,
"timestamp": {
"__ts": 1790433977928
}
},
"yzzmrKauERTdXUqElmxU": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "8244fdb2-18cb-4136-80ab-5e3fa6173756",
"description": "SAFWAN menanda kehadiran Pendidikan Islam",
"clientTime": 1790434048733,
"timestamp": {
"__ts": 1790434047138
}
},
"PWppTSyU9g9AkoGdHxZB": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "6e39e497-c70c-4208-8b8d-3a0eb0d0d19a",
"description": "SAFWAN menanda kehadiran Kimia",
"clientTime": 1790434071879,
"timestamp": {
"__ts": 1790434070250
}
},
"YQ7wtVu5e07DsBEmgUAD": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "45f3b168-d609-4e8a-a7e6-a0c4fadcbf6b",
"description": "SAFWAN menanda kehadiran Matematik",
"clientTime": 1790434103099,
"timestamp": {
"__ts": 1790434101487
}
},
"NOh0F1ZQNkYOwqumTlQw": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "84f88a72-16cb-4a5d-bff1-fbcdc6e07561",
"description": "SAFWAN menanda kehadiran Sejarah",
"clientTime": 1790434730367,
"timestamp": {
"__ts": 1790434728773
}
},
"syWdByX67g59GRtdJ0ds": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "LOGOUT",
"targetType": null,
"targetId": null,
"description": "SAFWAN log keluar",
"clientTime": 1790583070893,
"timestamp": {
"__ts": 1790583073115
}
},
"p8BPO9a27mRuRuboiJtf": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "LOGIN",
"targetType": null,
"targetId": null,
"description": "SAFWAN log masuk sebagai Pelajar",
"clientTime": 1790583084782,
"timestamp": {
"__ts": 1790583086780
}
},
"eFgsadRvzocxDSHLrc36": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "2c08051d-2417-4f66-8ce7-07259702453b",
"description": "SAFWAN menanda kehadiran Fizik",
"clientTime": 1790583161279,
"timestamp": {
"__ts": 1790583163195
}
},
"Y2O5JZirkskFTtsGSvxh": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "6df1d3aa-d91e-47e8-a9e7-b2eb5511746f",
"description": "SAFWAN menempah Bahasa Melayu dengan Cikgu Tiong pada 28/09/2026",
"clientTime": 1790589506744,
"timestamp": {
"__ts": 1790589508742
}
},
"byvuoZE9LwF0cDH278zl": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "DELETE_BOOKING",
"targetType": "booking",
"targetId": "f5e24010-470c-46aa-b701-56030735acb0",
"description": "SAFWAN membatalkan Kimia (CIKGU AZURAH, 29/09/2026)",
"clientTime": 1790589547542,
"timestamp": {
"__ts": 1790589549498
}
},
"NoE8onN9FJEUfJeUfytL": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "DELETE_BOOKING",
"targetType": "booking",
"targetId": "ae71c58c-82a0-4b53-92d4-7e1844076fa8",
"description": "SAFWAN membatalkan English (TEACHER HASYIMAH, 02/10/2026)",
"clientTime": 1790589552369,
"timestamp": {
"__ts": 1790589554252
}
},
"TXZuVgDGk6ceqfDjXmgU": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "b213fd8b-8de5-4a7c-9815-1b2ebf83458a",
"description": "SAFWAN mengemaskini Fizik (guru: CIKGU NORHANI → Cikgu Norhani)",
"clientTime": 1790589599380,
"timestamp": {
"__ts": 1790589601322
}
},
"3jOIfZ4TCV4AnpzpRUgp": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "8144c864-426e-4cc8-913d-17918a577230",
"description": "SAFWAN menempah Sejarah dengan Cikgu Loh pada 29/09/2026",
"clientTime": 1790720117135,
"timestamp": {
"__ts": 1790720118384
}
},
"AKpMGb2zfNuNvLOnyi6s": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "0d36dfc1-7ad1-4abf-b633-d77c8fbf5150",
"description": "SAFWAN mengemaskini Biologi (masa: 30/09/2026 14:30–16:00 → 30/09/2026 14:00–15:30)",
"clientTime": 1790720135658,
"timestamp": {
"__ts": 1790720136800
}
},
"enxqMBy9cceGhV5vEgy3": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "4d9c2dd4-6d85-42f6-be5b-ece4ebefac87",
"description": "SAFWAN menempah Matematik dengan Cikgu Azurah pada 30/09/2026",
"clientTime": 1790720205607,
"timestamp": {
"__ts": 1790720206853
}
},
"ax8PCwWMwsToQMGcOkni": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "0d36dfc1-7ad1-4abf-b633-d77c8fbf5150",
"description": "SAFWAN mengemaskini Biologi (masa: 30/09/2026 14:00–15:30 → 30/09/2026 12:30–14:30)",
"clientTime": 1790751698207,
"timestamp": {
"__ts": 1790751699678
}
},
"G5QQECZZkk70qCRlDyOx": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "4d9c2dd4-6d85-42f6-be5b-ece4ebefac87",
"description": "SAFWAN mengemaskini Matematik (masa: 30/09/2026 19:00–20:30 → 03/10/2026 19:00–20:30)",
"clientTime": 1790751725857,
"timestamp": {
"__ts": 1790751727286
}
},
"6HqC4nH2bMbnOsvDnd9q": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "7107b155-7837-4a4d-8abe-2a1e79109a76",
"description": "SAFWAN menempah Pendidikan Islam dengan Ustazah Syarfanezha pada 02/10/2026",
"clientTime": 1790751752301,
"timestamp": {
"__ts": 1790751753689
}
},
"cPSoCUYxpaqHfDmDpb2B": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "48f0959f-941c-4aef-889e-3e288c8ce79b",
"description": "SAFWAN menempah Kimia dengan Cikgu Azurah pada 04/10/2026",
"clientTime": 1790751800138,
"timestamp": {
"__ts": 1790751801776
}
},
"rYV2edlULVh3ioGUGC3a": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "0d36dfc1-7ad1-4abf-b633-d77c8fbf5150",
"description": "SAFWAN menanda kehadiran Biologi",
"clientTime": 1790751883072,
"timestamp": {
"__ts": 1790751884227
}
},
"9dIHVAuGeA2MQRAzyqR4": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "DELETE_BOOKING",
"targetType": "booking",
"targetId": "7107b155-7837-4a4d-8abe-2a1e79109a76",
"description": "SAFWAN membatalkan Pendidikan Islam (Ustazah Syarfanezha, 02/10/2026)",
"clientTime": 1790914573627,
"timestamp": {
"__ts": 1790914574795
}
},
"4xirMmDpWhOo52s5i9pu": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "CREATE_BOOKING",
"targetType": "booking",
"targetId": "df89569e-614e-44de-9a34-45175b5f2978",
"description": "SAFWAN menempah Matematik Tambahan dengan Miss Dayang pada 02/10/2026",
"clientTime": 1790914610313,
"timestamp": {
"__ts": 1790914611826
}
},
"cl9YpZKnHr2Xan7ZFdh6": {
"userName": "SAFWAN",
"userType": "Pelajar",
"action": "UPDATE_BOOKING",
"targetType": "booking",
"targetId": "7d5e026b-1ab6-4948-b379-f3f52cf15f0e",
"description": "SAFWAN mengemaskini Fizik (guru: Miss Dayang → Cikgu Norhani; masa: 01/10/2026 14:30–16:00 → 01/10/2026 14:00–15:00)",
"clientTime": 1790914648488,
"timestamp": {
"__ts": 1790914649852
}
}
},
"jadualKelas/meta/notifications": {
"booking-created-53489323-5f5e-425e-9d45-68a017ef838d": {
"type": "BOOKING_CREATED",
"title": "Cikgu Azurah telah membuat tempahan Kimia.",
"body": "22/09/2026 • 14:30–16:30",
"createdAt": 1789985911621,
"read": true
},
"booking-created-63ca767c-813e-4d38-9c10-752b1d457ee0": {
"type": "BOOKING_CREATED",
"title": "Ustazah Syarfanezha telah membuat tempahan Pendidikan Islam.",
"body": "22/09/2026 • 13:00–14:00",
"createdAt": 1789985966966,
"read": true
},
"booking-created-bafebfe9-01a8-4f31-8be2-88133a1ff47e": {
"type": "BOOKING_CREATED",
"title": "Cikgu Azurah telah membuat tempahan Matematik.",
"body": "23/09/2026 • 15:30–16:30",
"createdAt": 1789986095576,
"read": true
},
"booking-created-45f3b168-d609-4e8a-a7e6-a0c4fadcbf6b": {
"type": "BOOKING_CREATED",
"title": "Miss Dayang telah membuat tempahan Matematik Tambahan.",
"body": "23/09/2026 • 14:00–15:30",
"createdAt": 1789990701397,
"read": true
},
"booking-created-0bd53666-770f-4c50-b5bb-efd2393d5c25": {
"type": "BOOKING_CREATED",
"title": "Cikgu Tiong telah membuat tempahan Bahasa Melayu.",
"body": "26/09/2026 • 9:30–11:30",
"createdAt": 1789994001419,
"read": true
},
"class-started-63ca767c-813e-4d38-9c10-752b1d457ee0": {
"type": "CLASS_STARTED",
"title": "Pendidikan Islam sedang berlangsung sekarang.",
"body": "Ustazah Syarfanezha · 13:00–14:00",
"createdAt": 1790056536873,
"read": true
},
"booking-updated-63ca767c-813e-4d38-9c10-752b1d457ee0-1790056588116": {
"type": "BOOKING_UPDATED",
"title": "Tempahan Pendidikan Islam telah dikemaskini oleh SAFWAN.",
"body": "masa: 22/09/2026 13:00–14:00 → 22/09/2026 13:00–13:30",
"createdAt": 1790056591069,
"read": true
},
"class-started-53489323-5f5e-425e-9d45-68a017ef838d": {
"type": "CLASS_STARTED",
"title": "Kimia sedang berlangsung sekarang.",
"body": "Cikgu Azurah · 14:30–16:30",
"createdAt": 1790058615653,
"read": true
},
"booking-cancelled-0bd53666-770f-4c50-b5bb-efd2393d5c25": {
"type": "BOOKING_CANCELLED",
"title": "Tempahan Bahasa Melayu telah dibatalkan oleh SAFWAN.",
"body": "26/09/2026 • 9:30–11:30",
"createdAt": 1790085541890,
"read": true
},
"booking-updated-45f3b168-d609-4e8a-a7e6-a0c4fadcbf6b-1790141316780": {
"type": "BOOKING_UPDATED",
"title": "Tempahan Matematik telah dikemaskini oleh SAFWAN.",
"body": "guru: Miss Dayang → Cikgu Azurah",
"createdAt": 1790141317701,
"read": true
},
"booking-updated-bafebfe9-01a8-4f31-8be2-88133a1ff47e-1790141377689": {
"type": "BOOKING_UPDATED",
"title": "Tempahan Matematik Tambahan telah dikemaskini oleh SAFWAN.",
"body": "guru: Cikgu Azurah → Miss Dayang; masa: 23/09/2026 15:30–16:30 → 23/09/2026 15:30–17:00",
"createdAt": 1790141378344,
"read": true
},
"class-started-bafebfe9-01a8-4f31-8be2-88133a1ff47e": {
"type": "CLASS_STARTED",
"title": "Matematik Tambahan sedang berlangsung sekarang.",
"body": "Miss Dayang · 15:30–17:00",
"createdAt": 1790149541627,
"read": true
},
"booking-updated-bafebfe9-01a8-4f31-8be2-88133a1ff47e-1790152921748": {
"type": "BOOKING_UPDATED",
"title": "Tempahan Matematik Tambahan telah dikemaskini oleh SAFWAN.",
"body": "masa: 23/09/2026 15:30–17:00 → 23/09/2026 15:30–16:30",
"createdAt": 1790152921976,
"read": true
},
"booking-created-81e617d1-b089-4eee-a8c6-e66643df1b31": {
"type": "BOOKING_CREATED",
"title": "[Bengkel] telah membuat tempahan Bahasa Melayu.",
"body": "26/09/2026 • 10:00–12:00",
"createdAt": 1790177242320,
"read": true
},
"booking-created-2c08051d-2417-4f66-8ce7-07259702453b": {
"type": "BOOKING_CREATED",
"title": "Cikgu Norhani telah membuat tempahan Fizik.",
"body": "28/09/2026 • 14:30–16:00",
"createdAt": 1790182677860,
"read": true
},
"booking-created-7fae521e-d82e-4ec2-9013-5088efcd98de": {
"type": "BOOKING_CREATED",
"title": "Cikgu Azurah telah membuat tempahan Kimia.",
"body": "29/09/2026 • 14:30–16:00",
"createdAt": 1790182725528,
"read": true
},
"booking-created-0d36dfc1-7ad1-4abf-b633-d77c8fbf5150": {
"type": "BOOKING_CREATED",
"title": "Madam Patricia telah membuat tempahan Biologi.",
"body": "30/09/2026 • 14:30–16:00",
"createdAt": 1790182764348,
"read": true
},
"booking-created-7d5e026b-1ab6-4948-b379-f3f52cf15f0e": {
"type": "BOOKING_CREATED",
"title": "Miss Dayang telah membuat tempahan Matematik Tambahan.",
"body": "01/10/2026 • 14:30–16:00",
"createdAt": 1790182815156,
"read": true
},
"booking-created-84f88a72-16cb-4a5d-bff1-fbcdc6e07561": {
"type": "BOOKING_CREATED",
"title": "Cikgu Loh telah membuat tempahan Sejarah.",
"body": "25/09/2026 • 14:00–16:00",
"createdAt": 1790227630262,
"read": true
},
"booking-created-6293efe0-a978-4da1-98b4-8676d74473d2": {
"type": "BOOKING_CREATED",
"title": "Miss Dayang telah membuat tempahan Matematik Tambahan.",
"body": "26/09/2026 • 7:00–9:45",
"createdAt": 1790227669447,
"read": true
},
"booking-updated-6293efe0-a978-4da1-98b4-8676d74473d2-1790246810334": {
"type": "BOOKING_UPDATED",
"title": "Tempahan Matematik Tambahan telah dikemaskini oleh SAFWAN.",
"body": "masa: 26/09/2026 7:00–9:45 → 26/09/2026 7:00–10:00",
"createdAt": 1790246810873,
"read": true
},
"class-started-84f88a72-16cb-4a5d-bff1-fbcdc6e07561": {
"type": "CLASS_STARTED",
"title": "Sejarah sedang berlangsung sekarang.",
"body": "Cikgu Loh · 14:00–16:00",
"createdAt": 1790322742210,
"read": true
},
"class-started-6293efe0-a978-4da1-98b4-8676d74473d2": {
"type": "CLASS_STARTED",
"title": "Matematik Tambahan sedang berlangsung sekarang.",
"body": "Miss Dayang · 7:00–10:00",
"createdAt": 1790377233476,
"read": true
},
"class-started-81e617d1-b089-4eee-a8c6-e66643df1b31": {
"type": "CLASS_STARTED",
"title": "Bahasa Melayu sedang berlangsung sekarang.",
"body": "[Bengkel] · 10:00–12:00",
"createdAt": 1790392257193,
"read": true
},
"booking-created-6df1d3aa-d91e-47e8-a9e7-b2eb5511746f": {
"type": "BOOKING_CREATED",
"title": "Cikgu Tiong telah membuat tempahan Bahasa Melayu.",
"body": "28/09/2026 • 19:00–20:30",
"createdAt": 1790589508201,
"read": true
},
"booking-cancelled-f5e24010-470c-46aa-b701-56030735acb0": {
"type": "BOOKING_CANCELLED",
"title": "Tempahan Kimia telah dibatalkan oleh SAFWAN.",
"body": "29/09/2026 • 14:30–16:00",
"createdAt": 1790589547797,
"read": true
},
"booking-cancelled-ae71c58c-82a0-4b53-92d4-7e1844076fa8": {
"type": "BOOKING_CANCELLED",
"title": "Tempahan English telah dibatalkan oleh SAFWAN.",
"body": "02/10/2026 • 14:30–16:00",
"createdAt": 1790589552549,
"read": true
},
"booking-updated-b213fd8b-8de5-4a7c-9815-1b2ebf83458a-1790589599381": {
"type": "BOOKING_UPDATED",
"title": "Tempahan Fizik telah dikemaskini oleh SAFWAN.",
"body": "guru: CIKGU NORHANI → Cikgu Norhani",
"createdAt": 1790589599585,
"read": true
},
"booking-created-8144c864-426e-4cc8-913d-17918a577230": {
"type": "BOOKING_CREATED",
"title": "Cikgu Loh telah membuat tempahan Sejarah.",
"body": "29/09/2026 • 19:00–20:30",
"createdAt": 1790720117516,
"read": true
},
"booking-updated-0d36dfc1-7ad1-4abf-b633-d77c8fbf5150-1790720135659": {
"type": "BOOKING_UPDATED",
"title": "Tempahan Biologi telah dikemaskini oleh SAFWAN.",
"body": "masa: 30/09/2026 14:30–16:00 → 30/09/2026 14:00–15:30",
"createdAt": 1790720135889,
"read": true
},
"booking-created-4d9c2dd4-6d85-42f6-be5b-ece4ebefac87": {
"type": "BOOKING_CREATED",
"title": "Cikgu Azurah telah membuat tempahan Matematik.",
"body": "30/09/2026 • 19:00–20:30",
"createdAt": 1790720205899,
"read": true
},
"class-started-0d36dfc1-7ad1-4abf-b633-d77c8fbf5150": {
"type": "CLASS_STARTED",
"title": "Biologi sedang berlangsung sekarang.",
"body": "Madam Patricia · 14:00–15:30",
"createdAt": 1790751642413,
"read": false
},
"booking-updated-0d36dfc1-7ad1-4abf-b633-d77c8fbf5150-1790751698209": {
"type": "BOOKING_UPDATED",
"title": "Tempahan Biologi telah dikemaskini oleh SAFWAN.",
"body": "masa: 30/09/2026 14:00–15:30 → 30/09/2026 12:30–14:30",
"createdAt": 1790751699049,
"read": false
},
"booking-updated-4d9c2dd4-6d85-42f6-be5b-ece4ebefac87-1790751725860": {
"type": "BOOKING_UPDATED",
"title": "Tempahan Matematik telah dikemaskini oleh SAFWAN.",
"body": "masa: 30/09/2026 19:00–20:30 → 03/10/2026 19:00–20:30",
"createdAt": 1790751727662,
"read": false
},
"booking-created-7107b155-7837-4a4d-8abe-2a1e79109a76": {
"type": "BOOKING_CREATED",
"title": "Ustazah Syarfanezha telah membuat tempahan Pendidikan Islam.",
"body": "02/10/2026 • 13:30–16:00",
"createdAt": 1790751752945,
"read": false
},
"booking-created-48f0959f-941c-4aef-889e-3e288c8ce79b": {
"type": "BOOKING_CREATED",
"title": "Cikgu Azurah telah membuat tempahan Kimia.",
"body": "04/10/2026 • 19:00–20:30",
"createdAt": 1790751801046,
"read": false
},
"booking-cancelled-7107b155-7837-4a4d-8abe-2a1e79109a76": {
"type": "BOOKING_CANCELLED",
"title": "Tempahan Pendidikan Islam telah dibatalkan oleh SAFWAN.",
"body": "02/10/2026 • 13:30–16:00",
"createdAt": 1790914573782,
"read": false
},
"booking-created-df89569e-614e-44de-9a34-45175b5f2978": {
"type": "BOOKING_CREATED",
"title": "Miss Dayang telah membuat tempahan Matematik Tambahan.",
"body": "02/10/2026 • 14:30–16:30",
"createdAt": 1790914611120,
"read": false
},
"booking-updated-7d5e026b-1ab6-4948-b379-f3f52cf15f0e-1790914648489": {
"type": "BOOKING_UPDATED",
"title": "Tempahan Fizik telah dikemaskini oleh SAFWAN.",
"body": "guru: Miss Dayang → Cikgu Norhani; masa: 01/10/2026 14:30–16:00 → 01/10/2026 14:00–15:00",
"createdAt": 1790914648821,
"read": false
}
},
"jadualKelas/meta/flags": {
"cleanup-2026-09-21": {
"cleanedAt": 1789985727344
},
"seed-2026-09-21-history": {
"seededAt": 1789985727367
},
"seed-2026-09-21-history-v2": {
"seededAt": 1789990070751
},
"seed-2026-09-21-history-v3": {
"seededAt": 1790084921625
},
"restore-2026-09-23-v1": {
"restoredAt": 1790178658835
}
}
}
};
return { REAL_SNAPSHOT };
})();
const __m3 = (() => {
const { prng } = __m4;
const { isoDate } = __m4;
const { addDays } = __m4;
const { startOfWeek } = __m4;
const { toMinutes } = __m4;
const { minutesToTime } = __m4;
const { timesOverlap } = __m4;
const { at } = __m4;
const { STUDENT_NAMES } = __m5;
const { DEFAULT_SUBJECT_TEACHERS } = __m5;
const { SUBJECT_ROSTERS } = __m5;
const { JS_DAYS } = __m5;
const { WEEK_ORDER } = __m5;
const { SCHOOL_HOURS } = __m5;
const { EXEMPT_PAIRS } = __m5;
const { REAL_SNAPSHOT } = __m6;
const RELIABILITY = {
ADRIN: 0.93, ALEEYSHA: 0.95, DEA: 0.92, HUSNA: 0.98, IVY: 0.94, KAETLYNN: 0.86, KHAERA: 0.95,
AKIM: 0.9, YASIN: 0.91, SAFWAN: 0.97, NATHANEIL: 0.78, HAZARINNA: 0.94, OCFREATY: 0.7
};
const LATE_RATE = { AKIM: 0.25, YASIN: 0.2, KAETLYNN: 0.18 };
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
function buildSeed(nowDate, source) {
return source === 'demo' ? buildDemoSeed(nowDate) : buildRealSeed(nowDate);
}
function buildRealSeed(nowDate) {
const snap = JSON.parse(JSON.stringify(REAL_SNAPSHOT));
return { docs: snap.docs, cols: snap.cols, seededAt: nowDate.getTime(), source: 'real', takenAt: snap.takenAt };
}
function buildDemoSeed(nowDate) {
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
const avoid = [JS_DAYS[now.getDay()], JS_DAYS[addDays(now, 1).getDay()]];
const templateDays = ['Tuesday', 'Thursday', 'Monday', 'Wednesday', 'Friday'].filter(d => !avoid.includes(d)).slice(0, 2);
const templates = [
{ id: 'rt-fizik', subject: 'Fizik', teacher: 'Cikgu Norhani', day: templateDays[0], from: '14:30', to: '16:00' },
{ id: 'rt-addmath', subject: 'Matematik Tambahan', teacher: 'Miss Dayang', day: templateDays[1], from: '14:30', to: '16:00' }
].map(t => Object.assign(t, { createdBy: 'SAFWAN', createdAt: nowMs - 22 * 86400000 }));
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
const nowMin = now.getHours() * 60 + now.getMinutes();
const liveFrom = Math.max(0, Math.floor((nowMin - 25) / 5) * 5);
const liveTo = Math.min(23 * 60 + 55, liveFrom + 60);
const live = base({ subject: 'Matematik', teacher: 'Cikgu Azurah', date: todayISO, from: minutesToTime(liveFrom), to: minutesToTime(liveTo), author: 'SAFWAN', notes: 'Latih tubi Kertas 2: fungsi kuadratik' });
live.createdAt = nowMs - 2 * 86400000;
const att = {};
['HUSNA', 'IVY', 'AKIM', 'YASIN', 'DEA', 'KHAERA', 'ALEEYSHA', 'HAZARINNA'].forEach((name, i) => { att[name] = i < 6 ? 'hadir' : 'lewat'; });
live.attendance = att; live.attendanceBy = 'SAFWAN'; live.attendanceAt = nowMs - 60000;
bookings.push(live);
if (liveFrom >= 14 * 60 + 30 && JS_DAYS[now.getDay()] !== 'Sunday') {
const e = base({ subject: 'English', teacher: 'Teacher Hasyimah', date: todayISO, from: minutesToTime(liveFrom - 105), to: minutesToTime(liveFrom - 45), notes: 'Directed writing' });
if (!(SCHOOL_HOURS[JS_DAYS[now.getDay()]] && timesOverlap(e.from, e.to, SCHOOL_HOURS[JS_DAYS[now.getDay()]].from, SCHOOL_HOURS[JS_DAYS[now.getDay()]].to))) {
markAttendance(e);
bookings.push(e);
}
}
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
'jadualKelas/meta/flags': { 'seed-2026-09-21-history-v3': { seededAt: nowMs }, 'cleanup-2026-09-21': { cleanedAt: nowMs } }
},
seededAt: nowMs,
source: 'demo',
weekOrder: WEEK_ORDER.length
};
}
return { buildSeed, buildRealSeed, buildDemoSeed };
})();
const __m7 = (() => {
const OFFSET_KEY = 'langit5s-demo-offset';
let offset = 0;
try { offset = parseInt(localStorage.getItem(OFFSET_KEY) || '0', 10) || 0; } catch (e) { offset = 0; }
function now() { return new Date(Date.now() + offset); }
function nowMs() { return Date.now() + offset; }
function getOffset() { return offset; }
function setOffset(ms) {
offset = Math.round(ms) || 0;
try { if (offset) localStorage.setItem(OFFSET_KEY, String(offset)); else localStorage.removeItem(OFFSET_KEY); } catch (e) { /* memory only */ }
}
const secondSubs = new Set();
let timer = null;
function fire() {
const n = now();
secondSubs.forEach(fn => { try { fn(n); } catch (e) { console.error(e); } });
}
function start() { if (!timer) timer = setInterval(fire, 1000); }
function stop() { if (timer) { clearInterval(timer); timer = null; } }
function onSecond(fn) {
secondSubs.add(fn);
start();
return () => { secondSubs.delete(fn); if (!secondSubs.size) stop(); };
}
function initClock() {
document.addEventListener('visibilitychange', () => {
if (document.hidden) stop();
else if (secondSubs.size) { fire(); start(); }
});
}
return { now, nowMs, getOffset, setOffset, onSecond, initClock };
})();
const __m8 = (() => {
const K = new Uint32Array([
0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
const W = new Uint32Array(64);
function sha256(bytes) {
const len = bytes.length;
const total = ((len + 9 + 63) >> 6) << 6;
const m = new Uint8Array(total);
m.set(bytes);
m[len] = 0x80;
const dv = new DataView(m.buffer);
dv.setUint32(total - 8, Math.floor(len / 0x20000000));
dv.setUint32(total - 4, (len << 3) >>> 0);
const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
for (let off = 0; off < total; off += 64) {
for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
for (let i = 16; i < 64; i++) {
const x = W[i - 15], y = W[i - 2];
const s0 = (x >>> 7 | x << 25) ^ (x >>> 18 | x << 14) ^ (x >>> 3);
const s1 = (y >>> 17 | y << 15) ^ (y >>> 19 | y << 13) ^ (y >>> 10);
W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
}
let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
for (let i = 0; i < 64; i++) {
const S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
const S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
}
H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
}
const out = new Uint8Array(32);
const odv = new DataView(out.buffer);
for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
return out;
}
function toHex(bytes) {
let s = '';
for (let i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
return s;
}
function utf8(str) { return new TextEncoder().encode(String(str)); }
function stretchCode(code, salt, rounds) {
const s = utf8(salt);
let h = sha256(utf8(salt + '|' + String(code == null ? '' : code).trim()));
const buf = new Uint8Array(32 + s.length);
buf.set(s, 32);
for (let i = 1; i < rounds; i++) { buf.set(h, 0); h = sha256(buf); }
return toHex(h);
}
function keyCheck(key) { return toHex(sha256(utf8('langit5s-admin|' + key))); }
return { sha256, toHex, utf8, stretchCode, keyCheck };
})();
const __m9 = (() => {
const { isoDate } = __m4;
const { parseISO } = __m4;
const { addDays } = __m4;
const { startOfWeek } = __m4;
const { startOfMonth } = __m4;
const { toMinutes } = __m4;
const { minutesToTime } = __m4;
const { timesOverlap } = __m4;
const { at } = __m4;
const { pad2 } = __m4;
const { JS_DAYS } = __m5;
const { WEEK_ORDER } = __m5;
const { SCHOOL_HOURS } = __m5;
const { ANALYSIS_END } = __m5;
const { EXEMPT_PAIRS } = __m5;
const { SUBJECT_ROSTERS } = __m5;
const { STUDENT_NAMES } = __m5;
const { STATUS_LABELS } = __m5;
const { DEFAULT_SUBJECT_TEACHERS } = __m5;
function computeStatus(b, now) {
if (b.cancelledAt) return 'cancelled';
const start = at(b.date, b.from), end = at(b.date, b.to);
if (now < start) return 'upcoming';
if (b.extensionActive) return now < at(b.date, '23:59') ? 'extending' : 'ended';
if (now >= end) return 'ended';
return 'ongoing';
}
function statusLabel(key) { return STATUS_LABELS[key] || key; }
function isLive(b, now) { const s = computeStatus(b, now); return s === 'ongoing' || s === 'extending'; }
function dayNameOf(iso) { return JS_DAYS[parseISO(iso).getDay()]; }
function active(bookings) { return bookings.filter(b => !b.cancelledAt); }
function sortByTime(list) {
return list.slice().sort((a, b) => {
const x = a.date + 'T' + a.from, y = b.date + 'T' + b.from;
return x < y ? -1 : (x > y ? 1 : 0);
});
}
function liveClasses(bookings, now) { return sortByTime(active(bookings)).filter(b => isLive(b, now)); }
function upcomingClasses(bookings, now) { return sortByTime(active(bookings)).filter(b => computeStatus(b, now) === 'upcoming'); }
function classesOn(bookings, iso) { return sortByTime(active(bookings)).filter(b => b.date === iso); }
function minutesUntil(b, now, edge) { return Math.round((at(b.date, edge === 'end' ? b.to : b.from) - now) / 60000); }
function isExemptClash(a, b) {
if (a === b) return false;
return EXEMPT_PAIRS.some(p => p.indexOf(a) !== -1 && p.indexOf(b) !== -1);
}
function findClashes(bookings, subject, date, from, to, excludeId) {
return bookings.filter(b => {
if (excludeId && b.id === excludeId) return false;
if (b.cancelledAt) return false;
return b.date === date && timesOverlap(b.from, b.to, from, to) && !isExemptClash(b.subject, subject);
});
}
function schoolHoursFor(dayName) { return SCHOOL_HOURS[dayName] || null; }
function isSchoolHours(dayName, from, to) {
const sh = SCHOOL_HOURS[dayName];
return !!sh && timesOverlap(from, to, sh.from, sh.to);
}
function analysisStart(dayName) {
const sh = SCHOOL_HOURS[dayName];
return sh ? toMinutes(sh.to) : 7 * 60;
}
function firstFreeSlot(dayName, dayBookings, lenMin) {
const len = lenMin || 60, step = 30;
const end = toMinutes(ANALYSIS_END);
for (let m = analysisStart(dayName); m + len <= end; m += step) {
const a = minutesToTime(m), b = minutesToTime(m + len);
if (isSchoolHours(dayName, a, b)) continue;
if (!dayBookings.some(x => timesOverlap(a, b, x.from, x.to))) return { from: a, to: b };
}
return null;
}
function rosterFor(subject) {
const r = SUBJECT_ROSTERS[subject];
return (r && r.length) ? r.slice() : STUDENT_NAMES.slice();
}
function rosterForBooking(b) {
const names = rosterFor(b.subject);
Object.keys(b.attendance || {}).forEach(n => { if (names.indexOf(n) === -1) names.push(n); });
return names;
}
function isMarked(b) { return !!(b.attendance && Object.keys(b.attendance).length); }
function markedClasses(bookings) { return bookings.filter(b => !b.cancelledAt && isMarked(b)); }
function emptyTally() { return { hadir: 0, lewat: 0, dikecualikan: 0, tidak: 0 }; }
function rateFrom(c) {
const counted = c.hadir + c.lewat + c.tidak;
return counted ? Math.round(((c.hadir + c.lewat) / counted) * 100) : null;
}
function attendanceFor(bookings, name) {
const c = emptyTally(); let total = 0;
markedClasses(bookings).forEach(b => {
const v = b.attendance[name];
if (!v || !(v in c)) return;
c[v]++; total++;
});
return { counts: c, total, rate: rateFrom(c) };
}
function attendanceOverall(bookings) {
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
function starsFrom(counts) { return counts ? (counts.hadir || 0) : 0; }
function starCount(bookings, name) { return starsFrom(attendanceFor(bookings, name).counts); }
function onTimeNames(b) { return b && b.attendance ? Object.keys(b.attendance).filter(x => b.attendance[x] === 'hadir') : []; }
function streakFor(bookings, name, now) {
const past = sortByTime(markedClasses(bookings)).filter(b => at(b.date, b.from) <= now && b.attendance[name]).reverse();
let n = 0;
for (const b of past) {
const v = b.attendance[name];
if (v === 'dikecualikan') continue;
if (v === 'hadir') n++; else break;
}
return n;
}
function atRiskStudents(bookings, threshold) {
const all = attendanceOverall(bookings), out = [];
STUDENT_NAMES.forEach(n => {
const r = rateFrom(all.perStudent[n] || emptyTally());
if (r !== null && r < (threshold || 75)) out.push({ name: n, rate: r, counts: all.perStudent[n] });
});
return out.sort((a, b) => a.rate - b.rate);
}
function teacherKey(name) { return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function sameTeacher(a, b) { return teacherKey(a) === teacherKey(b); }
function canonicalTeacher(config, name) {
const k = teacherKey(name);
const known = staffTeachers(config).find(t => teacherKey(t) === k);
return known || name;
}
function registeredTeachers(config) {
const set = {};
Object.keys(config.subjectTeachers || {}).forEach(s => { const n = config.subjectTeachers[s]; if (n && n !== '—') set[n] = true; });
return Object.keys(set).sort();
}
function staffTeachers(config) {
const set = {};
registeredTeachers(config).forEach(n => { set[n] = true; });
Object.keys(config.workshopTeachers || {}).forEach(s => (config.workshopTeachers[s] || []).forEach(n => { if (n && n !== '—') set[n] = true; }));
return Object.keys(set).sort();
}
function allKnownTeachers(config, bookings) {
const byKey = {};
staffTeachers(config).forEach(n => { byKey[teacherKey(n)] = n; });
bookings.forEach(b => { const k = teacherKey(b.teacher); if (k && !byKey[k]) byKey[k] = b.teacher; });
return Object.values(byKey).sort((a, b) => a.localeCompare(b));
}
function subjectsOfTeacher(config, teacher) {
return Object.keys(config.subjectTeachers || {}).filter(s => sameTeacher(config.subjectTeachers[s], teacher));
}
function mostCommonSubjectFor(bookings, config, teacher) {
const counts = {};
bookings.forEach(b => { if (sameTeacher(b.teacher, teacher)) counts[b.subject] = (counts[b.subject] || 0) + 1; });
let best = null, bestN = 0;
Object.keys(counts).forEach(s => { if (counts[s] > bestN) { bestN = counts[s]; best = s; } });
return best || subjectsOfTeacher(config, teacher)[0] || null;
}
function defaultTeacherFor(config, subject) {
return (config.subjectTeachers && config.subjectTeachers[subject]) || DEFAULT_SUBJECT_TEACHERS[subject] || '';
}
function computeStats(bookings, now, config) {
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
function dailySeries(bookings, n, now, filterFn) {
const out = [];
for (let i = n - 1; i >= 0; i--) {
const iso = isoDate(addDays(now, -i));
out.push(bookings.filter(b => !b.cancelledAt && b.date === iso && (!filterFn || filterFn(b))).length);
}
return out;
}
function percentChange(curr, prev) {
if (!prev) return curr ? 100 : 0;
return Math.round(((curr - prev) / prev) * 100);
}
function countsByDate(bookings, fromISO, toISO) {
const out = {};
active(bookings).forEach(b => { if (b.date >= fromISO && b.date <= toISO) out[b.date] = (out[b.date] || 0) + 1; });
return out;
}
function busiestDay(bookings) {
const byDay = {};
active(bookings).forEach(b => { const d = dayNameOf(b.date); byDay[d] = (byDay[d] || 0) + 1; });
let best = null, bestN = 0;
WEEK_ORDER.forEach(d => { if ((byDay[d] || 0) > bestN) { bestN = byDay[d]; best = d; } });
return best ? { day: best, count: bestN } : null;
}
function recurringWanted(templates, now) {
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
function recurringMissing(base, wanted) {
return wanted.filter(w => !base.some(b => b.templateId === w.t.id && b.date === w.date));
}
function describeBookingDiff(oldB, fields) {
const parts = [];
const fmt = iso => iso.split('-').reverse().join('/');
if (fields.teacher && fields.teacher !== oldB.teacher) parts.push('guru: ' + oldB.teacher + ' → ' + fields.teacher);
if ((fields.date && fields.date !== oldB.date) || (fields.from && fields.from !== oldB.from) || (fields.to && fields.to !== oldB.to)) {
parts.push('masa: ' + fmt(oldB.date) + ' ' + oldB.from + '–' + oldB.to + ' → ' + fmt(fields.date || oldB.date) + ' ' + (fields.from || oldB.from) + '–' + (fields.to || oldB.to));
}
return parts.length ? parts.join('; ') : 'butiran dikemaskini';
}
return { computeStatus, statusLabel, isLive, dayNameOf, active, sortByTime, liveClasses, upcomingClasses, classesOn, minutesUntil, isExemptClash, findClashes, schoolHoursFor, isSchoolHours, analysisStart, firstFreeSlot, rosterFor, rosterForBooking, isMarked, markedClasses, emptyTally, rateFrom, attendanceFor, attendanceOverall, starsFrom, starCount, onTimeNames, streakFor, atRiskStudents, teacherKey, sameTeacher, canonicalTeacher, registeredTeachers, staffTeachers, allKnownTeachers, subjectsOfTeacher, mostCommonSubjectFor, defaultTeacherFor, computeStats, dailySeries, percentChange, countsByDate, busiestDay, recurringWanted, recurringMissing, describeBookingDiff };
})();
const __m1 = (() => {
const { createFirestore } = __m2;
const { buildSeed } = __m3;
const { now } = __m7;
const { nowMs } = __m7;
const { isoDate } = __m4;
const { toMinutes } = __m4;
const { minutesToTime } = __m4;
const { genId } = __m4;
const { at } = __m4;
const { DB_KEY } = __m5;
const { OLD_DB_KEYS } = __m5;
const { SOURCE_KEY } = __m5;
const { SESSION_KEY } = __m5;
const { DEFAULT_SUBJECT_TEACHERS } = __m5;
const { ADMIN_USER } = __m5;
const { ADMIN_CODE } = __m5;
const { stretchCode } = __m8;
const { keyCheck } = __m8;
const { STUDENT_NAMES } = __m5;
const { computeStatus } = __m9;
const { findClashes } = __m9;
const { recurringWanted } = __m9;
const { recurringMissing } = __m9;
const { describeBookingDiff } = __m9;
const { setOffset } = __m7;
const state = {
ready: { bookings: false, config: false, users: false, activity: false, notifications: false },
bookings: [],
config: { subjectTeachers: Object.assign({}, DEFAULT_SUBJECT_TEACHERS), workshopTeachers: {}, teacherGenders: {}, recurringTemplates: [] },
users: {},
activity: [],
notifications: [],
user: null,          // {name, type}
isAdmin: false,
persistent: true
};
const subs = new Set();
function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit(reason, detail) { subs.forEach(fn => { try { fn(reason, detail); } catch (e) { console.error(e); } }); }
let fs = null, refs = null;
let lastSeenWriteAt = 0;
let adminKey = '';      // proof of the admin code for this session (never the code itself)
const fmtDate = iso => iso.split('-').reverse().join('/');
function chosenSource() {
try { return localStorage.getItem(SOURCE_KEY) === 'demo' ? 'demo' : 'real'; } catch (e) { return 'real'; }
}
function migrate() {
try {
let old = false;
OLD_DB_KEYS.forEach(k => { if (localStorage.getItem(k) !== null) { localStorage.removeItem(k); old = true; } });
if (old) setOffset(0);
} catch (e) { /* storage blocked: nothing to migrate */ }
}
function initStore() {
migrate();
fs = createFirestore({ key: DB_KEY, seed: () => buildSeed(now(), chosenSource()), firstLoadDelay: 650 });
state.persistent = fs.sandbox.persistent;
const root = fs.collection('jadualKelas');
const meta = root.doc('meta');
refs = {
bookings: root.doc('bookings'),
config: root.doc('config'),
users: meta.collection('users'),
activity: meta.collection('activity'),
notifications: meta.collection('notifications')
};
refs.config.onSnapshot(snap => {
const d = snap.exists ? snap.data() : null;
if (d) {
state.config = {
subjectTeachers: Object.assign({}, DEFAULT_SUBJECT_TEACHERS, d.subjectTeachers || {}),
workshopTeachers: d.workshopTeachers || {},
teacherGenders: d.teacherGenders || {},
recurringTemplates: Array.isArray(d.recurringTemplates) ? d.recurringTemplates : []
};
} else {
refs.config.set({ subjectTeachers: DEFAULT_SUBJECT_TEACHERS, workshopTeachers: {} });
}
state.ready.config = true;
emit('config');
generateRecurring();
});
refs.bookings.onSnapshot(snap => {
const data = (snap.exists && snap.data() && snap.data().data) || [];
state.bookings = Array.isArray(data) ? data : [];
const first = !state.ready.bookings;
state.ready.bookings = true;
emit('bookings');
if (first) {
minuteTick();
setInterval(minuteTick, 30000);
}
});
refs.users.onSnapshot(snap => {
const next = {};
snap.forEach(doc => {
const d = doc.data();
const toDate = v => (v && v.toDate ? v.toDate() : null);
next[doc.id] = { name: d.name || doc.id, type: d.type, lastSeen: toDate(d.lastSeen), lastLoginAt: toDate(d.lastLoginAt), firstLoginAt: toDate(d.firstLoginAt), loginCount: d.loginCount || 0 };
});
state.users = next;
state.ready.users = true;
emit('users');
});
refs.activity.orderBy('clientTime', 'desc').limit(60).onSnapshot(snap => {
const list = [];
snap.forEach(doc => list.push(Object.assign({ id: doc.id }, doc.data())));
state.activity = list;
state.ready.activity = true;
emit('activity');
});
let notifFirst = true;
refs.notifications.orderBy('createdAt', 'desc').limit(40).onSnapshot(snap => {
const list = [];
snap.forEach(doc => list.push(Object.assign({ id: doc.id }, doc.data())));
const fresh = notifFirst ? [] : snap.docChanges().filter(c => c.type === 'added').map(c => Object.assign({ id: c.doc.id }, c.doc.data()));
notifFirst = false;
state.notifications = list;
state.ready.notifications = true;
emit('notifications', { fresh });
});
restoreSession();
setInterval(() => touchLastSeen(), 120000);
}
function minuteTick() {
generateTimeBasedNotifications();
generateRecurring();
emit('tick');
}
function refreshNow() { if (state.ready.bookings) minuteTick(); }
function saveSession() {
const s = { name: state.user.name, type: state.user.type, admin: state.isAdmin };
if (state.isAdmin) s.key = adminKey;
try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* memory only */ }
}
function validKey(key) { return typeof key === 'string' && key.length === 64 && keyCheck(key) === ADMIN_CODE.check; }
function restoreSession() {
let raw = null;
try { raw = localStorage.getItem(SESSION_KEY); } catch (e) { raw = null; }
if (!raw) return;
try {
const p = JSON.parse(raw);
if (p && p.name && p.type) {
state.user = { name: p.name, type: p.type };
state.isAdmin = p.admin === true && String(p.name).toUpperCase() === ADMIN_USER && validKey(p.key);
adminKey = state.isAdmin ? p.key : '';
if (p.admin === true && !state.isAdmin) { state.user = null; try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } return; }
touchLastSeen(true);
}
} catch (e) { /* ignore a broken session */ }
}
function needsPasscode(name) { return String(name).toUpperCase() === ADMIN_USER; }
const LOCK_KEY = 'langit5s-lock';
const LOCK_TRIES = 5, LOCK_MS = 30000;
let lock = { n: 0, until: 0 };
function readLock() { try { const v = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null'); if (v && typeof v.n === 'number') lock = v; } catch (e) { /* memory only */ } return lock; }
function writeLock() { try { localStorage.setItem(LOCK_KEY, JSON.stringify(lock)); } catch (e) { /* memory only */ } }
function lockedFor() { const l = readLock(); return Math.max(0, l.until - Date.now()); }
function checkPasscode(code) {
const key = stretchCode(String(code || '').trim(), ADMIN_CODE.salt, ADMIN_CODE.rounds);
return keyCheck(key) === ADMIN_CODE.check ? key : '';
}
async function login(name, type, opts) {
name = String(name || '').trim().toUpperCase();
if (!name) return { ok: false, message: 'Sila pilih nama anda.' };
let key = '';
if (type === 'Pelajar' && needsPasscode(name)) {
const wait = lockedFor();
if (wait) return { ok: false, locked: true, message: 'Terlalu banyak cubaan salah. Cuba lagi dalam ' + Math.ceil(wait / 1000) + ' saat.' };
key = checkPasscode(opts && opts.passcode);
if (!key) {
readLock();
lock.n += 1;
if (lock.n >= LOCK_TRIES) { lock = { n: 0, until: Date.now() + LOCK_MS }; writeLock(); return { ok: false, locked: true, message: 'Kod admin salah. Cuba lagi dalam 30 saat.' }; }
writeLock();
return { ok: false, message: 'Kod admin salah. Cuba lagi.' };
}
lock = { n: 0, until: 0 }; writeLock();
}
state.user = { name, type };
state.isAdmin = !!key;
adminKey = key;
saveSession();
const rec = state.users[name];
const isFirst = !rec || !rec.lastLoginAt;
const FV = fs.FieldValue;
try {
await refs.users.doc(name).set({
name, type,
lastSeen: FV.serverTimestamp(),
lastLoginAt: FV.serverTimestamp(),
firstLoginAt: isFirst ? FV.serverTimestamp() : { __ts: rec.firstLoginAt ? rec.firstLoginAt.getTime() : nowMs() },
loginCount: FV.increment(1)
}, { merge: true });
} catch (e) { /* best effort */ }
logActivity('LOGIN', { description: name + ' log masuk sebagai ' + type });
emit('session');
return { ok: true };
}
function logout() {
if (state.user) logActivity('LOGOUT', { description: state.user.name + ' log keluar' });
state.user = null;
state.isAdmin = false;
adminKey = '';
try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
emit('session');
}
async function touchLastSeen(force) {
if (!state.user || !refs) return;
const t = Date.now();
if (!force && lastSeenWriteAt && t - lastSeenWriteAt < 20000) return;
lastSeenWriteAt = t;
try { await refs.users.doc(state.user.name).set({ name: state.user.name, type: state.user.type, lastSeen: fs.FieldValue.serverTimestamp() }, { merge: true }); } catch (e) { /* ignore */ }
}
function isStudent() { return !!state.user && state.user.type === 'Pelajar' && STUDENT_NAMES.includes(state.user.name); }
async function logActivity(action, opts) {
opts = opts || {};
if (!state.user) return;
try {
await refs.activity.add({
userName: state.user.name, userType: state.user.type, action,
targetType: opts.targetType || null, targetId: opts.targetId || null,
description: opts.description || '', clientTime: nowMs(),
timestamp: fs.FieldValue.serverTimestamp()
});
} catch (e) { /* best effort */ }
}
const ownNotifications = new Set();
function isOwnNotification(id) { return ownNotifications.has(id); }
function ensureNotification(id, type, title, body, opts) {
if (state.notifications.some(n => n.id === id)) return;
if (!(opts && opts.system)) ownNotifications.add(id);
refs.notifications.doc(id).get().then(snap => {
if (snap.exists) return;
return refs.notifications.doc(id).set({ type, title, body, createdAt: nowMs(), read: false });
}).catch(() => {});
}
async function markAllNotificationsRead() {
const unread = state.notifications.filter(n => !n.read);
if (!unread.length) return { ok: true, count: 0 };
const batch = fs.batch();
unread.forEach(n => batch.update(refs.notifications.doc(n.id), { read: true }));
try { await batch.commit(); return { ok: true, count: unread.length }; }
catch (e) { return { ok: false, message: 'Gagal menanda notifikasi.' }; }
}
function generateTimeBasedNotifications() {
const n = now();
state.bookings.forEach(b => {
if (b.cancelledAt || b.autoGenerated) return;
const st = computeStatus(b, n);
if (st === 'ongoing' || st === 'extending') {
ensureNotification('class-started-' + b.id, 'CLASS_STARTED', b.subject + ' sedang berlangsung sekarang.', b.teacher + ', ' + b.from + '–' + b.to, { system: true });
}
});
}
function findBooking(id) { return state.bookings.find(b => b.id === id) || null; }
async function persistBookings(computeFn) {
const candidate = computeFn(state.bookings);
try {
await refs.bookings.set({ data: candidate, updatedAt: fs.FieldValue.serverTimestamp() });
state.bookings = candidate;     // the snapshot follows; this keeps the UI from flickering
return { ok: true };
} catch (e) {
return { ok: false, message: 'Gagal menyimpan. Semak sambungan dan cuba lagi.' };
}
}
function validateFields(f, excludeId) {
if (!f.subject || !f.teacher || !f.date || !f.from || !f.to) return { ok: false, message: 'Sila lengkapkan subjek, guru, tarikh dan masa.' };
if (toMinutes(f.from) >= toMinutes(f.to)) return { ok: false, message: 'Masa tamat mesti selepas masa mula.' };
return { ok: true, clashes: findClashes(state.bookings, f.subject, f.date, f.from, f.to, excludeId) };
}
async function createBooking(fields, opts) {
opts = opts || {};
if (!state.user) return { ok: false, message: 'Sila log masuk dahulu.' };
const v = validateFields(fields);
if (!v.ok) return v;
const u = state.user;
const booking = Object.assign({ id: genId('b-'), createdAt: nowMs(), createdBy: u.name, createdByType: u.type, originalTo: fields.to,
extensionActive: false, extensionHistory: [], notes: '' }, fields, opts.record ? { recorded: true } : {});
const res = await persistBookings(base => base.concat([booking]));
if (!res.ok) return res;
logActivity('CREATE_BOOKING', { targetType: 'booking', targetId: booking.id, description: opts.record
? u.name + ' menambah rekod kelas ' + fields.subject + ' (' + fields.teacher + ', ' + fmtDate(fields.date) + ' ' + fields.from + '–' + fields.to + ')'
: u.name + ' menempah ' + fields.subject + ' dengan ' + fields.teacher + ' pada ' + fmtDate(fields.date) });
if (!opts.silent && !opts.record) {
const self = u.name === fields.teacher;
ensureNotification('booking-created-' + booking.id, 'BOOKING_CREATED',
self ? (u.name + ' membuat tempahan ' + fields.subject + '.') : (fields.teacher + ' telah membuat tempahan ' + fields.subject + '.'),
fmtDate(fields.date) + ' • ' + fields.from + '–' + fields.to);
}
return { ok: true, booking };
}
async function updateBooking(id, fields, opts) {
opts = opts || {};
if (!state.user) return { ok: false, message: 'Sila log masuk dahulu.' };
const old = findBooking(id);
if (!old) return { ok: false, message: 'Kelas ini tidak dijumpai lagi.' };
const merged = Object.assign({}, old, fields);
const v = validateFields(merged, id);
if (!v.ok) return v;
const diff = describeBookingDiff(old, fields);
const u = state.user;
const res = await persistBookings(base => base.map(b => b.id !== id ? b : Object.assign({}, b, fields,
{ updatedBy: u.name, updatedByType: u.type, updatedAt: nowMs() },
(fields.to && !b.extensionActive && !(b.extensionHistory || []).length) ? { originalTo: fields.to } : {})));
if (!res.ok) return res;
logActivity('UPDATE_BOOKING', { targetType: 'booking', targetId: id, description: u.name + ' mengemaskini ' + merged.subject + ' (' + diff + ')' });
if (!opts.silent) {
const notify = () => ensureNotification('booking-updated-' + id + '-' + nowMs(), 'BOOKING_UPDATED', 'Tempahan ' + merged.subject + ' telah dikemaskini oleh ' + u.name + '.', diff);
if (opts.deferNotify) {
setTimeout(() => {
const cur = findBooking(id);
if (cur && cur.date === merged.date && cur.from === merged.from && cur.to === merged.to) notify();
}, UNDO_MS + 500);
} else notify();
}
return { ok: true, before: old, diff };
}
const UNDO_MS = 6000;
const UNDO_WINDOW = UNDO_MS;
async function cancelBooking(id, opts) {
opts = opts || {};
if (!state.user) return { ok: false, message: 'Sila log masuk dahulu.' };
const b = findBooking(id);
if (!b) return { ok: false, message: 'Kelas ini tidak dijumpai lagi.' };
const u = state.user;
const res = await persistBookings(base => base.map(x => x.id === id ? Object.assign({}, x, { cancelledBy: u.name, cancelledByType: u.type, cancelledAt: nowMs() }) : x));
if (!res.ok) return res;
logActivity('DELETE_BOOKING', { targetType: 'booking', targetId: id, description: u.name + ' membatalkan ' + b.subject + ' (' + b.teacher + ', ' + fmtDate(b.date) + ')' });
if (!opts.silent) {
setTimeout(() => {
const cur = findBooking(id);
if (cur && cur.cancelledAt) ensureNotification('booking-cancelled-' + id, 'BOOKING_CANCELLED', 'Tempahan ' + b.subject + ' telah dibatalkan oleh ' + u.name + '.', fmtDate(b.date) + ' • ' + b.from + '–' + b.to);
}, UNDO_MS + 500);
}
return { ok: true, booking: b };
}
async function restoreBooking(id) {
const b = findBooking(id);
if (!b || !state.user) return { ok: false, message: 'Tidak dapat memulihkan kelas ini.' };
const res = await persistBookings(base => base.map(x => {
if (x.id !== id) return x;
const c = Object.assign({}, x);
delete c.cancelledAt; delete c.cancelledBy; delete c.cancelledByType;
return c;
}));
if (res.ok) logActivity('UPDATE_BOOKING', { targetType: 'booking', targetId: id, description: state.user.name + ' membatalkan pembatalan ' + b.subject });
return res;
}
async function revertBooking(before) {
if (!before || !state.user) return { ok: false };
const res = await persistBookings(base => base.map(x => x.id === before.id ? Object.assign({}, before) : x));
if (res.ok) logActivity('UPDATE_BOOKING', { targetType: 'booking', targetId: before.id, description: state.user.name + ' mengembalikan ' + before.subject + ' ke masa asal' });
return res;
}
async function startExtend(id) {
if (!state.user) return { ok: false, message: 'Sila log masuk dahulu.' };
const b = findBooking(id);
if (!b) return { ok: false, message: 'Kelas ini tidak dijumpai lagi.' };
const extId = genId('x-');
const u = state.user;
const res = await persistBookings(base => base.map(x => {
if (x.id !== id) return x;
const hist = (x.extensionHistory || []).slice();
hist.push({ id: extId, startedBy: u.name, startedAt: nowMs(), extendedUntil: null, stoppedBy: null, stoppedAt: null });
return Object.assign({}, x, { extensionActive: true, extensionHistory: hist, originalTo: x.originalTo || x.to });
}));
if (!res.ok) return res;
logActivity('UPDATE_BOOKING', { targetType: 'booking', targetId: id, description: u.name + ' memulakan extend untuk ' + b.subject });
ensureNotification('extension-started-' + id + '-' + extId, 'EXTENSION_STARTED', b.subject + ' sedang di-extend.', 'Di-extend oleh ' + u.name);
return { ok: true };
}
async function extendBy(id, minutes) {
if (!state.user) return { ok: false, message: 'Sila log masuk dahulu.' };
const b = findBooking(id);
if (!b) return { ok: false, message: 'Kelas ini tidak dijumpai lagi.' };
const newTo = minutesToTime(toMinutes(b.to) + minutes);
if (toMinutes(b.to) + minutes >= 24 * 60) return { ok: false, message: 'Kelas tidak boleh melepasi tengah malam.' };
const clashes = findClashes(state.bookings, b.subject, b.date, b.from, newTo, b.id);
if (clashes.length) return { ok: false, message: 'Tidak boleh extend hingga ' + newTo + ': ' + clashes[0].subject + ' bermula ' + clashes[0].from + '.', clash: clashes[0] };
const u = state.user, t = nowMs();
const res = await persistBookings(base => base.map(x => {
if (x.id !== id) return x;
const hist = (x.extensionHistory || []).slice();
hist.push({ id: genId('x-'), startedBy: u.name, startedAt: t, extendedUntil: newTo, stoppedBy: u.name, stoppedAt: t, fixed: minutes });
return Object.assign({}, x, { to: newTo, extensionHistory: hist, originalTo: x.originalTo || x.to });
}));
if (!res.ok) return res;
logActivity('UPDATE_BOOKING', { targetType: 'booking', targetId: id, description: u.name + ' extend ' + b.subject + ' +' + minutes + ' minit (hingga ' + newTo + ')' });
ensureNotification('extension-fixed-' + id + '-' + t, 'EXTENSION_STARTED', b.subject + ' dilanjutkan ' + minutes + ' minit.', 'Tamat ' + newTo + ', oleh ' + u.name);
return { ok: true, to: newTo };
}
async function stopExtend(id, until) {
if (!state.user) return { ok: false, message: 'Sila log masuk dahulu.' };
const b = findBooking(id);
if (!b) return { ok: false, message: 'Kelas ini tidak dijumpai lagi.' };
if (!until || toMinutes(until) <= toMinutes(b.from)) return { ok: false, message: 'Masukkan waktu tamat selepas ' + b.from + '.' };
const clashes = findClashes(state.bookings, b.subject, b.date, b.from, until, b.id);
if (clashes.length) return { ok: false, message: 'Tidak boleh tamat ' + until + ': ' + clashes[0].subject + ' bermula ' + clashes[0].from + '.' };
const hist = b.extensionHistory || [];
const extId = hist.length ? hist[hist.length - 1].id : null;
const u = state.user;
const res = await persistBookings(base => base.map(x => {
if (x.id !== id) return x;
const h = (x.extensionHistory || []).map(e => e.id === extId ? Object.assign({}, e, { extendedUntil: until, stoppedAt: nowMs(), stoppedBy: u.name }) : e);
return Object.assign({}, x, { to: until, extensionActive: false, extensionHistory: h });
}));
if (!res.ok) return res;
logActivity('UPDATE_BOOKING', { targetType: 'booking', targetId: id, description: u.name + ' menghentikan extension ' + b.subject + ' sehingga ' + until });
if (extId) ensureNotification('extension-stopped-' + id + '-' + extId, 'EXTENSION_STOPPED', 'Extension ' + b.subject + ' telah dihentikan oleh ' + u.name + '.', 'Extend sehingga ' + until);
return { ok: true };
}
async function saveAttendance(id, draft) {
if (!state.isAdmin) return { ok: false, message: 'Hanya admin boleh menanda kehadiran.' };
const b = findBooking(id);
const res = await persistBookings(base => base.map(x => x.id !== id ? x : Object.assign({}, x, { attendance: Object.assign({}, draft), attendanceBy: state.user.name, attendanceAt: nowMs() })));
if (res.ok) logActivity('UPDATE_BOOKING', { targetType: 'booking', targetId: id, description: state.user.name + ' menanda kehadiran ' + (b ? b.subject : '') });
return res;
}
async function saveConfig(mutate) {
const c = state.config;
const candidate = {
subjectTeachers: Object.assign({}, c.subjectTeachers),
workshopTeachers: JSON.parse(JSON.stringify(c.workshopTeachers || {})),
teacherGenders: Object.assign({}, c.teacherGenders),
recurringTemplates: JSON.parse(JSON.stringify(c.recurringTemplates || []))
};
mutate(candidate);
try { await refs.config.set(candidate); state.config = candidate; return { ok: true }; }
catch (e) { return { ok: false, message: 'Gagal menyimpan tetapan.' }; }
}
async function setSubjectTeacher(subject, name) {
name = String(name || '').trim();
if (!name) return { ok: false, message: 'Nama guru tidak boleh kosong.' };
const res = await saveConfig(cfg => { cfg.subjectTeachers[subject] = name; });
if (res.ok) logActivity('UPDATE_TEACHER', { targetType: 'subject', targetId: subject, description: state.user.name + ' menukar guru utama ' + subject + ' kepada ' + name });
return res;
}
async function setTeacherGender(teacher, g) {
if (g !== 'F' && g !== 'M') return { ok: false, message: 'Pilih lelaki atau perempuan.' };
return saveConfig(cfg => { cfg.teacherGenders[teacher] = g; });
}
async function addWorkshopTeacher(subject, name) {
name = String(name || '').trim();
if (!name) return { ok: false, message: 'Masukkan nama guru bengkel.' };
const res = await saveConfig(cfg => {
if (!cfg.workshopTeachers[subject]) cfg.workshopTeachers[subject] = [];
if (cfg.workshopTeachers[subject].indexOf(name) === -1) cfg.workshopTeachers[subject].push(name);
});
if (res.ok) logActivity('UPDATE_TEACHER', { targetType: 'subject', targetId: subject, description: state.user.name + ' menambah guru bengkel ' + name + ' untuk ' + subject });
return res;
}
async function removeWorkshopTeacher(subject, name) {
return saveConfig(cfg => { cfg.workshopTeachers[subject] = (cfg.workshopTeachers[subject] || []).filter(n => n !== name); });
}
async function addTemplate(entry) {
if (!state.isAdmin) return { ok: false, message: 'Hanya admin boleh menambah jadual tetap.' };
if (!entry.subject || !entry.day || !entry.from || !entry.to) return { ok: false, message: 'Lengkapkan subjek, hari dan masa.' };
if (toMinutes(entry.to) <= toMinutes(entry.from)) return { ok: false, message: 'Masa tamat mesti selepas masa mula.' };
const t = Object.assign({ id: genId('rt-'), createdBy: state.user.name, createdAt: nowMs() }, entry);
const res = await saveConfig(cfg => { cfg.recurringTemplates = (cfg.recurringTemplates || []).concat([t]); });
if (res.ok) { logActivity('UPDATE_TEACHER', { targetType: 'template', targetId: t.id, description: state.user.name + ' menambah jadual tetap ' + t.subject }); generateRecurring(); }
return res;
}
async function removeTemplate(id) {
if (!state.isAdmin) return { ok: false, message: 'Hanya admin boleh membuang jadual tetap.' };
return saveConfig(cfg => { cfg.recurringTemplates = (cfg.recurringTemplates || []).filter(t => t.id !== id); });
}
let generating = false;
function generateRecurring() {
if (!state.ready.bookings || !state.ready.config || generating) return;
const wanted = recurringWanted(state.config.recurringTemplates, now());
if (!wanted.length || !recurringMissing(state.bookings, wanted).length) return;
generating = true;
fs.runTransaction(tx => tx.get(refs.bookings).then(snap => {
const data = (snap.exists && snap.data() && snap.data().data) || [];
const base = Array.isArray(data) ? data : [];
const missing = recurringMissing(base, wanted);
if (!missing.length) return;
const t = nowMs();
const extra = missing.map(w => ({
id: genId('b-'), subject: w.t.subject, teacher: w.t.teacher, date: w.date, from: w.t.from, to: w.t.to, notes: '',
createdBy: 'JADUAL TETAP', createdByType: 'Sistem', createdAt: t, originalTo: w.t.to, extensionActive: false, extensionHistory: [],
autoGenerated: true, templateId: w.t.id, day: w.t.day
}));
return tx.set(refs.bookings, { data: base.concat(extra), updatedAt: fs.FieldValue.serverTimestamp() });
})).catch(e => console.error('Jadual tetap gagal dijana, akan cuba lagi.', e)).then(() => { generating = false; });
}
function resetDemo() { fs.sandbox.reset(); }
function dataInfo() { return fs ? fs.sandbox.info() : { source: 'real' }; }
function setDataSource(source) {
try { if (source === 'demo') localStorage.setItem(SOURCE_KEY, 'demo'); else localStorage.removeItem(SOURCE_KEY); } catch (e) { /* memory only */ }
setOffset(0);
fs.sandbox.reset();
}
function exportBackup() { return fs.sandbox.exportJSON(); }
function importBackup(text) {
try { fs.sandbox.importJSON(text); return { ok: true }; }
catch (e) { return { ok: false, message: e.message || 'Fail sandaran tidak sah.' }; }
}
function todayISO() { return isoDate(now()); }
return { state, subscribe, initStore, refreshNow, needsPasscode, lockedFor, login, logout, touchLastSeen, isStudent, logActivity, isOwnNotification, ensureNotification, markAllNotificationsRead, findBooking, validateFields, createBooking, updateBooking, UNDO_WINDOW, cancelBooking, restoreBooking, revertBooking, startExtend, extendBy, stopExtend, saveAttendance, setSubjectTeacher, setTeacherGender, addWorkshopTeacher, removeWorkshopTeacher, addTemplate, removeTemplate, generateRecurring, resetDemo, dataInfo, setDataSource, exportBackup, importBackup, todayISO };
})();
const __m11 = (() => {
const { esc } = __m4;
class Raw {
constructor(s) { this.s = s; }
toString() { return this.s; }
}
function raw(s) { return new Raw(s == null ? '' : String(s)); }
function render(v) {
if (v == null || v === false || v === true) return '';
if (v instanceof Raw) return v.s;
if (Array.isArray(v)) return v.map(render).join('');
return esc(String(v));
}
function html(strings, ...vals) {
let out = '';
for (let i = 0; i < strings.length; i++) {
out += strings[i];
if (i < vals.length) out += render(vals[i]);
}
return new Raw(out);
}
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function setHTML(el, content) { if (el) el.innerHTML = content instanceof Raw ? content.s : render(content); }
function on(root, type, selector, fn, opts) {
root.addEventListener(type, e => {
const el = e.target && e.target.closest ? e.target.closest(selector) : null;
if (el && root.contains(el)) fn(e, el);
}, opts);
}
function create(tag, attrs, content) {
const el = document.createElement(tag);
if (attrs) Object.keys(attrs).forEach(k => {
if (k === 'class') el.className = attrs[k];
else if (k === 'dataset') Object.assign(el.dataset, attrs[k]);
else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
});
if (content != null) setHTML(el, content);
return el;
}
function prefersReducedMotion() {
return document.documentElement.dataset.motion === 'reduce' || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
function isCoarse() {
return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}
return { Raw, raw, html, $, $$, setHTML, on, create, prefersReducedMotion, isCoarse };
})();
const __m10 = (() => {
const { create } = __m11;
const { prefersReducedMotion } = __m11;
const views = {};
const listeners = new Set();
let current = null;
let host = null;
let guard = () => true;
function registerView(v) { views[v.id] = v; }
function getView(id) { return views[id]; }
function currentView() { return current; }
function onNavigate(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setGuard(fn) { guard = fn; }
function sectionFor(id) {
let el = host.querySelector('[data-view="' + id + '"]');
if (!el) {
el = create('section', { class: 'view view-' + id, 'data-view': id, tabindex: '-1' });
host.appendChild(el);
}
return el;
}
function show(id, params, opts) {
const v = views[id];
if (!v) return;
const prev = current;
const swap = () => {
if (prev && prev !== id && views[prev] && views[prev].leave) views[prev].leave();
host.querySelectorAll('.view.is-active').forEach(s => { if (s.dataset.view !== id) s.classList.remove('is-active'); });
const el = sectionFor(id);
el.classList.add('is-active');
current = id;
document.documentElement.dataset.page = id;
v.render(el, params || {}, { entering: prev !== id });
if (!opts || !opts.keepScroll) window.scrollTo(0, 0);
listeners.forEach(fn => fn(id, prev));
};
if (prev && prev !== id && document.startViewTransition && !prefersReducedMotion() && !(opts && opts.instant)) {
document.documentElement.classList.add('vt-page');
const t = document.startViewTransition(swap);
t.finished.finally(() => document.documentElement.classList.remove('vt-page'));
} else {
swap();
}
}
function navigate(id, params, opts) {
if (!views[id]) id = 'utama';
if (!guard(id)) id = 'utama';
pendingParams = params || null;
const target = '#' + id;
if (location.hash !== target) {
location.hash = target;          // hashchange will render
} else {
show(id, pendingParams, opts);
pendingParams = null;
}
}
let pendingParams = null;
function rerender(reason) {
if (!current || !views[current]) return;
const v = views[current];
if (v.update) v.update(reason);
else v.render(sectionFor(current), {}, { entering: false, reason });
}
function initRouter(container) {
host = container;
window.addEventListener('hashchange', () => {
let id = (location.hash || '').replace('#', '') || 'utama';
if (!views[id] || !guard(id)) id = 'utama';
show(id, pendingParams);
pendingParams = null;
});
}
function startRouter(defaultId) {
let id = (location.hash || '').replace('#', '') || defaultId || 'utama';
if (!views[id] || !guard(id)) id = defaultId || 'utama';
show(id, null, { instant: true });
}
return { registerView, getView, currentView, onNavigate, setGuard, navigate, rerender, initRouter, startRouter };
})();
const __m13 = (() => {
const { raw } = __m11;
const { SUBJECT } = __m5;
const P = {
utama: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
jadual: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M4 10h16"/>',
tempah: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M12 11v6M9 14h6"/>',
guru: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0"/><path d="M15.5 4.8a3 3 0 0 1 0 6M17.5 14.2a5.6 5.6 0 0 1 3.5 5.3"/>',
subjek: '<path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H11v15H6.5A1.5 1.5 0 0 1 5 17.5Z"/><path d="M19 5.5A1.5 1.5 0 0 0 17.5 4H13v15h4.5a1.5 1.5 0 0 0 1.5-1.5Z"/>',
pengguna: '<circle cx="12" cy="6.5" r="1.6"/><circle cx="5.5" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/><circle cx="8" cy="18.5" r="1.6"/><circle cx="16" cy="18.5" r="1.6"/><path d="M12 8.1 6.7 10.9M12 8.1l5.3 2.8M6.4 13.4 7.4 17M17.6 13.4 16.6 17M9.6 18.5h4.8"/>',
statistik: '<path d="M5 19V11M10 19V6M15 19v-5M20 19V9"/>',
kelas: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
tetap: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>',
tetapan: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2"/><circle cx="12" cy="12" r="7"/>',
bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 15 18 9Z"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>',
user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.8-3.8"/>',
clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
left: '<path d="m15 5-7 7 7 7"/>',
right: '<path d="m9 5 7 7-7 7"/>',
down: '<path d="m5 9 7 7 7-7"/>',
menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
moon: '<path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/>',
spark: '<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.2l-1.8-5.6-5.7-1.8L10.2 9Z"/>',
trash: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12.5a1 1 0 0 0 1 .9h9a1 1 0 0 0 1-.9L18.5 7M9 7V4.5h6V7"/>',
x: '<path d="M6 6l12 12M18 6 6 18"/>',
check: '<path d="m4.5 12.5 4.5 4.5L19.5 6.5"/>',
star: '<path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9L3.5 9.8l5.9-.8Z"/>',
flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.4 3-5.4 3.6-8.9.2-1 .1-1.9-.2-2.9 3.3 1.3 7.6 5 7.6 10 .8-.6 1.3-1.6 1.4-2.8 1 1.2 1.6 2.6 1.6 4.4C20 18.5 16.6 21 12 21Z"/>',
display: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
logout: '<path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9M16 17l5-5-5-5M21 12H9"/>',
mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
send: '<path d="M4 12h15M13 6l6 6-6 6"/>',
share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4"/>',
whatsapp: '<path d="M4.5 19.5 5.6 16A8 8 0 1 1 8.3 18.6Z"/><path d="M9 9.2c.2 2.2 2 4.5 4.6 5.4l1.4-1.2 1.6.9c-.3 1.2-1.4 1.8-2.6 1.6-3.3-.6-6-3.3-6.4-6.6-.2-1.2.5-2.2 1.6-2.5l.9 1.6Z"/>',
calplus: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M4 10h16M12 13v5M9.5 15.5h5"/>',
download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
list: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="5" cy="7" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17" r="1"/>',
undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
warn: '<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4M12 17h.01"/>',
plus: '<path d="M12 5v14M5 12h14"/>',
minus: '<path d="M5 12h14"/>',
wand: '<path d="m4 20 11-11M14 4v2M14 10v2M18 6h2M10 6H8M17 3l-1.5 1.5M17 9l-1.5-1.5"/>',
key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2 2M14 9l2 2"/>',
orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9.5" ry="4.5" transform="rotate(-30 12 12)"/>',
database: '<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8"/>',
play: '<path d="M8 5v14l11-7Z"/>',
spm: '<path d="M2.6 9.2 12 4.6l9.4 4.6L12 13.8Z"/><path d="M6.4 11.2v4.6c1.5 1.4 3.4 2.1 5.6 2.1s4.1-.7 5.6-2.1v-4.6"/><path d="M21.4 9.2v5.6"/>',
pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.4"/>'
};
function icon(name, size, cls) {
const d = P[name];
if (!d) return raw('');
const s = size || 18;
return raw('<svg class="ico' + (cls ? ' ' + cls : '') + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>');
}
const SUBJ = {
bm: '<path d="M4.4 20.6v-3.2A6.9 6.9 0 0 1 2 12.1a7.3 7.3 0 0 1 7.4-7.3c3.5 0 6.4 2.5 7 5.8l1.2 2.3c.3.5 0 .9-.5.9h-.9v1.8a1.9 1.9 0 0 1-1.9 1.9h-1.7v3.1"/><path d="M19.1 9.6a3.6 3.6 0 0 1 0 4.8"/><path d="M21.2 7.6a6.4 6.4 0 0 1 0 8.8" opacity=".55"/>',
bi: '<path d="M2.8 19 7.4 5.6h1.2L13.2 19"/><path d="M4.6 14.2h6.8"/><circle cx="17.4" cy="15.4" r="3.6"/><path d="M21 11.6V19"/>',
sej: '<rect x="3.6" y="3.2" width="16.8" height="3.6" rx="1.8"/><rect x="3.6" y="17.2" width="16.8" height="3.6" rx="1.8"/><path d="M6.2 6.8v10.4M17.8 6.8v10.4"/><path d="M9.2 10h5.6M9.2 12.8h5.6M9.2 15.4h3.2"/>',
mat: '<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4.6"/><path d="M8.2 6.4v4.2M6.1 8.5h4.2M13.8 8.5h4.2M6.6 14.1l3.2 3.2M9.8 14.1l-3.2 3.2M13.8 15.7h4.2"/><path d="M15.9 13.3h.01M15.9 18.1h.01" stroke-width="2.4"/>',
pi: '<path d="M3.4 20.6h17.2"/><path d="M5.4 20.6v-6.1h13.2v6.1"/><path d="M5.9 14.5c0-3.3 2.8-5.4 6.1-7 3.3 1.6 6.1 3.7 6.1 7"/><path d="M12 7.5V5.8"/><path d="M13.1 1.8a2.1 2.1 0 1 0 .5 3.6 1.7 1.7 0 1 1-.5-3.6Z"/><path d="M10.4 20.6v-2.4a1.6 1.6 0 0 1 3.2 0v2.4"/>',
pm: '<path d="M12 11.8S7.3 9.2 7.3 6.1A2.5 2.5 0 0 1 12 4.9a2.5 2.5 0 0 1 4.7 1.2c0 3.1-4.7 5.7-4.7 5.7Z"/><path d="M2.6 15.4h3.3l2.7 1.8h4.3a1.4 1.4 0 0 1 0 2.8H9.4"/><path d="M13.3 18.4 18 15.9a1.5 1.5 0 0 1 1.6 2.5l-5.5 3.2a3 3 0 0 1-1.6.4H2.6"/>',
am: '<path d="M3.6 3.4v17h17"/><path d="M6.8 5.8c1.3 7 3 10.4 5.3 10.4s4-3.4 5.3-10.4"/><circle cx="12.1" cy="16.2" r="1.35" fill="currentColor" stroke="none"/>',
bio: '<path d="M7 2.8c0 4.7 10 4.5 10 9.2s-10 4.5-10 9.2"/><path d="M17 2.8c0 4.7-10 4.5-10 9.2s10 4.5 10 9.2"/><path d="M8.2 5.2h7.6M9.6 9.6h4.8M9.6 14.4h4.8M8.2 18.8h7.6"/>',
kim: '<path d="M9.2 3h5.6"/><path d="M10.2 3v6.2L4.9 18a2 2 0 0 0 1.7 3h10.8a2 2 0 0 0 1.7-3l-5.3-8.8V3"/><path d="M7.4 14.6h9.2"/><path d="M10.4 17.6h.01M13.6 18.4h.01M12.4 16.4h.01" stroke-width="2.2"/>',
fiz: '<ellipse cx="12" cy="12" rx="9.6" ry="3.7"/><ellipse cx="12" cy="12" rx="9.6" ry="3.7" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.6" ry="3.7" transform="rotate(-60 12 12)"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>'
};
function subjectKey(name) { return (SUBJECT[name] && SUBJECT[name].icon) || null; }
function subjectIcon(name, size, cls) {
const k = subjectKey(name);
if (!k) return icon('subjek', size, cls);
const s = size || 18;
return raw('<svg class="ico sico' + (cls ? ' ' + cls : '') + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + SUBJ[k] + '</svg>');
}
function subjectBadge(name, size, cls) {
const px = { xs: 13, sm: 15, md: 18, lg: 24, xl: 34 }[size || 'md'] || 18;
const color = (SUBJECT[name] && SUBJECT[name].color) || '#8C7CFF';
return raw('<span class="sicon s-' + (size || 'md') + (cls ? ' ' + cls : '') + '" style="--c:' + color + '" aria-hidden="true">' + subjectIcon(name, px).s + '</span>');
}
return { icon, subjectIcon, subjectBadge };
})();
const __m14 = (() => {
const { create } = __m11;
const { html } = __m11;
const { raw } = __m11;
const { setHTML } = __m11;
const { icon } = __m13;
const stack = [];
function openSheet(o) {
const prevFocus = document.activeElement;
const dlg = create('dialog', { class: 'sheet' + (o.wide ? ' is-wide' : '') + (o.cls ? ' ' + o.cls : ''), 'aria-label': o.title || 'Dialog' });
setHTML(dlg, html`
<div class="sheet-grip" aria-hidden="true"></div>
${o.title ? html`<header class="sheet-head">${o.icon || ''}<div class="sheet-titles"><h2>${o.title}</h2>${o.sub ? html`<p class="sheet-sub">${o.sub}</p>` : ''}</div>
<button type="button" class="icon-btn sheet-x" aria-label="Tutup">${icon('x', 18)}</button></header>` : ''}
<div class="sheet-body"></div>`);
const body = dlg.querySelector('.sheet-body');
if (o.content != null) setHTML(body, o.content);
document.body.appendChild(dlg);
let closed = false;
const api = {
el: dlg, body,
setContent(c) { setHTML(body, c); },
close(value) {
if (closed) return; closed = true;
dlg.classList.add('is-closing');
const i = stack.indexOf(api); if (i > -1) stack.splice(i, 1);
setTimeout(() => {
try { dlg.close(); } catch (e) { /* already closed */ }
dlg.remove();
if (prevFocus && prevFocus.focus && document.contains(prevFocus)) { try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
if (o.onClose) o.onClose(value);
}, 200);
}
};
dlg.addEventListener('cancel', e => { e.preventDefault(); api.close(); });
dlg.addEventListener('mousedown', e => { api._downOnBackdrop = e.target === dlg; });
dlg.addEventListener('click', e => { if (e.target === dlg && api._downOnBackdrop) api.close(); });
const x = dlg.querySelector('.sheet-x');
if (x) x.addEventListener('click', () => api.close());
try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
document.dispatchEvent(new Event('sheet:open'));
stack.push(api);
if (o.onMount) o.onMount(api);
if (!o.keepFocus) {
const first = body.querySelector('[autofocus], input:not([type=hidden]), select, textarea, button.primary');
if (first && !(window.matchMedia && window.matchMedia('(pointer: coarse)').matches && first.tagName === 'INPUT')) { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
}
return api;
}
function closeAllSheets() { stack.slice().forEach(s => s.close()); }
function confirmDialog(o) {
return new Promise(resolve => {
let answered = false;
const s = openSheet({
title: o.title || 'Teruskan?', cls: 'is-dialog',
content: html`${o.message ? html`<p class="dialog-msg">${o.message}</p>` : ''}${o.detail ? raw(o.detail) : ''}
<div class="sheet-actions"><button type="button" class="btn ghost" data-a="no">${o.cancelLabel || 'Batal'}</button>
<button type="button" class="btn ${o.tone === 'danger' ? 'danger' : 'primary'}" data-a="yes">${o.confirmLabel || 'Ya'}</button></div>`,
keepFocus: true,
onMount(api) {
api.body.querySelector('[data-a="no"]').addEventListener('click', () => { answered = true; resolve(false); api.close(); });
const yes = api.body.querySelector('[data-a="yes"]');
yes.addEventListener('click', () => { answered = true; resolve(true); api.close(); });
yes.focus();
},
onClose() { if (!answered) resolve(false); }
});
return s;
});
}
function promptDialog(o) {
return new Promise(resolve => {
let answered = false;
openSheet({
title: o.title || '', cls: 'is-dialog',
content: html`<form class="dialog-form" novalidate>
<label class="field"><span class="field-label">${o.label || ''}</span>
<input id="dialog-input" class="input" type="text" autocomplete="off" value="${o.value || ''}" placeholder="${o.placeholder || ''}"></label>
<div class="sheet-actions"><button type="button" class="btn ghost" data-a="no">Batal</button><button type="submit" class="btn primary">${o.confirmLabel || 'Simpan'}</button></div></form>`,
keepFocus: true,
onMount(api) {
const input = api.body.querySelector('input');
input.focus(); input.select();
api.body.querySelector('[data-a="no"]').addEventListener('click', () => { answered = true; resolve(null); api.close(); });
api.body.querySelector('form').addEventListener('submit', e => { e.preventDefault(); answered = true; resolve(input.value); api.close(); });
},
onClose() { if (!answered) resolve(null); }
});
});
}
function chooseDialog(o) {
return new Promise(resolve => {
let answered = false;
openSheet({
title: o.title || 'Pilih', cls: 'is-dialog',
content: html`<div class="choice-grid">${o.options.map(op => html`<button type="button" class="choice${op.value === o.value ? ' is-on' : ''}" data-v="${op.value}"><b>${op.label}</b>${op.hint ? html`<span>${op.hint}</span>` : ''}</button>`)}</div>`,
keepFocus: true,
onMount(api) {
api.body.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { answered = true; resolve(b.getAttribute('data-v')); api.close(); }));
const f = api.body.querySelector('.is-on') || api.body.querySelector('[data-v]');
if (f) f.focus();
},
onClose() { if (!answered) resolve(null); }
});
});
}
return { openSheet, closeAllSheets, confirmDialog, promptDialog, chooseDialog };
})();
const __m15 = (() => {
const { isoDate } = __m4;
const { addDays } = __m4;
const { parseISO } = __m4;
const { titleCaseName } = __m4;
const { MONTHS_MY } = __m5;
const DAYS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
function dayShort(iso) { return DAYS[parseISO(iso).getDay()].slice(0, 3); }
function dayName(iso) { return DAYS[parseISO(iso).getDay()]; }
function dateShort(iso) { const d = parseISO(iso); return d.getDate() + ' ' + MONTHS_MY[d.getMonth()].slice(0, 3); }
function dateLong(iso) { const d = parseISO(iso); return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS_MY[d.getMonth()] + ' ' + d.getFullYear(); }
function rangeShort(a, b) {
if (!b || a === b) return dateShort(a);
const x = parseISO(a), y = parseISO(b);
return x.getMonth() === y.getMonth() ? x.getDate() + '–' + dateShort(b) : dateShort(a) + ' – ' + dateShort(b);
}
function dateDayMonth(iso) { const d = parseISO(iso); return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS_MY[d.getMonth()]; }
function dateMedium(iso) { const d = parseISO(iso); return DAYS[d.getDay()].slice(0, 3) + ', ' + d.getDate() + ' ' + MONTHS_MY[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear(); }
function dateNumeric(iso) { return String(iso).split('-').reverse().join('/'); }
function dayLabel(iso, now) {
if (iso === isoDate(now)) return 'Hari ini';
if (iso === isoDate(addDays(now, 1))) return 'Esok';
if (iso === isoDate(addDays(now, -1))) return 'Semalam';
return dayName(iso) + ', ' + dateShort(iso);
}
function dayPhrase(iso, now) {
const l = dayLabel(iso, now);
return (l === 'Hari ini' || l === 'Esok' || l === 'Semalam') ? l.toLowerCase() : l;
}
function timeRange(from, to) { return from + '–' + to; }
function minutesText(m) {
m = Math.max(0, Math.round(m));
if (m < 1) return 'kurang seminit';
if (m < 60) return m + ' minit';
const h = Math.floor(m / 60), r = m % 60;
return h + ' jam' + (r ? ' ' + r + ' minit' : '');
}
function durationText(from, to) {
const [a, b] = [from, to].map(t => { const p = t.split(':'); return +p[0] * 60 + +p[1]; });
return minutesText(b - a);
}
function timeAgo(ms, nowMs) {
const diff = Math.floor(((nowMs || Date.now()) - ms) / 60000);
if (diff < 1) return 'baru sahaja';
if (diff < 60) return diff + ' minit lalu';
const h = Math.floor(diff / 60);
if (h < 24) return h + ' jam lalu';
const d = Math.floor(h / 24);
return d === 1 ? 'semalam' : d + ' hari lalu';
}
function startsIn(mins) {
if (mins <= 0) return 'bermula sekarang';
if (mins < 60) return 'dalam ' + mins + ' minit';
if (mins < 24 * 60) return 'dalam ' + minutesText(mins);
const d = Math.round(mins / 1440);
return 'dalam ' + d + ' hari';
}
function greeting(h) {
if (h < 12) return 'Selamat pagi';
if (h < 15) return 'Selamat tengah hari';
if (h < 19) return 'Selamat petang';
return 'Selamat malam';
}
function personName(name) { return titleCaseName(name); }
function firstName(name) { return titleCaseName(String(name).replace(/^(Cikgu|Teacher|Madam|Miss|Ustazah|Ustaz|Puan|Encik)\s+/i, '').split(' ')[0]); }
return { dayShort, dayName, dateShort, dateLong, rangeShort, dateDayMonth, dateMedium, dateNumeric, dayLabel, dayPhrase, timeRange, minutesText, durationText, timeAgo, startsIn, greeting, personName, firstName };
})();
const __m12 = (() => {
const { state } = __m1;
const { now } = __m7;
const { onSecond } = __m7;
const { at } = __m4;
const { subjectColor } = __m5;
const { computeStatus } = __m9;
const { sortByTime } = __m9;
const { html } = __m11;
const { setHTML } = __m11;
const { on } = __m11;
const { icon } = __m13;
const { navigate } = __m10;
const { currentView } = __m10;
const { onNavigate } = __m10;
const { openSheet } = __m14;
const { initials } = __m4;
const { minutesText } = __m15;
const { personName } = __m15;
const { dateLong } = __m15;
const { dateMedium } = __m15;
const { prefersReducedMotion } = __m11;
const { isoDate } = __m4;
const { rafThrottle } = __m4;
const NAV = [
{ id: 'utama', label: 'Utama', icon: 'utama' },
{ id: 'jadual', label: 'Jadual', icon: 'jadual' },
{ id: 'tempah', label: 'Tempah', icon: 'tempah' },
{ id: 'statistik', label: 'Analitik', icon: 'statistik' },
{ id: 'guru', label: 'Guru', icon: 'guru' },
{ id: 'subjek', label: 'Subjek', icon: 'subjek' },
{ id: 'spm', label: 'SPM', icon: 'spm' },
{ id: 'pengguna', label: 'Rakan', icon: 'pengguna' },
{ id: 'kelas', label: 'Edit Kelas', icon: 'kelas', admin: true },
{ id: 'tetap', label: 'Jadual Tetap', icon: 'tetap', admin: true },
{ id: 'tetapan', label: 'Tetapan', icon: 'tetapan' }
];
const TITLES = { utama: 'Utama', jadual: 'Jadual', tempah: 'Tempah slot', statistik: 'Analitik', guru: 'Guru', subjek: 'Subjek', spm: 'Jadual SPM', pengguna: 'Rakan sekelas', kelas: 'Edit kelas', tetap: 'Jadual tetap', tetapan: 'Tetapan', paparan: 'Paparan kelas' };
let hooks = {};
function initShell(h) {
hooks = h;
renderShell();
onNavigate(id => { markActive(id); setTitle(id); });
onSecond(updateLive);
const onScroll = rafThrottle(() => document.documentElement.classList.toggle('is-scrolled', window.scrollY > 56));
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', rafThrottle(fitDate));
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitDate);
const top = document.getElementById('topbar');
on(document.getElementById('app'), 'click', '[data-go]', (e, el) => { e.preventDefault(); navigate(el.dataset.go); });
on(top, 'click', '[data-act]', (e, el) => act(el.dataset.act, el));
on(document.getElementById('rail'), 'click', '[data-act]', (e, el) => act(el.dataset.act, el));
on(document.getElementById('tabbar'), 'click', '[data-act]', (e, el) => act(el.dataset.act, el));
}
function act(a, el) {
if (a === 'ask') hooks.ask();
else if (a === 'notif') hooks.notifications();
else if (a === 'profile') hooks.profile();
else if (a === 'theme') hooks.theme(el);
else if (a === 'more') openMore();
else if (a === 'live') hooks.openClass(el.dataset.id);
else if (a === 'display') navigate('paparan');
else if (a === 'sandbox' && state.isAdmin) hooks.sandbox();
}
function items() { return NAV.filter(n => !n.admin || state.isAdmin); }
function renderShell() {
const u = state.user;
const rail = document.getElementById('rail');
setHTML(rail, html`
<a class="rail-mark" href="#utama" data-go="utama" aria-label="Utama"><span class="mark">5<i>Σ</i></span></a>
<div class="rail-nav">${items().map(n => html`<a href="#${n.id}" class="rail-item" data-go="${n.id}" data-nav="${n.id}" aria-label="${n.label}">${icon(n.icon, 21)}<span>${n.label}</span></a>`)}</div>
<div class="rail-foot">
<button type="button" class="rail-item" data-act="theme" aria-label="Tukar tema">${icon(document.documentElement.getAttribute('data-theme') === 'light' ? 'moon' : 'sun', 20)}<span>Tema</span></button>
<button type="button" class="avatar-btn" data-act="profile" aria-label="Profil ${u ? u.name : ''}"><span class="avatar">${u ? initials(u.name) : '?'}</span></button>
</div>`);
const top = document.getElementById('topbar');
setHTML(top, html`
<div class="tb-left">
<a class="tb-mark" href="#utama" data-go="utama" aria-label="Utama"><span class="mark">5<i>Σ</i></span></a>
<div class="tb-title"><h1 id="page-title">Utama</h1><span id="page-date" class="tb-date"><span class="tb-date-in">${dateLong(isoDate(now()))}</span></span></div>
</div>
<button type="button" class="ask-pill" data-act="ask" aria-label="Tanya Sigma">
<span class="ask-orb" aria-hidden="true">Σ</span><span class="ask-text">Tanya Sigma: "slot kosong esok untuk Fizik"</span><kbd>Ctrl K</kbd>
</button>
<div class="tb-right">
<button type="button" class="live-pill" id="live-pill" data-act="live" hidden></button>
<button type="button" class="icon-btn hide-sm" data-act="display" aria-label="Paparan kelas" title="Paparan kelas">${icon('display', 20)}</button>
${state.isAdmin ? html`<button type="button" class="sandbox-chip hide-sm" data-act="sandbox" title="Sumber data, jam aplikasi dan sandaran">Data</button>` : ''}
<button type="button" class="icon-btn bell" data-act="notif" aria-label="Notifikasi">${icon('bell', 20)}<span class="badge" id="notif-badge" hidden>0</span></button>
<button type="button" class="avatar-btn show-sm" data-act="profile" aria-label="Profil"><span class="avatar">${u ? initials(u.name) : '?'}</span></button>
</div>`);
const tab = document.getElementById('tabbar');
setHTML(tab, html`
<a href="#utama" class="tab" data-go="utama" data-nav="utama">${icon('utama', 22)}<span>Utama</span></a>
<a href="#jadual" class="tab" data-go="jadual" data-nav="jadual">${icon('jadual', 22)}<span>Jadual</span></a>
<a href="#tempah" class="tab tab-main" data-go="tempah" data-nav="tempah" aria-label="Tempah kelas"><span class="tab-plus">${icon('plus', 26)}</span><span>Tempah</span></a>
<button type="button" class="tab" data-act="ask">${icon('spark', 22)}<span>Tanya</span></button>
<button type="button" class="tab" data-act="more" data-nav-more>${icon('grid', 22)}<span>Lagi</span></button>`);
markActive(currentView());
setTitle(currentView());
updateBadge();
updateLive();
fitDate();
}
let dateShown = '', dateFitted = false;
function fitDate() {
const box = document.getElementById('page-date');
if (!box) return;
const inner = box.firstElementChild;
const iso = isoDate(now());
box.classList.remove('is-marquee');
inner.textContent = dateLong(iso);
dateShown = iso;
dateFitted = !!box.clientWidth;
if (!dateFitted) return;
const over = inner.scrollWidth - box.clientWidth;
if (over <= 1) return;
if (prefersReducedMotion()) { inner.textContent = dateMedium(iso); return; }
box.style.setProperty('--shift', -(over + 8) + 'px');
box.style.setProperty('--dur', (5 + over / 14).toFixed(1) + 's');
box.classList.add('is-marquee');
}
function markActive(id) {
document.querySelectorAll('[data-nav]').forEach(el => {
const on_ = el.dataset.nav === id;
el.classList.toggle('is-active', on_);
if (on_) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
});
const more = document.querySelector('[data-nav-more]');
if (more) more.classList.toggle('is-active', !['utama', 'jadual', 'tempah'].includes(id));
}
function setTitle(id) {
const t = document.getElementById('page-title');
if (t) t.textContent = TITLES[id] || 'Utama';
document.title = (id && id !== 'utama' ? (TITLES[id] || '') + ' · ' : '') + '5 Sigma Class Hub';
}
function updateBadge() {
const unread = state.notifications.filter(n => !n.read).length;
const b = document.getElementById('notif-badge');
if (!b) return;
b.hidden = !unread;
b.textContent = unread > 9 ? '9+' : String(unread);
}
function updateLive() {
const pill = document.getElementById('live-pill');
if (!pill || !state.user) return;
const n = now();
const wasHidden = pill.hidden, wasText = pill.textContent;
paintLive(pill, n);
if (!dateFitted || pill.hidden !== wasHidden || pill.textContent.length !== wasText.length || isoDate(n) !== dateShown) fitDate();
}
function paintLive(pill, n) {
const act = sortByTime(state.bookings.filter(b => !b.cancelledAt && b.date === isoDate(n)));
const live = act.find(b => { const s = computeStatus(b, n); return s === 'ongoing' || s === 'extending'; });
if (live) {
const left = Math.max(0, Math.round((at(live.date, live.to) - n) / 60000));
pill.hidden = false;
pill.dataset.id = live.id;
pill.className = 'live-pill is-live' + (live.extensionActive ? ' is-ext' : '');
pill.style.setProperty('--c', subjectColor(live.subject));
const txt = live.subject + ' · ' + (live.extensionActive ? 'extend' : minutesText(left).replace(' minit', ' min'));
if (pill.textContent !== txt) setHTML(pill, html`<i class="pulse"></i><span>${live.subject}</span><b>${live.extensionActive ? 'extend' : minutesText(left).replace(' minit', ' min')}</b>`);
return;
}
const next = act.find(b => computeStatus(b, n) === 'upcoming' && at(b.date, b.from) - n < 3 * 3600000);
if (next) {
pill.hidden = false;
pill.dataset.id = next.id;
pill.className = 'live-pill is-next';
pill.style.setProperty('--c', subjectColor(next.subject));
const mins = Math.max(0, Math.round((at(next.date, next.from) - n) / 60000));
setHTML(pill, html`<span>${next.subject}</span><b>${mins < 60 ? mins + ' min lagi' : next.from}</b>`);
} else pill.hidden = true;
}
function openMore() {
const s = openSheet({ title: 'Menu', cls: 'sheet-more', keepFocus: true,
content: html`<div class="more-grid">${items().filter(n => !['utama', 'jadual', 'tempah'].includes(n.id)).map(n => html`<button type="button" class="more-item" data-to="${n.id}">${icon(n.icon, 24)}<span>${n.label}</span></button>`)}
<button type="button" class="more-item" data-to="paparan">${icon('display', 24)}<span>Paparan kelas</span></button></div>
<div class="menu-list">
<button type="button" data-x="profile">${icon('user', 18)}<span>${state.user ? personName(state.user.name) : 'Profil'}</span></button>
<button type="button" data-x="theme">${icon(document.documentElement.getAttribute('data-theme') === 'light' ? 'moon' : 'sun', 18)}<span>Tukar tema</span></button>
${state.isAdmin ? html`<button type="button" data-x="sandbox">${icon('database', 18)}<span>Data dan jam aplikasi</span></button>` : ''}
</div>` });
on(s.body, 'click', '[data-to]', (e, el) => { s.close(); navigate(el.dataset.to); });
on(s.body, 'click', '[data-x]', (e, el) => { const x = el.dataset.x; s.close(); setTimeout(() => act(x === 'profile' ? 'profile' : x, el), 220); });
}
return { NAV, TITLES, initShell, renderShell, fitDate, updateBadge };
})();
const __m16 = (() => {
const { create } = __m11;
const { html } = __m11;
const { icon } = __m13;
const ICONS = { success: 'check', info: 'spark', warning: 'warn', error: 'x', star: 'star' };
let behindSheet = false;
document.addEventListener('sheet:open', () => { behindSheet = true; });
function raise(host) {
if (typeof host.showPopover !== 'function') return;
try {
if (!host.hasAttribute('popover')) host.setAttribute('popover', 'manual');
const open = host.matches(':popover-open');
if (open && behindSheet && document.querySelector('dialog[open]')) { host.hidePopover(); host.showPopover(); }
else if (!open) host.showPopover();
behindSheet = false;
} catch (e) { /* plain fixed element is fine */ }
}
function toast(message, opts) {
opts = typeof opts === 'string' ? { type: opts } : (opts || {});
const type = opts.type || 'info';
const host = document.getElementById('toasts');
if (!host) return;
raise(host);
const ms = opts.duration || (opts.action ? 6000 : 3400);
const el = create('div', { class: 'toast t-' + type, role: 'status', style: '--ms:' + ms + 'ms' },
html`<span class="toast-ic">${icon(ICONS[type] || 'spark', 16)}</span><span class="toast-msg">${message}</span>${opts.action ? html`<button type="button" class="toast-act">${opts.action.label}</button>` : ''}<i class="toast-bar"></i>`);
host.appendChild(el);
let closed = false;
const close = () => {
if (closed) return; closed = true;
el.classList.add('is-out');
setTimeout(() => el.remove(), 240);
};
if (opts.action) {
el.querySelector('.toast-act').addEventListener('click', () => { close(); opts.action.run(); });
}
setTimeout(close, ms);
const all = host.querySelectorAll('.toast:not(.is-out)');
if (all.length > 3) { all[0].classList.add('is-out'); setTimeout(() => all[0].remove(), 240); }
return { close };
}
return { toast };
})();
const __m17 = (() => {
const { state } = __m1;
const { login } = __m1;
const { needsPasscode } = __m1;
const { STUDENT_NAMES } = __m5;
const { staffTeachers } = __m9;
const { html } = __m11;
const { raw } = __m11;
const { setHTML } = __m11;
const { on } = __m11;
const { prefersReducedMotion } = __m11;
const { icon } = __m13;
const { toast } = __m16;
const { personName } = __m15;
const SIGMA_POINTS = [
[88, 10, 't'], [62.67, 10, 't'], [37.33, 10, 't'], [12, 10, 't'],
[26.67, 23.33, 'r'], [41.33, 36.67, 'r'], [56, 50, 'r'],
[41.33, 63.33, 'r'], [26.67, 76.67, 'r'],
[12, 90, 'b'], [37.33, 90, 'b b2'], [62.67, 90, 'b'], [88, 90, 'b b2']
];
const LINE = '88,10 12,10 56,50 12,90 88,90';
let root = null, onDone = null, picked = null, mode = 'stars';
function onlineNames() {
const t = Date.now();
return STUDENT_NAMES.filter(n => state.users[n] && state.users[n].lastSeen && t - state.users[n].lastSeen.getTime() < 5 * 60000);
}
function constellationHTML(opts) {
opts = opts || {};
const online = opts.online || [];
const lit = opts.lit || {};
const names = opts.names || STUDENT_NAMES;
return html`<div class="constellation${opts.cls ? ' ' + opts.cls : ''}" role="group" aria-label="${opts.label || 'Pilih bintang anda'}">
<svg class="c-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${LINE}" pathLength="100"/></svg>
${STUDENT_NAMES.map((name, i) => {
const [x, y, side] = SIGMA_POINTS[i];
const inRoster = names.includes(name);
const tagOpen = raw(opts.static ? 'span' : 'button type="button"'), tagClose = raw(opts.static ? 'span' : 'button');
return html`<${tagOpen} class="cstar ${side.split(' ').map(x => 'l-' + x).join(' ')}${online.includes(name) ? ' is-online' : ''}${lit[name] ? ' is-lit' : ''}${inRoster ? '' : ' is-off'}" data-star="${name}" style="--x:${x}%;--y:${y}%;--i:${i}" ${opts.static ? '' : html`aria-label="${personName(name)}${online.includes(name) ? ', sedang aktif' : ''}"`}>
<i class="cstar-core" aria-hidden="true"></i><span class="cstar-name">${personName(name)}</span>
</${tagClose}>`;
})}
</div>`;
}
function render() {
const online = onlineNames();
setHTML(root, html`
<div class="login-wrap">
<section class="login-side">
<header class="login-head">
<span class="mark mark-xl" aria-hidden="true">5<i>Σ</i></span>
<h1>Langit 5 Sigma</h1>
<p>Setiap bintang ialah seorang pelajar 5 Sigma. Tekan bintang anda untuk masuk.</p>
</header>
<div class="login-card" ${picked || mode === 'teacher' ? '' : 'hidden'} aria-live="polite"></div>
<div class="login-alt">
<button type="button" class="link-btn" data-teacher>${icon('guru', 18)} Saya cikgu</button>
</div>
<p class="login-fine">Σ ialah simbol hasil tambah: 13 bintang, satu kelas.</p>
</section>
<div class="login-stage${picked ? ' has-pick' : ''}" data-mode="${mode}">
${constellationHTML({ online })}
<p class="login-online">${online.length ? html`<i class="dot-live"></i>${online.length} rakan sedang aktif` : html`Langit sunyi buat masa ini`}</p>
</div>
</div>`);
renderCard();
}
function renderCard() {
const card = root.querySelector('.login-card');
if (!card) return;
root.querySelector('.login-stage').classList.toggle('has-pick', !!picked);
root.querySelectorAll('.cstar').forEach(s => s.classList.toggle('is-picked', s.dataset.star === picked));
if (mode === 'teacher') {
card.hidden = false;
const list = staffTeachers(state.config);
setHTML(card, html`
<h2>Log masuk cikgu</h2>
<p class="muted">Pilih nama anda.</p>
<div class="teacher-chips">${list.map(t => html`<button type="button" class="chip" data-t="${t}">${t}</button>`)}</div>
<form class="teacher-other" novalidate><label class="field"><span class="field-label">Atau tulis nama anda</span><input id="login-teacher-name" class="input" type="text" autocomplete="off" placeholder="Contoh: Cikgu Rahim"></label>
<button type="submit" class="btn primary">Masuk</button></form>
<button type="button" class="link-btn" data-back>${icon('left', 16)} Kembali ke bintang</button>`);
return;
}
if (!picked) { card.hidden = true; return; }
card.hidden = false;
const admin = needsPasscode(picked);
setHTML(card, html`
<form class="pick-form" novalidate>
<span class="pick-eyebrow">Selamat kembali,</span>
<h2>${personName(picked)}</h2>
${admin ? html`<label class="field"><span class="field-label">Kod admin</span><input id="login-pass" class="input input-code" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••"></label>` : ''}
<button type="submit" class="btn primary btn-lg btn-block">${icon('spark', 18)}<span>Masuk ke langit</span></button>
<button type="button" class="link-btn" data-back>Bukan saya</button>
</form>`);
const pass = card.querySelector('#login-pass');
if (pass) setTimeout(() => pass.focus(), 50);
}
async function doLogin(name, type, extra) {
const res = await login(name, type, extra);
if (!res.ok) {
toast(res.message, 'error');
const f = root.querySelector('.login-card');
if (f) { f.classList.remove('is-shake'); void f.offsetWidth; f.classList.add('is-shake'); }
return false;
}
leave();
return true;
}
function leave() {
const reduce = prefersReducedMotion();
root.classList.add('is-leaving');
if (onDone) onDone({ warp: !reduce });
setTimeout(() => { root.hidden = true; root.classList.remove('is-leaving'); picked = null; mode = 'stars'; }, reduce ? 150 : 900);
}
function initLogin(el, done) {
root = el; onDone = done;
on(root, 'click', '[data-star]', (e, s) => { picked = s.dataset.star; mode = 'stars'; renderCard(); });
on(root, 'click', '[data-back]', () => { picked = null; mode = 'stars'; renderCard(); });
on(root, 'click', '[data-teacher]', () => { picked = null; mode = 'teacher'; renderCard(); });
on(root, 'click', '[data-t]', (e, b) => doLogin(b.dataset.t, 'Cikgu'));
on(root, 'submit', '.teacher-other', e => { e.preventDefault(); const v = root.querySelector('#login-teacher-name').value.trim(); if (!v) { toast('Tulis nama anda dahulu.', 'error'); return; } doLogin(v, 'Cikgu'); });
on(root, 'submit', '.pick-form', e => {
e.preventDefault();
const pass = root.querySelector('#login-pass');
if (!pass) { doLogin(picked, 'Pelajar'); return; }
if (!pass.value.trim()) { toast('Masukkan kod admin.', 'error'); pass.focus(); return; }
const btn = root.querySelector('.pick-form button[type="submit"]');
const label = btn && btn.querySelector('span');
const was = label ? label.textContent : '';
if (btn) btn.disabled = true;
if (label) label.textContent = 'Menyemak…';
setTimeout(async () => {
if (await doLogin(picked, 'Pelajar', { passcode: pass.value })) return;
if (btn) btn.disabled = false;
if (label) label.textContent = was;
pass.value = '';
pass.focus();
}, 40);
});
root.addEventListener('keydown', e => { if (e.key === 'Escape' && (picked || mode === 'teacher')) { picked = null; mode = 'stars'; renderCard(); } });
}
function showLogin() {
if (!root) return;
picked = null; mode = 'stars';
root.hidden = false;
render();
}
function refreshLogin() {
if (!root || root.hidden) return;
const stage = root.querySelector('.login-stage');
if (!stage) return render();
const online = onlineNames();
root.querySelectorAll('.cstar').forEach(s => s.classList.toggle('is-online', online.includes(s.dataset.star)));
const p = root.querySelector('.login-online');
if (p) setHTML(p, online.length ? html`<i class="dot-live"></i>${online.length} rakan sedang aktif` : html`Langit sunyi buat masa ini`);
if (mode === 'teacher' && !root.querySelector('.teacher-chips .chip')) renderCard();
}
return { SIGMA_POINTS, constellationHTML, initLogin, showLogin, refreshLogin };
})();
const __m21 = (() => {
const { isoDate } = __m4;
const { parseISO } = __m4;
const { toMinutes } = __m4;
const { minutesToTime } = __m4;
const { timesOverlap } = __m4;
const { JS_DAYS } = __m5;
const { SCHOOL_HOURS } = __m5;
const { FRIDAY_PRAYER } = __m5;
const { SPM } = __m5;
const { findClashes } = __m9;
const { sameTeacher } = __m9;
const LATEST = 22 * 60 + 30;
function findSlots(bookings, opts) {
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
function dayHeat(bookings, iso, subject, len) {
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
return { findSlots, dayHeat };
})();
const __m20 = (() => {
const { state } = __m1;
const { createBooking } = __m1;
const { updateBooking } = __m1;
const { findBooking } = __m1;
const { now } = __m7;
const { isoDate } = __m4;
const { addDays } = __m4;
const { toMinutes } = __m4;
const { minutesToTime } = __m4;
const { timesOverlap } = __m4;
const { at } = __m4;
const { SUBJECTS } = __m5;
const { SCHOOL_HOURS } = __m5;
const { JS_DAYS } = __m5;
const { subjectColor } = __m5;
const { findClashes } = __m9;
const { defaultTeacherFor } = __m9;
const { sameTeacher } = __m9;
const { findSlots } = __m21;
const { html } = __m11;
const { setHTML } = __m11;
const { on } = __m11;
const { icon } = __m13;
const { subjectIcon } = __m13;
const { toast } = __m16;
const { openSheet } = __m14;
const { confirmDialog } = __m14;
const { dayLabel } = __m15;
const { dayPhrase } = __m15;
const { dateLong } = __m15;
const { durationText } = __m15;
const SPAN_FROM = 7 * 60, SPAN_TO = 22 * 60 + 30;
function hourTag(m) { return String(Math.floor(m / 60)).padStart(2, '0'); }
function teacherOptions(subject, selected, manualName) {
const cfg = state.config;
const primary = defaultTeacherFor(cfg, subject) || '—';
const ws = (cfg.workshopTeachers && cfg.workshopTeachers[subject]) || [];
return html`<optgroup label="Guru subjek ini"><option value="primary"${selected === 'primary' ? ' selected' : ''}>${primary}</option></optgroup>
${ws.length ? html`<optgroup label="Guru bengkel">${ws.map(n => html`<option value="${'workshop:' + n}"${selected === 'workshop:' + n ? ' selected' : ''}>${n}</option>`)}</optgroup>` : ''}
<optgroup label="Lain-lain"><option value="manual"${selected === 'manual' ? ' selected' : ''}>Guru lain…</option></optgroup>`;
}
function renderBookingForm(root, opts) {
opts = opts || {};
const editing = opts.editId ? findBooking(opts.editId) : null;
const n = now();
const p = Object.assign({}, opts.prefill || {});
if (editing) Object.assign(p, { subject: editing.subject, date: editing.date, from: editing.from, to: editing.to, notes: editing.notes || '', teacher: editing.teacher });
const f = {
subject: p.subject || '',
date: p.date || '',
from: p.from || '',
to: p.to || '',
notes: p.notes || '',
teacherSel: 'primary',
manual: ''
};
if (p.teacher && f.subject) {
const primary = defaultTeacherFor(state.config, f.subject);
const ws = (state.config.workshopTeachers[f.subject] || []);
const w = ws.find(x => sameTeacher(x, p.teacher));
if (sameTeacher(p.teacher, primary)) f.teacherSel = 'primary';
else if (w) f.teacherSel = 'workshop:' + w;
else { f.teacherSel = 'manual'; f.manual = p.teacher; }
}
const record = !!opts.record && !editing;
const uid = 'bf' + Math.random().toString(36).slice(2, 7);
setHTML(root, html`
<form class="booking" novalidate>
<div class="booking-fields">
<fieldset class="field">
<legend class="field-label">Subjek</legend>
<div class="subject-picker" role="radiogroup" aria-label="Subjek">
${SUBJECTS.map(s => html`<button type="button" role="radio" class="subj-chip${f.subject === s.name ? ' is-on' : ''}" aria-checked="${f.subject === s.name ? 'true' : 'false'}" data-subject="${s.name}" style="--c:${s.color}">${subjectIcon(s.name, 17, 'subj-ic')}${s.name}</button>`)}
</div>
</fieldset>
<div class="field-row">
<label class="field"><span class="field-label">Guru</span>
<select id="${uid}-teacher" class="input" ${f.subject ? '' : 'disabled'}>${f.subject ? teacherOptions(f.subject, f.teacherSel) : html`<option>Pilih subjek dahulu</option>`}</select>
</label>
<label class="field" ${f.teacherSel === 'manual' ? '' : 'hidden'} data-manual><span class="field-label">Nama guru</span>
<input id="${uid}-manual" class="input" type="text" autocomplete="off" placeholder="Contoh: Cikgu Rahim" value="${f.manual}">
</label>
</div>
<div class="field">
<span class="field-label" id="${uid}-dl">Tarikh</span>
<div class="date-row">
<input id="${uid}-date" class="input" type="date" aria-labelledby="${uid}-dl" value="${f.date}">
<div class="quick">${(record ? [-2, -1, 0] : [0, 1, 2]).map(i => { const d = isoDate(addDays(n, i)); return html`<button type="button" class="chip${f.date === d ? ' is-on' : ''}" data-date="${d}">${i === 0 ? 'Hari ini' : i === 1 ? 'Esok' : i === 2 ? 'Lusa' : i === -1 ? 'Semalam' : 'Kelmarin'}</button>`; })}</div>
</div>
</div>
<div class="field">
<span class="field-label">Masa</span>
<div class="time-row">
<label class="time-box"><span>Mula</span><input id="${uid}-from" class="input" type="time" step="300" value="${f.from}"></label>
<span class="time-sep" aria-hidden="true">${icon('arrow', 16)}</span>
<label class="time-box"><span>Tamat</span><input id="${uid}-to" class="input" type="time" step="300" value="${f.to}"></label>
</div>
<div class="quick dur">${[[60, '1 jam'], [90, '1j 30m'], [120, '2 jam']].map(([m, l]) => html`<button type="button" class="chip" data-dur="${m}">${l}</button>`)}</div>
</div>
<label class="field"><span class="field-label">Catatan (pilihan)</span>
<textarea id="${uid}-notes" class="input" rows="2" placeholder="Contoh: Latih tubi Kertas 2">${f.notes}</textarea>
</label>
${record ? html`<label class="check-row" data-attwrap><input type="checkbox" data-att-after checked><span><b>Tanda kehadiran selepas simpan</b><small>Untuk kelas yang sudah berlangsung.</small></span></label>` : ''}
<p class="form-error" role="alert" hidden></p>
<div class="form-actions">
${opts.inSheet ? html`<button type="button" class="btn ghost" data-cancel>Batal</button>` : ''}
<button type="submit" class="btn primary btn-lg">${icon(editing ? 'check' : 'plus', 18)}<span>${editing ? 'Kemaskini tempahan' : record ? 'Tambah kelas' : 'Simpan tempahan'}</span></button>
</div>
</div>
<aside class="booking-preview" aria-live="polite">
<div class="preview-card"></div>
<div class="preview-day"></div>
<div class="preview-status"></div>
<div class="preview-suggest"></div>
</aside>
</form>`);
const form = root.querySelector('form');
const $id = s => root.querySelector('#' + uid + '-' + s);
const tSel = $id('teacher'), manualWrap = root.querySelector('[data-manual]'), manualIn = $id('manual');
const dateIn = $id('date'), fromIn = $id('from'), toIn = $id('to'), notesIn = $id('notes');
const errEl = root.querySelector('.form-error');
function teacherName() {
if (!f.subject) return '';
if (f.teacherSel === 'primary') return defaultTeacherFor(state.config, f.subject);
if (f.teacherSel === 'manual') return (manualIn.value || '').trim();
return f.teacherSel.slice(9);
}
function preview() {
const tn = teacherName();
const color = f.subject ? subjectColor(f.subject) : '#8D93C2';
const valid = f.date && f.from && f.to && toMinutes(f.to) > toMinutes(f.from);
setHTML(root.querySelector('.preview-card'), html`<div class="pv-card${f.subject ? '' : ' is-empty'}" style="--c:${color}">
<span class="pv-mark" aria-hidden="true">${f.subject ? subjectIcon(f.subject, 132) : html`<b>Σ</b>`}</span>
<span class="pv-eyebrow">${editing ? 'Selepas dikemaskini' : record ? 'Rekod kelas' : 'Pratonton kelas'}</span>
<b class="pv-subject">${f.subject || 'Pilih subjek'}</b>
<span class="pv-teacher">${tn || 'Guru dipilih secara automatik'}</span>
<span class="pv-when">${f.date ? dateLong(f.date) : 'Pilih tarikh'}${valid ? html` · <b>${f.from}–${f.to}</b> <span class="pv-dur">(${durationText(f.from, f.to)})</span>` : ''}</span>
</div>`);
const day = f.date ? state.bookings.filter(b => !b.cancelledAt && b.date === f.date && (!editing || b.id !== editing.id)) : [];
const edges = day.map(b => [toMinutes(b.from), toMinutes(b.to)]).concat(valid ? [[toMinutes(f.from), toMinutes(f.to)]] : []);
const lo = Math.min(SPAN_FROM, ...edges.map(e => Math.floor(e[0] / 60) * 60));
const hi = Math.max(SPAN_TO, ...edges.map(e => Math.ceil(e[1] / 60) * 60));
const pct = m => ((Math.min(Math.max(m, lo), hi) - lo) / (hi - lo) * 100).toFixed(2) + '%';
const ticks = [];
for (let m = Math.ceil(lo / 180) * 180; m < hi; m += 180) ticks.push(m);
const sh = f.date ? SCHOOL_HOURS[JS_DAYS[new Date(f.date + 'T00:00:00').getDay()]] : null;
const clashes = valid ? findClashes(state.bookings, f.subject, f.date, f.from, f.to, editing ? editing.id : null) : [];
setHTML(root.querySelector('.preview-day'), f.date ? html`
<div class="pd-head"><span>${dayLabel(f.date, n)}</span><span>${day.length} kelas lain</span></div>
<div class="pd-track">
${sh ? html`<i class="pd-school" style="left:${pct(toMinutes(sh.from))};width:calc(${pct(toMinutes(sh.to))} - ${pct(toMinutes(sh.from))})" title="Waktu persekolahan"></i>` : ''}
${day.map(b => html`<i class="pd-ev" style="left:${pct(toMinutes(b.from))};width:calc(${pct(toMinutes(b.to))} - ${pct(toMinutes(b.from))});--c:${subjectColor(b.subject)}" title="${b.subject} ${b.from}–${b.to}"></i>`)}
${valid ? html`<i class="pd-new${clashes.length ? ' is-clash' : ''}" style="left:${pct(toMinutes(f.from))};width:calc(${pct(toMinutes(f.to))} - ${pct(toMinutes(f.from))})"></i>` : ''}
</div>
<div class="pd-scale">${ticks.map(m => html`<span style="left:${pct(m)}">${hourTag(m)}</span>`)}</div>` : html`<p class="pd-empty">${icon('jadual', 16)} Pilih tarikh untuk melihat hari itu.</p>`);
let status = '';
if (valid) {
const past = at(f.date, f.from) < n && !editing;
const school = sh && timesOverlap(f.from, f.to, sh.from, sh.to);
if (record && past) status = clashes.length
? html`<p class="pv-status is-clash">${icon('warn', 16)} Bertindih dengan <b>${clashes[0].subject}</b> (${clashes[0].from}–${clashes[0].to}) yang sudah direkod.</p>`
: html`<p class="pv-status is-ok">${icon('check', 16)} Kelas lepas: direkod sebagai ${at(f.date, f.to) <= n ? 'selesai' : 'sedang berlangsung'}, tanpa notifikasi.</p>`;
else if (past) status = html`<p class="pv-status is-warn">${icon('warn', 16)} Masa ini sudah lepas.</p>`;
else if (clashes.length) status = html`<p class="pv-status is-clash">${icon('warn', 16)} Bertindih dengan <b>${clashes[0].subject}</b> (${clashes[0].from}–${clashes[0].to}).</p>`;
else if (school) status = html`<p class="pv-status is-warn">${icon('info', 16)} Masa ini dalam waktu persekolahan biasa.</p>`;
else status = html`<p class="pv-status is-ok">${icon('check', 16)} Slot ini kosong. Tiada pertembungan.</p>`;
} else if (f.from && f.to) status = html`<p class="pv-status is-warn">${icon('warn', 16)} Masa tamat mesti selepas masa mula.</p>`;
setHTML(root.querySelector('.preview-status'), status);
const attWrap = root.querySelector('[data-attwrap]');
if (attWrap) attWrap.hidden = !(valid && at(f.date, f.from) <= n);
if (record && f.date && f.date <= isoDate(n)) setHTML(root.querySelector('.preview-suggest'), '');
else if (f.subject) {
const dates = f.date ? [f.date] : [0, 1, 2, 3].map(i => isoDate(addDays(n, i)));
const len = valid ? toMinutes(f.to) - toMinutes(f.from) : 60;
const slots = findSlots(state.bookings.filter(b => !editing || b.id !== editing.id), { dates, subject: f.subject, length: len, now: n, max: 3, teacher: teacherName() });
setHTML(root.querySelector('.preview-suggest'), slots.length ? html`<div class="ps-head">${icon('wand', 15)} Masa terbaik ${f.date ? (/^[a-z]/.test(dayPhrase(f.date, n)) ? dayPhrase(f.date, n) : 'pada ' + dayPhrase(f.date, n)) : 'dalam 4 hari'}</div>
<div class="ps-list">${slots.map(s => html`<button type="button" class="ps-slot" data-slot="${s.date}|${s.from}|${s.to}"><b>${f.date ? '' : dayLabel(s.date, n) + ', '}${s.from}–${s.to}</b><span>${s.why.slice(0, 2).join(', ')}</span></button>`)}</div>` : html`<p class="ps-none">Tiada masa kosong yang sesuai ${f.date ? 'pada hari ini' : 'dalam 4 hari'}.</p>`);
} else setHTML(root.querySelector('.preview-suggest'), '');
}
function setSubject(name) {
f.subject = name;
f.teacherSel = 'primary';
root.querySelectorAll('.subj-chip').forEach(c => { const on = c.dataset.subject === name; c.classList.toggle('is-on', on); c.setAttribute('aria-checked', on ? 'true' : 'false'); });
tSel.disabled = false;
setHTML(tSel, teacherOptions(name, 'primary'));
manualWrap.hidden = true;
preview();
}
function setDate(d) {
f.date = d; dateIn.value = d;
root.querySelectorAll('[data-date]').forEach(c => c.classList.toggle('is-on', c.dataset.date === d));
preview();
}
on(root, 'click', '.subj-chip', (e, el) => setSubject(el.dataset.subject));
on(root, 'click', '[data-date]', (e, el) => setDate(el.dataset.date));
on(root, 'click', '[data-dur]', (e, el) => {
if (!f.from) { f.from = '14:30'; fromIn.value = f.from; }
f.to = minutesToTime(Math.min(toMinutes(f.from) + (+el.dataset.dur), 23 * 60 + 55)); toIn.value = f.to;
preview();
});
on(root, 'click', '[data-slot]', (e, el) => {
const [d, a, b] = el.dataset.slot.split('|');
f.from = a; f.to = b; fromIn.value = a; toIn.value = b;
setDate(d);
});
tSel.addEventListener('change', () => { f.teacherSel = tSel.value; manualWrap.hidden = f.teacherSel !== 'manual'; if (!manualWrap.hidden) manualIn.focus(); preview(); });
manualIn.addEventListener('input', preview);
dateIn.addEventListener('change', () => setDate(dateIn.value));
dateIn.addEventListener('input', () => { if (dateIn.value) setDate(dateIn.value); });
fromIn.addEventListener('input', () => {
const prevLen = f.from && f.to ? toMinutes(f.to) - toMinutes(f.from) : 60;
f.from = fromIn.value;
if (f.from && (!f.to || toMinutes(f.to) <= toMinutes(f.from))) { f.to = minutesToTime(Math.min(toMinutes(f.from) + Math.max(30, prevLen), 23 * 60 + 55)); toIn.value = f.to; }
preview();
});
toIn.addEventListener('input', () => { f.to = toIn.value; preview(); });
notesIn.addEventListener('input', () => { f.notes = notesIn.value; });
const cancel = root.querySelector('[data-cancel]');
if (cancel && opts.onCancel) cancel.addEventListener('click', opts.onCancel);
form.addEventListener('submit', async e => {
e.preventDefault();
errEl.hidden = true;
const fields = { subject: f.subject, teacher: teacherName(), date: f.date, day: f.date ? JS_DAYS[new Date(f.date + 'T00:00:00').getDay()] : '', from: f.from, to: f.to, notes: (notesIn.value || '').trim() };
const fail = m => { errEl.textContent = m; errEl.hidden = false; };
if (!fields.subject) return fail('Pilih subjek dahulu.');
if (!fields.teacher) return fail(f.teacherSel === 'manual' ? 'Tulis nama guru.' : 'Subjek ini belum ada guru utama. Pilih "Guru lain".');
if (!fields.date || !fields.from || !fields.to) return fail('Pilih tarikh, masa mula dan masa tamat.');
if (toMinutes(fields.to) <= toMinutes(fields.from)) return fail('Masa tamat mesti selepas masa mula.');
const clashes = findClashes(state.bookings, fields.subject, fields.date, fields.from, fields.to, editing ? editing.id : null);
if (clashes.length) {
const go = await confirmDialog({ title: 'Slot ini bertindih', message: clashes[0].subject + ' (' + clashes[0].teacher + ') sudah ditempah ' + clashes[0].from + '–' + clashes[0].to + ' pada hari yang sama. Simpan juga?', confirmLabel: 'Simpan juga' });
if (!go) return;
}
const btn = form.querySelector('button[type=submit]');
btn.disabled = true;
const res = editing ? await updateBooking(editing.id, fields, { silent: !!opts.silent })
: await createBooking(fields, { silent: !!opts.silent || record, record });
btn.disabled = false;
if (!res.ok) return fail(res.message || 'Tempahan gagal disimpan.');
const attBox = root.querySelector('[data-att-after]'), attWrap2 = root.querySelector('[data-attwrap]');
const markAfter = !!(record && attBox && attBox.checked && attWrap2 && !attWrap2.hidden);
toast(editing ? 'Tempahan dikemaskini' : record ? 'Kelas ' + fields.subject + ' ditambah (' + dayPhrase(fields.date, now()) + ', ' + fields.from + ')' : 'Tempahan berjaya! ' + fields.subject + ', ' + dayPhrase(fields.date, now()) + ' ' + fields.from, editing ? 'info' : 'success');
if (opts.onDone) opts.onDone(editing ? findBooking(editing.id) : res.booking, { markAttendance: markAfter });
});
preview();
return { refresh: preview };
}
function openBookingSheet(o) {
o = o || {};
const s = openSheet({
title: o.editId ? (o.silent ? 'Edit kelas (senyap)' : 'Edit tempahan') : o.record ? 'Tambah kelas' : 'Tempah kelas', wide: true, cls: 'sheet-booking',
sub: o.editId ? (o.silent ? 'Perubahan dari Edit Kelas tidak menghantar notifikasi.' : 'Perubahan dihantar kepada kelas sebagai notifikasi.')
: o.record ? 'Untuk kelas yang terlupa dimasukkan, termasuk yang sudah berlangsung. Disimpan senyap, tanpa notifikasi.'
: 'Pratonton dan semakan pertembungan muncul semasa anda mengisi.',
keepFocus: true
});
renderBookingForm(s.body, Object.assign({}, o, { inSheet: true, onCancel: () => s.close(), onDone: (b, extra) => { s.close(); if (o.onDone) setTimeout(() => o.onDone(b, extra || {}), 230); } }));
return s;
}
return { renderBookingForm, openBookingSheet };
})();
const __m22 = (() => {
const { at } = __m4;
const { pad2 } = __m4;
const { dayLabel } = __m15;
const { dateLong } = __m15;
function stamp(d) {
return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + 'T' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + '00Z';
}
function googleCalendarUrl(b) {
const p = new URLSearchParams({
action: 'TEMPLATE',
text: b.subject + ' (kelas tambahan 5 Sigma)',
dates: stamp(at(b.date, b.from)) + '/' + stamp(at(b.date, b.to)),
details: 'Guru: ' + b.teacher + (b.notes ? '\n' + b.notes : '') + '\nDari 5 Sigma Class Hub'
});
return 'https://calendar.google.com/calendar/render?' + p.toString();
}
function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m); }
function icsFor(list) {
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
function whatsappText(list, title, now) {
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
function whatsappUrl(text) { return 'https://wa.me/?text=' + encodeURIComponent(text); }
function csv(rows) {
return rows.map(r => r.map(v => {
const s = v == null ? '' : String(v);
return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}).join(',')).join('\r\n');
}
function icsForPapers(list) {
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
return { googleCalendarUrl, icsFor, whatsappText, whatsappUrl, csv, icsForPapers };
})();
const __m23 = (() => {
const onClaude = !!(window.claude && typeof window.claude.use === 'function') ||
!!document.querySelector('meta[name="langit-host"][content="artifact"]');
let samplePromise = null, downloadsPromise = null;
function use(name) {
try { return (window.claude && typeof window.claude.use === 'function') ? window.claude.use(name).catch(() => null) : Promise.resolve(null); }
catch (e) { return Promise.resolve(null); }
}
function getSample() { if (!samplePromise) samplePromise = use('sample'); return samplePromise; }
function getDownloads() { if (!downloadsPromise) downloadsPromise = use('downloads'); return downloadsPromise; }
async function saveFile(filename, text, mime) {
if (onClaude) {
const dl = await getDownloads();
if (!dl) return { ok: false, message: 'Muat turun tidak tersedia di sini. Gunakan butang Salin.' };
try { await dl.save({ filename, data: text }); return { ok: true }; }
catch (e) { return { ok: false, message: e && e.code === 'declined' ? 'Muat turun dibatalkan.' : 'Fail ini tidak dapat dimuat turun di sini. Gunakan butang Salin.' }; }
}
try {
const blob = new Blob([text], { type: mime || 'text/plain' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = filename;
document.body.appendChild(a); a.click(); a.remove();
setTimeout(() => URL.revokeObjectURL(a.href), 1500);
return { ok: true };
} catch (e) { return { ok: false, message: 'Muat turun gagal.' }; }
}
async function copyText(text) {
try { await navigator.clipboard.writeText(text); return true; }
catch (e) {
try {
const ta = document.createElement('textarea');
ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
document.body.appendChild(ta); ta.select();
const ok = document.execCommand('copy'); ta.remove(); return ok;
} catch (err) { return false; }
}
}
return { onClaude, getSample, getDownloads, saveFile, copyText };
})();
const __m24 = (() => {
const { THEME_KEY } = __m5;
const { prefersReducedMotion } = __m11;
const subs = new Set();
function onTheme(fn) { subs.add(fn); return () => subs.delete(fn); }
function getTheme() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
function apply(mode) {
document.documentElement.setAttribute('data-theme', mode);
const meta = document.querySelector('meta[name="theme-color"]');
if (meta) meta.setAttribute('content', mode === 'light' ? '#EEEBF8' : '#050714');
subs.forEach(fn => fn(mode));
}
function initTheme() {
let saved = null;
try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
const host = document.documentElement.getAttribute('data-theme');
apply(saved === 'light' || saved === 'dark' ? saved : (host === 'light' ? 'light' : 'dark'));
}
function setTheme(mode, fromEl) {
if (mode === getTheme()) return;
try { localStorage.setItem(THEME_KEY, mode); } catch (e) { /* memory only */ }
if (!document.startViewTransition || prefersReducedMotion()) { apply(mode); return; }
const r = fromEl && fromEl.getBoundingClientRect ? fromEl.getBoundingClientRect() : { left: innerWidth / 2, top: 0, width: 0, height: 0 };
document.documentElement.style.setProperty('--rx', (r.left + r.width / 2) + 'px');
document.documentElement.style.setProperty('--ry', (r.top + r.height / 2) + 'px');
document.documentElement.classList.add('vt-theme');
const t = document.startViewTransition(() => apply(mode));
t.finished.finally(() => document.documentElement.classList.remove('vt-theme'));
}
function toggleTheme(fromEl) { setTheme(getTheme() === 'dark' ? 'light' : 'dark', fromEl); }
return { onTheme, getTheme, initTheme, setTheme, toggleTheme };
})();
const __m19 = (() => {
const { state } = __m1;
const { findBooking } = __m1;
const { cancelBooking } = __m1;
const { restoreBooking } = __m1;
const { startExtend } = __m1;
const { extendBy } = __m1;
const { stopExtend } = __m1;
const { saveAttendance } = __m1;
const { markAllNotificationsRead } = __m1;
const { logout } = __m1;
const { isStudent } = __m1;
const { now } = __m7;
const { nowHHMM } = __m4;
const { at } = __m4;
const { subjectColor } = __m5;
const { ATT_STATUSES } = __m5;
const { SUBJECT_ROSTERS } = __m5;
const { computeStatus } = __m9;
const { statusLabel } = __m9;
const { rosterFor } = __m9;
const { rosterForBooking } = __m9;
const { attendanceFor } = __m9;
const { streakFor } = __m9;
const { starsFrom } = __m9;
const { html } = __m11;
const { on } = __m11;
const { setHTML } = __m11;
const { icon } = __m13;
const { subjectBadge } = __m13;
const { toast } = __m16;
const { openSheet } = __m14;
const { confirmDialog } = __m14;
const { navigate } = __m10;
const { dayLabel } = __m15;
const { dateLong } = __m15;
const { durationText } = __m15;
const { minutesText } = __m15;
const { timeAgo } = __m15;
const { personName } = __m15;
const { openBookingSheet } = __m20;
const { googleCalendarUrl } = __m22;
const { whatsappText } = __m22;
const { whatsappUrl } = __m22;
const { icsFor } = __m22;
const { saveFile } = __m23;
const { copyText } = __m23;
const { onClaude } = __m23;
const { toggleTheme } = __m24;
const { getTheme } = __m24;
function statusPill(st) { return html`<span class="pill st-${st}">${st === 'ongoing' || st === 'extending' ? html`<i class="pulse"></i>` : ''}${statusLabel(st)}</span>`; }
function openClassSheet(id) {
const b0 = findBooking(id);
if (!b0) { toast('Kelas ini tidak dijumpai lagi.', 'error'); return; }
const s = openSheet({ title: b0.subject, cls: 'sheet-class', keepFocus: true, icon: subjectBadge(b0.subject, 'md', 'is-solid') });
s.el.style.setProperty('--c', subjectColor(b0.subject));
function render() {
const b = findBooking(id);
if (!b) { s.close(); return; }
const n = now();
const st = computeStatus(b, n);
const u = state.user;
const live = st === 'ongoing' || st === 'extending';
const roster = rosterFor(b.subject);
const att = b.attendance || {};
const present = roster.filter(x => att[x] === 'hadir' || att[x] === 'lewat').length;
const onTime = roster.filter(x => att[x] === 'hadir').length;
const mine = u && att[u.name];
const author = (b.autoGenerated || b.createdBy === 'JADUAL TETAP') ? '' : b.createdBy;
const leftMin = Math.max(0, Math.round((at(b.date, b.to) - n) / 60000));
const startsMin = Math.round((at(b.date, b.from) - n) / 60000);
s.setContent(html`
<div class="cs-top">
${statusPill(st)}
${b.autoGenerated ? html`<span class="pill">${icon('tetap', 13)} Jadual tetap</span>` : ''}
</div>
<div class="cs-when">
<div class="cs-time">${b.from}<span>–</span>${b.to}</div>
<div class="cs-date">${dateLong(b.date)} · ${durationText(b.from, b.to)}</div>
${live ? html`<div class="cs-live">${st === 'extending' ? 'Sedang extend' : minutesText(leftMin) + ' lagi'}</div>` : st === 'upcoming' && startsMin < 24 * 60 ? html`<div class="cs-soon">Bermula ${startsMin < 60 ? 'dalam ' + startsMin + ' minit' : 'dalam ' + minutesText(startsMin)}</div>` : ''}
</div>
<dl class="cs-facts">
<div><dt>Guru</dt><dd>${b.teacher}</dd></div>
${b.notes ? html`<div><dt>Catatan</dt><dd>${b.notes}</dd></div>` : ''}
${author ? html`<div><dt>${b.recorded ? 'Direkod oleh' : 'Ditempah oleh'}</dt><dd>${personName(author)}${b.updatedBy ? html`<span class="muted"> · dikemaskini oleh ${personName(b.updatedBy)}</span>` : ''}</dd></div>` : ''}
${(b.extensionHistory || []).length ? html`<div><dt>Extend</dt><dd>${b.extensionHistory.map(x => html`<span class="ext-chip">${x.fixed ? '+' + x.fixed + ' min' : 'hingga ' + (x.extendedUntil || 'dihentikan')}</span>`)}<span class="muted"> · asal tamat ${b.originalTo || b.to}</span></dd></div>` : ''}
${st !== 'upcoming' && Object.keys(att).length ? html`<div><dt>Kehadiran</dt><dd><b>${present}/${roster.length}</b> hadir<span class="muted"> · ${onTime} bintang skibidi</span>${mine ? html`<span class="att-me t-${mine}">Anda: ${mine === 'tidak' ? 'tidak hadir' : mine}${mine === 'hadir' ? ', +1 bintang skibidi' : mine === 'lewat' ? ', tiada bintang' : ''}</span>` : ''}</dd></div>` : ''}
${SUBJECT_ROSTERS[b.subject] ? html`<div><dt>Senarai</dt><dd>${roster.length} pelajar (${b.subject} sahaja)</dd></div>` : ''}
</dl>
<div class="cs-actions">
${live && u ? (st === 'extending'
? html`<button type="button" class="btn danger" data-a="stopext">${icon('clock', 18)}<span>Hentikan extend</span></button>`
: html`<button type="button" class="btn ghost" data-a="extend">${icon('clock', 18)}<span>Extend kelas</span></button>`) : ''}
${(live || (st === 'upcoming' && startsMin < 120)) ? html`<button type="button" class="btn ghost" data-a="display">${icon('display', 18)}<span>Paparan kelas</span></button>` : ''}
${state.isAdmin && st !== 'cancelled' ? html`<button type="button" class="btn ghost" data-a="att">${icon('check', 18)}<span>Kehadiran</span></button>` : ''}
${u && st !== 'cancelled' && st !== 'ended' ? html`<button type="button" class="btn ghost" data-a="edit">${icon('kelas', 18)}<span>Edit</span></button>` : ''}
${u && st === 'upcoming' ? html`<button type="button" class="btn ghost danger-text" data-a="cancel">${icon('trash', 18)}<span>Batal</span></button>` : ''}
${u && st === 'cancelled' && state.isAdmin ? html`<button type="button" class="btn ghost" data-a="restore">${icon('undo', 18)}<span>Pulihkan</span></button>` : ''}
</div>
${st === 'upcoming' ? html`<div class="cs-share">
<a class="link-btn" href="${googleCalendarUrl(b)}" target="_blank" rel="noopener">${icon('calplus', 16)} Google Calendar</a>
<a class="link-btn" href="${whatsappUrl(whatsappText([b], 'Kelas tambahan 5 Sigma', n))}" target="_blank" rel="noopener">${icon('whatsapp', 16)} Kongsi WhatsApp</a>
${onClaude ? '' : html`<button type="button" class="link-btn" data-a="ics">${icon('download', 16)} Fail .ics</button>`}
</div>` : ''}`);
}
render();
const unsubscribeTimer = setInterval(render, 30000);
const prevClose = s.close;
s.close = v => { clearInterval(unsubscribeTimer); prevClose(v); };
on(s.body, 'click', '[data-a]', async (e, el) => {
const a = el.dataset.a;
const b = findBooking(id);
if (!b) return;
if (a === 'extend') { s.close(); openExtendSheet(id); }
else if (a === 'stopext') { s.close(); openStopExtendSheet(id); }
else if (a === 'display') { s.close(); navigate('paparan'); }
else if (a === 'att') { s.close(); openAttendanceSheet(id); }
else if (a === 'edit') { s.close(); openBookingSheet({ editId: id }); }
else if (a === 'cancel') { s.close(); startCancel(id); }
else if (a === 'restore') { const r = await restoreBooking(id); toast(r.ok ? 'Kelas dipulihkan' : r.message, r.ok ? 'success' : 'error'); render(); }
else if (a === 'ics') { const r = await saveFile('kelas-' + b.subject.toLowerCase().replace(/\s+/g, '-') + '-' + b.date + '.ics', icsFor([b]), 'text/calendar'); if (!r.ok) toast(r.message, 'error'); }
});
return s;
}
async function startCancel(id, opts) {
const b = findBooking(id);
if (!b) return;
const ok = await confirmDialog({ title: 'Batalkan ' + b.subject + '?', message: dayLabel(b.date, now()) + ', ' + b.from + '–' + b.to + ' bersama ' + b.teacher + '. Rakan sekelas akan dimaklumkan.', confirmLabel: 'Ya, batalkan', cancelLabel: 'Kekalkan', tone: 'danger' });
if (!ok) return;
const res = await cancelBooking(id, opts);
if (!res.ok) { toast(res.message, 'error'); return; }
toast(b.subject + ' dibatalkan', { type: 'warning', action: { label: 'Buat asal', run: async () => { const r = await restoreBooking(id); toast(r.ok ? 'Pembatalan diundur' : r.message, r.ok ? 'success' : 'error'); } } });
}
function openExtendSheet(id) {
const b = findBooking(id);
if (!b) return;
const s = openSheet({ title: 'Extend ' + b.subject, sub: 'Kelas kini tamat ' + b.to + '. Pilih tempoh tambahan, atau extend sehingga anda hentikan.', cls: 'is-dialog', keepFocus: true,
content: html`<div class="ext-grid">${[15, 30, 45, 60].map(m => html`<button type="button" class="choice" data-m="${m}"><b>+${m} min</b><span>hingga ${addMin(b.to, m)}</span></button>`)}</div>
<button type="button" class="btn ghost btn-block" data-open>${icon('clock', 16)} Extend tanpa had (hentikan kemudian)</button>
<p class="form-error" role="alert" hidden></p>` });
const err = s.body.querySelector('.form-error');
on(s.body, 'click', '[data-m]', async (e, el) => {
el.disabled = true;
const r = await extendBy(id, +el.dataset.m);
el.disabled = false;
if (!r.ok) { err.textContent = r.message; err.hidden = false; return; }
s.close(); toast(b.subject + ' dilanjutkan hingga ' + r.to, 'success');
});
s.body.querySelector('[data-open]').addEventListener('click', async () => {
const r = await startExtend(id);
if (!r.ok) { err.textContent = r.message; err.hidden = false; return; }
s.close(); toast('Kelas ' + b.subject + ' sedang di-extend', 'success');
});
}
function addMin(t, m) { const [h, mm] = t.split(':').map(Number); const v = Math.min(h * 60 + mm + m, 1439); return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0'); }
function openStopExtendSheet(id) {
const b = findBooking(id);
if (!b) return;
const s = openSheet({ title: 'Hentikan extend', sub: 'Masukkan waktu ' + b.subject + ' sebenarnya tamat.', cls: 'is-dialog', keepFocus: true,
content: html`<form class="dialog-form"><label class="field"><span class="field-label">Tamat pada</span><input id="stopext-time" class="input" type="time" value="${nowHHMM(now())}"></label>
<p class="form-error" role="alert" hidden></p>
<div class="sheet-actions"><button type="button" class="btn ghost" data-x>Batal</button><button type="submit" class="btn primary">Hentikan</button></div></form>` });
const err = s.body.querySelector('.form-error');
s.body.querySelector('[data-x]').addEventListener('click', () => s.close());
s.body.querySelector('form').addEventListener('submit', async e => {
e.preventDefault();
const r = await stopExtend(id, s.body.querySelector('input').value);
if (!r.ok) { err.textContent = r.message; err.hidden = false; return; }
s.close(); toast('Extend dihentikan', 'info');
});
}
function openAttendanceSheet(id) {
const b = findBooking(id);
if (!b || !state.isAdmin) return;
const draft = Object.assign({}, b.attendance || {});
const roster = rosterForBooking(b);
const s = openSheet({ title: 'Kehadiran ' + b.subject, sub: dateLong(b.date) + ', ' + b.from + '–' + b.to, wide: false, cls: 'sheet-att', keepFocus: true, icon: subjectBadge(b.subject, 'md') });
function render() {
const counts = { hadir: 0, lewat: 0, dikecualikan: 0, tidak: 0 };
roster.forEach(nm => { if (draft[nm]) counts[draft[nm]]++; });
const marked = roster.filter(nm => draft[nm]).length;
s.setContent(html`
<div class="att-head">
<div class="att-tally">${ATT_STATUSES.map(x => html`<span class="tally t-${x.id}"><i></i>${x.label} <b>${counts[x.id]}</b></span>`)}</div>
<button type="button" class="btn ghost sm" data-all>${icon('check', 15)} Semua hadir</button>
</div>
<p class="muted att-note">${marked}/${roster.length} ditanda${SUBJECT_ROSTERS[b.subject] ? ' · senarai khas ' + b.subject : ''}. Tekan sekali lagi untuk kosongkan.</p>
<p class="att-rule">${icon('star', 14)}<span><b>Hadir</b> (tepat masa) dapat 1 bintang skibidi. <b>Lewat</b> tidak dapat bintang.</span></p>
<div class="att-list">${roster.map(nm => {
return html`<div class="att-row"><span class="att-name">${personName(nm)}${draft[nm] === 'hadir' ? html`<small class="att-star">${icon('star', 12)} bintang skibidi</small>` : ''}</span>
<span class="seg" role="group" aria-label="Status ${nm}">${ATT_STATUSES.map(x => html`<button type="button" class="${draft[nm] === x.id ? 'is-on t-' + x.id : ''}" data-who="${nm}" data-v="${x.id}" title="${x.label}" aria-pressed="${draft[nm] === x.id ? 'true' : 'false'}">${x.short}</button>`)}</span></div>`;
})}</div>
<p class="form-error" role="alert" hidden></p>
<div class="sheet-actions"><button type="button" class="btn ghost" data-x>Tutup</button><button type="button" class="btn primary" data-save>Simpan kehadiran</button></div>`);
}
render();
on(s.body, 'click', '[data-who]', (e, el) => {
const nm = el.dataset.who, v = el.dataset.v;
if (draft[nm] === v) delete draft[nm]; else draft[nm] = v;
const y = s.body.querySelector('.att-list').scrollTop; render(); s.body.querySelector('.att-list').scrollTop = y;
});
on(s.body, 'click', '[data-all]', () => { roster.forEach(nm => { if (!draft[nm]) draft[nm] = 'hadir'; }); render(); });
on(s.body, 'click', '[data-x]', () => s.close());
on(s.body, 'click', '[data-save]', async (e, el) => {
el.disabled = true;
const r = await saveAttendance(id, draft);
el.disabled = false;
if (!r.ok) { const er = s.body.querySelector('.form-error'); er.textContent = r.message; er.hidden = false; return; }
s.close(); toast('Kehadiran disimpan', 'success');
});
}
const NOTIF_IC = { BOOKING_CREATED: 'tempah', CLASS_STARTED: 'clock', EXTENSION_STARTED: 'clock', EXTENSION_STOPPED: 'clock', BOOKING_UPDATED: 'kelas', BOOKING_CANCELLED: 'trash' };
function openNotifications() {
const s = openSheet({ title: 'Notifikasi', cls: 'sheet-notif', keepFocus: true });
function render() {
const list = state.notifications;
const unread = list.filter(x => !x.read).length;
const canDevice = !onClaude && 'Notification' in window && Notification.permission === 'default';
s.setContent(html`
<div class="notif-tools"><span class="muted">${unread ? unread + ' belum dibaca' : 'Semua sudah dibaca'}</span>
${unread ? html`<button type="button" class="btn ghost sm" data-mark>${icon('check', 15)} Tandakan semua dibaca</button>` : ''}</div>
${canDevice ? html`<button type="button" class="banner-btn" data-enable>${icon('bell', 16)} Terima notifikasi pada peranti ini juga</button>` : ''}
<div class="notif-list">${list.length ? list.map(x => html`<div class="notif${x.read ? '' : ' is-unread'}"><span class="notif-ic t-${(x.type || '').toLowerCase()}">${icon(NOTIF_IC[x.type] || 'bell', 16)}</span>
<div><b>${x.title}</b>${x.body ? html`<p>${x.body}</p>` : ''}<time>${timeAgo(x.createdAt, Date.now())}</time></div></div>`) : html`<div class="empty"><b>Tiada notifikasi lagi</b><p>Tempahan baharu, perubahan dan kelas yang bermula akan muncul di sini.</p></div>`}</div>`);
}
render();
on(s.body, 'click', '[data-mark]', async () => { const r = await markAllNotificationsRead(); if (r.ok) toast(r.count + ' notifikasi ditanda dibaca', 'success'); setTimeout(render, 60); });
on(s.body, 'click', '[data-enable]', async () => { try { const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Notifikasi peranti diaktifkan' : 'Notifikasi peranti tidak dibenarkan', p === 'granted' ? 'success' : 'info'); } catch (e) { /* ignore */ } render(); });
return s;
}
function openProfile() {
const u = state.user;
if (!u) return;
const rec = state.users[u.name];
const n = now();
const student = isStudent();
const a = student ? attendanceFor(state.bookings, u.name) : null;
const s = openSheet({ title: personName(u.name), sub: (state.isAdmin ? 'Pelajar · Admin' : u.type) + (rec && rec.lastLoginAt ? ' · log masuk ' + timeAgo(rec.lastLoginAt.getTime(), n.getTime()) : ''), cls: 'is-dialog sheet-profile', keepFocus: true,
content: html`
${student && a && a.total ? html`<div class="prof-stats"><div><b>${a.rate}%</b><span>kehadiran</span></div><div><b>${starsFrom(a.counts)}</b><span>bintang skibidi</span></div><div><b>${streakFor(state.bookings, u.name, n)}</b><span>streak tepat masa</span></div></div>` : ''}
<div class="menu-list">
<button type="button" data-a="theme">${icon(getTheme() === 'dark' ? 'sun' : 'moon', 18)}<span>${getTheme() === 'dark' ? 'Tema subuh (cerah)' : 'Tema malam (gelap)'}</span></button>
<button type="button" data-a="notif">${icon('bell', 18)}<span>Notifikasi</span></button>
<button type="button" data-a="display">${icon('display', 18)}<span>Paparan kelas</span></button>
<button type="button" data-a="tetapan">${icon('tetapan', 18)}<span>Tetapan</span></button>
<button type="button" data-a="logout" class="danger-text">${icon('logout', 18)}<span>Log keluar</span></button>
</div>` });
on(s.body, 'click', '[data-a]', (e, el) => {
const a2 = el.dataset.a;
if (a2 === 'theme') { s.close(); setTimeout(() => toggleTheme(el), 210); }
else if (a2 === 'notif') { s.close(); openNotifications(); }
else if (a2 === 'display') { s.close(); navigate('paparan'); }
else if (a2 === 'tetapan') { s.close(); navigate('tetapan'); }
else if (a2 === 'logout') { s.close(); logout(); }
});
}
function openShareSheet(list, title) {
const n = now();
const text = whatsappText(list, title, n);
const s = openSheet({ title: 'Kongsi jadual', sub: list.length + ' kelas · ' + title, cls: 'sheet-share', keepFocus: true,
content: html`<pre class="share-preview">${text}</pre>
<div class="share-actions">
<a class="btn primary" href="${whatsappUrl(text)}" target="_blank" rel="noopener">${icon('whatsapp', 18)}<span>Hantar ke WhatsApp</span></a>
<button type="button" class="btn ghost" data-copy>${icon('list', 18)}<span>Salin teks</span></button>
${onClaude ? '' : html`<button type="button" class="btn ghost" data-ics>${icon('calplus', 18)}<span>Fail kalendar (.ics)</span></button>`}
</div>` });
on(s.body, 'click', '[data-copy]', async () => { toast(await copyText(text) ? 'Jadual disalin. Tampal dalam kumpulan kelas.' : 'Tidak dapat menyalin. Pilih teks dan salin secara manual.', 'success'); });
on(s.body, 'click', '[data-ics]', async () => { const r = await saveFile('jadual-5sigma.ics', icsFor(list), 'text/calendar'); if (!r.ok) toast(r.message, 'error'); });
}
function liveBookings() {
const n = now();
return state.bookings.filter(b => { const st = computeStatus(b, n); return st === 'ongoing' || st === 'extending'; });
}
return { statusPill, openClassSheet, startCancel, openExtendSheet, openStopExtendSheet, openAttendanceSheet, openNotifications, openProfile, openShareSheet, liveBookings };
})();
const __m26 = (() => {
const { prefersReducedMotion } = __m11;
const { rafThrottle } = __m4;
function countUp(scope) {
if (prefersReducedMotion()) return;
(scope || document).querySelectorAll('[data-count]').forEach(el => {
const target = parseInt(el.getAttribute('data-count'), 10);
if (!target || isNaN(target)) return;
const dur = 900, t0 = performance.now();
const step = t => {
const k = Math.min(1, (t - t0) / dur);
el.textContent = String(Math.round(target * (1 - Math.pow(1 - k, 3))));
if (k < 1) requestAnimationFrame(step);
};
el.textContent = '0';
requestAnimationFrame(step);
});
}
function initSpotlight() {
if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches || prefersReducedMotion()) return;
let lastTile = null;
const move = rafThrottle(e => {
const t = e.target && e.target.closest ? e.target.closest('.tile, .glass-hover') : null;
if (lastTile && lastTile !== t) lastTile.classList.remove('is-lit');
lastTile = t;
if (!t) return;
const r = t.getBoundingClientRect();
t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
t.style.setProperty('--my', (e.clientY - r.top) + 'px');
t.classList.add('is-lit');
});
document.addEventListener('pointermove', move, { passive: true });
document.addEventListener('pointerleave', () => { if (lastTile) lastTile.classList.remove('is-lit'); });
}
const MOTION_KEY = 'langit5s-motion';
const motionSubs = new Set();
function onMotionChange(fn) { motionSubs.add(fn); return () => motionSubs.delete(fn); }
function motionReduced() { return document.documentElement.dataset.motion === 'reduce'; }
function setReducedMotion(on) {
if (on) document.documentElement.dataset.motion = 'reduce'; else delete document.documentElement.dataset.motion;
try { if (on) localStorage.setItem(MOTION_KEY, 'reduce'); else localStorage.removeItem(MOTION_KEY); } catch (e) { /* per-viewer nicety */ }
motionSubs.forEach(fn => fn(!!on));
}
function initMotion() {
let v = null;
try { v = localStorage.getItem(MOTION_KEY); } catch (e) { v = null; }
if (v === 'reduce') document.documentElement.dataset.motion = 'reduce';
}
return { countUp, initSpotlight, onMotionChange, motionReduced, setReducedMotion, initMotion };
})();
const __m25 = (() => {
const { state } = __m1;
const { isStudent } = __m1;
const { now } = __m7;
const { isoDate } = __m4;
const { parseISO } = __m4;
const { addDays } = __m4;
const { daysBetween } = __m4;
const { at } = __m4;
const { SPM } = __m5;
const { SUBJECTS } = __m5;
const { SUBJECT_ROSTERS } = __m5;
const { subjectColor } = __m5;
const { subjectShort } = __m5;
const { html } = __m11;
const { setHTML } = __m11;
const { on } = __m11;
const { icon } = __m13;
const { subjectIcon } = __m13;
const { subjectBadge } = __m13;
const { toast } = __m16;
const { dayName } = __m15;
const { dateShort } = __m15;
const { durationText } = __m15;
const { rangeShort } = __m15;
const { dateDayMonth } = __m15;
const { icsForPapers } = __m22;
const { saveFile } = __m23;
const { onClaude } = __m23;
const { copyText } = __m23;
const { countUp } = __m26;
const v = { scope: 'kelas', subject: '' };
let root = null;
function paperFor(p, user) {
if (!p.subject) return false;
const r = SUBJECT_ROSTERS[p.subject];
if (!r || !user || !isStudent()) return true;
return r.includes(user.name);
}
function classPapers() {
const u = state.user;
return SPM.papers.filter(p => paperFor(p, u)).sort(byTime);
}
function byTime(a, b) { return (a.date + (a.from || '00:00')).localeCompare(b.date + (b.from || '00:00')) || a.code.localeCompare(b.code); }
const endOf = p => p.to ? at(p.dateTo, p.to) : at(p.dateTo, '23:59');
const startOf = p => p.from ? at(p.date, p.from) : at(p.date, '00:00');
function nextPaper(list, n) { return list.find(p => endOf(p) > n) || null; }
function kindLabel(p) {
return p.kind === 'lisan' ? 'Ujian lisan' : p.kind === 'amali' ? 'Ujian amali' : p.kind === 'mendengar' ? 'Ujian mendengar' : 'Bertulis';
}
function writtenWeek(iso) {
if (iso < SPM.writtenStart || iso > SPM.writtenEnd) return 0;
return Math.floor(daysBetween(SPM.writtenStart, iso) / 7) + 1;
}
function relDay(iso, isoTo, todayISO) {
if (isoTo < todayISO) return { cls: 'is-past', text: 'Selesai' };
if (iso <= todayISO && isoTo >= todayISO) return { cls: 'is-today', text: iso === isoTo ? 'Hari ini' : 'Sedang berlangsung' };
const d = daysBetween(todayISO, iso);
return { cls: '', text: d === 1 ? 'Esok' : d + ' hari lagi' };
}
function rangeText(p) {
if (p.date === p.dateTo) return dayName(p.date) + ', ' + dateShort(p.date);
return rangeShort(p.date, p.dateTo);
}
function phases(n) {
const today = isoDate(n);
const from = [isoDate(addDays(n, -3)), '2026-10-19'].sort()[0], to = '2026-12-20';
const span = daysBetween(from, to);
const x = iso => Math.max(0, Math.min(100, daysBetween(from, iso) / span * 100));
const items = [
{ label: 'Bertutur BM', from: '2026-10-26', to: '2026-10-29', cls: 'p-oral', subject: 'Bahasa Melayu' },
{ label: 'Bertutur BI', from: '2026-11-02', to: '2026-11-05', cls: 'p-oral', subject: 'English' },
{ label: 'Amali', from: '2026-11-16', to: '2026-11-18', cls: 'p-lab', subject: 'Kimia' },
{ label: 'Bertulis', from: SPM.writtenStart, to: SPM.writtenEnd, cls: 'p-written' }
];
return html`<div class="spm-phases" role="img" aria-label="Fasa SPM 2026: Ujian Bertutur, Ujian Amali, kemudian peperiksaan bertulis">
<div class="ph-track">
${items.map(it => html`<span class="ph ${it.cls}${it.to < today ? ' is-done' : ''}" style="left:${x(it.from).toFixed(2)}%;width:${Math.max(1.6, x(it.to) - x(it.from) + 1.2).toFixed(2)}%"></span>`)}
${today >= from && today <= to ? html`<i class="ph-now" style="left:${x(today).toFixed(2)}%"><em>Hari ini</em></i>` : ''}
</div>
<div class="ph-labels">${items.map(it => html`<span class="ph-l ${it.cls}" style="left:${x(it.from).toFixed(2)}%"><b>${it.label}</b><small>${rangeShort(it.from, it.to)}</small></span>`)}</div>
</div>`;
}
function heroHTML(list, n) {
const today = isoDate(n);
const nx = nextPaper(list, n);
const toWritten = daysBetween(today, SPM.writtenStart);
const mine = list.filter(p => p.subject);
const labs = SPM.papers.filter(p => p.kind === 'amali' && p.subject);
return html`<section class="tile spm-hero">
<div class="spm-hero-main">
${nx ? (() => {
const live = startOf(nx) <= n;
const d = daysBetween(today, nx.date);
return html`<span class="eyebrow">${icon('clock', 16)} ${live ? 'Sedang berlangsung' : 'Kertas seterusnya'}</span>
<div class="spm-next-row" style="--c:${subjectColor(nx.subject)}">${subjectBadge(nx.subject, 'lg', 'is-solid')}
<div><b class="spm-next-name">${nx.name}</b><span class="spm-next-paper">${nx.paper} · ${nx.code}</span>
<span class="spm-next-when">${rangeText(nx)}${nx.from ? ', ' + nx.from + '–' + nx.to : ' · masa mengikut jadual sekolah'}</span></div></div>
<p class="spm-next-count">${live ? html`<b>Hari ini</b>` : d <= 0 ? html`<b>Hari ini</b>` : html`<b data-count="${d}">${d}</b> hari lagi`}</p>`;
})() : html`<span class="eyebrow">${icon('star', 16)} SPM 2026</span><h3>Semua kertas sudah selesai. Tahniah, 5 Sigma!</h3>`}
</div>
<div class="spm-hero-side">
<div class="spm-big"><b data-count="${Math.max(0, toWritten)}">${Math.max(0, toWritten)}</b><span>hari lagi ke<br>kertas bertulis pertama</span></div>
<p class="muted spm-hero-facts">${mine.length} kertas${isStudent() ? ' anda' : ' kelas ini'} · bertulis ${dateShort(SPM.writtenStart)}–${dateShort(SPM.writtenEnd)} · amali ${labs.map(p => subjectShort(p.subject) + ' ' + dateShort(p.date).split(' ')[0]).join(', ')} Nov</p>
</div>
${phases(n)}
</section>`;
}
function rowHTML(p, n, nx) {
const cls = p.subject ? '' : ' is-other';
const done = endOf(p) <= n;
const isNext = nx && p === nx;
return html`<div class="spm-row${cls}${done ? ' is-done' : ''}${isNext ? ' is-next' : ''}" style="--c:${p.subject ? subjectColor(p.subject) : 'var(--ink-3)'}">
${p.subject ? subjectBadge(p.subject, 'md') : html`<span class="sicon s-md is-plain" aria-hidden="true">${icon('subjek', 17)}</span>`}
<span class="spm-time">${p.from ? html`<b>${p.from}</b><span>${p.to}</span>` : html`<b>${p.kind === 'lisan' ? 'Lisan' : 'Amali'}</b><span>${p.date === p.dateTo ? 'sehari' : '4 hari'}</span>`}</span>
<span class="spm-main"><b>${p.name}</b><span>${p.paper}${p.from ? ' · ' + durationText(p.from, p.to) : ' · masa ditetapkan sekolah'}</span></span>
<span class="spm-meta">${isNext ? html`<span class="pill gold">Seterusnya</span>` : done ? html`<span class="pill st-ended">Selesai</span>` : ''}<code>${p.code}</code></span>
</div>`;
}
function listHTML(list, n) {
const today = isoDate(n);
const nx = nextPaper(list.filter(p => p.subject), n);
const groups = [];
list.forEach(p => {
const key = p.date + '|' + p.dateTo;
let g = groups[groups.length - 1];
if (!g || g.key !== key) { g = { key, date: p.date, dateTo: p.dateTo, items: [] }; groups.push(g); }
g.items.push(p);
});
if (!groups.length) return html`<div class="empty"><b>Tiada kertas</b><p>Cuba buang penapis subjek.</p></div>`;
let lastWeek = -1;
return html`<div class="spm-list">${groups.map(g => {
const rel = relDay(g.date, g.dateTo, today);
const wk = writtenWeek(g.date);
const weekHead = wk && wk !== lastWeek ? html`<div class="spm-week"><span>Minggu ${wk} bertulis</span></div>` : '';
lastWeek = wk || lastWeek;
const kinds = Array.from(new Set(g.items.map(kindLabel)));
return html`${weekHead}<section class="spm-day ${rel.cls}">
<header class="spm-date">
<span class="spm-cal"><small>${dayName(g.date).slice(0, 3)}</small><b>${parseISO(g.date).getDate()}${g.date !== g.dateTo ? '–' + parseISO(g.dateTo).getDate() : ''}</b><small>${dateShort(g.date).split(' ')[1]}</small></span>
<span class="spm-date-main"><b>${g.date === g.dateTo ? dateDayMonth(g.date) : rangeText(g.items[0])}</b><span>${kinds.join(' · ')} · ${g.items.length} kertas</span></span>
<span class="spm-rel">${rel.text}</span>
</header>
<div class="spm-rows">${g.items.map(p => rowHTML(p, n, nx))}</div>
</section>`;
})}</div>`;
}
function filtersHTML() {
if (v.scope !== 'kelas') return '';
return html`<div class="jd-subjects spm-filter" role="group" aria-label="Tapis mengikut subjek">
<button type="button" class="chip${v.subject ? '' : ' is-on'}" data-sf="">Semua subjek</button>
${SUBJECTS.filter(s => classPapers().some(p => p.subject === s.name)).map(s => html`<button type="button" class="chip chip-subj${v.subject === s.name ? ' is-on' : ''}" data-sf="${s.name}" style="--c:${s.color}">${subjectIcon(s.name, 15)}${s.short}</button>`)}
</div>`;
}
function paint(entering) {
if (!root) return;
const n = now();
const mine = classPapers();
const list = v.scope === 'semua' ? SPM.papers.slice().sort(byTime) : mine.filter(p => !v.subject || p.subject === v.subject);
const scrollY = window.scrollY;
setHTML(root, html`
<div class="page-head"><div><h2 class="page-title">Jadual SPM 2026</h2>
<p class="page-sub">${v.scope === 'semua' ? 'Setiap kertas SPM 2026 untuk semua mata pelajaran. Kertas kelas ini bertanda simbol subjek.' : isStudent() ? 'Setiap kertas anda, dari Ujian Bertutur hingga kertas terakhir. Setiap amali sains ada harinya sendiri.' : 'Setiap kertas kelas 5 Sigma, dari Ujian Bertutur hingga kertas terakhir. Setiap amali sains ada harinya sendiri.'}</p></div>
<div class="page-tools">
<div class="seg seg-lg" role="tablist" aria-label="Kertas yang ditunjuk">
<button type="button" role="tab" data-scope="kelas" class="${v.scope === 'kelas' ? 'is-on' : ''}" aria-selected="${v.scope === 'kelas' ? 'true' : 'false'}">${icon('pengguna', 15)}<span>${isStudent() ? 'Kertas saya' : 'Kelas 5 Sigma'}</span></button>
<button type="button" role="tab" data-scope="semua" class="${v.scope === 'semua' ? 'is-on' : ''}" aria-selected="${v.scope === 'semua' ? 'true' : 'false'}">${icon('list', 15)}<span>Semua kertas</span></button>
</div>
<button type="button" class="btn ghost" data-spm-cal>${icon('calplus', 17)}<span>${onClaude ? 'Salin jadual' : 'Simpan ke kalendar'}</span></button>
</div></div>
${heroHTML(mine, n)}
${filtersHTML()}
${listHTML(list, n)}
<p class="spm-source">${icon('info', 14)} Sumber: ${SPM.source}. Sahkan kertas anda dengan kenyataan kemasukan (slip pendaftaran) SPM. Ujian Bertutur dan Ujian Amali dijalankan di sekolah mengikut jadual yang ditetapkan sekolah.</p>`);
if (entering) countUp(root); else window.scrollTo(0, scrollY);
}
function textVersion(list) {
const lines = ['*Jadual SPM 2026 · 5 Sigma*', ''];
let last = '';
list.forEach(p => {
const d = rangeText(p);
if (d !== last) { lines.push('*' + d + '*'); last = d; }
lines.push('• ' + (p.from ? p.from + '–' + p.to + '  ' : '') + p.name + ', ' + p.paper + ' (' + p.code + ')');
});
lines.push('', 'Sumber: Lembaga Peperiksaan, KPM');
return lines.join('\n');
}
const spmView = {
id: 'spm',
render(el, params, ctx) {
root = el;
if (params && params.subject) { v.scope = 'kelas'; v.subject = params.subject; }
else if (ctx && ctx.entering) v.subject = '';
paint(!!(ctx && ctx.entering));
if (el.dataset.wired) return;
el.dataset.wired = '1';
on(el, 'click', '[data-scope]', (e, b) => { v.scope = b.dataset.scope; if (v.scope === 'semua') v.subject = ''; paint(false); });
on(el, 'click', '[data-sf]', (e, b) => { v.subject = b.dataset.sf; paint(false); });
on(el, 'click', '[data-spm-cal]', async () => {
const list = classPapers();
if (onClaude) { toast(await copyText(textVersion(list)) ? 'Jadual SPM disalin. Tampal dalam nota atau kumpulan kelas.' : 'Tidak dapat menyalin di sini.', 'success'); return; }
const r = await saveFile('jadual-spm-2026-5sigma.ics', icsForPapers(list), 'text/calendar');
if (r.ok) toast(list.length + ' kertas SPM sedia untuk kalendar', 'success'); else toast(r.message, 'error');
});
},
update(reason) { if (reason === 'tick' || reason === 'session') paint(false); }
};
return { paperFor, classPapers, nextPaper, spmView };
})();
const __m18 = (() => {
const { state } = __m1;
const { isStudent } = __m1;
const { now } = __m7;
const { onSecond } = __m7;
const { isoDate } = __m4;
const { addDays } = __m4;
const { startOfWeek } = __m4;
const { toMinutes } = __m4;
const { at } = __m4;
const { pad2 } = __m4;
const { subjectColor } = __m5;
const { SPM } = __m5;
const { SCHOOL_HOURS } = __m5;
const { JS_DAYS } = __m5;
const { STUDENT_NAMES } = __m5;
const { computeStatus } = __m9;
const { sortByTime } = __m9;
const { rosterFor } = __m9;
const { attendanceFor } = __m9;
const { attendanceOverall } = __m9;
const { streakFor } = __m9;
const { starsFrom } = __m9;
const { onTimeNames } = __m9;
const { atRiskStudents } = __m9;
const { html } = __m11;
const { setHTML } = __m11;
const { on } = __m11;
const { icon } = __m13;
const { subjectBadge } = __m13;
const { subjectIcon } = __m13;
const { navigate } = __m10;
const { dayLabel } = __m15;
const { dayPhrase } = __m15;
const { dateShort } = __m15;
const { rangeShort } = __m15;
const { minutesText } = __m15;
const { greeting } = __m15;
const { firstName } = __m15;
const { personName } = __m15;
const { timeAgo } = __m15;
const { dateLong } = __m15;
const { openClassSheet } = __m19;
const { openAttendanceSheet } = __m19;
const { openExtendSheet } = __m19;
const { openStopExtendSheet } = __m19;
const { constellationHTML } = __m17;
const { classPapers } = __m25;
const { nextPaper } = __m25;
const { countUp } = __m26;
let root = null, stopTick = null, ask = () => {};
function setDashboardAsk(fn) { ask = fn; }
const ACT_IC = { LOGIN: 'user', LOGOUT: 'logout', CREATE_BOOKING: 'tempah', UPDATE_BOOKING: 'kelas', DELETE_BOOKING: 'trash', UPDATE_TEACHER: 'tetapan' };
function daysTo(iso, today) { return Math.round((new Date(iso + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000); }
function skeleton() {
return html`<div class="bento is-loading" aria-busy="true">${['t-hero', 't-now', 't-next', 't-spm', 't-stars', 't-today', 't-week', 't-up'].map(c => html`<div class="tile skel ${c}"><i></i><i></i><i></i></div>`)}</div>`;
}
function heroTile(n) {
const u = state.user;
const today = isoDate(n);
const todays = state.bookings.filter(b => !b.cancelledAt && b.date === today);
const left = todays.filter(b => computeStatus(b, n) !== 'ended').length;
return html`<h2 class="hero-hi">${greeting(n.getHours())}, <span>${u ? firstName(u.name) : ''}</span></h2>
<p class="hero-sub">${todays.length ? html`${todays.length} kelas hari ini${left && left < todays.length ? html`, ${left} lagi belum tamat` : ''}.` : 'Tiada kelas tambahan hari ini.'} <span class="muted">${dateLong(today)}</span></p>`;
}
function orbitInfo(b, n) {
const start = at(b.date, b.from).getTime(), end = at(b.date, b.to).getTime(), t = n.getTime();
const over = t > end;   // an open-ended extension running past the planned end
return {
p: over ? 1 : Math.min(1, Math.max(0, (t - start) / (end - start))),
over,
mins: over ? Math.floor((t - end) / 60000) : Math.max(0, Math.round((end - t) / 60000)),
cap: over ? 'minit lebih masa' : (b.extensionActive ? 'minit (extend)' : 'minit lagi')
};
}
function orbit(b, n) {
const o = orbitInfo(b, n);
return html`<div class="orbit-wrap${o.over ? ' is-over' : ''}" style="--p:${o.p.toFixed(4)}">
<svg class="orbit" viewBox="0 0 120 120" aria-hidden="true">
<circle class="orbit-track" cx="60" cy="60" r="52"/>
<circle class="orbit-fill" cx="60" cy="60" r="52" pathLength="100"/>
<g class="orbit-dot"><circle cx="60" cy="8" r="5.5"/></g>
</svg>
<div class="orbit-center"><b data-live-left>${o.over ? '+' + o.mins : o.mins}</b><span data-live-cap>${o.cap}</span></div>
</div>`;
}
function liveNow(n) {
return sortByTime(state.bookings.filter(b => !b.cancelledAt && b.date === isoDate(n))).find(b => { const s = computeStatus(b, n); return s === 'ongoing' || s === 'extending'; });
}
function nowTile(n) {
const live = liveNow(n);
const u = state.user;
if (!live) {
const nx = sortByTime(state.bookings.filter(b => !b.cancelledAt && computeStatus(b, n) === 'upcoming'))[0];
return html`<div class="now-empty">
<span class="eyebrow">${icon('orbit', 16)} Sekarang</span>
<h3>Tiada kelas sedang berlangsung</h3>
<p class="muted">${nx ? html`Kelas seterusnya: <b>${nx.subject}</b>, ${dayPhrase(nx.date, n)} ${nx.from}.` : 'Belum ada kelas akan datang dalam jadual.'}</p>
<div class="tile-actions"><a href="#tempah" class="btn primary" data-go="tempah">${icon('plus', 18)}<span>Tempah kelas</span></a>
<button type="button" class="btn ghost" data-ask="slot kosong esok">${icon('wand', 18)}<span>Cari slot kosong</span></button></div>
</div>`;
}
const roster = rosterFor(live.subject);
const att = live.attendance || {};
const marked = Object.keys(att).length > 0;
const starred = roster.filter(x => att[x] === 'hadir').length;
const mine = u && att[u.name];
return html`<div class="now-live" data-id="${live.id}" style="--c:${subjectColor(live.subject)}">
<div class="now-main">
<span class="eyebrow live">${html`<i class="pulse"></i>`}${live.extensionActive ? 'Sedang extend' : 'Sedang berlangsung'}</span>
<h3 class="now-subject">${subjectBadge(live.subject, 'lg', 'is-solid')}<span>${live.subject}</span></h3>
<p class="now-teacher">${live.teacher}${live.notes ? html` · <span class="muted">${live.notes}</span>` : ''}</p>
<p class="now-time">${live.from}<span>–</span>${live.to}</p>
<div class="now-checkins"><div class="mini-stars" aria-hidden="true">${roster.map(x => html`<i class="${att[x] === 'hadir' ? 'on' : ''}"></i>`)}</div><span>${marked ? html`<b>${starred}/${roster.length}</b> bintang skibidi${mine === 'hadir' ? html` · <span class="ok">termasuk anda</span>` : mine === 'lewat' ? html` · <span class="muted">anda lewat</span>` : ''}` : html`Kehadiran belum ditanda`}</span></div>
<div class="tile-actions">
${state.isAdmin ? html`<button type="button" class="btn primary" data-att="${live.id}">${icon('check', 18)}<span>Tanda kehadiran</span></button>` : ''}
${live.extensionActive ? html`<button type="button" class="btn danger" data-stopext="${live.id}">${icon('clock', 18)}<span>Hentikan extend</span></button>`
: html`<button type="button" class="btn ghost" data-extend="${live.id}">${icon('clock', 18)}<span>Extend</span></button>`}
<a href="#paparan" class="btn ghost" data-go="paparan">${icon('display', 18)}<span>Paparan kelas</span></a>
</div>
</div>
${orbit(live, n)}
</div>`;
}
function odo(value) {
return html`<span class="odo" aria-hidden="true">${String(value).split('').map(ch => /\d/.test(ch) ? html`<span class="odo-d" style="--v:${ch}"><span>0123456789</span></span>` : html`<span class="odo-sep">${ch}</span>`)}</span>`;
}
function countdownParts(ms) {
const s = Math.max(0, Math.floor(ms / 1000));
return pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor((s % 3600) / 60)) + ':' + pad2(s % 60);
}
function nextTile(n) {
const nx = sortByTime(state.bookings.filter(b => !b.cancelledAt && computeStatus(b, n) === 'upcoming'))[0];
if (!nx) return html`<span class="eyebrow">${icon('clock', 16)} Seterusnya</span><h3>Tiada kelas akan datang</h3><p class="muted">Tempah satu, atau minta Tanya Sigma cari masa terbaik.</p>`;
const ms = at(nx.date, nx.from) - n;
const within = ms < 24 * 3600000;
return html`<button type="button" class="tile-link" data-open="${nx.id}" style="--c:${subjectColor(nx.subject)}">
<span class="eyebrow">${icon('clock', 16)} Seterusnya</span>
<span class="next-subject">${subjectBadge(nx.subject, 'sm')}${nx.subject}</span>
<span class="next-when">${dayLabel(nx.date, n)}, ${nx.from}–${nx.to} · ${nx.teacher}</span>
${within ? html`<span class="next-count" data-next-at="${at(nx.date, nx.from).getTime()}" aria-label="Bermula dalam ${minutesText(Math.round(ms / 60000))}">${odo(countdownParts(ms))}</span><span class="next-cap">jam : minit : saat</span>`
: html`<span class="next-days"><b>${Math.ceil(ms / 86400000)}</b> hari lagi</span>`}
</button>`;
}
function spmTile(n) {
const today = isoDate(n);
const d = daysTo(SPM.writtenStart, today);
const nx = nextPaper(classPapers(), n);
const from = isoDate(addDays(new Date(SPM.writtenStart + 'T00:00:00'), -70));
const span = daysTo(from, SPM.writtenEnd);
const pct = x => Math.max(0, Math.min(100, daysTo(from, x) / span * 100));
const ws = pct(SPM.writtenStart);
const labs = SPM.milestones.filter(m => m.id.indexOf('amali') === 0);
const marks = SPM.milestones.filter(m => m.id === 'bm-oral' || m.id === 'bi-oral')
.concat(labs.length ? [{ from: labs[0].from, to: labs[labs.length - 1].to, label: 'Ujian Amali: ' + labs.map(m => m.subjects[0] + ' ' + dateShort(m.from)).join(', ') }] : []);
const when = p => rangeShort(p.date, p.dateTo) + (p.from ? ', ' + p.from : '');
const dn = nx ? daysTo(nx.date, today) : 0;
return html`<div class="tile-head"><span class="eyebrow">${icon('spm', 16)} SPM 2026</span><a href="#spm" class="link-btn" data-go="spm">Jadual penuh ${icon('right', 14)}</a></div>
<div class="spm-big"><b data-count="${Math.max(0, d)}">${Math.max(0, d)}</b><span>hari lagi ke<br>peperiksaan bertulis</span></div>
<div class="spm-track" role="img" aria-label="Garis masa SPM: ${Math.max(0, d)} hari lagi ke peperiksaan bertulis">
<span class="spm-written" style="left:${ws.toFixed(1)}%;width:${(100 - ws).toFixed(1)}%"><em>Bertulis</em></span>
<i style="width:${pct(today).toFixed(1)}%"></i>
${marks.map(m => html`<b class="${m.to < today ? 'done' : ''}" style="left:${pct(m.from).toFixed(1)}%" title="${m.label}, ${dateShort(m.from)}"></b>`)}
</div>
${nx ? html`<a href="#spm" class="spm-nextpaper" data-go="spm" style="--c:${subjectColor(nx.subject)}">${subjectBadge(nx.subject, 'sm')}
<span><small>Kertas seterusnya${dn > 0 ? ' · ' + dn + ' hari lagi' : ' · hari ini'}</small><b>${nx.name}, ${nx.paper.replace('Kertas 3 · ', '').replace('Kertas 4 · ', '')}</b><em>${when(nx)}</em></span>${icon('right', 16)}</a>` : ''}`;
}
function ring(pct, label) {
const p = pct == null ? 0 : pct;
return html`<div class="ring" style="--p:${p}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="ring-track" cx="50" cy="50" r="42"/><circle class="ring-fill" cx="50" cy="50" r="42" pathLength="100"/></svg><div class="ring-c"><b>${pct == null ? '—' : pct + '%'}</b><span>${label}</span></div></div>`;
}
function starsTile(n) {
const u = state.user;
if (isStudent()) {
const a = attendanceFor(state.bookings, u.name);
const stars = starsFrom(a.counts);
const streak = streakFor(state.bookings, u.name, n);
return html`<span class="eyebrow">${icon('star', 16)} Bintang skibidi anda</span>
<div class="stars-row">${ring(a.rate, 'hadir')}<div class="stars-facts">
<p><b class="gold" data-count="${stars}">${stars}</b> bintang skibidi</p>
<p><b data-count="${streak}">${streak}</b> streak tepat masa ${icon('flame', 15, 'flame')}</p>
<p class="muted">${a.counts.lewat} lewat (tiada bintang), ${a.counts.tidak} tidak hadir</p></div></div>`;
}
const all = attendanceOverall(state.bookings);
const risk = atRiskStudents(state.bookings, 80);
return html`<span class="eyebrow">${icon('star', 16)} Kehadiran kelas</span>
<div class="stars-row">${ring(all.rate, 'purata')}<div class="stars-facts">
<p><b data-count="${all.classes}">${all.classes}</b> kelas ditanda</p>
${risk.length ? html`<p class="warn-text">${risk.length} pelajar bawah 80%</p><p class="muted">${risk.slice(0, 3).map(r => personName(r.name) + ' ' + r.rate + '%').join(', ')}</p>` : html`<p class="ok">Semua pelajar 80% ke atas</p>`}
<a href="#statistik" class="link-btn" data-go="statistik">Lihat analitik ${icon('right', 14)}</a></div></div>`;
}
function crewTile(n) {
const t = Date.now();
const online = STUDENT_NAMES.filter(x => state.users[x] && state.users[x].lastSeen && t - state.users[x].lastSeen.getTime() < 5 * 60000);
const live = liveNow(n);
const lit = {};
onTimeNames(live).forEach(x => { lit[x] = true; });
return html`<span class="eyebrow">${icon('pengguna', 16)} Langit kelas</span>
${constellationHTML({ static: true, online, lit, cls: 'is-mini', label: 'Rakan sekelas' })}
<p class="crew-cap"><span><i class="dot-live"></i>${online.length} aktif</span>${live ? html`<span><i class="dot-gold"></i>${Object.keys(lit).length} bintang skibidi</span>` : ''}</p>`;
}
function todayTile(n) {
const today = isoDate(n);
const list = sortByTime(state.bookings.filter(b => !b.cancelledAt && b.date === today));
const head = html`<div class="tile-head"><span class="eyebrow">${icon('jadual', 16)} Jadual hari ini</span><a href="#jadual" class="link-btn" data-go="jadual">Semua ${icon('right', 14)}</a></div>`;
if (!list.length) return html`${head}<div class="empty"><b>Hari ini lapang</b><p>Tiada kelas tambahan. Masa yang baik untuk ulang kaji sendiri.</p></div>`;
const nowMin = n.getHours() * 60 + n.getMinutes();
let placed = false;
const rows = [];
list.forEach(b => {
if (!placed && nowMin < toMinutes(b.from)) { rows.push(html`<div class="tl-now"><span>${pad2(n.getHours())}:${pad2(n.getMinutes())}</span><i></i></div>`); placed = true; }
const st = computeStatus(b, n);
rows.push(html`<button type="button" class="tl-row st-${st}" data-open="${b.id}" style="--c:${subjectColor(b.subject)}">
<span class="tl-t">${b.from}</span><span class="tl-node"></span>
<span class="tl-body"><b>${subjectIcon(b.subject, 15, 'tl-ic')}${b.subject}</b><span>${b.teacher} · ${b.from}–${b.to}</span>${st === 'ongoing' || st === 'extending' ? html`<em>${st === 'extending' ? 'sedang extend' : minutesText(Math.round((at(b.date, b.to) - n) / 60000)) + ' lagi'}</em>` : ''}</span></button>`);
});
if (!placed) rows.push(html`<div class="tl-now"><span>${pad2(n.getHours())}:${pad2(n.getMinutes())}</span><i></i></div>`);
return html`${head}<div class="tl">${rows}</div>`;
}
function hourWord(m) {
const h = Math.floor(m / 60) % 24, mm = m % 60;
const t = (x) => x + (mm ? '.' + String(mm).padStart(2, '0') : '');
if (h === 0) return t(12) + ' mlm';
if (h < 12) return t(h) + ' pg';
if (h === 12) return t(12) + ' tgh';
return t(h - 12) + (h < 19 ? ' ptg' : ' mlm');
}
function weekTile(n) {
const ws = startOfWeek(n);
const wkList = state.bookings.filter(b => !b.cancelledAt && b.date >= isoDate(ws) && b.date <= isoDate(addDays(ws, 6)));
const F = Math.min(7 * 60, ...wkList.map(b => Math.floor(toMinutes(b.from) / 60) * 60));
const T = Math.max(22 * 60 + 30, ...wkList.map(b => Math.ceil(toMinutes(b.to) / 60) * 60));
const pct = m => ((Math.min(Math.max(m, F), T) - F) / (T - F) * 100).toFixed(2) + '%';
const today = isoDate(n);
const rows = [];
for (let i = 0; i < 7; i++) {
const d = addDays(ws, i), iso = isoDate(d);
const sh = SCHOOL_HOURS[JS_DAYS[d.getDay()]];
const list = state.bookings.filter(b => !b.cancelledAt && b.date === iso);
rows.push(html`<button type="button" class="wk-row${iso === today ? ' is-today' : ''}${iso < today ? ' is-past' : ''}" data-day="${iso}" aria-label="${dayLabel(iso, n)}: ${list.length} kelas">
<span class="wk-day">${['Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab', 'Aha'][i]}<small>${d.getDate()}</small></span>
<span class="wk-track">${sh ? html`<i class="wk-school" style="left:${pct(toMinutes(sh.from))};width:calc(${pct(toMinutes(sh.to))} - ${pct(toMinutes(sh.from))})"></i>` : ''}
${list.map(b => html`<i class="wk-ev" style="left:${pct(toMinutes(b.from))};width:calc(${pct(toMinutes(b.to))} - ${pct(toMinutes(b.from))});--c:${subjectColor(b.subject)}" title="${b.subject} ${b.from}–${b.to}"></i>`)}
${iso === today ? html`<i class="wk-now" style="left:${pct(n.getHours() * 60 + n.getMinutes())}"></i>` : ''}</span>
<span class="wk-n">${list.length || ''}</span></button>`);
}
const mid = Math.round((F + T) / 2 / 60) * 60;
return html`<div class="tile-head"><span class="eyebrow">${icon('grid', 16)} Minggu ini</span><span class="wk-scale"><span>${hourWord(F)}</span><span>${hourWord(mid)}</span><span>${hourWord(Math.min(T, 23 * 60 + 59))}</span></span></div><div class="wk">${rows}</div>`;
}
function upcomingTile(n) {
const list = sortByTime(state.bookings.filter(b => !b.cancelledAt && computeStatus(b, n) === 'upcoming')).slice(0, 5);
const head = html`<div class="tile-head"><span class="eyebrow">${icon('tempah', 16)} Akan datang</span><a href="#jadual" class="link-btn" data-go="jadual">Jadual ${icon('right', 14)}</a></div>`;
if (!list.length) return html`${head}<div class="empty"><b>Belum ada tempahan</b><p>Kelas yang ditempah akan muncul di sini.</p><a href="#tempah" class="btn primary sm" data-go="tempah">Tempah kelas</a></div>`;
return html`${head}<div class="up-list">${list.map(b => html`<button type="button" class="up-row" data-open="${b.id}" style="--c:${subjectColor(b.subject)}">${subjectBadge(b.subject, 'md')}<span class="up-main"><b>${b.subject}</b><span>${b.teacher}</span></span><span class="up-when"><b>${dayLabel(b.date, n)}</b><span>${b.from}–${b.to}</span></span></button>`)}</div>`;
}
function activityTile(n) {
const list = state.activity.slice(0, 6);
return html`<div class="tile-head"><span class="eyebrow">${icon('spark', 16)} Aktiviti terkini</span></div>
${list.length ? html`<ul class="act-list">${list.map(a => html`<li><span class="act-ic">${icon(ACT_IC[a.action] || 'clock', 15)}</span><span class="act-text">${a.description || a.userName}</span><time>${timeAgo(a.clientTime, n.getTime())}</time></li>`)}</ul>` : html`<div class="empty"><b>Tiada aktiviti lagi</b></div>`}`;
}
function askTile() {
return html`<span class="eyebrow">${icon('spark', 16)} Tanya Sigma</span>
<form class="ask-form" data-ask-form><input id="dash-ask" class="input" type="text" autocomplete="off" placeholder="Contoh: tempah Fizik esok 3 petang" aria-label="Tanya Sigma"><button type="submit" class="btn primary icon-only" aria-label="Tanya">${icon('send', 18)}</button></form>
<div class="ask-chips">${['Kelas apa sekarang?', 'Slot kosong esok', 'Kehadiran saya', 'Bila SPM Fizik?'].map(c => html`<button type="button" class="chip" data-ask="${c}">${c}</button>`)}</div>`;
}
const TILES = [
['t-hero', heroTile], ['t-now', nowTile], ['t-next', nextTile], ['t-spm', spmTile], ['t-stars', starsTile],
['t-crew', crewTile], ['t-today', todayTile], ['t-week', weekTile], ['t-up', upcomingTile], ['t-act', activityTile]
];
function paint(entering) {
if (!root) return;
if (!state.ready.bookings) { setHTML(root, skeleton()); return; }
const n = now();
if (!root.querySelector('.bento:not(.is-loading)')) {
setHTML(root, html`<div class="bento${entering ? ' is-entering' : ''}">${TILES.map(([c]) => html`<section class="tile ${c}" data-tile="${c}"></section>`)}<section class="tile t-ask" data-tile="t-ask">${askTile()}</section></div>`);
entering = true;
const bento = root.querySelector('.bento');
setTimeout(() => { if (bento.isConnected) bento.classList.add('is-settled'); }, 2600);
}
TILES.forEach(([c, fn]) => setHTML(root.querySelector('[data-tile="' + c + '"]'), fn(n)));
const nowTileEl = root.querySelector('[data-tile="t-now"]'), liveEl = nowTileEl && nowTileEl.querySelector('.now-live');
if (nowTileEl) { if (liveEl) nowTileEl.style.setProperty('--c', liveEl.style.getPropertyValue('--c')); else nowTileEl.style.removeProperty('--c'); }
if (entering) countUp(root);
}
function tick(n) {
if (!root || !root.isConnected) return;
const live = root.querySelector('.now-live');
const b = liveNow(n);
if (!!live !== !!b || (live && b && live.dataset.id !== b.id)) { paint(false); return; }
if (live) {
const o = orbitInfo(b, n);
const wrap = root.querySelector('.orbit-wrap');
if (wrap) { wrap.style.setProperty('--p', o.p.toFixed(4)); wrap.classList.toggle('is-over', o.over); }
const left = root.querySelector('[data-live-left]');
if (left) left.textContent = o.over ? '+' + o.mins : String(o.mins);
const cap = root.querySelector('[data-live-cap]');
if (cap && cap.textContent !== o.cap) cap.textContent = o.cap;
}
const nc = root.querySelector('[data-next-at]');
if (nc) {
const ms = +nc.dataset.nextAt - n.getTime();
if (ms <= 0) { paint(false); return; }
const digits = countdownParts(ms).replace(/:/g, '');
nc.querySelectorAll('.odo-d').forEach((el, i) => el.style.setProperty('--v', digits[i]));
}
}
const dashboardView = {
id: 'utama',
render(el, params, ctx) {
root = el;
paint(ctx && ctx.entering);
if (!stopTick) stopTick = onSecond(tick);
if (!el.dataset.wired) {
el.dataset.wired = '1';
on(el, 'click', '[data-open]', (e, b) => openClassSheet(b.dataset.open));
on(el, 'click', '[data-att]', (e, b) => openAttendanceSheet(b.dataset.att));
on(el, 'click', '[data-extend]', (e, b) => openExtendSheet(b.dataset.extend));
on(el, 'click', '[data-stopext]', (e, b) => openStopExtendSheet(b.dataset.stopext));
on(el, 'click', '[data-day]', (e, b) => navigate('jadual', { date: b.dataset.day, mode: 'day' }));
on(el, 'click', '[data-ask]', (e, b) => ask(b.dataset.ask));
on(el, 'submit', '[data-ask-form]', e => { e.preventDefault(); const i = el.querySelector('#dash-ask'); const q = i.value.trim(); if (q) { i.value = ''; ask(q); } });
}
},
update() { paint(false); },
leave() { if (stopTick) { stopTick(); stopTick = null; } }
};
return { setDashboardAsk, dashboardView };
})();
const __m27 = (() => {
const { state } = __m1;
const { updateBooking } = __m1;
const { revertBooking } = __m1;
const { findBooking } = __m1;
const { now } = __m7;
const { isoDate } = __m4;
const { parseISO } = __m4;
const { addDays } = __m4;
const { startOfWeek } = __m4;
const { startOfMonth } = __m4;
const { daysBetween } = __m4;
const { toMinutes } = __m4;
const { minutesToTime } = __m4;
const { timesOverlap } = __m4;
const { clamp } = __m4;
const { pad2 } = __m4;
const { normalize } = __m4;
const { debounce } = __m4;
const { SUBJECTS } = __m5;
const { subjectColor } = __m5;
const { subjectShort } = __m5;
const { SCHOOL_HOURS } = __m5;
const { FRIDAY_PRAYER } = __m5;
const { JS_DAYS } = __m5;
const { MONTHS_MY } = __m5;
const { GRID_FROM } = __m5;
const { GRID_TO } = __m5;
const { CLASS_PAPERS } = __m5;
const { computeStatus } = __m9;
const { onTimeNames } = __m9;
const { findClashes } = __m9;
const { sortByTime } = __m9;
const { findSlots } = __m21;
const { html } = __m11;
const { setHTML } = __m11;
const { on } = __m11;
const { create } = __m11;
const { icon } = __m13;
const { subjectIcon } = __m13;
const { subjectBadge } = __m13;
const { toast } = __m16;
const { openSheet } = __m14;
const { confirmDialog } = __m14;
const { dayLabel } = __m15;
const { dayPhrase } = __m15;
const { dateShort } = __m15;
const { dateLong } = __m15;
const { dayShort } = __m15;
const { durationText } = __m15;
const { statusPill } = __m19;
const { openClassSheet } = __m19;
const { openShareSheet } = __m19;
const { openBookingSheet } = __m20;
const F = GRID_FROM, T = GRID_TO, SPAN = T - F, SNAP = 15;
const MODE_KEY = 'langit5s-jadual-mode';
const MODES = [
{ id: 'day', label: 'Hari', icon: 'list' },
{ id: 'week', label: 'Minggu', icon: 'jadual' },
{ id: 'month', label: 'Bulan', icon: 'grid' },
{ id: 'list', label: 'Senarai', icon: 'filter' }
];
const WD = ['Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab', 'Aha'];
const v = { mode: null, anchor: null, q: '', qRaw: '', subjects: new Set(), cancelled: false, slot: null, scrolledFor: '' };
let root = null, drag = null, suppressUntil = 0, pendingPaint = false;
const suppressed = () => Date.now() < suppressUntil;
const pct = m => ((m - F) / SPAN * 100).toFixed(3) + '%';
const pctLen = m => (m / SPAN * 100).toFixed(3) + '%';
const snapM = m => Math.round(m / SNAP) * SNAP;
function defaultMode() {
let m = null;
try { m = localStorage.getItem(MODE_KEY); } catch (e) { m = null; }
if (MODES.some(x => x.id === m)) return m;
return window.matchMedia && window.matchMedia('(max-width: 767px)').matches ? 'day' : 'week';
}
function saveMode() { try { localStorage.setItem(MODE_KEY, v.mode); } catch (e) { /* per-viewer nicety only */ } }
function matches(b) {
if (b.cancelledAt && !v.cancelled) return false;
if (v.subjects.size && !v.subjects.has(b.subject)) return false;
if (v.q) {
const hay = normalize([b.subject, b.teacher, b.notes || '', b.createdBy || ''].join(' '));
if (!v.q.split(/\s+/).every(w => hay.includes(w))) return false;
}
return true;
}
function bookingsOn(iso) { return sortByTime(state.bookings.filter(b => b.date === iso && matches(b))); }
function range() {
const a = parseISO(v.anchor);
if (v.mode === 'day') return { from: v.anchor, to: v.anchor, days: [v.anchor] };
if (v.mode === 'week') {
const ws = startOfWeek(a);
const days = [0, 1, 2, 3, 4, 5, 6].map(i => isoDate(addDays(ws, i)));
return { from: days[0], to: days[6], days };
}
if (v.mode === 'month') {
const ms = startOfMonth(a), me = new Date(a.getFullYear(), a.getMonth() + 1, 0);
return { from: isoDate(ms), to: isoDate(me), days: [] };
}
return { from: v.anchor, to: isoDate(addDays(a, 27)), days: [] };
}
function rangeTitle(r) {
if (v.mode === 'day') return dateLong(v.anchor);
if (v.mode === 'month') { const a = parseISO(v.anchor); return MONTHS_MY[a.getMonth()] + ' ' + a.getFullYear(); }
return dateShort(r.from) + ' – ' + dateShort(r.to) + ' ' + parseISO(r.to).getFullYear();
}
function step(dir) {
const a = parseISO(v.anchor);
if (v.mode === 'day') v.anchor = isoDate(addDays(a, dir));
else if (v.mode === 'week') v.anchor = isoDate(addDays(a, 7 * dir));
else if (v.mode === 'month') v.anchor = isoDate(new Date(a.getFullYear(), a.getMonth() + dir, 1));
else v.anchor = isoDate(addDays(a, 28 * dir));
}
function inRange(r) { return state.bookings.filter(b => b.date >= r.from && b.date <= r.to && matches(b)); }
function layout(list, n) {
const today = isoDate(n), nowMin = n.getHours() * 60 + n.getMinutes();
const items = list.map(b => {
const st = computeStatus(b, n);
let e = Math.max(toMinutes(b.to), toMinutes(b.from) + 15);
if (st === 'extending' && b.date === today) e = Math.max(e, Math.min(T, nowMin));
return { b, st, s: toMinutes(b.from), e, lane: 0, lanes: 1 };
});
let cluster = [], end = -1;
const flush = () => { const n2 = Math.max(...cluster.map(x => x.lane)) + 1; cluster.forEach(x => { x.lanes = n2; }); cluster = []; end = -1; };
items.forEach(it => {
if (cluster.length && it.s >= end) flush();
const used = cluster.filter(x => x.e > it.s).map(x => x.lane);
let lane = 0;
while (used.includes(lane)) lane++;
it.lane = lane;
cluster.push(it);
end = Math.max(end, it.e);
});
if (cluster.length) flush();
return items;
}
function canMove(b, st) { return !!state.user && st === 'upcoming'; }
function pageHTML() {
return html`
<div class="page-head jd-head">
<div><h2 class="page-title">Jadual</h2><p class="page-sub" data-range>&nbsp;</p></div>
<div class="seg seg-lg jd-modes" role="tablist" aria-label="Paparan jadual">${MODES.map(m => html`<button type="button" role="tab" data-mode="${m.id}">${icon(m.icon, 16)}<span>${m.label}</span></button>`)}</div>
</div>
<div class="jd-bar">
<div class="jd-nav">
<button type="button" class="icon-btn" data-step="-1" aria-label="Sebelum">${icon('left', 20)}</button>
<button type="button" class="chip" data-today>Hari ini</button>
<button type="button" class="icon-btn" data-step="1" aria-label="Seterusnya">${icon('right', 20)}</button>
</div>
<label class="search-box jd-search">${icon('search', 16)}<input class="input" type="search" placeholder="Cari subjek, guru atau catatan" aria-label="Cari kelas" value="${v.qRaw}"></label>
<div class="jd-actions">
<button type="button" class="btn ghost sm" data-slots>${icon('wand', 16)}<span>Slot Pintar</span></button>
<button type="button" class="btn ghost sm" data-share>${icon('share', 16)}<span>Kongsi</span></button>
<button type="button" class="btn primary sm" data-new>${icon('plus', 16)}<span>Tempah</span></button>
</div>
</div>
<div class="jd-subjects" role="group" aria-label="Tapis mengikut subjek">
<button type="button" class="chip" data-subj="">Semua</button>
${SUBJECTS.map(s => html`<button type="button" class="chip chip-subj" data-subj="${s.name}" title="${s.name}" style="--c:${s.color}">${subjectIcon(s.name, 15)}${s.short}</button>`)}
<button type="button" class="chip" data-cancelled>${icon('trash', 14)}<span>Dibatalkan</span></button>
</div>
<div class="jd-slotbar" hidden></div>
<div class="jd-body"></div>
<p class="jd-hint" data-hint></p>`;
}
function syncBar(r, count) {
const set = (sel, fn) => root.querySelectorAll(sel).forEach(fn);
set('[data-mode]', b => { const on_ = b.dataset.mode === v.mode; b.classList.toggle('is-on', on_); b.setAttribute('aria-selected', on_ ? 'true' : 'false'); });
set('[data-subj]', b => b.classList.toggle('is-on', b.dataset.subj ? v.subjects.has(b.dataset.subj) : !v.subjects.size));
set('[data-cancelled]', b => b.classList.toggle('is-on', v.cancelled));
set('[data-slots]', b => b.classList.toggle('is-on', !!v.slot));
const rt = root.querySelector('[data-range]');
if (rt) rt.textContent = rangeTitle(r) + ' · ' + count + ' kelas';
const hint = root.querySelector('[data-hint]');
if (hint) hint.textContent = (v.mode === 'week' || v.mode === 'day')
? (window.matchMedia && window.matchMedia('(pointer: coarse)').matches
? 'Tekan ruang kosong untuk menempah. Tekan lama pada kelas untuk mengalihnya.'
: 'Klik atau seret pada ruang kosong untuk menempah. Seret kelas untuk mengalih, atau tarik hujung bawahnya untuk ubah masa tamat.')
: '';
}
function stripHTML(n) {
const ws = startOfWeek(parseISO(v.anchor)), today = isoDate(n);
return html`<div class="cal-strip" role="group" aria-label="Pilih hari">${[0, 1, 2, 3, 4, 5, 6].map(i => {
const iso = isoDate(addDays(ws, i)), list = bookingsOn(iso);
return html`<button type="button" class="strip-d${iso === v.anchor ? ' is-on' : ''}${iso === today ? ' is-today' : ''}" data-goday="${iso}" aria-label="${dateLong(iso)}, ${list.length} kelas">
<span>${WD[i]}</span><b>${parseISO(iso).getDate()}</b><i>${list.slice(0, 4).map(b => html`<em style="--c:${subjectColor(b.subject)}"></em>`)}</i></button>`;
})}</div>`;
}
function evHTML(it, n) {
const b = it.b, st = it.st, dur = it.e - it.s;
const can = canMove(b, st);
const ci = onTimeNames(b).length;   // bintang skibidi earned in this class
const style = 'top:' + pct(it.s) + ';height:' + pctLen(it.e - it.s) + ';left:calc(' + it.lane + ' * 100% / ' + it.lanes + ');width:calc(100% / ' + it.lanes + ');--c:' + subjectColor(b.subject);
const live = st === 'ongoing' || st === 'extending';
return html`<button type="button" class="ev st-${st}${dur < 50 ? ' is-short' : ''}${dur >= 100 ? ' is-tall' : ''}${can ? ' can-move' : ''}${it.lanes > 1 ? ' is-split' : ''}" data-id="${b.id}" style="${style}" aria-label="${b.subject}, ${dayLabel(b.date, n)} ${b.from} hingga ${b.to}, ${b.teacher}">
<span class="ev-in">
<b class="ev-s">${subjectIcon(b.subject, 14, 'ev-ic')}<span class="ev-full">${b.subject}</span><span class="ev-short">${subjectShort(b.subject)}</span></b>
<span class="ev-t">${b.from}–${st === 'extending' ? 'extend' : b.to}</span>
<span class="ev-who">${b.teacher}</span>
${b.notes ? html`<span class="ev-note">${b.notes}</span>` : ''}
</span>
${live ? html`<span class="ev-live"><i class="pulse"></i></span>` : ''}
${ci ? html`<span class="ev-ci" title="${ci} bintang skibidi (hadir tepat masa)">${icon('star', 10)}${ci}</span>` : ''}
${can ? html`<span class="ev-grip" data-resize aria-hidden="true"></span>` : ''}
</button>`;
}
function colHTML(iso, n, slots) {
const dn = JS_DAYS[parseISO(iso).getDay()];
const sh = SCHOOL_HOURS[dn];
const today = isoDate(n), nowMin = n.getHours() * 60 + n.getMinutes();
const items = layout(bookingsOn(iso), n);
const band = (from, to, cls, label) => html`<i class="${cls}" style="top:${pct(toMinutes(from))};height:${pctLen(toMinutes(to) - toMinutes(from))}"><span>${label}</span></i>`;
return html`<div class="cal-col${iso === today ? ' is-today' : ''}${iso < today ? ' is-past' : ''}" data-date="${iso}">
${sh ? band(sh.from, sh.to, 'cal-school', 'Waktu sekolah') : ''}
${dn === 'Friday' ? band(FRIDAY_PRAYER.from, FRIDAY_PRAYER.to, 'cal-prayer', 'Solat Jumaat') : ''}
${slots.filter(s => s.date === iso).map((s, i) => html`<button type="button" class="cal-slot" data-slot="${s.date}|${s.from}|${s.to}" style="top:${pct(toMinutes(s.from))};height:${pctLen(toMinutes(s.to) - toMinutes(s.from))};--d:${i * 90}ms" title="${s.why.join(', ')}">
<span>${icon('spark', 13)}<b>${s.from}–${s.to}</b></span><small>${s.why[0] || 'masa sesuai'}</small></button>`)}
${items.map(it => evHTML(it, n))}
${iso === today && nowMin >= F && nowMin <= T ? html`<i class="cal-now" style="top:${pct(nowMin)}"></i>` : ''}
</div>`;
}
function gridHTML(r, n) {
const today = isoDate(n), nowMin = n.getHours() * 60 + n.getMinutes();
const slots = v.slot ? slotSuggestions(r, n) : [];
const hours = [];
for (let h = Math.ceil(F / 60); h < T / 60; h++) hours.push(h);
return html`<div class="cal cal-${v.mode}" style="--cols:${r.days.length};--hours:${SPAN / 60}">
${v.mode === 'day' ? stripHTML(n) : html`<div class="cal-head">
<div class="cal-corner"></div>
${r.days.map(iso => { const c = bookingsOn(iso).length; return html`<button type="button" class="cal-dh${iso === today ? ' is-today' : ''}${iso < today ? ' is-past' : ''}" data-goday="${iso}" aria-label="Buka ${dateLong(iso)}">
<span>${dayShort(iso)}</span><b>${parseISO(iso).getDate()}</b><i>${c ? c + ' kelas' : ''}</i></button>`; })}
</div>`}
<div class="cal-scroll">
<div class="cal-grid">
<div class="cal-times" aria-hidden="true">${hours.map(h => html`<span style="top:${pct(h * 60)}">${pad2(h)}:00</span>`)}
${r.days.includes(today) && nowMin >= F && nowMin <= T ? html`<b class="cal-nowlabel" style="top:${pct(nowMin)}">${pad2(n.getHours())}:${pad2(n.getMinutes())}</b>` : ''}</div>
<div class="cal-days">${r.days.map(iso => colHTML(iso, n, slots))}</div>
</div>
</div>
</div>`;
}
function spmTag(iso) {
const list = CLASS_PAPERS.filter(p => iso >= p.date && iso <= p.dateTo);
if (!list.length) return '';
const kind = list[0].kind;
const pre = kind === 'lisan' ? 'Bertutur ' : kind === 'amali' ? 'Amali ' : 'SPM ';
return pre + Array.from(new Set(list.map(p => subjectShort(p.subject)))).join('/');
}
function monthHTML(n) {
const a = parseISO(v.anchor), ms = startOfMonth(a), gs = startOfWeek(ms);
const me = new Date(a.getFullYear(), a.getMonth() + 1, 0);
const weeks = Math.ceil((daysBetween(isoDate(gs), isoDate(me)) + 1) / 7);
const today = isoDate(n);
const cells = [];
for (let i = 0; i < weeks * 7; i++) {
const d = addDays(gs, i), iso = isoDate(d), list = bookingsOn(iso), tag = spmTag(iso);
cells.push(html`<button type="button" class="mon-cell${d.getMonth() !== a.getMonth() ? ' is-other' : ''}${iso === today ? ' is-today' : ''}${iso < today ? ' is-past' : ''}${tag ? ' has-tag' : ''}" data-goday="${iso}" style="--n:${Math.min(list.length, 4)}" aria-label="${dateLong(iso)}: ${list.length} kelas${tag ? ', ' + tag : ''}">
<span class="mon-top"><span class="mon-n">${d.getDate()}</span>${tag ? html`<span class="mon-tag">${tag}</span>` : ''}</span>
<span class="mon-evs">${list.slice(0, 3).map(b => html`<span class="mon-ev st-${computeStatus(b, n)}" style="--c:${subjectColor(b.subject)}">${subjectIcon(b.subject, 12)}<span class="mon-time">${b.from}</span><span class="mon-sub">${subjectShort(b.subject)}</span></span>`)}${list.length > 3 ? html`<em>+${list.length - 3} lagi</em>` : ''}</span>
<span class="mon-dots">${list.slice(0, 5).map(b => html`<i style="--c:${subjectColor(b.subject)}"></i>`)}</span>
</button>`);
}
return html`<div class="mon"><div class="mon-head">${WD.map(d => html`<span>${d}</span>`)}</div><div class="mon-grid" style="--weeks:${weeks}">${cells}</div></div>`;
}
function listHTML(r, n) {
const today = isoDate(n), groups = [];
for (let d = parseISO(r.from); isoDate(d) <= r.to; d = addDays(d, 1)) {
const iso = isoDate(d), list = bookingsOn(iso);
if (list.length) groups.push({ iso, list });
}
if (!groups.length) return html`<div class="empty jd-empty"><b>Tiada kelas dalam julat ini</b><p>${v.q || v.subjects.size ? 'Cuba buang carian atau penapis subjek.' : 'Tempah kelas baharu atau lihat minggu lain.'}</p></div>`;
return html`<div class="agenda">${groups.map(g => html`<section class="ag-day${g.iso === today ? ' is-today' : ''}${g.iso < today ? ' is-past' : ''}">
<h3 class="ag-date"><b>${dayLabel(g.iso, n)}</b><span>${dateLong(g.iso)}</span><i>${g.list.length} kelas</i></h3>
<div class="ag-list">${g.list.map(b => { const st = computeStatus(b, n); return html`<button type="button" class="ag-row st-${st}" data-open="${b.id}" style="--c:${subjectColor(b.subject)}">
<span class="ag-time"><b>${b.from}</b><span>${b.to}</span></span>${subjectBadge(b.subject, 'md')}
<span class="ag-main"><b>${b.subject}</b><span>${b.teacher} · ${durationText(b.from, b.to)}${b.notes ? ' · ' + b.notes : ''}</span></span>
${statusPill(st)}</button>`; })}</div></section>`)}</div>`;
}
function slotSuggestions(r, n) {
const today = isoDate(n);
const dates = r.days.filter(d => d >= today);
if (!dates.length || !v.slot) return [];
return findSlots(state.bookings, { dates, subject: v.slot.subject, length: v.slot.len, now: n, max: v.mode === 'day' ? 3 : 6 });
}
function slotBar(r, n) {
const bar = root.querySelector('.jd-slotbar');
if (!bar) return;
if (!v.slot || (v.mode !== 'week' && v.mode !== 'day')) { bar.hidden = true; return; }
const slots = slotSuggestions(r, n);
bar.hidden = false;
setHTML(bar, html`<span class="slotbar-ic">${icon('wand', 18)}</span>
<span class="slotbar-text"><b>Slot Pintar: ${v.slot.subject}, ${v.slot.len === 60 ? '1 jam' : v.slot.len === 90 ? '1 jam 30 minit' : '2 jam'}.</b>
${slots.length ? html`${slots.length} masa terbaik ditanda emas. Tekan satu untuk menempah.` : html`Tiada masa sesuai ${v.mode === 'day' ? 'pada hari ini' : 'minggu ini'}. Cuba ${v.mode === 'day' ? 'hari' : 'minggu'} seterusnya.`}</span>
<button type="button" class="btn ghost sm" data-slots>Tukar</button>
<button type="button" class="icon-btn" data-slotoff aria-label="Tutup Slot Pintar">${icon('x', 16)}</button>`);
}
function openSlotPicker() {
let subj = v.slot ? v.slot.subject : (v.subjects.size === 1 ? Array.from(v.subjects)[0] : null);
let len = v.slot ? v.slot.len : 60;
const s = openSheet({ title: 'Slot Pintar', sub: 'Sigma menimbang waktu sekolah, solat Jumaat, maghrib, kelas lain dan tarikh SPM, lalu menandakan masa terbaik pada jadual.', cls: 'is-dialog sheet-slots', keepFocus: true,
content: html`<div class="field"><span class="field-label">Subjek</span><div class="subject-picker">${SUBJECTS.map(x => html`<button type="button" class="subj-chip${subj === x.name ? ' is-on' : ''}" data-s="${x.name}" style="--c:${x.color}">${subjectIcon(x.name, 17, 'subj-ic')}${x.name}</button>`)}</div></div>
<div class="field slot-len"><span class="field-label">Tempoh</span><div class="quick">${[[60, '1 jam'], [90, '1j 30m'], [120, '2 jam']].map(([m, l]) => html`<button type="button" class="chip${len === m ? ' is-on' : ''}" data-len="${m}">${l}</button>`)}</div></div>
<div class="sheet-actions">${v.slot ? html`<button type="button" class="btn ghost" data-off>Matikan</button>` : ''}<button type="button" class="btn primary" data-go>${icon('wand', 18)}<span>Tunjuk masa terbaik</span></button></div>` });
on(s.body, 'click', '[data-s]', (e, el) => { subj = el.dataset.s; s.body.querySelectorAll('[data-s]').forEach(x => x.classList.toggle('is-on', x === el)); });
on(s.body, 'click', '[data-len]', (e, el) => { len = +el.dataset.len; s.body.querySelectorAll('[data-len]').forEach(x => x.classList.toggle('is-on', x === el)); });
on(s.body, 'click', '[data-off]', () => { v.slot = null; s.close(); paintBody(true); });
on(s.body, 'click', '[data-go]', () => {
if (!subj) { toast('Pilih subjek dahulu.', 'error'); return; }
v.slot = { subject: subj, len };
if (v.mode !== 'week' && v.mode !== 'day') v.mode = 'week';
const today = isoDate(now());
if (range().to < today) v.anchor = today;
s.close();
v.scrolledFor = '';
paintBody();
});
}
function paintBody(keepScroll) {
if (!root) return;
if (drag && drag.active) { pendingPaint = true; return; }
const body = root.querySelector('.jd-body');
if (!body) return;
const sc = body.querySelector('.cal-scroll');
const prevTop = sc ? sc.scrollTop : 0;
const n = now();
const r = range();
body.classList.toggle('no-anim', !!keepScroll);
syncBar(r, inRange(r).filter(b => !b.cancelledAt).length);
slotBar(r, n);
if (!state.ready.bookings) { setHTML(body, html`<div class="tile skel jd-skel"><i></i><i></i><i></i></div>`); return; }
if (v.mode === 'week' || v.mode === 'day') setHTML(body, gridHTML(r, n));
else if (v.mode === 'month') setHTML(body, monthHTML(n));
else setHTML(body, listHTML(r, n));
const sc2 = body.querySelector('.cal-scroll');
if (sc2) {
const key = v.mode + '|' + r.from;
if (keepScroll && v.scrolledFor === key) sc2.scrollTop = prevTop;
else {
const today = isoDate(n);
let m = 13 * 60;
if (r.days.includes(today)) m = n.getHours() * 60 + n.getMinutes() - 75;
else { const first = inRange(r).map(b => toMinutes(b.from)).sort((a, b) => a - b)[0]; if (first != null) m = first - 45; }
const grid = sc2.querySelector('.cal-grid');
sc2.scrollTop = Math.max(0, (clamp(m, F, T) - F) / SPAN * grid.offsetHeight);
v.scrolledFor = key;
}
}
}
function share() {
const n = now(), r = range();
const list = sortByTime(inRange(r).filter(b => !b.cancelledAt && computeStatus(b, n) !== 'ended'));
if (!list.length) { toast('Tiada kelas akan datang dalam julat ini untuk dikongsi.', 'info'); return; }
openShareSheet(list, 'Jadual 5 Sigma, ' + rangeTitle(r));
}
function gridEl() { return root.querySelector('.cal-grid'); }
function minuteAt(y) {
const g = gridEl();
if (!g) return F;
const r = g.getBoundingClientRect();
return F + (y - r.top) / r.height * SPAN;
}
function colAt(x) {
const cols = Array.from(root.querySelectorAll('.cal-col'));
if (!cols.length) return null;
for (const c of cols) { const r = c.getBoundingClientRect(); if (x >= r.left && x < r.right) return c; }
return x < cols[0].getBoundingClientRect().left ? cols[0] : cols[cols.length - 1];
}
function onDown(e) {
if (drag) return;
if (e.pointerType === 'mouse' && e.button !== 0) return;
const col = e.target.closest('.cal-col');
if (!col || e.target.closest('.cal-slot')) return;
const evEl = e.target.closest('.ev');
let kind = 'create', b = null;
if (evEl) {
if (!evEl.classList.contains('can-move')) return;           // a plain click opens it
b = findBooking(evEl.dataset.id);
if (!b) return;
kind = e.target.closest('[data-resize]') ? 'resize' : 'move';
} else if (!state.user) return;
const touch = e.pointerType !== 'mouse';
if (!touch) e.preventDefault();                               // no text selection while dragging
drag = { kind, b, el: evEl, col, pointerId: e.pointerId, touch, active: false, x0: e.clientX, y0: e.clientY, cx: e.clientX, cy: e.clientY, startMin: minuteAt(e.clientY) };
if (b) drag.grab = drag.startMin - toMinutes(b.from);
if (touch) drag.timer = setTimeout(() => { if (drag && !drag.active) activate(); }, 420);
window.addEventListener('pointermove', onMove, { passive: false });
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onCancel);
}
function onMove(e) {
if (!drag || e.pointerId !== drag.pointerId) return;
drag.cx = e.clientX; drag.cy = e.clientY;
const dist = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
if (!drag.active) {
if (drag.touch) { if (dist > 10) finish(); return; }          // a swipe: let the page scroll
if (dist < 5) return;
activate();
}
e.preventDefault();
place();
autoScroll(e.clientY);
}
function activate() {
const d = drag;
d.active = true;
clearTimeout(d.timer);
if (d.touch && navigator.vibrate) { try { navigator.vibrate(12); } catch (err) { /* ignore */ } }
document.body.classList.add('is-dragging');
if (d.el) {
d.el.classList.add('is-source');
d.ghost = d.el.cloneNode(true);
d.ghost.classList.remove('is-source', 'is-split');
d.ghost.removeAttribute('data-id');
d.ghost.setAttribute('aria-hidden', 'true');
d.ghost.style.left = '0';
d.ghost.style.width = '100%';
} else {
d.ghost = create('div', { class: 'ev ev-new', 'aria-hidden': 'true' });
}
d.ghost.classList.add('ev-ghost');
d.label = create('span', { class: 'ghost-label' });
d.ghost.appendChild(d.label);
place();
}
function place() {
const d = drag;
if (!d || !d.active) return;
const m = minuteAt(d.cy);
let col = d.col, from, to;
if (d.kind === 'move') {
if (v.mode === 'week') col = colAt(d.cx) || d.col;
const len = toMinutes(d.b.to) - toMinutes(d.b.from);
from = clamp(snapM(m - d.grab), F, T - len);
to = from + len;
} else if (d.kind === 'resize') {
from = toMinutes(d.b.from);
to = clamp(snapM(m), from + SNAP, T);
} else {
const a = Math.floor(d.startMin / SNAP) * SNAP, c = snapM(m);
from = clamp(Math.min(a, c), F, T - 30);
to = clamp(Math.max(a, c), from + 30, T);
}
if (d.ghost.parentNode !== col) col.appendChild(d.ghost);
const date = col.dataset.date;
d.res = { date, from: minutesToTime(from), to: minutesToTime(to) };
d.ghost.style.top = pct(from);
d.ghost.style.height = pctLen(to - from);
const clashes = findClashes(state.bookings, d.b ? d.b.subject : '', date, d.res.from, d.res.to, d.b ? d.b.id : null);
const sh = SCHOOL_HOURS[JS_DAYS[parseISO(date).getDay()]];
const school = !!sh && timesOverlap(d.res.from, d.res.to, sh.from, sh.to);
const past = date + 'T' + d.res.from < isoDate(now()) + 'T' + pad2(now().getHours()) + ':' + pad2(now().getMinutes());
const t = d.ghost.querySelector('.ev-t');
if (t) t.textContent = d.res.from + '–' + d.res.to;
d.ghost.classList.toggle('is-clash', clashes.length > 0);
d.ghost.classList.toggle('is-warn', !clashes.length && (school || past));
const moved = d.b && date !== d.b.date ? dayShort(date) + ', ' : '';
d.label.textContent = moved + d.res.from + '–' + d.res.to + (clashes.length ? ' · bertindih ' + clashes[0].subject : past ? ' · masa sudah lepas' : school ? ' · waktu sekolah' : '');
}
function autoScroll(y) {
const sc = root.querySelector('.cal-scroll');
if (!sc || !drag) return;
const r = sc.getBoundingClientRect(), edge = 56;
let dy = 0;
if (y < r.top + edge) dy = -Math.ceil((r.top + edge - y) / 5);
else if (y > r.bottom - edge) dy = Math.ceil((y - (r.bottom - edge)) / 5);
drag.scrollV = clamp(dy, -16, 16);
if (drag.scrollV && !drag.raf) {
const loop = () => {
if (!drag || !drag.active || !drag.scrollV) { if (drag) drag.raf = 0; return; }
sc.scrollTop += drag.scrollV;
place();
drag.raf = requestAnimationFrame(loop);
};
drag.raf = requestAnimationFrame(loop);
}
}
function finish() {
window.removeEventListener('pointermove', onMove);
window.removeEventListener('pointerup', onUp);
window.removeEventListener('pointercancel', onCancel);
if (!drag) return null;
const d = drag;
clearTimeout(d.timer);
if (d.raf) cancelAnimationFrame(d.raf);
if (d.ghost && d.ghost.parentNode) d.ghost.remove();
if (d.el) d.el.classList.remove('is-source');
document.body.classList.remove('is-dragging');
drag = null;
if (pendingPaint) { pendingPaint = false; paintBody(true); }
return d;
}
function onCancel(e) { if (drag && e.pointerId === drag.pointerId) finish(); }
async function onUp(e) {
if (!drag || e.pointerId !== drag.pointerId) return;
const wasActive = drag.active;
const d = finish();
if (!wasActive || !d || !d.res) return;                       // a click: the click handlers take it
suppressUntil = Date.now() + 500;                             // the click that follows a drop is not a click
const res = d.res;
if (d.kind === 'create') {
openBookingSheet({ prefill: { date: res.date, from: res.from, to: res.to, subject: v.slot ? v.slot.subject : (v.subjects.size === 1 ? Array.from(v.subjects)[0] : '') } });
return;
}
const b = findBooking(d.b.id);
if (!b || (res.date === b.date && res.from === b.from && res.to === b.to)) return;
const clashes = findClashes(state.bookings, b.subject, res.date, res.from, res.to, b.id);
if (clashes.length) {
const go = await confirmDialog({ title: 'Masa ini bertindih', message: clashes[0].subject + ' (' + clashes[0].teacher + ') sudah ditempah ' + clashes[0].from + '–' + clashes[0].to + '. ' + (d.kind === 'resize' ? 'Ubah masa tamat juga?' : 'Pindahkan juga?'), confirmLabel: d.kind === 'resize' ? 'Ubah juga' : 'Pindah juga' });
if (!go) { paintBody(true); return; }
}
const before = Object.assign({}, b);
const r = await updateBooking(b.id, { date: res.date, day: JS_DAYS[parseISO(res.date).getDay()], from: res.from, to: res.to }, { deferNotify: true });
if (!r.ok) { toast(r.message || 'Tidak dapat menyimpan perubahan.', 'error'); paintBody(true); return; }
const msg = d.kind === 'resize' ? b.subject + ' kini tamat ' + res.to : b.subject + ' dialih ke ' + dayPhrase(res.date, now()) + ', ' + res.from + '–' + res.to;
toast(msg, { type: 'success', action: { label: 'Buat asal', run: async () => {
const x = await revertBooking(before);
toast(x.ok ? b.subject + ' kembali ke ' + before.from + '–' + before.to : 'Gagal mengembalikan kelas.', x.ok ? 'info' : 'error');
} } });
}
function quickCreate(date, m) {
if (!state.user) return;
const s = clamp(Math.floor(m / 30) * 30, F, T - 60);
openBookingSheet({ prefill: { date, from: minutesToTime(s), to: minutesToTime(s + 60), subject: v.slot ? v.slot.subject : (v.subjects.size === 1 ? Array.from(v.subjects)[0] : '') } });
}
function wire(el) {
on(el, 'click', '[data-mode]', (e, b) => { v.mode = b.dataset.mode; saveMode(); paintBody(); });
on(el, 'click', '[data-step]', (e, b) => { step(+b.dataset.step); paintBody(); });
on(el, 'click', '[data-today]', () => { v.anchor = isoDate(now()); v.scrolledFor = ''; paintBody(); });
on(el, 'click', '[data-goday]', (e, b) => {
if (v.mode === 'day' && v.anchor === b.dataset.goday) return;
v.anchor = b.dataset.goday; v.mode = 'day'; paintBody();
});
on(el, 'click', '[data-subj]', (e, b) => {
const s = b.dataset.subj;
if (!s) v.subjects.clear();
else if (v.subjects.has(s)) v.subjects.delete(s); else v.subjects.add(s);
paintBody(true);
});
on(el, 'click', '[data-cancelled]', () => { v.cancelled = !v.cancelled; paintBody(true); });
const search = debounce(val => { v.qRaw = val; v.q = normalize(val.trim()); paintBody(true); }, 160);
on(el, 'input', '.jd-search input', (e, inp) => search(inp.value));
on(el, 'click', '[data-new]', () => { const t = isoDate(now()); openBookingSheet({ prefill: { date: v.anchor >= t ? v.anchor : t } }); });
on(el, 'click', '[data-share]', share);
on(el, 'click', '[data-slots]', openSlotPicker);
on(el, 'click', '[data-slotoff]', () => { v.slot = null; paintBody(true); });
on(el, 'click', '.cal-slot', (e, b) => { const [d, f, t] = b.dataset.slot.split('|'); openBookingSheet({ prefill: { subject: v.slot ? v.slot.subject : '', date: d, from: f, to: t } }); });
on(el, 'click', '.ev', (e, b) => { if (!suppressed() && b.dataset.id) openClassSheet(b.dataset.id); });
on(el, 'click', '[data-open]', (e, b) => openClassSheet(b.dataset.open));
on(el, 'click', '.cal-col', (e, col) => { if (suppressed() || e.target.closest('.ev, .cal-slot')) return; quickCreate(col.dataset.date, minuteAt(e.clientY)); });
el.addEventListener('pointerdown', onDown);
el.addEventListener('touchmove', e => { if (drag && drag.active) e.preventDefault(); }, { passive: false });
el.addEventListener('contextmenu', e => { if (drag && drag.touch) e.preventDefault(); });
el.addEventListener('keydown', e => {
if (e.target.closest('input, textarea, select')) return;
if (e.key === 'ArrowLeft' && e.altKey) { step(-1); paintBody(); }
else if (e.key === 'ArrowRight' && e.altKey) { step(1); paintBody(); }
});
}
const jadualView = {
id: 'jadual',
render(el, params) {
root = el;
if (!v.mode) v.mode = defaultMode();
if (!v.anchor) v.anchor = isoDate(now());
if (params && params.date) { v.anchor = params.date; v.scrolledFor = ''; }
if (params && params.mode && MODES.some(m => m.id === params.mode)) v.mode = params.mode;
if (params && params.slot) v.slot = params.slot;
if (params && params.subject) { v.subjects.clear(); v.subjects.add(params.subject); }
setHTML(el, pageHTML());
if (!el.dataset.wired) { el.dataset.wired = '1'; wire(el); }
v.scrolledFor = '';
paintBody();
},
update() { paintBody(true); },
leave() { if (drag) finish(); }
};
return { jadualView };
})();
const __m28 = (() => {
const { html } = __m11;
const { setHTML } = __m11;
const { icon } = __m13;
const { navigate } = __m10;
const { renderBookingForm } = __m20;
let form = null;
const tempahView = {
id: 'tempah',
render(el, params) {
params = params || {};
const editing = !!params.editId;
setHTML(el, html`<div class="page-head"><div><h2 class="page-title">${editing ? (params.silent ? 'Edit kelas (senyap)' : 'Edit tempahan') : 'Tempah kelas tambahan'}</h2>
<p class="page-sub">${editing ? 'Ubah butiran kelas. Pertembungan disemak serta-merta.' : 'Pilih subjek dan masa. Pertembungan disemak serta-merta, dan Sigma cadangkan masa terbaik.'}</p></div>
${editing ? '' : html`<div class="page-tools"><button type="button" class="btn ghost" data-ask-tempah>${icon('spark', 18)}<span>Tempah dengan ayat</span></button></div>`}</div>
<div class="tile tile-form" data-form></div>`);
form = renderBookingForm(el.querySelector('[data-form]'), {
prefill: params, editId: params.editId, silent: params.silent,
onDone: () => navigate(params.silent ? 'kelas' : 'jadual')
});
const ask = el.querySelector('[data-ask-tempah]');
if (ask) ask.addEventListener('click', () => { if (tempahView.ask) tempahView.ask('tempah '); });
},
update() { if (form) form.refresh(); },
ask: null
};
return { tempahView };
})();
const __m30 = (() => {
const { html } = __m11;
const { raw } = __m11;
const { subjectBadge } = __m13;
const { initials } = __m4;
const { subjectColor } = __m5;
const { computeStatus } = __m9;
const { dayLabel } = __m15;
const { durationText } = __m15;
const { statusPill } = __m19;
function classRows(list, n, opts) {
opts = opts || {};
if (!list.length) return html`<div class="empty"><b>${opts.empty || 'Tiada kelas'}</b>${opts.emptyHint ? html`<p>${opts.emptyHint}</p>` : ''}</div>`;
return html`<div class="cl-list">${list.map(b => {
const st = computeStatus(b, n);
return html`<button type="button" class="cl-row st-${st}" data-open="${b.id}" style="--c:${subjectColor(b.subject)}">
${subjectBadge(b.subject, 'md')}
<span class="cl-main"><b>${opts.title ? opts.title(b) : b.subject}</b><span>${opts.sub ? opts.sub(b) : b.teacher + (b.notes ? ' · ' + b.notes : '')}</span></span>
<span class="cl-when"><b>${dayLabel(b.date, n)}</b><span>${b.from}–${b.to} · ${durationText(b.from, b.to)}</span></span>
${st !== 'upcoming' ? statusPill(st) : ''}</button>`;
})}</div>`;
}
function table(rows, cols, opts) {
opts = opts || {};
if (!rows.length) return html`<div class="empty"><b>${opts.empty || 'Tiada rekod lagi'}</b></div>`;
return html`<div class="table-wrap"><table class="tbl"><thead><tr>${cols.map(c => html`<th class="${c.cls || ''}">${c.label}</th>`)}</tr></thead>
<tbody>${rows.map(r => html`<tr>${cols.map(c => html`<td class="${c.cls || ''}">${c.get(r)}</td>`)}</tr>`)}</tbody></table></div>`;
}
function sparkline(series, color) {
if (!series || series.length < 2) return '';
const max = Math.max(1, ...series), w = 100, h = 28;
const pts = series.map((v, i) => [(i / (series.length - 1)) * w, h - 2 - (v / max) * (h - 6)]);
const line = pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
const area = '0,' + h + ' ' + line + ' ' + w + ',' + h;
return html`<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" style="--c:${color || 'var(--gold)'}">
<polygon points="${area}" class="spark-area"/><polyline points="${line}" class="spark-line" pathLength="100"/></svg>`;
}
function kpi(label, value, opts) {
opts = opts || {};
return html`<div class="kpi${opts.tone ? ' t-' + opts.tone : ''}">
<span class="kpi-label">${opts.icon || ''}${label}</span>
<b class="kpi-value"${typeof value === 'number' ? raw(' data-count="' + value + '"') : ''}>${value}</b>
${opts.sub ? html`<span class="kpi-sub">${opts.sub}</span>` : ''}
${opts.series ? sparkline(opts.series, opts.color) : ''}
</div>`;
}
function avatar(name, color, size) {
return html`<span class="av" style="--c:${color || 'var(--gold)'};--s:${size || 44}px" aria-hidden="true">${initials(name)}</span>`;
}
function bars(entries, opts) {
opts = opts || {};
if (!entries.length) return html`<p class="muted">Tiada data lagi.</p>`;
const max = Math.max(1, ...entries.map(e => e.value));
return html`<div class="hbars">${entries.map((e, i) => html`<div class="hbar" style="--c:${e.color || 'var(--gold)'};--w:${(e.value / max * 100).toFixed(1)}%;--i:${i}">
<span class="hbar-label" title="${e.label}">${e.icon || ''}${e.label}</span><span class="hbar-track"><i></i></span><span class="hbar-value">${opts.format ? opts.format(e.value) : e.value}</span></div>`)}</div>`;
}
return { classRows, table, sparkline, kpi, avatar, bars };
})();
const __m29 = (() => {
const { state } = __m1;
const { now } = __m7;
const { toMinutes } = __m4;
const { isoDate } = __m4;
const { addDays } = __m4;
const { startOfWeek } = __m4;
const { normalize } = __m4;
const { SUBJECTS } = __m5;
const { SUBJECT_ROSTERS } = __m5;
const { STUDENT_NAMES } = __m5;
const { papersOf } = __m5;
const { subjectColor } = __m5;
const { computeStatus } = __m9;
const { sortByTime } = __m9;
const { allKnownTeachers } = __m9;
const { mostCommonSubjectFor } = __m9;
const { defaultTeacherFor } = __m9;
const { sameTeacher } = __m9;
const { rosterFor } = __m9;
const { attendanceFor } = __m9;
const { attendanceOverall } = __m9;
const { rateFrom } = __m9;
const { emptyTally } = __m9;
const { html } = __m11;
const { setHTML } = __m11;
const { on } = __m11;
const { icon } = __m13;
const { subjectIcon } = __m13;
const { navigate } = __m10;
const { dayLabel } = __m15;
const { dateShort } = __m15;
const { rangeShort } = __m15;
const { minutesText } = __m15;
const { durationText } = __m15;
const { timeAgo } = __m15;
const { personName } = __m15;
const { statusPill } = __m19;
const { openClassSheet } = __m19;
const { openBookingSheet } = __m20;
const { constellationHTML } = __m17;
const { classRows } = __m30;
const { table } = __m30;
const { avatar } = __m30;
const { kpi } = __m30;
const { countUp } = __m26;
const hours = list => list.reduce((s, b) => s + Math.max(0, toMinutes(b.to) - toMinutes(b.from)), 0);
const fmtDate = iso => iso.split('-').reverse().join('/');
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
const guruView = {
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
let subjSel = null;
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
const subjekView = {
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
const penggunaView = {
id: 'pengguna',
render(el) { penggunaRender(el); },
update(reason) { if (reason === 'notifications') return; const el = document.querySelector('[data-view="pengguna"]'); if (el) penggunaRender(el); }
};
return { guruView, subjekView, penggunaView };
})();
const __m31 = (() => {
const { state } = __m1;
const { now } = __m7;
const { isoDate } = __m4;
const { parseISO } = __m4;
const { addDays } = __m4;
const { startOfWeek } = __m4;
const { toMinutes } = __m4;
const { normalize } = __m4;
const { SUBJECTS } = __m5;
const { STUDENT_NAMES } = __m5;
const { WEEK_ORDER } = __m5;
const { DAY_MY } = __m5;
const { ATT_STATUSES } = __m5;
const { SPM } = __m5;
const { subjectColor } = __m5;
const { computeStats } = __m9;
const { computeStatus } = __m9;
const { statusLabel } = __m9;
const { dayNameOf } = __m9;
const { dailySeries } = __m9;
const { percentChange } = __m9;
const { countsByDate } = __m9;
const { sortByTime } = __m9;
const { attendanceOverall } = __m9;
const { attendanceFor } = __m9;
const { streakFor } = __m9;
const { starsFrom } = __m9;
const { rateFrom } = __m9;
const { emptyTally } = __m9;
const { isMarked } = __m9;
const { isStudent } = __m1;
const { csv } = __m22;
const { saveFile } = __m23;
const { html } = __m11;
const { setHTML } = __m11;
const { on } = __m11;
const { icon } = __m13;
const { subjectIcon } = __m13;
const { toast } = __m16;
const { navigate } = __m10;
const { dateLong } = __m15;
const { dateShort } = __m15;
const { personName } = __m15;
const { statusPill } = __m19;
const { openAttendanceSheet } = __m19;
const { openClassSheet } = __m19;
const { kpi } = __m30;
const { bars } = __m30;
const { table } = __m30;
const { countUp } = __m26;
const fmtDate = iso => iso.split('-').reverse().join('/');
let histQ = '', histN = 25, root = null;
function radar(entries) {
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
const statistikView = {
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
return { statistikView };
})();
const __m32 = (() => {
const { state } = __m1;
const { restoreBooking } = __m1;
const { addTemplate } = __m1;
const { removeTemplate } = __m1;
const { setSubjectTeacher } = __m1;
const { setTeacherGender } = __m1;
const { addWorkshopTeacher } = __m1;
const { removeWorkshopTeacher } = __m1;
const { resetDemo } = __m1;
const { exportBackup } = __m1;
const { importBackup } = __m1;
const { refreshNow } = __m1;
const { dataInfo } = __m1;
const { setDataSource } = __m1;
const { now } = __m7;
const { getOffset } = __m7;
const { setOffset } = __m7;
const { isoDate } = __m4;
const { at } = __m4;
const { pad2 } = __m4;
const { normalize } = __m4;
const { toMinutes } = __m4;
const { SUBJECTS } = __m5;
const { WEEK_ORDER } = __m5;
const { DAY_MY } = __m5;
const { APP_VERSION } = __m5;
const { subjectColor } = __m5;
const { computeStatus } = __m9;
const { sortByTime } = __m9;
const { allKnownTeachers } = __m9;
const { defaultTeacherFor } = __m9;
const { isMarked } = __m9;
const { html } = __m11;
const { setHTML } = __m11;
const { on } = __m11;
const { icon } = __m13;
const { subjectBadge } = __m13;
const { subjectIcon } = __m13;
const { toast } = __m16;
const { openSheet } = __m14;
const { confirmDialog } = __m14;
const { promptDialog } = __m14;
const { dayLabel } = __m15;
const { dateLong } = __m15;
const { dateShort } = __m15;
const { durationText } = __m15;
const { statusPill } = __m19;
const { startCancel } = __m19;
const { openClassSheet } = __m19;
const { openAttendanceSheet } = __m19;
const { openBookingSheet } = __m20;
const { saveFile } = __m23;
const { onClaude } = __m23;
const { getTheme } = __m24;
const { setTheme } = __m24;
const { motionReduced } = __m26;
const { setReducedMotion } = __m26;
let kq = '', kf = 'semua', kn = 30;
const KF = [['semua', 'Semua'], ['akan', 'Akan datang'], ['selesai', 'Selesai'], ['batal', 'Dibatalkan']];
function kelasPaint(el) {
const n = now();
const q = normalize(kq.trim());
const all = sortByTime(state.bookings).reverse();
const list = all.filter(b => {
const st = computeStatus(b, n);
if (kf === 'akan' && st !== 'upcoming') return false;
if (kf === 'selesai' && st !== 'ended') return false;
if (kf === 'batal' && st !== 'cancelled') return false;
return !q || normalize([b.subject, b.teacher, b.date, b.date.split('-').reverse().join('/'), b.notes || ''].join(' ')).includes(q);
});
const body = el.querySelector('[data-klist]');
setHTML(body, list.length ? html`<div class="adm-list">${list.slice(0, kn).map(b => {
const st = computeStatus(b, n);
return html`<div class="adm-row st-${st}" style="--c:${subjectColor(b.subject)}">${subjectBadge(b.subject, 'md')}
<button type="button" class="adm-main" data-open="${b.id}"><b>${b.subject}</b><span>${b.teacher}${b.autoGenerated ? ' · jadual tetap' : ''}${b.recorded ? ' · direkod admin' : ''}</span></button>
<span class="adm-when"><b>${dayLabel(b.date, n)}</b><span>${b.from}–${b.to} · ${durationText(b.from, b.to)}</span></span>
${statusPill(st)}
<span class="adm-acts">
${st === 'cancelled' ? html`<button type="button" class="btn ghost sm" data-restore="${b.id}">${icon('undo', 15)}<span>Pulihkan</span></button>` : html`
<button type="button" class="btn ghost sm" data-edit="${b.id}">${icon('kelas', 15)}<span>Edit</span></button>
${st !== 'upcoming' ? html`<button type="button" class="btn ghost sm" data-att="${b.id}">${icon('check', 15)}<span>${isMarked(b) ? 'Kehadiran' : 'Tanda'}</span></button>` : ''}
<button type="button" class="btn ghost sm danger-text" data-kcancel="${b.id}">${icon('trash', 15)}<span>Batal</span></button>`}
</span></div>`;
})}</div>${list.length > kn ? html`<div class="more-row"><button type="button" class="btn ghost" data-kmore>Tunjuk ${Math.min(30, list.length - kn)} lagi</button></div>` : ''}`
: html`<div class="empty"><b>Tiada kelas dijumpai</b><p>${q ? 'Cuba kata kunci lain.' : 'Belum ada kelas dalam kategori ini.'}</p></div>`);
el.querySelectorAll('[data-kf]').forEach(c => c.classList.toggle('is-on', c.dataset.kf === kf));
const cnt = el.querySelector('[data-kcount]');
if (cnt) cnt.textContent = list.length + ' kelas';
}
const kelasView = {
id: 'kelas',
render(el) {
setHTML(el, html`
<div class="page-head"><div><h2 class="page-title">Edit kelas</h2><p class="page-sub">Tambah, ubah atau batalkan mana-mana kelas, termasuk kelas yang terlupa dimasukkan. Perubahan dari halaman ini tidak menghantar notifikasi kepada kelas.</p></div>
<div class="page-tools"><span class="pill gold">${icon('key', 13)} Admin</span><button type="button" class="btn primary" data-kadd>${icon('plus', 18)}<span>Tambah kelas</span></button></div></div>
<div class="adm-tools">
<label class="search-box">${icon('search', 16)}<input class="input" type="search" placeholder="Cari subjek, guru atau tarikh" aria-label="Cari kelas" value="${kq}" data-kq></label>
<div class="chip-row">${KF.map(([id, l]) => html`<button type="button" class="chip" data-kf="${id}">${l}</button>`)}</div>
<span class="muted" data-kcount></span>
</div>
<div data-klist></div>`);
if (!el.dataset.wired) {
el.dataset.wired = '1';
on(el, 'input', '[data-kq]', (e, inp) => { kq = inp.value; kn = 30; kelasPaint(el); });
on(el, 'click', '[data-kf]', (e, b) => { kf = b.dataset.kf; kn = 30; kelasPaint(el); });
on(el, 'click', '[data-kmore]', () => { kn += 30; kelasPaint(el); });
on(el, 'click', '[data-open]', (e, b) => openClassSheet(b.dataset.open));
on(el, 'click', '[data-edit]', (e, b) => openBookingSheet({ editId: b.dataset.edit, silent: true }));
on(el, 'click', '[data-kadd]', () => openBookingSheet({ record: true, prefill: { date: isoDate(now()) },
onDone: (b, x) => { if (b && x && x.markAttendance) openAttendanceSheet(b.id); } }));
on(el, 'click', '[data-att]', (e, b) => openAttendanceSheet(b.dataset.att));
on(el, 'click', '[data-kcancel]', (e, b) => startCancel(b.dataset.kcancel, { silent: true }));
on(el, 'click', '[data-restore]', async (e, b) => { const r = await restoreBooking(b.dataset.restore); toast(r.ok ? 'Kelas dipulihkan' : r.message, r.ok ? 'success' : 'error'); });
}
kelasPaint(el);
},
update(reason) { if (reason === 'notifications' || reason === 'users' || reason === 'activity') return; const el = document.querySelector('[data-view="kelas"]'); if (el && el.querySelector('[data-klist]')) kelasPaint(el); }
};
function teacherSelect(subject, sel) {
const ws = (state.config.workshopTeachers && state.config.workshopTeachers[subject]) || [];
return html`<optgroup label="Guru subjek ini"><option value="primary"${sel === 'primary' ? ' selected' : ''}>${defaultTeacherFor(state.config, subject) || '—'}</option></optgroup>
${ws.length ? html`<optgroup label="Guru bengkel">${ws.map(n => html`<option value="${'workshop:' + n}">${n}</option>`)}</optgroup>` : ''}
<optgroup label="Lain-lain"><option value="manual">Guru lain…</option></optgroup>`;
}
function tetapBoard(el) {
const items = (state.config.recurringTemplates || []).slice().sort((a, b) => (WEEK_ORDER.indexOf(a.day) - WEEK_ORDER.indexOf(b.day)) || a.from.localeCompare(b.from));
const n = now();
setHTML(el.querySelector('[data-board]'), html`<div class="wboard">${WEEK_ORDER.map(d => {
const list = items.filter(t => t.day === d);
return html`<div class="wcol${d === ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][n.getDay()] ? ' is-today' : ''}">
<span class="wcol-h">${DAY_MY[d]}</span>
${list.length ? list.map(t => html`<div class="wcard" style="--c:${subjectColor(t.subject)}"><b>${subjectIcon(t.subject, 15)}${t.subject}</b><span>${t.from}–${t.to}</span><span class="muted">${t.teacher}</span>
<button type="button" class="icon-btn wcard-x" data-rtdel="${t.id}" aria-label="Buang ${t.subject} ${DAY_MY[d]}">${icon('x', 15)}</button></div>`) : html`<span class="wcol-empty">—</span>`}
</div>`;
})}</div>${items.length ? '' : html`<p class="muted board-note">Belum ada jadual tetap. Tambah kelas yang berulang setiap minggu di atas.</p>`}`);
}
const tetapView = {
id: 'tetap',
render(el) {
const first = SUBJECTS[0].name;
setHTML(el, html`
<div class="page-head"><div><h2 class="page-title">Jadual tetap</h2><p class="page-sub">Kelas yang berulang setiap minggu. Kelas minggu semasa dijana secara automatik; minggu berikutnya muncul pada hari Ahad.</p></div>
<span class="pill gold">${icon('key', 13)} Admin</span></div>
<section class="tile rt-form">
<form novalidate data-rtform>
<div class="rt-grid">
<label class="field"><span class="field-label">Subjek</span><select class="input" data-rt="subject">${SUBJECTS.map(s => html`<option value="${s.name}">${s.name}</option>`)}</select></label>
<label class="field"><span class="field-label">Guru</span><select class="input" data-rt="teacher">${teacherSelect(first, 'primary')}</select></label>
<label class="field" hidden data-rt-manual><span class="field-label">Nama guru</span><input class="input" type="text" autocomplete="off" placeholder="Contoh: Cikgu Ahmad" data-rt="manual"></label>
<label class="field"><span class="field-label">Hari</span><select class="input" data-rt="day">${WEEK_ORDER.map(d => html`<option value="${d}">${DAY_MY[d]}</option>`)}</select></label>
<label class="field"><span class="field-label">Mula</span><input class="input" type="time" step="300" value="14:30" data-rt="from"></label>
<label class="field"><span class="field-label">Tamat</span><input class="input" type="time" step="300" value="16:00" data-rt="to"></label>
</div>
<p class="form-error" role="alert" hidden></p>
<div class="form-actions"><button type="submit" class="btn primary">${icon('plus', 18)}<span>Tambah jadual tetap</span></button></div>
</form>
</section>
<div class="section-label"><h3>Minggu tetap</h3><span class="muted">${(state.config.recurringTemplates || []).length} kelas setiap minggu</span></div>
<section class="tile board-tile" data-board></section>`);
tetapBoard(el);
const $ = k => el.querySelector('[data-rt="' + k + '"]');
$('subject').addEventListener('change', () => { setHTML($('teacher'), teacherSelect($('subject').value, 'primary')); el.querySelector('[data-rt-manual]').hidden = true; });
$('teacher').addEventListener('change', () => { const m = el.querySelector('[data-rt-manual]'); m.hidden = $('teacher').value !== 'manual'; if (!m.hidden) $('manual').focus(); });
el.querySelector('[data-rtform]').addEventListener('submit', async e => {
e.preventDefault();
const err = el.querySelector('.rt-form .form-error');
err.hidden = true;
const subject = $('subject').value, sel = $('teacher').value;
const teacher = sel === 'primary' ? defaultTeacherFor(state.config, subject) : sel === 'manual' ? $('manual').value.trim() : sel.slice(9);
if (!teacher) { err.textContent = sel === 'manual' ? 'Tulis nama guru.' : 'Subjek ini belum ada guru utama.'; err.hidden = false; return; }
const r = await addTemplate({ subject, teacher, day: $('day').value, from: $('from').value, to: $('to').value });
if (!r.ok) { err.textContent = r.message; err.hidden = false; return; }
toast(subject + ' ditambah: setiap ' + DAY_MY[$('day').value] + ', ' + $('from').value, 'success');
});
if (!el.dataset.wired) {
el.dataset.wired = '1';
on(el, 'click', '[data-rtdel]', async (e, b) => {
const t = (state.config.recurringTemplates || []).find(x => x.id === b.dataset.rtdel);
if (!t) return;
if (!(await confirmDialog({ title: 'Buang jadual tetap?', message: t.subject + ' setiap ' + DAY_MY[t.day] + ', ' + t.from + '–' + t.to + '. Kelas yang sudah dijana kekal dalam jadual.', confirmLabel: 'Buang', tone: 'danger' }))) return;
const r = await removeTemplate(t.id);
toast(r.ok ? 'Jadual tetap dibuang' : r.message, r.ok ? 'info' : 'error');
});
}
},
update(reason) { if (reason !== 'config') return; const el = document.querySelector('[data-view="tetap"]'); if (el && el.querySelector('[data-board]')) { tetapBoard(el); const lab = el.querySelector('.section-label .muted'); if (lab) lab.textContent = (state.config.recurringTemplates || []).length + ' kelas setiap minggu'; } }
};
function sourceText(info) {
if (info.source === 'demo') return { title: 'Data demo', sub: 'Contoh 10 minggu yang dijana, dengan kelas sedang berlangsung.' };
if (info.source === 'import') return { title: 'Sandaran yang diimport', sub: 'Dipulihkan daripada fail .json.' };
return { title: 'Data sebenar', sub: 'Laman asal 5 Sigma, disalin ' + (info.takenAt ? dateShort(isoDate(new Date(info.takenAt))) + ' ' + new Date(info.takenAt).getFullYear() : '5 Okt 2026') + '.' };
}
function sandboxHTML() {
const n = now(), off = getOffset();
const info = dataInfo();
const src = sourceText(info);
return html`<div class="sbx">
<div class="sbx-src">
<span class="field-label">Sumber data</span>
<div class="choice-grid">
<button type="button" class="choice${info.source === 'real' ? ' is-on' : ''}" data-src="real" aria-pressed="${info.source === 'real' ? 'true' : 'false'}"><b>${icon('database', 16)} Data sebenar</b><span>Tempahan, kehadiran dan log dari laman asal (disalin 5 Okt 2026).</span></button>
<button type="button" class="choice${info.source === 'demo' ? ' is-on' : ''}" data-src="demo" aria-pressed="${info.source === 'demo' ? 'true' : 'false'}"><b>${icon('spark', 16)} Data demo</b><span>Contoh 10 minggu, ada kelas sedang berlangsung. Untuk mencuba semua fungsi.</span></button>
</div>
<p class="muted sbx-note">Sedang digunakan: <b>${src.title}</b>. ${src.sub} Perubahan disimpan dalam pelayar ini sahaja dan tidak dihantar ke laman asal.</p>
</div>
<p class="sbx-state"><span class="pill ${state.persistent ? 'st-ongoing' : 'st-extending'}">${state.persistent ? 'Disimpan dalam pelayar ini' : 'Mod memori'}</span>
<span class="muted">${state.persistent ? 'Data kekal selepas muat semula. Tab lain dalam pelayar yang sama dikemas kini serta-merta.' : 'Storan pelayar disekat di sini: data hilang apabila halaman ditutup.'}</span></p>
<div class="sbx-clock"><div><span class="field-label">Jam aplikasi</span><b data-sbx-time>${dateLong(isoDate(n))}, ${pad2(n.getHours())}:${pad2(n.getMinutes())}</b>
<span class="muted">${off ? 'Dianjak ' + (off > 0 ? '+' : '−') + Math.round(Math.abs(off) / 60000) + ' minit daripada masa sebenar' : 'Masa sebenar'}</span></div>
<div class="chip-row"><button type="button" class="chip" data-jump="next">${icon('play', 14)} Lompat ke kelas seterusnya</button><button type="button" class="chip" data-jump="60">+1 jam</button><button type="button" class="chip" data-jump="1440">+1 hari</button>${off ? html`<button type="button" class="chip is-on" data-jump="0">${icon('undo', 14)} Masa sebenar</button>` : ''}</div></div>
<div class="sbx-actions">
<button type="button" class="btn ghost" data-sbx="export">${icon('download', 16)}<span>Eksport sandaran (.json)</span></button>
<label class="btn ghost sbx-file">${icon('upload', 16)}<span>Import sandaran</span><input type="file" accept="application/json,.json" data-sbx-import></label>
<button type="button" class="btn ghost danger-text" data-sbx="reset">${icon('undo', 16)}<span>Set semula ${info.source === 'demo' ? 'data demo' : 'ke data sebenar'}</span></button>
</div>
</div>`;
}
function wireSandbox(root, after) {
on(root, 'click', '[data-src]', async (e, b) => {
const to = b.dataset.src, info = dataInfo();
if (to === info.source) return;
const ok = await confirmDialog({
title: to === 'demo' ? 'Tukar ke data demo?' : 'Kembali ke data sebenar?',
message: to === 'demo' ? 'Data dalam pelayar ini diganti dengan contoh 10 minggu yang dijana. Anda boleh kembali ke data sebenar bila-bila masa.' : 'Data dalam pelayar ini diganti dengan salinan data laman asal (5 Okt 2026). Perubahan yang dibuat di sini akan hilang.',
confirmLabel: to === 'demo' ? 'Guna data demo' : 'Guna data sebenar'
});
if (!ok) return;
setDataSource(to);
refreshNow();
toast(to === 'demo' ? 'Data demo digunakan' : 'Data sebenar dipulihkan', 'success');
if (after) after();
});
on(root, 'click', '[data-jump]', (e, b) => {
const v = b.dataset.jump;
if (v === '0') setOffset(0);
else if (v === 'next') {
const nx = sortByTime(state.bookings.filter(x => !x.cancelledAt && computeStatus(x, now()) === 'upcoming'))[0];
if (!nx) { toast('Tiada kelas akan datang untuk dilompat. Tempah satu, atau guna data demo.', 'info'); return; }
setOffset(getOffset() + (at(nx.date, nx.from).getTime() + 5 * 60000 - now().getTime()));
toast('Jam aplikasi: 5 minit selepas ' + nx.subject + ' bermula', 'info');
} else setOffset(getOffset() + (+v) * 60000);
refreshNow();
if (after) after();
});
on(root, 'click', '[data-sbx]', async (e, b) => {
if (b.dataset.sbx === 'export') {
const r = await saveFile('sandaran-5sigma-' + isoDate(now()) + '.json', exportBackup(), 'application/json');
if (r.ok) toast('Sandaran disimpan', 'success'); else toast(r.message, 'error');
} else if (b.dataset.sbx === 'reset') {
const demo = dataInfo().source === 'demo';
if (!(await confirmDialog({ title: demo ? 'Set semula data demo?' : 'Set semula ke data sebenar?', message: 'Semua tempahan, kehadiran dan perubahan dalam pelayar ini kembali kepada ' + (demo ? 'data demo asal.' : 'salinan data laman asal (5 Okt 2026).'), confirmLabel: 'Set semula', tone: 'danger' }))) return;
setOffset(0); resetDemo(); refreshNow(); toast(demo ? 'Data demo dijana semula' : 'Data sebenar dipulihkan', 'success');
if (after) after();
}
});
on(root, 'change', '[data-sbx-import]', (e, inp) => {
const f = inp.files && inp.files[0];
if (!f) return;
const rd = new FileReader();
rd.onload = () => { const r = importBackup(String(rd.result || '')); toast(r.ok ? 'Sandaran dipulihkan' : r.message, r.ok ? 'success' : 'error'); inp.value = ''; if (after) after(); };
rd.readAsText(f);
});
}
function openSandboxSheet() {
if (!state.isAdmin) return;
const s = openSheet({ title: 'Data', sub: 'Aplikasi ini berjalan dalam pelayar anda, dengan model data yang sama seperti Firestore laman asal.', cls: 'is-dialog sheet-sbx', keepFocus: true, content: sandboxHTML() });
wireSandbox(s.body, () => s.setContent(sandboxHTML()));
}
function tetapanPaint(el) {
const teachers = allKnownTeachers(state.config, state.bookings);
const ws = [];
Object.keys(state.config.workshopTeachers || {}).forEach(sub => (state.config.workshopTeachers[sub] || []).forEach(nm => ws.push({ sub, nm })));
const canNotify = !onClaude && 'Notification' in window;
setHTML(el, html`
<div class="page-head"><div><h2 class="page-title">Tetapan</h2><p class="page-sub">${state.isAdmin ? 'Paparan, guru subjek, guru bengkel dan data.' : 'Paparan, guru subjek dan guru bengkel.'}</p></div></div>
<div class="set-grid">
<section class="tile set-card"><h3>${icon('moon', 18)} Paparan</h3>
<div class="set-row"><div><b>Tema</b><span>Malam ialah rupa asal Langit 5Σ. Subuh lebih cerah untuk siang hari.</span></div>
<div class="seg seg-lg"><button type="button" data-theme-set="dark" class="${getTheme() === 'dark' ? 'is-on' : ''}">${icon('moon', 15)}<span>Malam</span></button><button type="button" data-theme-set="light" class="${getTheme() === 'light' ? 'is-on' : ''}">${icon('sun', 15)}<span>Subuh</span></button></div></div>
<div class="set-row"><div><b>Kurangkan animasi</b><span>Langit menjadi pegun dan peralihan dipendekkan.</span></div>
<button type="button" class="switch${motionReduced() ? ' is-on' : ''}" role="switch" aria-checked="${motionReduced() ? 'true' : 'false'}" data-motion aria-label="Kurangkan animasi"><i></i></button></div>
${canNotify ? html`<div class="set-row"><div><b>Notifikasi peranti</b><span>${Notification.permission === 'granted' ? 'Dibenarkan. Anda akan dimaklumkan walaupun tab tersembunyi.' : Notification.permission === 'denied' ? 'Disekat dalam tetapan pelayar.' : 'Terima makluman kelas baharu dan perubahan di peranti ini.'}</span></div>
${Notification.permission === 'default' ? html`<button type="button" class="btn ghost sm" data-notify>${icon('bell', 15)}<span>Benarkan</span></button>` : html`<span class="pill ${Notification.permission === 'granted' ? 'st-ongoing' : ''}">${Notification.permission === 'granted' ? 'Aktif' : 'Disekat'}</span>`}</div>` : ''}
</section>
<section class="tile set-card set-wide"><h3>${icon('subjek', 18)} Guru utama setiap subjek</h3>
<div class="set-list">${SUBJECTS.map(s => html`<div class="set-row compact"><div class="set-subj">${subjectBadge(s.name, 'sm')}<div><b>${s.name}</b><span>${defaultTeacherFor(state.config, s.name) || 'Belum ditetapkan'}</span></div></div>
<button type="button" class="btn ghost sm" data-subject-edit="${s.name}">${icon('kelas', 15)}<span>Tukar</span></button></div>`)}</div>
</section>
<section class="tile set-card"><h3>${icon('guru', 18)} Jantina guru</h3>
<p class="muted set-note">Digunakan untuk sapaan yang betul.</p>
<div class="set-list">${teachers.length ? teachers.map(t => { const g = state.config.teacherGenders[t]; return html`<div class="set-row compact"><div><b>${t}</b></div>
<div class="seg"><button type="button" class="${g === 'M' ? 'is-on t-info' : ''}" data-gender="${t}" data-g="M" aria-pressed="${g === 'M' ? 'true' : 'false'}">L</button><button type="button" class="${g === 'F' ? 'is-on t-info' : ''}" data-gender="${t}" data-g="F" aria-pressed="${g === 'F' ? 'true' : 'false'}">P</button></div></div>`; }) : html`<p class="muted">Tiada guru lagi.</p>`}</div>
</section>
<section class="tile set-card"><h3>${icon('tetapan', 18)} Guru bengkel</h3>
<p class="muted set-note">Guru tambahan untuk subjek tertentu, boleh dipilih semasa menempah.</p>
<div class="ws-chips">${ws.length ? ws.map(w => html`<span class="ws-chip" style="--c:${subjectColor(w.sub)}"><i class="dot"></i>${w.sub}: <b>${w.nm}</b><button type="button" data-ws-del="${w.sub}|${w.nm}" aria-label="Buang ${w.nm}">${icon('x', 13)}</button></span>`) : html`<p class="muted">Belum ada guru bengkel.</p>`}</div>
<form class="ws-form" novalidate data-ws-form>
<select class="input" data-ws-subject aria-label="Subjek">${SUBJECTS.map(s => html`<option value="${s.name}">${s.name}</option>`)}</select>
<input class="input" type="text" autocomplete="off" placeholder="Nama guru bengkel" aria-label="Nama guru bengkel" data-ws-name>
<button type="submit" class="btn primary">${icon('plus', 16)}<span>Tambah</span></button>
</form>
</section>
${state.isAdmin ? html`<section class="tile set-card set-wide"><h3>${icon('database', 18)} Data <span class="pill">Admin</span></h3><div data-sbx-host>${sandboxHTML()}</div></section>` : ''}
<section class="tile set-card set-wide about"><h3>${icon('info', 18)} Tentang</h3>
<p><b>5 Sigma Class Hub</b> ${APP_VERSION} · Langit 5Σ. Dibina dengan HTML, CSS dan JavaScript tulen (ES modules), tanpa pustaka luar.</p>
<p class="muted">Fon: TeX Gyre Adventor (GUST Font License) dan Inter (SIL Open Font License 1.1). Jadual SPM 2026: Lembaga Peperiksaan, KPM (18 Ogos 2026). Data sebenar: laman asal Jadual Booking Kelas 5 Sigma.</p>
<div class="kbd-list"><span><kbd>Ctrl</kbd> + <kbd>K</kbd> Tanya Sigma</span><span><kbd>Alt</kbd> + <kbd>←</kbd>/<kbd>→</kbd> minggu sebelum/seterusnya dalam Jadual</span><span><kbd>Esc</kbd> tutup panel</span></div>
</section>
</div>`);
}
const tetapanView = {
id: 'tetapan',
render(el) {
tetapanPaint(el);
if (el.dataset.wired) return;
el.dataset.wired = '1';
on(el, 'click', '[data-theme-set]', (e, b) => { setTheme(b.dataset.themeSet, b); setTimeout(() => tetapanPaint(el), 80); });
on(el, 'click', '[data-motion]', () => { setReducedMotion(!motionReduced()); tetapanPaint(el); });
on(el, 'click', '[data-notify]', async () => { try { const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Notifikasi peranti diaktifkan' : 'Notifikasi peranti tidak dibenarkan', p === 'granted' ? 'success' : 'info'); } catch (err) { /* ignore */ } tetapanPaint(el); });
on(el, 'click', '[data-subject-edit]', async (e, b) => {
const sub = b.dataset.subjectEdit;
const v = await promptDialog({ title: 'Guru utama ' + sub, label: 'Nama guru', value: defaultTeacherFor(state.config, sub) || '', placeholder: 'Contoh: Cikgu Rahim' });
if (v == null) return;
const r = await setSubjectTeacher(sub, v);
toast(r.ok ? 'Guru utama ' + sub + ': ' + v.trim() : r.message, r.ok ? 'success' : 'error');
});
on(el, 'click', '[data-gender]', async (e, b) => { const r = await setTeacherGender(b.dataset.gender, b.dataset.g); if (!r.ok) toast(r.message, 'error'); });
on(el, 'click', '[data-ws-del]', async (e, b) => { const [sub, nm] = b.dataset.wsDel.split('|'); const r = await removeWorkshopTeacher(sub, nm); toast(r.ok ? nm + ' dibuang' : r.message, r.ok ? 'info' : 'error'); });
on(el, 'submit', '[data-ws-form]', async e => {
e.preventDefault();
const sub = el.querySelector('[data-ws-subject]').value, nm = el.querySelector('[data-ws-name]').value;
const r = await addWorkshopTeacher(sub, nm);
toast(r.ok ? 'Guru bengkel ditambah untuk ' + sub : r.message, r.ok ? 'success' : 'error');
});
wireSandbox(el, () => { const h = el.querySelector('[data-sbx-host]'); if (h) setHTML(h, sandboxHTML()); });
},
update(reason) {
if (reason !== 'config' && reason !== 'bookings') return;
const el = document.querySelector('[data-view="tetapan"]');
if (!el || (el.contains(document.activeElement) && document.activeElement.matches('input, select'))) return;
const y = window.scrollY; tetapanPaint(el); window.scrollTo(0, y);
}
};
return { kelasView, tetapView, openSandboxSheet, tetapanView };
})();
const __m33 = (() => {
const { state } = __m1;
const { now } = __m7;
const { onSecond } = __m7;
const { isoDate } = __m4;
const { at } = __m4;
const { pad2 } = __m4;
const { subjectColor } = __m5;
const { STUDENT_NAMES } = __m5;
const { SPM } = __m5;
const { computeStatus } = __m9;
const { sortByTime } = __m9;
const { rosterFor } = __m9;
const { onTimeNames } = __m9;
const { html } = __m11;
const { setHTML } = __m11;
const { on } = __m11;
const { create } = __m11;
const { prefersReducedMotion } = __m11;
const { icon } = __m13;
const { subjectBadge } = __m13;
const { subjectIcon } = __m13;
const { navigate } = __m10;
const { dayLabel } = __m15;
const { dateLong } = __m15;
const { minutesText } = __m15;
const { personName } = __m15;
const { durationText } = __m15;
const { constellationHTML } = __m17;
const { toggleTheme } = __m24;
const { getTheme } = __m24;
let root = null, stopTick = null, wake = null;
let shownKey = '', seen = null;
function focusClass(n) {
const today = isoDate(n);
const list = sortByTime(state.bookings.filter(b => !b.cancelledAt && b.date === today));
const live = list.find(b => { const s = computeStatus(b, n); return s === 'ongoing' || s === 'extending'; });
if (live) return { b: live, live: true };
const soon = list.find(b => computeStatus(b, n) === 'upcoming' && at(b.date, b.from) - n <= 15 * 60000);
return soon ? { b: soon, live: false } : null;
}
function clockHTML(n) { return html`${pad2(n.getHours())}:${pad2(n.getMinutes())}<small>:${pad2(n.getSeconds())}</small>`; }
function liveHTML(f, n) {
const b = f.b;
const roster = rosterFor(b.subject);
const starred = onTimeNames(b).filter(x => roster.includes(x));
const marked = b.attendance && Object.keys(b.attendance).length > 0;
const lit = {};
starred.forEach(x => { lit[x] = true; });
const start = at(b.date, b.from).getTime(), end = at(b.date, b.to).getTime();
const rest = sortByTime(state.bookings.filter(x => !x.cancelledAt && x.id !== b.id && x.date === b.date && computeStatus(x, n) === 'upcoming'));
return html`
<main class="disp-main">
<section class="disp-class">
<div class="disp-head">${subjectBadge(b.subject, 'xl', 'is-solid')}<span class="disp-eyebrow${f.live ? ' is-live' : ''}">${f.live ? html`<i class="pulse"></i>${b.extensionActive ? 'Sedang extend' : 'Sedang berlangsung'}` : html`${icon('clock', 18)}<span data-starts>Bermula dalam ${Math.max(1, Math.ceil((start - n) / 60000))} minit</span>`}</span></div>
<h1 class="disp-subject">${b.subject}</h1>
<p class="disp-teacher">${b.teacher}${b.notes ? html`<span> · ${b.notes}</span>` : ''}</p>
<div class="disp-time"><b>${b.from}</b><span>–</span><b>${b.to}</b><em>${durationText(b.from, b.to)}</em></div>
<div class="disp-progress" aria-hidden="true"><i data-progress style="width:${f.live ? Math.min(100, Math.max(0, (n - start) / (end - start) * 100)).toFixed(2) : 0}%"></i></div>
<p class="disp-left" data-left>${f.live ? leftText(b, n) : 'Bermula pukul ' + b.from}</p>
</section>
<section class="disp-code disp-agenda">
<span class="disp-code-label">${icon('jadual', 18)} Selepas ini hari ini</span>
${rest.length ? html`<ul class="disp-list">${rest.map(x => html`<li style="--c:${subjectColor(x.subject)}">${subjectIcon(x.subject, 20, 'dl-ic')}<b>${x.from}</b><span>${x.subject}</span><em>${x.teacher}</em></li>`)}</ul>` : html`<p class="disp-none">Tiada lagi kelas selepas ini.</p>`}
<p class="disp-rule">${icon('star', 18)}<span>Hadir tepat masa = <b>1 bintang skibidi</b>. Lewat tidak dapat bintang.</span></p>
</section>
</main>
<footer class="disp-foot">
<div class="disp-sky">${constellationHTML({ static: true, names: roster, lit, cls: 'is-display', label: 'Bintang skibidi ' + b.subject })}</div>
<div class="disp-tally">
<p class="tally-big"><b>${starred.length}</b><span>/${roster.length}</span></p>
<p class="tally-cap">${marked ? html`bintang skibidi${starred.length === roster.length ? html` · <span class="gold">semua tepat masa!</span>` : ''}` : 'Kehadiran belum ditanda'}</p>
</div>
</footer>`;
}
function leftText(b, n) {
const end = at(b.date, b.to).getTime();
const ms = end - n.getTime();
if (ms < 0) return '+' + Math.floor(-ms / 60000) + ' minit lebih masa (extend)';
const m = Math.ceil(ms / 60000);
return minutesText(m) + ' lagi';
}
function idleHTML(n) {
const today = isoDate(n);
const next = sortByTime(state.bookings.filter(b => !b.cancelledAt && computeStatus(b, n) === 'upcoming'))[0];
const rest = sortByTime(state.bookings.filter(b => !b.cancelledAt && b.date === today && computeStatus(b, n) === 'upcoming'));
const online = STUDENT_NAMES.filter(x => state.users[x] && state.users[x].lastSeen && Date.now() - state.users[x].lastSeen.getTime() < 5 * 60000);
const spmDays = Math.max(0, Math.round((new Date(SPM.writtenStart + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000));
return html`
<main class="disp-main is-idle">
<section class="disp-class">
<span class="disp-eyebrow">${icon('orbit', 18)} Tiada kelas sedang berlangsung</span>
${next ? html`<div class="disp-head" style="--c:${subjectColor(next.subject)}">${subjectBadge(next.subject, 'xl')}</div><h1 class="disp-subject" style="--c:${subjectColor(next.subject)}">${next.subject}</h1>
<p class="disp-teacher">Kelas seterusnya · ${dayLabel(next.date, n)}, ${next.from}–${next.to} · ${next.teacher}</p>
<div class="disp-count" data-next="${at(next.date, next.from).getTime()}">${countText(at(next.date, next.from) - n)}</div>
<p class="disp-left">${at(next.date, next.from) - n < 86400000 ? 'jam : minit : saat' : 'hari lagi'}</p>`
: html`<h1 class="disp-subject">Langit lapang</h1><p class="disp-teacher">Belum ada kelas akan datang dalam jadual.</p>`}
</section>
<section class="disp-code disp-agenda">
<span class="disp-code-label">${icon('jadual', 18)} Baki kelas hari ini</span>
${rest.length ? html`<ul class="disp-list">${rest.map(b => html`<li style="--c:${subjectColor(b.subject)}">${subjectIcon(b.subject, 20, 'dl-ic')}<b>${b.from}</b><span>${b.subject}</span><em>${b.teacher}</em></li>`)}</ul>` : html`<p class="disp-none">Tiada lagi kelas hari ini.</p>`}
<div class="disp-spm"><b>${spmDays}</b><span>hari lagi ke SPM bertulis</span></div>
</section>
</main>
<footer class="disp-foot">
<div class="disp-sky">${constellationHTML({ static: true, online, cls: 'is-display', label: 'Rakan sekelas' })}</div>
<div class="disp-tally"><p class="tally-big"><b>${online.length}</b><span>/${STUDENT_NAMES.length}</span></p><p class="tally-cap">rakan sedang aktif dalam aplikasi</p></div>
</footer>`;
}
function countText(ms) {
if (ms >= 86400000) return String(Math.ceil(ms / 86400000));
const s = Math.max(0, Math.floor(ms / 1000));
return pad2(Math.floor(s / 3600)) + ':' + pad2(Math.floor((s % 3600) / 60)) + ':' + pad2(s % 60);
}
function paint() {
if (!root) return;
const n = now();
const f = focusClass(n);
const key = f ? f.b.id + (f.live ? ':live' : ':soon') : 'idle';
const fresh = [];
if (f) {
const names = onTimeNames(f.b);
if (seen && shownKey === key) names.forEach(x => { if (!seen.has(x)) fresh.push(x); });
seen = new Set(names);
} else seen = null;
shownKey = key;
let host = root.querySelector('.disp-host');
if (!host) {
setHTML(root, html`<div class="disp-host"></div><div class="disp-flash" aria-live="polite"></div>`);
host = root.querySelector('.disp-host');
}
const same = host.firstElementChild && host.firstElementChild.dataset.key === key;
setHTML(host, html`<div class="disp${f ? ' has-class' : ''}${same ? ' is-static' : ''}" data-key="${key}" style="--c:${f ? subjectColor(f.b.subject) : 'var(--gold)'}">
<header class="disp-top">
<div class="disp-brand"><span class="disp-mark"><span class="mark">5<i>Σ</i></span></span><div><b>Paparan Kelas</b><span>5 Sigma · ${dateLong(isoDate(n))}</span></div></div>
<div class="disp-clock" data-clock>${clockHTML(n)}</div>
<div class="disp-tools">
${document.fullscreenEnabled ? html`<button type="button" class="icon-btn" data-fs aria-label="Skrin penuh" title="Skrin penuh">${icon('expand', 20)}</button>` : ''}
<button type="button" class="icon-btn" data-theme aria-label="Tukar tema" title="Tukar tema">${icon(getTheme() === 'dark' ? 'sun' : 'moon', 20)}</button>
<button type="button" class="btn ghost sm" data-exit>${icon('x', 16)}<span>Tutup</span></button>
</div>
</header>
${f ? liveHTML(f, n) : idleHTML(n)}
</div>`);
if (fresh.length > 3) celebrate(fresh, fresh.length + ' bintang skibidi', 'baru ditanda');
else fresh.forEach((x, i) => setTimeout(() => celebrate([x], personName(x), '+1 bintang skibidi'), i * 450));
}
function celebrate(names, title, sub) {
if (!root) return;
names.forEach(name => {
const star = root.querySelector('.disp-sky [data-star="' + name + '"]');
if (star) { star.classList.remove('is-new'); void star.offsetWidth; star.classList.add('is-new'); }
});
const flash = root.querySelector('.disp-flash');
if (!flash) return;
const el = create('div', { class: 'flash-item' }, html`${icon('star', 22)}<b>${title}</b><span>${sub}</span>`);
flash.appendChild(el);
setTimeout(() => el.remove(), prefersReducedMotion() ? 1500 : 3200);
}
function tick(n) {
if (!root || !root.isConnected) return;
const f = focusClass(n);
const key = f ? f.b.id + (f.live ? ':live' : ':soon') : 'idle';
if (key !== shownKey) { paint(); return; }
const clock = root.querySelector('[data-clock]');
if (clock) setHTML(clock, clockHTML(n));
if (f) {
const start = at(f.b.date, f.b.from).getTime(), end = at(f.b.date, f.b.to).getTime();
const bar = root.querySelector('[data-progress]');
if (bar && f.live) bar.style.width = Math.min(100, Math.max(0, (n - start) / (end - start) * 100)).toFixed(2) + '%';
const lt = root.querySelector('[data-left]');
if (lt && f.live) lt.textContent = leftText(f.b, n);
const st = root.querySelector('[data-starts]');
if (st) st.textContent = 'Bermula dalam ' + Math.max(1, Math.ceil((start - n) / 60000)) + ' minit';
} else {
const c = root.querySelector('[data-next]');
if (c) { const ms = +c.dataset.next - n.getTime(); if (ms <= 0) { paint(); return; } c.textContent = countText(ms); }
}
}
async function keepAwake() {
try {
if (!('wakeLock' in navigator) || (wake && !wake.released)) return;
wake = await navigator.wakeLock.request('screen');
} catch (e) { wake = null; }
}
function onVisible() { if (!document.hidden && root && root.isConnected && document.documentElement.dataset.page === 'paparan') keepAwake(); }
const paparanView = {
id: 'paparan',
render(el) {
root = el;
shownKey = ''; seen = null;
setHTML(el, '');
paint();
if (!stopTick) stopTick = onSecond(tick);
keepAwake();
if (!el.dataset.wired) {
el.dataset.wired = '1';
on(el, 'click', '[data-exit]', () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); navigate('utama'); });
on(el, 'click', '[data-fs]', () => {
if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
else document.documentElement.requestFullscreen().catch(() => {});
});
on(el, 'click', '[data-theme]', (e, b) => { toggleTheme(b); setTimeout(paint, 60); });
document.addEventListener('visibilitychange', onVisible);
}
},
update(reason) {
if (reason === 'activity' || reason === 'notifications') return;
if (reason === 'users' && shownKey !== 'idle') return;
paint();
},
leave() {
if (stopTick) { stopTick(); stopTick = null; }
if (wake) { try { wake.release(); } catch (e) { /* ignore */ } wake = null; }
root = null;
}
};
return { paparanView };
})();
const __m35 = (() => {
const { isoDate } = __m4;
const { addDays } = __m4;
const { startOfWeek } = __m4;
const { minutesToTime } = __m4;
const { pad2 } = __m4;
const { SUBJECTS } = __m5;
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
function normalizeText(raw) {
let s = ' ' + String(raw || '').toLowerCase().replace(/[\u201C\u201D"'`\u2019?!,;()]/g, ' ').replace(/\s+/g, ' ') + ' ';
SLANG.forEach(([re, to]) => { s = s.replace(re, to); });
return s.replace(/\s+/g, ' ').trim();
}
const ALIASES = [];
SUBJECTS.forEach(sub => sub.aliases.forEach(a => ALIASES.push({ a, name: sub.name })));
ALIASES.sort((x, y) => y.a.length - x.a.length);
function findSubject(text) {
const t = ' ' + text + ' ';
for (const { a, name } of ALIASES) {
const i = t.indexOf(' ' + a + ' ');
if (i !== -1) return { name, at: i, alias: a };
}
return null;
}
function hourWithContext(h, m, mer, weekend) {
if (mer === 'pagi' || mer === 'am') return { h: h === 12 ? 0 : h, m };
if (mer === 'petang' || mer === 'pm' || mer === 'tengah hari') return { h: h < 12 ? h + 12 : h, m };
if (mer === 'malam') return { h: h < 12 ? h + 12 : h, m };
if (h >= 13) return { h, m };
if (h <= 6) return { h: h + 12, m };
if (h <= 10) return { h: weekend ? h : h + 12, m };
return { h, m };
}
const MER = '(pagi|petang|malam|tengah hari|am|pm)';
const T = '(\\d{1,2})(?:[:.](\\d{2}))?\\s*(setengah)?';
function findTimes(text, weekend) {
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
function findDuration(text) {
let m = text.match(/(\d+(?:[.,]5)?)\s*jam(?:\s*setengah)?/);
if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 60 + (/jam\s*setengah/.test(m[0]) ? 30 : 0));
if (/\bsejam setengah\b/.test(text)) return 90;
if (/\bsejam\b/.test(text)) return 60;
if (/\bsetengah jam\b/.test(text)) return 30;
m = text.match(/(\d+)\s*(minit|min|mins|minutes)\b/);
if (m) return +m[1];
return null;
}
function findDates(text, now) {
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
const VIEWS = { 'jadual spm': 'spm', 'jadual peperiksaan': 'spm', 'paparan kelas': 'paparan', paparan: 'paparan', statistik: 'statistik', stats: 'statistik', analitik: 'statistik', jadual: 'jadual', kalendar: 'jadual', tetapan: 'tetapan', settings: 'tetapan', guru: 'guru', subjek: 'subjek', pengguna: 'pengguna', rakan: 'pengguna', 'tempah slot': 'tempah', borang: 'tempah', 'edit kelas': 'kelas', 'jadual tetap': 'tetap', dashboard: 'utama', utama: 'utama', home: 'utama' };
function parse(raw, now) {
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
function timeLabel(from, to) { return to ? from + '–' + to : from; }
function addMinutesTo(hhmm, mins) { const [h, m] = hhmm.split(':').map(Number); return minutesToTime(h * 60 + m + mins); }
return { normalizeText, findSubject, findTimes, findDuration, findDates, parse, timeLabel, addMinutesTo };
})();
const __m34 = (() => {
const { state } = __m1;
const { createBooking } = __m1;
const { isStudent } = __m1;
const { findBooking } = __m1;
const { now } = __m7;
const { isoDate } = __m4;
const { addDays } = __m4;
const { at } = __m4;
const { timesOverlap } = __m4;
const { toMinutes } = __m4;
const { SUBJECTS } = __m5;
const { SPM } = __m5;
const { CLASS_PAPERS } = __m5;
const { papersOf } = __m5;
const { SCHOOL_HOURS } = __m5;
const { JS_DAYS } = __m5;
const { subjectColor } = __m5;
const { computeStatus } = __m9;
const { sortByTime } = __m9;
const { findClashes } = __m9;
const { defaultTeacherFor } = __m9;
const { attendanceFor } = __m9;
const { attendanceOverall } = __m9;
const { atRiskStudents } = __m9;
const { streakFor } = __m9;
const { starsFrom } = __m9;
const { onTimeNames } = __m9;
const { rosterFor } = __m9;
const { findSlots } = __m21;
const { parse } = __m35;
const { addMinutesTo } = __m35;
const { getSample } = __m23;
const { onClaude } = __m23;
const { html } = __m11;
const { raw } = __m11;
const { setHTML } = __m11;
const { on } = __m11;
const { create } = __m11;
const { esc } = __m4;
const { icon } = __m13;
const { subjectBadge } = __m13;
const { toast } = __m16;
const { navigate } = __m10;
const { dayLabel } = __m15;
const { dayPhrase } = __m15;
const { dateShort } = __m15;
const { rangeShort } = __m15;
const { personName } = __m15;
const { firstName } = __m15;
const { greeting } = __m15;
const { minutesText } = __m15;
const { durationText } = __m15;
const { statusPill } = __m19;
const { openClassSheet } = __m19;
const { startCancel } = __m19;
const { openBookingSheet } = __m20;
const { classPapers } = __m25;
const { toggleTheme } = __m24;
const SUGGESTIONS = ['Kelas apa sekarang?', 'Jadual esok', 'Slot kosong esok untuk Fizik', 'Tempah Kimia lusa 3 petang', 'Kehadiran saya', 'Bila SPM Fizik?'];
let panel = null, list = null, input = null, sendBtn = null, scrim = null;
let sample = null, history = [], ctl = null, voice = false;
const pending = new Map();   // confirm-card id -> booking fields
let seq = 0;
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
function openAssistant(q) {
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
function closeAssistant() {
if (!panel || panel.hidden) return;
panel.classList.remove('is-open'); scrim.classList.remove('is-open');
document.documentElement.classList.remove('ai-open');
setTimeout(() => { if (!panel.classList.contains('is-open')) { panel.hidden = true; scrim.hidden = true; } }, 280);
}
function resetAssistant() {
if (ctl) ctl.abort();
history = []; pending.clear();
if (list) setHTML(list, '');
closeAssistant();
}
function initAssistant() {
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
return { openAssistant, closeAssistant, resetAssistant, initAssistant };
})();
const __m36 = (() => {
const { hexToRgb } = __m4;
function initSky(canvas) {
const ctx = canvas.getContext('2d', { alpha: false });
const neb = document.createElement('canvas');
const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let still = reduce;
let w = 0, h = 0, dpr = 1, stars = [];
let tints = ['#7C3AED', '#2563EB', '#E11D48'];
let theme = 'dark';
let px = 0, py = 0, tx = 0, ty = 0;
let warpAt = 0;
let last = 0, raf = 0, frameMs = 33;
let meteor = null, nextMeteor = performance.now() + 4000 + Math.random() * 5000;
function resize() {
dpr = Math.min(1.5, window.devicePixelRatio || 1);
w = window.innerWidth; h = window.innerHeight;
canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
neb.width = canvas.width; neb.height = canvas.height;
const count = Math.min(900, Math.round((w * h) / 2300));
stars = [];
for (let i = 0; i < count; i++) {
const z = Math.random();
stars.push({ x: Math.random() * w, y: Math.random() * h, z, r: 0.35 + z * z * 1.5, tw: Math.random() * Math.PI * 2, sp: 0.6 + Math.random() * 2.2, gold: Math.random() < 0.06 });
}
paintNebula();
if (still) draw(performance.now());
}
function paintNebula() {
const c = neb.getContext('2d');
const W = neb.width, H = neb.height;
const g = c.createLinearGradient(0, 0, 0, H);
if (theme === 'dark') { g.addColorStop(0, '#04050F'); g.addColorStop(0.55, '#080C26'); g.addColorStop(1, '#0E1340'); }
else { g.addColorStop(0, '#E9E8F8'); g.addColorStop(0.6, '#F3EEF6'); g.addColorStop(1, '#FCEBDD'); }
c.globalCompositeOperation = 'source-over';
c.fillStyle = g; c.fillRect(0, 0, W, H);
const spots = [[0.82, 0.12, 0.75], [0.12, 0.78, 0.65], [0.55, 0.55, 0.5], [0.3, 0.18, 0.42]];
c.globalCompositeOperation = theme === 'dark' ? 'lighter' : 'multiply';
tints.slice(0, 4).forEach((hex, i) => {
const [r, gg, b] = hexToRgb(hex);
const s = spots[i % spots.length];
const rad = Math.max(W, H) * s[2];
const grd = c.createRadialGradient(W * s[0], H * s[1], 0, W * s[0], H * s[1], rad);
const a = theme === 'dark' ? (i === 0 ? 0.34 : 0.2) : (i === 0 ? 0.16 : 0.1);
grd.addColorStop(0, `rgba(${r},${gg},${b},${a})`);
grd.addColorStop(0.45, `rgba(${r},${gg},${b},${a * 0.35})`);
grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
c.fillStyle = grd; c.fillRect(0, 0, W, H);
});
c.globalCompositeOperation = 'source-over';
}
function draw(t) {
ctx.setTransform(1, 0, 0, 1, 0, 0);
ctx.drawImage(neb, 0, 0);
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
px += (tx - px) * 0.05; py += (ty - py) * 0.05;
const warp = warpAt ? Math.min(1, (t - warpAt) / 1100) : 0;
const cx = w / 2, cy = h / 2;
const night = theme === 'dark';
const e = warp ? warp * warp * (3 - 2 * warp) : 0;
for (let i = 0; i < stars.length; i++) {
const s = stars[i];
const twinkle = still ? 0.8 : 0.55 + 0.45 * Math.sin(t / 1000 * s.sp + s.tw);
let x = s.x + px * (0.2 + s.z) * 18, y = s.y + py * (0.2 + s.z) * 12;
x = ((x % w) + w) % w; y = ((y % h) + h) % h;
const alpha = (night ? 0.25 + s.z * 0.75 : 0.12 + s.z * 0.3) * twinkle;
if (warp) {
const k1 = 1 + Math.max(0, e - 0.08) * (2 + s.z * 6), k2 = 1 + e * (2 + s.z * 6);
ctx.strokeStyle = s.gold ? `rgba(255,214,120,${Math.min(1, alpha + e)})` : `rgba(225,230,255,${Math.min(1, alpha + e)})`;
ctx.lineWidth = s.r * (1 + e * 1.5);
ctx.beginPath();
ctx.moveTo(cx + (x - cx) * k1, cy + (y - cy) * k1);
ctx.lineTo(cx + (x - cx) * k2, cy + (y - cy) * k2);
ctx.stroke();
} else {
ctx.fillStyle = s.gold ? `rgba(255,207,107,${alpha})` : (night ? `rgba(232,236,255,${alpha})` : `rgba(70,80,160,${alpha})`);
ctx.fillRect(x, y, s.r, s.r);
}
}
if (!warp && night && !still) {
if (!meteor && t > nextMeteor) {
const fromLeft = Math.random() < 0.5;
meteor = { t0: t, x: fromLeft ? w * (0.05 + Math.random() * 0.4) : w * (0.55 + Math.random() * 0.4), y: h * Math.random() * 0.35, dx: fromLeft ? 1 : -1, len: 90 + Math.random() * 90, dur: 700 + Math.random() * 500 };
}
if (meteor) {
const k = (t - meteor.t0) / meteor.dur;
if (k >= 1) { meteor = null; nextMeteor = t + 7000 + Math.random() * 9000; }
else {
const dist = k * Math.min(w, h) * 0.55;
const hx = meteor.x + meteor.dx * dist * 0.87, hy = meteor.y + dist * 0.5;
const tx = hx - meteor.dx * meteor.len * 0.87, ty = hy - meteor.len * 0.5;
const a = Math.sin(k * Math.PI);
const g = ctx.createLinearGradient(hx, hy, tx, ty);
g.addColorStop(0, `rgba(255,244,214,${0.9 * a})`); g.addColorStop(1, 'rgba(255,244,214,0)');
ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
}
}
}
if (warp) {
const flash = Math.max(0, (warp - 0.7) / 0.3);
if (flash > 0) { ctx.fillStyle = `rgba(255,236,190,${flash * 0.55 * (1 - flash)})`; ctx.fillRect(0, 0, w, h); }
if (warp >= 1) warpAt = 0;
}
}
function loop(t) {
raf = requestAnimationFrame(loop);
if (document.hidden) return;
if (t - last < frameMs && !warpAt) return;
last = t;
draw(t);
}
window.addEventListener('resize', () => { clearTimeout(resize._t); resize._t = setTimeout(resize, 120); });
window.addEventListener('pointermove', e => { tx = (e.clientX / window.innerWidth - 0.5); ty = (e.clientY / window.innerHeight - 0.5); }, { passive: true });
resize();
if (!still) raf = requestAnimationFrame(loop); else draw(0);
return {
setTints(list) {
const next = (list && list.length ? list : ['#7C3AED', '#2563EB', '#E11D48']).slice(0, 4);
if (next.join() === tints.join()) return;
tints = next; paintNebula(); if (still) draw(0);
},
setTheme(mode) { if (mode === theme) return; theme = mode; paintNebula(); if (still) draw(0); },
warp() { if (still) return; warpAt = performance.now(); if (!raf) raf = requestAnimationFrame(loop); },
setStill(v) {
still = !!v || reduce;
if (still) { cancelAnimationFrame(raf); raf = 0; draw(performance.now()); }
else if (!raf) raf = requestAnimationFrame(loop);
},
setFps(fps) { frameMs = 1000 / Math.max(1, fps); },
get theme() { return theme; }
};
}
return { initSky };
})();
const __m0 = (() => {
const { initStore } = __m1;
const { state } = __m1;
const { subscribe } = __m1;
const { isOwnNotification } = __m1;
const { initClock } = __m7;
const { now } = __m7;
const { isoDate } = __m4;
const { subjectColor } = __m5;
const { computeStatus } = __m9;
const { sortByTime } = __m9;
const { initRouter } = __m10;
const { registerView } = __m10;
const { startRouter } = __m10;
const { rerender } = __m10;
const { setGuard } = __m10;
const { currentView } = __m10;
const { navigate } = __m10;
const { onNavigate } = __m10;
const { initShell } = __m12;
const { renderShell } = __m12;
const { updateBadge } = __m12;
const { fitDate } = __m12;
const { toast } = __m16;
const { initLogin } = __m17;
const { showLogin } = __m17;
const { refreshLogin } = __m17;
const { dashboardView } = __m18;
const { setDashboardAsk } = __m18;
const { jadualView } = __m27;
const { tempahView } = __m28;
const { guruView } = __m29;
const { subjekView } = __m29;
const { penggunaView } = __m29;
const { statistikView } = __m31;
const { kelasView } = __m32;
const { tetapView } = __m32;
const { tetapanView } = __m32;
const { openSandboxSheet } = __m32;
const { paparanView } = __m33;
const { spmView } = __m25;
const { openNotifications } = __m19;
const { openProfile } = __m19;
const { openClassSheet } = __m19;
const { initAssistant } = __m34;
const { openAssistant } = __m34;
const { resetAssistant } = __m34;
const { onClaude } = __m23;
const { initSky } = __m36;
const { initTheme } = __m24;
const { onTheme } = __m24;
const { getTheme } = __m24;
const { toggleTheme } = __m24;
const { initSpotlight } = __m26;
const { initMotion } = __m26;
const { onMotionChange } = __m26;
const { motionReduced } = __m26;
document.documentElement.lang = 'ms';   // the claude.ai host supplies its own <html>
initTheme();
initMotion();
const sky = initSky(document.getElementById('sky'));
if (motionReduced()) sky.setStill(true);
onMotionChange(on => sky.setStill(on));
sky.setTheme(getTheme());
onTheme(mode => { sky.setTheme(mode); if (state.user) renderShell(); });
const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
initClock();
initStore();
[dashboardView, jadualView, tempahView, guruView, subjekView, spmView, penggunaView, statistikView, kelasView, tetapView, tetapanView, paparanView].forEach(registerView);
setGuard(id => (id !== 'kelas' && id !== 'tetap') || state.isAdmin);
const app = document.getElementById('app');
const loginRoot = document.getElementById('login');
initRouter(document.getElementById('views'));
initShell({
ask: q => openAssistant(q),
notifications: openNotifications,
profile: openProfile,
theme: el => toggleTheme(el),
openClass: id => openClassSheet(id),
sandbox: openSandboxSheet
});
setDashboardAsk(q => openAssistant(q));
tempahView.ask = q => openAssistant(q);
initAssistant();
initSpotlight();
onNavigate(id => {
document.body.classList.toggle('is-display', id === 'paparan');
sky.setFps(id === 'paparan' ? 30 : (coarse ? 10 : 24));
if (id === 'paparan') sky.setTints(skyColors());
});
function skyColors() {
const n = now(), today = isoDate(n);
const list = sortByTime(state.bookings.filter(b => !b.cancelledAt && b.date === today));
const live = list.filter(b => { const s = computeStatus(b, n); return s === 'ongoing' || s === 'extending'; });
const out = [];
live.concat(list).forEach(b => { const c = subjectColor(b.subject); if (out.indexOf(c) === -1) out.push(c); });
return out;
}
function enterApp(opts) {
loginRoot.hidden = true;
document.body.classList.remove('is-login');
renderShell();
app.hidden = false;
fitDate();
if (opts && opts.arrive) {
app.classList.add('is-arriving');
setTimeout(() => app.classList.remove('is-arriving'), 1600);
}
startRouter('utama');
sky.setFps(coarse ? 10 : 24);
}
function enterLogin() {
app.hidden = true;
document.body.classList.add('is-login');
document.body.classList.remove('is-display');
sky.setFps(30);
showLogin();
}
initLogin(loginRoot, ({ warp }) => {
if (warp) { sky.warp(); setTimeout(() => enterApp({ arrive: true }), 650); }
else enterApp({ arrive: false });
});
subscribe((reason, detail) => {
if (reason === 'session') {
if (!state.user) { resetAssistant(); enterLogin(); return; }
return;   // the login view drives the transition in
}
if (reason === 'notifications') {
updateBadge();
const fresh = ((detail && detail.fresh) || []).filter(nf => !isOwnNotification(nf.id));
if (state.user && fresh.length) {
fresh.slice(0, 2).forEach(nf => toast(nf.title, 'info'));
if (!onClaude && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
fresh.slice(0, 3).forEach(nf => { try { new Notification(nf.title, { body: nf.body || '', tag: nf.id }); } catch (e) { /* ignore */ } });
}
}
}
if (reason === 'bookings' || reason === 'tick') sky.setTints(skyColors());
if (!state.user) { if (reason === 'users' || reason === 'config') refreshLogin(); return; }
if (reason === 'config' && currentView()) renderShell();
rerender(reason);
});
document.addEventListener('keydown', e => {
const k = (e.key || '').toLowerCase();
if ((e.metaKey || e.ctrlKey) && (k === 'k' || k === 'j') && state.user) { e.preventDefault(); openAssistant(); }
});
if (state.user) enterApp({ arrive: false }); else enterLogin();
if ('serviceWorker' in navigator && window.isSecureContext && /^https?:$/.test(location.protocol) && !onClaude) {
window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
return {  };
})();
})();

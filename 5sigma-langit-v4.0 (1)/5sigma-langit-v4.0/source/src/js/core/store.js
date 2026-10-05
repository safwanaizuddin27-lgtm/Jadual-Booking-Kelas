/* App state and every action that changes data.

   Views read `state` and subscribe for changes; they never write to the backend
   themselves. Actions return {ok, message?, ...} and leave toasts to the UI.
   Activity log entries and notifications follow the original app's rules
   (silent admin edits, recurring classes stay quiet, and so on). */

import { createFirestore } from './backend.js';
import { buildSeed } from './seed.js';
import { now } from './clock.js';
import { nowMs } from './clock.js';
import { isoDate } from './util.js';
import { toMinutes } from './util.js';
import { minutesToTime } from './util.js';
import { genId } from './util.js';
import { at } from './util.js';
import { DB_KEY } from './data.js';
import { OLD_DB_KEYS } from './data.js';
import { SOURCE_KEY } from './data.js';
import { SESSION_KEY } from './data.js';
import { DEFAULT_SUBJECT_TEACHERS } from './data.js';
import { ADMIN_USER } from './data.js';
import { ADMIN_CODE } from './data.js';
import { stretchCode } from './sha256.js';
import { keyCheck } from './sha256.js';
import { STUDENT_NAMES } from './data.js';
import { computeStatus } from './domain.js';
import { findClashes } from './domain.js';
import { recurringWanted } from './domain.js';
import { recurringMissing } from './domain.js';
import { describeBookingDiff } from './domain.js';
import { setOffset } from './clock.js';

export const state = {
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
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
function emit(reason, detail) { subs.forEach(fn => { try { fn(reason, detail); } catch (e) { console.error(e); } }); }

let fs = null, refs = null;
let lastSeenWriteAt = 0;
let adminKey = '';      // proof of the admin code for this session (never the code itself)

const fmtDate = iso => iso.split('-').reverse().join('/');

/* ======================================================================
   Boot
   ====================================================================== */
// Which dataset a fresh start (or a reset) uses: the original site's real data unless the demo was chosen.
function chosenSource() {
  try { return localStorage.getItem(SOURCE_KEY) === 'demo' ? 'demo' : 'real'; } catch (e) { return 'real'; }
}
// v4 kept generated demo data (and maybe a shifted demo clock) under the old key: start clean from the real data.
function migrate() {
  try {
    let old = false;
    OLD_DB_KEYS.forEach(k => { if (localStorage.getItem(k) !== null) { localStorage.removeItem(k); old = true; } });
    if (old) setOffset(0);
  } catch (e) { /* storage blocked: nothing to migrate */ }
}

export function initStore() {
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
// After the demo clock jumps, everything that depends on "now" refreshes at once.
export function refreshNow() { if (state.ready.bookings) minuteTick(); }

/* ======================================================================
   Session
   ====================================================================== */
function saveSession() {
  const s = { name: state.user.name, type: state.user.type, admin: state.isAdmin };
  if (state.isAdmin) s.key = adminKey;
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* memory only */ }
}
// A saved admin session counts only with a key made from the right code.
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
      // An admin session without a valid key falls back to signing in again.
      if (p.admin === true && !state.isAdmin) { state.user = null; try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } return; }
      touchLastSeen(true);
    }
  } catch (e) { /* ignore a broken session */ }
}

export function needsPasscode(name) { return String(name).toUpperCase() === ADMIN_USER; }

/* Wrong codes: after five in a row the form rests for 30 seconds (real time,
   not the app clock), so the code cannot be guessed by hand. */
const LOCK_KEY = 'langit5s-lock';
const LOCK_TRIES = 5, LOCK_MS = 30000;
let lock = { n: 0, until: 0 };
function readLock() { try { const v = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null'); if (v && typeof v.n === 'number') lock = v; } catch (e) { /* memory only */ } return lock; }
function writeLock() { try { localStorage.setItem(LOCK_KEY, JSON.stringify(lock)); } catch (e) { /* memory only */ } }
export function lockedFor() { const l = readLock(); return Math.max(0, l.until - Date.now()); }
// Returns the session key for the right code, or '' for a wrong one.
function checkPasscode(code) {
  const key = stretchCode(String(code || '').trim(), ADMIN_CODE.salt, ADMIN_CODE.rounds);
  return keyCheck(key) === ADMIN_CODE.check ? key : '';
}

export async function login(name, type, opts) {
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

export function logout() {
  if (state.user) logActivity('LOGOUT', { description: state.user.name + ' log keluar' });
  state.user = null;
  state.isAdmin = false;
  adminKey = '';
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  emit('session');
}

export async function touchLastSeen(force) {
  if (!state.user || !refs) return;
  const t = Date.now();
  if (!force && lastSeenWriteAt && t - lastSeenWriteAt < 20000) return;
  lastSeenWriteAt = t;
  try { await refs.users.doc(state.user.name).set({ name: state.user.name, type: state.user.type, lastSeen: fs.FieldValue.serverTimestamp() }, { merge: true }); } catch (e) { /* ignore */ }
}

export function isStudent() { return !!state.user && state.user.type === 'Pelajar' && STUDENT_NAMES.includes(state.user.name); }

/* ======================================================================
   Activity + notifications
   ====================================================================== */
export async function logActivity(action, opts) {
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

// Notifications this tab created: the person who acted already saw a toast for it.
const ownNotifications = new Set();
export function isOwnNotification(id) { return ownNotifications.has(id); }
export function ensureNotification(id, type, title, body, opts) {
  if (state.notifications.some(n => n.id === id)) return;
  if (!(opts && opts.system)) ownNotifications.add(id);
  refs.notifications.doc(id).get().then(snap => {
    if (snap.exists) return;
    return refs.notifications.doc(id).set({ type, title, body, createdAt: nowMs(), read: false });
  }).catch(() => {});
}

export async function markAllNotificationsRead() {
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

/* ======================================================================
   Bookings
   ====================================================================== */
export function findBooking(id) { return state.bookings.find(b => b.id === id) || null; }

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

export function validateFields(f, excludeId) {
  if (!f.subject || !f.teacher || !f.date || !f.from || !f.to) return { ok: false, message: 'Sila lengkapkan subjek, guru, tarikh dan masa.' };
  if (toMinutes(f.from) >= toMinutes(f.to)) return { ok: false, message: 'Masa tamat mesti selepas masa mula.' };
  return { ok: true, clashes: findClashes(state.bookings, f.subject, f.date, f.from, f.to, excludeId) };
}

export async function createBooking(fields, opts) {
  opts = opts || {};
  if (!state.user) return { ok: false, message: 'Sila log masuk dahulu.' };
  const v = validateFields(fields);
  if (!v.ok) return v;
  const u = state.user;
  // opts.record: an admin adding a class that was missed (Edit Kelas). Quiet, and marked as a record.
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

export async function updateBooking(id, fields, opts) {
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
    // A drag on the timetable can be undone for a few seconds: tell the class only if it stuck.
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
export const UNDO_WINDOW = UNDO_MS;

export async function cancelBooking(id, opts) {
  opts = opts || {};
  if (!state.user) return { ok: false, message: 'Sila log masuk dahulu.' };
  const b = findBooking(id);
  if (!b) return { ok: false, message: 'Kelas ini tidak dijumpai lagi.' };
  const u = state.user;
  const res = await persistBookings(base => base.map(x => x.id === id ? Object.assign({}, x, { cancelledBy: u.name, cancelledByType: u.type, cancelledAt: nowMs() }) : x));
  if (!res.ok) return res;
  logActivity('DELETE_BOOKING', { targetType: 'booking', targetId: id, description: u.name + ' membatalkan ' + b.subject + ' (' + b.teacher + ', ' + fmtDate(b.date) + ')' });
  // The notification waits out the undo window, so an undone cancel never reaches anyone.
  if (!opts.silent) {
    setTimeout(() => {
      const cur = findBooking(id);
      if (cur && cur.cancelledAt) ensureNotification('booking-cancelled-' + id, 'BOOKING_CANCELLED', 'Tempahan ' + b.subject + ' telah dibatalkan oleh ' + u.name + '.', fmtDate(b.date) + ' • ' + b.from + '–' + b.to);
    }, UNDO_MS + 500);
  }
  return { ok: true, booking: b };
}

export async function restoreBooking(id) {
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

// Undo for a move or edit: put the old fields back, quietly.
export async function revertBooking(before) {
  if (!before || !state.user) return { ok: false };
  const res = await persistBookings(base => base.map(x => x.id === before.id ? Object.assign({}, before) : x));
  if (res.ok) logActivity('UPDATE_BOOKING', { targetType: 'booking', targetId: before.id, description: state.user.name + ' mengembalikan ' + before.subject + ' ke masa asal' });
  return res;
}

/* ---------- extend ---------- */
export async function startExtend(id) {
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

// Quick, fixed-length extension (+15/+30/+45/+60): checks the clash first.
export async function extendBy(id, minutes) {
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

export async function stopExtend(id, until) {
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

/* ---------- attendance (marked by the admin; there is no self check-in) ---------- */
export async function saveAttendance(id, draft) {
  if (!state.isAdmin) return { ok: false, message: 'Hanya admin boleh menanda kehadiran.' };
  const b = findBooking(id);
  const res = await persistBookings(base => base.map(x => x.id !== id ? x : Object.assign({}, x, { attendance: Object.assign({}, draft), attendanceBy: state.user.name, attendanceAt: nowMs() })));
  if (res.ok) logActivity('UPDATE_BOOKING', { targetType: 'booking', targetId: id, description: state.user.name + ' menanda kehadiran ' + (b ? b.subject : '') });
  return res;
}

/* ======================================================================
   Config: teachers, workshop teachers, genders, recurring templates
   ====================================================================== */
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
export async function setSubjectTeacher(subject, name) {
  name = String(name || '').trim();
  if (!name) return { ok: false, message: 'Nama guru tidak boleh kosong.' };
  const res = await saveConfig(cfg => { cfg.subjectTeachers[subject] = name; });
  if (res.ok) logActivity('UPDATE_TEACHER', { targetType: 'subject', targetId: subject, description: state.user.name + ' menukar guru utama ' + subject + ' kepada ' + name });
  return res;
}
export async function setTeacherGender(teacher, g) {
  if (g !== 'F' && g !== 'M') return { ok: false, message: 'Pilih lelaki atau perempuan.' };
  return saveConfig(cfg => { cfg.teacherGenders[teacher] = g; });
}
export async function addWorkshopTeacher(subject, name) {
  name = String(name || '').trim();
  if (!name) return { ok: false, message: 'Masukkan nama guru bengkel.' };
  const res = await saveConfig(cfg => {
    if (!cfg.workshopTeachers[subject]) cfg.workshopTeachers[subject] = [];
    if (cfg.workshopTeachers[subject].indexOf(name) === -1) cfg.workshopTeachers[subject].push(name);
  });
  if (res.ok) logActivity('UPDATE_TEACHER', { targetType: 'subject', targetId: subject, description: state.user.name + ' menambah guru bengkel ' + name + ' untuk ' + subject });
  return res;
}
export async function removeWorkshopTeacher(subject, name) {
  return saveConfig(cfg => { cfg.workshopTeachers[subject] = (cfg.workshopTeachers[subject] || []).filter(n => n !== name); });
}

export async function addTemplate(entry) {
  if (!state.isAdmin) return { ok: false, message: 'Hanya admin boleh menambah jadual tetap.' };
  if (!entry.subject || !entry.day || !entry.from || !entry.to) return { ok: false, message: 'Lengkapkan subjek, hari dan masa.' };
  if (toMinutes(entry.to) <= toMinutes(entry.from)) return { ok: false, message: 'Masa tamat mesti selepas masa mula.' };
  const t = Object.assign({ id: genId('rt-'), createdBy: state.user.name, createdAt: nowMs() }, entry);
  const res = await saveConfig(cfg => { cfg.recurringTemplates = (cfg.recurringTemplates || []).concat([t]); });
  if (res.ok) { logActivity('UPDATE_TEACHER', { targetType: 'template', targetId: t.id, description: state.user.name + ' menambah jadual tetap ' + t.subject }); generateRecurring(); }
  return res;
}
export async function removeTemplate(id) {
  if (!state.isAdmin) return { ok: false, message: 'Hanya admin boleh membuang jadual tetap.' };
  return saveConfig(cfg => { cfg.recurringTemplates = (cfg.recurringTemplates || []).filter(t => t.id !== id); });
}

let generating = false;
export function generateRecurring() {
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

/* ======================================================================
   Sandbox controls
   ====================================================================== */
export function resetDemo() { fs.sandbox.reset(); }
export function dataInfo() { return fs ? fs.sandbox.info() : { source: 'real' }; }
// Switch between the original site's real data and the generated demo (replaces what is in this browser).
export function setDataSource(source) {
  try { if (source === 'demo') localStorage.setItem(SOURCE_KEY, 'demo'); else localStorage.removeItem(SOURCE_KEY); } catch (e) { /* memory only */ }
  setOffset(0);
  fs.sandbox.reset();
}
export function exportBackup() { return fs.sandbox.exportJSON(); }
export function importBackup(text) {
  try { fs.sandbox.importJSON(text); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message || 'Fail sandaran tidak sah.' }; }
}
export function todayISO() { return isoDate(now()); }

/* Sandbox backend: a Firestore-compatible store that lives in this browser.

   It keeps the exact data layout the production app keeps in Firestore
   (jadualKelas/bookings, jadualKelas/config, jadualKelas/meta/{users,activity,
   notifications,flags}) and mirrors the compat SDK calls the app makes, including
   live onSnapshot updates. Pointing the app back at real Firestore means replacing
   createFirestore() with firebase.firestore(); nothing else changes.

   Improvements over the round-1 sandbox:
   - storage failures (private windows, blocked site data) fall back to memory
   - batch() exists, so "mark all as read" works
   - other tabs see changes live (storage events), which the classroom display needs
   - the very first load is delayed a little, like a real network round trip,
     so loading states are exercised instead of skipped
*/

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
// {__ts: ms} markers come back as Firestore-like Timestamp objects.
function hydrate(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(hydrate);
  if (typeof v.__ts === 'number') { const ms = v.__ts; return { toDate: () => new Date(ms), toMillis: () => ms }; }
  const out = {};
  Object.keys(v).forEach(k => { out[k] = hydrate(v[k]); });
  return out;
}
function prepare(data) {
  // Sentinels must survive clone(): they are plain objects, so they do.
  return clone(data);
}

export function createFirestore({ key, seed, firstLoadDelay = 0 }) {
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
    // Fire listeners asynchronously so a caller finishes its own work first.
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
    // The first subscriptions wait like a network round trip would.
    const wait = firstLoadPending ? Math.max(0, firstLoadDelay - (Date.now() - bootAt)) : 0;
    setTimeout(() => { if (listeners.includes(entry)) { try { fire(); } catch (e) { console.error('[sandbox]', e); } } }, wait);
    return () => { listeners = listeners.filter(x => x !== entry); };
  }
  setTimeout(() => { firstLoadPending = false; }, firstLoadDelay + 50);

  // Another tab wrote: reload and tell everyone.
  window.addEventListener('storage', e => {
    if (e.key !== key || !e.newValue) return;
    try { db = JSON.parse(e.newValue); notify(null); } catch (err) { /* ignore a torn write */ }
  });

  /* ---------- snapshots ---------- */
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

  /* ---------- references ---------- */
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

  // Top-level collections address documents as "<collection>/<id>".
  function rootCollection(name) {
    return {
      doc: id => docRef(name + '/' + id),
      add: data => { const id = genDocId(); return docRef(name + '/' + id).set(data).then(() => ({ id })); }
    };
  }

  // Writes queue up and land together, with one persist per touched path.
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
      // Where the current data came from: {source: 'real' | 'demo' | 'import', takenAt, seededAt}.
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

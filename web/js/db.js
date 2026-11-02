// IndexedDB-Speicher: alle Daten bleiben lokal auf dem Gerät.
import { formatInvNr, BIKE_STATUS, PART_STATUS, statusName, formatEuro } from './model.js';

const DB_NAME = 'fahrrad-inventur';
const DB_VERSION = 2;
let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion < 1) {
        const bikes = db.createObjectStore('bikes', { keyPath: 'id' });
        bikes.createIndex('invNr', 'invNr', { unique: true });
        const parts = db.createObjectStore('parts', { keyPath: 'id' });
        parts.createIndex('bikeId', 'bikeId');
        parts.createIndex('invNr', 'invNr', { unique: true });
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('owner', ['ownerType', 'ownerId']);
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (e.oldVersion < 2) {
        // Verlauf: jede Änderung an Rad oder Teil als Ereignis
        const events = db.createObjectStore('events', { keyPath: 'id' });
        events.createIndex('owner', ['ownerType', 'ownerId']);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn(t)).then((r) => { result = r; }, (e) => { try { t.abort(); } catch { /* bereits beendet */ } reject(e); });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaktion abgebrochen'));
  });
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

const nowIso = () => new Date().toISOString();

// ---------- Verlauf ----------

function addEvent(t, ownerType, ownerId, type, text) {
  return promisify(t.objectStore('events').put({ id: uid(), ownerType, ownerId, type, text, at: nowIso() }));
}

export async function eventsOf(ownerType, ownerId) {
  const list = await tx(['events'], 'readonly', (t) => promisify(t.objectStore('events').index('owner').getAll([ownerType, ownerId])));
  return list.sort((a, b) => b.at.localeCompare(a.at));
}

export async function logEvent(ownerType, ownerId, type, text) {
  return tx(['events'], 'readwrite', (t) => addEvent(t, ownerType, ownerId, type, text));
}

const BIKE_DIFF = [
  ['status', 'Status', (v) => statusName(BIKE_STATUS, v)],
  ['estimatedValue', 'Schätzwert', formatEuro],
  ['salePrice', 'Verkaufspreis', formatEuro],
  ['purchasePrice', 'Einkaufspreis', formatEuro],
  ['location', 'Lagerort', (v) => v || '–'],
];
const PART_DIFF = [
  ['status', 'Status', (v) => (v === 'verbaut' ? 'Verbaut' : statusName(PART_STATUS, v))],
  ['value', 'Wert', formatEuro],
  ['location', 'Lagerort', (v) => v || '–'],
];
function diffText(before, after, fields) {
  return fields
    .filter(([k]) => (before[k] ?? null) !== (after[k] ?? null) && !(before[k] == null && after[k] === ''))
    .map(([k, label, fmt]) => `${label}: ${fmt(before[k])} → ${fmt(after[k])}`)
    .join(' · ');
}

// ---------- Meta / Einstellungen ----------

export async function getMeta(key, fallback = null) {
  const row = await tx(['meta'], 'readonly', (t) => promisify(t.objectStore('meta').get(key)));
  return row ? row.value : fallback;
}
export async function setMeta(key, value) {
  return tx(['meta'], 'readwrite', (t) => promisify(t.objectStore('meta').put({ key, value })));
}

const DEFAULT_SETTINGS = {
  apiKey: '',
  proxyUrl: '',
  model: 'claude-opus-5-5',
  effort: 'medium',
  maxPhotos: 6,
  laborRate: 30,
};
export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await getMeta('settings', {})) };
}
export async function saveSettings(s) {
  return setMeta('settings', s);
}

async function nextInvNr(t, kind) {
  const meta = t.objectStore('meta');
  const row = await promisify(meta.get('counters'));
  const counters = row ? row.value : { bike: 0, part: 0 };
  counters[kind] = (counters[kind] || 0) + 1;
  await promisify(meta.put({ key: 'counters', value: counters }));
  return formatInvNr(kind === 'bike' ? 'R' : 'T', counters[kind]);
}

// ---------- Räder ----------

export async function listBikes() {
  return tx(['bikes'], 'readonly', (t) => promisify(t.objectStore('bikes').getAll()));
}
export async function getBike(id) {
  return tx(['bikes'], 'readonly', (t) => promisify(t.objectStore('bikes').get(id)));
}
export async function findByInvNr(invNr) {
  const nr = String(invNr).toUpperCase();
  return tx(['bikes', 'parts'], 'readonly', async (t) => {
    const store = nr.startsWith('R') ? 'bikes' : 'parts';
    const item = await promisify(t.objectStore(store).index('invNr').get(nr));
    return item ? { type: store === 'bikes' ? 'bike' : 'part', item } : null;
  });
}

/**
 * Legt ein Rad samt Teilen und Fotos in EINER Transaktion an.
 * photos: [{ blob, thumb, width, height }], parts: [{...partFields, photos?: [...] }]
 */
export async function createBike(bike, parts = [], photos = [], note = 'Erfasst') {
  return tx(['bikes', 'parts', 'photos', 'meta', 'events'], 'readwrite', async (t) => {
    const now = nowIso();
    const b = { tasks: [], ...bike, id: uid(), invNr: await nextInvNr(t, 'bike'), createdAt: now, updatedAt: now, photoIds: [] };
    for (const ph of photos) b.photoIds.push(await putPhoto(t, 'bike', b.id, ph));
    await promisify(t.objectStore('bikes').put(b));
    await addEvent(t, 'bike', b.id, 'created', `${note}${parts.length ? ` mit ${parts.length} Teilen` : ''}`);
    for (const p of parts) await insertPart(t, { ...p, bikeId: b.id }, b);
    return b;
  });
}

async function insertPart(t, p, bike) {
  const now = nowIso();
  const { photos: partPhotos = [], ...fields } = p;
  const part = { quantity: 1, ...fields, id: uid(), invNr: await nextInvNr(t, 'part'), status: fields.bikeId ? 'verbaut' : fields.status || 'lager', createdAt: now, updatedAt: now, photoIds: [] };
  for (const ph of partPhotos) part.photoIds.push(await putPhoto(t, 'part', part.id, ph));
  await promisify(t.objectStore('parts').put(part));
  await addEvent(t, 'part', part.id, 'created', bike ? `Erfasst, verbaut an ${bike.invNr}` : 'Erfasst als Einzelteil');
  return part;
}

/** Speichert Änderungen am Rad (Felder werden in den gespeicherten Datensatz gemischt). */
export async function updateBike(bike, addPhotos = [], note = '') {
  return tx(['bikes', 'photos', 'events'], 'readwrite', async (t) => {
    const before = (await promisify(t.objectStore('bikes').get(bike.id))) || {};
    const b = { ...before, ...bike, updatedAt: nowIso(), photoIds: [...(bike.photoIds || before.photoIds || [])] };
    for (const ph of addPhotos) b.photoIds.push(await putPhoto(t, 'bike', b.id, ph));
    await promisify(t.objectStore('bikes').put(b));
    const diff = diffText(before, b, BIKE_DIFF);
    if (note || diff) await addEvent(t, 'bike', b.id, b.status === 'verkauft' && before.status !== 'verkauft' ? 'sold' : 'updated', [note, diff].filter(Boolean).join(' · '));
    if (addPhotos.length) await addEvent(t, 'bike', b.id, 'photo', `${addPhotos.length} Foto(s) hinzugefügt`);
    return b;
  });
}

/** Löscht ein Rad. Verbaute Teile werden gelöscht oder (keepParts) ins Lager verschoben. */
export async function deleteBike(id, { keepParts = false } = {}) {
  return tx(['bikes', 'parts', 'photos', 'events'], 'readwrite', async (t) => {
    const bike = await promisify(t.objectStore('bikes').get(id));
    const parts = await promisify(t.objectStore('parts').index('bikeId').getAll(id));
    for (const p of parts) {
      if (keepParts) {
        await promisify(t.objectStore('parts').put({ ...p, bikeId: null, fromBikeId: id, status: 'lager', updatedAt: nowIso() }));
        await addEvent(t, 'part', p.id, 'removed', `Ins Lager übernommen (Rad ${bike?.invNr || ''} gelöscht)`);
      } else {
        await deletePhotosOf(t, 'part', p.id);
        await deleteEventsOf(t, 'part', p.id);
        await promisify(t.objectStore('parts').delete(p.id));
      }
    }
    await deletePhotosOf(t, 'bike', id);
    await deleteEventsOf(t, 'bike', id);
    await promisify(t.objectStore('bikes').delete(id));
  });
}

/** Ausschlachten: alle Teile ins Lager, Rad-Status "ausgeschlachtet". */
export async function strip(id) {
  return tx(['bikes', 'parts', 'events'], 'readwrite', async (t) => {
    const now = nowIso();
    const bike = await promisify(t.objectStore('bikes').get(id));
    const parts = await promisify(t.objectStore('parts').index('bikeId').getAll(id));
    for (const p of parts) {
      await promisify(t.objectStore('parts').put({ ...p, bikeId: null, fromBikeId: id, status: 'lager', updatedAt: now }));
      await addEvent(t, 'part', p.id, 'removed', `Abgebaut von ${bike.invNr} (ausgeschlachtet) → Lager`);
    }
    await promisify(t.objectStore('bikes').put({ ...bike, status: 'ausgeschlachtet', updatedAt: now }));
    await addEvent(t, 'bike', id, 'stripped', `Ausgeschlachtet: ${parts.length} Teile ins Lager`);
    return parts.length;
  });
}

// ---------- Teile ----------

export async function listParts() {
  return tx(['parts'], 'readonly', (t) => promisify(t.objectStore('parts').getAll()));
}
export async function partsOfBike(bikeId) {
  return tx(['parts'], 'readonly', (t) => promisify(t.objectStore('parts').index('bikeId').getAll(bikeId)));
}
export async function getPart(id) {
  return tx(['parts'], 'readonly', (t) => promisify(t.objectStore('parts').get(id)));
}

export async function savePart(part, addPhotos = []) {
  return tx(['parts', 'photos', 'meta', 'events', 'bikes'], 'readwrite', async (t) => {
    const bikeOf = async (id) => (id ? promisify(t.objectStore('bikes').get(id)) : null);
    if (!part.id) {
      const bike = await bikeOf(part.bikeId);
      const created = await insertPart(t, part, bike);
      if (bike) await addEvent(t, 'bike', bike.id, 'installed', `Teil ${created.invNr} hinzugefügt`);
      if (addPhotos.length) {
        for (const ph of addPhotos) created.photoIds.push(await putPhoto(t, 'part', created.id, ph));
        await promisify(t.objectStore('parts').put(created));
      }
      return created;
    }
    const before = (await promisify(t.objectStore('parts').get(part.id))) || {};
    const p = { ...before, ...part, updatedAt: nowIso(), photoIds: [...(part.photoIds || before.photoIds || [])] };
    if (p.bikeId) p.status = 'verbaut';
    else if (!p.status || p.status === 'verbaut') p.status = 'lager';
    for (const ph of addPhotos) p.photoIds.push(await putPhoto(t, 'part', p.id, ph));
    await promisify(t.objectStore('parts').put(p));

    if ((before.bikeId || null) !== (p.bikeId || null)) {
      const oldBike = await bikeOf(before.bikeId);
      const newBike = await bikeOf(p.bikeId);
      if (oldBike) {
        await addEvent(t, 'part', p.id, 'removed', `Abgebaut von ${oldBike.invNr}${newBike ? '' : ' → Lager'}`);
        await addEvent(t, 'bike', oldBike.id, 'removed', `Teil ${p.invNr} abgebaut`);
      }
      if (newBike) {
        await addEvent(t, 'part', p.id, 'installed', `Eingebaut an ${newBike.invNr}`);
        await addEvent(t, 'bike', newBike.id, 'installed', `Teil ${p.invNr} eingebaut`);
      }
    } else {
      const diff = diffText(before, p, PART_DIFF);
      if (diff) await addEvent(t, 'part', p.id, 'updated', diff);
    }
    return p;
  });
}

export async function deletePart(id) {
  return tx(['parts', 'photos', 'events', 'bikes'], 'readwrite', async (t) => {
    const p = await promisify(t.objectStore('parts').get(id));
    if (p?.bikeId) await addEvent(t, 'bike', p.bikeId, 'removed', `Teil ${p.invNr} gelöscht`);
    await deletePhotosOf(t, 'part', id);
    await deleteEventsOf(t, 'part', id);
    await promisify(t.objectStore('parts').delete(id));
  });
}

/** Teil abbauen (-> Lager) oder an ein Rad einbauen. */
export async function movePart(id, bikeId) {
  const p = await getPart(id);
  if (!p) throw new Error('Teil nicht gefunden');
  const next = bikeId
    ? { ...p, bikeId, status: 'verbaut' }
    : { ...p, bikeId: null, fromBikeId: p.bikeId || p.fromBikeId || null, status: 'lager' };
  return savePart(next);
}

// ---------- Inventur (Bestandsprüfung per Scan) ----------

/** Markiert Rad/Teil als bei der Inventur gesehen. */
export async function markSeen(type, id) {
  const store = type === 'bike' ? 'bikes' : 'parts';
  return tx([store], 'readwrite', async (t) => {
    const item = await promisify(t.objectStore(store).get(id));
    if (!item) return null;
    item.lastSeenAt = nowIso();
    await promisify(t.objectStore(store).put(item));
    return item;
  });
}

// ---------- Fotos ----------

async function putPhoto(t, ownerType, ownerId, ph) {
  const id = uid();
  await promisify(t.objectStore('photos').put({
    id, ownerType, ownerId, blob: ph.blob, thumb: ph.thumb, width: ph.width, height: ph.height, createdAt: nowIso(),
  }));
  return id;
}

async function deletePhotosOf(t, ownerType, ownerId) {
  const keys = await promisify(t.objectStore('photos').index('owner').getAllKeys([ownerType, ownerId]));
  for (const k of keys) await promisify(t.objectStore('photos').delete(k));
}
async function deleteEventsOf(t, ownerType, ownerId) {
  const keys = await promisify(t.objectStore('events').index('owner').getAllKeys([ownerType, ownerId]));
  for (const k of keys) await promisify(t.objectStore('events').delete(k));
}

export async function getPhoto(id) {
  return tx(['photos'], 'readonly', (t) => promisify(t.objectStore('photos').get(id)));
}
export async function getPhotos(ids = []) {
  return tx(['photos'], 'readonly', async (t) => {
    const out = [];
    for (const id of ids) {
      const p = await promisify(t.objectStore('photos').get(id));
      if (p) out.push(p);
    }
    return out;
  });
}

/** Entfernt ein Foto und den Verweis beim Besitzer. */
export async function deletePhoto(photoId) {
  return tx(['photos', 'bikes', 'parts'], 'readwrite', async (t) => {
    const ph = await promisify(t.objectStore('photos').get(photoId));
    if (!ph) return;
    const store = t.objectStore(ph.ownerType === 'bike' ? 'bikes' : 'parts');
    const owner = await promisify(store.get(ph.ownerId));
    if (owner) {
      owner.photoIds = (owner.photoIds || []).filter((x) => x !== photoId);
      await promisify(store.put(owner));
    }
    await promisify(t.objectStore('photos').delete(photoId));
  });
}

// ---------- Backup ----------

export async function exportAll() {
  return tx(['bikes', 'parts', 'photos', 'meta', 'events'], 'readonly', async (t) => ({
    bikes: await promisify(t.objectStore('bikes').getAll()),
    parts: await promisify(t.objectStore('parts').getAll()),
    photos: await promisify(t.objectStore('photos').getAll()),
    events: await promisify(t.objectStore('events').getAll()),
    counters: ((await promisify(t.objectStore('meta').get('counters'))) || { value: { bike: 0, part: 0 } }).value,
  }));
}

/** Ersetzt den gesamten Bestand (Einstellungen inkl. API-Key bleiben erhalten). */
export async function importAll({ bikes, parts, photos, events = [], counters }) {
  return tx(['bikes', 'parts', 'photos', 'meta', 'events'], 'readwrite', async (t) => {
    for (const s of ['bikes', 'parts', 'photos', 'events']) await promisify(t.objectStore(s).clear());
    for (const b of bikes) await promisify(t.objectStore('bikes').put(b));
    for (const p of parts) await promisify(t.objectStore('parts').put(p));
    for (const ph of photos) await promisify(t.objectStore('photos').put(ph));
    for (const ev of events) await promisify(t.objectStore('events').put(ev));
    await promisify(t.objectStore('meta').put({ key: 'counters', value: counters }));
    await promisify(t.objectStore('meta').delete('inventur'));
  });
}

// IndexedDB-Speicher: alle Daten bleiben lokal auf dem Gerät.
import { formatInvNr } from './model.js';

const DB_NAME = 'fahrrad-inventur';
const DB_VERSION = 1;
let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const bikes = db.createObjectStore('bikes', { keyPath: 'id' });
      bikes.createIndex('invNr', 'invNr', { unique: true });
      const parts = db.createObjectStore('parts', { keyPath: 'id' });
      parts.createIndex('bikeId', 'bikeId');
      parts.createIndex('invNr', 'invNr', { unique: true });
      const photos = db.createObjectStore('photos', { keyPath: 'id' });
      photos.createIndex('owner', ['ownerType', 'ownerId']);
      db.createObjectStore('meta', { keyPath: 'key' });
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

/**
 * Legt ein Rad samt Teilen und Fotos in EINER Transaktion an.
 * photos: [{ blob, thumb, width, height }], parts: [{...partFields, photos?: [...] }]
 */
export async function createBike(bike, parts = [], photos = []) {
  return tx(['bikes', 'parts', 'photos', 'meta'], 'readwrite', async (t) => {
    const now = new Date().toISOString();
    const b = { ...bike, id: uid(), invNr: await nextInvNr(t, 'bike'), createdAt: now, updatedAt: now, photoIds: [] };
    for (const ph of photos) b.photoIds.push(await putPhoto(t, 'bike', b.id, ph));
    await promisify(t.objectStore('bikes').put(b));
    for (const p of parts) {
      const { photos: partPhotos = [], ...fields } = p;
      const part = { ...fields, id: uid(), bikeId: b.id, invNr: await nextInvNr(t, 'part'), status: 'verbaut', createdAt: now, updatedAt: now, photoIds: [] };
      for (const ph of partPhotos) part.photoIds.push(await putPhoto(t, 'part', part.id, ph));
      await promisify(t.objectStore('parts').put(part));
    }
    return b;
  });
}

export async function updateBike(bike, addPhotos = []) {
  return tx(['bikes', 'photos'], 'readwrite', async (t) => {
    const b = { ...bike, updatedAt: new Date().toISOString(), photoIds: [...(bike.photoIds || [])] };
    for (const ph of addPhotos) b.photoIds.push(await putPhoto(t, 'bike', b.id, ph));
    await promisify(t.objectStore('bikes').put(b));
    return b;
  });
}

/** Löscht ein Rad. Verbaute Teile werden gelöscht oder (keepParts) ins Lager verschoben. */
export async function deleteBike(id, { keepParts = false } = {}) {
  return tx(['bikes', 'parts', 'photos'], 'readwrite', async (t) => {
    const parts = await promisify(t.objectStore('parts').index('bikeId').getAll(id));
    for (const p of parts) {
      if (keepParts) {
        await promisify(t.objectStore('parts').put({ ...p, bikeId: null, fromBikeId: id, status: 'lager', updatedAt: new Date().toISOString() }));
      } else {
        await deletePhotosOf(t, 'part', p.id);
        await promisify(t.objectStore('parts').delete(p.id));
      }
    }
    await deletePhotosOf(t, 'bike', id);
    await promisify(t.objectStore('bikes').delete(id));
  });
}

/** Ausschlachten: alle Teile ins Lager, Rad-Status "ausgeschlachtet". */
export async function strip(id) {
  return tx(['bikes', 'parts'], 'readwrite', async (t) => {
    const now = new Date().toISOString();
    const bike = await promisify(t.objectStore('bikes').get(id));
    const parts = await promisify(t.objectStore('parts').index('bikeId').getAll(id));
    for (const p of parts) {
      await promisify(t.objectStore('parts').put({ ...p, bikeId: null, fromBikeId: id, status: 'lager', updatedAt: now }));
    }
    await promisify(t.objectStore('bikes').put({ ...bike, status: 'ausgeschlachtet', updatedAt: now }));
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
  return tx(['parts', 'photos', 'meta'], 'readwrite', async (t) => {
    const now = new Date().toISOString();
    const p = { ...part, updatedAt: now, photoIds: [...(part.photoIds || [])] };
    if (!p.id) {
      p.id = uid();
      p.invNr = await nextInvNr(t, 'part');
      p.createdAt = now;
    }
    if (p.bikeId) p.status = 'verbaut';
    else if (!p.status || p.status === 'verbaut') p.status = 'lager';
    for (const ph of addPhotos) p.photoIds.push(await putPhoto(t, 'part', p.id, ph));
    await promisify(t.objectStore('parts').put(p));
    return p;
  });
}

export async function deletePart(id) {
  return tx(['parts', 'photos'], 'readwrite', async (t) => {
    await deletePhotosOf(t, 'part', id);
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

// ---------- Fotos ----------

async function putPhoto(t, ownerType, ownerId, ph) {
  const id = uid();
  await promisify(t.objectStore('photos').put({
    id, ownerType, ownerId, blob: ph.blob, thumb: ph.thumb, width: ph.width, height: ph.height,
    createdAt: new Date().toISOString(),
  }));
  return id;
}

async function deletePhotosOf(t, ownerType, ownerId) {
  const keys = await promisify(t.objectStore('photos').index('owner').getAllKeys([ownerType, ownerId]));
  for (const k of keys) await promisify(t.objectStore('photos').delete(k));
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
  return tx(['bikes', 'parts', 'photos', 'meta'], 'readonly', async (t) => ({
    bikes: await promisify(t.objectStore('bikes').getAll()),
    parts: await promisify(t.objectStore('parts').getAll()),
    photos: await promisify(t.objectStore('photos').getAll()),
    counters: ((await promisify(t.objectStore('meta').get('counters'))) || { value: { bike: 0, part: 0 } }).value,
  }));
}

/** Ersetzt den gesamten Bestand (Einstellungen inkl. API-Key bleiben erhalten). */
export async function importAll({ bikes, parts, photos, counters }) {
  return tx(['bikes', 'parts', 'photos', 'meta'], 'readwrite', async (t) => {
    for (const s of ['bikes', 'parts', 'photos']) await promisify(t.objectStore(s).clear());
    for (const b of bikes) await promisify(t.objectStore('bikes').put(b));
    for (const p of parts) await promisify(t.objectStore('parts').put(p));
    for (const ph of photos) await promisify(t.objectStore('photos').put(ph));
    await promisify(t.objectStore('meta').put({ key: 'counters', value: counters }));
  });
}

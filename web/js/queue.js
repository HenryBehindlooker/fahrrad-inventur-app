// KI-Warteschlange für die Schnellerfassung: Räder werden sofort gespeichert,
// die Erkennung läuft nacheinander im Hintergrund (solange die App geöffnet ist).
import * as db from './db.js';
import { recognizeBike, bikeFromAi, partFromAi } from './ai.js';

let running = false;

export function notify() {
  window.dispatchEvent(new CustomEvent('queue-change'));
}

/** Startet die Abarbeitung (idempotent). */
export async function runQueue() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const settings = await db.getSettings();
      if (!settings.apiKey && !settings.proxyUrl) break;
      const bikes = await db.listBikes();
      const next = bikes
        .filter((b) => b.review === 'queued')
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!next) break;
      await processBike(next, settings);
    }
  } finally {
    running = false;
    notify();
  }
}

async function processBike(bike, settings) {
  await db.updateBike({ id: bike.id, review: 'running' });
  notify();
  try {
    const photos = await db.getPhotos(bike.photoIds || []);
    if (!photos.length) throw new Error('Keine Fotos vorhanden');
    const r = await recognizeBike(settings, photos.map((p) => p.blob));
    const fields = bikeFromAi(r);
    const current = await db.getBike(bike.id);
    // Nur leere Felder füllen – manuelle Eingaben haben Vorrang
    const patch = { id: bike.id, review: 'ready', reviewError: '', ai: fields.ai };
    for (const [k, v] of Object.entries(fields)) {
      if (k === 'ai' || v === null || v === '' || v === undefined) continue;
      if (current[k] === undefined || current[k] === null || current[k] === '') patch[k] = v;
    }
    if (!r.is_bicycle) patch.reviewError = 'Auf den Fotos wurde kein Fahrrad erkannt.';
    await db.updateBike(patch, [], `KI-Erkennung (${r.model})`);
    for (const p of (r.parts || []).map(partFromAi)) await db.savePart({ ...p, bikeId: bike.id });
  } catch (e) {
    await db.updateBike({ id: bike.id, review: 'error', reviewError: e.message || String(e) });
  }
  notify();
}

/** Fehlgeschlagene Erkennungen erneut einreihen. */
export async function retryFailed() {
  const bikes = await db.listBikes();
  for (const b of bikes.filter((x) => x.review === 'error')) await db.updateBike({ id: b.id, review: 'queued', reviewError: '' });
  runQueue();
}

/** Nach einem Neustart hängengebliebene Einträge wieder einreihen. */
export async function resumeQueue() {
  if (running) return; // läuft bereits – nichts zurücksetzen, sonst doppelte Erkennung
  const bikes = await db.listBikes();
  for (const b of bikes.filter((x) => x.review === 'running')) await db.updateBike({ id: b.id, review: 'queued' });
  runQueue();
}

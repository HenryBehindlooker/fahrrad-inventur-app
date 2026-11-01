// CSV-Export und JSON-Komplettsicherung (inkl. Fotos).
import * as db from './db.js';
import {
  toCSV, categoryInfo, statusName, BIKE_STATUS, PART_STATUS, bikeTitle,
} from './model.js';
import { blobToBase64, base64ToBlob } from './images.js';
import { saveFile } from './native.js';

const today = () => new Date().toISOString().slice(0, 10);

export async function exportBikesCSV() {
  const bikes = (await db.listBikes()).sort((a, b) => a.invNr.localeCompare(b.invNr));
  const parts = await db.listParts();
  const countByBike = new Map();
  for (const p of parts) if (p.bikeId) countByBike.set(p.bikeId, (countByBike.get(p.bikeId) || 0) + 1);
  const csv = toCSV(bikes, [
    { label: 'Inventar-Nr.', get: (b) => b.invNr },
    { label: 'Hersteller', get: (b) => b.manufacturer },
    { label: 'Modell', get: (b) => b.model },
    { label: 'Typ', get: (b) => b.type },
    { label: 'Baujahr', get: (b) => b.year },
    { label: 'Rahmengröße', get: (b) => b.frameSize },
    { label: 'Laufradgröße', get: (b) => b.wheelSize },
    { label: 'Farbe', get: (b) => b.color },
    { label: 'Material', get: (b) => b.frameMaterial },
    { label: 'Rahmennummer', get: (b) => b.frameNumber },
    { label: 'Zustand (1-5)', get: (b) => b.condition },
    { label: 'Status', get: (b) => statusName(BIKE_STATUS, b.status) },
    { label: 'Lagerort', get: (b) => b.location },
    { label: 'Einkaufspreis', get: (b) => b.purchasePrice },
    { label: 'Schätzwert', get: (b) => b.estimatedValue },
    { label: 'Verkaufspreis', get: (b) => b.salePrice },
    { label: 'Anzahl Teile', get: (b) => countByBike.get(b.id) || 0 },
    { label: 'Notizen', get: (b) => b.notes },
    { label: 'Erfasst am', get: (b) => b.createdAt?.slice(0, 10) },
  ]);
  await saveFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `fahrraeder-${today()}.csv`);
}

export async function exportPartsCSV() {
  const bikes = new Map((await db.listBikes()).map((b) => [b.id, b]));
  const parts = (await db.listParts()).sort((a, b) => a.invNr.localeCompare(b.invNr));
  const csv = toCSV(parts, [
    { label: 'Inventar-Nr.', get: (p) => p.invNr },
    { label: 'Hauptkategorie', get: (p) => categoryInfo(p.category).groupName },
    { label: 'Kategorie', get: (p) => categoryInfo(p.category).name },
    { label: 'Hersteller', get: (p) => p.manufacturer },
    { label: 'Modell', get: (p) => p.model },
    { label: 'Teile-Nr.', get: (p) => p.ref },
    { label: 'Beschreibung', get: (p) => p.description },
    { label: 'Menge', get: (p) => p.quantity || 1 },
    { label: 'Zustand (1-5)', get: (p) => p.condition },
    { label: 'Status', get: (p) => (p.bikeId ? 'Verbaut' : statusName(PART_STATUS, p.status)) },
    { label: 'Verbaut an (Inv.-Nr.)', get: (p) => bikes.get(p.bikeId)?.invNr || '' },
    { label: 'Verbaut an', get: (p) => (bikes.get(p.bikeId) ? bikeTitle(bikes.get(p.bikeId)) : '') },
    { label: 'Herkunft (Rad)', get: (p) => bikes.get(p.fromBikeId)?.invNr || '' },
    { label: 'Lagerort', get: (p) => p.location },
    { label: 'Wert', get: (p) => p.value },
    { label: 'Notizen', get: (p) => p.notes },
  ]);
  await saveFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `teile-${today()}.csv`);
}

export async function exportBackup() {
  const data = await db.exportAll();
  const photos = [];
  for (const ph of data.photos) {
    const { blob, ...rest } = ph;
    photos.push({ ...rest, data: blob ? await blobToBase64(blob) : null });
  }
  const backup = { app: 'fahrrad-inventur', version: 1, exportedAt: new Date().toISOString(), ...data, photos };
  await saveFile(new Blob([JSON.stringify(backup)], { type: 'application/json' }), `fahrrad-inventur-backup-${today()}.json`);
}

export async function importBackup(file) {
  const backup = JSON.parse(await file.text());
  if (backup.app !== 'fahrrad-inventur' || !Array.isArray(backup.bikes) || !Array.isArray(backup.parts)) {
    throw new Error('Diese Datei ist keine Fahrrad-Inventur-Sicherung.');
  }
  const photos = (backup.photos || []).map(({ data, ...rest }) => ({ ...rest, blob: data ? base64ToBlob(data) : null }));
  await db.importAll({ bikes: backup.bikes, parts: backup.parts, photos, counters: backup.counters || { bike: 0, part: 0 } });
  return { bikes: backup.bikes.length, parts: backup.parts.length, photos: photos.length };
}

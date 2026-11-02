// Prüft das Datenbank-Update v1 -> v2: vorhandene Daten bleiben erhalten, Verlauf funktioniert.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)('playwright');
const PORT = 8095;
const BASE = `http://localhost:${PORT}/`;
const server = spawn(process.execPath, ['scripts/serve.mjs', String(PORT)], { stdio: 'pipe' });
await new Promise((r) => server.stdout.once('data', r));
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(`${BASE}manifest.webmanifest`);
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('fahrrad-inventur', 1);
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
    req.onsuccess = () => {
      const db = req.result;
      const t = db.transaction(['bikes', 'parts', 'meta'], 'readwrite');
      const now = new Date().toISOString();
      t.objectStore('bikes').put({ id: 'b1', invNr: 'R-0001', manufacturer: 'Gazelle', model: 'Champion Mondial', status: 'lager', photoIds: [], createdAt: now, updatedAt: now });
      t.objectStore('parts').put({ id: 'p1', invNr: 'T-0001', bikeId: 'b1', category: 'sitz/sattel', manufacturer: 'Brooks', model: 'B17', status: 'verbaut', photoIds: [], createdAt: now, updatedAt: now });
      t.objectStore('meta').put({ key: 'counters', value: { bike: 1, part: 1 } });
      t.oncomplete = () => { db.close(); resolve(); };
      t.onerror = () => reject(t.error);
    };
    req.onerror = () => reject(req.error);
  }));
  await page.goto(`${BASE}#/raeder`);
  await page.waitForSelector('.bike-card:has-text("Gazelle Champion Mondial")');
  await page.click('.bike-card');
  await page.waitForSelector('#werkstatt');
  await page.click('[data-unmount]');
  await page.click('dialog button.btn-primary');
  await page.waitForSelector('.timeline li:has-text("T-0001 abgebaut")');
  await page.goto(`${BASE}#/rad/neu?manuell=1`);
  await page.fill('input[name=manufacturer]', 'Neu');
  await page.click('#bike-form button[type=submit]');
  await page.waitForSelector('.detail-head:has-text("R-0002")');
  assert.deepEqual(errors, []);
  console.log('Migration v1 → v2: ok (Daten erhalten, Verlauf aktiv, Nummern fortlaufend)');
} catch (e) {
  console.error('FEHLER:', e.message, errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}

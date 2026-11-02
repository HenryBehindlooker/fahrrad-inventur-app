// End-to-End-Test im Browser mit simulierter Claude-API (kein echter API-Key nötig).
// Aufruf: npm run test:e2e   (Screenshots landen in tests/e2e/screenshots/)
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const PORT = 8093;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = 'tests/e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

const server = spawn(process.execPath, ['scripts/serve.mjs', String(PORT)], { stdio: 'pipe' });
await new Promise((r) => server.stdout.once('data', r));

const AI_BIKE = {
  is_bicycle: true,
  bike: {
    manufacturer: 'Peugeot', model: 'PX-10', type: 'Rennrad', year: 'ca. 1975', frame_size: '56 cm',
    wheel_size: '28 Zoll (700c)', color: 'Weiß', frame_material: 'Stahl', frame_number: '',
    condition: 3, estimated_value_eur: 450, confidence: 'hoch', notes: 'Reynolds-531-Aufkleber, Simplex-Ausstattung.',
  },
  parts: [
    { category: 'schaltung/schaltwerk', manufacturer: 'Simplex', model: 'Prestige', ref: '', description: 'Kunststoff', condition: 3, estimated_value_eur: 25, confidence: 'hoch' },
    { category: 'bremsen/felgenbremse', manufacturer: 'Mafac', model: 'Racer', ref: '', description: 'vorne + hinten', condition: 2, estimated_value_eur: 40, confidence: 'mittel' },
    { category: 'sitz/sattel', manufacturer: 'Brooks', model: 'B17', ref: '', description: 'Leder', condition: 3, estimated_value_eur: 60, confidence: 'niedrig' },
  ],
};
const AI_PART = {
  part: { category: 'bremsen/felgenbremse', manufacturer: 'Mafac', model: 'Racer', ref: '', description: 'Mittelzug', condition: 2, estimated_value_eur: 35, confidence: 'hoch' },
  notes: 'Typischer Mafac-Mittelzug.',
};

const AI_SALE = {
  price_private_low: 380, price_private_high: 480, price_dealer: 250, price_parts_out: 320,
  recommendation: 'komplett verkaufen', reasoning: 'Gesuchter Klassiker mit Simplex-Ausstattung.',
  title: 'Peugeot PX-10 Rennrad 1975, RH 56', text: 'Klassisches Peugeot PX-10 aus den 70ern.\nGepflegt, fahrbereit.',
  highlights: ['Reynolds 531'], defects: ['Lackkratzer'], keywords: ['Peugeot', 'Vintage', 'Rennrad'],
};
const requests = [];
const errors = [];
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.route('https://api.anthropic.com/**', async (route) => {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
  const body = req.postDataJSON();
  requests.push({ headers: await req.allHeaders(), body });
  const msg = JSON.stringify(body.messages);
  const isPart = msg.includes('EIN einzelnes Fahrradteil');
  const isSale = msg.includes('Verkaufsbewertung');
  const isTest = !body.output_config?.format;
  const text = isTest ? 'OK' : JSON.stringify(isSale ? AI_SALE : isPart ? AI_PART : AI_BIKE);
  await route.fulfill({
    status: 200,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    body: JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text }], usage: { input_tokens: 1000, output_tokens: 300 },
    }),
  });
});

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  await fn();
  console.log('ok');
};
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const pick = async (selector, files) => {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(selector)]);
  await chooser.setFiles(files);
};

try {
  await step('Startseite (leer)', async () => {
    await page.goto(BASE);
    await page.waitForSelector('.hero');
    await shot('01-start');
  });

  await step('Einstellungen: API-Key speichern + Verbindungstest', async () => {
    await page.click('#tabbar a[data-tab=settings]');
    await page.fill('input[name=apiKey]', 'sk-ant-test');
    await page.click('#settings-form button[type=submit]');
    await page.waitForSelector('.toast-success');
    await page.click('#btn-test');
    await page.waitForSelector('.toast-success:has-text("Verbindung OK")');
    await shot('02-settings');
  });

  await step('Neues Rad: Foto + KI-Erkennung', async () => {
    await page.click('#tabbar a[data-tab=new]');
    await page.waitForSelector('#btn-gallery');
    await pick('#btn-gallery', ['web/icons/icon-512.png', 'web/icons/icon-1024.png']);
    await page.waitForFunction(() => document.querySelectorAll('#photo-grid .photo').length === 2);
    await page.click('#btn-ai');
    await page.waitForSelector('.ai-box');
    assert.equal(await page.inputValue('input[name=manufacturer]'), 'Peugeot');
    assert.equal(await page.inputValue('select[name=type]'), 'Rennrad');
    assert.equal(await page.locator('.proposal').count(), 3);
    await shot('03-ai-review');
  });

  await step('KI-Anfrage korrekt aufgebaut', async () => {
    const r = requests.at(-1);
    assert.equal(r.body.model, 'claude-opus-5-5');
    assert.equal(r.body.output_config.format.type, 'json_schema');
    assert.equal(r.body.fallbacks, 'default');
    assert.equal(r.body.messages[0].content.filter((c) => c.type === 'image').length, 2);
    assert.equal(r.headers.authorization, 'Bearer sk-ant-test');
    assert.equal(r.headers['anthropic-dangerous-direct-browser-access'], 'true');
    assert.match(r.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  });

  await step('Proxy-Modus: Anfrage geht an Proxy-URL', async () => {
    let proxied = null;
    const p2 = await context.newPage();
    await p2.route('https://proxy.example.test/**', async (route) => {
      proxied = { url: route.request().url(), headers: await route.request().allHeaders() };
      await route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
        body: JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'OK' }], usage: { input_tokens: 1, output_tokens: 1 } }) });
    });
    await p2.goto(`${BASE}#/einstellungen`);
    await p2.fill('input[name=apiKey]', 'zugangscode');
    await p2.fill('input[name=proxyUrl]', 'https://proxy.example.test/');
    await p2.click('#btn-test');
    await p2.waitForSelector('.toast-success:has-text("Verbindung OK")');
    assert.equal(proxied.url, 'https://proxy.example.test/v1/messages');
    assert.equal(proxied.headers.authorization, 'Bearer zugangscode');
    await p2.close();
  });

  await step('Vorschlag abwählen, eigenes Teil ergänzen, speichern', async () => {
    await page.locator('.proposal').nth(2).locator('input[type=checkbox]').uncheck();
    await page.click('#btn-add-part');
    const last = page.locator('.proposal').last();
    await last.locator('select').first().selectOption('anbau/schutzbleche');
    await last.locator('input[name$=".manufacturer"]').fill('Bluemels');
    await last.locator('input[name$=".model"]').fill('Popular');
    await page.fill('input[name=purchasePrice]', '120');
    await page.click('#bike-form button[type=submit]');
    await page.waitForSelector('.detail-head');
    assert.match(await page.textContent('.detail-head'), /R-0001/);
    assert.match(await page.textContent('main'), /Teile \(3\)/);
    await shot('04-detail');
  });

  await step('Zweites Rad (manuell) mit gleicher Bremse', async () => {
    await page.goto(`${BASE}#/rad/neu?manuell=1`);
    await page.fill('input[name=manufacturer]', 'Gitane');
    await page.fill('input[name=model]', 'Tour de France');
    await page.selectOption('select[name=type]', 'Rennrad');
    await page.click('#btn-add-part');
    const p = page.locator('.proposal').last();
    await p.locator('select').first().selectOption('bremsen/felgenbremse');
    await p.locator('input[name$=".manufacturer"]').fill('MAFAC');
    await p.locator('input[name$=".model"]').fill('racer');
    await page.click('#bike-form button[type=submit]');
    await page.waitForSelector('.detail-head');
    await page.waitForSelector('.badge-link:has-text("+1")');
  });

  await step('Einzelteil per KI erkennen und ins Lager', async () => {
    await page.goto(`${BASE}#/teil/neu`);
    await page.waitForSelector('#btn-gallery');
    await pick('#btn-gallery', ['web/icons/icon-192.png']);
    await page.waitForFunction(() => !document.querySelector('#btn-ai').disabled);
    await page.click('#btn-ai');
    await page.waitForFunction(() => document.querySelector('input[name=manufacturer]').value === 'Mafac');
    await page.click('#part-form button[type=submit]');
    await page.waitForSelector('.link-box:has-text("3×")');
    await shot('05-part');
  });

  await step('Gleiche Teile: Gruppe mit 3 Stück', async () => {
    await page.goto(`${BASE}#/teile?tab=gruppen`);
    await page.waitForSelector('.list .badge:has-text("3×")');
    await page.click('.list a.row');
    await page.waitForSelector('h1:has-text("Racer")');
    await shot('06-group');
  });

  await step('Ausschlachten: Teile ins Lager', async () => {
    await page.goto(`${BASE}#/raeder?sort=nr`);
    await page.click('.bike-card >> nth=0');
    await page.waitForSelector('#btn-strip');
    await page.click('#btn-strip');
    await page.click('dialog button.btn-primary');
    await page.waitForSelector('.toast-success:has-text("3 Teile")');
    await page.goto(`${BASE}#/teile?tab=lager`);
    await page.waitForSelector('.tabs a.active:has-text("Lager")');
    await page.waitForSelector('.list');
    assert.equal(await page.locator('.list > li').count(), 4);
    await shot('07-lager');
  });

  await step('Übersicht / Statistik', async () => {
    await page.goto(BASE);
    await page.waitForSelector('.tiles');
    assert.match(await page.textContent('.tiles'), /2\s*Fahrräder/);
    await shot('08-dashboard');
  });

  await step('Druckansichten + QR', async () => {
    await page.goto(`${BASE}#/druck/liste`);
    await page.waitForSelector('.print-table tbody tr');
    await page.goto(`${BASE}#/druck/etiketten`);
    await page.waitForSelector('.label svg');
    assert.equal(await page.locator('.label').count(), 2);
    await shot('09-labels');
    await page.goto(`${BASE}#/raeder?sort=nr`);
    await page.click('.bike-card >> nth=0');
    await page.click('a:has-text("Datenblatt")');
    await page.waitForSelector('.sheet-qr svg');
    await shot('10-sheet');
  });

  await step('CSV-Export und Backup/Restore', async () => {
    await page.goto(`${BASE}#/einstellungen`);
    const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#btn-csv-parts')]);
    const csvText = await (await import('node:fs/promises')).readFile(await csv.path(), 'utf8');
    assert.match(csvText, /Inventar-Nr\.;Hauptkategorie/);
    assert.match(csvText, /Mafac;Racer/);
    const [bak] = await Promise.all([page.waitForEvent('download'), page.click('#btn-backup')]);
    const backupPath = await bak.path();
    await page.click('#btn-wipe');
    await page.click('dialog button.btn-danger');
    await page.waitForSelector('.hero');
    await page.goto(`${BASE}#/einstellungen`);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#btn-restore')]);
    await chooser.setFiles(backupPath);
    await page.click('dialog button.btn-primary');
    await page.waitForSelector('.toast-success:has-text("2 Räder")');
    await page.goto(`${BASE}#/rad/neu?manuell=1`);
    await page.fill('input[name=manufacturer]', 'Batavus');
    await page.click('#bike-form button[type=submit]');
    await page.waitForSelector('.detail-head:has-text("R-0003")');
  });

  await step('Schnellerfassung: KI im Hintergrund, Prüfliste', async () => {
    await page.goto(`${BASE}#/schnell`);
    await page.fill('#q-location', 'Halle 2');
    await pick('#q-gallery', ['web/icons/icon-512.png']);
    await page.waitForFunction(() => !document.querySelector('#q-save').disabled);
    await page.click('#q-save');
    await page.waitForSelector('.toast-success:has-text("R-0004")');
    await page.goto(`${BASE}#/pruefen`);
    await page.waitForSelector('.status-review-ready', { timeout: 15000 });
    assert.match(await page.textContent('.bike-card'), /Peugeot PX-10/);
    await shot('12-review');
    await page.click('.bike-card');
    await page.waitForSelector('.ai-box:has-text("Bitte KI-Ergebnis prüfen")');
    assert.equal(await page.inputValue('input[name=location]'), 'Halle 2');
    await page.click('#bike-form button[type=submit]');
    await page.waitForSelector('.detail-head:has-text("R-0004")');
    assert.equal(await page.locator('.review-banner').count(), 0);
    assert.match(await page.textContent('main'), /Teile \(3\)/);
  });

  await step('Werkstatt: Aufgaben + Kalkulation', async () => {
    await page.fill('#task-form input[name=text]', 'Kette ersetzen');
    await page.fill('#task-form input[name=hours]', '1,5');
    await page.fill('#task-form input[name=partsCost]', '20');
    await page.click('#task-form button[type=submit]');
    await page.waitForSelector('.tasks li:has-text("Kette ersetzen")');
    // Arbeit 1,5 h × 30 € = 45 €, Kosten = 0 + 20 + 45 = 65 €, Schätzwert 450 € => Gewinn 385 €
    assert.match(await page.textContent('.calc'), /65\s?€[\s\S]*385\s?€/);
    await page.check('.tasks input[type=checkbox]');
    await page.waitForSelector('.tasks li.done');
  });

  await step('Verkaufsassistent: Preise + Anzeige', async () => {
    await page.click('#btn-sale');
    await page.waitForSelector('#listing-title:has-text("Peugeot PX-10")');
    assert.match(await page.textContent('#verkauf'), /380[\s\S]*480/);
    await page.click('#btn-take-price');
    await page.waitForSelector('.status-bereit');
    await shot('13-sale');
  });

  await step('Aus Lager einbauen + Verlauf', async () => {
    await page.click('#btn-from-stock');
    await page.selectOption('#stock-cat', 'bremsen/felgenbremse');
    await page.locator('#stock-list input[type=radio]').first().check();
    await page.click('dialog button.btn-primary');
    await page.waitForSelector('.toast-success:has-text("Teil eingebaut")');
    await page.waitForSelector('.timeline li:has-text("eingebaut")');
    assert.match(await page.textContent('.timeline'), /KI-Ergebnis geprüft/);
    assert.match(await page.textContent('.timeline'), /Erledigt: Kette ersetzen/);
    await shot('14-werkstatt');
  });

  await step('Rahmennummer: Duplikat-Warnung', async () => {
    await page.goto(`${BASE}#/rad/neu?manuell=1`);
    await page.fill('input[name=manufacturer]', 'Test');
    await page.fill('input[name=frameNumber]', 'AB 123');
    await page.click('#bike-form button[type=submit]');
    await page.waitForSelector('.detail-head');
    await page.goto(`${BASE}#/rad/neu?manuell=1`);
    await page.fill('input[name=manufacturer]', 'Test2');
    await page.fill('input[name=frameNumber]', 'ab123');
    await page.click('#bike-form button[type=submit]');
    await page.waitForSelector('dialog h2:has-text("Rahmennummer schon vorhanden")');
    await page.click('dialog button.btn-primary');
    await page.waitForSelector('.hint:has-text("Gleiche Rahmennummer")');
    assert.equal(await page.locator('a[href*="bikeindex.org"]').count(), 1);
  });

  await step('Etiketten-QR enthält Link, /inv/ öffnet das Rad', async () => {
    await page.goto(`${BASE}#/druck/etiketten?ids=`);
    await page.goto(`${BASE}#/druck/etiketten`);
    await page.waitForSelector('.label svg');
    const decoded = await page.evaluate(async () => {
      const { default: jsQR } = await import('./vendor/jsqr.mjs');
      const svg = document.querySelector('.label svg');
      const xml = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
      await img.decode();
      const c = document.createElement('canvas'); c.width = 300; c.height = 300;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 300, 300); ctx.drawImage(img, 20, 20, 260, 260);
      return jsQR(ctx.getImageData(0, 0, 300, 300).data, 300, 300)?.data;
    });
    assert.equal(decoded, `${BASE}#/inv/R-0001`);
    await page.goto(decoded);
    await page.waitForSelector('.detail-head:has-text("R-0001")');
    await page.goto(`${BASE}#/druck/etiketten?teile=`);
    await page.waitForSelector('.label');
    assert.ok(await page.locator('.label strong:has-text("T-")').count() >= 3);
  });

  await step('Inventur: zählen per Handeingabe, fehlende Einträge', async () => {
    await page.goto(`${BASE}#/inventur`);
    await page.click('#btn-start');
    await page.waitForSelector('.scanner');
    await page.fill('.scanner input[name=manual]', 'R-0002');
    await page.press('.scanner input[name=manual]', 'Enter');
    await page.waitForSelector('.scanner-msg.ok:has-text("R-0002")');
    await page.fill('.scanner input[name=manual]', 'R-0001');
    await page.press('.scanner input[name=manual]', 'Enter');
    await page.waitForSelector('.scanner-msg.bad:has-text("Ausgeschlachtet")');
    await page.fill('.scanner input[name=manual]', 'R-9999');
    await page.press('.scanner input[name=manual]', 'Enter');
    await page.waitForSelector('.scanner-msg.bad:has-text("nicht im Bestand")');
    await page.click('.scanner-close');
    await page.waitForSelector('h2:has-text("Gefunden (1)")');
    assert.match(await page.textContent('main'), /Unerwartet gescannt/);
    await shot('15-inventur');
    await page.click('#btn-finish');
    await page.click('dialog button.btn-primary');
    await page.waitForSelector('h2:has-text("Letzte Inventur")');
    assert.match(await page.textContent('main'), /fehlten/);
  });

  await step('Übersicht mit Aktionen und Lagerorten', async () => {
    await page.goto(BASE);
    await page.waitForSelector('.actions');
    assert.match(await page.textContent('main'), /Bestand nach Lagerort/);
    await shot('16-dashboard');
  });

  await step('Dunkelmodus rendert', async () => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto(`${BASE}#/raeder`);
    await page.waitForSelector('.bike-card');
    await shot('11-dark');
  });

  assert.deepEqual(errors, [], `Browser-Fehler:\n${errors.join('\n')}`);
  console.log(`\nAlle Schritte erfolgreich. ${requests.length} simulierte KI-Anfragen. Screenshots: ${SHOTS}/`);
} catch (e) {
  await shot('zz-failure').catch(() => {});
  console.error('\nFEHLER:', e.message, errors.length ? `\nBrowser-Fehler:\n${errors.join('\n')}` : '');
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
}

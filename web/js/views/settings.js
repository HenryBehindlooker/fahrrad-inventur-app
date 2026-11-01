import * as db from '../db.js';
import { MODELS, testConnection } from '../ai.js';
import {
  exportBikesCSV, exportPartsCSV, exportBackup, importBackup,
} from '../exporter.js';
import {
  html, setView, $, options, toast, busy, formData, confirm, pickFile,
} from '../ui.js';
import { isNativeApp } from '../native.js';
import { navigate } from '../app.js';

const EFFORTS = [
  { id: 'low', name: 'Niedrig – schnell, günstig' },
  { id: 'medium', name: 'Mittel (Standard)' },
  { id: 'high', name: 'Hoch – gründlicher, langsamer' },
];

async function storageInfo() {
  if (!navigator.storage?.estimate) return '';
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${mb(usage)} belegt${quota ? ` von ca. ${mb(quota)}` : ''} · ${persisted ? 'dauerhaft gespeichert' : 'nicht als dauerhaft markiert'}`;
}

export async function settingsView() {
  const s = await db.getSettings();
  const [bikes, parts] = await Promise.all([db.listBikes(), db.listParts()]);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  setView(html`
    <form id="settings-form" class="card" autocomplete="off">
      <h2>KI-Erkennung (Claude)</h2>
      <p class="muted small">Entweder einen eigenen API-Key eintragen (bleibt nur auf diesem Gerät) <em>oder</em> eine Proxy-URL,
        die den Key serverseitig ergänzt (empfohlen, wenn mehrere Personen die App nutzen). Key erstellen unter
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>.</p>
      <label>API-Key <span class="muted small">(bei Proxy: dessen Zugangscode)</span><input name="apiKey" type="password" value="${s.apiKey}" placeholder="sk-ant-…" autocomplete="off" spellcheck="false"></label>
      <label>Proxy-URL (optional)<input name="proxyUrl" type="url" value="${s.proxyUrl}" placeholder="https://mein-proxy.example.workers.dev" spellcheck="false"></label>
      <div class="form-grid">
        <label>Modell<select name="model">${options(MODELS, s.model)}</select></label>
        <label>Gründlichkeit<select name="effort">${options(EFFORTS, s.effort)}</select></label>
        <label>Max. Fotos pro Erkennung<input name="maxPhotos" type="number" min="1" max="10" value="${s.maxPhotos}"></label>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" type="submit">Speichern</button>
        <button class="btn" type="button" id="btn-test">Verbindung testen</button>
      </div>
    </form>

    <section class="card">
      <h2>Export &amp; Sicherung</h2>
      <p class="muted small">${bikes.length} Räder · ${parts.length} Teile · <span id="storage"></span></p>
      <div class="btn-col">
        <button class="btn" id="btn-csv-bikes">Räderliste als CSV (Excel)</button>
        <button class="btn" id="btn-csv-parts">Teileliste als CSV (Excel)</button>
        <a class="btn" href="#/druck/liste">Inventurliste drucken / PDF</a>
        <a class="btn" href="#/druck/etiketten">Alle Etiketten drucken</a>
        <button class="btn" id="btn-backup">Komplett-Sicherung (JSON inkl. Fotos)</button>
        <button class="btn" id="btn-restore">Sicherung wiederherstellen …</button>
      </div>
      <p class="hint small">Die Daten liegen nur auf diesem Gerät. Bitte regelmäßig eine Komplett-Sicherung erstellen
        (z. B. in iCloud Drive / Dateien speichern) – sie dient auch zum Umzug auf ein anderes Gerät.</p>
    </section>

    <section class="card">
      <h2>App</h2>
      <p class="small">${isNativeApp() ? 'Läuft in der iOS-App (Swift/WKWebView).'
        : standalone ? 'Läuft als installierte Web-App.'
          : 'Tipp für iPhone/iPad: In Safari auf „Teilen“ → „Zum Home-Bildschirm“ tippen. Dann startet die App im Vollbild, funktioniert offline und die Daten bleiben dauerhaft erhalten.'}</p>
      <p class="muted small">Fahrrad-Inventur 1.0</p>
    </section>

    <section class="card danger-zone">
      <h2>Alle Daten löschen</h2>
      <p class="muted small">Löscht alle Räder, Teile und Fotos auf diesem Gerät. Einstellungen bleiben erhalten.</p>
      <button class="btn btn-danger" id="btn-wipe">Alles löschen …</button>
    </section>`, { title: 'Einstellungen' });

  storageInfo().then((t) => { const el = $('#storage'); if (el) el.textContent = t; });

  const form = $('#settings-form');
  const read = () => {
    const f = formData(form);
    return { ...s, apiKey: f.apiKey, proxyUrl: f.proxyUrl, model: f.model, effort: f.effort, maxPhotos: Math.min(10, Math.max(1, parseInt(f.maxPhotos, 10) || 6)) };
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await db.saveSettings(read());
    toast('Einstellungen gespeichert.', 'success');
  });
  $('#btn-test').addEventListener('click', async () => {
    const b = busy('Verbindung wird getestet …');
    try {
      const model = await testConnection(read());
      toast(`Verbindung OK (${model}).`, 'success', 5000);
    } catch (e) { toast(e.message, 'error', 7000); } finally { b.close(); }
  });

  const run = (fn, label) => async () => {
    const b = busy(label);
    try { await fn(); } catch (e) { toast(e.message, 'error', 6000); } finally { b.close(); }
  };
  $('#btn-csv-bikes').addEventListener('click', run(exportBikesCSV, 'Export …'));
  $('#btn-csv-parts').addEventListener('click', run(exportPartsCSV, 'Export …'));
  $('#btn-backup').addEventListener('click', run(exportBackup, 'Sicherung wird erstellt …'));
  $('#btn-restore').addEventListener('click', async () => {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    if (!await confirm('Sicherung wiederherstellen?', 'Der aktuelle Bestand auf diesem Gerät wird vollständig durch die Sicherung ersetzt.', 'Wiederherstellen', 'primary')) return;
    const b = busy('Wiederherstellen …');
    try {
      const r = await importBackup(file);
      toast(`Wiederhergestellt: ${r.bikes} Räder, ${r.parts} Teile, ${r.photos} Fotos.`, 'success', 5000);
      navigate('/');
    } catch (e) { toast(e.message, 'error', 6000); } finally { b.close(); }
  });
  $('#btn-wipe').addEventListener('click', async () => {
    if (!await confirm('Wirklich alles löschen?', 'Alle Räder, Teile und Fotos werden unwiderruflich gelöscht. Tipp: vorher eine Sicherung erstellen.')) return;
    await db.importAll({ bikes: [], parts: [], photos: [], counters: { bike: 0, part: 0 } });
    toast('Alle Daten gelöscht.', 'success');
    navigate('/');
  });
}

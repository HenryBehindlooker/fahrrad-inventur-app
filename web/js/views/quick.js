// Schnellerfassung (Serienmodus): viele Räder zügig fotografieren, die KI arbeitet im Hintergrund.
import * as db from '../db.js';
import { bikeTitle } from '../model.js';
import { processImage } from '../images.js';
import {
  html, setView, boundView, reloader, $, toast, busy, pickImages, thumb,
} from '../ui.js';
import { runQueue, retryFailed } from '../queue.js';

const SHOTS = ['Ganzes Rad von der Seite (Antriebsseite)', 'Steuerkopf-Schild / Hersteller-Logo', 'Schaltwerk & Kurbel', 'Rahmennummer (meist unter dem Tretlager)'];
const session = { photos: [], count: 0, location: '' };

export async function quickView() {
  const setView = boundView();
  const again = reloader(() => quickView());
  const settings = await db.getSettings();
  const aiReady = !!(settings.apiKey || settings.proxyUrl);
  const bikes = await db.listBikes();
  const queued = bikes.filter((b) => b.review === 'queued' || b.review === 'running').length;
  const ready = bikes.filter((b) => b.review === 'ready' || b.review === 'error').length;

  setView(html`
    <section class="card">
      <h2>Schnellerfassung</h2>
      <p class="muted small">Für viele Räder hintereinander: Fotos machen, „Speichern &amp; nächstes Rad“ tippen – fertig.
        Die KI erkennt im Hintergrund, du prüfst später gesammelt unter „Zu prüfen“.</p>
      ${aiReady ? '' : html`<p class="hint">Ohne API-Key werden die Räder nur mit Fotos gespeichert. Key unter <a href="#/einstellungen">Einstellungen</a> eintragen.</p>`}
      <label>Lagerort für diese Serie (optional)<input id="q-location" value="${session.location}" placeholder="z. B. Halle 2"></label>
      <ol class="shot-list">${SHOTS.map((s, i) => html`<li class="${session.photos.length > i ? 'done' : ''}">${s}</li>`)}</ol>
      <div class="photo-grid" id="q-photos"></div>
      <div class="btn-row">
        <button class="btn btn-primary" id="q-camera">📷 Foto</button>
        <button class="btn" id="q-gallery">🖼 Mediathek</button>
      </div>
      <button class="btn btn-primary btn-block" id="q-save" ${session.photos.length ? '' : 'disabled'}>✓ Speichern &amp; nächstes Rad</button>
      <p class="muted small">In dieser Sitzung erfasst: <strong id="q-count">${session.count}</strong></p>
    </section>
    <a class="card queue-card" href="#/pruefen">
      <span><strong>${queued}</strong> in Erkennung · <strong>${ready}</strong> zu prüfen</span><span aria-hidden="true">›</span>
    </a>`, { title: 'Schnellerfassung', back: '/' });

  const renderPhotos = () => {
    $('#q-photos').innerHTML = String(session.photos.length
      ? html`${session.photos.map((p, i) => html`<div class="photo"><img src="${p.thumb}" alt="Foto ${i + 1}"><button type="button" class="photo-del" data-i="${i}" aria-label="Foto entfernen">×</button></div>`)}`
      : html`<div class="photo-empty">Erstes Foto: ganzes Rad</div>`);
    $('#q-save').disabled = !session.photos.length;
    document.querySelectorAll('.shot-list li').forEach((li, i) => li.classList.toggle('done', session.photos.length > i));
  };
  const add = async (files) => {
    if (!files.length) return;
    const b = busy('Fotos werden verarbeitet …');
    try { for (const f of files) session.photos.push(await processImage(f)); } catch (e) { toast(e.message, 'error'); } finally { b.close(); }
    renderPhotos();
  };
  $('#q-camera').addEventListener('click', async () => add(await pickImages({ camera: true })));
  $('#q-gallery').addEventListener('click', async () => add(await pickImages()));
  $('#q-photos').addEventListener('click', (e) => {
    const btn = e.target.closest('.photo-del');
    if (!btn) return;
    session.photos.splice(Number(btn.dataset.i), 1);
    renderPhotos();
  });
  $('#q-location').addEventListener('input', (e) => { session.location = e.target.value.trim(); });
  $('#q-save').addEventListener('click', async () => {
    const b = busy('Speichern …');
    try {
      const saved = await db.createBike(
        { status: 'lager', location: session.location, review: aiReady ? 'queued' : 'ready' },
        [], session.photos, 'Schnellerfassung',
      );
      session.photos = [];
      session.count += 1;
      toast(`${saved.invNr} gespeichert${aiReady ? ' – KI erkennt im Hintergrund' : ''}.`, 'success');
      runQueue();
      again();
    } catch (e) { toast(e.message, 'error'); } finally { b.close(); }
  });
  renderPhotos();
}

const REVIEW_LABEL = { queued: 'wartet', running: 'KI arbeitet …', ready: 'bereit zur Prüfung', error: 'Fehler' };

export async function reviewView() {
  const setView = boundView();
  const again = reloader(() => reviewView());
  const bikes = (await db.listBikes()).filter((b) => b.review).sort((a, b) => a.invNr.localeCompare(b.invNr));
  const covers = new Map((await db.getPhotos(bikes.map((b) => b.photoIds?.[0]).filter(Boolean))).map((p) => [p.id, p.thumb]));
  const errors = bikes.filter((b) => b.review === 'error').length;

  setView(html`
    ${errors ? html`<div class="hint">${errors} Erkennung(en) fehlgeschlagen. <button class="btn btn-small" id="btn-retry">Erneut versuchen</button></div>` : ''}
    ${bikes.length ? html`<ul class="cards">${bikes.map((b) => html`
      <li><a class="bike-card" href="#/rad/${b.id}/bearbeiten?pruefen=1">
        ${thumb(covers.get(b.photoIds?.[0]), bikeTitle(b))}
        <div class="bike-card-body">
          <div class="bike-card-top"><span class="invnr">${b.invNr}</span><span class="status status-review-${b.review}">${REVIEW_LABEL[b.review]}</span></div>
          <strong class="bike-card-title">${b.manufacturer || b.model ? bikeTitle(b) : 'Noch nicht erkannt'}</strong>
          <span class="muted small">${b.reviewError || [b.type, b.year].filter(Boolean).join(' · ')}</span>
        </div></a></li>`)}</ul>`
    : html`<div class="empty"><p>Nichts zu prüfen ✓</p><a class="btn" href="#/schnell">Zur Schnellerfassung</a></div>`}`,
  { title: 'Zu prüfen', back: '/' });
  $('#btn-retry')?.addEventListener('click', () => { retryFailed(); toast('Erneut eingereiht.', 'success'); setTimeout(again, 300); });
}

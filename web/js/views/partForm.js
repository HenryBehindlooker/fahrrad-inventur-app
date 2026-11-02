// Einzelteil anlegen/bearbeiten, ein- und abbauen, per KI erkennen.
import * as db from '../db.js';
import {
  PART_STATUS, CONDITIONS, parseNumber, bikeTitle, partTitle, partGroupKey, groupParts, categoryLabel,
} from '../model.js';
import { recognizePart, partFromAi } from '../ai.js';
import { processImage } from '../images.js';
import {
  html, raw, setView, boundView, $, options, toast, busy, pickImages, formData, confirm,
} from '../ui.js';
import { categorySelect } from './bikeForm.js';
import { timeline } from './history.js';
import { navigate } from '../app.js';

export async function partFormView(id, query = {}) {
  const setView = boundView();
  const isNew = !id;
  const part = isNew
    ? { bikeId: query.rad || null, status: 'lager', quantity: 1, category: 'sonstiges/sonstiges', photoIds: [] }
    : await db.getPart(id);
  if (!part) { toast('Teil nicht gefunden', 'error'); navigate('/teile', { replace: true }); return; }

  const [bikes, allParts, photos, settings, events] = await Promise.all([
    db.listBikes(), db.listParts(), db.getPhotos(part.photoIds), db.getSettings(), isNew ? [] : db.eventsOf('part', id),
  ]);
  const locations = [...new Set(allParts.map((p) => p.location).concat(bikes.map((b) => b.location)).filter(Boolean))].sort();
  const bikeOptions = bikes
    .filter((b) => b.status !== 'ausgeschlachtet' || b.id === part.bikeId)
    .sort((a, b) => a.invNr.localeCompare(b.invNr))
    .map((b) => ({ id: b.id, name: `${b.invNr} – ${bikeTitle(b)}` }));
  const fromBike = bikes.find((b) => b.id === part.fromBikeId);
  const group = !isNew && groupParts(allParts).find((g) => g.key === partGroupKey(part));
  const aiReady = !!(settings.apiKey || settings.proxyUrl);
  const state = { newPhotos: [], removed: new Set() };
  const back = part.bikeId ? `/rad/${part.bikeId}` : '/teile';

  setView(html`
    <form id="part-form" autocomplete="off">
      ${isNew ? '' : html`<p class="muted">Inventar-Nr. <strong>${part.invNr}</strong>${fromBike ? html` · ursprünglich von <a href="#/rad/${fromBike.id}">${fromBike.invNr} ${bikeTitle(fromBike)}</a>` : ''}</p>`}
      ${group ? html`<a class="ai-box link-box" href="#/teile/gruppe/${encodeURIComponent(group.key)}">≡ Dieses Teil gibt es insgesamt <strong>${group.count}×</strong> (an ${group.onBikes} Rädern, ${group.inStock} im Lager) →</a>` : ''}

      <section class="card">
        <h2>Fotos</h2>
        <div class="photo-grid" id="photo-grid"></div>
        <div class="btn-row">
          <button type="button" class="btn" id="btn-camera">📷 Foto</button>
          <button type="button" class="btn" id="btn-gallery">🖼 Mediathek</button>
          <button type="button" class="btn btn-primary" id="btn-ai" ${aiReady ? '' : raw('disabled')}>✨ Teil erkennen</button>
        </div>
      </section>

      <section class="card">
        <h2>Teil</h2>
        <div class="form-grid">
          <label class="span-2">Kategorie${categorySelect('category', part.category)}</label>
          <label>Hersteller<input name="manufacturer" value="${part.manufacturer || ''}"></label>
          <label>Modell<input name="model" value="${part.model || ''}"></label>
          <label>Teile-Nr. / Referenz<input name="ref" value="${part.ref || ''}" placeholder="z. B. RD-6207"></label>
          <label>Menge<input name="quantity" type="number" min="1" step="1" value="${part.quantity || 1}"></label>
          <label class="span-2">Beschreibung<input name="description" value="${part.description || ''}"></label>
          <label>Zustand<select name="condition">${options(CONDITIONS.map((c) => ({ id: c.id, name: `${c.id} – ${c.name}` })), part.condition, { empty: '–' })}</select></label>
          <label>Wert € (pro Stück)<input name="value" inputmode="decimal" value="${part.value ?? ''}"></label>
        </div>
      </section>

      <section class="card">
        <h2>Verbleib</h2>
        <div class="form-grid">
          <label class="span-2">Verbaut an<select name="bikeId" id="sel-bike">${options(bikeOptions, part.bikeId, { empty: '— nicht verbaut (Einzelteil) —' })}</select></label>
          <label class="loose-only">Status<select name="status">${options(PART_STATUS, part.status === 'verbaut' ? 'lager' : part.status)}</select></label>
          <label class="loose-only">Lagerort<input name="location" list="dl-loc" value="${part.location || ''}" placeholder="z. B. Kiste 4"></label>
        </div>
        <label>Notizen<textarea name="notes" rows="3">${part.notes || ''}</textarea></label>
      </section>

      ${isNew ? '' : html`<section class="card"><div class="section-head"><h2>Verlauf</h2>
        <a class="btn btn-small" href="#/druck/etiketten?teile=${part.id}">Etikett drucken</a></div>${timeline(events)}</section>`}
      <datalist id="dl-loc">${locations.map((l) => html`<option value="${l}">`)}</datalist>

      <div class="sticky-actions">
        ${isNew ? '' : html`<button type="button" class="btn btn-danger" id="btn-delete">Löschen</button>`}
        <a class="btn" href="#${back}">Abbrechen</a>
        <button class="btn btn-primary" type="submit">Speichern</button>
      </div>
    </form>`, { title: isNew ? 'Neues Teil' : part.invNr, back });

  const form = $('#part-form');
  const toggleLoose = () => form.classList.toggle('installed', !!form.bikeId.value);
  form.bikeId.addEventListener('change', toggleLoose);
  toggleLoose();

  function renderPhotos() {
    const items = [
      ...photos.filter((p) => !state.removed.has(p.id)).map((p) => ({ key: `e:${p.id}`, src: p.thumb })),
      ...state.newPhotos.map((p, i) => ({ key: `n:${i}`, src: p.thumb })),
    ];
    $('#photo-grid').innerHTML = String(items.length
      ? html`${items.map((it) => html`<div class="photo"><img src="${it.src}" alt="Foto"><button type="button" class="photo-del" data-key="${it.key}" aria-label="Foto entfernen">×</button></div>`)}`
      : html`<div class="photo-empty">Keine Fotos</div>`);
    $('#btn-ai').disabled = !aiReady || !items.length;
  }
  async function addFiles(files) {
    if (!files.length) return;
    const b = busy('Fotos werden verarbeitet …');
    try { for (const f of files) state.newPhotos.push(await processImage(f)); } catch (e) { toast(e.message, 'error'); } finally { b.close(); }
    renderPhotos();
  }
  $('#btn-camera').addEventListener('click', async () => addFiles(await pickImages({ camera: true })));
  $('#btn-gallery').addEventListener('click', async () => addFiles(await pickImages()));
  $('#photo-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.photo-del');
    if (!btn) return;
    const [kind, ref] = btn.dataset.key.split(':');
    if (kind === 'e') state.removed.add(ref); else state.newPhotos.splice(Number(ref), 1);
    renderPhotos();
  });

  $('#btn-ai').addEventListener('click', async () => {
    const blobs = [...photos.filter((p) => !state.removed.has(p.id)).map((p) => p.blob), ...state.newPhotos.map((p) => p.blob)];
    const b = busy('KI erkennt das Teil …');
    try {
      const r = await recognizePart(settings, blobs, [form.manufacturer.value, form.model.value].filter(Boolean).join(' '));
      const p = partFromAi(r.part);
      form.category.value = p.category;
      for (const k of ['manufacturer', 'model', 'ref', 'description']) if (p[k]) form[k].value = p[k];
      if (p.condition) form.condition.value = p.condition;
      if (p.value) form.value.value = p.value;
      toast(`Erkannt: ${categoryLabel(p.category)} – ${partTitle(p)} (Sicherheit ${p.confidence || '?'})`, 'success', 5000);
      if (r.notes) form.notes.value = form.notes.value ? `${form.notes.value}\n${r.notes}` : r.notes;
    } catch (e) { toast(e.message, 'error', 7000); } finally { b.close(); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formData(form);
    const next = {
      ...part,
      category: f.category, manufacturer: f.manufacturer, model: f.model, ref: f.ref, description: f.description,
      quantity: Math.max(1, parseInt(f.quantity, 10) || 1),
      condition: f.condition ? Number(f.condition) : null, value: parseNumber(f.value),
      bikeId: f.bikeId || null, status: f.bikeId ? 'verbaut' : f.status, location: f.location, notes: f.notes,
    };
    // Abbauen merkt sich das Herkunftsrad
    if (part.bikeId && !next.bikeId) next.fromBikeId = part.bikeId;
    const b = busy('Speichern …');
    try {
      for (const pid of state.removed) await db.deletePhoto(pid);
      if (state.removed.size) next.photoIds = (part.photoIds || []).filter((x) => !state.removed.has(x));
      const saved = await db.savePart(next, state.newPhotos);
      toast(`${saved.invNr} gespeichert.`, 'success');
      navigate(saved.bikeId ? `/rad/${saved.bikeId}` : `/teil/${saved.id}`, { replace: true });
    } catch (err) { toast(`Speichern fehlgeschlagen: ${err.message}`, 'error', 6000); } finally { b.close(); }
  });

  $('#btn-delete')?.addEventListener('click', async () => {
    if (!await confirm('Teil löschen?', `${part.invNr} – ${partTitle(part)} wird endgültig gelöscht.`)) return;
    await db.deletePart(part.id);
    toast('Teil gelöscht.', 'success');
    navigate(back, { replace: true });
  });

  renderPhotos();
}

// Rad erfassen (Fotos -> KI-Erkennung -> Prüfen -> Speichern) und Rad bearbeiten.
import * as db from '../db.js';
import {
  BIKE_TYPES, BIKE_STATUS, CONDITIONS, FRAME_MATERIALS, CATEGORY_TREE, parseNumber, bikeTitle, partGroupKey,
} from '../model.js';
import { recognizeBike, bikeFromAi, partFromAi } from '../ai.js';
import { processImage } from '../images.js';
import {
  html, raw, setView, $, $$, options, toast, busy, pickImages, formData,
} from '../ui.js';
import { navigate } from '../app.js';

const KNOWN_MANUFACTURERS = [
  'Bianchi', 'Batavus', 'Gazelle', 'Peugeot', 'Raleigh', 'Motobécane', 'Colnago', 'Gitane', 'Kalkhoff', 'Hercules',
  'Vaterland', 'Diamant', 'Mifa', 'Rixe', 'Kettler', 'Koga-Miyata', 'Puch', 'Steyr', 'Miyata', 'Panasonic',
  'Centurion', 'Schwinn', 'Union', 'Express', 'Wanderer', 'Adler', 'NSU', 'Göricke', 'Torpedo', 'Brennabor',
  'Bauer', 'Staiger', 'Rabeneick', 'Patria', 'Triumph', 'Pegasus', 'Kreidler', 'Hollandia', 'Sparta', 'Fongers',
  'Cinelli', 'De Rosa', 'Pinarello', 'Olmo', 'Legnano', 'Atala', 'Eddy Merckx', 'Mercier', 'Lapierre', 'Cannondale',
  'Trek', 'Specialized', 'Giant', 'Cube', 'KTM', 'Diamondback', 'GT', 'Mongoose', 'Moulton', 'Brompton',
];

export function categorySelect(name, selected) {
  return html`<select name="${name}" aria-label="Kategorie">${CATEGORY_TREE.map((g) => html`<optgroup label="${g.name}">${g.children.map(
    ([cid, cname]) => html`<option value="${g.id}/${cid}" ${`${g.id}/${cid}` === selected ? raw('selected') : ''}>${cname}</option>`,
  )}</optgroup>`)}</select>`;
}

export async function bikeFormView(id, query = {}) {
  const isNew = !id;
  const bike = isNew ? { status: 'lager', photoIds: [] } : await db.getBike(id);
  if (!bike) { toast('Fahrrad nicht gefunden', 'error'); navigate('/raeder'); return; }

  const existingPhotos = isNew ? [] : await db.getPhotos(bike.photoIds);
  const existingParts = isNew ? [] : await db.partsOfBike(id);
  const allBikes = await db.listBikes();
  const manufacturers = [...new Set([...allBikes.map((b) => b.manufacturer).filter(Boolean), ...KNOWN_MANUFACTURERS])].sort((a, b) => a.localeCompare(b, 'de'));

  const state = {
    newPhotos: [], // { blob, thumb, width, height }
    removedPhotoIds: new Set(),
    proposals: [], // Teile-Vorschläge (neu)
    aiInfo: null,
    stage: isNew && query.manuell !== '1' ? 'photos' : 'form',
  };

  const settings = await db.getSettings();
  const aiReady = !!(settings.apiKey || settings.proxyUrl);

  setView(html`
    <section class="card" id="photo-card">
      <h2>Fotos</h2>
      <p class="muted small">Am besten: 1× ganzes Rad seitlich, dazu Details wie Steuerkopf-Schild, Schaltwerk, Kurbel,
        Bremsen und Rahmennummer (meist unter dem Tretlager).</p>
      <div class="photo-grid" id="photo-grid"></div>
      <div class="btn-row">
        <button type="button" class="btn" id="btn-camera">📷 Foto aufnehmen</button>
        <button type="button" class="btn" id="btn-gallery">🖼 Aus Mediathek</button>
      </div>
      <div class="btn-row" id="ai-row">
        <button type="button" class="btn btn-primary" id="btn-ai" ${aiReady ? '' : raw('disabled')}>✨ Mit KI erkennen</button>
        ${state.stage === 'photos' ? html`<button type="button" class="btn btn-ghost" id="btn-manual">Ohne KI weiter</button>` : ''}
      </div>
      ${aiReady ? '' : html`<p class="hint">Für die automatische Erkennung bitte unter <a href="#/einstellungen">Einstellungen</a> einen API-Key oder Proxy eintragen.</p>`}
      <div id="ai-info"></div>
    </section>

    <form id="bike-form" class="${state.stage === 'photos' ? 'is-hidden' : ''}" autocomplete="off">
      <section class="card">
        <h2>Fahrrad</h2>
        ${isNew ? '' : html`<p class="muted">Inventar-Nr. <strong>${bike.invNr}</strong></p>`}
        <div class="form-grid">
          <label>Hersteller<input name="manufacturer" list="dl-man" value="${bike.manufacturer || ''}"></label>
          <label>Modell<input name="model" value="${bike.model || ''}"></label>
          <label>Typ<select name="type">${options(BIKE_TYPES, bike.type, { empty: '– wählen –' })}</select></label>
          <label>Baujahr / Ära<input name="year" value="${bike.year || ''}" placeholder="z. B. ca. 1978"></label>
          <label>Rahmengröße<input name="frameSize" value="${bike.frameSize || ''}" placeholder="z. B. 56 cm"></label>
          <label>Laufradgröße<input name="wheelSize" value="${bike.wheelSize || ''}" placeholder="z. B. 28 Zoll"></label>
          <label>Farbe<input name="color" value="${bike.color || ''}"></label>
          <label>Rahmenmaterial<select name="frameMaterial">${options(FRAME_MATERIALS, bike.frameMaterial, { empty: '–' })}</select></label>
          <label>Rahmennummer<input name="frameNumber" value="${bike.frameNumber || ''}"></label>
          <label>Zustand<select name="condition">${options(CONDITIONS.map((c) => ({ id: c.id, name: `${c.id} – ${c.name}` })), bike.condition, { empty: '–' })}</select></label>
          <label>Status<select name="status">${options(BIKE_STATUS, bike.status)}</select></label>
          <label>Lagerort<input name="location" value="${bike.location || ''}" placeholder="z. B. Halle 2, Regal B"></label>
        </div>
      </section>
      <section class="card">
        <h2>Wert</h2>
        <div class="form-grid form-grid-3">
          <label>Einkaufspreis €<input name="purchasePrice" inputmode="decimal" value="${bike.purchasePrice ?? ''}"></label>
          <label>Schätzwert €<input name="estimatedValue" inputmode="decimal" value="${bike.estimatedValue ?? ''}"></label>
          <label>Verkaufspreis €<input name="salePrice" inputmode="decimal" value="${bike.salePrice ?? ''}"></label>
        </div>
        <label>Notizen<textarea name="notes" rows="4">${bike.notes || ''}</textarea></label>
      </section>

      <section class="card" id="parts-card">
        <h2>${isNew ? 'Teile' : 'Weitere Teile hinzufügen'}</h2>
        ${isNew ? '' : html`<p class="muted small">${existingParts.length} Teile sind bereits erfasst. Vorhandene Teile bearbeitest du in der Rad-Ansicht.</p>`}
        <div id="proposals"></div>
        <button type="button" class="btn btn-small" id="btn-add-part">+ Teil hinzufügen</button>
      </section>

      <div class="sticky-actions">
        <a class="btn" href="${isNew ? '#/raeder' : `#/rad/${id}`}">Abbrechen</a>
        <button class="btn btn-primary" type="submit">Speichern</button>
      </div>
      <datalist id="dl-man">${manufacturers.map((m) => html`<option value="${m}">`)}</datalist>
    </form>`, { title: isNew ? 'Neues Fahrrad' : `${bike.invNr} bearbeiten`, back: isNew ? '/raeder' : `/rad/${id}` });

  const form = $('#bike-form');

  // ---------- Fotos ----------
  function renderPhotos() {
    const items = [
      ...existingPhotos.filter((p) => !state.removedPhotoIds.has(p.id)).map((p) => ({ key: `e:${p.id}`, src: p.thumb })),
      ...state.newPhotos.map((p, i) => ({ key: `n:${i}`, src: p.thumb })),
    ];
    $('#photo-grid').innerHTML = String(items.length
      ? html`${items.map((it) => html`<div class="photo"><img src="${it.src}" alt="Foto">
          <button type="button" class="photo-del" data-key="${it.key}" aria-label="Foto entfernen">×</button></div>`)}`
      : html`<div class="photo-empty">Noch keine Fotos</div>`);
    $('#btn-ai').disabled = !aiReady || !items.length;
  }

  async function addFiles(files) {
    if (!files.length) return;
    const b = busy('Fotos werden verarbeitet …');
    try {
      for (const f of files) state.newPhotos.push(await processImage(f));
    } catch (e) {
      toast(`Foto konnte nicht gelesen werden: ${e.message}`, 'error');
    } finally { b.close(); }
    renderPhotos();
  }

  $('#btn-camera').addEventListener('click', async () => addFiles(await pickImages({ camera: true })));
  $('#btn-gallery').addEventListener('click', async () => addFiles(await pickImages()));
  $('#photo-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.photo-del');
    if (!btn) return;
    const [kind, ref] = btn.dataset.key.split(':');
    if (kind === 'e') state.removedPhotoIds.add(ref);
    else state.newPhotos.splice(Number(ref), 1);
    renderPhotos();
  });

  function showForm() {
    state.stage = 'form';
    form.classList.remove('is-hidden');
    $('#btn-manual')?.remove();
  }
  $('#btn-manual')?.addEventListener('click', () => { showForm(); form.manufacturer.focus(); });

  // ---------- KI ----------
  $('#btn-ai').addEventListener('click', async () => {
    const blobs = [
      ...(await db.getPhotos(existingPhotos.filter((p) => !state.removedPhotoIds.has(p.id)).map((p) => p.id))).map((p) => p.blob),
      ...state.newPhotos.map((p) => p.blob),
    ];
    if (!blobs.length) return;
    const b = busy(`KI analysiert ${Math.min(blobs.length, settings.maxPhotos)} Foto(s) … das kann bis zu einer Minute dauern.`);
    try {
      const r = await recognizeBike(settings, blobs);
      if (!r.is_bicycle) {
        toast('Auf den Fotos wurde kein Fahrrad erkannt.', 'error', 5000);
      }
      applyAi(r);
      showForm();
      toast('Erkennung abgeschlossen – bitte prüfen.', 'success');
    } catch (e) {
      toast(e.message, 'error', 7000);
    } finally { b.close(); }
  });

  function applyAi(r) {
    const fields = bikeFromAi(r);
    const overwrite = isNew;
    for (const [k, v] of Object.entries(fields)) {
      const el = form.elements[k];
      if (!el || v === null || v === '' || v === undefined) continue;
      if (overwrite || !el.value) el.value = v;
    }
    state.aiInfo = fields.ai;
    const known = new Set(existingParts.map(partGroupKey).filter(Boolean));
    const knownCats = new Set(existingParts.map((p) => p.category));
    syncProposals();
    const fresh = (r.parts || []).map(partFromAi).filter((p) => {
      const k = partGroupKey(p);
      return isNew || !(k ? known.has(k) : knownCats.has(p.category));
    });
    state.proposals = [...state.proposals.filter((p) => !p.fromAi), ...fresh.map((p) => ({ ...p, include: true, fromAi: true }))];
    renderProposals();
    const conf = { hoch: 'hoch', mittel: 'mittel', niedrig: 'niedrig' }[fields.ai.confidence] || '?';
    $('#ai-info').innerHTML = String(html`
      <div class="ai-box conf-${fields.ai.confidence}">
        <strong>KI-Ergebnis: ${bikeTitle(fields)}</strong> <span class="badge">Sicherheit: ${conf}</span>
        ${fields.notes ? html`<p class="small">${fields.notes}</p>` : ''}
        <p class="muted small">${fresh.length} Teile vorgeschlagen${isNew ? '' : ' (bereits erfasste ausgeblendet)'} · ${r.model}</p>
      </div>`);
  }

  // ---------- Teile-Vorschläge ----------
  function syncProposals() {
    $$('#proposals .proposal').forEach((row, i) => {
      const p = state.proposals[i];
      if (!p) return;
      for (const el of row.querySelectorAll('[name]')) {
        const field = el.name.split('.')[1];
        p[field] = el.type === 'checkbox' ? el.checked : el.value.trim();
      }
    });
  }

  function renderProposals() {
    $('#proposals').innerHTML = String(state.proposals.length ? html`${state.proposals.map((p, i) => html`
      <div class="proposal ${p.include ? '' : 'excluded'}">
        <div class="proposal-head">
          <label class="check"><input type="checkbox" name="${i}.include" ${p.include ? raw('checked') : ''}> übernehmen</label>
          ${p.confidence ? html`<span class="badge conf-${p.confidence}">${p.confidence}</span>` : ''}
          <button type="button" class="btn-icon" data-remove="${i}" aria-label="Vorschlag entfernen">×</button>
        </div>
        <div class="form-grid">
          <label>Kategorie${categorySelect(`${i}.category`, p.category || 'sonstiges/sonstiges')}</label>
          <label>Hersteller<input name="${i}.manufacturer" value="${p.manufacturer || ''}"></label>
          <label>Modell<input name="${i}.model" value="${p.model || ''}"></label>
          <label>Teile-Nr.<input name="${i}.ref" value="${p.ref || ''}"></label>
          <label class="span-2">Beschreibung<input name="${i}.description" value="${p.description || ''}"></label>
          <label>Zustand<select name="${i}.condition">${options(CONDITIONS.map((c) => ({ id: c.id, name: `${c.id} – ${c.name}` })), p.condition, { empty: '–' })}</select></label>
          <label>Wert €<input name="${i}.value" inputmode="decimal" value="${p.value ?? ''}"></label>
        </div>
      </div>`)}` : html`<p class="muted small">Noch keine Teile. Die KI schlägt Teile vor, oder du fügst sie selbst hinzu.</p>`);
  }

  $('#proposals').addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') e.target.closest('.proposal').classList.toggle('excluded', !e.target.checked);
  });
  $('#proposals').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    syncProposals();
    state.proposals.splice(Number(btn.dataset.remove), 1);
    renderProposals();
  });
  $('#btn-add-part').addEventListener('click', () => {
    syncProposals();
    state.proposals.push({ include: true, category: 'sonstiges/sonstiges', quantity: 1 });
    renderProposals();
    $$('#proposals .proposal').at(-1).querySelector('select').focus();
  });

  // ---------- Speichern ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    syncProposals();
    const f = formData(form);
    const data = {
      manufacturer: f.manufacturer, model: f.model, type: f.type, year: f.year, frameSize: f.frameSize,
      wheelSize: f.wheelSize, color: f.color, frameMaterial: f.frameMaterial, frameNumber: f.frameNumber,
      condition: f.condition ? Number(f.condition) : null, status: f.status || 'lager', location: f.location,
      purchasePrice: parseNumber(f.purchasePrice), estimatedValue: parseNumber(f.estimatedValue), salePrice: parseNumber(f.salePrice),
      notes: f.notes,
    };
    if (state.aiInfo) data.ai = state.aiInfo;
    const newParts = state.proposals.filter((p) => p.include).map(({ include, fromAi, ...p }) => ({
      category: p.category || 'sonstiges/sonstiges', manufacturer: p.manufacturer || '', model: p.model || '',
      ref: p.ref || '', description: p.description || '', condition: p.condition ? Number(p.condition) : null,
      value: parseNumber(p.value), quantity: 1, confidence: p.confidence || '',
    }));
    if (isNew && !state.newPhotos.length && !data.manufacturer && !data.model && !data.type) {
      toast('Bitte mindestens ein Foto, Hersteller, Modell oder Typ angeben.', 'error');
      return;
    }

    const b = busy('Speichern …');
    try {
      if (isNew) {
        const saved = await db.createBike(data, newParts, state.newPhotos);
        toast(`${saved.invNr} gespeichert (${newParts.length} Teile).`, 'success');
        navigate(`/rad/${saved.id}`, { replace: true });
      } else {
        for (const pid of state.removedPhotoIds) await db.deletePhoto(pid);
        const current = await db.getBike(id);
        const saved = await db.updateBike({ ...current, ...data }, state.newPhotos);
        for (const p of newParts) await db.savePart({ ...p, bikeId: id });
        toast('Änderungen gespeichert.', 'success');
        navigate(`/rad/${saved.id}`, { replace: true });
      }
    } catch (err) {
      toast(`Speichern fehlgeschlagen: ${err.message}`, 'error', 6000);
    } finally { b.close(); }
  });

  // Ungespeicherte neue Fotos nicht versehentlich verlieren
  const guard = (e) => {
    if (!state.newPhotos.length) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', guard);
  window.addEventListener('hashchange', () => window.removeEventListener('beforeunload', guard), { once: true });

  renderPhotos();
  renderProposals();
  if (!isNew && query.ki === '1' && aiReady && existingPhotos.length) $('#btn-ai').click();
}

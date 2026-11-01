import * as db from '../db.js';
import {
  BIKE_STATUS, CATEGORY_TREE, CONDITIONS, statusName, bikeTitle, partTitle, categoryInfo, formatEuro,
  groupParts, partGroupKey, parseNumber,
} from '../model.js';
import {
  html, setView, $, toast, confirm, dialog, fmtDate, conditionBadge, options,
} from '../ui.js';
import { navigate } from '../app.js';

export async function bikeDetailView(id) {
  const bike = await db.getBike(id);
  if (!bike) { toast('Fahrrad nicht gefunden', 'error'); navigate('/raeder', { replace: true }); return; }
  const [parts, allParts, photos] = await Promise.all([db.partsOfBike(id), db.listParts(), db.getPhotos(bike.photoIds)]);
  const formerParts = allParts.filter((p) => !p.bikeId && p.fromBikeId === id);

  // Wie oft gibt es jedes Teil noch (an anderen Rädern / im Lager)?
  const groups = new Map(groupParts(allParts).map((g) => [g.key, g]));
  const sameInfo = (p) => {
    const g = groups.get(partGroupKey(p));
    return g ? { key: g.key, others: g.count - (Number(p.quantity) || 1) } : null;
  };

  const partsByGroup = CATEGORY_TREE.map((g) => ({
    ...g, parts: parts.filter((p) => categoryInfo(p.category).group === g.id).sort((a, b) => a.category.localeCompare(b.category)),
  })).filter((g) => g.parts.length);
  const partsValue = parts.reduce((n, p) => n + (Number(p.value) || 0), 0);

  const row = (label, value) => (value || value === 0 ? html`<div class="kv"><dt>${label}</dt><dd>${value}</dd></div>` : '');

  setView(html`
    ${photos.length ? html`<div class="gallery" id="gallery">${photos.map((p, i) => html`
      <button type="button" class="gallery-item" data-i="${i}"><img src="${p.thumb}" alt="Foto ${i + 1}"></button>`)}</div>`
    : html`<div class="empty small"><p>Keine Fotos.</p><a class="btn btn-small" href="#/rad/${id}/bearbeiten">Fotos hinzufügen</a></div>`}

    <section class="card">
      <div class="detail-head">
        <div>
          <span class="invnr">${bike.invNr}</span>
          <h1>${bikeTitle(bike)}</h1>
          <span class="muted">${[bike.type, bike.year].filter(Boolean).join(' · ')}</span>
        </div>
        <span class="status status-${bike.status}">${statusName(BIKE_STATUS, bike.status)}</span>
      </div>
      <dl class="kvs">
        ${row('Rahmengröße', bike.frameSize)}
        ${row('Laufradgröße', bike.wheelSize)}
        ${row('Farbe', bike.color)}
        ${row('Rahmenmaterial', bike.frameMaterial)}
        ${row('Rahmennummer', bike.frameNumber)}
        ${row('Zustand', bike.condition ? `${bike.condition} – ${CONDITIONS.find((c) => c.id === bike.condition)?.name}` : '')}
        ${row('Lagerort', bike.location)}
        ${row('Einkaufspreis', bike.purchasePrice != null ? formatEuro(bike.purchasePrice) : '')}
        ${row('Schätzwert', bike.estimatedValue != null ? formatEuro(bike.estimatedValue) : '')}
        ${row('Verkaufspreis', bike.salePrice != null ? formatEuro(bike.salePrice) : '')}
        ${row('Summe Teilewerte', partsValue ? formatEuro(partsValue) : '')}
        ${row('Erfasst', fmtDate(bike.createdAt))}
        ${row('KI-Erkennung', bike.ai ? `${bike.ai.model} · Sicherheit ${bike.ai.confidence || '?'} · ${fmtDate(bike.ai.at)}` : '')}
      </dl>
      ${bike.notes ? html`<p class="notes">${bike.notes}</p>` : ''}
      <div class="btn-row">
        <a class="btn btn-primary" href="#/rad/${id}/bearbeiten">Bearbeiten</a>
        <button type="button" class="btn" id="btn-status">Status ändern</button>
        <a class="btn" href="#/druck/rad/${id}">Datenblatt</a>
        <a class="btn" href="#/druck/etiketten?ids=${id}">Etikett</a>
      </div>
    </section>

    <section class="card">
      <div class="section-head">
        <h2>Teile (${parts.length})</h2>
        <a class="btn btn-small btn-primary" href="#/teil/neu?rad=${id}">+ Teil</a>
      </div>
      ${partsByGroup.length ? partsByGroup.map((g) => html`
        <h3 class="group-title">${g.name}</h3>
        <ul class="list">${g.parts.map((p) => {
          const same = sameInfo(p);
          return html`<li><a class="row" href="#/teil/${p.id}">
            <div class="row-main"><span class="muted small">${categoryInfo(p.category).name}</span>
              <strong>${partTitle(p)}</strong>
              ${p.description && (p.manufacturer || p.model) ? html`<span class="muted small">${p.description}</span>` : ''}</div>
            <div class="row-side">${conditionBadge(p.condition)}
              ${same && same.others > 0 ? html`<span class="badge badge-link" title="Gleiches Teil weitere ${same.others}× im Bestand">≡ +${same.others}</span>` : ''}
              ${p.value ? html`<span class="muted small">${formatEuro(p.value)}</span>` : ''}</div>
          </a></li>`;
        })}</ul>`)
      : html`<p class="muted">Noch keine Teile erfasst.</p>`}
      <p class="muted small">≡ +n: dasselbe Teil gibt es noch n-mal an anderen Rädern oder im Lager.</p>
    </section>

    ${formerParts.length ? html`<section class="card"><h2>Abgebaute Teile (im Lager/verkauft)</h2>
      <ul class="list">${formerParts.map((p) => html`<li><a class="row" href="#/teil/${p.id}">
        <div class="row-main"><strong>${partTitle(p)}</strong><span class="muted small">${categoryInfo(p.category).name} · ${p.invNr}</span></div>
        <div class="row-side"><span class="badge badge-soft">${p.status}</span></div></a></li>`)}</ul></section>` : ''}

    <section class="card danger-zone">
      <h2>Weitere Aktionen</h2>
      <div class="btn-row">
        <button type="button" class="btn" id="btn-strip" ${parts.length ? '' : 'disabled'}>Ausschlachten (alle Teile ins Lager)</button>
        <button type="button" class="btn btn-danger" id="btn-delete">Rad löschen</button>
      </div>
    </section>`, {
    title: bike.invNr,
    back: '/raeder',
  });

  // Galerie: Vollbild
  $('#gallery')?.addEventListener('click', async (e) => {
    const item = e.target.closest('.gallery-item');
    if (!item) return;
    const ph = photos[Number(item.dataset.i)];
    const url = URL.createObjectURL(ph.blob);
    const ov = document.createElement('div');
    ov.className = 'lightbox';
    ov.innerHTML = `<img src="${url}" alt="Foto"><button class="lightbox-close" aria-label="Schließen">×</button>`;
    ov.addEventListener('click', () => { ov.remove(); URL.revokeObjectURL(url); });
    document.body.appendChild(ov);
  });

  $('#btn-status').addEventListener('click', async () => {
    const r = await dialog({
      title: 'Status ändern',
      body: html`<label>Status<select name="status">${options(BIKE_STATUS, bike.status)}</select></label>
        <label>Verkaufspreis € (optional)<input name="salePrice" inputmode="decimal" value="${bike.salePrice ?? ''}"></label>`,
      buttons: [{ label: 'Übernehmen', value: true, kind: 'primary' }],
    });
    if (!r) return;
    const status = r.form.status.value;
    const sp = r.form.salePrice.value.trim();
    await db.updateBike({ ...bike, status, salePrice: sp ? parseNumber(sp) : bike.salePrice ?? null });
    toast('Status geändert.', 'success');
    bikeDetailView(id);
  });

  $('#btn-strip').addEventListener('click', async () => {
    if (!await confirm('Rad ausschlachten?', `Alle ${parts.length} Teile werden abgebaut und als Einzelteile ins Lager übernommen. Das Rad erhält den Status „Ausgeschlachtet“.`, 'Ausschlachten', 'primary')) return;
    const n = await db.strip(id);
    toast(`${n} Teile ins Lager übernommen.`, 'success');
    bikeDetailView(id);
  });

  $('#btn-delete').addEventListener('click', async () => {
    const r = await dialog({
      title: 'Rad löschen?',
      body: html`<p>${bike.invNr} – ${bikeTitle(bike)} wird mit allen Fotos gelöscht.</p>
        ${parts.length ? html`<label class="check"><input type="checkbox" name="keep" checked> ${parts.length} verbaute Teile ins Lager übernehmen statt löschen</label>` : ''}`,
      buttons: [{ label: 'Löschen', value: true, kind: 'danger' }],
    });
    if (!r) return;
    await db.deleteBike(id, { keepParts: !!r.form.keep?.checked });
    toast('Rad gelöscht.', 'success');
    navigate('/raeder', { replace: true });
  });
}

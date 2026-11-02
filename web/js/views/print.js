// Druckansichten: Datenblatt pro Rad, Inventurliste, QR-Etiketten.
import qrcode from '../../vendor/qrcode.mjs';
import * as db from '../db.js';
import {
  BIKE_STATUS, CATEGORY_TREE, CONDITIONS, statusName, bikeTitle, partTitle, categoryInfo, formatEuro, matchesQuery,
} from '../model.js';
import { html, raw, setView, boundView, $, fmtDate } from '../ui.js';
import { printPage } from '../native.js';

/** QR-Inhalt: Link auf die App (öffnet das Rad/Teil direkt mit der iPhone-Kamera), sonst Kurzform. */
export function labelCode(invNr) {
  return location.protocol.startsWith('http') ? `${location.origin}${location.pathname}#/inv/${invNr}` : `FIR:${invNr}`;
}

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return raw(qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }));
}

function toolbar(back) {
  return html`<div class="print-toolbar no-print">
    <a class="btn" href="#${back}">← Zurück</a>
    <button class="btn btn-primary" id="btn-print" type="button">Drucken / PDF</button>
  </div>`;
}
function bindPrint() { $('#btn-print').addEventListener('click', printPage); }

export async function printBikeView(id) {
  const setView = boundView();
  const bike = await db.getBike(id);
  if (!bike) { setView(html`<p>Nicht gefunden.</p>`); return; }
  const [parts, photos] = await Promise.all([db.partsOfBike(id), db.getPhotos(bike.photoIds.slice(0, 1))]);
  const photoUrl = photos[0] ? URL.createObjectURL(photos[0].blob) : '';
  const field = (l, v) => (v || v === 0 ? html`<tr><th>${l}</th><td>${v}</td></tr>` : '');

  setView(html`${toolbar(`/rad/${id}`)}
    <article class="sheet">
      <header class="sheet-head">
        <div><div class="sheet-invnr">${bike.invNr}</div><h1>${bikeTitle(bike)}</h1>
          <p>${[bike.type, bike.year, bike.color].filter(Boolean).join(' · ')}</p></div>
        <div class="sheet-qr">${qrSvg(labelCode(bike.invNr))}</div>
      </header>
      <div class="sheet-cols">
        ${photoUrl ? html`<img class="sheet-photo" src="${photoUrl}" alt="">` : ''}
        <table class="sheet-table">
          ${field('Status', statusName(BIKE_STATUS, bike.status))}
          ${field('Rahmengröße', bike.frameSize)}
          ${field('Laufradgröße', bike.wheelSize)}
          ${field('Rahmenmaterial', bike.frameMaterial)}
          ${field('Rahmennummer', bike.frameNumber)}
          ${field('Zustand', bike.condition ? `${bike.condition} – ${CONDITIONS.find((c) => c.id === bike.condition)?.name}` : '')}
          ${field('Lagerort', bike.location)}
          ${field('Einkaufspreis', bike.purchasePrice != null ? formatEuro(bike.purchasePrice) : '')}
          ${field('Schätzwert', bike.estimatedValue != null ? formatEuro(bike.estimatedValue) : '')}
          ${field('Verkaufspreis', bike.salePrice != null ? formatEuro(bike.salePrice) : '')}
          ${field('Erfasst', fmtDate(bike.createdAt))}
        </table>
      </div>
      ${bike.notes ? html`<p class="sheet-notes">${bike.notes}</p>` : ''}
      <h2>Teile (${parts.length})</h2>
      <table class="print-table">
        <thead><tr><th>Inv.-Nr.</th><th>Bereich</th><th>Teil</th><th>Hersteller / Modell</th><th>Teile-Nr.</th><th>Zust.</th><th>Wert</th></tr></thead>
        <tbody>${CATEGORY_TREE.flatMap((g) => parts.filter((p) => categoryInfo(p.category).group === g.id)).map((p) => html`
          <tr><td>${p.invNr}</td><td>${categoryInfo(p.category).groupName}</td><td>${categoryInfo(p.category).name}</td>
            <td>${partTitle(p)}${p.description && (p.manufacturer || p.model) ? html`<br><small>${p.description}</small>` : ''}</td>
            <td>${p.ref}</td><td>${p.condition || ''}</td><td>${p.value ? formatEuro(p.value) : ''}</td></tr>`)}</tbody>
      </table>
      <footer class="sheet-foot">Fahrrad-Inventur · gedruckt am ${fmtDate(new Date().toISOString())}</footer>
    </article>`, { title: `Datenblatt ${bike.invNr}`, back: `/rad/${id}` });
  bindPrint();
}

async function filteredBikes(query) {
  const bikes = await db.listBikes();
  let list = bikes;
  if (query.ids) {
    const ids = new Set(query.ids.split(','));
    list = bikes.filter((b) => ids.has(b.id));
  } else {
    list = bikes.filter((b) => matchesQuery(b, query.q || '', ['invNr', 'manufacturer', 'model', 'type', 'color', 'frameNumber', 'year', 'notes', 'location'])
      && (!query.status || b.status === query.status) && (!query.typ || b.type === query.typ) && (!query.ort || b.location === query.ort));
  }
  return list.sort((a, b) => a.invNr.localeCompare(b.invNr));
}

export async function printListView(query) {
  const setView = boundView();
  const [list, parts] = await Promise.all([filteredBikes(query), db.listParts()]);
  const count = new Map();
  for (const p of parts) if (p.bikeId) count.set(p.bikeId, (count.get(p.bikeId) || 0) + 1);
  const total = list.reduce((n, b) => n + (Number(b.estimatedValue) || 0), 0);

  setView(html`${toolbar('/raeder')}
    <article class="sheet">
      <header class="sheet-head"><div><h1>Inventurliste Fahrräder</h1>
        <p>${list.length} Räder · Schätzwert gesamt ${formatEuro(total)} · Stand ${fmtDate(new Date().toISOString())}</p></div></header>
      <table class="print-table">
        <thead><tr><th>Inv.-Nr.</th><th>Hersteller / Modell</th><th>Typ</th><th>Baujahr</th><th>RH</th><th>Farbe</th><th>Rahmennr.</th><th>Zust.</th><th>Status</th><th>Teile</th><th>Wert</th></tr></thead>
        <tbody>${list.map((b) => html`<tr>
          <td>${b.invNr}</td><td>${bikeTitle(b)}</td><td>${b.type}</td><td>${b.year}</td><td>${b.frameSize}</td><td>${b.color}</td>
          <td>${b.frameNumber}</td><td>${b.condition || ''}</td><td>${statusName(BIKE_STATUS, b.status)}</td><td>${count.get(b.id) || 0}</td>
          <td>${b.estimatedValue ? formatEuro(b.estimatedValue) : ''}</td></tr>`)}</tbody>
      </table>
    </article>`, { title: 'Inventurliste', back: '/raeder' });
  bindPrint();
}

export async function printLabelsView(query) {
  const setView = boundView();
  let labels;
  let back = '/raeder';
  if (query.teile !== undefined) {
    const [parts, bikes] = await Promise.all([db.listParts(), db.listBikes()]);
    const byId = new Map(bikes.map((b) => [b.id, b]));
    const ids = query.teile ? new Set(query.teile.split(',')) : null;
    const list = parts
      .filter((p) => (ids ? ids.has(p.id) : !p.bikeId && ['lager', 'reserviert', 'defekt'].includes(p.status)))
      .sort((a, b) => a.invNr.localeCompare(b.invNr));
    labels = list.map((p) => ({
      invNr: p.invNr, title: partTitle(p),
      sub: [categoryInfo(p.category).name, p.ref, p.bikeId ? `an ${byId.get(p.bikeId)?.invNr || ''}` : p.location].filter(Boolean).join(' · '),
    }));
    back = ids && ids.size === 1 ? `/teil/${[...ids][0]}` : '/teile';
  } else {
    const list = await filteredBikes(query);
    labels = list.map((b) => ({ invNr: b.invNr, title: bikeTitle(b), sub: [b.type, b.year, b.frameSize].filter(Boolean).join(' · ') }));
    if (query.ids && !query.ids.includes(',')) back = `/rad/${query.ids}`;
  }
  setView(html`${toolbar(back)}
    <p class="no-print muted small">${labels.length} Etiketten · 3 Spalten auf A4 (z. B. 70 × 37 mm Etikettenbogen).
      Der QR-Code öffnet den Eintrag direkt – mit dem Scanner in der App oder der iPhone-Kamera.</p>
    <div class="labels">${labels.map((l) => html`
      <div class="label">
        <div class="label-qr">${qrSvg(labelCode(l.invNr))}</div>
        <div class="label-text"><strong>${l.invNr}</strong><span>${l.title}</span><small>${l.sub}</small></div>
      </div>`)}</div>`, { title: 'Etiketten', back });
  bindPrint();
}

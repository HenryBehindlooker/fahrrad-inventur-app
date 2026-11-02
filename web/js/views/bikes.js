import * as db from '../db.js';
import {
  BIKE_STATUS, BIKE_TYPES, statusName, bikeTitle, matchesQuery, formatEuro,
} from '../model.js';
import { html, setView, boundView, $, options, thumb, conditionBadge } from '../ui.js';
import { navigate } from '../app.js';

const SORTS = [
  { id: 'neu', name: 'Neueste zuerst' },
  { id: 'nr', name: 'Inventar-Nr.' },
  { id: 'hersteller', name: 'Hersteller' },
  { id: 'wert', name: 'Wert (hoch → niedrig)' },
];

export async function bikesView(_, query) {
  const setView = boundView();
  const [bikes, parts] = await Promise.all([db.listBikes(), db.listParts()]);
  const covers = new Map((await db.getPhotos(bikes.map((b) => b.photoIds?.[0]).filter(Boolean))).map((p) => [p.id, p.thumb]));
  const partCount = new Map();
  for (const p of parts) if (p.bikeId) partCount.set(p.bikeId, (partCount.get(p.bikeId) || 0) + 1);

  const q = query.q || '';
  const status = query.status || '';
  const typ = query.typ || '';
  const ort = query.ort || '';
  const locations = [...new Set(bikes.map((b) => b.location).filter(Boolean))].sort();
  const sort = query.sort || 'neu';

  let list = bikes.filter((b) => matchesQuery(b, q, ['invNr', 'manufacturer', 'model', 'type', 'color', 'frameNumber', 'year', 'notes', 'location'])
    && (!status || b.status === status) && (!typ || b.type === typ) && (!ort || b.location === ort));
  const sorters = {
    neu: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
    nr: (a, b) => a.invNr.localeCompare(b.invNr),
    hersteller: (a, b) => bikeTitle(a).localeCompare(bikeTitle(b), 'de'),
    wert: (a, b) => (b.estimatedValue || 0) - (a.estimatedValue || 0),
  };
  list = list.sort(sorters[sort] || sorters.neu);
  const filterQs = new URLSearchParams(Object.entries({ q, status, typ, ort }).filter(([, v]) => v)).toString();

  setView(html`
    <form class="filters" id="filters">
      <input type="search" name="q" value="${q}" placeholder="Suchen: Hersteller, Modell, Inv.-Nr., Rahmennr. …" aria-label="Suchen">
      <div class="filter-row">
        <select name="status" aria-label="Status">${options(BIKE_STATUS, status, { empty: 'Alle Status' })}</select>
        <select name="typ" aria-label="Typ">${options(BIKE_TYPES, typ, { empty: 'Alle Typen' })}</select>
        ${locations.length ? html`<select name="ort" aria-label="Lagerort">${options(locations, ort, { empty: 'Alle Lagerorte' })}</select>` : ''}
        <select name="sort" aria-label="Sortierung">${options(SORTS, sort)}</select>
      </div>
    </form>
    <div class="list-head">
      <span class="muted">${list.length} von ${bikes.length} Rädern</span>
      <span class="list-head-actions">
        <a class="btn btn-small" href="#/druck/liste?${filterQs}">Liste drucken</a>
        <a class="btn btn-small" href="#/druck/etiketten?${filterQs}">Etiketten</a>
      </span>
    </div>
    ${list.length ? html`<ul class="cards">${list.map((b) => html`
      <li><a class="bike-card" href="#/rad/${b.id}">
        ${thumb(covers.get(b.photoIds?.[0]), bikeTitle(b))}
        <div class="bike-card-body">
          <div class="bike-card-top"><span class="invnr">${b.invNr}</span>
            <span class="status status-${b.status}">${statusName(BIKE_STATUS, b.status)}</span></div>
          <strong class="bike-card-title">${bikeTitle(b)}</strong>
          <span class="muted small">${[b.type, b.year, b.frameSize, b.color].filter(Boolean).join(' · ')}</span>
          <div class="bike-card-meta">${b.review ? html`<span class="badge conf-mittel">${b.review === 'ready' ? 'zu prüfen' : b.review === 'error' ? 'KI-Fehler' : 'KI läuft'}</span>` : ''}
            ${(b.tasks || []).some((t) => !t.done) ? html`<span class="badge badge-soft">🔧 ${(b.tasks || []).filter((t) => !t.done).length}</span>` : ''}
            ${conditionBadge(b.condition)}
            <span class="badge badge-soft">${partCount.get(b.id) || 0} Teile</span>
            ${b.estimatedValue ? html`<span class="badge badge-soft">${formatEuro(b.estimatedValue)}</span>` : ''}</div>
        </div>
      </a></li>`)}</ul>`
    : html`<div class="empty"><p>${bikes.length ? 'Keine Räder passen zum Filter.' : 'Noch keine Räder erfasst.'}</p>
        <a class="btn btn-primary" href="#/rad/neu">Fahrrad erfassen</a></div>`}
    <a class="fab" href="#/rad/neu" aria-label="Neues Fahrrad">+</a>`,
  { title: 'Fahrräder' });

  const form = $('#filters');
  let t;
  const apply = () => {
    const params = new URLSearchParams();
    for (const el of form.elements) if (el.name && el.value && !(el.name === 'sort' && el.value === 'neu')) params.set(el.name, el.value);
    navigate(`/raeder${params.toString() ? `?${params}` : ''}`, { replace: true });
  };
  form.addEventListener('change', apply);
  form.addEventListener('submit', (e) => { e.preventDefault(); apply(); });
  form.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 350); });
  if (q) { form.q.focus(); form.q.setSelectionRange(q.length, q.length); }
}

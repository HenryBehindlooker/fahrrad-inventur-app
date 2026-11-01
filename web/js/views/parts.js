// Teile: Lager, alle Teile, gleiche Teile (Gruppen) und Gruppendetail.
import * as db from '../db.js';
import {
  CATEGORY_TREE, PART_STATUS, categoryInfo, categoryLabel, statusName, partTitle, bikeTitle, groupParts,
  matchesQuery, formatEuro,
} from '../model.js';
import { html, setView, $, conditionBadge, toast } from '../ui.js';
import { navigate } from '../app.js';

const TABS = [
  { id: 'lager', name: 'Lager' },
  { id: 'alle', name: 'Alle Teile' },
  { id: 'gruppen', name: 'Gleiche Teile' },
];

function where(p, bikes) {
  if (p.bikeId) {
    const b = bikes.get(p.bikeId);
    return b ? html`<a href="#/rad/${b.id}" class="where where-bike">an ${b.invNr} ${bikeTitle(b)}</a>` : html`<span class="where">verbaut</span>`;
  }
  return html`<span class="where where-${p.status}">${statusName(PART_STATUS, p.status)}${p.location ? ` · ${p.location}` : ''}</span>`;
}

export function partRow(p, bikes) {
  return html`<li><div class="row">
    <a class="row-main" href="#/teil/${p.id}">
      <span class="muted small">${p.invNr} · ${categoryLabel(p.category)}</span>
      <strong>${partTitle(p)}${(Number(p.quantity) || 1) > 1 ? ` (${p.quantity}×)` : ''}</strong>
      ${p.ref ? html`<span class="muted small">Teile-Nr. ${p.ref}</span>` : ''}
    </a>
    <div class="row-side">${conditionBadge(p.condition)}${p.value ? html`<span class="muted small">${formatEuro(p.value)}</span>` : ''}
      ${where(p, bikes)}</div>
  </div></li>`;
}

export async function partsView(query) {
  const tab = query.tab || 'lager';
  const q = query.q || '';
  const cat = query.kat || '';
  const [parts, bikeList] = await Promise.all([db.listParts(), db.listBikes()]);
  const bikes = new Map(bikeList.map((b) => [b.id, b]));

  const fits = (p) => matchesQuery(p, q, ['invNr', 'manufacturer', 'model', 'ref', 'description', 'location', 'notes'])
    && (!cat || categoryInfo(p.category).group === cat || p.category === cat);

  let body;
  if (tab === 'gruppen') {
    const groups = groupParts(parts.filter(fits));
    body = groups.length ? html`<ul class="list">${groups.map((g) => html`
      <li><a class="row" href="#/teile/gruppe/${encodeURIComponent(g.key)}">
        <div class="row-main"><span class="muted small">${categoryLabel(g.category)}</span>
          <strong>${g.manufacturer} ${g.model}</strong>${g.ref ? html`<span class="muted small">Teile-Nr. ${g.ref}</span>` : ''}</div>
        <div class="row-side"><span class="badge">${g.count}×</span>
          <span class="muted small">an ${g.onBikes} Rädern · ${g.inStock} im Lager</span></div>
      </a></li>`)}</ul>`
      : html`<div class="empty"><p>Keine gleichen Teile gefunden.</p>
        <p class="muted small">Teile gelten als gleich, wenn Kategorie und Teile-Nr. – oder Kategorie, Hersteller und Modell – übereinstimmen.</p></div>`;
  } else {
    const list = parts
      .filter((p) => (tab === 'alle' ? true : !p.bikeId && ['lager', 'reserviert', 'defekt'].includes(p.status)))
      .filter(fits)
      .sort((a, b) => a.category.localeCompare(b.category) || partTitle(a).localeCompare(partTitle(b), 'de'));
    body = list.length
      ? html`<p class="muted small">${list.length} Teile</p><ul class="list">${list.map((p) => partRow(p, bikes))}</ul>`
      : html`<div class="empty"><p>${tab === 'lager' ? 'Keine Teile im Lager.' : 'Keine Teile gefunden.'}</p>
          <p class="muted small">Teile kommen ins Lager, wenn du sie an einem Rad abbaust, ein Rad ausschlachtest oder sie einzeln erfasst.</p></div>`;
  }

  const catOptions = html`<option value="">Alle Bereiche</option>${CATEGORY_TREE.map((g) => html`
    <option value="${g.id}" ${cat === g.id ? 'selected' : ''}>${g.name}</option>`)}`;

  setView(html`
    <nav class="tabs" role="tablist">${TABS.map((t) => html`
      <a role="tab" href="#/teile?tab=${t.id}${q ? `&q=${encodeURIComponent(q)}` : ''}${cat ? `&kat=${cat}` : ''}"
         class="${t.id === tab ? 'active' : ''}" aria-selected="${t.id === tab}">${t.name}</a>`)}</nav>
    <form class="filters" id="filters">
      <input type="search" name="q" value="${q}" placeholder="Suchen: Hersteller, Modell, Teile-Nr. …" aria-label="Suchen">
      <div class="filter-row"><select name="kat" aria-label="Bereich">${catOptions}</select></div>
    </form>
    ${body}
    <a class="fab" href="#/teil/neu" aria-label="Einzelteil erfassen">+</a>`, { title: 'Teile' });

  // "selected" wird oben als Text eingefügt – Auswahl sicherheitshalber per DOM setzen
  $('#filters').kat.value = cat;

  const form = $('#filters');
  let t;
  const apply = () => {
    const params = new URLSearchParams({ tab });
    if (form.q.value.trim()) params.set('q', form.q.value.trim());
    if (form.kat.value) params.set('kat', form.kat.value);
    navigate(`/teile?${params}`, { replace: true });
  };
  form.addEventListener('change', apply);
  form.addEventListener('submit', (e) => { e.preventDefault(); apply(); });
  form.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 350); });
  if (q) { form.q.focus(); form.q.setSelectionRange(q.length, q.length); }
}

export async function partGroupView(key) {
  const [parts, bikeList] = await Promise.all([db.listParts(), db.listBikes()]);
  const bikes = new Map(bikeList.map((b) => [b.id, b]));
  const group = groupParts(parts, 1).find((g) => g.key === key);
  if (!group) { toast('Gruppe nicht gefunden', 'error'); navigate('/teile?tab=gruppen', { replace: true }); return; }

  const installed = group.items.filter((p) => p.bikeId);
  const loose = group.items.filter((p) => !p.bikeId);
  const values = group.items.map((p) => Number(p.value)).filter((v) => v > 0);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

  setView(html`
    <section class="card">
      <span class="muted small">${categoryLabel(group.category)}</span>
      <h1>${group.manufacturer} ${group.model}</h1>
      ${group.ref ? html`<p class="muted">Teile-Nr. ${group.ref}</p>` : ''}
      <div class="tiles tiles-3">
        <div class="tile tile-small"><span class="tile-value">${group.count}</span><span class="tile-label">gesamt</span></div>
        <div class="tile tile-small"><span class="tile-value">${installed.length}</span><span class="tile-label">verbaut</span></div>
        <div class="tile tile-small"><span class="tile-value">${group.inStock}</span><span class="tile-label">im Lager</span></div>
      </div>
      ${avg ? html`<p class="muted small">Ø Wert: ${formatEuro(avg)}</p>` : ''}
    </section>
    ${installed.length ? html`<section class="card"><h2>Verbaut an Rädern</h2><ul class="list">${installed.map((p) => partRow(p, bikes))}</ul></section>` : ''}
    ${loose.length ? html`<section class="card"><h2>Einzelteile</h2><ul class="list">${loose.map((p) => partRow(p, bikes))}</ul></section>` : ''}
  `, { title: 'Gleiche Teile', back: '/teile?tab=gruppen' });
}

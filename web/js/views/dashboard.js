import * as db from '../db.js';
import { computeStats, formatEuro, categoryLabel } from '../model.js';
import { html, setView, raw, ICON_BIKE } from '../ui.js';

/** Einfache horizontale Balkenliste (eine Datenreihe, eine Farbe, Werte als Text). */
function bars(entries, { max = 8, link = null } = {}) {
  if (!entries.length) return html`<p class="muted">Noch keine Daten.</p>`;
  const top = entries.slice(0, max);
  const rest = entries.slice(max).reduce((n, [, v]) => n + v, 0);
  if (rest) top.push(['Weitere', rest]);
  const peak = Math.max(...top.map(([, v]) => v));
  return html`<ul class="bars">${top.map(([label, v]) => {
    const inner = html`<span class="bar-label">${label}</span><span class="bar-value">${v}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${raw(String(Math.max(2, (v / peak) * 100)))}%"></span></span>`;
    return html`<li title="${label}: ${v}">${link && label !== 'Weitere' && label !== '–' ? html`<a href="${link(label)}">${inner}</a>` : inner}</li>`;
  })}</ul>`;
}

export async function dashboardView() {
  const [bikes, parts] = await Promise.all([db.listBikes(), db.listParts()]);
  const s = computeStats(bikes, parts);

  if (!bikes.length && !parts.length) {
    setView(html`
      <div class="hero">
        <div class="hero-icon">${raw(ICON_BIKE)}</div>
        <h1>Willkommen bei der Fahrrad-Inventur</h1>
        <p>Fotografiere ein Fahrrad – die KI erkennt Hersteller, Modell, Baujahr und die verbauten Teile.
           Du prüfst das Ergebnis und speicherst es mit einer Inventarnummer.</p>
        <a class="btn btn-primary btn-lg" href="#/rad/neu">Erstes Fahrrad erfassen</a>
        <p class="muted small">Tipp: Hinterlege zuerst unter <a href="#/einstellungen">Einstellungen</a> deinen Claude-API-Key.</p>
      </div>`, { title: 'Übersicht' });
    return;
  }

  setView(html`
    <section class="tiles">
      <a class="tile" href="#/raeder"><span class="tile-value">${s.bikeCount}</span><span class="tile-label">Fahrräder</span>
        <span class="tile-sub">${s.activeBikeCount} im Bestand</span></a>
      <a class="tile" href="#/teile?tab=alle"><span class="tile-value">${s.partCount}</span><span class="tile-label">Teile erfasst</span>
        <span class="tile-sub">${s.installedPartCount} verbaut</span></a>
      <a class="tile" href="#/teile?tab=lager"><span class="tile-value">${s.stockPartCount}</span><span class="tile-label">Teile im Lager</span>
        <span class="tile-sub">einzeln geführt</span></a>
      <div class="tile"><span class="tile-value">${formatEuro(s.stockValue)}</span><span class="tile-label">Bestandswert</span>
        <span class="tile-sub">Schätzwert Räder + Lager</span></div>
    </section>

    <section class="tiles tiles-2">
      <div class="tile tile-small"><span class="tile-label">Einkauf gesamt</span><span class="tile-value">${formatEuro(s.purchaseTotal)}</span></div>
      <div class="tile tile-small"><span class="tile-label">Verkauft gesamt</span><span class="tile-value">${formatEuro(s.salesTotal)}</span></div>
    </section>

    <a class="btn btn-primary btn-block" href="#/rad/neu">+ Fahrrad fotografieren &amp; erfassen</a>

    <div class="grid-2">
      <section class="card"><h2>Räder nach Status</h2>${bars(s.byStatus)}</section>
      <section class="card"><h2>Räder nach Typ</h2>${bars(s.byType, { link: (l) => `#/raeder?typ=${encodeURIComponent(l)}` })}</section>
      <section class="card"><h2>Hersteller</h2>${bars(s.byManufacturer, { link: (l) => `#/raeder?q=${encodeURIComponent(l)}` })}</section>
      <section class="card"><h2>Teile nach Bereich</h2>${bars(s.byPartGroup)}</section>
    </div>

    <section class="card">
      <h2>Häufigste gleiche Teile</h2>
      ${s.topGroups.length ? html`<ul class="list">${s.topGroups.map((g) => html`
        <li><a class="row" href="#/teile/gruppe/${encodeURIComponent(g.key)}">
          <div class="row-main"><strong>${g.manufacturer} ${g.model}</strong>
            <span class="muted small">${categoryLabel(g.category)}${g.ref ? ` · ${g.ref}` : ''}</span></div>
          <div class="row-side"><span class="badge">${g.count}×</span>
            <span class="muted small">${g.onBikes} Räder · ${g.inStock} Lager</span></div>
        </a></li>`)}</ul>`
        : html`<p class="muted">Sobald dasselbe Teil an mehreren Rädern oder im Lager erfasst ist, erscheint es hier.</p>`}
    </section>`, { title: 'Übersicht' });
}

import * as db from '../db.js';
import { computeStats, formatEuro, categoryLabel } from '../model.js';
import { html, setView, boundView, raw, ICON_BIKE, $ } from '../ui.js';
import { scanAndOpen } from './scan.js';

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
  const setView = boundView();
  const [bikes, parts, settings, inventur] = await Promise.all([db.listBikes(), db.listParts(), db.getSettings(), db.getMeta('inventur')]);
  const s = computeStats(bikes, parts, settings.laborRate);

  if (!bikes.length && !parts.length) {
    setView(html`
      <div class="hero">
        <div class="hero-icon">${raw(ICON_BIKE)}</div>
        <h1>Willkommen bei der Fahrrad-Inventur</h1>
        <p>Fotografiere ein Fahrrad – die KI erkennt Hersteller, Modell, Baujahr und die verbauten Teile.
           Du prüfst das Ergebnis und speicherst es mit einer Inventarnummer.</p>
        <a class="btn btn-primary btn-lg" href="#/rad/neu">Erstes Fahrrad erfassen</a>
        <p><a href="#/schnell">Viele Räder auf einmal? → Schnellerfassung</a></p>
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

    <section class="tiles">
      <div class="tile tile-small"><span class="tile-label">Einkauf gesamt</span><span class="tile-value">${formatEuro(s.purchaseTotal)}</span></div>
      <div class="tile tile-small"><span class="tile-label">Verkauft gesamt</span><span class="tile-value">${formatEuro(s.salesTotal)}</span></div>
      <div class="tile tile-small"><span class="tile-label">Gewinn (verkauft)</span><span class="tile-value ${s.realizedMargin < 0 ? 'neg-text' : ''}">${formatEuro(s.realizedMargin)}</span></div>
      <div class="tile tile-small"><span class="tile-label">Ø Tage bis Verkauf</span><span class="tile-value">${s.avgDaysToSell ?? '–'}</span></div>
    </section>

    <section class="actions">
      <a class="action action-primary" href="#/rad/neu"><span class="action-icon">📷</span><span>Fahrrad erfassen</span></a>
      <a class="action" href="#/schnell"><span class="action-icon">⚡</span><span>Schnellerfassung</span></a>
      <button type="button" class="action" id="dash-scan"><span class="action-icon">⌗</span><span>Etikett scannen</span></button>
      <a class="action" href="#/inventur"><span class="action-icon">✓</span><span>${inventur ? 'Inventur fortsetzen' : 'Inventur starten'}</span></a>
    </section>

    ${s.toReview || s.openTasks || s.slowMovers ? html`<section class="card todo">
      <h2>Zu erledigen</h2>
      <ul class="list">
        ${s.toReview ? html`<li><a class="row" href="#/pruefen"><span class="row-main"><strong>${s.toReview} Räder prüfen</strong><span class="muted small">KI-Ergebnisse aus der Schnellerfassung bestätigen</span></span><span class="badge">${s.toReview}</span></a></li>` : ''}
        ${s.openTasks ? html`<li><a class="row" href="#/raeder?status=arbeit"><span class="row-main"><strong>${s.openTasks} offene Werkstatt-Aufgaben</strong><span class="muted small">Aufbereitung geplanter Räder</span></span><span class="badge">${s.openTasks}</span></a></li>` : ''}
        ${s.slowMovers ? html`<li><a class="row" href="#/raeder?sort=nr"><span class="row-main"><strong>${s.slowMovers} Räder länger als 90 Tage im Bestand</strong><span class="muted small">Preis prüfen, Anzeige schalten oder ausschlachten</span></span><span class="badge badge-soft">${s.slowMovers}</span></a></li>` : ''}
      </ul></section>` : ''}

    <div class="grid-2">
      <section class="card"><h2>Räder nach Status</h2>${bars(s.byStatus)}</section>
      <section class="card"><h2>Räder nach Typ</h2>${bars(s.byType, { link: (l) => `#/raeder?typ=${encodeURIComponent(l)}` })}</section>
      <section class="card"><h2>Hersteller</h2>${bars(s.byManufacturer, { link: (l) => `#/raeder?q=${encodeURIComponent(l)}` })}</section>
      <section class="card"><h2>Teile nach Bereich</h2>${bars(s.byPartGroup)}</section>
      ${s.byLocation.some(([l]) => l !== '–') ? html`<section class="card"><h2>Bestand nach Lagerort</h2>${bars(s.byLocation, { link: (l) => `#/raeder?ort=${encodeURIComponent(l)}` })}</section>` : ''}
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
  $('#dash-scan').addEventListener('click', scanAndOpen);
}

import * as db from '../db.js';
import {
  BIKE_STATUS, CATEGORY_TREE, CONDITIONS, statusName, bikeTitle, partTitle, categoryInfo, categoryLabel, formatEuro,
  groupParts, partGroupKey, parseNumber, bikeCalc, stockCandidates, daysBetween, normalize,
} from '../model.js';
import { sellAssistant } from '../ai.js';
import {
  html, raw, setView, boundView, reloader, $, $$, toast, confirm, dialog, fmtDate, conditionBadge, options, busy,
} from '../ui.js';
import { saveFile } from '../native.js';
import { categorySelect } from './bikeForm.js';
import { timeline } from './history.js';
import { navigate } from '../app.js';

const TASK_SUGGESTIONS = [
  'Reinigen & polieren', 'Kette ersetzen', 'Reifen & Schläuche erneuern', 'Bremsbeläge ersetzen', 'Bremsen einstellen',
  'Schaltung einstellen', 'Züge & Hüllen erneuern', 'Lager warten (Tretlager, Naben, Steuersatz)', 'Laufräder zentrieren',
  'Licht prüfen / reparieren', 'Rost behandeln', 'Lenkerband / Griffe erneuern', 'Probefahrt',
];

export async function bikeDetailView(id) {
  const setView = boundView();
  const bike = await db.getBike(id);
  if (!bike) { toast('Fahrrad nicht gefunden', 'error'); navigate('/raeder', { replace: true }); return; }
  const [parts, allParts, photos, allBikes, events, settings] = await Promise.all([
    db.partsOfBike(id), db.listParts(), db.getPhotos(bike.photoIds), db.listBikes(), db.eventsOf('bike', id), db.getSettings(),
  ]);
  const formerParts = allParts.filter((p) => !p.bikeId && p.fromBikeId === id);
  const groups = new Map(groupParts(allParts).map((g) => [g.key, g]));
  const sameInfo = (p) => {
    const g = groups.get(partGroupKey(p));
    return g ? { key: g.key, others: g.count - (Number(p.quantity) || 1) } : null;
  };
  const partsByGroup = CATEGORY_TREE.map((g) => ({
    ...g, parts: parts.filter((p) => categoryInfo(p.category).group === g.id).sort((a, b) => a.category.localeCompare(b.category)),
  })).filter((g) => g.parts.length);
  const partsValue = parts.reduce((n, p) => n + (Number(p.value) || 0), 0);
  const calc = bikeCalc(bike, settings.laborRate);
  const tasks = bike.tasks || [];
  const fn = normalize(bike.frameNumber);
  const duplicates = fn ? allBikes.filter((b) => b.id !== id && normalize(b.frameNumber) === fn) : [];
  const days = daysBetween(bike.purchaseDate || bike.createdAt, bike.status === 'verkauft' ? (bike.soldDate || bike.updatedAt) : undefined);
  const aiReady = !!(settings.apiKey || settings.proxyUrl);
  const sale = bike.sale;

  const row = (label, value) => (value || value === 0 ? html`<div class="kv"><dt>${label}</dt><dd>${value}</dd></div>` : '');
  const money = (v) => (v != null && v !== '' ? formatEuro(v) : '');

  setView(html`
    ${bike.review ? html`<a class="ai-box link-box review-banner" href="#/rad/${id}/bearbeiten?pruefen=1">
      ${bike.review === 'ready' ? '✨ KI-Ergebnis liegt vor – bitte prüfen und bestätigen →'
        : bike.review === 'error' ? `⚠ KI-Erkennung fehlgeschlagen: ${bike.reviewError || ''} – manuell ergänzen →`
          : '⏳ KI-Erkennung läuft im Hintergrund …'}</a>` : ''}

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
        ${row('Angekauft', [bike.purchaseDate ? fmtDate(bike.purchaseDate) : '', bike.purchasedFrom].filter(Boolean).join(' · '))}
        ${row('Verkauft', [bike.soldDate ? fmtDate(bike.soldDate) : '', bike.soldTo].filter(Boolean).join(' · '))}
        ${row(bike.status === 'verkauft' ? 'Standzeit bis Verkauf' : 'Im Bestand seit', days !== null ? `${days} Tagen` : '')}
        ${row('Einkaufspreis', money(bike.purchasePrice))}
        ${row('Schätzwert', money(bike.estimatedValue))}
        ${row('Verkaufspreis', money(bike.salePrice))}
        ${row('Summe Teilewerte', partsValue ? formatEuro(partsValue) : '')}
        ${row('Zuletzt gezählt', bike.lastSeenAt ? fmtDate(bike.lastSeenAt) : '')}
        ${row('KI-Erkennung', bike.ai ? `${bike.ai.model} · Sicherheit ${bike.ai.confidence || '?'} · ${fmtDate(bike.ai.at)}` : '')}
      </dl>
      ${bike.notes ? html`<p class="notes">${bike.notes}</p>` : ''}
      ${bike.frameNumber ? html`<div class="frame-check">
        ${duplicates.length ? html`<p class="hint">⚠ Gleiche Rahmennummer auch bei ${duplicates.map((d, i) => html`${i ? ', ' : ''}<a href="#/rad/${d.id}">${d.invNr}</a>`)} – Doppelerfassung?</p>` : ''}
        <p class="muted small">Rahmennummer auf Diebstahl prüfen:
          <a href="https://bikeindex.org/bikes?serial=${encodeURIComponent(bike.frameNumber)}&stolenness=all" target="_blank" rel="noopener">Bike Index</a> ·
          bei Zweifel die örtliche Polizei fragen (Abgleich mit der Fahndungsdatei).</p></div>` : ''}
      <div class="btn-row">
        <a class="btn btn-primary" href="#/rad/${id}/bearbeiten">Bearbeiten</a>
        <button type="button" class="btn" id="btn-status">Status / Verkauf</button>
        <a class="btn" href="#/druck/rad/${id}">Datenblatt</a>
        <a class="btn" href="#/druck/etiketten?ids=${id}">Etikett</a>
      </div>
    </section>

    <section class="card" id="werkstatt">
      <div class="section-head"><h2>Werkstatt (${calc.openTasks} offen)</h2></div>
      ${tasks.length ? html`<ul class="tasks">${tasks.map((t, i) => html`
        <li class="${t.done ? 'done' : ''}">
          <label class="check"><input type="checkbox" data-task="${i}" ${t.done ? raw('checked') : ''}> <span>${t.text}</span></label>
          <span class="muted small">${t.hours ? `${String(t.hours).replace('.', ',')} h` : ''}${t.hours && t.partsCost ? ' · ' : ''}${t.partsCost ? formatEuro(t.partsCost) : ''}</span>
          <button type="button" class="btn-icon" data-del-task="${i}" aria-label="Aufgabe löschen">×</button>
        </li>`)}</ul>` : html`<p class="muted small">Noch keine Aufgaben. Plane hier die Aufbereitung – Arbeitszeit und Teilekosten fließen in die Kalkulation.</p>`}
      <form id="task-form" class="task-form" autocomplete="off">
        <input name="text" list="dl-tasks" placeholder="Neue Aufgabe, z. B. Kette ersetzen" aria-label="Aufgabe" required>
        <input name="hours" inputmode="decimal" placeholder="Std." aria-label="Arbeitszeit in Stunden">
        <input name="partsCost" inputmode="decimal" placeholder="Teile €" aria-label="Teilekosten in Euro">
        <button class="btn btn-small btn-primary" type="submit">+</button>
        <datalist id="dl-tasks">${TASK_SUGGESTIONS.map((t) => html`<option value="${t}">`)}</datalist>
      </form>
      <table class="calc">
        <tr><td>Einkaufspreis</td><td>${formatEuro(bike.purchasePrice || 0)}</td></tr>
        <tr><td>Teilekosten</td><td>${formatEuro(calc.partsCost)}</td></tr>
        <tr><td>Arbeitszeit ${String(calc.hours).replace('.', ',')} h × ${formatEuro(settings.laborRate)}</td><td>${formatEuro(calc.labor)}</td></tr>
        <tr class="sum"><td>Kosten gesamt</td><td>${formatEuro(calc.cost)}</td></tr>
        <tr><td>${calc.realized ? 'Verkaufserlös' : bike.salePrice != null ? 'Angebotspreis' : 'Schätzwert'}</td><td>${calc.revenue != null ? formatEuro(calc.revenue) : '–'}</td></tr>
        <tr class="sum ${calc.margin != null && calc.margin < 0 ? 'neg' : 'pos'}"><td>${calc.realized ? 'Gewinn' : 'Erwarteter Gewinn'}</td><td>${calc.margin != null ? formatEuro(calc.margin) : '–'}</td></tr>
      </table>
      <p class="muted small">Stundensatz in den Einstellungen änderbar.</p>
    </section>

    <section class="card">
      <div class="section-head">
        <h2>Teile (${parts.length})</h2>
        <span class="list-head-actions"><button class="btn btn-small" id="btn-from-stock">Aus Lager einbauen</button>
          <a class="btn btn-small btn-primary" href="#/teil/neu?rad=${id}">+ Teil</a></span>
      </div>
      ${partsByGroup.length ? partsByGroup.map((g) => html`
        <h3 class="group-title">${g.name}</h3>
        <ul class="list">${g.parts.map((p) => {
          const same = sameInfo(p);
          return html`<li><div class="row">
            <a class="row-main" href="#/teil/${p.id}"><span class="muted small">${categoryInfo(p.category).name}</span>
              <strong>${partTitle(p)}</strong>
              ${p.description && (p.manufacturer || p.model) ? html`<span class="muted small">${p.description}</span>` : ''}</a>
            <div class="row-side">${conditionBadge(p.condition)}
              ${same && same.others > 0 ? html`<a class="badge badge-link" href="#/teile/gruppe/${encodeURIComponent(same.key)}" title="Gleiches Teil weitere ${same.others}× im Bestand">≡ +${same.others}</a>` : ''}
              ${p.value ? html`<span class="muted small">${formatEuro(p.value)}</span>` : ''}
              <button class="btn-link small" data-unmount="${p.id}">abbauen</button></div>
          </div></li>`;
        })}</ul>`)
      : html`<p class="muted">Noch keine Teile erfasst.</p>`}
      <p class="muted small">≡ +n: dasselbe Teil gibt es noch n-mal an anderen Rädern oder im Lager.</p>
    </section>

    ${formerParts.length ? html`<section class="card"><h2>Abgebaute Teile</h2>
      <ul class="list">${formerParts.map((p) => html`<li><a class="row" href="#/teil/${p.id}">
        <div class="row-main"><strong>${partTitle(p)}</strong><span class="muted small">${categoryInfo(p.category).name} · ${p.invNr}</span></div>
        <div class="row-side"><span class="badge badge-soft">${p.status}</span></div></a></li>`)}</ul></section>` : ''}

    <section class="card" id="verkauf">
      <div class="section-head"><h2>Verkauf</h2>
        <button class="btn btn-small ${sale ? '' : 'btn-primary'}" id="btn-sale" ${aiReady ? '' : raw('disabled')}>✨ ${sale ? 'Neu bewerten' : 'Bewerten & Anzeige schreiben'}</button></div>
      ${sale ? html`
        <div class="tiles tiles-3">
          <div class="tile tile-small"><span class="tile-label">Privat</span><span class="tile-value">${formatEuro(sale.price_private_low)}–${formatEuro(sale.price_private_high).replace(/\s?€/, '')} €</span></div>
          <div class="tile tile-small"><span class="tile-label">Händler</span><span class="tile-value">${formatEuro(sale.price_dealer)}</span></div>
          <div class="tile tile-small"><span class="tile-label">Teile einzeln</span><span class="tile-value">${formatEuro(sale.price_parts_out)}</span></div>
        </div>
        <p><span class="badge">Empfehlung: ${sale.recommendation}</span></p>
        <p class="small">${sale.reasoning}</p>
        <div class="btn-row"><button class="btn btn-small" id="btn-take-value">Schätzwert übernehmen (${formatEuro(Math.round((sale.price_private_low + sale.price_private_high) / 2))})</button>
          <button class="btn btn-small" id="btn-take-price">Als Angebotspreis (${formatEuro(sale.price_private_high)})</button></div>
        <h3>Anzeige</h3>
        <div class="listing"><strong id="listing-title">${sale.title}</strong>
          <p id="listing-text">${sale.text}</p>
          ${sale.defects?.length ? html`<p class="small"><strong>Mängel:</strong> ${sale.defects.join(', ')}</p>` : ''}
          ${sale.keywords?.length ? html`<p class="muted small">Suchbegriffe: ${sale.keywords.join(', ')}</p>` : ''}</div>
        <div class="btn-row"><button class="btn" id="btn-copy">Text kopieren</button><button class="btn" id="btn-share">Teilen …</button></div>
        <p class="muted small">${sale.model} · ${fmtDate(sale.at)} · KI-Schätzung, bitte mit aktuellen Angeboten vergleichen.</p>`
      : html`<p class="muted small">Die KI schätzt Privat-, Händler- und Ausschlachtwert, gibt eine Empfehlung und schreibt einen ehrlichen Anzeigentext für Kleinanzeigen oder eBay.</p>`}
    </section>

    <section class="card"><h2>Verlauf</h2>${timeline(events)}</section>

    <section class="card danger-zone">
      <h2>Weitere Aktionen</h2>
      <div class="btn-row">
        <button type="button" class="btn" id="btn-strip" ${parts.length ? '' : raw('disabled')}>Ausschlachten (alle Teile ins Lager)</button>
        <button type="button" class="btn btn-danger" id="btn-delete">Rad löschen</button>
      </div>
    </section>`, { title: bike.invNr, back: '/raeder' });

  const reload = reloader(() => bikeDetailView(id));

  $('#gallery')?.addEventListener('click', (e) => {
    const item = e.target.closest('.gallery-item');
    if (!item) return;
    const url = URL.createObjectURL(photos[Number(item.dataset.i)].blob);
    const ov = document.createElement('div');
    ov.className = 'lightbox';
    ov.innerHTML = `<img src="${url}" alt="Foto"><button class="lightbox-close" aria-label="Schließen">×</button>`;
    ov.addEventListener('click', () => { ov.remove(); URL.revokeObjectURL(url); });
    document.body.appendChild(ov);
  });

  // ----- Status / Verkauf -----
  $('#btn-status').addEventListener('click', async () => {
    const r = await dialog({
      title: 'Status / Verkauf',
      body: html`<label>Status<select name="status">${options(BIKE_STATUS, bike.status)}</select></label>
        <div class="form-grid">
          <label>Verkaufspreis €<input name="salePrice" inputmode="decimal" value="${bike.salePrice ?? ''}"></label>
          <label>Verkauft am<input name="soldDate" type="date" value="${bike.soldDate || ''}"></label>
          <label class="span-2">Käufer (optional)<input name="soldTo" value="${bike.soldTo || ''}"></label>
        </div>`,
      buttons: [{ label: 'Übernehmen', value: true, kind: 'primary' }],
    });
    if (!r) return;
    const f = r.form;
    const status = f.status.value;
    await db.updateBike({
      id, status,
      salePrice: f.salePrice.value.trim() ? parseNumber(f.salePrice.value) : null,
      soldDate: f.soldDate.value || (status === 'verkauft' && !bike.soldDate ? new Date().toISOString().slice(0, 10) : bike.soldDate || ''),
      soldTo: f.soldTo.value.trim(),
    });
    toast('Gespeichert.', 'success');
    reload();
  });

  // ----- Werkstatt-Aufgaben -----
  const saveTasks = async (next, note) => { await db.updateBike({ id, tasks: next }, [], note); reload(); };
  $('#task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const text = f.text.value.trim();
    if (!text) return;
    await saveTasks([...tasks, { text, hours: parseNumber(f.hours.value) || 0, partsCost: parseNumber(f.partsCost.value) || 0, done: false }], `Aufgabe: ${text}`);
  });
  $$('[data-task]').forEach((cb) => cb.addEventListener('change', async () => {
    const i = Number(cb.dataset.task);
    const next = tasks.map((t, j) => (j === i ? { ...t, done: cb.checked, doneAt: cb.checked ? new Date().toISOString() : null } : t));
    await saveTasks(next, `${cb.checked ? 'Erledigt' : 'Wieder offen'}: ${tasks[i].text}`);
  }));
  $$('[data-del-task]').forEach((b) => b.addEventListener('click', async () => {
    const i = Number(b.dataset.delTask);
    await saveTasks(tasks.filter((_, j) => j !== i), `Aufgabe entfernt: ${tasks[i].text}`);
  }));

  // ----- Teile: abbauen / aus Lager einbauen -----
  $$('[data-unmount]').forEach((b) => b.addEventListener('click', async (e) => {
    e.preventDefault();
    const p = parts.find((x) => x.id === b.dataset.unmount);
    if (!await confirm('Teil abbauen?', `${p.invNr} ${partTitle(p)} kommt als Einzelteil ins Lager.`, 'Abbauen', 'primary')) return;
    await db.movePart(p.id, null);
    toast(`${p.invNr} ist jetzt im Lager.`, 'success');
    reload();
  }));
  $('#btn-from-stock').addEventListener('click', async () => {
    const stock = allParts.filter((p) => !p.bikeId && p.status === 'lager');
    if (!stock.length) { toast('Keine Teile im Lager.', 'info'); return; }
    const render = (cat) => {
      const list = cat ? stockCandidates(allParts, cat) : stock;
      return list.length ? html`${list.slice(0, 50).map((p) => html`<label class="pick"><input type="radio" name="pid" value="${p.id}">
        <span><strong>${partTitle(p)}</strong><br><span class="muted small">${p.invNr} · ${categoryLabel(p.category)}${p.condition ? ` · Zustand ${p.condition}` : ''}${p.location ? ` · ${p.location}` : ''}</span></span></label>`)}`
        : html`<p class="muted">Kein passendes Teil im Lager.</p>`;
    };
    const dlgPromise = dialog({
      title: 'Teil aus dem Lager einbauen',
      body: html`<label>Welches Teil wird gebraucht?${raw(String(categorySelect('cat', '')).replace('<select', '<select id="stock-cat"').replace('>', '><option value="">Alle Lagerteile</option>'))}</label>
        <div id="stock-list" class="pick-list">${render('')}</div>`,
      buttons: [{ label: 'Einbauen', value: true, kind: 'primary' }],
    });
    $('#stock-cat').value = '';
    $('#stock-cat').addEventListener('change', (e) => { $('#stock-list').innerHTML = String(render(e.target.value)); });
    const r = await dlgPromise;
    const pid = r?.form.querySelector('input[name=pid]:checked')?.value;
    if (!pid) return;
    await db.movePart(pid, id);
    toast('Teil eingebaut.', 'success');
    reload();
  });

  // ----- Verkaufsassistent -----
  $('#btn-sale').addEventListener('click', async () => {
    const b = busy('KI bewertet das Rad und schreibt die Anzeige …');
    try {
      const imgs = (await db.getPhotos(bike.photoIds.slice(0, 3))).map((p) => p.blob);
      const result = await sellAssistant(settings, bike, parts, imgs);
      await db.updateBike({ id, sale: result }, [], `KI-Bewertung: privat ${formatEuro(result.price_private_low)}–${formatEuro(result.price_private_high)}`);
      toast('Bewertung erstellt.', 'success');
      await reload();
      document.getElementById('verkauf')?.scrollIntoView({ behavior: 'smooth' });
    } catch (e) { toast(e.message, 'error', 7000); } finally { b.close(); }
  });
  const listing = () => `${sale.title}\n\n${sale.text}${sale.defects?.length ? `\n\nMängel: ${sale.defects.join(', ')}` : ''}`;
  $('#btn-copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(listing()); toast('Anzeigentext kopiert.', 'success'); } catch { toast('Kopieren nicht möglich – Text bitte markieren.', 'error'); }
  });
  $('#btn-share')?.addEventListener('click', async () => {
    if (navigator.share) { try { await navigator.share({ title: sale.title, text: listing() }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    await saveFile(new Blob([listing()], { type: 'text/plain;charset=utf-8' }), `anzeige-${bike.invNr}.txt`);
  });
  $('#btn-take-value')?.addEventListener('click', async () => {
    await db.updateBike({ id, estimatedValue: Math.round((sale.price_private_low + sale.price_private_high) / 2) });
    toast('Schätzwert übernommen.', 'success'); reload();
  });
  $('#btn-take-price')?.addEventListener('click', async () => {
    await db.updateBike({ id, salePrice: sale.price_private_high, status: bike.status === 'lager' ? 'bereit' : bike.status });
    toast('Angebotspreis übernommen.', 'success'); reload();
  });

  // ----- Ausschlachten / Löschen -----
  $('#btn-strip').addEventListener('click', async () => {
    if (!await confirm('Rad ausschlachten?', `Alle ${parts.length} Teile werden abgebaut und als Einzelteile ins Lager übernommen. Das Rad erhält den Status „Ausgeschlachtet“.`, 'Ausschlachten', 'primary')) return;
    const n = await db.strip(id);
    toast(`${n} Teile ins Lager übernommen.`, 'success');
    reload();
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

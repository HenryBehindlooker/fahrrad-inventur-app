// QR-Schnellsuche, Inventur-Durchlauf (Bestandsprüfung per Scan) und Auflösung von Etiketten-Links.
import * as db from '../db.js';
import {
  extractInvNr, bikeTitle, partTitle, statusName, BIKE_STATUS, PART_STATUS, categoryLabel,
} from '../model.js';
import { html, setView, boundView, reloader, $, toast, confirm, fmtDate } from '../ui.js';
import { openScanner } from '../scanner.js';
import { navigate } from '../app.js';

const hrefOf = (hit) => (hit.type === 'bike' ? `/rad/${hit.item.id}` : `/teil/${hit.item.id}`);
const titleOf = (hit) => `${hit.item.invNr} ${hit.type === 'bike' ? bikeTitle(hit.item) : partTitle(hit.item)}`;

/** Scanner öffnen und zum gescannten Rad/Teil springen. */
export function scanAndOpen() {
  openScanner({
    title: 'Etikett scannen',
    hint: 'Rad- oder Teile-Etikett in den Rahmen halten',
    onResult: async (text) => {
      const nr = extractInvNr(text);
      if (!nr) return { ok: false, message: 'Kein Inventur-Etikett erkannt.' };
      const hit = await db.findByInvNr(nr);
      if (!hit) return { ok: false, message: `${nr} ist nicht im Bestand.` };
      navigate(hrefOf(hit));
      return { close: true };
    },
  });
}

/** Etiketten-Link (#/inv/R-0001) auflösen. */
export async function invRedirectView([nr]) {
  const setView = boundView();
  const hit = await db.findByInvNr(extractInvNr(nr) || nr);
  if (!hit) { toast(`${nr} nicht gefunden`, 'error'); navigate('/', { replace: true }); return; }
  navigate(hrefOf(hit), { replace: true });
}

const ACTIVE_BIKE = (b) => !['verkauft', 'ausgeschlachtet'].includes(b.status);
const LOOSE_PART = (p) => !p.bikeId && ['lager', 'reserviert', 'defekt'].includes(p.status);

export async function inventurView() {
  const setView = boundView();
  const again = reloader(() => inventurView());
  const [session, last, bikes, parts] = await Promise.all([
    db.getMeta('inventur'), db.getMeta('inventurLast'), db.listBikes(), db.listParts(),
  ]);

  if (!session) {
    setView(html`
      <section class="card">
        <h2>Inventur per Scan</h2>
        <p>Gehe durch Lager und Werkstatt und scanne jedes Etikett. Die App zeigt live, was schon gezählt ist und was noch fehlt.</p>
        <p class="muted small">Erwartet werden ${bikes.filter(ACTIVE_BIKE).length} Räder im Bestand und ${parts.filter(LOOSE_PART).length} Einzelteile im Lager.
          Verbaute Teile zählen mit dem Rad. Fehlen Etiketten, druckst du sie unter Räder → Etiketten bzw. Teile → Etiketten.</p>
        <button class="btn btn-primary btn-block" id="btn-start">Inventur starten</button>
      </section>
      ${last ? html`<section class="card"><h2>Letzte Inventur</h2>
        <p>${fmtDate(last.finishedAt)}: ${last.seen} von ${last.expected} gefunden${last.missing.length ? html`, <strong>${last.missing.length} fehlten</strong>` : ' – vollständig ✓'}.</p>
        ${last.missing.length ? html`<ul class="list">${last.missing.map((m) => html`<li><a class="row" href="#/inv/${m.invNr}"><span class="row-main"><strong>${m.invNr}</strong><span class="muted small">${m.title}</span></span></a></li>`)}</ul>` : ''}
      </section>` : ''}`, { title: 'Inventur', back: '/' });
    $('#btn-start').addEventListener('click', async () => {
      await db.setMeta('inventur', { startedAt: new Date().toISOString(), seen: {} });
      again().then(() => $('#btn-scan')?.click());
    });
    return;
  }

  const expected = [
    ...bikes.filter(ACTIVE_BIKE).map((b) => ({ invNr: b.invNr, title: bikeTitle(b), sub: [b.type, b.location].filter(Boolean).join(' · ') })),
    ...parts.filter(LOOSE_PART).map((p) => ({ invNr: p.invNr, title: partTitle(p), sub: [categoryLabel(p.category), p.location].filter(Boolean).join(' · ') })),
  ].sort((a, b) => a.invNr.localeCompare(b.invNr));
  const seen = session.seen || {};
  const missing = expected.filter((e) => !seen[e.invNr]);
  const found = expected.filter((e) => seen[e.invNr]);
  const extra = Object.keys(seen).filter((nr) => !expected.some((e) => e.invNr === nr));
  const pct = expected.length ? Math.round((found.length / expected.length) * 100) : 100;

  setView(html`
    <section class="card">
      <div class="section-head"><h2>Inventur läuft</h2><span class="muted small">seit ${fmtDate(session.startedAt)}</span></div>
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      <p><strong>${found.length}</strong> von ${expected.length} gefunden · <strong>${missing.length}</strong> fehlen${extra.length ? html` · <span class="warn-text">${extra.length} unerwartet</span>` : ''}</p>
      <button class="btn btn-primary btn-block" id="btn-scan">📷 Etiketten scannen</button>
      <div class="btn-row"><button class="btn" id="btn-finish">Inventur abschließen</button><button class="btn btn-ghost" id="btn-cancel">Abbrechen</button></div>
    </section>
    ${extra.length ? html`<section class="card"><h2>Unerwartet gescannt</h2><p class="muted small">Diese Einträge sind als verkauft, verbaut oder ausgeschlachtet geführt – bitte Status prüfen.</p>
      <ul class="list">${extra.map((nr) => html`<li><a class="row" href="#/inv/${nr}"><span class="row-main"><strong>${nr}</strong></span></a></li>`)}</ul></section>` : ''}
    <section class="card"><h2>Noch nicht gefunden (${missing.length})</h2>
      ${missing.length ? html`<ul class="list">${missing.map((m) => html`<li><div class="row">
        <a class="row-main" href="#/inv/${m.invNr}"><strong>${m.invNr} · ${m.title}</strong><span class="muted small">${m.sub}</span></a>
        <button class="btn btn-small" data-seen="${m.invNr}">gesehen</button></div></li>`)}</ul>` : html`<p>Alles gefunden ✓</p>`}
    </section>
    <section class="card"><h2>Gefunden (${found.length})</h2>
      <ul class="list">${found.map((m) => html`<li><a class="row" href="#/inv/${m.invNr}"><span class="row-main"><strong>${m.invNr} · ${m.title}</strong><span class="muted small">${m.sub}</span></span><span class="badge cond-1">✓</span></a></li>`)}</ul>
    </section>`, { title: 'Inventur', back: '/' });

  const mark = async (nr) => {
    const s = (await db.getMeta('inventur')) || { startedAt: new Date().toISOString(), seen: {} };
    const already = !!s.seen[nr];
    s.seen[nr] = new Date().toISOString();
    await db.setMeta('inventur', s);
    const hit = await db.findByInvNr(nr);
    if (hit) await db.markSeen(hit.type, hit.item.id);
    return { hit, already };
  };

  $('#btn-scan').addEventListener('click', () => {
    openScanner({
      title: 'Inventur – Etiketten scannen',
      hint: 'Ein Etikett nach dem anderen scannen',
      onClose: () => again(),
      onResult: async (text) => {
        const nr = extractInvNr(text);
        if (!nr) return { ok: false, message: 'Kein Inventur-Etikett erkannt.' };
        const { hit, already } = await mark(nr);
        if (!hit) return { ok: false, message: `${nr} ist nicht im Bestand!` };
        const status = hit.type === 'bike' ? statusName(BIKE_STATUS, hit.item.status) : (hit.item.bikeId ? 'verbaut' : statusName(PART_STATUS, hit.item.status));
        const unexpected = hit.type === 'bike' ? !ACTIVE_BIKE(hit.item) : !LOOSE_PART(hit.item);
        if (unexpected) return { ok: false, message: `⚠ ${titleOf(hit)} ist als „${status}“ geführt.` };
        return { ok: true, message: `${already ? 'Bereits gezählt: ' : '✓ '}${titleOf(hit)}` };
      },
    });
  });
  document.querySelectorAll('[data-seen]').forEach((b) => b.addEventListener('click', async () => {
    await mark(b.dataset.seen);
    again();
  }));
  $('#btn-finish').addEventListener('click', async () => {
    if (missing.length && !await confirm('Inventur abschließen?', `${missing.length} Einträge wurden nicht gefunden. Sie bleiben in der Liste „Letzte Inventur“ sichtbar.`, 'Abschließen', 'primary')) return;
    await db.setMeta('inventurLast', {
      startedAt: session.startedAt, finishedAt: new Date().toISOString(), expected: expected.length, seen: found.length,
      missing: missing.map(({ invNr, title }) => ({ invNr, title })),
    });
    await db.setMeta('inventur', null);
    toast('Inventur abgeschlossen.', 'success');
    again();
  });
  $('#btn-cancel').addEventListener('click', async () => {
    if (!await confirm('Inventur abbrechen?', 'Der aktuelle Zählstand wird verworfen.', 'Abbrechen', 'danger')) return;
    await db.setMeta('inventur', null);
    again();
  });
}

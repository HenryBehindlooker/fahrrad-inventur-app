// Verlauf (Zeitleiste) für Räder und Teile.
import { html } from '../ui.js';

const ICONS = {
  created: '＋', updated: '✎', sold: '€', installed: '⤓', removed: '⤒', stripped: '✂', photo: '📷', inventory: '✓',
};

export function timeline(events) {
  if (!events.length) return html`<p class="muted small">Noch keine Einträge. Änderungen werden ab jetzt automatisch protokolliert.</p>`;
  return html`<ol class="timeline">${events.map((e) => html`
    <li><span class="tl-icon" aria-hidden="true">${ICONS[e.type] || '•'}</span>
      <div><span class="tl-text">${e.text}</span>
        <time class="muted small" datetime="${e.at}">${new Date(e.at).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</time></div></li>`)}</ol>`;
}

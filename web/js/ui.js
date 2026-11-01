// Kleine UI-Helfer: sicheres HTML-Templating, Toasts, Dialoge, Foto-Auswahl.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);

/** Tagged Template: Werte werden escaped, Arrays verbunden, raw() bleibt unverändert. */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += render(v) + strings[i + 1];
  });
  return new Raw(out);
}
function render(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  if (v === false || v === null || v === undefined) return '';
  return esc(v);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function setView(content, { title = '', back = null, actions = '' } = {}) {
  document.title = title ? `${title} – Fahrrad-Inventur` : 'Fahrrad-Inventur';
  $('#topbar-title').textContent = title || 'Fahrrad-Inventur';
  const backBtn = $('#topbar-back');
  backBtn.hidden = !back;
  backBtn.dataset.href = back || '';
  $('#topbar-actions').innerHTML = String(actions);
  $('#view').innerHTML = String(content);
  window.scrollTo(0, 0);
}

export function toast(msg, type = 'info', ms = 3200) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

/** Modal-Dialog. buttons: [{ label, value, kind }] -> Promise<value|null> */
export function dialog({ title, body = '', buttons = [{ label: 'OK', value: true, kind: 'primary' }] }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog';
    dlg.innerHTML = String(html`
      <form method="dialog">
        <h2>${title}</h2>
        <div class="dialog-body">${raw(String(body))}</div>
        <div class="dialog-actions">
          <button value="" class="btn">Abbrechen</button>
          ${buttons.map((b, i) => html`<button value="${i}" class="btn ${b.kind ? `btn-${b.kind}` : ''}">${b.label}</button>`)}
        </div>
      </form>`);
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => {
      const i = dlg.returnValue;
      const result = i === '' || i === undefined ? null : { value: buttons[Number(i)].value, form: dlg.querySelector('form') };
      dlg.remove();
      resolve(result);
    });
    dlg.showModal();
  });
}

export async function confirm(title, text, label = 'Löschen', kind = 'danger') {
  const r = await dialog({ title, body: html`<p>${text}</p>`, buttons: [{ label, value: true, kind }] });
  return !!r;
}

/** Blockierende Ladeanzeige */
export function busy(text) {
  const el = document.createElement('div');
  el.className = 'busy';
  el.innerHTML = String(html`<div class="busy-box"><div class="spinner"></div><p>${text}</p></div>`);
  document.body.appendChild(el);
  return { update: (t) => { el.querySelector('p').textContent = t; }, close: () => el.remove() };
}

/** Öffnet Kamera/Galerie und liefert die gewählten Dateien. */
export function pickImages({ camera = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (camera) input.capture = 'environment';
    else input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

/** Formular -> Objekt (nur benannte Felder). */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else out[el.name] = el.value.trim();
  }
  return out;
}

export function options(list, selected, { empty = null } = {}) {
  const items = list.map((o) => (typeof o === 'object' ? o : { id: o, name: o }));
  return html`${empty !== null ? html`<option value="">${empty}</option>` : ''}${items.map(
    (o) => html`<option value="${o.id}" ${String(o.id) === String(selected ?? '') ? raw('selected') : ''}>${o.name}</option>`,
  )}`;
}

export function fmtDate(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function conditionBadge(c) {
  if (!c) return '';
  return html`<span class="badge cond-${c}" title="Zustand">Zustand ${c}</span>`;
}

/** Thumbnail (Data-URL) oder Platzhalter-Icon */
export function thumb(src, alt = '') {
  return src
    ? html`<img class="thumb" src="${src}" alt="${alt}" loading="lazy">`
    : html`<div class="thumb thumb-empty" aria-hidden="true">${raw(ICON_BIKE)}</div>`;
}

export const ICON_BIKE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17" r="3.5"/><circle cx="18.5" cy="17" r="3.5"/><path d="M5.5 17 9 9h6l3.5 8M9 9l3 8h-6.5M15 9l-1.5-3H11M12 17l3-8"/></svg>';

// Einstieg: Router, Navigation, Service Worker.
import { $, toast } from './ui.js';
import { dashboardView } from './views/dashboard.js';
import { bikesView } from './views/bikes.js';
import { bikeDetailView } from './views/bikeDetail.js';
import { bikeFormView } from './views/bikeForm.js';
import { partsView, partGroupView } from './views/parts.js';
import { partFormView } from './views/partForm.js';
import { settingsView } from './views/settings.js';
import { printBikeView, printListView, printLabelsView } from './views/print.js';

const routes = [
  [/^\/$/, dashboardView, 'home'],
  [/^\/raeder$/, bikesView, 'bikes'],
  [/^\/rad\/neu$/, (p, q) => bikeFormView(null, q), 'new'],
  [/^\/rad\/([^/]+)\/bearbeiten$/, ([id], q) => bikeFormView(id, q), 'bikes'],
  [/^\/rad\/([^/]+)$/, ([id]) => bikeDetailView(id), 'bikes'],
  [/^\/teile$/, (p, q) => partsView(q), 'parts'],
  [/^\/teile\/gruppe\/(.+)$/, ([key]) => partGroupView(decodeURIComponent(key)), 'parts'],
  [/^\/teil\/neu$/, (p, q) => partFormView(null, q), 'parts'],
  [/^\/teil\/([^/]+)$/, ([id], q) => partFormView(id, q), 'parts'],
  [/^\/einstellungen$/, settingsView, 'settings'],
  [/^\/druck\/rad\/([^/]+)$/, ([id]) => printBikeView(id), null],
  [/^\/druck\/liste$/, (p, q) => printListView(q), null],
  [/^\/druck\/etiketten$/, (p, q) => printLabelsView(q), null],
];

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (location.hash === target) { route(); return; }
  if (replace) history.replaceState(null, '', target);
  else location.hash = path;
  if (replace) route();
}

let routing = 0;
async function route() {
  const ticket = ++routing;
  const hash = location.hash.slice(1) || '/';
  const [path, qs = ''] = hash.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  for (const [re, view, tab] of routes) {
    const m = path.match(re);
    if (!m) continue;
    document.body.classList.toggle('print-mode', tab === null);
    for (const a of document.querySelectorAll('#tabbar a')) a.classList.toggle('active', a.dataset.tab === tab);
    try {
      await view(m.slice(1), query);
    } catch (e) {
      if (ticket !== routing) return;
      console.error(e);
      $('#view').innerHTML = '<div class="empty"><p>Fehler beim Laden der Ansicht.</p></div>';
      toast(e.message || String(e), 'error', 6000);
    }
    return;
  }
  navigate('/', { replace: true });
}

window.addEventListener('hashchange', route);

$('#topbar-back').addEventListener('click', (e) => {
  const href = e.currentTarget.dataset.href;
  if (href === 'history') history.back();
  else if (href) navigate(href);
});

// Daten dauerhaft speichern (Safari löscht sonst ggf. nach Inaktivität).
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service Worker:', e));
}

route();

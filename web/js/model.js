// Reine Logik ohne Browser-Abhängigkeiten (in Node testbar).

/** Kategorien-Baum für Teile. IDs der Blätter: "<gruppe>/<teil>". */
export const CATEGORY_TREE = [
  { id: 'rahmen', name: 'Rahmen & Gabel', children: [
    ['rahmen', 'Rahmen'], ['gabel', 'Gabel'], ['steuersatz', 'Steuersatz'],
  ] },
  { id: 'antrieb', name: 'Antrieb', children: [
    ['kurbel', 'Kurbelgarnitur'], ['kettenblatt', 'Kettenblatt'], ['innenlager', 'Innenlager'],
    ['kette', 'Kette'], ['ritzel', 'Zahnkranz / Ritzel / Kassette'], ['pedale', 'Pedale'],
  ] },
  { id: 'schaltung', name: 'Schaltung', children: [
    ['schaltwerk', 'Schaltwerk'], ['umwerfer', 'Umwerfer'], ['schalthebel', 'Schalthebel'],
    ['nabenschaltung', 'Nabenschaltung'], ['zuege', 'Schaltzüge'],
  ] },
  { id: 'bremsen', name: 'Bremsen', children: [
    ['felgenbremse', 'Felgenbremse'], ['trommelbremse', 'Trommelbremse'],
    ['ruecktritt', 'Rücktrittbremse'], ['scheibenbremse', 'Scheibenbremse'],
    ['bremshebel', 'Bremshebel'], ['zuege', 'Bremszüge'],
  ] },
  { id: 'laufraeder', name: 'Laufräder', children: [
    ['vorderrad', 'Vorderrad (komplett)'], ['hinterrad', 'Hinterrad (komplett)'],
    ['nabe', 'Nabe'], ['felge', 'Felge'], ['speichen', 'Speichen'],
    ['reifen', 'Reifen'], ['schlauch', 'Schlauch'],
  ] },
  { id: 'cockpit', name: 'Lenkung & Cockpit', children: [
    ['lenker', 'Lenker'], ['vorbau', 'Vorbau'], ['griffe', 'Griffe / Lenkerband'], ['klingel', 'Klingel'],
  ] },
  { id: 'sitz', name: 'Sitzbereich', children: [
    ['sattel', 'Sattel'], ['sattelstuetze', 'Sattelstütze'], ['sattelklemme', 'Sattelklemme'],
  ] },
  { id: 'licht', name: 'Beleuchtung', children: [
    ['dynamo', 'Dynamo'], ['scheinwerfer', 'Scheinwerfer'], ['ruecklicht', 'Rücklicht'], ['kabel', 'Lichtkabel'],
  ] },
  { id: 'anbau', name: 'Anbauteile', children: [
    ['schutzbleche', 'Schutzbleche'], ['gepaecktraeger', 'Gepäckträger'], ['staender', 'Ständer'],
    ['kettenschutz', 'Kettenschutz'], ['schloss', 'Schloss'], ['pumpe', 'Luftpumpe'],
    ['flaschenhalter', 'Flaschenhalter'], ['korb', 'Korb / Tasche'],
  ] },
  { id: 'sonstiges', name: 'Sonstiges', children: [['sonstiges', 'Sonstiges']] },
];

/** Flache Liste aller Blatt-Kategorien. */
export const CATEGORIES = CATEGORY_TREE.flatMap((g) =>
  g.children.map(([id, name]) => ({ id: `${g.id}/${id}`, name, group: g.id, groupName: g.name })),
);
const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function categoryInfo(id) {
  return CATEGORY_BY_ID.get(id) || CATEGORY_BY_ID.get('sonstiges/sonstiges');
}
export function categoryLabel(id) {
  const c = categoryInfo(id);
  return `${c.groupName} › ${c.name}`;
}

export const BIKE_TYPES = [
  'Rennrad', 'Tourenrad / Trekking', 'Stadtrad / Hollandrad', 'Damenrad', 'Herrenrad',
  'Mountainbike', 'Crossrad / Gravel', 'BMX', 'Klapprad', 'Kinderrad / Jugendrad',
  'Lastenrad', 'Tandem', 'Bahnrad', 'Sportrad', 'Liegerad', 'E-Bike', 'Sonstiges',
];

export const BIKE_STATUS = [
  { id: 'lager', name: 'Im Lager' },
  { id: 'arbeit', name: 'In Arbeit' },
  { id: 'bereit', name: 'Verkaufsbereit' },
  { id: 'reserviert', name: 'Reserviert' },
  { id: 'verkauft', name: 'Verkauft' },
  { id: 'ausgeschlachtet', name: 'Ausgeschlachtet' },
];

/** Status eines Teils, wenn es NICHT an einem Rad verbaut ist. */
export const PART_STATUS = [
  { id: 'lager', name: 'Im Lager' },
  { id: 'reserviert', name: 'Reserviert' },
  { id: 'verkauft', name: 'Verkauft' },
  { id: 'defekt', name: 'Defekt' },
  { id: 'entsorgt', name: 'Entsorgt' },
];

export const CONDITIONS = [
  { id: 1, name: 'Sehr gut' },
  { id: 2, name: 'Gut' },
  { id: 3, name: 'Gebraucht' },
  { id: 4, name: 'Stark gebraucht' },
  { id: 5, name: 'Defekt / Teilespender' },
];

export const FRAME_MATERIALS = ['Stahl', 'Chrom-Molybdän (CrMo)', 'Aluminium', 'Carbon', 'Titan', 'Sonstiges'];

export function statusName(list, id) {
  return (list.find((s) => s.id === id) || { name: id || '–' }).name;
}

/** Normalisiert Hersteller/Modell für den Vergleich ("Shimano 600 AX" == "shimano 600ax"). */
export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Schlüssel für "gleiche Teile". Teile mit gleicher Kategorie und gleicher
 * Teilenummer – oder (ohne Teilenummer) gleichem Hersteller + Modell – gelten als gleich.
 * Gibt null zurück, wenn das Teil zu unbestimmt ist (z. B. kein Hersteller und kein Modell).
 */
export function partGroupKey(part) {
  const cat = part.category || 'sonstiges/sonstiges';
  const ref = normalize(part.ref);
  if (ref) return `${cat}#ref:${ref}`;
  const man = normalize(part.manufacturer);
  const mod = normalize(part.model);
  if (!man || !mod) return null;
  return `${cat}#${man}|${mod}`;
}

/** Gruppiert Teile nach partGroupKey. Liefert nur Gruppen mit >= minSize Teilen, größte zuerst. */
export function groupParts(parts, minSize = 2) {
  const map = new Map();
  for (const p of parts) {
    const key = partGroupKey(p);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  const groups = [];
  for (const [key, items] of map) {
    const qty = items.reduce((n, p) => n + (Number(p.quantity) || 1), 0);
    if (items.length < minSize && qty < minSize) continue;
    const first = items[0];
    const bikeIds = new Set(items.filter((p) => p.bikeId).map((p) => p.bikeId));
    groups.push({
      key,
      category: first.category,
      manufacturer: mostCommon(items.map((p) => p.manufacturer)),
      model: mostCommon(items.map((p) => p.model)),
      ref: mostCommon(items.map((p) => p.ref)),
      items,
      count: qty,
      onBikes: bikeIds.size,
      inStock: items.filter((p) => !p.bikeId && p.status === 'lager').reduce((n, p) => n + (Number(p.quantity) || 1), 0),
    });
  }
  return groups.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function mostCommon(values) {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
  let best = '';
  let n = 0;
  for (const [v, c] of counts) if (c > n) { best = v; n = c; }
  return best;
}

/** Inventarnummer, z. B. formatInvNr('R', 7) => "R-0007". */
export function formatInvNr(prefix, n) {
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

/** Zahl aus deutscher oder englischer Eingabe ("1.234,50" / "1234.5"). Leer => null. */
export function parseNumber(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let s = String(input).trim().replace(/[€\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function formatEuro(n) {
  if (n === null || n === undefined || n === '') return '–';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

/** CSV mit Semikolon (Excel-DE kompatibel) und BOM. */
export function toCSV(rows, columns) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [columns.map((c) => esc(c.label)).join(';')];
  for (const r of rows) lines.push(columns.map((c) => esc(c.get(r))).join(';'));
  return '﻿' + lines.join('\r\n');
}

/** Freitextsuche über mehrere Felder. */
export function matchesQuery(obj, query, fields) {
  const q = normalize(query);
  if (!q) return true;
  return fields.some((f) => normalize(obj[f]).includes(q));
}

export function bikeTitle(b) {
  const t = [b.manufacturer, b.model].filter(Boolean).join(' ');
  return t || b.type || 'Unbekanntes Fahrrad';
}

export function partTitle(p) {
  const t = [p.manufacturer, p.model].filter(Boolean).join(' ');
  return t || p.description || categoryInfo(p.category).name;
}

/** Inventarnummer aus Text/QR-Inhalt ziehen ("…#/inv/R-0001", "FIR:T-0012", "r0003"). */
export function extractInvNr(text) {
  const m = String(text || '').toUpperCase().match(/(?:^|[^A-Z0-9])([RT])-?(\d{4,})(?![0-9])/);
  return m ? `${m[1]}-${m[2]}` : null;
}

export function daysBetween(fromIso, toIso = new Date().toISOString()) {
  if (!fromIso) return null;
  return Math.max(0, Math.floor((new Date(toIso) - new Date(fromIso)) / 86_400_000));
}

const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : 0);

/** Werkstatt-Kalkulation eines Rads: Einkauf + Teile + Arbeitszeit vs. Erlös. */
export function bikeCalc(bike, laborRate = 0) {
  const tasks = bike.tasks || [];
  const hours = tasks.reduce((n, t) => n + num(t.hours), 0);
  const partsCost = tasks.reduce((n, t) => n + num(t.partsCost), 0);
  const labor = hours * num(laborRate);
  const cost = num(bike.purchasePrice) + partsCost + labor;
  const realized = bike.status === 'verkauft' && bike.salePrice != null;
  const revenue = realized ? num(bike.salePrice) : (bike.salePrice ?? bike.estimatedValue ?? null);
  return {
    hours, partsCost, labor, cost, revenue: revenue === null ? null : num(revenue), realized,
    margin: revenue === null ? null : num(revenue) - cost,
    openTasks: tasks.filter((t) => !t.done).length,
  };
}

/** Lagerteile, die zu einer Kategorie bzw. Kategorie-Gruppe passen (für "Aus Lager einbauen"). */
export function stockCandidates(parts, category) {
  const group = categoryInfo(category).group;
  return parts
    .filter((p) => !p.bikeId && p.status === 'lager')
    .map((p) => ({ p, score: p.category === category ? 2 : categoryInfo(p.category).group === group ? 1 : 0 }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (a.p.condition || 9) - (b.p.condition || 9))
    .map((x) => x.p);
}

/** Statistik für das Dashboard. */
export function computeStats(bikes, parts, laborRate = 0) {
  const count = (arr, fn) => {
    const m = new Map();
    for (const x of arr) { const k = fn(x) || '–'; m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const activeBikes = bikes.filter((b) => b.status !== 'verkauft' && b.status !== 'ausgeschlachtet');
  const looseParts = parts.filter((p) => !p.bikeId);
  const stockParts = looseParts.filter((p) => p.status === 'lager');
  const sum = (arr, f) => arr.reduce((n, x) => n + (Number(x[f]) || 0), 0);
  const sold = bikes.filter((b) => b.status === 'verkauft');
  const sellDays = sold.map((b) => daysBetween(b.purchaseDate || b.createdAt, b.soldDate || b.updatedAt)).filter((d) => d !== null);
  return {
    bikeCount: bikes.length,
    activeBikeCount: activeBikes.length,
    partCount: parts.length,
    installedPartCount: parts.length - looseParts.length,
    stockPartCount: stockParts.reduce((n, p) => n + (Number(p.quantity) || 1), 0),
    stockValue: sum(activeBikes, 'estimatedValue') + stockParts.reduce((n, p) => n + (Number(p.value) || 0) * (Number(p.quantity) || 1), 0),
    purchaseTotal: sum(bikes, 'purchasePrice'),
    salesTotal: sum(sold, 'salePrice'),
    realizedMargin: sold.reduce((n, b) => n + (bikeCalc(b, laborRate).margin || 0), 0),
    avgDaysToSell: sellDays.length ? Math.round(sellDays.reduce((a, b) => a + b, 0) / sellDays.length) : null,
    slowMovers: activeBikes.filter((b) => daysBetween(b.purchaseDate || b.createdAt) > 90).length,
    openTasks: bikes.reduce((n, b) => n + bikeCalc(b).openTasks, 0),
    toReview: bikes.filter((b) => b.review).length,
    byStatus: count(bikes, (b) => statusName(BIKE_STATUS, b.status)),
    byType: count(bikes, (b) => b.type),
    byManufacturer: count(bikes, (b) => b.manufacturer),
    byPartGroup: count(parts, (p) => categoryInfo(p.category).groupName),
    byLocation: count([...activeBikes, ...stockParts], (x) => x.location),
    topGroups: groupParts(parts).slice(0, 8),
  };
}

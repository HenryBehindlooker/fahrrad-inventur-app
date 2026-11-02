// Fahrrad- und Teileerkennung mit Claude Vision (offizielles Anthropic-SDK, lokal gebündelt).
import Anthropic from '../vendor/anthropic.mjs';
import { CATEGORIES, BIKE_TYPES, FRAME_MATERIALS } from './model.js';
import { blobToBase64 } from './images.js';

export const MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5 – beste Erkennung (Standard)' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5 – schneller, günstiger' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5 – am günstigsten' },
];

const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
const CATEGORY_LIST = CATEGORIES.map((c) => `${c.id} = ${c.groupName} › ${c.name}`).join('\n');

const SYSTEM = `Du bist Experte für Fahrräder aller Epochen (1900 bis heute), besonders für alte und Vintage-Räder europäischer, amerikanischer und japanischer Hersteller (z. B. Peugeot, Gazelle, Batavus, Bianchi, Colnago, Motobécane, Raleigh, Schwinn, Kalkhoff, Hercules, Vaterland, Diamant, Mifa, Rixe, Kettler, Koga, Puch, Steyr, Miyata, Panasonic, Centurion u. v. m.) sowie Komponentenhersteller (Shimano, Campagnolo, SunTour, Simplex, Huret, Mavic, Weinmann, Mafac, Fichtel & Sachs, Torpedo, Union, Brooks, Stronglight, TA u. v. m.).

Aufgabe: Analysiere die Fotos EINES Fahrrads für eine Inventur. Erkenne Hersteller (Steuerkopfschild, Rahmendekor, Schriftzüge), Modell, Typ, ungefähres Baujahr (anhand Komponenten, Dekor, Bauweise), Rahmendaten und die sichtbaren Einzelteile.

Regeln:
- Erfinde nichts. Was nicht erkennbar ist: leerer String "" bzw. 0 bei Zahlen.
- Rahmennummer nur angeben, wenn sie auf einem Foto lesbar ist.
- Teile: Liste jedes sichtbare, relevante Bauteil EINZELN auf (z. B. Schaltwerk, Umwerfer, Bremsen vorne/hinten getrennt nur wenn unterschiedlich, sonst ein Eintrag mit Beschreibung "vorne + hinten").
- Hersteller und Modell der Teile möglichst exakt (z. B. "Shimano" / "600 Arabesque", "Weinmann" / "Vainqueur 999"). Wenn eine Teilenummer erkennbar oder sicher bekannt ist (z. B. "RD-6207"), trage sie bei ref ein.
- Zustand 1–5: 1 sehr gut, 2 gut, 3 gebraucht, 4 stark gebraucht, 5 defekt/Teilespender; 0 wenn nicht beurteilbar.
- Werte in Euro als realistische Gebrauchtmarkt-Schätzung (Deutschland), 0 wenn keine Einschätzung möglich.
- Antworte auf Deutsch.

Erlaubte Teile-Kategorien (Feld category):
${CATEGORY_LIST}`;

const str = { type: 'string' };
const PART_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['category', 'manufacturer', 'model', 'ref', 'description', 'condition', 'estimated_value_eur', 'confidence'],
  properties: {
    category: { type: 'string', enum: CATEGORY_IDS },
    manufacturer: str,
    model: str,
    ref: { type: 'string', description: 'Teilenummer, falls bekannt, sonst ""' },
    description: { type: 'string', description: 'Kurzbeschreibung, z. B. Farbe, Ausführung, Besonderheiten' },
    condition: { type: 'integer', enum: [0, 1, 2, 3, 4, 5] },
    estimated_value_eur: { type: 'number' },
    confidence: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
  },
};

const BIKE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['is_bicycle', 'bike', 'parts'],
  properties: {
    is_bicycle: { type: 'boolean', description: 'false, wenn auf den Fotos kein Fahrrad zu sehen ist' },
    bike: {
      type: 'object',
      additionalProperties: false,
      required: ['manufacturer', 'model', 'type', 'year', 'frame_size', 'wheel_size', 'color', 'frame_material',
        'frame_number', 'condition', 'estimated_value_eur', 'confidence', 'notes'],
      properties: {
        manufacturer: str,
        model: str,
        type: { type: 'string', enum: BIKE_TYPES },
        year: { type: 'string', description: 'Baujahr oder Zeitraum, z. B. "ca. 1978" oder "1980er"' },
        frame_size: { type: 'string', description: 'Rahmenhöhe, z. B. "56 cm", geschätzt wenn möglich' },
        wheel_size: { type: 'string', description: 'z. B. "28 Zoll (700c)", "26 Zoll"' },
        color: str,
        frame_material: { type: 'string', enum: [...FRAME_MATERIALS, ''] },
        frame_number: str,
        condition: { type: 'integer', enum: [0, 1, 2, 3, 4, 5] },
        estimated_value_eur: { type: 'number' },
        confidence: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
        notes: { type: 'string', description: 'Begründung der Erkennung, Besonderheiten, Mängel, Hinweise' },
      },
    },
    parts: { type: 'array', items: PART_SCHEMA },
  },
};

const SINGLE_PART_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['part', 'notes'],
  properties: { part: PART_SCHEMA, notes: str },
};

export class AiError extends Error {}

function makeClient(settings) {
  if (!settings.apiKey && !settings.proxyUrl) {
    throw new AiError('Kein API-Key und keine Proxy-URL eingerichtet. Bitte unter Einstellungen eintragen.');
  }
  const opts = {
    // Beim Proxy-Betrieb setzt der Proxy den echten Key; der Platzhalter wird dort ersetzt.
    apiKey: settings.apiKey || 'via-proxy',
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
    timeout: 180_000,
  };
  if (settings.proxyUrl) opts.baseURL = settings.proxyUrl.replace(/\/+$/, '');
  return new Anthropic(opts);
}

async function call(settings, { images, text, schema }) {
  const client = makeClient(settings);
  const content = [];
  for (const blob of images) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await blobToBase64(blob) } });
  }
  content.push({ type: 'text', text });

  let response;
  try {
    response = await client.beta.messages.create({
      model: settings.model || 'claude-opus-5-5',
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
      output_config: { effort: settings.effort || 'medium', format: { type: 'json_schema', schema } },
      // Falls ein Sicherheitsfilter ablehnt, versucht die API automatisch ein passendes Ersatzmodell.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  } catch (e) {
    throw translateError(e);
  }

  if (response.stop_reason === 'refusal') {
    throw new AiError('Die KI hat die Anfrage abgelehnt. Bitte andere Fotos verwenden oder manuell erfassen.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AiError('Die Antwort war zu lang und wurde abgeschnitten. Bitte weniger Fotos verwenden.');
  }
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new AiError('Leere Antwort der KI.');
  try {
    return { data: JSON.parse(textBlock.text), model: response.model, usage: response.usage };
  } catch {
    throw new AiError('Die Antwort der KI konnte nicht gelesen werden.');
  }
}

function translateError(e) {
  if (e instanceof Anthropic.AuthenticationError) return new AiError('API-Key ungültig (401). Bitte in den Einstellungen prüfen.');
  if (e instanceof Anthropic.PermissionDeniedError) return new AiError('Zugriff verweigert (403). Ist der Key für dieses Modell freigeschaltet?');
  if (e instanceof Anthropic.NotFoundError) return new AiError('Modell oder Endpunkt nicht gefunden (404). Modell/Proxy-URL prüfen.');
  if (e instanceof Anthropic.RateLimitError) return new AiError('Zu viele Anfragen (429). Bitte kurz warten und erneut versuchen.');
  if (e instanceof Anthropic.BadRequestError) return new AiError(`Ungültige Anfrage (400): ${e.message}`);
  if (e instanceof Anthropic.APIConnectionError) return new AiError('Keine Verbindung zur KI. Internetverbindung (bzw. Proxy) prüfen.');
  if (e instanceof Anthropic.APIError) return new AiError(`KI-Fehler (${e.status ?? '?'}): ${e.message}`);
  return e instanceof Error ? e : new AiError(String(e));
}

/** Erkennt ein komplettes Rad. images: Blob[] (JPEG). */
export async function recognizeBike(settings, images) {
  const n = Math.min(images.length, settings.maxPhotos || 6);
  const { data, model, usage } = await call(settings, {
    images: images.slice(0, n),
    text: `Hier sind ${n} Foto(s) desselben Fahrrads (Gesamtansicht und ggf. Details). Erstelle den Inventureintrag.`,
    schema: BIKE_SCHEMA,
  });
  return { ...data, model, usage };
}

/** Erkennt ein einzelnes Teil auf Detailfotos. */
export async function recognizePart(settings, images, hint = '') {
  const n = Math.min(images.length, settings.maxPhotos || 6);
  const { data, model, usage } = await call(settings, {
    images: images.slice(0, n),
    text: `Diese Foto(s) zeigen EIN einzelnes Fahrradteil (kein ganzes Rad). Bestimme Kategorie, Hersteller, Modell, ggf. Teilenummer, Zustand und Wert.${hint ? ` Hinweis des Nutzers: ${hint}` : ''}`,
    schema: SINGLE_PART_SCHEMA,
  });
  return { ...data, model, usage };
}

/** KI-Ergebnis -> Felder des Rad-Datensatzes. */
export function bikeFromAi(r) {
  const b = r.bike || {};
  return {
    manufacturer: b.manufacturer || '',
    model: b.model || '',
    type: b.type || '',
    year: b.year || '',
    frameSize: b.frame_size || '',
    wheelSize: b.wheel_size || '',
    color: b.color || '',
    frameMaterial: b.frame_material || '',
    frameNumber: b.frame_number || '',
    condition: b.condition || null,
    estimatedValue: b.estimated_value_eur || null,
    notes: b.notes || '',
    ai: { model: r.model, at: new Date().toISOString(), confidence: b.confidence || '' },
  };
}

export function partFromAi(p) {
  return {
    category: CATEGORY_IDS.includes(p.category) ? p.category : 'sonstiges/sonstiges',
    manufacturer: p.manufacturer || '',
    model: p.model || '',
    ref: p.ref || '',
    description: p.description || '',
    condition: p.condition || null,
    value: p.estimated_value_eur || null,
    quantity: 1,
    confidence: p.confidence || '',
  };
}

/** Kurzer Verbindungstest (kostet nur wenige Token). */
export async function testConnection(settings) {
  const client = makeClient(settings);
  try {
    const r = await client.messages.create({
      model: settings.model || 'claude-opus-5-5',
      max_tokens: 64,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Antworte nur mit: OK' }],
    });
    return r.model;
  } catch (e) {
    throw translateError(e);
  }
}

const SALE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['price_private_low', 'price_private_high', 'price_dealer', 'price_parts_out', 'recommendation', 'reasoning',
    'title', 'text', 'highlights', 'defects', 'keywords'],
  properties: {
    price_private_low: { type: 'number', description: 'Untere Grenze realistischer Privatverkaufspreis in EUR' },
    price_private_high: { type: 'number', description: 'Obere Grenze realistischer Privatverkaufspreis in EUR' },
    price_dealer: { type: 'number', description: 'Realistischer Händler-Ankaufspreis in EUR' },
    price_parts_out: { type: 'number', description: 'Geschätzter Erlös bei Einzelverkauf der Teile (Ausschlachten) in EUR' },
    recommendation: { type: 'string', enum: ['komplett verkaufen', 'erst aufbereiten', 'ausschlachten', 'sammlerstück – Spezialmarkt'] },
    reasoning: { type: 'string', description: 'Kurze Begründung der Preise und Empfehlung (2–4 Sätze)' },
    title: { type: 'string', description: 'Anzeigentitel, max. 65 Zeichen' },
    text: { type: 'string', description: 'Anzeigentext für Kleinanzeigen/eBay, ehrlich, mit Absätzen, ohne Preisangabe' },
    highlights: { type: 'array', items: { type: 'string' } },
    defects: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' }, description: 'Suchbegriffe für die Anzeige' },
  },
};

/** Verkaufsbewertung + Anzeigentext auf Basis der Inventurdaten (und optional Fotos). */
export async function sellAssistant(settings, bike, parts, images = []) {
  const facts = {
    hersteller: bike.manufacturer, modell: bike.model, typ: bike.type, baujahr: bike.year, rahmengroesse: bike.frameSize,
    laufrad: bike.wheelSize, farbe: bike.color, material: bike.frameMaterial, zustand_1_bis_5: bike.condition, notizen: bike.notes,
    erledigte_arbeiten: (bike.tasks || []).filter((t) => t.done).map((t) => t.text),
    offene_maengel: (bike.tasks || []).filter((t) => !t.done).map((t) => t.text),
    teile: parts.map((p) => ({ kategorie: p.category, hersteller: p.manufacturer, modell: p.model, beschreibung: p.description, zustand: p.condition })),
  };
  const { data, model } = await call(settings, {
    images: images.slice(0, Math.min(3, settings.maxPhotos || 6)),
    text: `Erstelle eine Verkaufsbewertung für den deutschen Gebrauchtmarkt (Kleinanzeigen, eBay, Händler) und einen verkaufsfertigen Anzeigentext für dieses Fahrrad. Sei realistisch und ehrlich, nenne Mängel. Inventurdaten:\n${JSON.stringify(facts, null, 1)}`,
    schema: SALE_SCHEMA,
  });
  return { ...data, model, at: new Date().toISOString() };
}

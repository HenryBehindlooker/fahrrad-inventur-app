// Cloudflare Worker: leitet /v1/messages an die Claude-API weiter und ergänzt den API-Key serverseitig.
// So muss der Key nicht auf jedem Gerät hinterlegt werden.
//
// Secrets/Variablen (wrangler secret put …):
//   ANTHROPIC_API_KEY  (Pflicht)  – dein Claude-API-Key
//   APP_TOKEN          (empfohlen) – Zugangscode; in der App unter Einstellungen ins Feld „API-Key“ eintragen
//   ALLOWED_ORIGINS    (optional) – kommagetrennt, z. B. "https://deinname.github.io,app://localhost" (Standard: *)
//   ALLOWED_MODELS     (optional) – kommagetrennt, z. B. "claude-opus-5-5,claude-sonnet-5-5"

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
    const allowOrigin = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : '';
    const cors = {
      'Access-Control-Allow-Origin': allowOrigin || 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || '*',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const reply = (status, message) => new Response(JSON.stringify({ type: 'error', error: { type: 'proxy_error', message } }), {
      status, headers: { ...cors, 'Content-Type': 'application/json' },
    });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowOrigin) return reply(403, 'Origin nicht erlaubt');
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname.replace(/\/+$/, '') !== '/v1/messages') return reply(404, 'Nur POST /v1/messages');
    if (!env.ANTHROPIC_API_KEY) return reply(500, 'ANTHROPIC_API_KEY fehlt im Worker');

    // Die App schickt den Inhalt des Feldes „API-Key“ als Bearer-Token bzw. x-api-key.
    if (env.APP_TOKEN) {
      const sent = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '') || request.headers.get('x-api-key') || '';
      if (sent !== env.APP_TOKEN) return reply(401, 'Zugangscode ungültig');
    }

    const body = await request.text();
    if (env.ALLOWED_MODELS) {
      let model = '';
      try { model = JSON.parse(body).model; } catch { return reply(400, 'Ungültiges JSON'); }
      if (!env.ALLOWED_MODELS.split(',').map((s) => s.trim()).includes(model)) return reply(403, `Modell ${model} nicht freigegeben`);
    }

    const headers = new Headers({ 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY });
    for (const h of ['anthropic-version', 'anthropic-beta']) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (!headers.has('anthropic-version')) headers.set('anthropic-version', '2023-06-01');

    const upstream = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body });
    const response = new Response(upstream.body, upstream);
    for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
    return response;
  },
};

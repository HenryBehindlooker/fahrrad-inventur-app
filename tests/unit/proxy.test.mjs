import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../proxy/worker.js';

const env = { ANTHROPIC_API_KEY: 'sk-ant-real', APP_TOKEN: 'geheim', ALLOWED_MODELS: 'claude-opus-5-5' };
const req = (opts = {}) => new Request('https://proxy.example/v1/messages', {
  method: 'POST',
  headers: { Origin: 'app://localhost', Authorization: 'Bearer geheim', 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', ...opts.headers },
  body: JSON.stringify({ model: opts.model || 'claude-opus-5-5', messages: [] }),
});

test('Proxy ersetzt den Key und leitet Header weiter', async () => {
  let upstream;
  globalThis.fetch = async (url, init) => { upstream = { url, init }; return new Response('{"ok":true}', { status: 200 }); };
  const res = await worker.fetch(req(), env);
  assert.equal(res.status, 200);
  assert.equal(upstream.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(upstream.init.headers.get('x-api-key'), 'sk-ant-real');
  assert.equal(upstream.init.headers.get('authorization'), null);
  assert.equal(upstream.init.headers.get('anthropic-beta'), 'server-side-fallback-2026-07-01');
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test('Proxy lehnt falschen Zugangscode, fremde Modelle und andere Pfade ab', async () => {
  globalThis.fetch = async () => { throw new Error('darf nicht aufgerufen werden'); };
  assert.equal((await worker.fetch(req({ headers: { Authorization: 'Bearer falsch' } }), env)).status, 401);
  assert.equal((await worker.fetch(req({ model: 'claude-fable-5-1' }), env)).status, 403);
  assert.equal((await worker.fetch(new Request('https://proxy.example/v1/models', { headers: { Origin: 'x' } }), env)).status, 404);
  const pre = await worker.fetch(new Request('https://proxy.example/v1/messages', { method: 'OPTIONS', headers: { Origin: 'x' } }), env);
  assert.equal(pre.status, 204);
});

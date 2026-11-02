// Bündelt die Laufzeit-Abhängigkeiten als lokale ES-Module nach web/vendor/,
// damit die App ohne CDN (offline, im WKWebView-Bundle) funktioniert.
import { build } from 'esbuild';
import { copyFileSync } from 'node:fs';

await build({
  entryPoints: ['node_modules/@anthropic-ai/sdk/index.mjs'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['safari15'],
  minify: true,
  legalComments: 'eof',
  outfile: 'web/vendor/anthropic.mjs',
});

await build({
  entryPoints: ['node_modules/jsqr/dist/jsQR.js'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['safari15'],
  minify: true,
  outfile: 'web/vendor/jsqr.mjs',
});

copyFileSync('node_modules/qrcode-generator/dist/qrcode.mjs', 'web/vendor/qrcode.mjs');
console.log('vendor: web/vendor/anthropic.mjs, web/vendor/jsqr.mjs, web/vendor/qrcode.mjs');

// Erzeugt PNG-Icons aus web/icons/icon.svg (benötigt Playwright/Chromium).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFileSync } from 'node:fs';

const svg = readFileSync('web/icons/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [size, name, rounded] of [[192, 'icon-192.png', true], [512, 'icon-512.png', true], [180, 'apple-touch-icon.png', false], [1024, 'icon-1024.png', false]]) {
  // Apple-Icons ohne eigene Rundung (iOS maskiert selbst)
  const src = rounded ? svg : svg.replace('rx="112"', 'rx="0"');
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${src}`);
  await page.screenshot({ path: `web/icons/${name}`, omitBackground: true });
}
await browser.close();
console.log('Icons erzeugt.');

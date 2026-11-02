// QR-Scanner: Live-Kamera (getUserMedia) mit jsQR; Rückfall: Foto aufnehmen und dekodieren; Handeingabe.
import jsQR from '../vendor/jsqr.mjs';
import { html, pickImages } from './ui.js';

function decodeCanvas(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const code = jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
  return code ? code.data : null;
}

/** QR-Code aus einer Bilddatei lesen (mehrere Größen probieren). */
export async function decodeFile(file) {
  const bmp = await createImageBitmap(file);
  try {
    for (const edge of [1200, 800, 1600, 500]) {
      const scale = Math.min(1, edge / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * scale);
      const h = Math.round(bmp.height * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0, w, h);
      const r = decodeCanvas(ctx, w, h);
      if (r) return r;
    }
    return null;
  } finally {
    bmp.close?.();
  }
}

export const canLiveScan = () => !!navigator.mediaDevices?.getUserMedia && window.isSecureContext !== false;

/**
 * Öffnet den Scanner als Vollbild-Overlay.
 * onResult(text) wird für jeden erkannten Code aufgerufen und liefert { close?: boolean, message?: string, ok?: boolean }.
 * Gibt eine Funktion zum Schließen zurück.
 */
export function openScanner({ title = 'QR-Code scannen', hint = '', onResult, onClose }) {
  const ov = document.createElement('div');
  ov.className = 'scanner';
  ov.innerHTML = String(html`
    <div class="scanner-top"><strong>${title}</strong><button type="button" class="scanner-close" aria-label="Scanner schließen">×</button></div>
    <div class="scanner-stage"><video playsinline muted></video><div class="scanner-frame" aria-hidden="true"></div>
      <p class="scanner-msg" role="status">${hint || 'Etikett in den Rahmen halten'}</p></div>
    <form class="scanner-bottom">
      <button type="button" class="btn" data-photo>📷 Foto vom Etikett</button>
      <input name="manual" placeholder="oder Nr. eingeben, z. B. R-0012" autocapitalize="characters" aria-label="Inventarnummer">
      <button class="btn btn-primary" type="submit">OK</button>
    </form>`);
  document.body.appendChild(ov);
  const video = ov.querySelector('video');
  const msg = ov.querySelector('.scanner-msg');
  let stream = null;
  let closed = false;
  let last = { text: '', at: 0 };
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const show = (text, ok = true) => {
    msg.textContent = text;
    msg.className = `scanner-msg ${ok ? 'ok' : 'bad'}`;
  };

  const handle = async (text) => {
    const now = Date.now();
    if (!text || (text === last.text && now - last.at < 2500)) return;
    last = { text, at: now };
    const r = (await onResult(text)) || {};
    if (r.message) show(r.message, r.ok !== false);
    if (navigator.vibrate) navigator.vibrate(r.ok === false ? [60, 40, 60] : 30);
    if (r.close) close();
  };

  const tick = () => {
    if (closed || !stream) return;
    if (video.readyState >= 2 && video.videoWidth) {
      const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const text = decodeCanvas(ctx, canvas.width, canvas.height);
      if (text) handle(text);
    }
    setTimeout(() => requestAnimationFrame(tick), 120);
  };

  async function start() {
    if (!canLiveScan()) { show('Live-Kamera nicht verfügbar – bitte „Foto vom Etikett“ nutzen.', false); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (closed) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      await video.play();
      tick();
    } catch (e) {
      show(`Kamera nicht verfügbar (${e.name || e.message}). Bitte „Foto vom Etikett“ nutzen.`, false);
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    stream?.getTracks().forEach((t) => t.stop());
    ov.remove();
    onClose?.();
  }

  ov.querySelector('.scanner-close').addEventListener('click', close);
  ov.querySelector('[data-photo]').addEventListener('click', async () => {
    const [file] = await pickImages({ camera: true });
    if (!file) return;
    show('Foto wird gelesen …');
    const text = await decodeFile(file).catch(() => null);
    if (text) { last = { text: '', at: 0 }; handle(text); } else show('Kein QR-Code im Foto gefunden.', false);
  });
  ov.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = ov.querySelector('[name=manual]');
    const v = input.value.trim();
    if (!v) return;
    last = { text: '', at: 0 };
    handle(v);
    input.value = '';
  });

  start();
  return close;
}

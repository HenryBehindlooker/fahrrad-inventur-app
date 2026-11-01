// Brücke zur Swift-Hülle (WKWebView). Im normalen Browser wird auf Web-APIs zurückgegriffen.
import { blobToBase64 } from './images.js';

const handler = () => window.webkit?.messageHandlers?.native;
export const isNativeApp = () => !!handler();

/** Datei speichern/teilen: in der App über das iOS-Teilen-Menü, im Browser als Download. */
export async function saveFile(blob, filename) {
  const h = handler();
  if (h) {
    h.postMessage({ action: 'share', filename, mimeType: blob.type || 'application/octet-stream', base64: await blobToBase64(blob) });
    return;
  }
  // iOS-Safari (PWA): Teilen-Menü bevorzugen, da Downloads dort umständlich sind.
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Drucken: WKWebView unterstützt window.print() nicht, daher nativer Druckdialog. */
export function printPage() {
  const h = handler();
  if (h) h.postMessage({ action: 'print' });
  else window.print();
}

export function haptic() {
  const h = handler();
  if (h) h.postMessage({ action: 'haptic' });
  else if (navigator.vibrate) navigator.vibrate(15);
}
